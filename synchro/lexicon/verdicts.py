"""Verdicts de cohérence entre longueurs, champs et relectures."""

from __future__ import annotations

from typing import Any

FREE_FIELDS = ("sum", "parity", "star_sum")
SHAPE_FIELDS = ("spread", "n1", "n5")
DEFAULT_FIELDS = FREE_FIELDS + SHAPE_FIELDS
LENGTHS = (20, 50, 100)

_SCORE = {"monte": 1, "baisse": -1, "stable": 0}


def _sense_name(named: dict[str, Any] | None) -> str | None:
    if not named:
        return None
    sense = named.get("sense")
    if sense in _SCORE:
        return str(sense)
    return None


def _register(named: dict[str, Any] | None) -> str | None:
    if not named:
        return None
    register = named.get("register")
    return str(register) if register else None


def horizon_verdict(
    named_20: dict[str, Any] | None,
    named_50: dict[str, Any] | None,
    named_100: dict[str, Any] | None,
) -> str:
    """aligné, emboîté, opposé, nuage, ou abstention."""
    s20, s50, s100 = _sense_name(named_20), _sense_name(named_50), _sense_name(named_100)
    if s20 is None or s50 is None or s100 is None:
        return "abstention"
    if {s20, s100} == {"monte", "baisse"}:
        return "opposé"
    if s50 == s100 and s20 != s50:
        return "emboîté"
    if s20 == s50 == s100:
        registers = {_register(named_20), _register(named_50), _register(named_100)}
        if len(registers) > 1:
            return "nuage"
        return "aligné"
    if s20 == s100:
        return "aligné"
    return "emboîté"


def reread_verdict(
    study: dict[str, Any] | None,
    previous: dict[str, Any] | None,
) -> str | None:
    left, right = _sense_name(study), _sense_name(previous)
    if left is None or right is None:
        return None
    if {left, right} == {"monte", "baisse"}:
        return "opposé"
    if left == right:
        if _register(study) != _register(previous):
            return "nuage"
        return "aligné"
    return "emboîté"


def free_oppositions(named_by_field: dict[str, dict[str, Any] | None]) -> list[dict[str, str]]:
    found: list[dict[str, str]] = []
    fields = [field for field in FREE_FIELDS if field in named_by_field]
    for index, left in enumerate(fields):
        for right in fields[index + 1 :]:
            a, b = _sense_name(named_by_field[left]), _sense_name(named_by_field[right])
            if a is None or b is None:
                continue
            if {a, b} == {"monte", "baisse"}:
                found.append({"left": left, "right": right, "left_sense": a, "right_sense": b})
    return found


def shape_verdict(named_by_field: dict[str, dict[str, Any] | None]) -> str:
    """Le triplet spread / n1 / n5. L'étendue vaut n5 − n1."""
    spread = _sense_name(named_by_field.get("spread"))
    n1 = _sense_name(named_by_field.get("n1"))
    n5 = _sense_name(named_by_field.get("n5"))
    if spread is None or n1 is None or n5 is None:
        return "abstention"
    opening = _SCORE[n5] - _SCORE[n1]
    if spread == "monte" and opening < 0:
        return "opposé"
    if spread == "baisse" and opening > 0:
        return "opposé"
    return "aligné"
