from __future__ import annotations

import math
from typing import Any

from synchro.analysis.common import as_date, numbers_of, ordered_draws
from synchro.analysis.combinatorics import N_DRAW, N_POOL
from synchro.analysis.inference import number_frequencies, wilson_interval


def _beta_mean(a: float, b: float) -> float:
    return a / (a + b)


def _beta_var(a: float, b: float) -> float:
    return (a * b) / (((a + b) ** 2) * (a + b + 1))


def bayes_report(draws: list[dict[str, Any]]) -> dict[str, Any]:
    ordered = ordered_draws(draws)
    n = len(ordered)
    counts = number_frequencies(ordered)
    p0 = N_DRAW / N_POOL
    balls = []
    for value in range(1, N_POOL + 1):
        hits = counts[value]
        misses = n - hits
        uniform = {"a": 1.0 + hits, "b": 1.0 + misses}
        jeffreys = {"a": 0.5 + hits, "b": 0.5 + misses}
        u_mean = _beta_mean(uniform["a"], uniform["b"])
        j_mean = _beta_mean(jeffreys["a"], jeffreys["b"])
        _, lo, hi = wilson_interval(hits, n)
        # waiting time: delay in draws since last hit
        delay = 0
        for draw in reversed(ordered):
            if value in numbers_of(draw):
                break
            delay += 1
        p_ge = (1.0 - p0) ** delay if delay else 1.0
        balls.append(
            {
                "value": value,
                "count": hits,
                "uniform": {
                    "mean": u_mean,
                    "sd": math.sqrt(_beta_var(uniform["a"], uniform["b"])),
                    "predictive": u_mean,
                },
                "jeffreys": {
                    "mean": j_mean,
                    "sd": math.sqrt(_beta_var(jeffreys["a"], jeffreys["b"])),
                    "predictive": j_mean,
                },
                "delay_draws": delay,
                "p_delay_ge": p_ge,
                "wilson_lo": lo,
                "wilson_hi": hi,
            }
        )

    # Dirichlet-multinomial approx on the 50 balls using total appearances n*5
    total = n * N_DRAW
    alpha0 = 1.0
    dirichlet = []
    for value in range(1, N_POOL + 1):
        a = alpha0 + counts[value]
        mean = a / (N_POOL * alpha0 + total)
        dirichlet.append({"value": value, "mean": mean})

    return {
        "draw_count": n,
        "from_date": as_date(ordered[0]["draw_date"]).isoformat() if ordered else None,
        "to_date": as_date(ordered[-1]["draw_date"]).isoformat() if ordered else None,
        "p0": p0,
        "balls": balls,
        "dirichlet_multinomial": {
            "approx": True,
            "note": "Ignore le tirage sans remise intra-grille ; pédagogique seulement.",
            "means": dirichlet,
        },
        "disclaimer": "La prédictive se resserre vers 0.1 : l’incertitude fond, le biais « chaud/froid » aussi.",
    }
