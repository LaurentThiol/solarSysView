"""Marges à 95 % du retour et des décalages de nextData."""

from __future__ import annotations

import math
import random

import pytest
from scipy import stats

from synchro.analysis.inference import wilson_interval
from synchro.nextdata.uncertainty import (
    chance_hits,
    chance_hits_mixed,
    hits_law,
    hits_law_mixed,
    mean_interval,
    paired_gap,
    share_interval,
    versus_all,
)

SIGMA = 30.92


def _sums(rng: random.Random, count: int) -> list[float]:
    return [rng.gauss(127.5, SIGMA) for _ in range(count)]


def test_equal_readings_stay_undecided_on_ten_draws() -> None:
    rng = random.Random(22)
    verdicts = []
    for _ in range(400):
        actual = _sums(rng, 10)
        a = [127.5 + rng.gauss(0, 5) - value for value in actual]
        b = [127.5 + rng.gauss(0, 5) - value for value in actual]
        verdicts.append(paired_gap(a, b)["verdict"])
    assert verdicts.count("undecided") / len(verdicts) >= 0.9


def test_a_clearly_better_reading_is_decided() -> None:
    rng = random.Random(23)
    verdicts = []
    for _ in range(400):
        actual = _sums(rng, 10)
        sharp = [rng.gauss(0, 3) for _ in actual]
        flat = [127.5 - value for value in actual]
        verdicts.append(paired_gap(sharp, flat)["verdict"])
    assert verdicts.count("lower") / len(verdicts) >= 0.9

    small = [1.0, -2.0, 0.5, 3.0, -1.0, 2.0, -0.5, 1.5, -3.0, 0.0]
    large = [20.0, -35.0, 18.0, -27.0, 31.0, -22.0, 25.0, -40.0, 16.0, 29.0]
    assert paired_gap(small, large)["verdict"] == "lower"
    assert paired_gap(large, small)["verdict"] == "higher"


def test_the_paired_gap_is_diebold_mariano_with_the_hln_correction() -> None:
    rng = random.Random(5)
    a = [rng.gauss(0, 25) for _ in range(12)]
    b = [rng.gauss(4, 30) for _ in range(12)]
    gap = paired_gap(a, b)
    d = [abs(x) - abs(y) for x, y in zip(a, b)]
    n, h = len(d), 1
    mean = sum(d) / n
    gamma0 = sum((value - mean) ** 2 for value in d) / n
    dm = mean / math.sqrt(gamma0 / n)
    hln = dm * math.sqrt((n + 1 - 2 * h + h * (h - 1) / n) / n)
    assert gap["p"] == pytest.approx(2 * stats.t.sf(abs(hln), n - 1), abs=1e-4)
    assert gap["p"] == pytest.approx(stats.ttest_rel([abs(x) for x in a], [abs(y) for y in b]).pvalue, abs=1e-4)
    assert gap["value"] == pytest.approx(mean, abs=1e-4)
    assert gap["lo"] < gap["value"] < gap["hi"]
    assert gap["count"] == 12


def test_the_paired_gap_skips_missing_draws_and_needs_two_pairs() -> None:
    gap = paired_gap([1.0, None, 3.0, -4.0], [2.0, 5.0, None, 6.0])
    assert gap["count"] == 2
    assert gap["value"] == pytest.approx(((1 - 2) + (4 - 6)) / 2)
    one = paired_gap([3.0, None], [-1.0, 2.0])
    assert one["count"] == 1 and one["lo"] is None and one["verdict"] == "undecided"
    none = paired_gap([None], [1.0])
    assert none["count"] == 0 and none["verdict"] is None
    same = paired_gap([2.0, -3.0, 4.0], [-2.0, 3.0, -4.0])
    assert same["value"] == 0 and same["p"] == 1.0 and same["verdict"] == "undecided"
    with pytest.raises(ValueError):
        paired_gap([1.0, 2.0], [1.0])


def test_versus_skips_the_reading_itself_and_the_twins() -> None:
    errors = {"corpus": [1.0, 2.0, 3.0], "mean": [2.0, 3.0, 4.0], "corpus_persist": [1.0, 2.0, 2.0]}
    versus = versus_all(errors, ["corpus", "mean"])
    assert set(versus) == {"corpus", "mean", "corpus_persist"}
    assert set(versus["corpus"]) == {"mean"}
    assert set(versus["corpus_persist"]) == {"corpus", "mean"}
    assert versus["corpus"]["mean"]["verdict"] == "lower"


@pytest.mark.parametrize("count", [10, 50])
def test_the_mae_interval_covers_the_true_mae_about_95_times_in_100(count: int) -> None:
    rng = random.Random(21)
    true = SIGMA * math.sqrt(2 / math.pi)
    covered = 0
    for _ in range(2000):
        interval = mean_interval((abs(rng.gauss(0, SIGMA)) for _ in range(count)), floor=0.0)
        covered += interval["lo"] <= true <= interval["hi"]
    assert 0.92 <= covered / 2000 <= 0.97


def test_the_mae_interval_never_goes_below_zero() -> None:
    interval = mean_interval([0.0, 0.0, 0.0, 30.0], floor=0.0)
    assert interval["value"] == 7.5
    assert interval["lo"] == 0.0
    assert interval["hi"] > 30
    assert mean_interval([]) == {"value": None, "lo": None, "hi": None, "count": 0}
    assert mean_interval([4.0])["lo"] is None


def test_hit_laws_are_exact_hypergeometric() -> None:
    numbers = hits_law(1, 5, 50)
    stars = hits_law(1, 2, 12)
    assert sum(numbers) == pytest.approx(1.0)
    assert sum(stars) == pytest.approx(1.0)
    assert sum(k * p for k, p in enumerate(numbers)) == pytest.approx(0.5)
    assert sum(k * p for k, p in enumerate(stars)) == pytest.approx(1 / 3)
    assert numbers == pytest.approx([stats.hypergeom.pmf(k, 50, 5, 5) for k in range(6)])
    assert numbers[0] == pytest.approx(math.comb(45, 5) / math.comb(50, 5))

    ten = hits_law(10, 5, 50)
    assert len(ten) == 51
    assert sum(ten) == pytest.approx(1.0)
    mean = sum(k * p for k, p in enumerate(ten))
    assert mean == pytest.approx(5.0)
    variance = sum((k - mean) ** 2 * p for k, p in enumerate(ten))
    assert variance == pytest.approx(10 * 25 * 45 * 45 / (2500 * 49))


def test_chance_hits_gives_the_95_range_and_the_odds_of_doing_as_well() -> None:
    hits = [1, 0, 1, 1, 0, 2, 0, 1, 1, 0]
    chance = chance_hits(hits, slots=5, pool=50)
    assert chance["observed"] == 0.7
    assert chance["expected"] == 0.5
    assert (chance["lo"], chance["hi"]) == (0.1, 0.9)
    law = hits_law(10, 5, 50)
    assert chance["p"] == pytest.approx(sum(law[7:]), abs=1e-4)
    low, high = round(chance["lo"] * 10), round(chance["hi"] * 10)
    assert sum(law[:low]) < 0.025 and sum(law[high + 1 :]) < 0.025
    assert sum(law[low : high + 1]) >= 0.95
    assert chance_hits([0] * 10, slots=5, pool=50)["p"] == 1.0
    assert chance_hits([], slots=5, pool=50) is None
    stars = chance_hits([0, 1] * 25, slots=2, pool=12)
    assert stars["expected"] == 0.3333
    assert stars["lo"] < 1 / 3 < stars["hi"]


def test_star_hit_law_uses_each_historical_pool() -> None:
    pools = (11, 12)
    law = hits_law_mixed(pools, 2)
    expected = ((4 / 11) + (4 / 12)) / 2

    assert sum(law) == pytest.approx(1.0)
    assert sum(total * mass for total, mass in enumerate(law)) / len(pools) == pytest.approx(expected)
    report = chance_hits_mixed([0, 1], slots=2, pools=pools)
    assert report is not None
    assert report["expected"] == pytest.approx(round(expected, 4))
    with pytest.raises(ValueError):
        chance_hits_mixed([0, 1], slots=2, pools=[12])


def test_share_interval_is_the_wilson_interval() -> None:
    assert share_interval(8, 10) == (0.4902, 0.9433)
    _p, lo, hi = wilson_interval(15, 24)
    assert share_interval(15, 24) == (round(lo, 4), round(hi, 4))
    assert share_interval(0, 0) == (None, None)
