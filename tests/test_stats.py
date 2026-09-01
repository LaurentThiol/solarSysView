from datetime import date

from synchro.stats import compute_stats


def test_compute_stats_hot_and_delay():
    draws = [
        {"draw_date": date(2026, 8, 21), "numbers": [1, 2, 3, 4, 5], "stars": [1, 2], "star_pool": 12},
        {"draw_date": date(2026, 8, 25), "numbers": [1, 6, 7, 8, 9], "stars": [1, 3], "star_pool": 12},
        {"draw_date": date(2026, 8, 28), "numbers": [1, 10, 11, 12, 13], "stars": [4, 5], "star_pool": 12},
    ]
    stats = compute_stats(draws)
    assert stats["draw_count"] == 3
    hottest = stats["hottest_numbers"][0]
    assert hottest["value"] == 1
    assert hottest["count"] == 3
    five = next(n for n in stats["numbers"] if n["value"] == 5)
    assert five["delay_days"] == 7
    assert stats["sum"]["avg"] == 31.0
