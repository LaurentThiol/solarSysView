"""Tests synthétiques du laboratoire Harmo (scipy)."""

from __future__ import annotations

from datetime import date, timedelta

import numpy as np

from synchro.harmo.envelope import envelope_bundle
from synchro.harmo.hpss import hpss_bundle
from synchro.harmo.orders import orders_bundle
from synchro.harmo.spectrum import (
    lomb_scargle,
    peak_list,
    rfft_spectrum,
    scan_comb,
    spectrum_bundle,
    thd_hnr,
)
from synchro.harmo.tf import tf_bundle
from synchro.harmo.unmix import unmix_shares


def _unmix(x: np.ndarray) -> tuple[dict, dict, dict]:
    n = np.arange(x.size)
    spec = rfft_spectrum(x)
    tf = tf_bundle(x)
    env = envelope_bundle(x)
    hp = hpss_bundle(tf["mag"], x)
    bundle = spectrum_bundle(x, n.astype(float) * 3.5)
    mix = unmix_shares(
        fft_power=spec[2],
        comb_energy=float(bundle["comb"]["score"]),
        comb_fraction=float(bundle["comb"].get("fraction") or 0.0),
        ridges=tf["ridges"],
        envelope_energy=float(env["energy"]),
        envelope_snr=float(env.get("snr") or 0.0),
        envelope_periodic=bool(env.get("periodic")),
        harmonic_energy=float(hp["harmonic_energy"]),
        percussive_energy=float(hp["percussive_energy"]),
    )
    return mix, tf, bundle


def spec_peak(x: np.ndarray) -> float:
    freqs, mag, _ = rfft_spectrum(x)
    body = mag.copy()
    body[0] = 0
    return float(freqs[int(np.argmax(body))])


def test_sine_unmix_is_mostly_grid() -> None:
    n = np.arange(256)
    x = np.sin(2 * np.pi * 0.08 * n)
    mix, tf, bundle = _unmix(x)
    assert mix["shares"]["grid"] > mix["shares"]["mechanical"]
    assert mix["shares"]["grid"] > 0.4
    assert abs(spec_peak(x) - 0.08) < 0.01
    assert "grid" in {r["kind"] for r in tf["ridges"]}
    assert bundle["comb"]["cycles_per_draw"] > 0


def test_chirp_unmix_is_mostly_mechanical() -> None:
    n = np.arange(256)
    x = np.sin(2 * np.pi * (0.05 + 0.00055 * n) * n)
    mix, tf, _bundle = _unmix(x)
    assert mix["shares"]["mechanical"] > mix["shares"]["grid"]
    assert any(r["kind"] == "mechanical" for r in tf["ridges"])


def test_white_noise_is_mostly_acoustic() -> None:
    rng = np.random.default_rng(1)
    x = rng.normal(size=256)
    mix, _tf, _bundle = _unmix(x)
    assert mix["shares"]["acoustic"] > mix["shares"]["grid"]
    assert mix["shares"]["acoustic"] > 0.35


def test_sawtooth_has_high_thd() -> None:
    n = np.arange(200)
    saw = (n % 10).astype(float)
    freqs, mag, power = rfft_spectrum(saw)
    peaks = peak_list(freqs, mag, draws_per_year=104)
    comb = scan_comb(freqs, power, peaks, draws_per_year=104)
    thd = thd_hnr(freqs, mag, float(comb["cycles_per_draw"]))
    assert thd["thd"] is not None
    assert thd["thd"] > 0.4


def test_order_tracking_collapses_chirp() -> None:
    n = np.arange(256)
    x = np.sin(2 * np.pi * (0.05 + 0.00055 * n) * n)
    tf = tf_bundle(x)
    tracked = orders_bundle(x, tf["ridges"])
    assert tracked["ok"]
    peaks = [p for p in tracked["peaks"] if (p.get("order") or 0) > 0.3]
    assert peaks
    top = peaks[0]["order"]
    assert 0.6 < top < 1.6


def test_lomb_scargle_annual_on_uneven_sampling() -> None:
    dates: list[date] = []
    day = date(2018, 1, 2)
    while len(dates) < 160:
        if day.weekday() in (1, 4):
            dates.append(day)
        day += timedelta(days=1)
    t0 = dates[0]
    t_days = np.array([(d - t0).days for d in dates], dtype=float)
    x = np.sin(2 * np.pi * t_days / 365.25)
    lomb = lomb_scargle(t_days, x, draws_per_year=104.0)
    assert lomb["peaks"]
    best = max(lomb["peaks"], key=lambda p: p["power"])
    assert abs(best["cycles_per_year"] - 1.0) < 0.25


def test_json_safe_numpy_is_starlette_serializable() -> None:
    import json

    from synchro.harmo.util import json_safe

    payload = json_safe(
        {
            "n": np.int64(3),
            "ok": np.bool_(True),
            "x": np.float64("nan"),
            "inf": np.inf,
            "z": np.array([1, 2], dtype=np.int64),
        }
    )
    json.dumps(payload, allow_nan=False)
    assert payload["n"] == 3
    assert payload["ok"] is True
    assert payload["x"] == 0.0
    assert payload["z"] == [1, 2]


def test_extract_ridges_accepts_1d_magnitude() -> None:
    from synchro.harmo.tf import extract_ridges

    mag = np.linspace(0.1, 1.0, 16)
    freqs = np.linspace(0.0, 0.5, 16)
    times = np.array([0.0])
    assert extract_ridges(mag, freqs, times) == []
