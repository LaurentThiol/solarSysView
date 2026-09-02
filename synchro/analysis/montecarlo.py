from __future__ import annotations

import random
from collections import Counter
from datetime import date, timedelta
from typing import Any

from synchro.analysis.common import numbers_of, ordered_draws
from synchro.analysis.combinatorics import N_DRAW, N_POOL, S_DRAW, S_POOL


def simulate_draw(rng: random.Random, star_pool: int = S_POOL) -> tuple[list[int], list[int]]:
    numbers = rng.sample(range(1, N_POOL + 1), N_DRAW)
    stars = rng.sample(range(1, star_pool + 1), S_DRAW)
    return sorted(numbers), sorted(stars)


def history_records(draws: list[dict[str, Any]]) -> dict[str, Any]:
    ordered = ordered_draws(draws)
    freq: Counter[int] = Counter()
    last_seen: dict[int, int] = {}
    max_delay = 0
    delay_of: dict[int, int] = {i: 0 for i in range(1, N_POOL + 1)}
    for i, draw in enumerate(ordered):
        seen = set(numbers_of(draw))
        freq.update(seen)
        for n in range(1, N_POOL + 1):
            if n in seen:
                last_seen[n] = i
                delay_of[n] = 0
            else:
                delay_of[n] += 1
                if delay_of[n] > max_delay:
                    max_delay = delay_of[n]
    max_freq = max(freq.values()) if freq else 0
    hottest = [n for n, c in freq.items() if c == max_freq]
    return {
        "draw_count": len(ordered),
        "max_frequency": max_freq,
        "hottest": sorted(hottest),
        "max_delay_draws": max_delay,
    }


def montecarlo_report(
    draws: list[dict[str, Any]],
    n_sim: int = 1000,
    seed: int = 0,
    star_pool: int = S_POOL,
) -> dict[str, Any]:
    ordered = ordered_draws(draws)
    n = len(ordered)
    n_sim = max(1, min(int(n_sim), 5000))
    observed = history_records(ordered)
    rng = random.Random(seed)
    max_freq_dist: list[int] = []
    max_delay_dist: list[int] = []
    origin = date(2000, 1, 1)
    for _ in range(n_sim):
        fake = []
        for i in range(n):
            nums, stars = simulate_draw(rng, star_pool=star_pool)
            fake.append(
                {
                    "draw_date": origin + timedelta(days=i),
                    "numbers": nums,
                    "stars": stars,
                }
            )
        rec = history_records(fake)
        max_freq_dist.append(rec["max_frequency"])
        max_delay_dist.append(rec["max_delay_draws"])

    def percentile_ge(dist: list[int], value: int) -> float:
        return sum(1 for x in dist if x >= value) / len(dist)

    bins_freq = Counter(max_freq_dist)
    bins_delay = Counter(max_delay_dist)
    return {
        "draw_count": n,
        "n_sim": n_sim,
        "seed": seed,
        "observed": observed,
        "max_frequency": {
            "observed": observed["max_frequency"],
            "mean": sum(max_freq_dist) / n_sim,
            "p_ge_observed": percentile_ge(max_freq_dist, observed["max_frequency"]),
            "histogram": [{"value": k, "count": bins_freq[k]} for k in sorted(bins_freq)],
        },
        "max_delay_draws": {
            "observed": observed["max_delay_draws"],
            "mean": sum(max_delay_dist) / n_sim,
            "p_ge_observed": percentile_ge(max_delay_dist, observed["max_delay_draws"]),
            "histogram": [{"value": k, "count": bins_delay[k]} for k in sorted(bins_delay)],
        },
        "disclaimer": "Sous H0 uniforme, le record observé devrait tomber dans le ventre de ces histogrammes.",
    }
