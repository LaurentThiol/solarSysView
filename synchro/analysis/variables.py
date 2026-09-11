from __future__ import annotations

from typing import Any, Callable

from synchro.analysis.common import as_date, iso, numbers_of, ordered_draws, stars_of

# Numéros d’abord, étoiles ensuite — même ordre que l’UI.
VARIABLE_NAMES = (
    "sum",
    "spread",
    "parity",
    "high_low",
    "consecutive",
    "centroid",
    "delay",
    "hit",
    "star_sum",
    "star_delay",
    "star_hit",
)

_NEEDS_N = {
    "delay": "boule 1–50",
    "hit": "boule 1–50",
    "star_delay": "étoile 1–12",
    "star_hit": "étoile 1–12",
}

_SCALAR: dict[str, Callable[[dict[str, Any]], float]] = {
    "sum": lambda d: float(sum(numbers_of(d))),
    "spread": lambda d: float(max(numbers_of(d)) - min(numbers_of(d))),
    "parity": lambda d: float(sum(1 for n in numbers_of(d) if n % 2 == 0)),
    "high_low": lambda d: float(sum(1 for n in numbers_of(d) if n >= 26)),
    "consecutive": lambda d: float(_consecutive_pairs(numbers_of(d))),
    "centroid": lambda d: round(sum(numbers_of(d)) / 5, 4),
    "star_sum": lambda d: float(sum(stars_of(d))),
}


def _consecutive_pairs(numbers: list[int]) -> int:
    s = set(numbers)
    return sum(1 for n in s if (n + 1) in s)


def decade_hist(draw: dict[str, Any]) -> list[int]:
    """Counts in 1–10, 11–20, …, 41–50."""
    bins = [0] * 5
    for n in numbers_of(draw):
        bins[min(4, (n - 1) // 10)] += 1
    return bins


def _pool(draw: dict[str, Any], stars: bool) -> list[int]:
    return stars_of(draw) if stars else numbers_of(draw)


def _delay_series(
    draws: list[dict[str, Any]], ball: int, *, stars: bool = False
) -> list[dict[str, Any]]:
    last_index: int | None = None
    last_date = None
    out: list[dict[str, Any]] = []
    for i, draw in enumerate(draws):
        dt = as_date(draw["draw_date"])
        hit = ball in _pool(draw, stars)
        if hit:
            delay_draws = 0
            delay_days = 0
            last_index = i
            last_date = dt
        elif last_index is None:
            delay_draws = i + 1
            delay_days = None
        else:
            delay_draws = i - last_index
            delay_days = (dt - last_date).days if last_date else None
        out.append(
            {
                "date": iso(dt),
                "value": float(delay_draws),
                "delay_days": delay_days,
                "hit": hit,
            }
        )
    return out


def _hit_series(
    draws: list[dict[str, Any]], ball: int, *, stars: bool = False
) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for draw in draws:
        hit = 1.0 if ball in _pool(draw, stars) else 0.0
        out.append({"date": iso(as_date(draw["draw_date"])), "value": hit, "hit": bool(hit)})
    return out


def series(
    draws: list[dict[str, Any]],
    name: str = "sum",
    n: int | None = None,
) -> dict[str, Any]:
    """Série scalaire indexée par tirage. `n` obligatoire pour delay/hit (boule ou étoile)."""
    if name not in VARIABLE_NAMES:
        raise ValueError(f"Variable inconnue: {name}. Choisir parmi {VARIABLE_NAMES}.")
    ordered = ordered_draws(draws)
    if name in _NEEDS_N:
        if n is None:
            raise ValueError(f"{name} requiert n ({_NEEDS_N[name]}).")
        stars = name.startswith("star_")
        if name in {"delay", "star_delay"}:
            points = _delay_series(ordered, int(n), stars=stars)
        else:
            points = _hit_series(ordered, int(n), stars=stars)
    else:
        fn = _SCALAR[name]
        points = [{"date": iso(as_date(d["draw_date"])), "value": fn(d)} for d in ordered]
    values = [p["value"] for p in points]
    decades = [decade_hist(d) for d in ordered] if name == "sum" else None
    payload: dict[str, Any] = {
        "name": name,
        "n": n,
        "draw_count": len(ordered),
        "from_date": points[0]["date"] if points else None,
        "to_date": points[-1]["date"] if points else None,
        "points": points,
        "values": values,
    }
    if decades is not None:
        payload["decades"] = decades
    return payload
