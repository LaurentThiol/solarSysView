"""LightGBM à lags (le schéma Darts) et chaîne de rangs.

Darts `LightGBMModel`, quand le paquet est là, remplace la médiane temporelle
du prochain pas. La chaîne n1 → écarts reste en LightGBM direct : le
conditionnement est dans le même tirage, ce que les lags ne portent pas.
Chronos, s’il est installé, ne mélange que somme, somme des étoiles et n1.
Les niveaux n1…n5, e1, e2 et leurs deltas sont prévus à part, puis arbitrés
avec cette chaîne avant la grille.
"""

from __future__ import annotations

import importlib.util
import os
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
    SHAPE_SERIES,
    TARGETS,
    TEMPORAL_TARGETS,
    column_family,
    future_columns,
    grid_shape,
    normalize_families,
    past_columns,
)
from synchro.nextdata.empirical import public_base, recount
from synchro.nextdata.panel import Frame, build_frame
from synchro.nextdata.project import beam, compose_ranks, reconstruct, stamp_grid

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
    "star_sum": (3.0, 23.0),
    "e1": (1.0, 11.0),
    "e_gap": (1.0, 11.0),
    "spread": (4.0, 49.0),
    "consecutive": (0.0, 4.0),
    "star_spread": (1.0, 11.0),
    "star_consecutive": (0.0, 1.0),
    "level:n1": (1.0, 46.0),
    "level:n2": (2.0, 47.0),
    "level:n3": (3.0, 48.0),
    "level:n4": (4.0, 49.0),
    "level:n5": (5.0, 50.0),
    "level:e1": (1.0, 11.0),
    "level:e2": (2.0, 12.0),
    "delta:n1": (-45.0, 45.0),
    "delta:n2": (-45.0, 45.0),
    "delta:n3": (-45.0, 45.0),
    "delta:n4": (-45.0, 45.0),
    "delta:n5": (-45.0, 45.0),
    "delta:e1": (-11.0, 11.0),
    "delta:e2": (-11.0, 11.0),
}

# Niveaux et deltas : mêmes lags que la somme, sans `same:` ni entrée dans TARGETS.
RANK_LEVELS: tuple[str, ...] = ("n1", "n2", "n3", "n4", "n5", "e1", "e2")


def _installed(module: str) -> bool:
    """Présence du paquet, sans l’importer.

    Importer Darts, Chronos ou torch ici gèle le processus (GIL, backend
    graphique) pendant que la page demande aussi les tirages.
    """
    try:
        return importlib.util.find_spec(module) is not None
    except Exception:
        return False


def lightgbm_import_error() -> str | None:
    try:
        import lightgbm  # noqa: F401
    except Exception as exc:
        return str(exc)
    return None


def lightgbm_hint(message: str | None) -> str | None:
    if not message:
        return None
    lowered = message.lower()
    if "libomp" in lowered or "dlopen" in lowered:
        return "Sur Mac : brew install libomp, puis relancez ./launch."
    return None


def dependency_status() -> dict[str, Any]:
    error = lightgbm_import_error()
    return {
        "lightgbm": error is None,
        "lightgbm_error": error,
        "hint": lightgbm_hint(error),
        "darts": _installed("darts"),
        "chronos": _installed("chronos"),
        "torch": _installed("torch"),
        "matplotlib": _installed("matplotlib"),
        "catboost": _installed("catboost"),
        "ready": error is None,
        "install": "./launch install-nextdata",
    }


def lag_choice(mode: str, focus: int, n: int) -> tuple[int, int]:
    """Lags du corpus, ou lags plafonnés de la fenêtre seule."""
    if mode == "fenetre":
        lags, past = (12, 6) if int(focus) <= 50 else (16, 8)
    else:
        lags, past = 16, 8
    cap = max(2, n // 4)
    lags = max(2, min(lags, cap, max(2, n - 8)))
    past = max(1, min(past, lags))
    return int(lags), int(past)


def loss_indices(n: int, lags: int, focus_start: int, mode: str) -> list[int]:
    """Lignes qui entrent dans la perte. La fenêtre seule ignore l’avant-focus."""
    if n <= lags:
        return []
    if mode == "fenetre":
        start = focus_start + lags
        if n - start < 30:
            start = max(lags, focus_start)
        if n - start < 8:
            start = lags
        return list(range(max(start, lags), n))
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
    lower: dict[str, float] | None = None,
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
            values.append(_level(rows, horizon, t + offset, name))
            names.append(f"fut:{name}:{offset}")
    for name, raw in (lower or {}).items():
        values.append(float(raw))
        names.append(f"same:{name}")
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
    lower_names: tuple[str, ...] = (),
) -> tuple[np.ndarray, list[int], list[str]]:
    matrix: list[list[float]] = []
    used: list[int] = []
    names: list[str] = []
    need = max(lags, past_lags)
    for t in indices:
        if t < need:
            continue
        lower = {name: float(rows[t][name]) for name in lower_names}
        vec, names = vector_at(
            rows,
            horizon,
            t,
            lags=lags,
            past_lags=past_lags,
            past_names=past_names,
            future_names=future_names,
            lower=lower,
        )
        matrix.append(vec)
        used.append(t)
    if not matrix:
        return np.zeros((0, 0), dtype=float), [], names
    data = np.asarray(matrix, dtype=float)
    return np.nan_to_num(data, nan=0.0, posinf=0.0, neginf=0.0), used, names


def _clip(name: str, value: float) -> float:
    lo, hi = CLAMPS.get(name, (-1e6, 1e6))
    if not np.isfinite(value):
        return (lo + hi) / 2.0
    return float(min(hi, max(lo, value)))


def catboost_import_error() -> str | None:
    try:
        import catboost  # noqa: F401
    except Exception as exc:
        return str(exc)
    return None


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


def _fit_one(
    x_train: np.ndarray,
    y_train: np.ndarray,
    weights: np.ndarray,
    x_next: np.ndarray,
    *,
    alpha: float,
    estimators: int,
    library: str = "lightgbm",
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
    dataset = lgb.Dataset(x_train, label=y_train, weight=weights, free_raw_data=False)
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


def _moments_from_alphas(found: dict[float, float], name: str) -> dict[str, float]:
    mid = _clip(name, found.get(0.5, next(iter(found.values()))))
    lo = _clip(name, found.get(0.1, mid))
    hi = _clip(name, found.get(0.9, mid))
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
    lags, past_lags = lag_choice(mode, focus_used, n)
    past_names = past_columns(families)
    future_names = future_columns(families)
    indices = loss_indices(n, lags, focus_start, mode)
    alphas = tuple(sorted(set(quantiles)))
    if 0.5 not in alphas:
        alphas = tuple(sorted(alphas + (0.5,)))

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

    moments: dict[str, dict[str, float]] = {}
    importance_models: list[tuple[Any, list[str]]] = []
    for name in TEMPORAL_TARGETS:
        y = np.asarray([float(rows[t][name]) for t in used], dtype=float)
        found: dict[float, float] = {}
        median_model = None
        for alpha in alphas:
            pred, model = _fit_one(
                x_time,
                y,
                weights,
                x_next_arr,
                alpha=alpha,
                estimators=estimators,
                library=library,
            )
            found[alpha] = pred
            if alpha == 0.5:
                median_model = model
        moments[name] = _moments_from_alphas(found, name)
        if name == "sum" and median_model is not None:
            importance_models.append((median_model, feat_names))

    carried: dict[str, dict[str, float]] = {}
    for name, lowers in CHAIN:
        x_chain, used_chain, chain_names = _design(
            rows,
            horizon,
            indices,
            lags=lags,
            past_lags=past_lags,
            past_names=past_names,
            future_names=future_names,
            lower_names=lowers,
        )
        if len(used_chain) < 8:
            raise ValueError("La chaîne de rangs n’a pas assez de lignes.")
        w_chain = np.asarray([row_weight(t, focus_start, mode) for t in used_chain], dtype=float)
        lower_now = {key: carried[key]["mid"] for key in lowers}
        vec, _ = vector_at(
            rows,
            horizon,
            n,
            lags=lags,
            past_lags=past_lags,
            past_names=past_names,
            future_names=future_names,
            lower=lower_now,
        )
        x_vec = np.nan_to_num(np.asarray(vec, dtype=float), nan=0.0)
        y = np.asarray([float(rows[t][name]) for t in used_chain], dtype=float)
        found = {}
        median_model = None
        for alpha in alphas:
            pred, model = _fit_one(
                x_chain, y, w_chain, x_vec, alpha=alpha, estimators=estimators, library=library
            )
            found[alpha] = pred
            if alpha == 0.5:
                median_model = model
        moments[name] = _moments_from_alphas(found, name)
        carried[name] = moments[name]
        if name == "n1" and median_model is not None:
            importance_models.append((median_model, chain_names))

    for name in RANK_LEVELS:
        y = np.asarray([float(rows[t][name]) for t in used], dtype=float)
        found = {}
        for alpha in alphas:
            pred, _model = _fit_one(
                x_time,
                y,
                weights,
                x_next_arr,
                alpha=alpha,
                estimators=estimators,
                library=library,
            )
            found[alpha] = pred
        moments[f"level:{name}"] = _moments_from_alphas(found, f"level:{name}")

    for name in RANK_LEVELS:
        y = np.asarray([float(rows[t][f"d_{name}"]) for t in used], dtype=float)
        pred, _model = _fit_one(
            x_time,
            y,
            weights,
            x_next_arr,
            alpha=0.5,
            estimators=estimators,
            library=library,
        )
        mid = _clip(f"delta:{name}", pred)
        level = moments[f"level:{name}"]
        half = max(0.0, (float(level["hi"]) - float(level["lo"])) / 2.0)
        moments[f"delta:{name}"] = {"lo": mid - half, "mid": mid, "hi": mid + half}

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


def try_darts_medians(
    rows: list[dict[str, Any]],
    horizon: list[dict[str, Any]],
    *,
    mode: str,
    focus: int,
    families: Iterable[str],
) -> dict[str, float] | None:
    """Un pas Darts. None si le paquet ou l’ajustement manque."""
    try:
        from darts.models import LightGBMModel
    except Exception:
        return None
    n = len(rows)
    focus_used = max(1, min(int(focus), n))
    focus_start = n - focus_used
    lags, past_lags = lag_choice(mode, focus_used, n)
    past_names = past_columns(families)
    future_names = future_columns(families)
    target_names = ["sum", "star_sum", "n1", "parity", "spread", "consecutive", "star_consecutive"]
    start = max(0, focus_start - lags) if mode == "fenetre" else 0
    if n - start <= lags + 8:
        return None
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

        target = series(rows[start:], target_names)
        past = series(rows[start:], past_names) if past_names else None
        future_rows = [{name: row.get(name, 0.0) for name in future_names} for row in rows[start:]]
        future_rows.extend({name: row.get(name, 0.0) for name in future_names} for row in horizon)
        future = series(future_rows, future_names) if future_names else None
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
        if mode == "corpus":
            weights = [[3.0 if (start + i) >= focus_start else 1.0] for i in range(n - start)]
            fit_args["sample_weight"] = TimeSeries.from_values(np.asarray(weights, dtype=float))
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
        return {name: _clip(name, float(values[i])) for i, name in enumerate(target_names)}
    except Exception:
        return None


_CHRONOS = None


def chronos_point(values: list[float]) -> float | None:
    """Médiane Chronos à un pas. None si le paquet ou le poids manque."""
    global _CHRONOS
    if len(values) < 8:
        return None
    try:
        import torch
        from chronos import ChronosPipeline
    except Exception:
        return None
    try:
        if _CHRONOS is None:
            device = "cuda" if torch.cuda.is_available() else "cpu"
            dtype = torch.bfloat16 if device == "cuda" else torch.float32
            _CHRONOS = ChronosPipeline.from_pretrained(
                "amazon/chronos-t5-small",
                device_map=device,
                torch_dtype=dtype,
            )
        context = torch.tensor(values, dtype=torch.float32)
        forecast = _CHRONOS.predict(context=context, prediction_length=1, num_samples=20)
        median = np.median(np.asarray(forecast[0]), axis=0)
        return float(median.reshape(-1)[-1])
    except Exception:
        return None


def blend_weight(mae_lgb: float, mae_chronos: float) -> float:
    """Poids de LightGBM. L’erreur Chronos plus forte laisse plus de place à LightGBM."""
    left = max(float(mae_lgb), 1e-6)
    right = max(float(mae_chronos), 1e-6)
    return right / (left + right)


def blend_mid(lgb: float, chronos: float | None, weight: float) -> float:
    if chronos is None:
        return float(lgb)
    w = min(1.0, max(0.0, float(weight)))
    return w * float(lgb) + (1.0 - w) * float(chronos)


def _apply_external(
    moments: dict[str, dict[str, float]],
    external: dict[str, float] | None,
    *,
    names: tuple[str, ...] = ("sum", "star_sum", "n1", "parity", "spread", "consecutive", "star_consecutive"),
    mix_n1: bool = False,
) -> None:
    if not external:
        return
    for name in names:
        if name not in external or name not in moments:
            continue
        value = _clip(name, external[name])
        if name == "n1" and mix_n1:
            value = 0.5 * moments[name]["mid"] + 0.5 * value
        moments[name]["mid"] = value
        moments[name]["lo"] = min(moments[name]["lo"], value)
        moments[name]["hi"] = max(moments[name]["hi"], value)


def _round_moments(moments: dict[str, dict[str, float]]) -> dict[str, dict[str, float]]:
    out = {}
    for name, band in moments.items():
        out[name] = {key: round(float(band[key]), 4) for key in ("lo", "mid", "hi")}
    return out


def _rank_view(moments: dict[str, dict[str, float]]) -> dict[str, dict[str, float]]:
    """n1…n5 et e2 reconstruits, pour les anneaux et les courbes."""
    kept = ("sum", "parity", "star_sum", "n1", "e1", "spread", "consecutive", "star_consecutive")
    view = {name: dict(moments[name]) for name in kept if name in moments}
    gaps = [moments[name]["mid"] for name in ("g1", "g2", "g3", "g4")]
    mids = reconstruct(moments["n1"]["mid"], gaps)
    widths = []
    cursor_lo = moments["n1"]["lo"]
    cursor_hi = moments["n1"]["hi"]
    widths.append(max(0.0, cursor_hi - cursor_lo))
    for name in ("g1", "g2", "g3", "g4"):
        cursor_lo += moments[name]["lo"]
        cursor_hi += moments[name]["hi"]
        widths.append(max(0.0, cursor_hi - cursor_lo))
    for index, name in enumerate(("n1", "n2", "n3", "n4", "n5")):
        mid = mids[index]
        half = widths[index] / 2.0
        view[name] = {"lo": mid - half, "mid": mid, "hi": mid + half}
    e_mid = moments["e1"]["mid"] + max(1.0, moments["e_gap"]["mid"])
    e_half = (moments["e1"]["hi"] - moments["e1"]["lo"] + moments["e_gap"]["hi"] - moments["e_gap"]["lo"]) / 2.0
    view["e2"] = {"lo": e_mid - e_half, "mid": e_mid, "hi": e_mid + e_half}
    view["e_gap"] = dict(moments["e_gap"])
    view["star_spread"] = dict(moments["e_gap"])
    return _round_moments(view)


def run_forecast(
    draws: list[dict[str, Any]],
    *,
    focus: int = 50,
    years: Iterable[str] | None = None,
    primary: str = "corpus",
    weekday: str | None = None,
    covariates: Iterable[str] | None = None,
    with_chronos: bool = False,
    estimators: int = 40,
    backtest_estimators: int = 12,
) -> dict[str, Any]:
    if lightgbm_import_error():
        status = dependency_status()
        detail = status.get("hint") or status.get("lightgbm_error") or "LightGBM ne se charge pas."
        return {
            "ok": False,
            "error": f"{detail} Sinon : ./launch install-nextdata.",
            **status,
        }
    mode_primary = primary if primary in ("corpus", "fenetre") else "corpus"
    families = normalize_families(covariates)
    try:
        frame = build_frame(draws, years=years, focus=int(focus), weekday=weekday)
    except ValueError as exc:
        return {"ok": False, "error": str(exc), **dependency_status()}

    base_rows = frame.rows[frame.focus_start :]
    base = recount(base_rows, star_pool=frame.star_pool)
    libraries = ["lightgbm"]
    catboost_error = catboost_import_error()
    if catboost_error is None:
        libraries.append("catboost")
    modes: dict[str, Any] = {}
    moment_book: dict[str, dict[str, dict[str, float]]] = {}
    engines: dict[str, str] = {}
    for mode in ("corpus", "fenetre"):
        try:
            moments, importance, engine = predict_moments(
                frame.rows,
                frame.horizon,
                mode=mode,
                focus=frame.focus,
                families=families,
                estimators=estimators,
                library="lightgbm",
            )
        except ValueError as exc:
            return {"ok": False, "error": str(exc), **dependency_status()}
        darts_values = try_darts_medians(
            frame.rows,
            frame.horizon,
            mode=mode,
            focus=frame.focus,
            families=families,
        )
        if darts_values:
            _apply_external(moments, darts_values, mix_n1=True)
            engine = "darts"
        moment_book[mode] = moments
        engines[mode] = engine
        modes[mode] = {"importance": importance, "engine": engine}
        if "catboost" in libraries:
            try:
                cat_moments, cat_importance, _cat_engine = predict_moments(
                    frame.rows,
                    frame.horizon,
                    mode=mode,
                    focus=frame.focus,
                    families=families,
                    estimators=estimators,
                    library="catboost",
                )
            except Exception as exc:
                libraries = ["lightgbm"]
                catboost_error = str(exc)
                for built in modes.values():
                    built.pop("catboost", None)
                for key in ("corpus_catboost", "fenetre_catboost"):
                    moment_book.pop(key, None)
            else:
                moment_book[f"{mode}_catboost"] = cat_moments
                modes[mode]["catboost"] = {
                    "importance": cat_importance,
                    "engine": "catboost",
                    "_moments": cat_moments,
                }

    from synchro.nextdata.backtest import walk_forward

    walked = walk_forward(
        frame,
        families,
        estimators=backtest_estimators,
        libraries=tuple(libraries),
    )
    chronos_info: dict[str, Any] = {"used": False}
    if with_chronos:
        chronos_info = _blend_chronos(frame, moment_book, walked)

    chart_grids: dict[str, dict[str, Any]] = {}
    for mode in ("corpus", "fenetre"):
        moments, trace = compose_ranks(moment_book[mode], frame.rows[-1])
        moment_book[mode] = moments
        ranked = beam(moments, base, star_pool=frame.star_pool)
        if not ranked:
            return {"ok": False, "error": "Aucune grille entière n’a pu être projetée.", **dependency_status()}
        best = ranked[0]
        chart_grids[mode] = best
        view = _rank_view(moments)
        mae_sum = walked["metrics"][mode]["mae"].get("sum")
        modes[mode].update(
            {
                "grid": {"numbers": best["numbers"], "stars": best["stars"], "score": best["score"]},
                "alternates": ranked[1:],
                "quantiles": view,
                "mae_sum": mae_sum,
                "blend_weight": chronos_info.get(mode, {}).get("weight", 1.0),
                "chronos": chronos_info.get(mode),
                "arbitration": None if trace is None else stamp_grid(trace, best["numbers"], best["stars"]),
            }
        )
        cat_block = modes[mode].get("catboost")
        if cat_block and f"{mode}_catboost" in moment_book:
            cat_moments, cat_trace = compose_ranks(moment_book[f"{mode}_catboost"], frame.rows[-1])
            moment_book[f"{mode}_catboost"] = cat_moments
            cat_ranked = beam(cat_moments, base, star_pool=frame.star_pool)
            if not cat_ranked:
                return {"ok": False, "error": "CatBoost n’a pas produit de grille entière.", **dependency_status()}
            cat_best = cat_ranked[0]
            chart_grids[f"{mode}_catboost"] = cat_best
            cat_metrics = walked["metrics"].get(f"{mode}_catboost") or {}
            cat_block.pop("_moments", None)
            cat_block.update(
                {
                    "grid": {
                        "numbers": cat_best["numbers"],
                        "stars": cat_best["stars"],
                        "score": cat_best["score"],
                    },
                    "alternates": cat_ranked[1:],
                    "quantiles": _rank_view(moment_book[f"{mode}_catboost"]),
                    "mae_sum": (cat_metrics.get("mae") or {}).get("sum"),
                    "arbitration": None
                    if cat_trace is None
                    else stamp_grid(cat_trace, cat_best["numbers"], cat_best["stars"]),
                }
            )

    return {
        "ok": True,
        "focus": frame.focus,
        "focus_requested": int(focus),
        "years": frame.years,
        "years_present": frame.years_present,
        "primary": mode_primary,
        "weekday": frame.weekday,
        "covariates": families,
        "next_date": frame.next_date,
        "star_pool": frame.star_pool,
        "anchor_year": frame.anchor_year,
        "engine": engines.get(mode_primary, "lightgbm"),
        "catboost": catboost_error is None,
        "catboost_error": catboost_error,
        "dependencies": dependency_status(),
        "modes": modes,
        "base": public_base(base),
        "backtest": walked,
        "chart": _chart(frame, walked["rows"], moment_book, chart_grids),
        "best_mae_sum": walked["best_mae_sum"],
        "chronos": {"used": bool(chronos_info.get("used"))},
    }


def run_training(
    draws: list[dict[str, Any]],
    *,
    focus: int = 50,
    years: Iterable[str] | None = None,
    weekday: str | None = None,
    covariates: Iterable[str] | None = None,
    estimators: int = 16,
    shift: int | None = None,
    with_chronos: bool = False,
) -> dict[str, Any]:
    """Banc −1…−10. Même réglage que le pronostic, Chronos en option."""
    if lightgbm_import_error():
        status = dependency_status()
        detail = status.get("hint") or status.get("lightgbm_error") or "LightGBM ne se charge pas."
        return {
            "ok": False,
            "error": f"{detail} Sinon : ./launch install-nextdata.",
            **status,
        }
    families = normalize_families(covariates)
    try:
        frame = build_frame(draws, years=years, focus=int(focus), weekday=weekday)
    except ValueError as exc:
        return {"ok": False, "error": str(exc), **dependency_status()}
    libraries = ["lightgbm"]
    catboost_error = catboost_import_error()
    if catboost_error is None:
        libraries.append("catboost")
    from synchro.nextdata.backtest import shift_report

    try:
        report = shift_report(
            frame,
            families,
            estimators=estimators,
            libraries=tuple(libraries),
            only=shift,
            with_chronos=with_chronos,
        )
    except ValueError as exc:
        return {"ok": False, "error": str(exc), **dependency_status()}
    return {
        "ok": True,
        "focus": frame.focus,
        "focus_requested": int(focus),
        "years": frame.years,
        "years_present": frame.years_present,
        "weekday": frame.weekday,
        "covariates": families,
        "anchor_year": frame.anchor_year,
        "catboost": catboost_error is None,
        "catboost_error": catboost_error,
        "dependencies": dependency_status(),
        **report,
    }


def _blend_chronos(
    frame: Frame,
    moment_book: dict[str, dict[str, dict[str, float]]],
    walked: dict[str, Any],
) -> dict[str, Any]:
    """Chronos prévoit le prochain tirage, son poids se règle sur le dernier tirage du focus.

    Deux lectures par mode : sans le dernier tirage, Chronos est noté contre
    le retour LightGBM du même tirage ; avec lui, il donne la valeur mélangée.
    """
    info: dict[str, Any] = {"used": False}
    if len(frame.rows) < 12:
        return info
    actual = frame.rows[-1]
    prefix = frame.rows[:-1]
    held = next((step for step in walked["rows"] if step["date"] == actual["date"]), None)
    for mode in ("corpus", "fenetre"):
        if mode == "fenetre":
            window = prefix[-frame.focus :]
            ahead = frame.rows[-frame.focus :]
        else:
            window = prefix
            ahead = frame.rows
        holdout = chronos_point([float(row["sum"]) for row in window])
        points = {
            "sum": chronos_point([float(row["sum"]) for row in ahead]),
            "star_sum": chronos_point([float(row["star_sum"]) for row in ahead]),
            "n1": chronos_point([float(row["n1"]) for row in ahead]),
        }
        if holdout is None or points["sum"] is None or held is None:
            info[mode] = {"weight": 1.0, "available": False}
            continue
        info["used"] = True
        lgb_mae = abs(float(held[mode]["sum"]) - float(actual["sum"]))
        chrono_mae = abs(float(holdout) - float(actual["sum"]))
        weight = blend_weight(lgb_mae, chrono_mae)
        moments = moment_book[mode]
        for name in ("sum", "star_sum", "n1"):
            if points[name] is None or name not in moments:
                continue
            blended = _clip(name, blend_mid(moments[name]["mid"], points[name], weight))
            moments[name]["mid"] = blended
            moments[name]["lo"] = min(moments[name]["lo"], blended)
            moments[name]["hi"] = max(moments[name]["hi"], blended)
        info[mode] = {
            "available": True,
            "weight": round(weight, 4),
            "holdout_mae_lgb": round(lgb_mae, 4),
            "holdout_mae_chronos": round(chrono_mae, 4),
            "sum": round(float(points["sum"]), 4),
            "star_sum": None if points["star_sum"] is None else round(float(points["star_sum"]), 4),
            "n1": None if points["n1"] is None else round(float(points["n1"]), 4),
        }
    return info


def _chart(
    frame: Frame,
    steps: list[dict[str, Any]],
    moment_book: dict[str, dict[str, dict[str, float]]],
    grids: dict[str, dict[str, Any]] | None = None,
) -> list[dict[str, Any]]:
    by_date = {step["date"]: step for step in steps}
    level_names = ("sum", "n1", "n2", "n3", "n4", "n5", "star_sum", "e1", "e2", *SHAPE_SERIES)
    points: list[dict[str, Any]] = []
    for row in frame.rows[frame.focus_start :]:
        point: dict[str, Any] = {
            "date": row["date"],
            "label": row["date"][5:],
            "kind": "history",
            "d_sum": round(float(row["d_sum"]), 4),
            "d_star_sum": round(float(row["d_star_sum"]), 4),
        }
        for name in level_names:
            point[name] = round(float(row[name]), 4)
        step = by_date.get(row["date"])
        if step:
            for mode in ("corpus", "fenetre", "corpus_catboost", "fenetre_catboost"):
                side = step.get(mode) or {}
                for name in level_names:
                    if name in side and side[name] is not None:
                        point[f"{name}_{mode}"] = side[name]
        points.append(point)
    forecast: dict[str, Any] = {
        "date": frame.next_date,
        "label": frame.next_date[5:],
        "kind": "forecast",
    }
    for mode, moments in moment_book.items():
        view = _rank_view(moments)
        for name, band in view.items():
            if name == "e_gap":
                continue
            forecast[f"{name}_{mode}"] = band["mid"]
            forecast[f"{name}_{mode}_lo"] = band["lo"]
            forecast[f"{name}_{mode}_hi"] = band["hi"]
        grid = (grids or {}).get(mode) or {}
        if grid.get("numbers"):
            for name, value in grid_shape(grid["numbers"], grid.get("stars") or []).items():
                forecast[f"{name}_{mode}"] = value
    if points:
        last = points[-1]
        forecast["d_sum"] = round(float(forecast.get("sum_corpus", last["sum"])) - float(last["sum"]), 4)
        forecast["d_star_sum"] = round(
            float(forecast.get("star_sum_corpus", last["star_sum"])) - float(last["star_sum"]), 4
        )
    points.append(forecast)
    return points
