"""Séparation harmonique / percussif (HPSS) par médianes, librosa optionnel."""

from __future__ import annotations

from typing import Any

import numpy as np

from synchro.harmo.util import detrend_mean, fnum


def _odd(k: int, cap: int) -> int:
    k = max(1, min(int(k), max(1, cap)))
    if k % 2 == 0:
        k = max(1, k - 1)
    return k


def median_hpss(
    mag: np.ndarray, *, kernel_time: int = 17, kernel_freq: int = 17
) -> dict[str, np.ndarray]:
    from scipy.ndimage import median_filter

    mag = np.asarray(mag, dtype=float)
    if mag.ndim != 2 or mag.size == 0:
        z = np.zeros_like(mag)
        return {"harmonic": z, "percussive": z, "mask_h": z, "mask_p": z}
    kt = _odd(kernel_time, mag.shape[1])
    kf = _odd(kernel_freq, mag.shape[0])
    harm = median_filter(mag, size=(1, kt), mode="nearest")
    perc = median_filter(mag, size=(kf, 1), mode="nearest")
    denom = harm + perc + 1e-12
    mask_h = harm / denom
    mask_p = perc / denom
    return {
        "harmonic": mag * mask_h,
        "percussive": mag * mask_p,
        "mask_h": mask_h,
        "mask_p": mask_p,
    }


def optional_librosa_hpss(x: np.ndarray) -> dict[str, Any] | None:
    try:
        import librosa
    except ImportError:
        return None
    x = detrend_mean(np.asarray(x, dtype=float))
    if x.size < 16:
        return None
    try:
        y_h, y_p = librosa.effects.hpss(x)
    except Exception:
        return None
    return {
        "available": True,
        "harmonic_energy": fnum(np.sum(np.asarray(y_h) ** 2)),
        "percussive_energy": fnum(np.sum(np.asarray(y_p) ** 2)),
    }


def hpss_bundle(mag: np.ndarray, x: np.ndarray | None = None) -> dict[str, Any]:
    parts = median_hpss(mag)
    e_h = float(np.sum(parts["harmonic"] ** 2))
    e_p = float(np.sum(parts["percussive"] ** 2))
    total = e_h + e_p
    out: dict[str, Any] = {
        "harmonic_energy": fnum(e_h),
        "percussive_energy": fnum(e_p),
        "harmonic_fraction": fnum(e_h / total) if total > 0 else 0.0,
        "percussive_fraction": fnum(e_p / total) if total > 0 else 0.0,
        "source": "median",
        "harmonic": parts["harmonic"],
        "percussive": parts["percussive"],
    }
    if x is not None:
        extra = optional_librosa_hpss(x)
        if extra:
            out["librosa"] = extra
    return out
