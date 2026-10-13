"""Recomptage des numéros, étoiles, couples et triples réellement sortis."""

from __future__ import annotations

import math
from collections import Counter
from itertools import combinations
from typing import Any, Iterable

from synchro.analysis.combinatorics import inclusion_factor

LAPLACE = 0.5
NUMBER_POOL = 50
NUMBER_SLOTS = 5


def _pairs(numbers: Iterable[int]) -> list[tuple[int, int]]:
    ordered = tuple(sorted(set(int(n) for n in numbers)))
    return [(a, b) for a, b in combinations(ordered, 2)]


def _triples(numbers: Iterable[int]) -> list[tuple[int, int, int]]:
    ordered = tuple(sorted(set(int(n) for n in numbers)))
    return [(a, b, c) for a, b, c in combinations(ordered, 3)]


def _affinity(index: int, window: int) -> float:
    """Poids de rang : le plus récent (rang 0) pèse `window`, l’indice 0 pèse 1."""
    rank_from_recent = window - 1 - index
    return float(window - rank_from_recent)


def recount(rows: list[dict[str, Any]], *, star_pool: int = 12) -> dict[str, Any]:
    """Effectifs de la fenêtre. Le score utilisera un plancher de Laplace à part."""
    n = len(rows)
    pool = max(2, min(12, int(star_pool)))
    number_counts: Counter[int] = Counter()
    star_counts: Counter[int] = Counter()
    star_draw_counts: Counter[int] = Counter()
    pair_counts: Counter[tuple[int, int]] = Counter()
    triple_counts: Counter[tuple[int, int, int]] = Counter()
    pair_affinity: dict[tuple[int, int], float] = {}
    triple_affinity: dict[tuple[int, int, int], float] = {}
    pair_last: dict[tuple[int, int], int] = {}
    triple_last: dict[tuple[int, int, int], int] = {}
    for index, row in enumerate(rows):
        weight = _affinity(index, n) if n else 1.0
        nums = [int(v) for v in row["numbers"]]
        stars = [int(v) for v in row["stars"]]
        try:
            row_pool = max(2, min(pool, int(row.get("star_pool") or pool)))
        except (TypeError, ValueError):
            row_pool = pool
        number_counts.update(nums)
        star_counts.update(stars)
        star_draw_counts.update(range(1, row_pool + 1))
        for pair in _pairs(nums):
            pair_counts[pair] += 1
            pair_affinity[pair] = pair_affinity.get(pair, 0.0) + weight
            pair_last[pair] = index
        for triple in _triples(nums):
            triple_counts[triple] += 1
            triple_affinity[triple] = triple_affinity.get(triple, 0.0) + weight
            triple_last[triple] = index

    def share(count: int, slots: int, draws: int = n) -> float:
        if draws <= 0:
            return 0.0
        return count / (slots * draws)

    numbers = [
        {
            "n": ball,
            "count": int(number_counts[ball]),
            "share": share(int(number_counts[ball]), 5),
        }
        for ball in range(1, NUMBER_POOL + 1)
    ]
    stars = [
        {
            "n": ball,
            "count": int(star_counts[ball]),
            "share": share(int(star_counts[ball]), 2, int(star_draw_counts[ball])),
        }
        for ball in range(1, pool + 1)
    ]

    def link_rows(counts: Counter, affinity: dict, last: dict, width: int) -> list[dict[str, Any]]:
        rows_out = []
        for key, count in counts.items():
            singles = [number_counts[part] for part in key]
            p_joint = count / n if n else 0.0
            independent = 1.0
            for single in singles:
                independent *= (single / n) if n and single else 0.0
            factor = inclusion_factor(width, NUMBER_SLOTS, NUMBER_POOL)
            lift = p_joint / (independent * factor) if independent and factor else 0.0
            ago = (n - 1 - last[key]) if n else 0
            item: dict[str, Any] = {
                "count": int(count),
                "affinity": round(float(affinity.get(key, 0.0)), 4),
                "ago": int(ago),
                "lift": round(float(lift), 4),
            }
            letters = ("a", "b", "c")
            for pos in range(width):
                item[letters[pos]] = int(key[pos])
            rows_out.append(item)
        rows_out.sort(key=lambda item: (-item["affinity"], -item["count"], item.get("a", 0), item.get("b", 0)))
        return rows_out

    return {
        "draw_count": n,
        "star_pool": pool,
        "numbers": numbers,
        "stars": stars,
        "couples": link_rows(pair_counts, pair_affinity, pair_last, 2),
        "triples": link_rows(triple_counts, triple_affinity, triple_last, 3),
        "number_counts": {ball: int(number_counts[ball]) for ball in range(1, NUMBER_POOL + 1)},
        "star_counts": {ball: int(star_counts[ball]) for ball in range(1, pool + 1)},
        "star_draw_counts": {ball: int(star_draw_counts[ball]) for ball in range(1, pool + 1)},
        "pair_counts": {pair: int(count) for pair, count in pair_counts.items()},
        "triple_counts": {triple: int(count) for triple, count in triple_counts.items()},
    }


def smoothed_share(count: float, draws: int, slots: int, pool: int) -> float:
    return (count + LAPLACE) / (slots * max(draws, 0) + LAPLACE * pool)


def smoothed_lift(
    joint: float,
    singles: list[float],
    draws: int,
    *,
    slots: int = NUMBER_SLOTS,
    pool: int = NUMBER_POOL,
) -> float:
    n = max(draws, 1)
    p_joint = (joint + LAPLACE) / (n + LAPLACE)
    independent = 1.0
    for single in singles:
        independent *= (single + LAPLACE) / (n + LAPLACE)
    if independent <= 0:
        return 1.0
    factor = inclusion_factor(len(singles), slots, pool)
    return p_joint / (independent * factor) if factor else 1.0


def log_ball(count: float, draws: int, *, slots: int, pool: int) -> float:
    return math.log(max(smoothed_share(count, draws, slots, pool), 1e-12))


def public_base(base: dict[str, Any], *, couple_limit: int = 40, triple_limit: int = 40) -> dict[str, Any]:
    """Payload d’écran : sans les compteurs internes."""
    return {
        "draw_count": base["draw_count"],
        "star_pool": base["star_pool"],
        "numbers": base["numbers"],
        "stars": base["stars"],
        "couples": base["couples"][:couple_limit],
        "triples": base["triples"][:triple_limit],
    }
