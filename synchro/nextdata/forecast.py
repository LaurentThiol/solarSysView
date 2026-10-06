"""LightGBM à lags (le schéma Darts) et chaîne de rangs.

Darts `LightGBMModel`, quand le paquet est là, remplace la médiane temporelle
du prochain pas. La chaîne n1 → écarts reste en LightGBM direct : le
conditionnement est dans le même tirage, ce que les lags ne portent pas.
Chronos, s’il est installé, ne mélange que somme, somme des étoiles et n1.
"""

from __future__ import annotations

import importlib
from typing import Any, Iterable

import numpy as np

from synchro.nextdata.covariates import (
    CHAIN,
    TARGETS,
    TEMPORAL_TARGETS,
    column_family,
    future_columns,
    normalize_families,
    past_columns,
)
from synchro.nextdata.empirical import public_base, recount
from synchro.nextdata.panel import Frame, build_frame
from synchro.nextdata.project import beam, reconstruct

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
}


def _has(module: str) -> bool:
    try:
        importlib.import_module(module)
    except Exception:
        return False
    return True


def dependency_status() -> dict[str, Any]:
    lightgbm = _has("lightgbm")
    darts = _has("darts")
    chronos = _has("chronos")
    torch = _has("torch")
    return {
        "lightgbm": lightgbm,
        "darts": darts,
        "chronos": chronos,
        "torch": torch,
        "matplotlib": _has("matplotlib"),
        "ready": lightgbm,
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


def _fit_one(
    x_train: np.ndarray,
    y_train: np.ndarray,
    weights: np.ndarray,
    x_next: np.ndarray,
    *,
    alpha: float,
    estimators: int,
):
    fallback = float(np.average(y_train, weights=weights)) if len(y_train) else 0.0
    if len(y_train) < 8 or float(np.std(y_train)) < 1e-8:
        return fallback, None
    import lightgbm as lgb

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
    pred = float(booster.predict(x_next.reshape(1, -1))[0])
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
                x_time, y, weights, x_next_arr, alpha=alpha, estimators=estimators
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
            pred, model = _fit_one(x_chain, y, w_chain, x_vec, alpha=alpha, estimators=estimators)
            found[alpha] = pred
            if alpha == 0.5:
                median_model = model
        moments[name] = _moments_from_alphas(found, name)
        carried[name] = moments[name]
        if name == "n1" and median_model is not None:
            importance_models.append((median_model, chain_names))

    return moments, _importance(importance_models), "lightgbm"


def _importance(models: list[tuple[Any, list[str]]], limit: int = 15) -> list[dict[str, Any]]:
    gains: dict[str, float] = {}
    for model, names in models:
        if hasattr(model, "feature_importance"):
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
    target_names = ["sum", "star_sum", "n1", "parity"]
    start = max(0, focus_start - lags) if mode == "fenetre" else 0
    if n - start <= lags + 8:
        return None
    try:
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
            fit_args["sample_weight"] = np.asarray(
                [3.0 if (start + i) >= focus_start else 1.0 for i in range(n - start)],
                dtype=float,
            )
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
    names: tuple[str, ...] = ("sum", "star_sum", "n1", "parity"),
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
    view = {name: dict(moments[name]) for name in ("sum", "parity", "star_sum", "n1", "e1") if name in moments}
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
    if not _has("lightgbm"):
        return {
            "ok": False,
            "error": "LightGBM n’est pas installé. Lancez ./launch install-nextdata.",
            **dependency_status(),
        }
    mode_primary = primary if primary in ("corpus", "fenetre") else "corpus"
    families = normalize_families(covariates)
    try:
        frame = build_frame(draws, years=years, focus=int(focus), weekday=weekday)
    except ValueError as exc:
        return {"ok": False, "error": str(exc), **dependency_status()}

    base_rows = frame.rows[frame.focus_start :]
    base = recount(base_rows, star_pool=frame.star_pool)
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

    from synchro.nextdata.backtest import walk_forward

    walked = walk_forward(
        frame,
        families,
        estimators=backtest_estimators,
    )
    chronos_info: dict[str, Any] = {"used": False}
    if with_chronos:
        chronos_info = _blend_chronos(frame, moment_book, walked)

    for mode, moments in moment_book.items():
        ranked = beam(moments, base, star_pool=frame.star_pool)
        if not ranked:
            return {"ok": False, "error": "Aucune grille entière n’a pu être projetée.", **dependency_status()}
        best = ranked[0]
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
        "dependencies": dependency_status(),
        "modes": modes,
        "base": public_base(base),
        "backtest": walked,
        "chart": _chart(frame, walked["rows"], moment_book),
        "best_mae_sum": walked["best_mae_sum"],
        "chronos": {"used": bool(chronos_info.get("used"))},
    }


def _blend_chronos(
    frame: Frame,
    moment_book: dict[str, dict[str, dict[str, float]]],
    walked: dict[str, Any],
) -> dict[str, Any]:
    """Un appel Chronos par mode, poids fixé par le dernier tirage du focus."""
    info: dict[str, Any] = {"used": False}
    if len(frame.rows) < 12:
        return info
    actual = frame.rows[-1]
    prefix = frame.rows[:-1]
    for mode in ("corpus", "fenetre"):
        if mode == "fenetre":
            window = prefix[-frame.focus :]
        else:
            window = prefix
        points = {
            "sum": chronos_point([float(row["sum"]) for row in window]),
            "star_sum": chronos_point([float(row["star_sum"]) for row in window]),
            "n1": chronos_point([float(row["n1"]) for row in window]),
        }
        if points["sum"] is None:
            info[mode] = {"weight": 1.0, "available": False}
            continue
        info["used"] = True
        lgb_mae = abs(float(walked["rows"][-1][mode]["sum"]) - float(actual["sum"])) if walked["rows"] else 1.0
        chrono_mae = abs(float(points["sum"]) - float(actual["sum"]))
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
) -> list[dict[str, Any]]:
    by_date = {step["date"]: step for step in steps}
    level_names = ("sum", "n1", "n2", "n3", "n4", "n5", "star_sum", "e1", "e2")
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
            for mode in ("corpus", "fenetre"):
                side = step.get(mode) or {}
                for name in level_names:
                    if name in side:
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
    if points:
        last = points[-1]
        forecast["d_sum"] = round(float(forecast.get("sum_corpus", last["sum"])) - float(last["sum"]), 4)
        forecast["d_star_sum"] = round(
            float(forecast.get("star_sum_corpus", last["star_sum"])) - float(last["star_sum"]), 4
        )
    points.append(forecast)
    return points
