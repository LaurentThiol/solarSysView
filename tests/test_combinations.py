"""Contrats du moteur Combinaisons (miroir de src/lib/combinations.ts)."""

from __future__ import annotations

import math

from synchro.analysis.combinatorics import proba_tables
from synchro.ranks import evaluate_grid


def official_win_probability(star_pool: int = 12) -> dict:
    tables = proba_tables(star_pool)
    p_win = tables["p_any_rank"]
    return {"p_win": p_win, "p_lose": 1.0 - p_win, "ranks": tables["ranks"]}


def empirical_win_rate(numbers: list[int], stars: list[int], draws: list[tuple[list[int], list[int]]]) -> dict:
    results = [evaluate_grid(numbers, stars, draw_n, draw_s) for draw_n, draw_s in draws]
    n = len(results)
    wins = sum(1 for row in results if row["rank"] is not None)
    return {"n": n, "wins": wins, "p": 0.0 if n == 0 else wins / n}


def ball_weight(count: float, delay: float, expected: float, strategy: str) -> float:
    if strategy == "overdue":
        return max(delay, 0.01)
    if strategy == "hot":
        return max(count, 0.01)
    if strategy == "cold":
        return max(expected - count, 0.01)
    return 1.0


def mulberry32(seed: int):
    state = seed & 0xFFFFFFFF

    def rand() -> float:
        nonlocal state
        state = (state + 0x6D2B79F5) & 0xFFFFFFFF
        t = state
        t = (t ^ (t >> 15)) * (t | 1) & 0xFFFFFFFF
        t = (t ^ (t + ((t ^ (t >> 7)) * (t | 61) & 0xFFFFFFFF))) & 0xFFFFFFFF
        return ((t ^ (t >> 14)) & 0xFFFFFFFF) / 4294967296

    return rand


def pick_weighted(items: list[int], weights: list[float], k: int, rand) -> list[int]:
    pool = [{"item": item, "weight": max(weight, 0.0)} for item, weight in zip(items, weights)]
    picked: list[int] = []
    take = min(k, len(pool))
    for _ in range(take):
        total = sum(row["weight"] for row in pool)
        if total <= 0:
            index = min(len(pool) - 1, int(rand() * len(pool)))
        else:
            cursor = rand() * total
            index = 0
            for i, row in enumerate(pool):
                cursor -= row["weight"]
                index = i
                if cursor <= 0:
                    break
        picked.append(pool[index]["item"])
        pool.pop(index)
    return picked


def percentile_rank(values: list[float], x: float) -> float | None:
    if not values:
        return None
    below = sum(1 for value in values if value < x)
    equal = sum(1 for value in values if value == x)
    return (below + 0.5 * equal) / len(values)


NUMBER_SUM_MIN = 15
NUMBER_SUM_MAX = 240
THEORETICAL_NUMBER_SUM_MEAN = 128


def quantile(values: list[float], q: float) -> float | None:
    if not values:
        return None
    p = min(1.0, max(0.0, q))
    ordered = sorted(values)
    index = (len(ordered) - 1) * p
    lo = math.floor(index)
    hi = math.ceil(index)
    if lo == hi:
        return float(ordered[lo])
    return ordered[lo] + (ordered[hi] - ordered[lo]) * (index - lo)


def js_round(value: float) -> int:
    return int(math.floor(value + 0.5)) if value >= 0 else int(math.ceil(value - 0.5))


def clamp_number_sum(value: float) -> int:
    return min(NUMBER_SUM_MAX, max(NUMBER_SUM_MIN, js_round(value)))


def auto_max_sum(sums: list[float], q: float = 0.75) -> int:
    resolved = quantile(sums, q)
    if resolved is None:
        return THEORETICAL_NUMBER_SUM_MEAN
    return clamp_number_sum(resolved)


def resolve_max_sum(mode: str, manual: str | int | None, sums: list[float]) -> int:
    if mode == "manual" and manual not in (None, ""):
        try:
            parsed = float(manual)
        except (TypeError, ValueError):
            parsed = float("nan")
        if parsed == parsed:
            return clamp_number_sum(parsed)
    return auto_max_sum(sums)


def fit_number_sum(numbers: list[int], max_sum: int, pool: list[int] | None = None) -> list[int] | None:
    cap = clamp_number_sum(max_sum)
    universe = pool if pool is not None else list(range(1, 51))
    current: list[int] = []
    used: set[int] = set()
    for value in numbers:
        if value in used or value < 1 or value > 50:
            continue
        used.add(value)
        current.append(value)
    unused = [value for value in universe if value not in used]
    unused.sort()
    while len(current) < 5 and unused:
        nxt = unused.pop(0)
        current.append(nxt)
        used.add(nxt)
    if len(current) != 5:
        return None
    remaining = {value for value in universe if value not in used}
    for _ in range(50):
        total = sum(current)
        if total <= cap:
            return sorted(current)
        largest_index = max(range(len(current)), key=lambda i: current[i])
        largest = current[largest_index]
        deficit = total - cap
        smaller = [value for value in remaining if value < largest]
        if not smaller:
            return None
        one_shot = [value for value in smaller if largest - value >= deficit]
        replacement = max(one_shot) if one_shot else min(smaller)
        remaining.remove(replacement)
        remaining.add(largest)
        current[largest_index] = replacement
    return None


def test_official_p_sums_to_one():
    official = official_win_probability(12)
    ranks_p = sum(row["p"] for row in official["ranks"])
    assert abs(ranks_p - 1.0) < 1e-12
    assert abs(official["p_win"] + official["p_lose"] - 1.0) < 1e-12
    assert 0.07 < official["p_win"] < 0.08


def test_empirical_zero_wins():
    grid_n, grid_s = [1, 2, 3, 4, 5], [1, 2]
    draws = [
        ([10, 11, 12, 13, 14], [3, 4]),
        ([20, 21, 22, 23, 24], [5, 6]),
        ([30, 31, 32, 33, 34], [7, 8]),
    ]
    rate = empirical_win_rate(grid_n, grid_s, draws)
    assert rate["n"] == 3
    assert rate["wins"] == 0
    assert rate["p"] == 0.0


def test_empirical_k_over_n():
    grid_n, grid_s = [1, 2, 3, 4, 5], [1, 2]
    draws = [
        ([1, 2, 10, 11, 12], [3, 4]),  # 2 numéros → rang 13
        ([10, 11, 12, 13, 14], [3, 4]),  # rien
        ([1, 2, 3, 10, 11], [3, 4]),  # 3 numéros → rang 10
        ([40, 41, 42, 43, 44], [9, 10]),  # rien
    ]
    rate = empirical_win_rate(grid_n, grid_s, draws)
    assert rate["n"] == 4
    assert rate["wins"] == 2
    assert rate["p"] == 0.5


def test_ball_weights():
    assert ball_weight(3, 12, 5, "overdue") == 12
    assert ball_weight(8, 1, 5, "hot") == 8
    assert ball_weight(1, 4, 5, "cold") == 4
    assert ball_weight(9, 0, 5, "cold") == 0.01
    assert ball_weight(2, 7, 5, "uniform") == 1
    assert ball_weight(2, 7, 5, "balanced") == 1


def test_weighted_sample_no_collision():
    items = list(range(1, 51))
    weights = [float(i) for i in items]
    rand = mulberry32(42)
    picked = pick_weighted(items, weights, 5, rand)
    assert len(picked) == 5
    assert len(set(picked)) == 5
    assert all(1 <= value <= 50 for value in picked)


def test_propose_salve_unique_complete_grids():
    rand = mulberry32(7)
    numbers = list(range(1, 51))
    stars = list(range(1, 13))
    seen: set[str] = set()
    grids: list[tuple[list[int], list[int]]] = []
    for _ in range(40):
        if len(grids) >= 5:
            break
        n = sorted(pick_weighted(numbers, [1.0] * 50, 5, rand))
        s = sorted(pick_weighted(stars, [1.0] * 12, 2, rand))
        key = f"{n}|{s}"
        if key in seen:
            continue
        seen.add(key)
        grids.append((n, s))
    assert len(grids) == 5
    assert len({f"{n}|{s}" for n, s in grids}) == 5
    for n, s in grids:
        assert len(n) == 5 and len(set(n)) == 5
        assert len(s) == 2 and len(set(s)) == 2


def test_percentile_rank():
    assert percentile_rank([], 10) is None
    assert percentile_rank([10, 20, 30], 20) == 0.5
    assert percentile_rank([10, 20, 30], 10) == 1 / 6
    assert percentile_rank([10, 20, 30], 5) == 0.0


def test_quantile_linear():
    assert quantile([], 0.75) is None
    assert quantile([10, 20, 30, 40], 0) == 10
    assert quantile([10, 20, 30, 40], 1) == 40
    assert quantile([10, 20, 30, 40], 0.75) == 32.5


def test_auto_max_sum_p75():
    assert auto_max_sum([]) == 128
    assert auto_max_sum([100, 120, 140, 160]) == 145
    assert auto_max_sum([10, 20, 30, 40]) == 33
    assert clamp_number_sum(10) == 15
    assert clamp_number_sum(32.5) == 33
    assert clamp_number_sum(999) == 240


def test_resolve_max_sum_modes():
    sums = [100, 120, 140, 160]
    assert resolve_max_sum("auto", "90", sums) == auto_max_sum(sums)
    assert resolve_max_sum("manual", "110", sums) == 110
    assert resolve_max_sum("manual", "", sums) == auto_max_sum(sums)
    assert resolve_max_sum("manual", "5", sums) == 15


def test_fit_number_sum_respects_cap():
    fitted = fit_number_sum([46, 47, 48, 49, 50], 127)
    assert fitted is not None
    assert len(fitted) == 5
    assert len(set(fitted)) == 5
    assert sum(fitted) <= 127
    assert fit_number_sum([1, 2, 3, 4, 5], 15) == [1, 2, 3, 4, 5]
    assert fit_number_sum([10, 20, 30, 40, 50], 140) == [10, 20, 30, 39, 40]


def test_propose_salve_respects_max_sum():
    rand = mulberry32(7)
    numbers = list(range(1, 51))
    seen: set[str] = set()
    grids: list[list[int]] = []
    cap = 110
    for _ in range(80):
        if len(grids) >= 5:
            break
        picked = pick_weighted(numbers, [1.0] * 50, 5, rand)
        if sum(picked) > cap:
            fitted = fit_number_sum(picked, cap)
            if fitted is None:
                continue
            picked = fitted
        key = ",".join(str(value) for value in sorted(picked))
        if key in seen:
            continue
        seen.add(key)
        grids.append(sorted(picked))
    assert len(grids) == 5
    assert all(sum(grid) <= cap for grid in grids)
