from datetime import date

from pytest import approx

from synchro.analysis.inference import chi_square_uniform
from synchro.analysis.tech import fib_levels, ichimoku, pivots_classic, position_size, vwap
from synchro.analysis.windowing import resolve_window, slice_series


def _draw(day: int, numbers: list[int], star_pool: int = 12) -> dict:
    return {
        "draw_date": date(2026, 1, day),
        "weekday": "mardi" if day % 2 else "vendredi",
        "numbers": numbers,
        "stars": [1, 2],
        "star_pool": star_pool,
    }


DRAWS = [
    _draw(2, [1, 2, 3, 4, 5], 11),
    _draw(6, [2, 3, 4, 5, 6], 12),
    _draw(9, [3, 4, 5, 6, 7], 12),
    _draw(13, [4, 5, 6, 7, 8], 12),
    _draw(16, [5, 6, 7, 8, 9], 12),
    _draw(20, [6, 7, 8, 9, 10], 12),
]


def test_last_n_and_warmup():
    resolved = resolve_window(DRAWS, preset="last_20", last_n=3, warmup=2)
    assert resolved["draw_count"] == 3
    assert resolved["warmup_count"] == 2
    assert resolved["from_date"] == "2026-01-13"
    assert resolved["to_date"] == "2026-01-20"
    assert slice_series([0, 1, 2, 3, 4], 2) == [2, 3, 4]


def test_warmup_excluded_from_chi_square():
    resolved = resolve_window(DRAWS, preset="last_20", last_n=3, warmup=2)
    chi_work = chi_square_uniform(resolved["work"])
    chi_full = chi_square_uniform(resolved["with_warmup"])
    assert chi_work["stat"] != chi_full["stat"]
    assert chi_work["expected_per_ball"] == approx(3 * 5 / 50)


def test_star_pool_break():
    resolved = resolve_window(DRAWS, preset="all", warmup=0)
    assert resolved["star_pool_break"] is True
    formula = resolve_window(DRAWS, preset="formula", warmup=0)
    assert formula["star_pool_break"] is False
    assert formula["draw_count"] == 5


def test_custom_dates():
    resolved = resolve_window(
        DRAWS, preset="custom", from_date="2026-01-09", to_date="2026-01-16", warmup=1
    )
    assert resolved["draw_count"] == 3
    assert resolved["warmup_count"] == 1


def test_year_n1_is_previous_calendar_year():
    rows = [
        {
            "draw_date": date(2025, 6, 3),
            "weekday": "mardi",
            "numbers": [1, 2, 3, 4, 5],
            "stars": [1, 2],
            "star_pool": 12,
        },
        {
            "draw_date": date(2025, 12, 30),
            "weekday": "mardi",
            "numbers": [6, 7, 8, 9, 10],
            "stars": [1, 2],
            "star_pool": 12,
        },
        {
            "draw_date": date(2026, 1, 2),
            "weekday": "vendredi",
            "numbers": [11, 12, 13, 14, 15],
            "stars": [1, 2],
            "star_pool": 12,
        },
        {
            "draw_date": date(2026, 3, 3),
            "weekday": "mardi",
            "numbers": [16, 17, 18, 19, 20],
            "stars": [1, 2],
            "star_pool": 12,
        },
    ]
    previous = resolve_window(rows, preset="year_n1", warmup=0)
    assert previous["draw_count"] == 2
    assert previous["from_date"] == "2025-06-03"
    assert previous["to_date"] == "2025-12-30"
    current = resolve_window(rows, preset="year", warmup=0)
    assert current["from_date"] == "2026-01-02"
    assert current["to_date"] == "2026-03-03"


def test_vwap_resets_on_window():
    candles = [
        {"o": 10, "h": 12, "l": 9, "c": 11, "count": 1},
        {"o": 11, "h": 20, "l": 10, "c": 18, "count": 1},
        {"o": 18, "h": 19, "l": 17, "c": 18, "count": 1},
    ]
    vol = [1.0, 1.0, 1.0]
    full = vwap(candles, vol)
    work = vwap(candles[1:], vol[1:])
    assert full[-1] != work[-1]


def test_pivots_and_position_size_and_fib():
    piv = pivots_classic(110, 100, 105)
    assert abs(piv["P"] - 105) < 1e-9
    assert abs(piv["R1"] - 110) < 1e-9
    assert position_size(20_000, 0.01, 100, 96) == 50
    fib = fib_levels(100, 200, bullish=True)
    assert abs(fib["retracements"]["0.5"] - 150) < 1e-9


def test_ichimoku_lengths_and_chikou_shift():
    candles = [
        {"o": float(i), "h": float(i + 2), "l": float(i - 2), "c": float(i), "count": 1}
        for i in range(80)
    ]
    pack = ichimoku(candles, tenkan=9, kijun=26, senkou=52)
    assert len(pack["tenkan"]) == 80
    assert pack["chikou"][0] == candles[26]["c"]
    assert pack["chikou"][-1] is None
