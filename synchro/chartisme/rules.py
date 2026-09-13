"""Espace de règles du chartisme : QUAND figure ∧ contexte ALORS constat.

Délibérément **descriptif**. Aucune action ne touche aux grilles, et il n'y a
pas de branchement vers `/combinaisons` : une règle consigne une observation,
le rétro-test dit ensuite si elle valait quelque chose. C'est ce qui permet de
construire honnêtement une démarche de choix — tu vois ce qui a du répondant
au lieu de le supposer.

Les cinq actions sont toutes des écritures dans le journal :

- `tag` : marquer la fenêtre d'une étiquette à toi ;
- `alert` : la faire remonter en tête de l'onglet ;
- `note` : y attacher un commentaire libre ;
- `hypothesize` : formuler une attente vérifiable, que le rétro-test mesure ;
- `watch` : garder la courbe à l'œil aux prochains tirages.

Rappel qui n'est pas une formalité : les tirages sont indépendants. Une figure
sur une courbe de retards ou de sorties est une propriété du tracé, pas une
prédiction. Le rétro-test est là pour mesurer l'écart entre les deux.
"""

from __future__ import annotations

from typing import Any, Sequence
from uuid import uuid4

from synchro.chartisme.catalog import FIGURE_IDS, label_of

ACTION_TYPES = ("tag", "alert", "note", "hypothesize", "watch")
BREAKOUT_STATES = ("any", "confirmed", "fake", "pending")
DIRECTIONS = ("any", "up", "down")
TRENDS = ("any", "up", "down", "range")
KINDS = ("reversal_down", "reversal_up", "continuation", "range")
#: « peu importe » · « en même temps qu'une figure sur … » · « et pas sur … ».
ALONGSIDE_MODES = ("any", "with", "without")


def _clean_list(raw: Any, allowed: Sequence[str] | None = None) -> list[str]:
    items = raw if isinstance(raw, (list, tuple)) else []
    out: list[str] = []
    for item in items:
        text = str(item).strip()
        if not text or (allowed is not None and text not in allowed):
            continue
        if text not in out:
            out.append(text)
    return out


def _optional_float(raw: Any) -> float | None:
    if raw is None or raw == "":
        return None
    try:
        return float(raw)
    except (TypeError, ValueError):
        return None


def _one_of(raw: Any, allowed: Sequence[str], default: str) -> str:
    text = str(raw or "").strip().lower()
    return text if text in allowed else default


def normalize_condition(raw: dict[str, Any] | None) -> dict[str, Any]:
    """Condition complète, champs manquants remplis par leur neutre.

    `alongside` demande la simultanéité avec une figure d'une autre courbe. Les
    rangs d'un tirage sont liés par construction : `n1` bas pousse les autres
    vers le haut, si bien qu'une figure haussière sur `n5` au même moment qu'une
    baissière sur `n1` peut n'être qu'un seul fait — l'étalement du tirage —
    compté deux fois. `with` ne retient que les paires, `without` que les figures
    qui ne sont pas le reflet d'une voisine.
    """
    src = raw or {}
    return {
        # `figures` exige toutes les figures citées, `any_figures` au moins une.
        "figures": _clean_list(src.get("figures"), FIGURE_IDS),
        "any_figures": _clean_list(src.get("any_figures"), FIGURE_IDS),
        "kinds": _clean_list(src.get("kinds"), KINDS),
        "curves": _clean_list(src.get("curves")),
        "variables": _clean_list(src.get("variables")),
        "min_confidence": _optional_float(src.get("min_confidence")),
        "breakout": _one_of(src.get("breakout"), BREAKOUT_STATES, "any"),
        "direction": _one_of(src.get("direction"), DIRECTIONS, "any"),
        "trend": _one_of(src.get("trend"), TRENDS, "any"),
        "weekday": (str(src.get("weekday") or "").strip().lower() or None),
        "min_activity_ratio": _optional_float(src.get("min_activity_ratio")),
        "alongside": _one_of(src.get("alongside"), ALONGSIDE_MODES, "any"),
        "alongside_curve": (str(src.get("alongside_curve") or "").strip() or None),
        "alongside_figure": (str(src.get("alongside_figure") or "").strip() or None),
        "alongside_direction": _one_of(src.get("alongside_direction"), DIRECTIONS, "any"),
        # Tolérance en tirages autour du chevauchement : 0 exige que les deux
        # fenêtres se croisent. Un cycle transitoire ne frappe pas toutes les
        # courbes le même jour.
        "alongside_within": max(0, int(_optional_float(src.get("alongside_within")) or 0)),
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
        out = [{"type": "note", "payload": {}}]
    return out


def normalize_rule(raw: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": str(raw.get("id") or uuid4()),
        "name": (str(raw.get("name") or "Règle").strip() or "Règle"),
        "condition": normalize_condition(raw.get("condition")),
        "actions": normalize_actions(raw.get("actions")),
        "active": bool(raw.get("active", True)),
    }


def _breakout_state(hit: dict[str, Any]) -> str:
    breakout = hit.get("breakout")
    if not breakout:
        return "pending"
    return "confirmed" if breakout.get("confirmed") else "fake"


def match_condition(condition: dict[str, Any], state: dict[str, Any]) -> bool:
    """La fenêtre satisfait-elle la condition ?

    `state` réunit la figure détectée et son contexte : courbe, tendance de
    fond, jour de tirage.
    """
    cond = normalize_condition(condition)
    figure = str(state.get("figure") or "")
    figures = {figure} if figure else set()
    for wanted in cond["figures"]:
        if wanted not in figures:
            return False
    if cond["any_figures"] and not any(f in figures for f in cond["any_figures"]):
        return False
    if cond["kinds"] and str(state.get("kind") or "") not in cond["kinds"]:
        return False
    if cond["curves"] and str(state.get("curve_id") or "") not in cond["curves"]:
        return False
    if cond["variables"] and str(state.get("variable") or "") not in cond["variables"]:
        return False
    if cond["min_confidence"] is not None:
        confidence = state.get("confidence")
        if confidence is None or float(confidence) < cond["min_confidence"]:
            return False
    if cond["breakout"] != "any" and str(state.get("breakout_state") or "") != cond["breakout"]:
        return False
    if cond["direction"] != "any" and str(state.get("direction") or "") != cond["direction"]:
        return False
    if cond["trend"] != "any" and str(state.get("trend") or "") != cond["trend"]:
        return False
    if cond["weekday"] and str(state.get("weekday") or "").lower() != cond["weekday"]:
        return False
    if cond["min_activity_ratio"] is not None:
        ratio = state.get("activity_ratio")
        if ratio is None or float(ratio) < cond["min_activity_ratio"]:
            return False
    if cond["alongside"] != "any":
        # Aucune autre courbe balayée : la condition n'est pas fausse, elle est
        # sans objet. La déclarer satisfaite ferait tirer la règle sur un silence.
        if state.get("alongside") is None:
            return False
        found = bool(_alongside_matches(cond, state))
        if not found if cond["alongside"] == "with" else found:
            return False
    return True


def _overlaps(state: dict[str, Any], other: dict[str, Any], within: int) -> bool:
    """Deux fenêtres de figure se croisent-elles, `within` tirages de tolérance ?

    Le recouvrement se mesure sur les indices de tirage, pas sur les dates : deux
    courbes du même balayage partagent la même grille de tirages, et une date ne
    dit pas combien de tirages séparent deux figures.
    """
    here_from = int(state.get("from_index") or 0)
    here_to = int(state.get("to_index") or 0)
    there_from = int(other.get("from_index") or 0)
    there_to = int(other.get("to_index") or 0)
    return there_from - within <= here_to and there_to + within >= here_from


def _alongside_matches(cond: dict[str, Any], state: dict[str, Any]) -> list[dict[str, Any]]:
    """Les figures voisines retenues par la condition, la courbe lue exclue."""
    here = str(state.get("curve_id") or "")
    out: list[dict[str, Any]] = []
    for other in state.get("alongside") or []:
        if str(other.get("curve_id") or "") == here:
            continue
        if cond["alongside_curve"] and str(other.get("curve_id") or "") != cond["alongside_curve"]:
            continue
        if cond["alongside_figure"] and str(other.get("figure") or "") != cond["alongside_figure"]:
            continue
        if (
            cond["alongside_direction"] != "any"
            and str(other.get("direction") or "") != cond["alongside_direction"]
        ):
            continue
        if _overlaps(state, other, cond["alongside_within"]):
            out.append(other)
    return out


def alongside_index(hits: Sequence[dict[str, Any]]) -> list[dict[str, Any]]:
    """Les figures d'un balayage, réduites à ce qu'une condition de simultanéité lit."""
    return [
        {
            "curve_id": str(hit.get("curve_id") or ""),
            "figure": str(hit.get("figure") or ""),
            "direction": (hit.get("breakout") or {}).get("direction"),
            "from_index": int(hit.get("from_index") or 0),
            "to_index": int(hit.get("to_index") or 0),
        }
        for hit in hits
    ]


def state_from_hit(
    hit: dict[str, Any],
    *,
    curve: dict[str, Any] | None = None,
    trend: str | None = None,
    weekday: str | None = None,
    alongside: Sequence[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    """Figure détectée → état interrogeable par les règles.

    `alongside` absent et vide ne disent pas la même chose : `None` veut dire
    qu'aucune autre courbe n'a été balayée, et une condition de simultanéité ne
    peut alors rien affirmer. Une liste vide veut dire qu'on a cherché sans
    trouver.
    """
    breakout = hit.get("breakout") or {}
    return {
        "figure": hit.get("figure"),
        "label": hit.get("label"),
        "kind": hit.get("kind"),
        "signal": hit.get("signal"),
        "confidence": hit.get("confidence"),
        "curve_id": hit.get("curve_id") or (curve or {}).get("id"),
        "variable": hit.get("variable") or (curve or {}).get("variable"),
        "curve_label": (curve or {}).get("label"),
        "breakout_state": _breakout_state(hit),
        "direction": breakout.get("direction"),
        "activity_ratio": breakout.get("activity_ratio"),
        "trend": trend or "any",
        "weekday": weekday,
        "from": hit.get("from"),
        "to": hit.get("to"),
        "from_index": hit.get("from_index"),
        "to_index": hit.get("to_index"),
        "target": hit.get("target"),
        "detector": hit.get("detector"),
        "alongside": None if alongside is None else list(alongside),
    }


def evaluate_rules(
    rules: Sequence[dict[str, Any]],
    state: dict[str, Any],
) -> list[dict[str, Any]]:
    """Déclenchements d'une fenêtre — des lignes de journal, rien de plus."""
    firings: list[dict[str, Any]] = []
    for raw in rules:
        rule = normalize_rule(raw)
        if not rule["active"] or not match_condition(rule["condition"], state):
            continue
        firings.append(
            {
                "rule_id": rule["id"],
                "name": rule["name"],
                "actions": rule["actions"],
                "curve_id": state.get("curve_id"),
                "figure": state.get("figure"),
                "figure_date": state.get("to"),
                "snapshot": dict(state),
            }
        )
    return firings


def evaluate_all(
    rules: Sequence[dict[str, Any]],
    hits: Sequence[dict[str, Any]],
    *,
    curves: dict[str, dict[str, Any]] | None = None,
    trends: dict[str, str] | None = None,
) -> list[dict[str, Any]]:
    """Le journal complet sur un balayage d'archive.

    Toutes les figures du balayage servent de voisinage les unes aux autres :
    c'est le seul endroit où plusieurs courbes sont lues d'un coup, donc le seul
    où une condition de simultanéité a de quoi répondre.
    """
    out: list[dict[str, Any]] = []
    alongside = alongside_index(hits)
    for hit in hits:
        curve_id = str(hit.get("curve_id") or "")
        state = state_from_hit(
            hit,
            curve=(curves or {}).get(curve_id),
            trend=(trends or {}).get(curve_id),
            alongside=alongside,
        )
        out.extend(evaluate_rules(rules, state))
    return out


def draft_rule_from_hit(hit: dict[str, Any]) -> dict[str, Any]:
    """Règle brouillon tirée d'une figure repérée — un clic depuis l'annotation."""
    figure = str(hit.get("figure") or "none")
    breakout = _breakout_state(hit)
    confidence = hit.get("confidence")
    floor = None if confidence is None else round(max(0.3, float(confidence) - 0.1), 2)
    return normalize_rule(
        {
            "name": f"{label_of(figure)} · {_breakout_label(breakout)}",
            "condition": {
                "figures": [figure],
                "breakout": breakout if breakout != "pending" else "any",
                "min_confidence": floor,
            },
            "actions": [
                {
                    "type": "hypothesize",
                    "payload": {
                        "figure": figure,
                        "expectation": "target_reached",
                        "basis": (hit.get("target") or {}).get("basis"),
                    },
                }
            ],
            "active": True,
        }
    )


def _breakout_label(state: str) -> str:
    return {
        "confirmed": "cassure confirmée",
        "fake": "fake breakout",
        "pending": "en formation",
    }.get(state, "toute cassure")


def describe_condition(condition: dict[str, Any]) -> str:
    """Condition en une phrase française — pour l'affichage et le journal."""
    cond = normalize_condition(condition)
    parts: list[str] = []
    if cond["figures"]:
        parts.append(" et ".join(label_of(f) for f in cond["figures"]))
    if cond["any_figures"]:
        parts.append("une de " + ", ".join(label_of(f) for f in cond["any_figures"]))
    if cond["kinds"]:
        parts.append("type " + ", ".join(cond["kinds"]))
    if cond["variables"]:
        parts.append("variable " + ", ".join(cond["variables"]))
    if cond["curves"]:
        parts.append("courbe " + ", ".join(cond["curves"]))
    if cond["min_confidence"] is not None:
        parts.append(f"confiance ≥ {cond['min_confidence']:.2f}")
    if cond["breakout"] != "any":
        parts.append(_breakout_label(cond["breakout"]))
    if cond["direction"] != "any":
        parts.append("sens " + ("haussier" if cond["direction"] == "up" else "baissier"))
    if cond["trend"] != "any":
        parts.append(f"tendance de fond {cond['trend']}")
    if cond["weekday"]:
        parts.append(f"tirage du {cond['weekday']}")
    if cond["min_activity_ratio"] is not None:
        parts.append(f"activité ≥ {cond['min_activity_ratio']:.1f}× la MM20")
    if cond["alongside"] != "any":
        what = " ".join(
            bit
            for bit in (
                label_of(cond["alongside_figure"]) if cond["alongside_figure"] else "une figure",
                {"up": "haussière", "down": "baissière"}.get(cond["alongside_direction"], ""),
                f"sur {cond['alongside_curve'] or 'une autre courbe'}",
                (
                    f"à {cond['alongside_within']} tirages près"
                    if cond["alongside_within"]
                    else ""
                ),
            )
            if bit
        )
        lead = "en même temps que" if cond["alongside"] == "with" else "sans"
        parts.append(f"{lead} {what}")
    return "QUAND " + (" ∧ ".join(parts) if parts else "toute figure")


def describe_actions(actions: Sequence[dict[str, Any]]) -> str:
    labels = {
        "tag": "étiqueter",
        "alert": "remonter en tête",
        "note": "annoter",
        "hypothesize": "formuler une attente",
        "watch": "surveiller",
    }
    kinds = [labels.get(a.get("type", ""), a.get("type", "")) for a in actions]
    return "ALORS " + (", ".join(kinds) if kinds else "annoter")


def describe(rule: dict[str, Any]) -> str:
    normalized = normalize_rule(rule)
    return (
        f"{describe_condition(normalized['condition'])} "
        f"{describe_actions(normalized['actions'])}"
    )


def summarize_firings(firings: Sequence[dict[str, Any]]) -> dict[str, Any]:
    per_rule: dict[str, int] = {}
    per_figure: dict[str, int] = {}
    per_curve: dict[str, int] = {}
    for firing in firings:
        per_rule[str(firing.get("name"))] = per_rule.get(str(firing.get("name")), 0) + 1
        figure = str(firing.get("figure") or "none")
        per_figure[figure] = per_figure.get(figure, 0) + 1
        curve = str(firing.get("curve_id") or "?")
        per_curve[curve] = per_curve.get(curve, 0) + 1
    return {
        "count": len(firings),
        "by_rule": dict(sorted(per_rule.items(), key=lambda kv: -kv[1])),
        "by_figure": dict(sorted(per_figure.items(), key=lambda kv: -kv[1])),
        "by_curve": dict(sorted(per_curve.items(), key=lambda kv: -kv[1])[:20]),
    }
