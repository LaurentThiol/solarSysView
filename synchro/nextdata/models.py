"""Ce qui fait un morceau de pas : LightGBM et CatBoost à lags, Darts, Chronos-2.

Un morceau ne dépend que des tirages d’avant, du réglage et de ce module : son
code entre tout entier dans la clé du cache (`steps`). L’assemblage des
lectures, le retour et l’écran vivent ailleurs et peuvent changer sans faire
recalculer un seul pas.

Darts `LightGBMModel`, quand le paquet est là, prévoit la médiane temporelle
du prochain pas. La chaîne n1 → écarts reste en LightGBM direct : chaque écart
voit la prévision du rang d'avant, apprise sur des prévisions passées, pas la
valeur sortie du même tirage. Chronos-2, s’il est installé, lit les mêmes
covariables. Les niveaux n1…n5, e1, e2 et leurs deltas, prévus à part, donnent
le centre de chaque rang.
"""

from __future__ import annotations

import json
import os
import threading
from dataclasses import dataclass
from typing import Any, Iterable

# Darts charge Matplotlib. Sur Mac, le backend graphique peut bloquer l’API
# au premier import, et la page nextData ne répond plus.
os.environ.setdefault("MPLBACKEND", "Agg")
# Filet si ce module est importé avant le paquet. Le serveur pose les mêmes
# variables dans synchro/__init__.py, avant les bibliothèques natives.
os.environ.setdefault("OMP_NUM_THREADS", "1")
os.environ.setdefault("KMP_DUPLICATE_LIB_OK", "TRUE")

import numpy as np

from synchro.nextdata.covariates import (
    CHAIN,
    TARGETS,
    TEMPORAL_TARGETS,
    column_family,
    future_columns,
    past_columns,
)
from synchro.nextdata.pulse_features import FUTURE_PULSE, PULSE_AHEAD, shifted_pulse

MODES = ("corpus", "fenetre")
QUANTILES = (0.1, 0.5, 0.9)
MODEL_PARTS = ("lightgbm", "catboost")
CHRONOS_SERIES = ("sum", "star_sum", "n1")


@dataclass(frozen=True)
class StepSettings:
    """Ce qui change un pas, en plus des tirages qui le précèdent."""

    focus: int
    families: tuple[str, ...]
    estimators: int
    quantiles: tuple[float, ...] = QUANTILES


FUTURE_BACK = 4
FUTURE_FWD = 1
CLAMPS: dict[str, tuple[float, float]] = {
    "sum": (15.0, 240.0),
    "n1": (1.0, 46.0),
    "g1": (1.0, 45.0),
    "g2": (1.0, 45.0),
    "g3": (1.0, 45.0),
    "g4": (1.0, 45.0),
    "parity": (0.0, 5.0),
    "spread": (4.0, 49.0),
    "consecutive": (0.0, 4.0),
    "level:n1": (1.0, 46.0),
    "level:n2": (2.0, 47.0),
    "level:n3": (3.0, 48.0),
    "level:n4": (4.0, 49.0),
    "level:n5": (5.0, 50.0),
    "delta:n1": (-45.0, 45.0),
    "delta:n2": (-45.0, 45.0),
    "delta:n3": (-45.0, 45.0),
    "delta:n4": (-45.0, 45.0),
    "delta:n5": (-45.0, 45.0),
}

# Niveaux et deltas : mêmes lags que la somme, sans `same:` ni entrée dans TARGETS.
RANK_LEVELS: tuple[str, ...] = ("n1", "n2", "n3", "n4", "n5", "e1", "e2")


def lag_choice(n: int) -> tuple[int, int]:
    """Mêmes lags pour les deux modes, plafonnés quand l’histoire est courte."""
    lags, past = 16, 8
    cap = max(2, n // 4)
    lags = max(2, min(lags, cap, max(2, n - 8)))
    past = max(1, min(past, lags))
    return int(lags), int(past)


def loss_indices(n: int, lags: int, focus_start: int, mode: str) -> list[int]:
    """Lignes qui entrent dans la perte.

    La fenêtre seule n’y met que les tirages du focus, tous : leurs lags lisent
    les tirages d’avant le focus, comme Darts. Sans assez d’histoire devant le
    focus, ses premiers tirages manquent.
    """
    if n <= lags:
        return []
    if mode == "fenetre":
        start = max(lags, focus_start)
        if n - start < 8:
            start = lags
        return list(range(start, n))
    return list(range(lags, n))


def row_weight(index: int, focus_start: int, mode: str) -> float:
    if mode == "fenetre":
        return 1.0 if index >= focus_start else 0.0
    return 3.0 if index >= focus_start else 1.0


def _level(rows: list[dict[str, Any]], horizon: list[dict[str, Any]], source: int, name: str) -> float:
    if source < 0:
        return 0.0
    if source < len(rows):
        return float(rows[source].get(name) or 0.0)
    extra = source - len(rows)
    if 0 <= extra < len(horizon):
        return float(horizon[extra].get(name) or 0.0)
    return 0.0


def vector_at(
    rows: list[dict[str, Any]],
    horizon: list[dict[str, Any]],
    t: int,
    *,
    lags: int,
    past_lags: int,
    past_names: list[str],
    future_names: list[str],
) -> tuple[list[float], list[str]]:
    values: list[float] = []
    names: list[str] = []
    for lag in range(1, lags + 1):
        for name in TARGETS:
            values.append(_level(rows, horizon, t - lag, name))
            names.append(f"lag:{name}:{lag}")
    for lag in range(1, past_lags + 1):
        for name in past_names:
            values.append(_level(rows, horizon, t - lag, name))
            names.append(f"past:{name}:{lag}")
    back = min(FUTURE_BACK, lags)
    for offset in range(-back, FUTURE_FWD + 1):
        for name in future_names:
            # Le décalage +1 ne relit pas la ligne d’après : son Pulse a été
            # réajusté avec le tirage qu’on prévoit. On prolonge l’onde déjà connue.
            source = t if name in FUTURE_PULSE and offset > 0 else t + offset
            column = PULSE_AHEAD[name] if name in FUTURE_PULSE and offset > 0 else name
            values.append(_level(rows, horizon, source, column))
            names.append(f"fut:{name}:{offset}")
    return values, names


def _design(
    rows: list[dict[str, Any]],
    horizon: list[dict[str, Any]],
    indices: list[int],
    *,
    lags: int,
    past_lags: int,
    past_names: list[str],
    future_names: list[str],
) -> tuple[np.ndarray, list[int], list[str]]:
    matrix: list[list[float]] = []
    used: list[int] = []
    names: list[str] = []
    need = max(lags, past_lags)
    for t in indices:
        if t < need:
            continue
        vec, names = vector_at(
            rows,
            horizon,
            t,
            lags=lags,
            past_lags=past_lags,
            past_names=past_names,
            future_names=future_names,
        )
        matrix.append(vec)
        used.append(t)
    if not matrix:
        return np.zeros((0, 0), dtype=float), [], names
    data = np.asarray(matrix, dtype=float)
    return np.nan_to_num(data, nan=0.0, posinf=0.0, neginf=0.0), used, names


def _with_lowers(
    base: np.ndarray,
    used: list[int],
    names: list[str],
    rows: list[dict[str, Any]],
    lower_names: tuple[str, ...],
    lower_at: dict[int, dict[str, float]],
) -> tuple[np.ndarray, list[str]]:
    """La matrice du temps et, en dernier, une colonne `same:` par rang déjà prévu du même tirage."""
    if not lower_names:
        return base, names
    block = [[float(lower_at[t][name]) for name in lower_names] for t in used]
    extra = np.nan_to_num(np.asarray(block, dtype=float), nan=0.0, posinf=0.0, neginf=0.0)
    return np.hstack([base, extra]), [*names, *(f"same:{name}" for name in lower_names)]


def star_pool_of(source: dict[str, Any] | None, default: int = 12) -> int:
    """Urne d’étoiles d’un tirage, entre 2 et 12. `default` si le tirage n’en porte pas."""
    fallback = max(2, min(12, int(default)))
    if not source or source.get("star_pool") is None:
        return fallback
    try:
        return max(2, min(12, int(source["star_pool"])))
    except (TypeError, ValueError):
        return fallback


def _clamp_span(name: str, star_pool: int = 12) -> tuple[float, float]:
    """Bornes légales. Les étoiles suivent l’urne ; le pool 12 retrouve les anciennes bornes fixes."""
    pool = max(2, min(12, int(star_pool)))
    if name == "star_sum":
        return 3.0, float(2 * pool - 1)
    if name in ("e1", "e_gap", "star_spread", "level:e1"):
        return 1.0, float(pool - 1)
    if name == "level:e2":
        return 2.0, float(pool)
    if name in ("delta:e1", "delta:e2"):
        span = float(pool - 1)
        return -span, span
    if name == "star_consecutive":
        return 0.0, 1.0
    return CLAMPS.get(name, (-1e6, 1e6))


def _clip(name: str, value: float, star_pool: int = 12) -> float:
    lo, hi = _clamp_span(name, star_pool)
    if not np.isfinite(value):
        return (lo + hi) / 2.0
    return float(min(hi, max(lo, value)))


_LIGHTGBM_PINNED = False


def _pin_lightgbm(lgb: Any) -> None:
    """Un seul fil OpenMP pour tout LightGBM chargé dans ce processus.

    `LGBM_BoosterPredictForMat` lit `num_threads` du paramètre de prédiction.
    Sans ce paramètre, LightGBM remet son compteur à 0 puis fork
    `omp_get_max_threads()` cœurs. Sur Mac, torch, scikit-learn et Homebrew
    ont chacun un `libomp` : le fil ouvrier saute d’un runtime à l’autre et
    meurt dans `__kmp_suspend_initialize_thread` (SIGSEGV à 0x580).
    """
    global _LIGHTGBM_PINNED
    if _LIGHTGBM_PINNED:
        return
    lib = getattr(getattr(lgb, "basic", None), "_LIB", None)
    setter = getattr(lib, "LGBM_SetMaxThreads", None)
    if setter is None:
        _LIGHTGBM_PINNED = True
        return
    try:
        import ctypes

        setter.argtypes = [ctypes.c_int]
        setter.restype = ctypes.c_int
    except Exception:
        pass
    try:
        setter(1)
    except Exception:
        return
    _LIGHTGBM_PINNED = True


class _Binned:
    """Une matrice et ses poids, binés une seule fois pour tous leurs ajustements LightGBM.

    LightGBM découpe les colonnes sans lire la cible : relancer `train` sur le même
    Dataset après `set_label` rend les arbres d’un Dataset neuf. Le Pool de CatBoost,
    lui, ne change pas de cible.
    """

    def __init__(self, x: np.ndarray, weights: np.ndarray) -> None:
        self.x = x
        self.weights = weights
        self._dataset: Any = None

    def dataset(self, lgb: Any, y: np.ndarray) -> Any:
        if self._dataset is None:
            self._dataset = lgb.Dataset(self.x, label=y, weight=self.weights, free_raw_data=False)
        else:
            self._dataset.set_label(y)
        return self._dataset


def _fit_one(
    x_train: np.ndarray,
    y_train: np.ndarray,
    weights: np.ndarray,
    x_next: np.ndarray,
    *,
    alpha: float,
    estimators: int,
    library: str = "lightgbm",
    binned: _Binned | None = None,
):
    fallback = float(np.average(y_train, weights=weights)) if len(y_train) else 0.0
    if len(y_train) < 8 or float(np.std(y_train)) < 1e-8:
        return fallback, None
    row = np.nan_to_num(x_next.reshape(1, -1), nan=0.0)
    if library == "catboost":
        from catboost import CatBoostRegressor

        model = CatBoostRegressor(
            loss_function=f"Quantile:alpha={float(alpha)}",
            iterations=int(estimators),
            depth=4 if estimators >= 24 else 3,
            learning_rate=0.08,
            random_seed=42,
            verbose=False,
            allow_writing_files=False,
            thread_count=1,
        )
        model.fit(x_train, y_train, sample_weight=weights)
        pred = float(np.asarray(model.predict(row)).reshape(-1)[0])
        return pred, model
    import lightgbm as lgb

    _pin_lightgbm(lgb)
    if binned is None:
        dataset = lgb.Dataset(x_train, label=y_train, weight=weights, free_raw_data=False)
    else:
        dataset = binned.dataset(lgb, y_train)
    params = {
        "objective": "quantile",
        "alpha": float(alpha),
        "num_leaves": 15 if estimators >= 24 else 7,
        "max_depth": 4,
        "min_data_in_leaf": 2,
        "feature_fraction": 0.85,
        "bagging_fraction": 0.9,
        "bagging_freq": 1,
        "verbosity": -1,
        "seed": 42,
        "num_threads": 1,
        "force_col_wise": True,
        "verbose": -1,
    }
    booster = lgb.train(params, dataset, num_boost_round=int(estimators))
    # Sans num_threads, predict remet le pool OpenMP au nombre de cœurs.
    pred = float(booster.predict(row, num_threads=1)[0])
    return pred, booster


def _predict_matrix(model: Any, library: str, rows: np.ndarray, fallback: float) -> np.ndarray:
    count = int(rows.shape[0]) if rows.ndim else 0
    if model is None or count == 0:
        return np.full(count, fallback, dtype=float)
    if library == "catboost":
        pred = np.asarray(model.predict(rows), dtype=float).reshape(-1)
    else:
        pred = np.asarray(model.predict(rows, num_threads=1), dtype=float).reshape(-1)
    return np.where(np.isfinite(pred), pred, fallback)


def _past_only_column(
    x: np.ndarray,
    y: np.ndarray,
    weights: np.ndarray,
    *,
    library: str,
    estimators: int,
) -> np.ndarray:
    """Prévision de chaque ligne sans son propre y.

    Le premier quart, trop court pour un modèle, reçoit la moyenne des cibles
    d'avant. Les quarts suivants sont prévus par un modèle ajusté seulement
    sur ce qui précède. La chaîne s'entraîne donc sur une prévision, comme
    au moment de servir le pas suivant.
    """
    n = int(y.shape[0])
    out = np.empty(n, dtype=float)
    if n == 0:
        return out
    if n == 1:
        out[0] = float(y[0])
    else:
        out[0] = float(y[1])
        for index in range(1, n):
            out[index] = float(y[:index].mean())
    if n < 32:
        return out
    cuts = [cut for cut in (n // 4, n // 2, (3 * n) // 4) if cut >= 16]
    for index, cut in enumerate(cuts):
        nxt = cuts[index + 1] if index + 1 < len(cuts) else n
        if nxt <= cut:
            continue
        _pred, model = _fit_one(
            x[:cut],
            y[:cut],
            weights[:cut],
            x[cut],
            alpha=0.5,
            estimators=estimators,
            library=library,
        )
        out[cut:nxt] = _predict_matrix(model, library, x[cut:nxt], float(y[:cut].mean()))
    return out


def _moments_from_alphas(found: dict[float, float], name: str, star_pool: int = 12) -> dict[str, float]:
    mid = _clip(name, found.get(0.5, next(iter(found.values()))), star_pool)
    lo = _clip(name, found.get(0.1, mid), star_pool)
    hi = _clip(name, found.get(0.9, mid), star_pool)
    if lo > mid:
        lo = mid
    if hi < mid:
        hi = mid
    return {"lo": lo, "mid": mid, "hi": hi}


def predict_moments(
    rows: list[dict[str, Any]],
    horizon: list[dict[str, Any]],
    *,
    mode: str,
    focus: int,
    families: Iterable[str],
    estimators: int = 48,
    quantiles: tuple[float, ...] = (0.1, 0.5, 0.9),
    library: str = "lightgbm",
) -> tuple[dict[str, dict[str, float]], list[dict[str, Any]], str]:
    """Médianes et quantiles du pas qui suit `rows`. La chaîne raffine les rangs."""
    n = len(rows)
    focus_used = max(1, min(int(focus), n))
    focus_start = n - focus_used
    lags, past_lags = lag_choice(n)
    past_names = past_columns(families)
    future_names = future_columns(families)
    indices = loss_indices(n, lags, focus_start, mode)
    alphas = tuple(sorted(set(quantiles)))
    if 0.5 not in alphas:
        alphas = tuple(sorted(alphas + (0.5,)))
    pool = star_pool_of(horizon[0] if horizon else None)

    x_time, used, feat_names = _design(
        rows,
        horizon,
        indices,
        lags=lags,
        past_lags=past_lags,
        past_names=past_names,
        future_names=future_names,
    )
    weights = np.asarray([row_weight(t, focus_start, mode) for t in used], dtype=float)
    if len(used) < 8 or x_time.size == 0:
        raise ValueError("Pas assez de tirages antérieurs pour ce mode.")
    x_next, _ = vector_at(
        rows,
        horizon,
        n,
        lags=lags,
        past_lags=past_lags,
        past_names=past_names,
        future_names=future_names,
    )
    x_next_arr = np.nan_to_num(np.asarray(x_next, dtype=float), nan=0.0)
    time_bins = _Binned(x_time, weights) if library == "lightgbm" else None

    def fit_quantiles(
        x: np.ndarray,
        y: np.ndarray,
        w: np.ndarray,
        x_row: np.ndarray,
        binned: _Binned | None,
    ) -> tuple[dict[float, float], Any]:
        found: dict[float, float] = {}
        median_model = None
        for alpha in alphas:
            pred, model = _fit_one(
                x, y, w, x_row, alpha=alpha, estimators=estimators, library=library, binned=binned
            )
            found[alpha] = pred
            if alpha == 0.5:
                median_model = model
        return found, median_model

    moments: dict[str, dict[str, float]] = {}
    importance_models: list[tuple[Any, list[str]]] = []
    for name in TEMPORAL_TARGETS:
        y = np.asarray([float(rows[t][name]) for t in used], dtype=float)
        found, median_model = fit_quantiles(x_time, y, weights, x_next_arr, time_bins)
        moments[name] = _moments_from_alphas(found, name, pool)
        if name == "sum" and median_model is not None:
            importance_models.append((median_model, feat_names))

    levels = {
        name: fit_quantiles(
            x_time,
            np.asarray([float(rows[t][name]) for t in used], dtype=float),
            weights,
            x_next_arr,
            time_bins,
        )
        for name in RANK_LEVELS
    }

    carried: dict[str, dict[str, float]] = {}
    past_hat: dict[str, dict[int, float]] = {}
    for name, lowers in CHAIN:
        lookup = {t: {key: past_hat[key][t] for key in lowers} for t in used}
        x_chain, chain_names = _with_lowers(x_time, used, feat_names, rows, lowers, lookup)
        lower_now = np.asarray([float(carried[key]["mid"]) for key in lowers], dtype=float)
        x_vec = np.concatenate([x_next_arr, np.nan_to_num(lower_now, nan=0.0)])
        y = np.asarray([float(rows[t][name]) for t in used], dtype=float)
        if lowers:
            chain_bins = _Binned(x_chain, weights) if library == "lightgbm" else None
            found, median_model = fit_quantiles(x_chain, y, weights, x_vec, chain_bins)
        else:
            # Sans rang d’avant, la chaîne lit la matrice, la cible et les poids du niveau : mêmes arbres.
            found, median_model = levels[name]
        moments[name] = _moments_from_alphas(found, name, pool)
        carried[name] = moments[name]
        column = _past_only_column(
            x_chain,
            y,
            weights,
            library=library,
            estimators=estimators,
        )
        past_hat[name] = {t: float(column[index]) for index, t in enumerate(used)}
        if name == "n1" and median_model is not None:
            importance_models.append((median_model, chain_names))

    for name in RANK_LEVELS:
        moments[f"level:{name}"] = _moments_from_alphas(levels[name][0], f"level:{name}", pool)

    for name in RANK_LEVELS:
        y = np.asarray([float(rows[t][f"d_{name}"]) for t in used], dtype=float)
        found, _model = fit_quantiles(x_time, y, weights, x_next_arr, time_bins)
        moments[f"delta:{name}"] = _moments_from_alphas(found, f"delta:{name}", pool)

    return moments, _importance(importance_models), library


def _importance(models: list[tuple[Any, list[str]]], limit: int = 15) -> list[dict[str, Any]]:
    gains: dict[str, float] = {}
    for model, names in models:
        if hasattr(model, "get_feature_importance"):
            values = model.get_feature_importance()
        elif hasattr(model, "feature_importance"):
            values = model.feature_importance(importance_type="gain")
        else:
            values = getattr(model, "feature_importances_", None)
        if values is None:
            continue
        for name, gain in zip(names, values):
            gains[name] = gains.get(name, 0.0) + float(gain)
    ordered = sorted(gains.items(), key=lambda item: (-item[1], item[0]))
    out = []
    for name, gain in ordered:
        if gain <= 0:
            continue
        out.append({"name": name, "gain": round(gain, 4), "family": column_family(name)})
        if len(out) >= limit:
            break
    return out


def darts_covariate_rows(
    rows: list[dict[str, Any]],
    horizon: list[dict[str, Any]],
    past_names: list[str],
    future_names: list[str],
) -> tuple[list[str], list[dict[str, Any]], list[str], list[dict[str, Any]]]:
    """Covariables Darts. Pulse est décalé d’un cran et sort de la série future.

    Darts lit le futur à t+1 pour toutes les colonnes futures. La ligne t+1
    a réajusté Pulse avec le tirage t. On le donne donc comme covariable
    passée : le lag 1 est l’état connu avant t.
    """
    clock_names = [name for name in future_names if name not in FUTURE_PULSE]
    pulse_names = [name for name in future_names if name in FUTURE_PULSE]
    past_used = [*past_names, *pulse_names]
    shifted = shifted_pulse(rows, horizon, pulse_names) if pulse_names else [[] for _ in rows]
    past_rows: list[dict[str, Any]] = []
    for row, extra in zip(rows, shifted):
        item = {name: row.get(name, 0.0) for name in past_names}
        item.update(zip(pulse_names, extra))
        past_rows.append(item)
    future_rows = [{name: row.get(name, 0.0) for name in clock_names} for row in rows]
    future_rows.extend({name: row.get(name, 0.0) for name in clock_names} for row in horizon)
    return past_used, past_rows, clock_names, future_rows


def darts_training_window(n: int, focus: int, mode: str) -> tuple[int, list[float]] | None:
    """Début de série et poids par date, les mêmes lignes que `loss_indices`.

    La série commence `lags` tirages avant la première ligne de perte, pour que
    les décalages existent. En fenêtre, ce préfixe pèse 0 : il sert de contexte,
    il n’entre pas dans la perte. None sans huit lignes de perte.
    """
    if n <= 0:
        return None
    focus_used = max(1, min(int(focus), n))
    focus_start = n - focus_used
    lags, _past = lag_choice(n)
    trained = loss_indices(n, lags, focus_start, mode)
    if len(trained) < 8:
        return None
    start = max(0, trained[0] - lags)
    weights = [row_weight(start + index, focus_start, mode) for index in range(n - start)]
    return start, weights


def try_darts_medians(
    rows: list[dict[str, Any]],
    horizon: list[dict[str, Any]],
    *,
    mode: str,
    focus: int,
    families: Iterable[str],
) -> dict[str, float] | None:
    """Un pas Darts. None si le paquet ou l’ajustement manque.

    Pulse reste une covariable passée, décalée d’un cran : Darts ne le lit pas
    dans le futur, où la ligne d’après a déjà réajusté l’onde avec le tirage prévu.
    """
    try:
        from darts.models import LightGBMModel
    except Exception:
        return None
    n = len(rows)
    fitted = darts_training_window(n, focus, mode)
    if fitted is None:
        return None
    start, weight_values = fitted
    lags, past_lags = lag_choice(n)
    past_names = past_columns(families)
    future_names = future_columns(families)
    target_names = ["sum", "star_sum", "n1", "parity", "spread", "consecutive", "star_consecutive"]
    pool = star_pool_of(horizon[0] if horizon else None)
    try:
        try:
            import lightgbm as lgb

            _pin_lightgbm(lgb)
        except Exception:
            pass
        from darts import TimeSeries

        def series(source: list[dict[str, Any]], names: list[str]):
            data = np.asarray([[float(row.get(name) or 0.0) for name in names] for row in source], dtype=float)
            return TimeSeries.from_values(np.nan_to_num(data))

        window = rows[start:]
        target = series(window, target_names)
        past_used, past_rows, clock_names, future_rows = darts_covariate_rows(
            window, horizon, past_names, future_names
        )
        past = series(past_rows, past_used) if past_used else None
        future = series(future_rows, clock_names) if clock_names else None
        kwargs: dict[str, Any] = {
            "lags": lags,
            "output_chunk_length": 1,
            "random_state": 42,
            "verbose": -1,
            "n_jobs": 1,
            # Sans likelihood, Darts ajuste un L2 : une moyenne, pas la médiane qu’il remplace.
            "likelihood": "quantile",
            "quantiles": [0.5],
        }
        if past is not None:
            kwargs["lags_past_covariates"] = past_lags
        if future is not None:
            kwargs["lags_future_covariates"] = (min(FUTURE_BACK, lags), FUTURE_FWD)
        model = LightGBMModel(**kwargs)
        fit_args: dict[str, Any] = {
            "series": target,
            "past_covariates": past,
            "future_covariates": future,
        }
        fit_args["sample_weight"] = TimeSeries.from_values(np.asarray(weight_values, dtype=float).reshape(-1, 1))
        try:
            model.fit(**fit_args)
        except TypeError:
            fit_args.pop("sample_weight", None)
            model.fit(**fit_args)
        pred = model.predict(
            n=1,
            series=target,
            past_covariates=past,
            future_covariates=future,
        )
        values = np.asarray(pred.values(), dtype=float).reshape(-1)
        if values.size < len(target_names):
            return None
        return {name: _clip(name, float(values[i]), pool) for i, name in enumerate(target_names)}
    except Exception:
        return None


# Sur un cœur, avec les 52 covariables : 0,8 s par pas sur trois ans ; amazon/chronos-2 (120 M) en prend 3,1.
CHRONOS_MODEL = "autogluon/chronos-2-small"
CHRONOS_LEVELS = (0.1, 0.5, 0.9)

_CHRONOS: Any = None
_CHRONOS_ERROR: str | None = None
_CHRONOS_LOCK = threading.Lock()


def chronos_error() -> str | None:
    """Pourquoi Chronos n’a pas répondu dans ce processus. Il n’est retenté qu’au redémarrage de l’API."""
    return _CHRONOS_ERROR


def chronos_quantiles(items: list[dict[str, Any]]) -> list[list[dict[str, float]]]:
    """Bandes 10–90 du tirage qui suit chaque entrée, une par variable de la cible, en un seul appel à Chronos-2.

    Une entrée suit le format de Chronos-2 : `target` (variables × tirages),
    `past_covariates`, `future_covariates`. Un échec (paquet, poids, appel)
    lève `RuntimeError` et reste noté : les appels suivants échouent aussitôt,
    sans retélécharger ni rappeler le modèle.
    """
    global _CHRONOS, _CHRONOS_ERROR
    with _CHRONOS_LOCK:
        if _CHRONOS_ERROR is not None:
            raise RuntimeError(_CHRONOS_ERROR)
        try:
            import torch
            from chronos import BaseChronosPipeline

            if _CHRONOS is None:
                cuda = torch.cuda.is_available()
                _CHRONOS = BaseChronosPipeline.from_pretrained(
                    CHRONOS_MODEL,
                    device_map="cuda" if cuda else "cpu",
                    torch_dtype=torch.bfloat16 if cuda else torch.float32,
                )
            quantiles, _mean = _CHRONOS.predict_quantiles(items, prediction_length=1, quantile_levels=list(CHRONOS_LEVELS))
            tables = [np.asarray(table, dtype=float).reshape(-1, len(CHRONOS_LEVELS)) for table in quantiles]
            if len(tables) != len(items) or not all(np.isfinite(table).all() for table in tables):
                raise ValueError("quantile manquant ou non fini")
            bands: list[list[dict[str, float]]] = []
            for table in tables:
                rows_out: list[dict[str, float]] = []
                for row in table:
                    lo, mid, hi = (float(row[0]), float(row[1]), float(row[2]))
                    if not lo <= mid <= hi:
                        raise ValueError("quantile non croissant")
                    rows_out.append({"lo": lo, "mid": mid, "hi": hi})
                bands.append(rows_out)
        except Exception as exc:
            detail = " ".join(str(exc).split())
            _CHRONOS_ERROR = f"{type(exc).__name__}: {detail if len(detail) <= 300 else detail[:299] + '…'}"
            raise RuntimeError(_CHRONOS_ERROR) from exc
    return bands


def compute_part(
    prefix: list[dict[str, Any]],
    horizon: list[dict[str, Any]],
    part: str,
    settings: StepSettings,
) -> dict[str, Any]:
    """Un morceau d’un pas, pour les deux modes : LightGBM, CatBoost, Darts ou Chronos."""
    if part == "chronos":
        return _chronos_part(prefix, horizon, settings)
    out: dict[str, Any] = {}
    for mode in MODES:
        if part in MODEL_PARTS:
            try:
                moments, importance, _engine = predict_moments(
                    prefix,
                    horizon,
                    mode=mode,
                    focus=settings.focus,
                    families=settings.families,
                    estimators=settings.estimators,
                    quantiles=settings.quantiles,
                    library=part,
                )
            except Exception as exc:
                out[mode] = {"error": str(exc) or type(exc).__name__}
            else:
                out[mode] = {"moments": moments, "importance": importance}
        elif part == "darts":
            out[mode] = try_darts_medians(
                prefix,
                horizon,
                mode=mode,
                focus=settings.focus,
                families=settings.families,
            )
    # Même structure qu’un morceau relu du cache.
    return json.loads(json.dumps(out))


def chronos_inputs(
    prefix: list[dict[str, Any]],
    horizon: list[dict[str, Any]],
    focus: int,
    families: Iterable[str],
) -> list[dict[str, Any]]:
    """Entrées Chronos-2 des deux modes, dans l’ordre de MODES : trois cibles et les covariables cochées.

    Les horloges et Pulse sont connus pour le tirage prévu, `horizon[0]` ;
    Chronos-2 lit aussi leur historique. Les autres familles s’arrêtent au
    dernier tirage sorti. Pulse sur ce tirage n’utilise que les sorties d’avant.
    """
    past = past_columns(families)
    future = future_columns(families)
    windows = {"corpus": prefix, "fenetre": prefix[-focus:]}
    items: list[dict[str, Any]] = []
    for mode in MODES:
        window = windows[mode]
        item: dict[str, Any] = {"target": np.asarray([[float(row[name]) for row in window] for name in CHRONOS_SERIES])}
        if past or future:
            item["past_covariates"] = {col: np.asarray([float(row[col]) for row in window]) for col in past + future}
        if future:
            item["future_covariates"] = {col: np.asarray([float(horizon[0][col])]) for col in future}
        items.append(item)
    return items


def _chronos_part(prefix: list[dict[str, Any]], horizon: list[dict[str, Any]], settings: StepSettings) -> dict[str, Any]:
    """Bandes 10–90 de Chronos-2 pour les deux modes, en un appel, et les covariables lues. Un échec rend son message.

    Un pas par appel : sur processeur, Chronos-2 lit un lot de dix pas plus
    lentement que dix appels, et refuse un lot dont les covariables diffèrent.
    """
    try:
        bands = chronos_quantiles(chronos_inputs(prefix, horizon, settings.focus, settings.families))
    except RuntimeError as exc:
        return {"error": str(exc)}
    out: dict[str, Any] = {mode: dict(zip(CHRONOS_SERIES, mode_bands)) for mode, mode_bands in zip(MODES, bands)}
    out["covariates"] = {"past": len(past_columns(settings.families)), "future": len(future_columns(settings.families))}
    return json.loads(json.dumps(out))
