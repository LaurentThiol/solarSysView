"""Pulse dans nextData : état causal, même fondamentale, sans le tirage prévu."""

from __future__ import annotations

import math

import numpy as np
import pytest

from synchro.nextdata.covariates import FUTURE_PULSE, future_columns
from synchro.nextdata.forecast import darts_covariate_rows, lag_choice, run_forecast, vector_at
from synchro.nextdata.panel import build_frame
from synchro.nextdata.pulse_features import causal_pulse
from synchro.pulse.model import principal_fit
from tests.test_nextdata import _draws


def _reference(numbers: list[list[int]], stars: list[list[int]], pool: int, prefix: int, index: int) -> dict[str, float]:
    """Même agrégat, calculé boule par boule avec principal_fit."""
    number_lobe = np.zeros(50)
    number_weight = np.zeros(50)
    star_lobe = np.zeros(12)
    star_weight = np.zeros(12)
    for ball in range(1, 51):
        hits = np.asarray([1.0 if ball in draw else 0.0 for draw in numbers[:prefix]], dtype=float)
        fit = principal_fit(hits)
        if fit["period"] is None:
            continue
        number_weight[ball - 1] = float(fit["concordance"])
        wave = math.cos(2.0 * math.pi * (index / float(fit["period"]) - float(fit["phase"])))
        if wave > 0.0:
            number_lobe[ball - 1] = 1.0
    star_count = max(0, min(12, int(pool)))
    for star in range(1, 13):
        hits = np.asarray([1.0 if star in draw else 0.0 for draw in stars[:prefix]], dtype=float)
        fit = principal_fit(hits)
        if fit["period"] is None:
            continue
        star_weight[star - 1] = float(fit["concordance"])
        wave = math.cos(2.0 * math.pi * (index / float(fit["period"]) - float(fit["phase"])))
        if wave > 0.0:
            star_lobe[star - 1] = 1.0
    kept = slice(0, star_count)
    return {
        "pulse_lobe": float(number_lobe.mean()),
        "pulse_mass": float((number_weight * number_lobe).mean()),
        "star_pulse_lobe": float(star_lobe[kept].mean()) if star_count else 0.0,
        "star_pulse_mass": float((star_weight[kept] * star_lobe[kept]).mean()) if star_count else 0.0,
    }


def test_prefix_state_matches_principal_fit() -> None:
    draws = _draws(36, seed=3)
    frame = build_frame(draws, focus=24)
    numbers = [row["numbers"] for row in frame.rows]
    stars = [row["stars"] for row in frame.rows]
    for index in (12, 24, len(frame.rows) - 1):
        got = frame.rows[index]
        ref = _reference(numbers, stars, 12, index, index)
        ahead = _reference(numbers, stars, 12, index, index + 1)
        for name in FUTURE_PULSE:
            assert got[name] == pytest.approx(ref[name], abs=1e-9)
            assert got[f"{name}_ahead"] == pytest.approx(ahead[name], abs=1e-9)
    horizon = _reference(numbers, stars, frame.star_pool, len(numbers), len(numbers))
    followed = _reference(numbers, stars, frame.star_pool, len(numbers), len(numbers) + 1)
    for name in FUTURE_PULSE:
        assert frame.horizon[0][name] == pytest.approx(horizon[name], abs=1e-9)
        assert frame.horizon[1][name] == pytest.approx(followed[name], abs=1e-9)
        assert frame.horizon[0][f"{name}_ahead"] == pytest.approx(frame.horizon[1][name], abs=1e-9)


def test_a_draw_does_not_change_the_state_known_before_it() -> None:
    draws = _draws(40, seed=7)
    frame = build_frame(draws, focus=24)
    changed = [dict(row) for row in draws]
    changed[-1] = {**changed[-1], "numbers": [1, 2, 3, 4, 5], "stars": [1, 2]}
    other = build_frame(changed, focus=24)
    for left, right in zip(frame.rows, other.rows):
        for name in FUTURE_PULSE:
            assert left[name] == right[name]
            assert left[f"{name}_ahead"] == right[f"{name}_ahead"]
    assert any(frame.horizon[0][name] != other.horizon[0][name] for name in FUTURE_PULSE)


def test_stars_outside_the_urn_stay_out_of_the_share() -> None:
    numbers = []
    stars = []
    for index in range(32):
        numbers.append([1, 2, 3, 4, 5])
        stars.append([11, 12] if index % 4 == 0 else [2, 3])
    narrow = causal_pulse(numbers, stars, [9] * 34)
    wide = causal_pulse(numbers, stars, [12] * 34)
    assert narrow[28]["star_pulse_lobe"] == pytest.approx(_reference(numbers, stars, 9, 28, 28)["star_pulse_lobe"])
    assert wide[28]["star_pulse_lobe"] == pytest.approx(_reference(numbers, stars, 12, 28, 28)["star_pulse_lobe"])
    assert wide[28]["star_pulse_lobe"] > narrow[28]["star_pulse_lobe"]


def test_lightgbm_forward_pulse_does_not_read_the_refit() -> None:
    frame = build_frame(_draws(48, seed=4), focus=24)
    rows = frame.rows
    lags, past_lags = lag_choice(len(rows))
    differing = [
        index
        for index in range(lags, len(rows) - 1)
        if abs(rows[index]["pulse_lobe_ahead"] - rows[index + 1]["pulse_lobe"]) > 1e-6
    ]
    assert differing
    index = differing[0]
    values, names = vector_at(
        rows,
        frame.horizon,
        index,
        lags=lags,
        past_lags=past_lags,
        past_names=[],
        future_names=future_columns(["pulse"]),
    )
    for name in FUTURE_PULSE:
        ahead = names.index(f"fut:{name}:1")
        current = names.index(f"fut:{name}:0")
        assert values[current] == pytest.approx(rows[index][name])
        assert values[ahead] == pytest.approx(rows[index][f"{name}_ahead"])
    forward = names.index("fut:pulse_lobe:1")
    assert abs(values[forward] - rows[index + 1]["pulse_lobe"]) > 1e-6


def test_darts_reads_pulse_one_step_back_and_keeps_it_out_of_the_future() -> None:
    frame = build_frame(_draws(30, seed=5), focus=24)
    past_names, past_rows, clocks, future_rows = darts_covariate_rows(
        frame.rows,
        frame.horizon,
        ["spread"],
        ["lunar_sin", *FUTURE_PULSE],
    )
    assert "pulse_lobe" not in clocks
    assert "lunar_sin" in clocks
    assert past_names[-4:] == list(FUTURE_PULSE)
    for index, row in enumerate(frame.rows[:-1]):
        assert past_rows[index]["pulse_lobe"] == frame.rows[index + 1]["pulse_lobe"]
        assert past_rows[index]["spread"] == row["spread"]
    assert past_rows[-1]["pulse_lobe"] == frame.horizon[0]["pulse_lobe"]
    assert all("pulse_lobe" not in item for item in future_rows)


def test_forecast_and_training_accept_the_pulse_family() -> None:
    from synchro.nextdata.forecast import run_training

    draws = _draws(40, seed=11)
    forecast = run_forecast(draws, focus=24, covariates=["pulse"], estimators=2, chunk=100)
    assert forecast["ok"] is True
    assert forecast["covariates"] == ["pulse"]
    assert set(forecast["pulse"]) == {"lobe", "mass", "star_lobe", "star_mass"}
    assert 0.0 <= forecast["pulse"]["lobe"] <= 1.0
    training = run_training(draws, focus=24, covariates=["pulse"], estimators=2, shift=1)
    assert training["ok"] is True
    assert training["shifts"]
    assert set(training["shifts"][0]["pulse"]) == {"lobe", "mass", "star_lobe", "star_mass"}
    assert training["pulse"] == training["shifts"][-1]["pulse"]
