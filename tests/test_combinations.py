"""Contrats du moteur Combinaisons (miroir de src/lib/combinations.ts)."""

from __future__ import annotations

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
