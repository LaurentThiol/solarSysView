from datetime import date

import pytest

from synchro.analysis.balls import ball_board, even_count, parity_report
from synchro.analysis.combinatorics import parity_distribution


SAMPLE = [
    {"draw_date": date(2026, 8, 21), "numbers": [1, 2, 3, 4, 5], "stars": [1, 2], "star_pool": 12, "weekday": "mardi"},
    {"draw_date": date(2026, 8, 25), "numbers": [1, 6, 7, 8, 9], "stars": [1, 3], "star_pool": 12, "weekday": "vendredi"},
    {"draw_date": date(2026, 8, 28), "numbers": [1, 10, 11, 12, 13], "stars": [4, 5], "star_pool": 12, "weekday": "mardi"},
]


def test_parity_law_covers_all_grids():
    law = parity_distribution()
    assert law["total"] == 2_118_760
    assert sum(row["ways"] for row in law["density"]) == 2_118_760
    assert abs(sum(row["p"] for row in law["density"]) - 1.0) < 1e-12
    assert law["density"][2]["label"] == "2p / 3i"


def test_even_count():
    assert even_count([1, 2, 3, 4, 5]) == 2
    assert even_count([2, 4, 6, 8, 10]) == 5


def test_ball_board_per_number():
    board = ball_board(SAMPLE)
    assert board["draw_count"] == 3
    assert board["expected"] == pytest.approx(0.3)
    one = next(b for b in board["balls"] if b["value"] == 1)
    five = next(b for b in board["balls"] if b["value"] == 5)
    fifty = next(b for b in board["balls"] if b["value"] == 50)
    assert one["count"] == 3
    assert one["delay_draws"] == 0
    assert one["last_seen"] == "2026-08-28"
    assert five["count"] == 1
    assert five["delay_draws"] == 2
    assert five["delay_days"] == 7
    assert fifty["count"] == 0
    assert fifty["delay_draws"] == 3
    assert fifty["last_seen"] is None
    assert one["even"] is False
    assert next(b for b in board["balls"] if b["value"] == 2)["even"] is True


def test_parity_report_on_sample():
    report = parity_report(SAMPLE)
    assert report["draw_count"] == 3
    assert report["even_balls"] == 6
    assert report["odd_balls"] == 9
    assert report["expected_even_balls"] == 7.5
    assert report["mean_even"] == 2.0
    two = next(row for row in report["splits"] if row["even"] == 2)
    assert two["count"] == 3
    assert all(row["count"] == 0 for row in report["splits"] if row["even"] != 2)
    assert report["points"][0] == {"date": "2026-08-21", "even": 2, "odd": 3}
