from datetime import date

from synchro.analysis.montecarlo import history_records, montecarlo_report


def test_montecarlo_reproducible_seed():
    draws = [
        {"draw_date": date(2026, 8, 21), "numbers": [1, 2, 3, 4, 5], "stars": [1, 2]},
        {"draw_date": date(2026, 8, 25), "numbers": [1, 6, 7, 8, 9], "stars": [1, 3]},
        {"draw_date": date(2026, 8, 28), "numbers": [1, 10, 11, 12, 13], "stars": [4, 5]},
    ]
    a = montecarlo_report(draws, n_sim=30, seed=0)
    b = montecarlo_report(draws, n_sim=30, seed=0)
    assert a["max_frequency"]["histogram"] == b["max_frequency"]["histogram"]
    obs = history_records(draws)
    assert obs["max_frequency"] == 3
    assert obs["hottest"] == [1]
