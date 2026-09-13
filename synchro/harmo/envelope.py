"""Démodulation d’enveloppe (transformée de Hilbert)."""

from __future__ import annotations

from typing import Any

import numpy as np
from scipy.signal import hilbert

from synchro.harmo.spectrum import peak_list, rfft_spectrum
from synchro.harmo.util import detrend_mean, downsample_xy, fnum


def envelope_bundle(
    x: np.ndarray, *, draws_per_year: float = 104.0, dates: list[str] | None = None
) -> dict[str, Any]:
    x = detrend_mean(np.asarray(x, dtype=float))
    n = int(x.size)
    if n < 8:
        return {
            "envelope": [],
            "spectrum": {"points": [], "peaks": []},
            "inst_freq": [],
        }
    analytic = hilbert(x)
    env = np.abs(analytic)
    env_ac = detrend_mean(env)
    freqs, mag, power = rfft_spectrum(env_ac, window="hann")
    phase = np.unwrap(np.angle(analytic))
    inst_f = np.zeros(n, dtype=float)
    inst_f[1:] = np.diff(phase) / (2.0 * np.pi)
    inst_f[0] = inst_f[1] if n > 1 else 0.0
    idx = np.arange(n, dtype=float)
    env_energy = float(np.sum(env_ac**2))
    body = mag.copy()
    if body.size:
        body[0] = 0.0
    med = float(np.median(body[1:])) if body.size > 1 else 0.0
    peak = float(np.max(body)) if body.size else 0.0
    snr = peak / med if med > 0 else 0.0
    env_peaks = peak_list(freqs, mag, draws_per_year=draws_per_year, max_peaks=10)
    peak_f = float(env_peaks[0]["cycles_per_draw"] or 0.0) if env_peaks else 0.0
    mean_env = float(np.mean(env))
    mod_index = float(np.std(env) / (mean_env + 1e-12)) if mean_env else 0.0
    # Une sinusoïde a une enveloppe quasi constante (indice ~0.08, bords Hilbert).
    # Une vraie modulation dépasse ~0.12.
    periodic = bool(mod_index > 0.12 and peak_f > 3.0 / n and snr >= 4.0)
    return {
        "envelope": downsample_xy(idx, env, 400),
        "dates": dates or [],
        "spectrum": {
            "points": downsample_xy(freqs, mag, 400),
            "peaks": env_peaks,
        },
        "snr": fnum(snr),
        "peak_freq": fnum(peak_f),
        "periodic": periodic,
        "mod_index": fnum(mod_index),
        "inst_freq": downsample_xy(idx, inst_f, 400),
        "energy": fnum(env_energy),
        "mean": fnum(np.mean(env)),
        "env": env,
        "env_ac": env_ac,
        "freqs": freqs,
        "mag": mag,
        "power": power,
        "inst_f": inst_f,
    }
