"""Contrats du moteur Jeux (miroir de src/lib/jeux.ts)."""

from itertools import combinations

from synchro.analysis.jeux import (
    TOTAL_GRIDS,
    TOTAL_NUMBER_WAYS,
    TOTAL_STAR_WAYS,
    chance_map,
    evaluate_game,
    evaluate_pool,
)


def _spec(kind: str, **kwargs):
    meta_pool = 50 if kind == "numbers" else 12
    spec = {
        "kind": kind,
        "chance": chance_map(pool_max=meta_pool),
        "threshold": 1,
        "forced": [],
        "min_sum": 15 if kind == "numbers" else 3,
        "max_sum": 240 if kind == "numbers" else 23,
        "min_even": 0,
        "max_even": 5 if kind == "numbers" else 2,
        "min_spread": 4 if kind == "numbers" else 1,
        "max_spread": 49 if kind == "numbers" else 11,
        "min_consecutive": 0,
        "max_consecutive": 4 if kind == "numbers" else 1,
        "decade_min": [0, 0, 0, 0, 0],
        "decade_max": [5, 5, 5, 5, 5],
    }
    spec.update(kwargs)
    if "chance" in kwargs and isinstance(kwargs["chance"], dict):
        merged = chance_map(pool_max=meta_pool)
        merged.update({int(k): v for k, v in kwargs["chance"].items()})
        spec["chance"] = merged
    return spec


def brute(values, k, min_sum, max_sum, min_even, max_even, forced=()):
    forced = list(forced)
    rest = [v for v in values if v not in forced]
    need = k - len(forced)
    if need < 0 or need > len(rest):
        return 0
    must_sum = sum(forced)
    must_even = sum(1 for v in forced if v % 2 == 0)
    count = 0
    for combo in combinations(rest, need):
        total = must_sum + sum(combo)
        even = must_even + sum(1 for v in combo if v % 2 == 0)
        if min_sum <= total <= max_sum and min_even <= even <= max_even:
            count += 1
    return count


def test_unrestricted_universe():
    numbers = evaluate_pool(_spec("numbers"))
    stars = evaluate_pool(_spec("stars"))
    assert numbers["count"] == TOTAL_NUMBER_WAYS == 2_118_760
    assert stars["count"] == TOTAL_STAR_WAYS == 66
    assert numbers["mass"] == numbers["count"]
    assert stars["mass"] == stars["count"]
    game = evaluate_game(_spec("numbers"), _spec("stars"))
    assert game["grids"] == TOTAL_GRIDS == 139_838_160
    assert game["fraction"] == 1.0
    assert game["one_in"] == 1


def test_smallest_number_sum_is_unique():
    result = evaluate_pool(_spec("numbers", min_sum=15, max_sum=15))
    assert result["count"] == 1
    assert result["mean_sum"] == 15


def test_only_ten_balls():
    chance = {i: 100 if i <= 10 else 0 for i in range(1, 51)}
    result = evaluate_pool(_spec("numbers", chance=chance))
    assert result["count"] == 252
    assert result["pool_size"] == 10


def test_all_even_numbers():
    chance = {i: 100 if i % 2 == 0 else 0 for i in range(1, 51)}
    result = evaluate_pool(_spec("numbers", chance=chance, min_even=5, max_even=5))
    assert result["count"] == 53130


def test_forced_and_optional_star():
    chance = {i: 100 if i in (1, 2, 3) else 0 for i in range(1, 13)}
    result = evaluate_pool(_spec("stars", chance=chance, forced=[1], min_sum=3, max_sum=23))
    assert result["count"] == 2


def test_star_sum_max_only_eleven_twelve():
    result = evaluate_pool(_spec("stars", min_sum=23, max_sum=23))
    assert result["count"] == 1


def test_threshold_excludes_below():
    chance = {i: 100 for i in range(1, 13)}
    chance[12] = 40
    loose = evaluate_pool(_spec("stars", chance=chance, threshold=1))
    tight = evaluate_pool(_spec("stars", chance=chance, threshold=50))
    assert tight["count"] < loose["count"]
    assert 12 in tight["excluded"]


def test_zero_chance_always_excluded():
    chance = {i: 100 for i in range(1, 13)}
    chance[1] = 0
    result = evaluate_pool(_spec("stars", chance=chance, threshold=0))
    assert 1 in result["excluded"]
    assert result["count"] == 55


def test_dp_matches_brute_on_small_star_bands():
    values = list(range(1, 13))
    for min_sum, max_sum in ((3, 10), (12, 18), (20, 23)):
        for min_even, max_even in ((0, 2), (1, 1), (2, 2)):
            spec = _spec(
                "stars",
                min_sum=min_sum,
                max_sum=max_sum,
                min_even=min_even,
                max_even=max_even,
            )
            got = evaluate_pool(spec)["count"]
            expected = brute(values, 2, min_sum, max_sum, min_even, max_even)
            assert got == expected, (min_sum, max_sum, min_even, max_even, got, expected)


def test_dp_matches_brute_forced_numbers_subset():
    chance = {i: 100 if i <= 12 else 0 for i in range(1, 51)}
    forced = [1, 4]
    spec = _spec(
        "numbers",
        chance=chance,
        forced=forced,
        min_sum=15,
        max_sum=80,
        min_even=1,
        max_even=4,
    )
    got = evaluate_pool(spec)["count"]
    expected = brute(list(range(1, 13)), 5, 15, 80, 1, 4, forced=forced)
    assert got == expected


def test_too_many_forced_is_zero():
    result = evaluate_pool(_spec("stars", forced=[1, 2, 3]))
    assert result["count"] == 0


def test_weighted_mass_scales_when_all_optional_are_half():
    chance = {i: 50 for i in range(1, 13)}
    result = evaluate_pool(_spec("stars", chance=chance))
    assert result["count"] == 66
    assert abs(result["mass"] - 66 * 0.5 * 0.5) < 1e-9


def test_spread_four_is_the_five_runs():
    result = evaluate_pool(_spec("numbers", min_spread=4, max_spread=4))
    assert result["count"] == 46


def test_four_consecutive_pairs_are_the_five_runs():
    result = evaluate_pool(_spec("numbers", min_consecutive=4, max_consecutive=4))
    assert result["count"] == 46


def test_one_ball_per_decade():
    result = evaluate_pool(_spec("numbers", decade_min=[1, 1, 1, 1, 1], decade_max=[1, 1, 1, 1, 1]))
    assert result["count"] == 10**5


def test_star_consecutive_pairs():
    result = evaluate_pool(_spec("stars", min_consecutive=1, max_consecutive=1))
    assert result["count"] == 11


def test_shape_still_respects_sum_band():
    result = evaluate_pool(_spec("numbers", min_spread=4, max_spread=4, min_sum=15, max_sum=15))
    assert result["count"] == 1


def test_grid_survives_even_only_and_rejects_odd():
    from synchro.analysis.jeux import grid_survives

    chance = {i: 100 if i % 2 == 0 else 0 for i in range(1, 51)}
    numbers = _spec("numbers", chance=chance, min_even=5, max_even=5)
    stars = _spec("stars")
    assert grid_survives({"numbers": [2, 4, 6, 8, 10], "stars": [1, 2]}, numbers, stars)
    assert not grid_survives({"numbers": [1, 2, 3, 4, 5], "stars": [1, 2]}, numbers, stars)
