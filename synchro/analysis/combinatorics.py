from __future__ import annotations

import math
from functools import lru_cache
from typing import Any

from synchro.ranks import RANK_LABELS, RANK_TABLE

N_POOL = 50
N_DRAW = 5
S_POOL = 12
S_DRAW = 2
TOTAL_GRIDS = math.comb(N_POOL, N_DRAW) * math.comb(S_POOL, S_DRAW)  # 139_838_160


def hypergeometric_match(k: int, drawn: int, pool: int, picked: int) -> float:
    """P(exactement k correspondances) quand on en tire `drawn` parmi `pool` et on en a choisi `picked`."""
    miss = pool - picked
    need_miss = drawn - k
    if k < 0 or k > picked or need_miss < 0 or need_miss > miss:
        return 0.0
    return math.comb(picked, k) * math.comb(miss, need_miss) / math.comb(pool, drawn)


def p_grid_match(k_numbers: int, s_stars: int, star_pool: int = S_POOL) -> float:
    return hypergeometric_match(k_numbers, N_DRAW, N_POOL, N_DRAW) * hypergeometric_match(
        s_stars, S_DRAW, star_pool, S_DRAW
    )


@lru_cache(maxsize=8)
def sum_ways(n: int = N_DRAW, lo: int = 1, hi: int = N_POOL) -> tuple[int, ...]:
    max_s = sum(range(hi - n + 1, hi + 1))
    ways = [[0] * (max_s + 1) for _ in range(n + 1)]
    ways[0][0] = 1
    for x in range(lo, hi + 1):
        for k in range(n, 0, -1):
            for s in range(max_s, x - 1, -1):
                ways[k][s] += ways[k - 1][s - x]
    return tuple(ways[n])


def sum_distribution(n: int = N_DRAW, lo: int = 1, hi: int = N_POOL) -> dict[str, Any]:
    ways = sum_ways(n, lo, hi)
    total = math.comb(hi - lo + 1, n)
    density = []
    for s, w in enumerate(ways):
        if w:
            density.append({"sum": s, "ways": w, "p": w / total})
    return {
        "min": next(x["sum"] for x in density),
        "max": density[-1]["sum"],
        "total": total,
        "density": density,
    }


@lru_cache(maxsize=4)
@lru_cache(maxsize=4)
def spread_distribution() -> dict[str, Any]:
    """Loi du spread max−min pour 5 distincts dans 1..50."""
    counts: dict[int, int] = {}
    # Pour un spread s, min=m, max=m+s, choisir 3 parmi (s-1) intérieurs.
    for spread in range(4, 50):
        interiors = spread - 1
        if interiors < 3:
            continue
        ways = 0
        for low in range(1, 51 - spread):
            ways += math.comb(interiors, 3)
        counts[spread] = ways
    # spread 4: interiors=3, C(3,3)=1, lows 1..46
    total = math.comb(50, 5)
    density = [{"spread": s, "ways": w, "p": w / total} for s, w in sorted(counts.items()) if w]
    return {"total": total, "density": density}


@lru_cache(maxsize=4)
def consecutive_distribution() -> dict[str, Any]:
    """Compte empirique exact par énumération des profils de runs — DP sur positions."""
    # Number of 5-subsets of 1..50 with exactly c consecutive pairs (n, n+1).
    # Consecutive pairs = 5 - number of runs, for a sorted tuple.
    counts = {c: 0 for c in range(0, 5)}
    # dp[i][k][c][prev_taken] where prev is boolean whether i-1 was taken — 50*6*5*2
    # At number i (1-indexed), k chosen so far, c consecutive pairs so far, prev = 1 if i-1 taken.
    I, K, Cmax = 51, 6, 5
    dp = [[[[0, 0] for _ in range(Cmax)] for _ in range(K)] for _ in range(I)]
    dp[0][0][0][0] = 1
    for i in range(1, 51):
        for k in range(6):
            for c in range(5):
                for prev in (0, 1):
                    cur = dp[i - 1][k][c][prev]
                    if not cur:
                        continue
                    # skip i
                    dp[i][k][c][0] += cur
                    # take i
                    if k + 1 <= 5:
                        add = 1 if prev == 1 else 0
                        nc = c + add
                        if nc < 5:
                            dp[i][k + 1][nc][1] += cur
    for c in range(5):
        counts[c] = dp[50][5][c][0] + dp[50][5][c][1]
    total = math.comb(50, 5)
    density = [{"consecutive": c, "ways": counts[c], "p": counts[c] / total} for c in range(5)]
    return {"total": total, "density": density}


@lru_cache(maxsize=4)
def parity_distribution() -> dict[str, Any]:
    """Loi du nombre de pairs dans un tirage 5/50 (25 pairs, 25 impairs)."""
    even_pool = odd_pool = 25
    total = math.comb(N_POOL, N_DRAW)
    density = []
    for even in range(N_DRAW + 1):
        odd = N_DRAW - even
        ways = math.comb(even_pool, even) * math.comb(odd_pool, odd)
        density.append(
            {
                "even": even,
                "odd": odd,
                "ways": ways,
                "p": ways / total,
                "label": f"{even}p / {odd}i",
            }
        )
    return {"total": total, "density": density}


def rank_probabilities(star_pool: int = S_POOL) -> list[dict[str, Any]]:
    rows = []
    p_win = 0.0
    for (k, s), rank in sorted(RANK_TABLE.items(), key=lambda item: item[1]):
        p = p_grid_match(k, s, star_pool=star_pool)
        p_win += p
        rows.append(
            {
                "rank": rank,
                "matched_numbers": k,
                "matched_stars": s,
                "label": RANK_LABELS[rank],
                "p": p,
                "one_in": round(1 / p) if p else None,
            }
        )
    rows.append(
        {
            "rank": None,
            "matched_numbers": None,
            "matched_stars": None,
            "label": "Pas de gain",
            "p": 1.0 - p_win,
            "one_in": round(1 / (1.0 - p_win)) if p_win < 1 else None,
        }
    )
    return rows


def coupon_collector(pool: int = N_POOL, drawn: int = N_DRAW) -> dict[str, Any]:
    """Espérance du nombre de tirages pour voir toutes les boules (5 sans remise / tirage)."""
    # E[k] = expected remaining draws from k distinct already seen. E[pool]=0
    # E[k] = 1 + sum_j P(new=j) E[k+j]
    e = [0.0] * (pool + 1)
    for k in range(pool - 1, -1, -1):
        unseen = pool - k
        p_stay = 0.0
        acc = 1.0
        for j in range(0, drawn + 1):
            if j > unseen or (drawn - j) > k:
                continue
            p = math.comb(unseen, j) * math.comb(k, drawn - j) / math.comb(pool, drawn)
            if j == 0:
                p_stay = p
            else:
                acc += p * e[k + j]
        e[k] = acc / (1.0 - p_stay)
    return {
        "expected_draws": e[0],
        "pool": pool,
        "drawn": drawn,
    }


def coverage_prob(draws_n: int, threshold: int, pool: int = N_POOL, drawn: int = N_DRAW) -> float:
    """P(au moins `threshold` boules distinctes après `draws_n` tirages) via DP."""
    # dp[t][k] after t draws, k distinct — too big if we do 2000*51. Fine: 51 states.
    dp = [0.0] * (pool + 1)
    dp[0] = 1.0
    for _ in range(draws_n):
        nxt = [0.0] * (pool + 1)
        for k, pk in enumerate(dp):
            if pk == 0:
                continue
            unseen = pool - k
            for j in range(0, drawn + 1):
                if j > unseen or (drawn - j) > k:
                    continue
                p = math.comb(unseen, j) * math.comb(k, drawn - j) / math.comb(pool, drawn)
                nxt[k + j] += pk * p
        dp = nxt
    return sum(dp[threshold:])


def proba_tables(star_pool: int = S_POOL) -> dict[str, Any]:
    ranks = rank_probabilities(star_pool=star_pool)
    sums = sum_distribution()
    spreads = spread_distribution()
    consec = consecutive_distribution()
    parity = parity_distribution()
    coupon = coupon_collector()
    p_no_rank = next(r["p"] for r in ranks if r["rank"] is None)
    return {
        "star_pool": star_pool,
        "total_grids": TOTAL_GRIDS if star_pool == S_POOL else math.comb(N_POOL, N_DRAW) * math.comb(star_pool, S_DRAW),
        "p_number_in_draw": N_DRAW / N_POOL,
        "ranks": ranks,
        "p_any_rank": 1.0 - p_no_rank,
        "sum": {"min": sums["min"], "max": sums["max"], "density": sums["density"]},
        "spread": spreads,
        "consecutive": consec,
        "parity": parity,
        "coupon_collector": coupon,
        "coverage_after_100": coverage_prob(100, 50),
        "disclaimer": "Probabilités exactes sous tirage uniforme sans remise. Les tirages sont indépendants.",
    }
