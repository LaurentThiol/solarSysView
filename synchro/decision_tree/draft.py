"""Brouillon de spécialiste, une série à la fois, et règle chartiste non enregistrée."""

from __future__ import annotations

from typing import Any

from synchro.brain_specialists.features import FEATURE_IDS
from synchro.decision_tree.measures import parse_feature_name
from synchro.decision_tree.questions import SERIES_FR, label_phrase


def _split_feature(name: str, series: str | None) -> tuple[str | None, str | None, str | None]:
    """Retourne (série, indicateur ou None, texte de contexte)."""
    if name in FEATURE_IDS and "@" not in name and "." not in name:
        return series, name, None
    if name.startswith("ball.") or name.startswith("curve_") or name.startswith("figure_"):
        return None, None, None
    info = parse_feature_name(name)
    left = info.get("series") or series
    indicator = info.get("indicator")
    if indicator:
        return left, str(indicator), None
    if left and (info.get("measure_id") == "step" or "." in name or "@" in name):
        return left, None, name
    return None, None, None


def _cut_note(report: dict[str, Any]) -> str:
    if report.get("label_cut") != "learned":
        return ""
    learned = report.get("threshold")
    specialist = report.get("specialist_threshold")
    if learned is None or specialist is None:
        return ""
    if abs(float(learned) - float(specialist)) <= 1e-6:
        return ""
    return (
        f" Le spécialiste binaire apprend la coupe {float(specialist):.2f} ; "
        f"l'arbre a coupé à {float(learned):.2f}."
    )


def _window_note(report: dict[str, Any]) -> str:
    used: set[str] = set()
    for rule in report.get("rules") or []:
        for split in rule.get("path") or []:
            used.add(str(split.get("feature") or ""))
    notes: list[str] = []
    for item in report.get("windows") or []:
        if not item.get("changed") or item.get("kept") not in used:
            continue
        notes.append(
            f"l'arbre lit {item.get('label')} sur {item.get('period')}, "
            f"le spécialiste sur {item.get('default')}"
        )
    if not notes:
        return ""
    return " Fenêtres : " + " ; ".join(notes) + "."


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
            + _cut_note(report)
            + _window_note(report)
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
