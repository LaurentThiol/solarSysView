"""Calibrage conforme des bandes 10–90 de nextData."""

from __future__ import annotations

import random

from synchro.nextdata.conformal import MIN_STEPS, calibrate, coverage, edge, field_bounds


def _pair(rng: random.Random) -> tuple[dict, dict]:
    """Bande 112–143 autour de 127,5 pour une somme d’écart-type 31 : elle ne couvre qu’un tirage sur trois."""
    return {"sum": {"lo": 112.0, "mid": 127.5, "hi": 143.0}}, {"sum": 127.5 + rng.gauss(0, 31)}


def test_edge_takes_the_conformal_rank() -> None:
    assert edge(range(MIN_STEPS - 1)) is None
    assert edge(range(9)) == 8
    assert edge(range(50)) == 45
    assert edge([3.0, -1.0, 2.0, 0.5, 7.0, 4.0, -2.0, 1.0, 6.0, 5.0]) == 7.0
    assert edge([float(value) for value in range(20)]) == 18.0


def test_calibrated_band_covers_eight_draws_in_ten_on_average() -> None:
    rng = random.Random(3)
    hits = []
    for _ in range(600):
        history = [_pair(rng) for _ in range(50)]
        view, info = calibrate(history[0][0], history)
        _view, actual = _pair(rng)
        hits.append(view["sum"]["lo"] <= actual["sum"] <= view["sum"]["hi"])
        assert info["calibrated"] is True
        assert info["steps"] == 50
    assert 0.78 <= sum(hits) / len(hits) <= 0.86


def test_a_band_too_wide_is_narrowed_and_bounds_hold() -> None:
    rng = random.Random(4)
    history = [({"sum": {"lo": 20.0, "mid": 127.5, "hi": 235.0}}, {"sum": 127.5 + rng.gauss(0, 5)}) for _ in range(40)]
    view, info = calibrate({"sum": {"lo": 20.0, "mid": 127.5, "hi": 235.0}}, history)
    assert info["edges"]["sum"]["down"] < 0
    assert info["edges"]["sum"]["up"] < 0
    assert 100 < view["sum"]["lo"] <= 127.5 <= view["sum"]["hi"] < 150

    flat = [({"n5": {"lo": 40.0, "mid": 44.0, "hi": 46.0}}, {"n5": 50.0}) for _ in range(20)]
    moved, _ = calibrate({"n5": {"lo": 40.0, "mid": 44.0, "hi": 46.0}}, flat)
    assert moved["n5"]["hi"] == field_bounds("n5")[1] == 50
    assert field_bounds("e2", 12) == (2.0, 12.0)


def test_short_history_keeps_the_raw_band() -> None:
    rng = random.Random(5)
    history = [_pair(rng) for _ in range(MIN_STEPS - 1)]
    raw = {"sum": {"lo": 112.0, "mid": 127.5, "hi": 143.0}}
    view, info = calibrate(raw, history)
    assert view == raw
    assert info["calibrated"] is False


def test_coverage_is_measured_out_of_sample() -> None:
    rates = []
    for seed in range(30):
        rng = random.Random(100 + seed)
        measured = coverage([_pair(rng) for _ in range(120)])["sum"]
        assert measured["raw_count"] == 120
        assert measured["calibrated_count"] == 120 - MIN_STEPS
        assert measured["raw"] < 0.6
        rates.append(measured["calibrated"])
    assert 0.77 <= sum(rates) / len(rates) <= 0.87
