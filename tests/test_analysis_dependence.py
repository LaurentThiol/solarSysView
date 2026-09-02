from datetime import date

from synchro.analysis.dependence import dependence_report, pair_matrix
from synchro.analysis.diagnostics import diagnostics_report, hot_backtest


SAMPLE = [
    {"draw_date": date(2026, 8, 21), "numbers": [1, 2, 3, 4, 5], "stars": [1, 2], "weekday": "mardi"},
    {"draw_date": date(2026, 8, 25), "numbers": [1, 6, 7, 8, 9], "stars": [1, 3], "weekday": "vendredi"},
    {"draw_date": date(2026, 8, 28), "numbers": [1, 10, 11, 12, 13], "stars": [4, 5], "weekday": "mardi"},
    {"draw_date": date(2026, 9, 1), "numbers": [2, 3, 4, 5, 6], "stars": [2, 3], "weekday": "mardi"},
]


def test_pairs_see_exact_draws():
    matrix = pair_matrix(SAMPLE)
    assert matrix["draw_count"] == 4
    top = {(e["a"], e["b"]): e["count"] for e in matrix["top_pairs"]}
    assert top[(10, 11)] >= 1
    assert top[(2, 3)] >= 2


def test_dependence_surprise_and_dates():
    report = dependence_report(SAMPLE)
    assert report["draw_count"] == 4
    assert report["from_date"] == "2026-08-21"
    assert report["surprise_top"][0]["date"] in {d["draw_date"].isoformat() for d in SAMPLE}


def test_hot_backtest_length():
    result = hot_backtest(SAMPLE, window=2)
    assert result["n"] == 2
    assert result["expected_random"] == 0.5
    diag = diagnostics_report(SAMPLE, window=2)
    assert diag["draw_count"] == 4
    assert "1" in diag["acf_sum"]
