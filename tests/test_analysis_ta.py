from pytest import approx

from synchro.analysis.ta import atr, bollinger, ema, indicators, macd, rsi, sma
from synchro.analysis.tech import wma


def test_sma_known_window():
    values = [1.0, 2.0, 3.0, 4.0, 5.0]
    assert sma(values, 3) == [None, None, 2.0, 3.0, 4.0]


def test_ema_seeds_from_sma():
    values = [1.0, 2.0, 3.0, 4.0, 5.0]
    line = ema(values, 3)
    assert line[:3] == [None, None, 2.0]
    assert line[3] == 3.0
    assert line[4] == 4.0


def test_rsi_wilder_period_two():
    values = [10.0, 12.0, 11.0, 13.0]
    line = rsi(values, 2)
    assert line[0] is None
    assert line[1] is None
    assert line[2] == approx(100.0 - 100.0 / 3.0)
    assert line[3] == approx(100.0 - 100.0 / 7.0)


def test_rsi_all_gains_is_100():
    values = [float(i) for i in range(1, 17)]
    line = rsi(values, 14)
    assert line[14] == 100.0
    assert line[15] == 100.0


def test_rsi_all_losses_is_zero():
    values = [float(i) for i in range(16, 0, -1)]
    line = rsi(values, 14)
    assert line[14] == 0.0


def test_bollinger_middle_is_sma():
    values = [10.0, 12.0, 11.0, 13.0, 15.0, 14.0]
    bands = bollinger(values, period=3, k=2.0)
    assert bands["middle"] == sma(values, 3)
    assert bands["upper"][2] > bands["middle"][2] > bands["lower"][2]


def test_macd_histogram_is_line_minus_signal():
    values = [float(i % 7 + 10) for i in range(40)]
    pack = macd(values, fast=3, slow=6, signal=3)
    for line, signal, hist in zip(pack["line"], pack["signal"], pack["histogram"]):
        if signal is None:
            assert hist is None
            continue
        assert line is not None
        assert hist == approx(line - signal)


def test_atr_widens_with_range():
    candles = [
        {"o": 10, "h": 11, "l": 9, "c": 10},
        {"o": 10, "h": 12, "l": 8, "c": 11},
        {"o": 11, "h": 20, "l": 5, "c": 12},
    ]
    line = atr(candles, period=2)
    assert line[0] is None
    assert line[1] is not None
    assert line[2] is not None
    assert line[2] > line[1]


def test_indicators_disclaimer_and_lasts():
    values = [float(i % 9 + 20) for i in range(30)]
    candles = [{"o": v, "h": v + 2, "l": v - 2, "c": v} for v in values]
    payload = indicators(values, candles, sma_period=5, ema_period=5, bb_period=5)
    assert "indépendant" in payload["disclaimer"]
    assert payload["last"]["sma"] is not None
    assert payload["last"]["rsi"] is not None
    assert payload["last"]["atr"] is not None
    assert len(payload["rsi"]) == 30


def test_atr_period_clamps_to_available_candles():
    candles = [{"o": float(i), "h": float(i + 1), "l": float(i - 1), "c": float(i)} for i in range(8)]
    payload = indicators([c["c"] for c in candles], candles)
    assert payload["periods"]["atr"] == 8
    assert payload["last"]["atr"] is not None


def test_wma_linear_weights():
    values = [1.0, 2.0, 3.0]
    line = wma(values, 3)
    assert line[:2] == [None, None]
    assert line[2] == (1 * 1 + 2 * 2 + 3 * 3) / 6
