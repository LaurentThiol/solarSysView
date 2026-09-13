"""Helpers numériques : JSON sûr, tendance nulle, notes d’échantillonnage."""

from __future__ import annotations

import math
from typing import Any, Iterable

import numpy as np

MIN_SAMPLES = 16
DISCLAIMER = (
    "Les tirages sont indépendants. Harmo décrit le tracé, pas le prochain "
    "tirage. Unités : cycles/tirage et cycles/an — pas des hertz."
)


def fnum(value: Any) -> float:
    try:
        out = float(value)
    except (TypeError, ValueError):
        return 0.0
    if not math.isfinite(out):
        return 0.0
    return out


def flist(values: Iterable[Any]) -> list[float]:
    return [fnum(v) for v in np.asarray(values, dtype=float).ravel()]


def fgrid(values: np.ndarray) -> list[list[float]]:
    arr = np.asarray(values, dtype=float)
    if arr.ndim == 1:
        return [flist(arr)]
    return [[fnum(v) for v in row] for row in arr]


def detrend_mean(x: np.ndarray) -> np.ndarray:
    x = np.asarray(x, dtype=float)
    if x.size == 0:
        return x
    return x - float(np.mean(x))


def db10(power: np.ndarray, floor: float = 1e-18) -> np.ndarray:
    p = np.asarray(power, dtype=float)
    return 10.0 * np.log10(np.maximum(p, floor))


def downsample_xy(
    xs: np.ndarray, ys: np.ndarray, max_points: int = 512
) -> list[dict[str, float]]:
    xs = np.asarray(xs, dtype=float)
    ys = np.asarray(ys, dtype=float)
    n = int(xs.size)
    if n == 0:
        return []
    if n <= max_points:
        idx = np.arange(n)
    else:
        idx = np.unique(np.linspace(0, n - 1, max_points).astype(int))
    return [{"x": fnum(xs[i]), "y": fnum(ys[i])} for i in idx]


def freq_pack(freq: float, draws_per_year: float) -> dict[str, float | None]:
    f = fnum(freq)
    period = (1.0 / f) if f > 0 else None
    cpy = f * draws_per_year if draws_per_year > 0 else None
    return {
        "cycles_per_draw": f,
        "period_draws": fnum(period) if period is not None else None,
        "cycles_per_year": fnum(cpy) if cpy is not None else None,
    }
