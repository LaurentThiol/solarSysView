import math
from datetime import date

from synchro.analysis.inference import (
    bh_fdr,
    binom_two_sided,
    frequency_chi_scale,
    inference_report,
    mann_whitney,
    wilson_interval,
)


def _uniformish():
    draws = []
    for i in range(50):
        nums = [((i + k) % 50) + 1 for k in range(5)]
        draws.append(
            {
                "draw_date": date(2024, 1, 1 + (i % 28)),
                "weekday": "mardi" if i % 2 == 0 else "vendredi",
                "numbers": nums,
                "stars": [1, 2],
                "star_pool": 12,
            }
        )
    return draws


def test_wilson_contains_p0_on_balanced():
    p, lo, hi = wilson_interval(5, 50)
    assert lo <= 0.1 <= hi
    assert abs(p - 0.1) < 1e-9


def test_bh_fdr_none_when_flat():
    flags = bh_fdr([0.8] * 50)
    assert not any(flags)


def test_binom_two_sided_is_the_exact_tail_sum():
    # 5 succès sur 20, p0 = 0,1 : la queue doublée disait 0,086, l'exact dit 0,043.
    assert math.isclose(binom_two_sided(5, 20, 0.1), 0.04317449528446351, rel_tol=1e-9)
    assert math.isclose(binom_two_sided(10, 100, 0.1), 1.0, abs_tol=1e-12)


def test_frequency_chi_square_uses_the_without_replacement_factor():
    assert math.isclose(frequency_chi_scale(50, 5), 49 / 45)
    assert math.isclose(frequency_chi_scale(12, 2), 11 / 10)


def test_mann_whitney_shrinks_variance_when_values_tie():
    result = mann_whitney([1, 2, 2], [2, 3, 3])
    assert math.isclose(result["u"], 1.0)
    assert math.isclose(result["z"], (1.0 - 4.5) / math.sqrt(4.5), rel_tol=1e-9)


def test_inference_sees_provided_draws():
    report = inference_report(_uniformish())
    assert report["draw_count"] == 50
    assert report["chi_square"]["df"] == 49
    assert math.isclose(report["chi_square"]["scale"], 49 / 45)
    assert math.isclose(report["chi_square"]["stat"], report["chi_square"]["raw"] * 49 / 45)
    assert 0 <= report["chi_square"]["pvalue"] <= 1
    assert report["ks_sum"]["n"] == 50
    assert len(report["balls"]) == 50
