"""Plan 2D : phase d'un cycle contre phase d'un autre, et scalaires du tirage."""

from __future__ import annotations

from typing import Any

from synchro.analysis.common import as_date, iso, numbers_of, ordered_draws, stars_of
from synchro.fdj import rank1_jackpot
from synchro.ref.phases import PHASES, phase
from synchro.ref.seasons import calendar_marks

WINDOWS = (20, 50, 100)
SCALES = ("sum", "star_sum", "n1", "n2", "n3", "n4", "n5", "e1", "e2")
SCALE_LABELS = {
    "sum": "Total numéros",
    "star_sum": "Total étoiles",
    "n1": "n1",
    "n2": "n2",
    "n3": "n3",
    "n4": "n4",
    "n5": "n5",
    "e1": "E1",
    "e2": "E2",
}


def _window(value: int) -> int:
    if value not in WINDOWS:
        raise ValueError("Fenêtre : 20, 50 ou 100 tirages.")
    return value


def _scale(value: str) -> str:
    if value not in SCALES:
        raise ValueError(f"Grandeur inconnue : {value}")
    return value


def _cycle(value: str) -> str:
    if value not in PHASES:
        raise ValueError(f"Cycle sans phase locale : {value}")
    return value


def _point(draw: dict[str, Any]) -> dict[str, Any]:
    day = as_date(draw["draw_date"])
    numbers = sorted(numbers_of(draw))
    stars = sorted(stars_of(draw))
    won, prize = rank1_jackpot(draw)
    return {
        "date": iso(day),
        "sum": int(sum(numbers)),
        "star_sum": int(sum(stars)),
        "n1": numbers[0],
        "n2": numbers[1],
        "n3": numbers[2],
        "n4": numbers[3],
        "n5": numbers[4],
        "e1": stars[0],
        "e2": stars[1],
        "jackpot": won,
        "jackpot_eur": prize,
    }


def _tail(draws: list[dict[str, Any]], window: int) -> tuple[list[dict[str, Any]], bool]:
    ordered = ordered_draws(draws)
    if not ordered:
        raise ValueError("Aucun tirage dans l'archive.")
    short = len(ordered) < window
    return ordered[-window:], short


def trace(draws: list[dict[str, Any]], cycle_id: str, window: int = 50) -> dict[str, Any]:
    """Un cycle en abscisse, les neuf grandeurs du tirage sur chaque point."""
    cycle_id = _cycle(cycle_id)
    window = _window(window)
    tail, short = _tail(draws, window)
    rows = []
    for draw in tail:
        point = _point(draw)
        point["phase"] = phase(cycle_id, point["date"])
        rows.append(point)
    marks = calendar_marks(as_date(rows[0]["date"]), as_date(rows[-1]["date"])) if rows else []
    return {
        "ok": True,
        "cycle": cycle_id,
        "window": window,
        "count": len(rows),
        "short": short,
        "scales": list(SCALES),
        "points": rows,
        "calendar": marks,
    }


def _note(x_id: str, y_id: str) -> str:
    text = (
        "Chaque point est un tirage. Les axes sont des phases 0–1. "
        "La grandeur choisie (total, n1–n5, E1, E2) colore le point. "
        "Ce n'est pas une liaison causale."
    )
    if {x_id, y_id} == {"lunaire", "vive-eau"}:
        text += (
            " Vive-eau est le double de la phase lunaire : le nuage suit une courbe, "
            "les deux axes ne sont pas deux horloges indépendantes."
        )
    return text


def plane(
    draws: list[dict[str, Any]],
    x_id: str = "lunaire",
    y_id: str = "carrington",
    window: int = 50,
) -> dict[str, Any]:
    """Deux phases en axes, les grandeurs du tirage en attributs du point."""
    x_id = _cycle(x_id)
    y_id = _cycle(y_id)
    window = _window(window)
    tail, short = _tail(draws, window)
    rows = []
    for draw in tail:
        point = _point(draw)
        point["x"] = phase(x_id, point["date"])
        point["y"] = phase(y_id, point["date"])
        rows.append(point)
    return {
        "ok": True,
        "x": x_id,
        "y": y_id,
        "window": window,
        "count": len(rows),
        "short": short,
        "scales": [{"id": key, "label": SCALE_LABELS[key]} for key in SCALES],
        "cycles": list(PHASES),
        "points": rows,
        "note": _note(x_id, y_id),
    }
