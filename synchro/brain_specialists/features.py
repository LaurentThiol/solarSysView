"""Indicateurs causaux : la valeur à l’index t n’utilise que values[0..t]."""

from __future__ import annotations

from typing import Callable

import numpy as np

from synchro.analysis.ta import bollinger, ema, macd, rsi, sma

FEATURE_IDS = (
    "lag1",
    "lag2",
    "lag3",
    "rsi",
    "macd",
    "macd_hist",
    "bollinger",
    "sma",
    "ema",
    "atr",
    "stoch",
    "cci",
    "zscore",
    "slope",
)

FEATURES = {
    "lag1": {"label": "Lag 1 (dernière valeur)", "family": "lags", "period": 1},
    "lag2": {"label": "Lag 2", "family": "lags", "period": 2},
    "lag3": {"label": "Lag 3", "family": "lags", "period": 3},
    "rsi": {"label": "RSI 14", "family": "momentum", "period": 14},
    "macd": {"label": "MACD ligne", "family": "momentum", "period": 26},
    "macd_hist": {"label": "MACD histogramme", "family": "momentum", "period": 35},
    "bollinger": {"label": "Bollinger %B", "family": "volatilite", "period": 20},
    "sma": {"label": "SMA 20", "family": "moyennes", "period": 20},
    "ema": {"label": "EMA 20", "family": "moyennes", "period": 20},
    "atr": {"label": "Étendue moyenne |Δ|", "family": "volatilite", "period": 14},
    "stoch": {"label": "Stochastique %K", "family": "momentum", "period": 14},
    "cci": {"label": "CCI", "family": "momentum", "period": 20},
    "zscore": {"label": "Z-score 20", "family": "volatilite", "period": 20},
    "slope": {"label": "Pente 10", "family": "tendance", "period": 10},
}


def _as_list(values: list[float] | np.ndarray) -> list[float]:
    return [float(v) for v in values]


def lag_series(values: list[float], k: int) -> list[float | None]:
    """lag1 = valeur courante ; lag2 = t−1 ; lag3 = t−2."""
    out: list[float | None] = [None] * len(values)
    offset = k - 1
    for i in range(offset, len(values)):
        out[i] = values[i - offset]
    return out


def percent_b(values: list[float], period: int = 20) -> list[float | None]:
    bands = bollinger(values, period)
    out: list[float | None] = [None] * len(values)
    for i, (mid, up, lo) in enumerate(zip(bands["middle"], bands["upper"], bands["lower"])):
        if mid is None or up is None or lo is None:
            continue
        width = up - lo
        if width == 0:
            out[i] = 0.5
        else:
            out[i] = (values[i] - lo) / width
    return out


def mean_abs_delta(values: list[float], period: int = 14) -> list[float | None]:
    """ATR d’une série close-only : moyenne des |Δ|."""
    out: list[float | None] = [None] * len(values)
    if len(values) < 2:
        return out
    deltas = [0.0] + [abs(values[i] - values[i - 1]) for i in range(1, len(values))]
    return sma(deltas, period)


def stochastic_k(values: list[float], period: int = 14) -> list[float | None]:
    p = max(1, period)
    out: list[float | None] = [None] * len(values)
    for i in range(p - 1, len(values)):
        window = values[i - p + 1 : i + 1]
        lo, hi = min(window), max(window)
        if hi == lo:
            out[i] = 50.0
        else:
            out[i] = 100.0 * (values[i] - lo) / (hi - lo)
    return out


def cci_close(values: list[float], period: int = 20) -> list[float | None]:
    mid = sma(values, period)
    out: list[float | None] = [None] * len(values)
    p = max(1, period)
    for i, mean in enumerate(mid):
        if mean is None:
            continue
        window = values[i - p + 1 : i + 1]
        mad = sum(abs(x - mean) for x in window) / p
        if mad == 0:
            out[i] = 0.0
        else:
            out[i] = (values[i] - mean) / (0.015 * mad)
    return out


def zscore(values: list[float], period: int = 20) -> list[float | None]:
    p = max(2, period)
    out: list[float | None] = [None] * len(values)
    for i in range(p - 1, len(values)):
        window = values[i - p + 1 : i + 1]
        mu = sum(window) / p
        var = sum((x - mu) ** 2 for x in window) / (p - 1)
        sigma = var ** 0.5
        out[i] = 0.0 if sigma == 0 else (values[i] - mu) / sigma
    return out


def slope(values: list[float], period: int = 10) -> list[float | None]:
    p = max(2, period)
    out: list[float | None] = [None] * len(values)
    xs = list(range(p))
    x_mean = (p - 1) / 2.0
    denom = sum((x - x_mean) ** 2 for x in xs)
    if denom == 0:
        return out
    for i in range(p - 1, len(values)):
        window = values[i - p + 1 : i + 1]
        y_mean = sum(window) / p
        num = sum((xs[j] - x_mean) * (window[j] - y_mean) for j in range(p))
        out[i] = num / denom
    return out


_EXTRACTORS: dict[str, Callable[[list[float]], list[float | None]]] = {
    "lag1": lambda v: lag_series(v, 1),
    "lag2": lambda v: lag_series(v, 2),
    "lag3": lambda v: lag_series(v, 3),
    "rsi": lambda v: rsi(v, 14),
    "macd": lambda v: macd(v)["line"],
    "macd_hist": lambda v: macd(v)["histogram"],
    "bollinger": lambda v: percent_b(v, 20),
    "sma": lambda v: sma(v, 20),
    "ema": lambda v: ema(v, 20),
    "atr": lambda v: mean_abs_delta(v, 14),
    "stoch": lambda v: stochastic_k(v, 14),
    "cci": lambda v: cci_close(v, 20),
    "zscore": lambda v: zscore(v, 20),
    "slope": lambda v: slope(v, 10),
}


def validate_indicators(names: list[str]) -> list[str]:
    out: list[str] = []
    seen: set[str] = set()
    for raw in names:
        key = str(raw).strip().lower()
        if key not in _EXTRACTORS:
            raise ValueError(f"Indicateur inconnu: {raw}. Choisir parmi {FEATURE_IDS}.")
        if key not in seen:
            seen.add(key)
            out.append(key)
    if not out:
        raise ValueError("Il faut au moins un indicateur.")
    return out


def series_matrix(values: list[float], indicators: list[str]) -> np.ndarray:
    """Matrice (n, f) alignée sur `values`. NaN si l’indicateur n’est pas encore défini."""
    cols = []
    data = _as_list(values)
    for name in indicators:
        col = _EXTRACTORS[name](data)
        cols.append([np.nan if v is None else float(v) for v in col])
    return np.column_stack(cols) if cols else np.zeros((len(values), 0))


def warmup_needed(indicators: list[str]) -> int:
    return max((int(FEATURES[name]["period"]) for name in indicators), default=1)
