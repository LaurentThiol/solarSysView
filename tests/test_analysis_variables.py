from datetime import date

from synchro.analysis.variables import series
from synchro.analysis.windows import heikin_ashi, ohlc_blocks, rolling_stats


SAMPLE = [
    {"draw_date": date(2026, 8, 21), "numbers": [1, 2, 3, 4, 5], "stars": [1, 2], "star_pool": 12, "weekday": "mardi"},
    {"draw_date": date(2026, 8, 25), "numbers": [1, 6, 7, 8, 9], "stars": [1, 3], "star_pool": 12, "weekday": "vendredi"},
    {"draw_date": date(2026, 8, 28), "numbers": [1, 10, 11, 12, 13], "stars": [4, 5], "star_pool": 12, "weekday": "mardi"},
]


def test_series_reads_exact_draws():
    payload = series(SAMPLE, "sum")
    assert payload["draw_count"] == 3
    assert payload["values"] == [15.0, 31.0, 47.0]
    assert payload["points"][0]["date"] == "2026-08-21"


def test_spread_parity_consecutive():
    payload = series(SAMPLE, "spread")
    assert payload["values"][0] == 4.0
    parity = series(SAMPLE, "parity")
    assert parity["values"][0] == 2.0  # 2,4 even in 1-5
    consec = series(SAMPLE, "consecutive")
    assert consec["values"][0] == 4.0  # 1-2-3-4-5


def test_delay_and_hit():
    delay = series(SAMPLE, "delay", n=5)
    assert delay["values"][0] == 0.0
    assert delay["values"][-1] > 0
    hit = series(SAMPLE, "hit", n=1)
    assert hit["values"] == [1.0, 1.0, 1.0]


def test_star_delay_and_hit():
    hit = series(SAMPLE, "star_hit", n=1)
    assert hit["values"] == [1.0, 1.0, 0.0]
    delay = series(SAMPLE, "star_delay", n=2)
    assert delay["values"] == [0.0, 1.0, 2.0]
    missing = series(SAMPLE, "star_hit", n=12)
    assert missing["values"] == [0.0, 0.0, 0.0]
    star_sum = series(SAMPLE, "star_sum")
    assert star_sum["values"] == [3.0, 4.0, 9.0]


def test_variable_order_numbers_then_stars():
    from synchro.analysis.variables import VARIABLE_NAMES

    names = list(VARIABLE_NAMES)
    assert names.index("hit") < names.index("star_sum")
    assert names[-3:] == ["star_sum", "star_delay", "star_hit"]
    assert "centroid" in names
    assert names.index("centroid") < names.index("delay")


def test_rolling_window_uses_draws():
    stats = rolling_stats(SAMPLE, "sum", window=2)
    assert stats["sample_size"] == 2
    assert stats["last"] == 47.0
    assert stats["coverage"] == 9


def test_ohlc_and_heikin():
    ohlc = ohlc_blocks(SAMPLE, "sum", block="window", window=2)
    assert len(ohlc["candles"]) == 2
    first = ohlc["candles"][0]
    assert first["o"] == 15.0
    assert first["c"] == 31.0
    assert first["h"] == 31.0
    assert first["l"] == 15.0
    ha = heikin_ashi(ohlc["candles"])
    assert len(ha) == 2
    assert ha[0]["style"] == "heikin_ashi"
