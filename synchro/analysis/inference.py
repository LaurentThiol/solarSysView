from __future__ import annotations

import math
from typing import Any

from synchro.analysis.common import as_date, numbers_of, ordered_draws, weekday_of
from synchro.analysis.combinatorics import N_DRAW, N_POOL, sum_distribution


def norm_cdf(z: float) -> float:
    return 0.5 * (1.0 + math.erf(z / math.sqrt(2.0)))


def chi2_sf(stat: float, df: float) -> float:
    """Queue supérieure χ² (approx. Wilson–Hilferty)."""
    if stat <= 0 or df <= 0:
        return 1.0
    mu = 1.0 - 2.0 / (9.0 * df)
    sigma = math.sqrt(2.0 / (9.0 * df))
    z = ((stat / df) ** (1.0 / 3.0) - mu) / sigma
    return max(0.0, min(1.0, 1.0 - norm_cdf(z)))


def _log_binomial_pmf(k: int, n: int, p: float) -> float:
    if p <= 0:
        return 0.0 if k == 0 else -math.inf
    if p >= 1:
        return 0.0 if k == n else -math.inf
    return (
        math.lgamma(n + 1)
        - math.lgamma(k + 1)
        - math.lgamma(n - k + 1)
        + k * math.log(p)
        + (n - k) * math.log1p(-p)
    )


def binom_two_sided(successes: int, n: int, p0: float) -> float:
    """Test binomial exact bilatéral : somme des P(K=i) au plus égales à P(K=k)."""
    if n <= 0:
        return 1.0
    k = min(n, max(0, int(successes)))
    target = _log_binomial_pmf(k, n, p0)
    total = 0.0
    for i in range(n + 1):
        value = _log_binomial_pmf(i, n, p0)
        if value <= target + 1e-9:
            total += math.exp(value)
    return min(1.0, total)


def frequency_chi_scale(pool: int, drawn: int) -> float:
    """(N−1)/(N−K) : la statistique de Pearson des N boules a pour espérance N−K.

    Chaque tirage prend K boules sans remise. La comparer à un χ² à N−1 degrés
    de liberté demande ce facteur, sinon le p est trop grand.
    """
    if pool <= drawn:
        return 1.0
    return (pool - 1) / (pool - drawn)


def wilson_interval(successes: int, n: int, z: float = 1.96) -> tuple[float, float, float]:
    if n <= 0:
        return (0.0, 0.0, 1.0)
    p = successes / n
    z2 = z * z
    denom = 1.0 + z2 / n
    center = (p + z2 / (2.0 * n)) / denom
    margin = z * math.sqrt((p * (1.0 - p) + z2 / (4.0 * n)) / n) / denom
    return (p, max(0.0, center - margin), min(1.0, center + margin))


def bh_fdr(pvalues: list[float], q: float = 0.05) -> list[bool]:
    m = len(pvalues)
    order = sorted(range(m), key=lambda i: pvalues[i])
    reject = [False] * m
    cutoff = -1
    for rank, idx in enumerate(order, start=1):
        if pvalues[idx] <= q * rank / m:
            cutoff = rank
    for rank, idx in enumerate(order, start=1):
        if rank <= cutoff:
            reject[idx] = True
    return reject


def number_frequencies(draws: list[dict[str, Any]]) -> list[int]:
    counts = [0] * (N_POOL + 1)
    for draw in draws:
        for n in numbers_of(draw):
            if 1 <= n <= N_POOL:
                counts[n] += 1
    return counts


def chi_square_uniform(draws: list[dict[str, Any]]) -> dict[str, Any]:
    ordered = ordered_draws(draws)
    n = len(ordered)
    counts = number_frequencies(ordered)
    expected = n * (N_DRAW / N_POOL)
    raw = 0.0
    if expected > 0:
        raw = sum((counts[i] - expected) ** 2 / expected for i in range(1, N_POOL + 1))
    scale = frequency_chi_scale(N_POOL, N_DRAW)
    stat = raw * scale
    df = N_POOL - 1
    return {
        "stat": stat,
        "raw": raw,
        "scale": scale,
        "df": df,
        "pvalue": chi2_sf(stat, df),
        "expected_per_ball": expected,
        "model": "χ² à 49 ddl après le facteur (49/45) du tirage de 5 boules sans remise.",
    }


def ks_sum(draws: list[dict[str, Any]]) -> dict[str, Any]:
    ordered = ordered_draws(draws)
    if not ordered:
        return {"stat": None, "pvalue": None, "n": 0}
    sums = sorted(sum(numbers_of(d)) for d in ordered)
    dens = sum_distribution()["density"]
    cdf: dict[int, float] = {}
    acc = 0.0
    for row in dens:
        acc += row["p"]
        cdf[row["sum"]] = acc
    keys = sorted(cdf)
    def F(x: int) -> float:
        if x < keys[0]:
            return 0.0
        if x >= keys[-1]:
            return 1.0
        last = 0.0
        for s in keys:
            if s > x:
                return last
            last = cdf[s]
        return 1.0

    n = len(sums)
    d = 0.0
    for i, value in enumerate(sums, start=1):
        d = max(d, abs(i / n - F(value)), abs((i - 1) / n - F(value)))
    # Kolmogorov approximation
    lam = (math.sqrt(n) + 0.12 + 0.11 / math.sqrt(n)) * d
    p = 0.0
    for k in range(1, 40):
        p += 2 * ((-1) ** (k - 1)) * math.exp(-2 * (k * lam) ** 2)
    return {"stat": d, "pvalue": max(0.0, min(1.0, p)), "n": n}


def mann_whitney(xs: list[float], ys: list[float]) -> dict[str, Any]:
    n1, n2 = len(xs), len(ys)
    if n1 == 0 or n2 == 0:
        return {"u": None, "pvalue": None, "n_mardi": n1, "n_vendredi": n2}
    combined = [(v, 0) for v in xs] + [(v, 1) for v in ys]
    combined.sort(key=lambda t: t[0])
    ranks = [0.0] * len(combined)
    tie_term = 0.0
    i = 0
    while i < len(combined):
        j = i
        while j + 1 < len(combined) and combined[j + 1][0] == combined[i][0]:
            j += 1
        avg = (i + 1 + j + 1) / 2
        for k in range(i, j + 1):
            ranks[k] = avg
        length = j - i + 1
        if length > 1:
            tie_term += length**3 - length
        i = j + 1
    r1 = sum(rank for rank, item in zip(ranks, combined) if item[1] == 0)
    u1 = r1 - n1 * (n1 + 1) / 2
    mu = n1 * n2 / 2
    total = n1 + n2
    # Correction des ex-aequo : sans elle, la variance est trop grande et le p aussi.
    base = float(total + 1)
    if total > 1:
        base -= tie_term / (total * (total - 1))
    sigma2 = n1 * n2 / 12.0 * base
    sigma = math.sqrt(sigma2) if sigma2 > 0 else 0.0
    z = 0.0 if sigma == 0 else (u1 - mu) / sigma
    p = 2 * min(norm_cdf(z), 1.0 - norm_cdf(z))
    return {
        "u": u1,
        "z": z,
        "pvalue": min(1.0, p),
        "n_mardi": n1,
        "n_vendredi": n2,
        "mean_mardi": sum(xs) / n1,
        "mean_vendredi": sum(ys) / n2,
    }


def inference_report(draws: list[dict[str, Any]]) -> dict[str, Any]:
    ordered = ordered_draws(draws)
    n = len(ordered)
    counts = number_frequencies(ordered)
    p0 = N_DRAW / N_POOL
    balls = []
    pvalues = []
    for value in range(1, N_POOL + 1):
        hits = counts[value]
        p_hat, lo, hi = wilson_interval(hits, n)
        p_bin = binom_two_sided(hits, n, p0)
        pvalues.append(p_bin)
        balls.append(
            {
                "value": value,
                "count": hits,
                "p_hat": p_hat,
                "wilson_lo": lo,
                "wilson_hi": hi,
                "p0": p0,
                "contains_p0": lo <= p0 <= hi,
                "pvalue_hot": p_bin,
            }
        )
    rejected = bh_fdr(pvalues, q=0.05)
    for row, flag in zip(balls, rejected):
        row["fdr_reject"] = flag

    mardi = [float(sum(numbers_of(d))) for d in ordered if weekday_of(d).startswith("mardi")]
    vendredi = [float(sum(numbers_of(d))) for d in ordered if weekday_of(d).startswith("vendredi")]

    return {
        "draw_count": n,
        "from_date": as_date(ordered[0]["draw_date"]).isoformat() if ordered else None,
        "to_date": as_date(ordered[-1]["draw_date"]).isoformat() if ordered else None,
        "chi_square": chi_square_uniform(ordered),
        "ks_sum": ks_sum(ordered),
        "weekday_sum": mann_whitney(mardi, vendredi),
        "balls": balls,
        "fdr_q": 0.05,
        "fdr_rejections": sum(rejected),
        "disclaimer": "Les tirages sont indépendants. Un p petit décrit un écart au hasard, pas un signal jouable.",
    }
