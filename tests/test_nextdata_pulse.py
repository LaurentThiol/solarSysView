"""Pulse dans nextData : une onde par numéro, sans le tirage prévu."""

from __future__ import annotations

import math

import numpy as np
import pytest

from synchro.nextdata.covariates import FUTURE_PULSE, future_columns
from synchro.nextdata.forecast import run_forecast
from synchro.nextdata.models import darts_covariate_rows, lag_choice, vector_at
from synchro.nextdata.panel import build_frame
from synchro.nextdata.pulse_features import BALL_BASE, STAR_DRAWN, causal_pulse
from synchro.pulse.model import principal_fit
from tests.test_nextdata import _draws


def _pi_of(hits: np.ndarray, prefix: int, index: int, base: float) -> tuple[float, float, int]:
    """π, p et période lus à `index` sur les seules présences [:prefix]."""
    window = np.asarray(hits[:prefix], dtype=float)
    fit = principal_fit(window)
    if fit["period"] is None:
        return base, 1.0, 0
    period = int(fit["period"])
    phase = float(fit["phase"])
    positive = math.cos(2.0 * math.pi * (index / float(period) - phase)) > 0.0
    pos_hits = 0
    pos_times = 0
    for time in range(prefix):
        if math.cos(2.0 * math.pi * (time / float(period) - phase)) > 0.0:
            pos_times += 1
            pos_hits += int(window[time] > 0.5)
    neg_times = prefix - pos_times
    neg_hits = int(np.sum(window > 0.5)) - pos_hits
    if positive:
        rate = (pos_hits / pos_times) if pos_times else base
    else:
        rate = (neg_hits / neg_times) if neg_times else base
    probability = float(fit["p"])
    return probability * base + (1.0 - probability) * rate, probability, period


def _ball_hits(numbers: list[list[int]], ball: int) -> np.ndarray:
    return np.asarray([1.0 if ball in draw else 0.0 for draw in numbers], dtype=float)


def _star_hits(stars: list[list[int]], star: int) -> np.ndarray:
    return np.asarray([1.0 if star in draw else 0.0 for draw in stars], dtype=float)


def test_each_number_matches_its_own_principal_fit() -> None:
    draws = _draws(36, seed=3)
    frame = build_frame(draws, focus=24)
    numbers = [row["numbers"] for row in frame.rows]
    stars = [row["stars"] for row in frame.rows]
    for index in (12, 24, len(frame.rows) - 1):
        row = frame.rows[index]
        for ball in (1, 17, 40, 50):
            pi, probability, period = _pi_of(_ball_hits(numbers, ball), index, index, BALL_BASE)
            slot = ball - 1
            assert row["pulse_pi"][slot] == pytest.approx(pi, abs=1e-9)
            assert row["pulse_p"][slot] == pytest.approx(probability, abs=1e-9)
            assert row["pulse_period"][slot] == period
        for star in (1, 12):
            pi, probability, period = _pi_of(_star_hits(stars, star), index, index, STAR_DRAWN / 12)
            slot = star - 1
            assert row["star_pulse_pi"][slot] == pytest.approx(pi, abs=1e-9)
            assert row["star_pulse_p"][slot] == pytest.approx(probability, abs=1e-9)
            assert row["star_pulse_period"][slot] == period
    horizon_index = len(numbers)
    for ball in (7, 17):
        pi, _probability, _period = _pi_of(_ball_hits(numbers, ball), horizon_index, horizon_index, BALL_BASE)
        followed, _, _ = _pi_of(_ball_hits(numbers, ball), horizon_index, horizon_index + 1, BALL_BASE)
        assert frame.horizon[0]["pulse_pi"][ball - 1] == pytest.approx(pi, abs=1e-9)
        assert frame.horizon[1]["pulse_pi"][ball - 1] == pytest.approx(followed, abs=1e-9)
    for name in FUTURE_PULSE:
        assert frame.horizon[0][f"{name}_ahead"] == pytest.approx(frame.horizon[1][name], abs=1e-9)


def test_swapping_two_numbers_swaps_only_their_pulse() -> None:
    numbers = []
    stars = []
    for index in range(40):
        lead = 17 if index % 2 == 0 else 40
        numbers.append([lead, 1, 2, 3, 4])
        stars.append([1, 2])
    pools = [12] * 42
    direct = causal_pulse(numbers, stars, pools)
    swapped_numbers = [[40 if ball == 17 else 17 if ball == 40 else ball for ball in draw] for draw in numbers]
    swapped = causal_pulse(swapped_numbers, stars, pools)
    index = 30
    assert direct[index]["pulse_pi"][16] != pytest.approx(direct[index]["pulse_pi"][39])
    assert swapped[index]["pulse_pi"][16] == pytest.approx(direct[index]["pulse_pi"][39])
    assert swapped[index]["pulse_pi"][39] == pytest.approx(direct[index]["pulse_pi"][16])
    assert swapped[index]["pulse_period"][16] == direct[index]["pulse_period"][39]
    for slot in range(50):
        if slot in (16, 39):
            continue
        assert swapped[index]["pulse_pi"][slot] == pytest.approx(direct[index]["pulse_pi"][slot])
        assert swapped[index]["pulse_period"][slot] == direct[index]["pulse_period"][slot]


def test_a_draw_does_not_change_the_state_known_before_it() -> None:
    draws = _draws(40, seed=7)
    frame = build_frame(draws, focus=24)
    changed = [dict(row) for row in draws]
    changed[-1] = {**changed[-1], "numbers": [1, 2, 3, 4, 5], "stars": [1, 2]}
    other = build_frame(changed, focus=24)
    for left, right in zip(frame.rows, other.rows):
        assert left["pulse_pi"] == pytest.approx(right["pulse_pi"])
        assert left["star_pulse_pi"] == pytest.approx(right["star_pulse_pi"])
        for name in FUTURE_PULSE:
            assert left[name] == right[name]
            assert left[f"{name}_ahead"] == right[f"{name}_ahead"]
    assert frame.horizon[0]["pulse_pi"] != pytest.approx(other.horizon[0]["pulse_pi"])


def test_stars_outside_the_urn_stay_out_of_the_named_pair() -> None:
    numbers = []
    stars = []
    for index in range(36):
        numbers.append([1, 2, 3, 4, 5])
        stars.append([1, 12] if index % 2 == 0 else [2, 3])
    narrow = causal_pulse(numbers, stars, [9] * 38)
    wide = causal_pulse(numbers, stars, [12] * 38)
    assert narrow[20]["star_pulse_period"] == wide[20]["star_pulse_period"]
    chosen = next(
        index
        for index, state in enumerate(wide)
        if 12 in {int(state["star_pulse_1"]), int(state["star_pulse_2"])}
    )
    assert all(1 <= int(narrow[chosen][name]) <= 9 for name in ("star_pulse_1", "star_pulse_2"))


def test_lightgbm_forward_pulse_does_not_read_the_refit() -> None:
    frame = build_frame(_draws(48, seed=4), focus=24)
    rows = frame.rows
    lags, past_lags = lag_choice(len(rows))
    differing = [
        index
        for index in range(lags, len(rows) - 1)
        if any(abs(rows[index][f"{name}_ahead"] - rows[index + 1][name]) > 1e-6 for name in FUTURE_PULSE)
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
    moved = next(name for name in FUTURE_PULSE if abs(rows[index][f"{name}_ahead"] - rows[index + 1][name]) > 1e-6)
    forward = names.index(f"fut:{moved}:1")
    assert abs(values[forward] - rows[index + 1][moved]) > 1e-6


def test_darts_reads_pulse_one_step_back_and_keeps_it_out_of_the_future() -> None:
    frame = build_frame(_draws(30, seed=5), focus=24)
    past_names, past_rows, clocks, future_rows = darts_covariate_rows(
        frame.rows,
        frame.horizon,
        ["spread"],
        ["lunar_sin", *FUTURE_PULSE],
    )
    assert "lunar_sin" in clocks
    for name in FUTURE_PULSE:
        assert name not in clocks
    assert past_names[-len(FUTURE_PULSE) :] == list(FUTURE_PULSE)
    probe = "pulse_pi_1"
    for index, row in enumerate(frame.rows[:-1]):
        assert past_rows[index][probe] == frame.rows[index + 1][probe]
        assert past_rows[index]["spread"] == row["spread"]
    assert past_rows[-1][probe] == frame.horizon[0][probe]
    assert all(probe not in item for item in future_rows)


def test_chronos_pulse_at_an_interior_step_is_known_before_the_draw() -> None:
    from synchro.nextdata.models import chronos_inputs
    from synchro.nextdata.steps import horizon_of

    draws = _draws(40, seed=8)
    frame = build_frame(draws, focus=24)
    rows = frame.rows
    t = len(rows) - 3
    before = chronos_inputs(rows[:t], horizon_of(frame, t), 24, ("pulse",))
    future = before[0]["future_covariates"]
    past = before[0]["past_covariates"]
    for name in FUTURE_PULSE:
        assert float(future[name][0]) == pytest.approx(rows[t][name])
        assert float(past[name][-1]) == pytest.approx(rows[t - 1][name])
    changed = [dict(row) for row in draws]
    changed[t] = {**changed[t], "numbers": [1, 2, 3, 4, 5], "stars": [1, 2]}
    other = build_frame(changed, focus=24)
    assert other.rows[t]["pulse_pi"] == pytest.approx(rows[t]["pulse_pi"])
    again = chronos_inputs(other.rows[:t], horizon_of(other, t), 24, ("pulse",))
    assert float(again[0]["future_covariates"]["pulse_pi_1"][0]) == pytest.approx(rows[t]["pulse_pi_1"])


def test_the_beam_follows_the_number_not_the_sum() -> None:
    from synchro.nextdata.project import beam, score_grid

    def wide(mid: float) -> dict[str, float]:
        return {"lo": mid - 1.0e6, "mid": mid, "hi": mid + 1.0e6}

    moments = {
        "n1": wide(10),
        "g1": wide(10),
        "g2": wide(10),
        "g3": wide(10),
        "g4": wide(10),
        "sum": wide(150),
        "parity": wide(5),
        "spread": wide(40),
        "consecutive": wide(0),
        "e1": wide(2),
        "e_gap": wide(2),
        "star_sum": wide(6),
        "star_consecutive": wide(0),
    }
    base = {
        "draw_count": 40,
        "number_counts": {},
        "star_counts": {},
        "star_draw_counts": {},
        "pair_counts": {},
        "triple_counts": {},
        "star_pool": 12,
    }
    pi = [0.05] * 50
    pi[48] = 0.9
    pi[49] = 0.01
    pulse = {"pi": pi, "star_pi": [0.2] * 12}
    with_high = [10, 20, 30, 41, 49]
    with_low = [10, 20, 30, 40, 50]
    assert sum(with_high) == sum(with_low)
    high = score_grid(with_high, [2, 4], moments, base, pulse)
    low = score_grid(with_low, [2, 4], moments, base, pulse)
    bare_high = score_grid(with_high, [2, 4], moments, base)
    bare_low = score_grid(with_low, [2, 4], moments, base)
    assert high - low == pytest.approx((bare_high - bare_low) + math.log(0.9) - math.log(0.01))
    assert high > low
    ranked = beam(moments, base, star_pool=12, pulse=pulse)
    assert ranked
    assert 49 in ranked[0]["numbers"]
    assert 50 not in ranked[0]["numbers"]
    quiet = beam(moments, base, star_pool=12)
    assert quiet[0]["numbers"] == [10, 20, 30, 40, 50]


def test_forecast_and_training_publish_each_number() -> None:
    from synchro.nextdata.forecast import run_training

    pytest.importorskip("lightgbm")
    draws = _draws(40, seed=11)
    forecast = run_forecast(draws, focus=24, covariates=["pulse"], estimators=2, chunk=100)
    assert forecast["ok"] is True
    assert forecast["covariates"] == ["pulse"]
    assert len(forecast["pulse"]["balls"]) == 5
    assert len(forecast["pulse"]["stars"]) == 2
    assert {"n", "pi", "p"} <= set(forecast["pulse"]["balls"][0])
    assert all(1 <= item["n"] <= 50 for item in forecast["pulse"]["balls"])
    training = run_training(draws, focus=24, covariates=["pulse"], estimators=2, shift=1)
    assert training["ok"] is True
    assert training["shifts"]
    assert len(training["shifts"][0]["pulse"]["balls"]) == 5
    assert training["pulse"] == training["shifts"][-1]["pulse"]
    assert training["star_pool"] == 12
