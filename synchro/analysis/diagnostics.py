from __future__ import annotations

import math
from collections import Counter
from typing import Any

from synchro.analysis.common import as_date, numbers_of, ordered_draws
from synchro.analysis.combinatorics import N_DRAW, N_POOL
from synchro.analysis.variables import series as extract_series


def acf(values: list[float], lag: int = 1) -> float | None:
    if lag <= 0 or len(values) <= lag:
        return None
    mean = sum(values) / len(values)
    centered = [v - mean for v in values]
    den = sum(x * x for x in centered)
    if den == 0:
        return 0.0
    num = sum(centered[t] * centered[t - lag] for t in range(lag, len(centered)))
    return num / den


def jaccard(a: list[int], b: list[int]) -> float:
    sa, sb = set(a), set(b)
    if not sa and not sb:
        return 1.0
    return len(sa & sb) / len(sa | sb)


def hot_backtest(draws: list[dict[str, Any]], window: int = 20) -> dict[str, Any]:
    ordered = ordered_draws(draws)
    window = max(1, int(window))
    hits: list[int] = []
    for i in range(window, len(ordered)):
        past = ordered[i - window : i]
        freq: Counter[int] = Counter()
        for draw in past:
            freq.update(numbers_of(draw))
        hot = [n for n, _ in sorted(freq.items(), key=lambda t: (-t[1], t[0]))[:5]]
        actual = set(numbers_of(ordered[i]))
        hits.append(len(set(hot) & actual))
    expected = 5 * N_DRAW / N_POOL  # 0.5
    mean = sum(hits) / len(hits) if hits else None
    return {
        "window": window,
        "n": len(hits),
        "mean_matches": mean,
        "expected_random": expected,
        "histogram": [{"matches": k, "count": hits.count(k)} for k in range(0, 6) if hits.count(k)],
        "note": "Les 5 plus chauds des X tirages précédents vs le tirage suivant. Sous le hasard, ~0.5 numéro en commun.",
    }


def diagnostics_report(draws: list[dict[str, Any]], window: int = 20) -> dict[str, Any]:
    ordered = ordered_draws(draws)
    sums = extract_series(ordered, "sum")["values"]
    counts = [0] * (N_POOL + 1)
    for draw in ordered:
        for n in numbers_of(draw):
            counts[n] += 1
    total = sum(counts[1:])
    probs = [c / total for c in counts[1:]] if total else []
    h = -sum(p * math.log(p) for p in probs if p > 0) if probs else 0.0
    h_max = math.log(N_POOL)
    jac = [
        jaccard(numbers_of(ordered[i - 1]), numbers_of(ordered[i]))
        for i in range(1, len(ordered))
    ]
    scatter = [
        {
            "date": as_date(d["draw_date"]).isoformat(),
            "sum": sum(numbers_of(d)),
            "spread": max(numbers_of(d)) - min(numbers_of(d)),
        }
        for d in ordered
    ]
    return {
        "draw_count": len(ordered),
        "from_date": as_date(ordered[0]["draw_date"]).isoformat() if ordered else None,
        "to_date": as_date(ordered[-1]["draw_date"]).isoformat() if ordered else None,
        "acf_sum": {str(lag): acf(sums, lag) for lag in (1, 2, 3, 5, 10)},
        "entropy": {"h": h, "h_max": h_max, "ratio": h / h_max if h_max else None},
        "jaccard_consecutive_mean": sum(jac) / len(jac) if jac else None,
        "sum_spread": scatter[-120:],
        "hot_backtest": hot_backtest(ordered, window=window),
        "disclaimer": "Diagnostics descriptifs. Une ACF nulle et un backtest ≈ 0.5 sont le comportement attendu.",
    }
