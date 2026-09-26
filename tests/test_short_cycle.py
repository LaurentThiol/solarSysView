"""Cycle court : étendue, occupation, STFT, arche chartiste."""

from __future__ import annotations

import numpy as np

from synchro.chartisme.scan import scan_curve
from synchro.chartisme.sense import name_short_sense, sense_sentence
from synchro.cycles.registry import figure_occupancy, short_cycle_band
from synchro.harmo.spectrum import welch_psd
from synchro.harmo.tf import short_cycle_peaks
from synchro.short_cycle import SHORT_CYCLE_MAX, SHORT_CYCLE_MIN, local_range, short_residual


def _slow_with_arch() -> tuple[list[float], int, int, float]:
    """Rampe lente, puis une descente de 4 pas. L'arche courte est le creux."""
    values = [index * 0.01 for index in range(40)]
    start = 20
    depth = 10.0
    for step in range(1, 5):
        values[start + step] = values[start] - depth * step / 4
    return values, start, start + 4, depth


def test_local_range_is_max_minus_min() -> None:
    values = [1.0, 3.0, 2.0, 8.0, 5.0]
    assert local_range(values, 4, 4) == 6.0
    assert local_range(values, 4, 8) == 7.0
    assert SHORT_CYCLE_MIN == 4
    assert SHORT_CYCLE_MAX == 8


def test_short_arch_is_not_washed_by_a_slow_sigma() -> None:
    values, start, end, height = _slow_with_arch()
    court, period, extent, _phase = short_cycle_band(values)
    long, _long_period = figure_occupancy(values)
    assert court[start + 2] == 1.0
    assert long[start + 2] == 0.0
    assert extent[start + 2] == height
    assert period == 4.0
    assert court[end] == 1.0
    assert long[10] == 1.0
    assert court[10] == 0.0

    residual = short_residual(values)
    assert abs(float(residual[end])) >= 0.5

    slow = np.asarray(values[:start], dtype=float)
    sigma = float(slow.std(ddof=1))
    assert sigma * 5 < height


def test_short_stft_keeps_a_burst_the_welch_does_not_dominate() -> None:
    length = 256
    index = np.arange(length)
    slow = np.sin(2 * np.pi * index / 40.0)
    burst = np.zeros(length)
    burst[100:120] = np.sin(2 * np.pi * np.arange(20) / 6.0)
    series = slow + 1.5 * burst
    peaks = short_cycle_peaks(series, draws_per_year=104.0)
    assert peaks
    assert all(peak["band"] == "court" for peak in peaks)
    assert any(SHORT_CYCLE_MIN <= float(peak["period_draws"]) <= SHORT_CYCLE_MAX for peak in peaks)

    freqs, power = welch_psd(series)
    body = power.copy()
    body[0] = 0.0
    dominant = float(freqs[int(np.argmax(body))])
    period = 1.0 / dominant if dominant > 0 else None
    assert period is not None
    assert not (SHORT_CYCLE_MIN <= period <= SHORT_CYCLE_MAX)


def test_scale_8_records_an_arch_and_scale_30_records_no_figure() -> None:
    """Une marche de 6 tirages est une arche. Deux pivots, à l'échelle 30, ne font pas une figure."""
    height = 12.0
    values = [10.0] * 40
    for step in range(7):
        values[16 + step] = 10.0 + step * 2.0
    for index in range(23, len(values)):
        values[index] = 10.0 + height
    dates = [f"2024-01-{day:02d}" for day in range(1, len(values) + 1)]
    activity = [0.0] + [abs(values[index] - values[index - 1]) for index in range(1, len(values))]
    curve = {
        "id": "sum",
        "variable": "sum",
        "values": values,
        "dates": dates,
        "activity": activity,
    }
    arches = scan_curve(curve, scales=(8,), min_confidence=0.0)
    figures = scan_curve(curve, scales=(30,), min_confidence=0.0)
    wave = next(hit for hit in arches if hit["to_index"] - hit["from_index"] == 6)
    assert wave["figure"] == "arche"
    assert wave["scale"] == 8
    assert wave["range"] == height
    assert wave["activity_period"] == 8
    assert figures == []


def test_short_band_and_candles_sit_beside_the_slow_window() -> None:
    from datetime import date

    from synchro.analysis.windows import ohlc_blocks, rolling_stats

    draws = [
        {
            "draw_date": date(2024, 1, day),
            "numbers": [1, 2, 3, 4, 10 + day],
            "stars": [1, 2],
            "star_pool": 12,
        }
        for day in range(1, 17)
    ]
    stats = rolling_stats(draws, "sum", window=20)
    assert "zscore" not in stats["short"]
    assert stats["short"]["span"] == SHORT_CYCLE_MAX
    assert stats["short"]["sample_size"] == SHORT_CYCLE_MAX
    assert stats["short"]["range"] == 7
    candles = ohlc_blocks(draws, "sum", block="short")
    assert [candle["count"] for candle in candles["candles"]] == [8, 8]
    assert candles["window"] == SHORT_CYCLE_MAX


def test_short_sense_uses_extent_not_series_sigma() -> None:
    values = [0.0, 1.0, 3.0, 2.0, 1.0, 0.0]
    named = name_short_sense(values, 4.0)
    assert named is not None
    assert named["band"] == "court"
    assert named["extent"] == named["sigma"]
    assert named["reference"] == 4.0
    assert "étendue" in sense_sentence(named)
    assert name_short_sense(values[:3], 4.0) is None
    assert name_short_sense(values + [0.0, 0.0, 0.0], 4.0) is None
