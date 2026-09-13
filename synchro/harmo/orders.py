"""Order tracking tacholess : crête STFT → phase → rééchantillonnage angulaire."""

from __future__ import annotations

from typing import Any

import numpy as np

from synchro.harmo.spectrum import peak_list, rfft_spectrum
from synchro.harmo.util import detrend_mean, downsample_xy, flist, fnum


def _mechanical_ridge(ridges: list[dict[str, Any]]) -> dict[str, Any] | None:
    if not ridges:
        return None
    sloped = [r for r in ridges if r.get("kind") == "mechanical"]
    pool = sloped or ridges
    return max(pool, key=lambda r: float(r.get("energy") or 0.0))


def order_track(
    x: np.ndarray,
    ridge: dict[str, Any] | None,
    *,
    n_samples: int | None = None,
) -> dict[str, Any]:
    x = detrend_mean(np.asarray(x, dtype=float))
    n = int(x.size)
    if ridge is None or n < 8:
        return {"ok": False, "reason": "pas de crête mécanique", "points": [], "peaks": []}
    times = np.asarray(ridge.get("times") or [], dtype=float)
    f_inst = np.asarray(ridge.get("freqs") or [], dtype=float)
    if times.size < 2 or f_inst.size < 2:
        return {"ok": False, "reason": "crête trop courte", "points": [], "peaks": []}
    idx = np.arange(n, dtype=float)
    f = np.interp(idx, times, f_inst, left=float(f_inst[0]), right=float(f_inst[-1]))
    f = np.maximum(f, 1e-6)
    phase = np.cumsum(2.0 * np.pi * f)
    phase = phase - phase[0]
    if float(phase[-1]) <= 0:
        return {"ok": False, "reason": "phase non croissante", "points": [], "peaks": []}
    n_theta = int(n_samples or n)
    theta = np.linspace(float(phase[0]), float(phase[-1]), n_theta)
    x_theta = np.interp(theta, phase, x)
    freqs, mag, power = rfft_spectrum(x_theta, window="blackmanharris")
    n_rev = float(phase[-1] / (2.0 * np.pi))
    spr = n_theta / n_rev if n_rev > 0 else float(n_theta)
    orders = freqs * spr
    peaks = peak_list(orders, mag, draws_per_year=1.0, max_peaks=12)
    # réétiqueter : ici « freq » = ordre
    for p in peaks:
        p["order"] = fnum(p.get("cycles_per_draw"))
        p["cycles_per_draw"] = None
        p["cycles_per_year"] = None
        p["period_draws"] = None
    return {
        "ok": True,
        "n_revolutions": fnum(n_rev),
        "points": downsample_xy(orders, mag, 400),
        "peaks": peaks,
        "f_inst": downsample_xy(idx, f, 400),
        "f_samples": flist(f),
        "orders": orders,
        "mag": mag,
        "power": power,
    }


def orders_bundle(
    x: np.ndarray, ridges: list[dict[str, Any]]
) -> dict[str, Any]:
    ridge = _mechanical_ridge(ridges)
    tracked = order_track(x, ridge)
    if ridge:
        tracked["ridge"] = {
            "kind": ridge.get("kind"),
            "mean_freq": ridge.get("mean_freq"),
            "slope": ridge.get("slope"),
            "energy": ridge.get("energy"),
        }
    return tracked
