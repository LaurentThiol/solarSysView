"""Brouillon de spécialiste, une série à la fois, et règle chartiste non enregistrée."""

from __future__ import annotations

from typing import Any

from synchro.brain_specialists.features import FEATURE_IDS
from synchro.decision_tree.questions import SERIES_FR, label_phrase

_MEASURE_TO_INDICATOR = {"last": "lag1", "slope": "slope", "z20": "zscore"}


def _split_feature(name: str, series: str | None) -> tuple[str | None, str | None, str | None]:
    """Retourne (série, indicateur ou None, texte de contexte)."""
    if name in FEATURE_IDS:
        return series, name, None
    if name.startswith("ball.") or name.startswith("curve_") or name.startswith("figure_"):
        return None, None, None
    if "." not in name:
        return None, None, None
    left, measure = name.split(".", 1)
    indicator = _MEASURE_TO_INDICATOR.get(measure)
    if indicator is None:
        return left, None, name
    return left, indicator, None


def draft_specialists(report: dict[str, Any]) -> list[dict[str, Any]]:
    question = str(report.get("question") or "")
    if question not in {"shape", "series"}:
        return []
    series_default = report.get("series")
    rules = report.get("rules") or []
    kept = [rule for rule in rules if rule.get("positive") and not rule.get("weak")]
    if not kept:
        kept = [rule for rule in rules if rule.get("positive")]
    by_series: dict[str, dict[str, Any]] = {}
    for rule in kept:
        for split in rule.get("path") or []:
            feature = str(split.get("feature") or "")
            series, indicator, context = _split_feature(feature, series_default)
            if not series:
                continue
            bucket = by_series.setdefault(
                series, {"indicators": [], "context": [], "lines": []}
            )
            if indicator and indicator not in bucket["indicators"]:
                bucket["indicators"].append(indicator)
            if context and split.get("text") not in bucket["context"]:
                bucket["context"].append(str(split.get("text")))
        line = " ET ".join(str(split.get("text")) for split in rule.get("path") or [])
        if line:
            by_series.setdefault(series, {"indicators": [], "context": [], "lines": []})
            by_series[series]["lines"].append(
                f"SI {line} ALORS {rule.get('class_name')}"
            )
    phrase = label_phrase(
        question,
        str(report.get("label") or ""),
        threshold=report.get("threshold"),
    )
    drafts = []
    for series, bucket in by_series.items():
        if not bucket["indicators"]:
            continue
        title = SERIES_FR.get(series, series)
        lines = bucket["lines"][:6]
        extra = ""
        if bucket["context"]:
            extra = " Contexte hors indicateurs : " + " ; ".join(bucket["context"][:6]) + "."
        note = ""
        if report.get("label") == "n1_low" and series == "n1":
            note = (
                " Le spécialiste binaire apprend la forme haute (≥ médiane) ; "
                "l'arbre a coupé n1 bas."
            )
        instructions = (
            f"Arbre decisionTree sur le flux ({phrase}). "
            + (" ".join(lines) if lines else "Aucune feuille positive tenue au contrôle.")
            + extra
            + note
        )
        drafts.append(
            {
                "name": f"{title[:1].upper()}{title[1:]} · flux",
                "target": series,
                "task": "binary",
                "horizon": "value",
                "indicators": bucket["indicators"],
                "instructions": instructions.strip(),
                "origin": report.get("slug"),
                "label_phrase": phrase,
            }
        )
    return drafts


def chartisme_rules(report: dict[str, Any]) -> list[dict[str, Any]]:
    if report.get("question") != "chartisme":
        return []
    from synchro.chartisme.rules import normalize_rule

    out = []
    for rule in report.get("rules") or []:
        if not rule.get("positive") or rule.get("weak"):
            continue
        condition: dict[str, Any] = {}
        figures: list[str] = []
        variables: list[str] = []
        for split in rule.get("path") or []:
            feature = str(split.get("feature") or "")
            sense = split.get("sense")
            threshold = split.get("threshold")
            if feature == "confidence" and sense == "gt" and threshold is not None:
                condition["min_confidence"] = threshold
            elif feature == "activity_ratio" and sense == "gt" and threshold is not None:
                condition["min_activity_ratio"] = threshold
            elif feature.startswith("figure_") and sense == "gt":
                figures.append(feature[len("figure_") :])
            elif feature.startswith("curve_") and sense == "gt":
                variables.append(feature[len("curve_") :])
            elif feature == "direction_up" and sense == "gt":
                condition["direction"] = "up"
            elif feature == "weekday_mardi" and sense == "gt":
                condition["weekday"] = "mardi"
        if figures:
            condition["figures"] = figures
        if variables:
            condition["variables"] = variables
        name = "Figure · " + " · ".join(str(split.get("text")) for split in (rule.get("path") or [])[:3])
        out.append(
            normalize_rule(
                {
                    "name": name[:120] or "Figure",
                    "condition": condition,
                    "actions": [{"type": "note", "payload": {"source": "decisionTree"}}],
                    "active": False,
                }
            )
        )
    return out
