from __future__ import annotations

import math
from collections import Counter
from typing import Any

from synchro.analysis.common import as_date, numbers_of, ordered_draws
from synchro.analysis.combinatorics import N_POOL, consecutive_distribution, sum_distribution


def _entropy(probs: list[float]) -> float:
    return -sum(p * math.log(p) for p in probs if p > 0)


def pair_matrix(draws: list[dict[str, Any]]) -> dict[str, Any]:
    ordered = ordered_draws(draws)
    n = len(ordered)
    single = [0] * (N_POOL + 1)
    pair = Counter()
    for draw in ordered:
        nums = sorted(set(numbers_of(draw)))
        for a in nums:
            single[a] += 1
        for i, a in enumerate(nums):
            for b in nums[i + 1 :]:
                pair[(a, b)] += 1
    edges = []
    for (a, b), c in pair.items():
        p_ab = c / n
        p_a = single[a] / n
        p_b = single[b] / n
        lift = p_ab / (p_a * p_b) if p_a and p_b else 0.0
        # binary MI on co-occurrence vs independent
        p11 = p_ab
        p10 = max(0.0, p_a - p_ab)
        p01 = max(0.0, p_b - p_ab)
        p00 = max(0.0, 1.0 - p11 - p10 - p01)
        mi = 0.0
        for pxy, px, py in (
            (p11, p_a, p_b),
            (p10, p_a, 1.0 - p_b),
            (p01, 1.0 - p_a, p_b),
            (p00, 1.0 - p_a, 1.0 - p_b),
        ):
            if pxy > 0 and px > 0 and py > 0:
                mi += pxy * math.log(pxy / (px * py))
        edges.append({"a": a, "b": b, "count": c, "lift": lift, "mi": mi})
    edges.sort(key=lambda e: (-e["lift"], -e["count"], e["a"], e["b"]))
    graph = [e for e in edges if e["lift"] >= 1.4][:40]
    return {
        "draw_count": n,
        "top_pairs": edges[:25],
        "graph": graph,
        "threshold_lift": 1.4,
    }


def surprise_scores(draws: list[dict[str, Any]]) -> list[dict[str, Any]]:
    sum_p = {row["sum"]: row["p"] for row in sum_distribution()["density"]}
    cons_p = {row["consecutive"]: row["p"] for row in consecutive_distribution()["density"]}
    out = []
    for draw in ordered_draws(draws):
        nums = numbers_of(draw)
        s = sum(nums)
        c = sum(1 for x in set(nums) if (x + 1) in set(nums))
        p_s = sum_p.get(s, 1e-12)
        p_c = cons_p.get(c, 1e-12)
        score = -math.log(p_s) - math.log(p_c)
        out.append(
            {
                "date": as_date(draw["draw_date"]).isoformat(),
                "numbers": nums,
                "sum": s,
                "consecutive": c,
                "surprise": score,
            }
        )
    out.sort(key=lambda r: -r["surprise"])
    return out


def dependence_report(draws: list[dict[str, Any]]) -> dict[str, Any]:
    ordered = ordered_draws(draws)
    pairs = pair_matrix(ordered)
    surprises = surprise_scores(ordered)
    return {
        "draw_count": len(ordered),
        "from_date": as_date(ordered[0]["draw_date"]).isoformat() if ordered else None,
        "to_date": as_date(ordered[-1]["draw_date"]).isoformat() if ordered else None,
        "pairs": pairs,
        "surprise_top": surprises[:15],
        "disclaimer": "Co-occurrences et scores de rareté sont descriptifs. H0 = indépendance uniforme.",
    }
