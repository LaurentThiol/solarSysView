from datetime import date

from synchro.analysis.inference import bh_fdr, inference_report, wilson_interval


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


def test_inference_sees_provided_draws():
    report = inference_report(_uniformish())
    assert report["draw_count"] == 50
    assert report["chi_square"]["df"] == 49
    assert 0 <= report["chi_square"]["pvalue"] <= 1
    assert report["ks_sum"]["n"] == 50
    assert len(report["balls"]) == 50
