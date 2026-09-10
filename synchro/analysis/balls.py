"""Tableau 1–50 et composition pair / impair, sur une fenêtre de tirages."""

from __future__ import annotations

from typing import Any

from synchro.analysis.combinatorics import N_DRAW, N_POOL, parity_distribution
from synchro.analysis.common import as_date, iso, numbers_of, ordered_draws
from synchro.analysis.inference import wilson_interval

P0 = N_DRAW / N_POOL


def even_count(numbers: list[int]) -> int:
    return sum(1 for n in numbers if n % 2 == 0)


def ball_board(draws: list[dict[str, Any]]) -> dict[str, Any]:
    ordered = ordered_draws(draws)
    n = len(ordered)
    counts = [0] * (N_POOL + 1)
    last_index: list[int | None] = [None] * (N_POOL + 1)
    last_date = [None] * (N_POOL + 1)
    for i, draw in enumerate(ordered):
        dt = as_date(draw["draw_date"])
        for value in numbers_of(draw):
            if 1 <= value <= N_POOL:
                counts[value] += 1
                last_index[value] = i
                last_date[value] = dt
    expected = n * P0
    last_draw_date = as_date(ordered[-1]["draw_date"]) if ordered else None
    balls = []
    for value in range(1, N_POOL + 1):
        hits = counts[value]
        p_hat, lo, hi = wilson_interval(hits, n)
        seen_at = last_index[value]
        seen = last_date[value]
        delay_draws = n if seen_at is None else n - 1 - seen_at
        delay_days = (last_draw_date - seen).days if seen and last_draw_date else None
        balls.append(
            {
                "value": value,
                "even": value % 2 == 0,
                "count": hits,
                "expected": expected,
                "rate": hits / n if n else 0.0,
                "last_seen": iso(seen) if seen else None,
                "delay_draws": delay_draws,
                "delay_days": delay_days,
                "p_hat": p_hat,
                "wilson_lo": lo,
                "wilson_hi": hi,
            }
        )
    return {
        "draw_count": n,
        "expected": expected,
        "p0": P0,
        "balls": balls,
    }


def parity_report(draws: list[dict[str, Any]]) -> dict[str, Any]:
    ordered = ordered_draws(draws)
    law = parity_distribution()
    observed = [0] * 6
    points: list[dict[str, Any]] = []
    even_balls = 0
    for draw in ordered:
        nums = numbers_of(draw)
        even = even_count(nums)
        observed[even] += 1
        even_balls += even
        points.append(
            {
                "date": iso(as_date(draw["draw_date"])),
                "even": even,
                "odd": N_DRAW - even,
            }
        )
    n = len(ordered)
    splits = []
    chi = 0.0
    for row, count in zip(law["density"], observed):
        expected = n * row["p"]
        if expected > 0:
            chi += (count - expected) ** 2 / expected
        splits.append({**row, "count": count, "expected": expected})
    return {
        "draw_count": n,
        "even_balls": even_balls,
        "odd_balls": N_DRAW * n - even_balls,
        "expected_even_balls": 2.5 * n,
        "mean_even": even_balls / n if n else 0.0,
        "chi_square": chi,
        "splits": splits,
        "points": points,
        "law": law,
    }
