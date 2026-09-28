"""Indicateurs du flux, avec une période par colonne.

Les noms par défaut restent ceux des lectures déjà enregistrées (`sum.z20`,
`sum.rsi`). Une autre fenêtre s'écrit `sum.zscore@13`. Le calcul vectorisé
suit les formules de `synchro.brain_specialists.features` et de
`synchro.analysis.ta` : RSI, EMA, MACD et ATR passent par ces modules, le
reste par des fenêtres numpy.
"""

from __future__ import annotations

from typing import Any, Sequence

import numpy as np

from synchro.analysis.ta import ema, macd, rsi, sma
from synchro.brain_specialists.features import (
    cci_close,
    mean_abs_delta,
    percent_b,
    slope,
    stochastic_k,
    zscore,
)

# Grille bornée : plancher d'interprétabilité, période habituelle, plafond 34.
# MACD est identifié par la lenteur (13, 26, 39), soit les échelles 0,5 / 1 / 1,5.
MEASURE_CATALOG: tuple[dict[str, Any], ...] = (
    {
        "id": "last",
        "stem": "last",
        "label": "dernière",
        "shown": "dernière",
        "family": "lags",
        "default": None,
        "grid": (),
        "floor": None,
        "indicator": "lag1",
        "kind": "last",
    },
    {
        "id": "step",
        "stem": "step",
        "label": "pas",
        "shown": "pas",
        "family": "lags",
        "default": None,
        "grid": (),
        "floor": None,
        "indicator": None,
        "kind": "step",
    },
    {
        "id": "lag2",
        "stem": "lag2",
        "label": "lag 2",
        "shown": "lag 2",
        "family": "lags",
        "default": None,
        "grid": (),
        "floor": None,
        "indicator": "lag2",
        "kind": "lag",
        "shift": 2,
    },
    {
        "id": "lag3",
        "stem": "lag3",
        "label": "lag 3",
        "shown": "lag 3",
        "family": "lags",
        "default": None,
        "grid": (),
        "floor": None,
        "indicator": "lag3",
        "kind": "lag",
        "shift": 3,
    },
    {
        "id": "slope",
        "stem": "slope",
        "label": "pente",
        "shown": "pente",
        "family": "tendance",
        "default": 10,
        "grid": (5, 8, 10, 13, 21, 34),
        "floor": 5,
        "indicator": "slope",
        "kind": "slope",
    },
    {
        "id": "z20",
        "stem": "zscore",
        "label": "z-score",
        "shown": "z20",
        "family": "volatilite",
        "default": 20,
        "grid": (8, 13, 20, 34),
        "floor": 8,
        "indicator": "zscore",
        "kind": "zscore",
    },
    {
        "id": "rsi",
        "stem": "rsi",
        "label": "RSI",
        "shown": "RSI",
        "family": "momentum",
        "default": 14,
        "grid": (5, 9, 14, 21, 34),
        "floor": 5,
        "indicator": "rsi",
        "kind": "rsi",
    },
    {
        "id": "macd",
        "stem": "macd",
        "label": "MACD",
        "shown": "MACD",
        "family": "momentum",
        "default": 26,
        "grid": (13, 26, 39),
        "floor": 13,
        "indicator": "macd",
        "kind": "macd",
    },
    {
        "id": "macd_hist",
        "stem": "macd_hist",
        "label": "MACD hist",
        "shown": "MACD hist",
        "family": "momentum",
        "default": 26,
        "grid": (13, 26, 39),
        "floor": 13,
        "indicator": "macd_hist",
        "kind": "macd_hist",
    },
    {
        "id": "bollinger",
        "stem": "bollinger",
        "label": "Bollinger",
        "shown": "Bollinger",
        "family": "volatilite",
        "default": 20,
        "grid": (8, 13, 20, 34),
        "floor": 8,
        "indicator": "bollinger",
        "kind": "bollinger",
    },
    {
        "id": "sma",
        "stem": "sma",
        "label": "SMA",
        "shown": "SMA",
        "family": "moyennes",
        "default": 20,
        "grid": (5, 8, 13, 20, 34),
        "floor": 5,
        "indicator": "sma",
        "kind": "sma",
    },
    {
        "id": "ema",
        "stem": "ema",
        "label": "EMA",
        "shown": "EMA",
        "family": "moyennes",
        "default": 20,
        "grid": (5, 8, 13, 20, 34),
        "floor": 5,
        "indicator": "ema",
        "kind": "ema",
    },
    {
        "id": "atr",
        "stem": "atr",
        "label": "ATR",
        "shown": "ATR",
        "family": "volatilite",
        "default": 14,
        "grid": (5, 9, 14, 21, 34),
        "floor": 5,
        "indicator": "atr",
        "kind": "atr",
    },
    {
        "id": "stoch",
        "stem": "stoch",
        "label": "stochastique",
        "shown": "stochastique",
        "family": "momentum",
        "default": 14,
        "grid": (5, 9, 14, 21, 34),
        "floor": 5,
        "indicator": "stoch",
        "kind": "stoch",
    },
    {
        "id": "cci",
        "stem": "cci",
        "label": "CCI",
        "shown": "CCI",
        "family": "momentum",
        "default": 20,
        "grid": (8, 13, 20, 34),
        "floor": 8,
        "indicator": "cci",
        "kind": "cci",
    },
    {
        "id": "range8",
        "stem": "range",
        "label": "amplitude",
        "shown": "amplitude",
        "family": "volatilite",
        "default": 8,
        "grid": (5, 8, 13, 21),
        "floor": 5,
        "indicator": "range8",
        "kind": "range",
    },
)

MEASURE_IDS: tuple[str, ...] = tuple(spec["id"] for spec in MEASURE_CATALOG)
SHAPE_DEFAULT_MEASURES: tuple[str, ...] = MEASURE_IDS
SERIES_DEFAULT_MEASURES: tuple[str, ...] = tuple(spec["id"] for spec in MEASURE_CATALOG if spec["id"] != "step")

_BY_ID: dict[str, dict[str, Any]] = {spec["id"]: spec for spec in MEASURE_CATALOG}
_BY_STEM: dict[str, dict[str, Any]] = {spec["stem"]: spec for spec in MEASURE_CATALOG}

# Lenteur MACD → (rapide, lente, signal). 13/26/39 = échelles 0,5 / 1 / 1,5 de 12/26/9.
_MACD = {
    13: (6, 13, 4),
    26: (12, 26, 9),
    39: (18, 39, 14),
}

FAMILY_FR = {
    "lags": "Mémoire",
    "tendance": "Tendance",
    "momentum": "Momentum",
    "moyennes": "Moyennes",
    "volatilite": "Volatilité",
}

INDICATOR_OF = {spec["id"]: spec["indicator"] for spec in MEASURE_CATALOG}
INDICATOR_OF.update({spec["stem"]: spec["indicator"] for spec in MEASURE_CATALOG})


def measure_spec(name: str) -> dict[str, Any] | None:
    return _BY_ID.get(name) or _BY_STEM.get(name)


def validate_measures(names: Sequence[str]) -> list[str]:
    out: list[str] = []
    seen: set[str] = set()
    for raw in names:
        key = str(raw).strip().lower()
        if key not in _BY_ID:
            raise ValueError(f"Indicateur inconnu: {raw}. Choisir parmi {MEASURE_IDS}.")
        if key not in seen:
            seen.add(key)
            out.append(key)
    if not out:
        raise ValueError("Il faut au moins un indicateur.")
    return out


def resolve_measures(names: Sequence[str] | None, *, question: str) -> list[str]:
    if names is None:
        base = SERIES_DEFAULT_MEASURES if question == "series" else SHAPE_DEFAULT_MEASURES
        return list(base)
    return validate_measures(names)


def window_cap(n_draws: int) -> int:
    """Plafond de fenêtre : 34, ou moins quand l'archive est courte."""
    return min(34, max(1, int(n_draws) // 15))


def periods_for(measure_id: str, mode: str, n_draws: int) -> list[int | None]:
    """Périodes candidates. `fixed` ne garde que la période habituelle.

    Sous le plancher (z-score, Bollinger, CCI : 8), aucune fenêtre. Si le
    plafond tombe sous le plancher, on garde le plancher seul.
    """
    spec = _BY_ID[measure_id]
    if not spec["grid"]:
        return [None]
    if mode != "learned":
        return [int(spec["default"])]
    cap = window_cap(n_draws)
    limit = int(spec["grid"][-1]) if measure_id in {"macd", "macd_hist"} and cap >= 34 else cap
    floor = int(spec["floor"])
    chosen = [int(period) for period in spec["grid"] if floor <= int(period) <= limit]
    if not chosen:
        chosen = [floor]
    return chosen


def column_name(series: str, measure_id: str, period: int | None) -> str:
    spec = _BY_ID[measure_id]
    if period is None or not spec["grid"] or int(period) == int(spec["default"]):
        return f"{series}.{measure_id}"
    return f"{series}.{spec['stem']}@{int(period)}"


def parse_feature_name(name: str) -> dict[str, Any]:
    """Découpe `sum.z20` et `sum.zscore@13` vers la même mesure."""
    period: int | None = None
    body = name
    scaled = False
    if "@" in name:
        body, token = name.rsplit("@", 1)
        scaled = True
        period = int(token) if token.isdigit() else None
    if "." in body and not body.startswith("curve_") and not body.startswith("figure_"):
        series, measure = body.split(".", 1)
    else:
        series, measure = None, body
    spec = measure_spec(measure)
    if spec is None:
        return {
            "series": series,
            "stem": measure,
            "measure_id": measure,
            "period": period,
            "default": None,
            "label": measure,
            "shown": measure,
            "group": (series, measure),
            "windowed": False,
            "scaled": scaled,
            "indicator": None,
        }
    resolved = period if period is not None else spec["default"]
    return {
        "series": series,
        "stem": spec["stem"],
        "measure_id": spec["id"],
        "period": resolved,
        "default": spec["default"],
        "label": spec["label"],
        "shown": spec["shown"],
        "group": (series, spec["stem"]),
        "windowed": bool(spec["grid"]),
        "scaled": scaled,
        "indicator": spec["indicator"],
    }


def macd_triplet(slow_period: int) -> tuple[int, int, int]:
    if int(slow_period) in _MACD:
        return _MACD[int(slow_period)]
    scale = float(slow_period) / 26.0
    fast = max(2, int(round(12 * scale)))
    slow = max(fast + 1, int(slow_period))
    signal = max(2, int(round(9 * scale)))
    return fast, slow, signal


def _optional(values: list[float | None]) -> np.ndarray:
    return np.array([np.nan if value is None else float(value) for value in values], dtype=float)


def _lag(values: np.ndarray, k: int) -> np.ndarray:
    out = np.full(values.shape, np.nan, dtype=float)
    offset = k - 1
    if offset <= 0:
        return values.astype(float, copy=True)
    if offset < len(values):
        out[offset:] = values[:-offset]
    return out


def _windows(values: np.ndarray, period: int) -> np.ndarray:
    return np.lib.stride_tricks.sliding_window_view(np.ascontiguousarray(values, dtype=float), period)


def _sma_np(values: np.ndarray, period: int) -> np.ndarray:
    p = max(1, int(period))
    out = np.full(values.shape, np.nan, dtype=float)
    if len(values) < p:
        return out
    out[p - 1 :] = _windows(values, p).mean(axis=1)
    return out


def _zscore_np(values: np.ndarray, period: int) -> np.ndarray:
    p = max(2, int(period))
    out = np.full(values.shape, np.nan, dtype=float)
    if len(values) < p:
        return out
    windows = _windows(values, p)
    mu = windows.mean(axis=1)
    sigma = np.sqrt(windows.var(axis=1, ddof=1))
    cur = values[p - 1 :]
    scored = np.zeros(len(cur), dtype=float)
    np.divide(cur - mu, sigma, out=scored, where=sigma > 0)
    out[p - 1 :] = scored
    return out


def _stoch_np(values: np.ndarray, period: int) -> np.ndarray:
    p = max(1, int(period))
    out = np.full(values.shape, np.nan, dtype=float)
    if len(values) < p:
        return out
    windows = _windows(values, p)
    lo = windows.min(axis=1)
    hi = windows.max(axis=1)
    span = hi - lo
    cur = values[p - 1 :]
    scored = np.full(len(cur), 50.0, dtype=float)
    np.divide(100.0 * (cur - lo), span, out=scored, where=span > 0)
    out[p - 1 :] = scored
    return out


def _range_np(values: np.ndarray, period: int) -> np.ndarray:
    p = max(1, int(period))
    out = np.full(values.shape, np.nan, dtype=float)
    if len(values) < p:
        return out
    windows = _windows(values, p)
    out[p - 1 :] = windows.max(axis=1) - windows.min(axis=1)
    return out


def _slope_np(values: np.ndarray, period: int) -> np.ndarray:
    p = max(2, int(period))
    out = np.full(values.shape, np.nan, dtype=float)
    if len(values) < p:
        return out
    xs = np.arange(p, dtype=float)
    x_mean = (p - 1) / 2.0
    denom = float(np.sum((xs - x_mean) ** 2))
    if denom == 0:
        return out
    weights = (xs - x_mean) / denom
    out[p - 1 :] = _windows(values, p) @ weights
    return out


def _bollinger_np(values: np.ndarray, period: int) -> np.ndarray:
    p = max(1, int(period))
    out = np.full(values.shape, np.nan, dtype=float)
    if len(values) < p:
        return out
    windows = _windows(values, p)
    mid = windows.mean(axis=1)
    sigma = np.sqrt(windows.var(axis=1, ddof=1)) if p >= 2 else np.zeros(len(mid))
    cur = values[p - 1 :]
    width = 4.0 * sigma
    scored = np.full(len(cur), 0.5, dtype=float)
    np.divide(cur - (mid - 2.0 * sigma), width, out=scored, where=width > 0)
    out[p - 1 :] = scored
    return out


def _cci_np(values: np.ndarray, period: int) -> np.ndarray:
    p = max(1, int(period))
    out = np.full(values.shape, np.nan, dtype=float)
    if len(values) < p:
        return out
    windows = _windows(values, p)
    mid = windows.mean(axis=1)
    mad = np.mean(np.abs(windows - mid[:, None]), axis=1)
    cur = values[p - 1 :]
    scored = np.zeros(len(cur), dtype=float)
    np.divide(cur - mid, 0.015 * mad, out=scored, where=mad > 0)
    out[p - 1 :] = scored
    return out


def _atr_np(values: np.ndarray, period: int) -> np.ndarray:
    deltas = np.empty(values.shape, dtype=float)
    if len(values) == 0:
        return deltas
    deltas[0] = 0.0
    if len(values) > 1:
        deltas[1:] = np.abs(np.diff(values))
    return _sma_np(deltas, period)


def compute_column(values: np.ndarray, measure_id: str, period: int | None) -> np.ndarray:
    spec = _BY_ID[measure_id]
    kind = str(spec["kind"])
    data = np.asarray(values, dtype=float)
    if kind == "last":
        return data.copy()
    if kind == "step":
        out = np.full(data.shape, np.nan, dtype=float)
        if len(data) > 1:
            out[1:] = np.diff(data)
        return out
    if kind == "lag":
        return _lag(data, int(spec["shift"]))
    if period is None:
        raise ValueError(f"{measure_id} demande une période.")
    listed = data.tolist()
    if kind == "slope":
        return _slope_np(data, int(period))
    if kind == "zscore":
        return _zscore_np(data, int(period))
    if kind == "stoch":
        return _stoch_np(data, int(period))
    if kind == "range":
        return _range_np(data, int(period))
    if kind == "bollinger":
        return _bollinger_np(data, int(period))
    if kind == "cci":
        return _cci_np(data, int(period))
    if kind == "sma":
        return _sma_np(data, int(period))
    if kind == "atr":
        return _atr_np(data, int(period))
    if kind == "rsi":
        return _optional(rsi(listed, int(period)))
    if kind == "ema":
        return _optional(ema(listed, int(period)))
    fast, slow, signal = macd_triplet(int(period))
    packed = macd(listed, fast, slow, signal)
    if kind == "macd_hist":
        return _optional(packed["histogram"])
    return _optional(packed["line"])


def reference_column(values: list[float], measure_id: str, period: int | None) -> np.ndarray:
    """Même colonne, par les fonctions d'origine. Sert à vérifier le vectorisé."""
    spec = _BY_ID[measure_id]
    kind = str(spec["kind"])
    if kind in {"last", "step", "lag", "slope", "zscore", "stoch", "range", "bollinger", "cci", "sma", "atr"}:
        if kind == "zscore":
            return _optional(zscore(values, int(period or spec["default"])))
        if kind == "slope":
            return _optional(slope(values, int(period or spec["default"])))
        if kind == "stoch":
            return _optional(stochastic_k(values, int(period or spec["default"])))
        if kind == "range":
            from synchro.brain_specialists.features import range_8

            return _optional(range_8(values, int(period or spec["default"])))
        if kind == "bollinger":
            return _optional(percent_b(values, int(period or spec["default"])))
        if kind == "cci":
            return _optional(cci_close(values, int(period or spec["default"])))
        if kind == "sma":
            return _optional(sma(values, int(period or spec["default"])))
        if kind == "atr":
            return _optional(mean_abs_delta(values, int(period or spec["default"])))
        return compute_column(np.asarray(values, dtype=float), measure_id, period)
    return compute_column(np.asarray(values, dtype=float), measure_id, period)


def feature_matrix(
    series_values: dict[str, np.ndarray],
    measures: Sequence[str],
    *,
    mode: str,
    n_draws: int,
) -> tuple[list[str], np.ndarray, int]:
    """Colonnes `série.mesure` (et `@période`), plus l'index du premier tirage complet."""
    periods = {measure: periods_for(measure, mode, n_draws) for measure in measures}
    names: list[str] = []
    columns: list[np.ndarray] = []
    width = 0
    for series, values in series_values.items():
        data = np.asarray(values, dtype=float)
        width = len(data)
        for measure in measures:
            for period in periods[measure]:
                names.append(column_name(series, measure, period))
                columns.append(compute_column(data, measure, period))
    if not columns:
        return [], np.zeros((width, 0)), 0
    matrix = np.column_stack(columns)
    complete = np.all(np.isfinite(matrix), axis=1)
    warmup = int(np.argmax(complete)) if np.any(complete) else int(matrix.shape[0])
    return names, matrix, warmup


def catalog_measures() -> list[dict[str, Any]]:
    rows = []
    for spec in MEASURE_CATALOG:
        rows.append(
            {
                "id": spec["id"],
                "label": spec["label"],
                "shown": spec["shown"],
                "family": spec["family"],
                "family_label": FAMILY_FR.get(spec["family"], spec["family"]),
                "default": spec["default"],
                "grid": [int(period) for period in spec["grid"]],
                "floor": spec["floor"],
            }
        )
    return rows
