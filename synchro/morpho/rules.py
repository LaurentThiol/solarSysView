"""Système de productions : QUAND forme ∧ contexte ALORS action."""

from __future__ import annotations

from typing import Any
from uuid import uuid4

from synchro.morpho.lexicon import MOTIF_IDS, label_of

ACTION_TYPES = (
    "tag",
    "alert",
    "filter",
    "montecarlo",
    "navigate",
    "hypothesize",
    "draft_rule",
)


def normalize_condition(raw: dict[str, Any] | None) -> dict[str, Any]:
    src = raw or {}
    motifs = [m for m in (src.get("motifs") or []) if m in MOTIF_IDS]
    any_motifs = [m for m in (src.get("any_motifs") or []) if m in MOTIF_IDS]
    labels = {
        str(k): str(v)
        for k, v in (src.get("query_labels") or {}).items()
        if str(v).strip()
    }
    weekday = (src.get("weekday") or "").strip().lower() or None
    caption = (src.get("caption_contains") or "").strip() or None
    min_g = src.get("min_grounding")
    min_grounding = float(min_g) if min_g is not None and min_g != "" else None
    return {
        "motifs": motifs,
        "any_motifs": any_motifs,
        "query_labels": labels,
        "weekday": weekday,
        "caption_contains": caption,
        "min_grounding": min_grounding,
    }


def normalize_actions(raw: Any) -> list[dict[str, Any]]:
    items = raw if isinstance(raw, list) else []
    out: list[dict[str, Any]] = []
    for item in items:
        if not isinstance(item, dict):
            continue
        kind = str(item.get("type") or "")
        if kind not in ACTION_TYPES:
            continue
        payload = item.get("payload") if isinstance(item.get("payload"), dict) else {}
        out.append({"type": kind, "payload": payload})
    if not out:
        out = [{"type": "alert", "payload": {}}]
    return out


def normalize_rule(raw: dict[str, Any]) -> dict[str, Any]:
    rule_id = str(raw.get("id") or uuid4())
    return {
        "id": rule_id,
        "name": (raw.get("name") or "Règle").strip() or "Règle",
        "condition": normalize_condition(raw.get("condition")),
        "actions": normalize_actions(raw.get("actions")),
        "active": bool(raw.get("active", True)),
    }


def match_condition(condition: dict[str, Any], state: dict[str, Any]) -> bool:
    cond = normalize_condition(condition)
    motifs = set(state.get("motifs") or [])
    for motif in cond["motifs"]:
        if motif not in motifs:
            return False
    if cond["any_motifs"] and not any(m in motifs for m in cond["any_motifs"]):
        return False
    if cond["weekday"] and (state.get("weekday") or "").lower() != cond["weekday"]:
        return False
    queries = state.get("queries") or {}
    for key, expected in cond["query_labels"].items():
        if str(queries.get(key) or "").lower() != expected.lower():
            return False
    needle = cond["caption_contains"]
    if needle and needle.lower() not in str(state.get("caption") or "").lower():
        return False
    min_g = cond["min_grounding"]
    if min_g is not None:
        score = state.get("grounding_score")
        if score is None or float(score) < min_g:
            return False
    return True


def evaluate_rules(rules: list[dict[str, Any]], state: dict[str, Any]) -> list[dict[str, Any]]:
    firings: list[dict[str, Any]] = []
    for raw in rules:
        rule = normalize_rule(raw)
        if not rule["active"]:
            continue
        if not match_condition(rule["condition"], state):
            continue
        firings.append(
            {
                "rule_id": rule["id"],
                "name": rule["name"],
                "actions": rule["actions"],
                "draw_date": state.get("date"),
                "motif_snapshot": {
                    "motifs": list(state.get("motifs") or []),
                    "caption": state.get("caption"),
                    "queries": state.get("queries") or {},
                    "weekday": state.get("weekday"),
                    "numbers": state.get("numbers"),
                    "stars": state.get("stars"),
                },
            }
        )
    return firings


def draft_rule_from_state(state: dict[str, Any]) -> dict[str, Any]:
    motifs = list(state.get("motifs") or [])[:4]
    name_bits = [label_of(m) for m in motifs] or ["glyphe"]
    return normalize_rule(
        {
            "name": "Persistance · " + ", ".join(name_bits),
            "condition": {"motifs": motifs},
            "actions": [
                {
                    "type": "hypothesize",
                    "payload": {"motifs": motifs, "constraint": "same_motifs"},
                }
            ],
            "active": True,
        }
    )


def validate_draft(rule: dict[str, Any]) -> dict[str, Any]:
    """La géométrie n'accepte que des motifs du lexique."""
    normalized = normalize_rule(rule)
    unknown = [
        m
        for m in (rule.get("condition") or {}).get("motifs") or []
        if m not in MOTIF_IDS
    ]
    return {**normalized, "rejected_motifs": unknown}
