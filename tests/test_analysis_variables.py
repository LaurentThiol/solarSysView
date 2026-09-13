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


def test_order_statistics_track_each_number_separately():
    """n1 à n5 : le k-ième plus petit du tirage, pas la k-ième boule sortie."""
    assert series(SAMPLE, "n1")["values"] == [1.0, 1.0, 1.0]
    assert series(SAMPLE, "n3")["values"] == [3.0, 7.0, 11.0]
    assert series(SAMPLE, "n5")["values"] == [5.0, 9.0, 13.0]
    assert series(SAMPLE, "e1")["values"] == [1.0, 1.0, 4.0]
    assert series(SAMPLE, "e2")["values"] == [2.0, 3.0, 5.0]
    # Chaque rang est une courbe distincte : c'est ce qui permet de leur
    # appliquer des règles différentes.
    assert series(SAMPLE, "n1")["values"] != series(SAMPLE, "n5")["values"]


def test_order_statistics_sort_before_reading():
    """La FDJ publie un ensemble : `numbers_of` ne trie pas, la série doit trier."""
    unsorted = [
        {"draw_date": date(2026, 8, 21), "numbers": [42, 8, 27, 44, 3], "stars": [9, 2], "star_pool": 12},
    ]
    assert series(unsorted, "n1")["values"] == [3.0]
    assert series(unsorted, "n3")["values"] == [27.0]
    assert series(unsorted, "n5")["values"] == [44.0]
    assert series(unsorted, "e1")["values"] == [2.0]
    assert series(unsorted, "e2")["values"] == [9.0]


def test_order_statistics_survive_a_truncated_draw():
    """Un tirage amputé ne doit pas casser un export de cent trente-huit courbes."""
    short = [{"draw_date": date(2026, 8, 21), "numbers": [7, 4], "stars": [3], "star_pool": 12}]
    assert series(short, "n5")["values"] == [7.0]
    assert series(short, "e2")["values"] == [3.0]


def test_variable_order_numbers_then_stars():
    from synchro.analysis.variables import VARIABLE_NAMES

    names = list(VARIABLE_NAMES)
    assert names.index("hit") < names.index("star_sum")
    assert names[-3:] == ["e2", "star_delay", "star_hit"]
    assert "centroid" in names
    assert names.index("centroid") < names.index("delay")
    # Les statistiques d'ordre restent du côté des numéros, avant les étoiles.
    assert names.index("n5") < names.index("star_sum")
    assert names.index("e1") > names.index("star_sum")


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
