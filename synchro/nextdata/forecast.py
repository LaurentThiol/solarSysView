"""Pronostic et banc nextData : les pas des modèles, assemblés en lectures.

Les morceaux d’un pas (LightGBM, CatBoost, Darts, Chronos) se calculent dans
`models` et se rangent dans le cache (`steps`). Ici, Darts remplace la médiane
temporelle de LightGBM ; Chronos-2 ne mélange que la somme, la somme des
étoiles et le niveau de n1, bornes 10–90 comprises. Les niveaux n1…n5, e1, e2
et leurs deltas donnent le centre de chaque rang ; la chaîne n’y pèse plus et
borne seulement les écarts. Le pronostic, le retour et les décalages lisent
les mêmes pas, au même réglage.
"""

from __future__ import annotations

import importlib.util
from typing import Any, Iterable

from synchro.nextdata.covariates import SHAPE_SERIES, TEMPORAL_TARGETS, grid_shape, normalize_families
from synchro.nextdata.empirical import public_base, recount
from synchro.nextdata.models import _clamp_span, _clip, chronos_error, star_pool_of
from synchro.nextdata.panel import Frame, build_frame, normalized_draws
from synchro.nextdata.persist import base_rates, recent_draws, snap_grid
from synchro.nextdata.project import rank_bands
from synchro.nextdata.pulse_features import public_pulse


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
        "chronos_error": chronos_error(),
        "torch": _installed("torch"),
        "matplotlib": _installed("matplotlib"),
        "catboost": _installed("catboost"),
        "ready": error is None,
        "install": "./launch install-nextdata",
    }


def catboost_import_error() -> str | None:
    try:
        import catboost  # noqa: F401
    except Exception as exc:
        return str(exc)
    return None


def chronos_problem(requested: bool, used: bool) -> str | None:
    """Ce que la page dit quand Chronos est demandé et n’a rien mélangé."""
    if not requested or used:
        return None
    if not _installed("chronos"):
        return "Chronos n’est pas installé : ./launch install-nextdata."
    error = chronos_error()
    if error is None:
        return None
    return f"Chronos n’a pas répondu ({error}) ; il sera retenté au prochain démarrage de l’API."


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
    names: tuple[str, ...] = TEMPORAL_TARGETS,
    star_pool: int = 12,
) -> None:
    """Remplace la médiane temporelle. Si elle sort de la bande, les deux bords suivent du même pas.

    Coller seulement le bord franchi à la médiane ferait d’un quantile 10 % ou
    90 % la médiane elle-même. Le décalage commun garde l’écart de chaque côté,
    puis les bornes légales ramènent ce qui dépasse. Les rangs ne sont pas
    touchés : leur centre est le niveau et le delta de LightGBM.
    """
    if not external:
        return
    for name in names:
        if name not in external or name not in moments:
            continue
        band = moments[name]
        value = _clip(name, external[name], star_pool)
        lo = float(band["lo"])
        hi = float(band["hi"])
        if value < lo or value > hi:
            shift = value - float(band["mid"])
            lo += shift
            hi += shift
            floor, ceiling = _clamp_span(name, star_pool)
            lo = min(value, max(floor, lo))
            hi = max(value, min(ceiling, hi))
        band["lo"] = lo
        band["mid"] = value
        band["hi"] = hi


def _round_moments(moments: dict[str, dict[str, float]]) -> dict[str, dict[str, float]]:
    out = {}
    for name, band in moments.items():
        out[name] = {key: round(float(band[key]), 4) for key in ("lo", "mid", "hi")}
    return out


def _rank_view(moments: dict[str, dict[str, float]], star_pool: int = 12) -> dict[str, dict[str, float]]:
    """n1…n5 et e2 reconstruits, pour les anneaux et les courbes."""
    kept = ("sum", "parity", "star_sum", "spread", "consecutive", "star_consecutive")
    view = {name: dict(moments[name]) for name in kept if name in moments}
    view.update(rank_bands(moments, star_pool))
    view["e_gap"] = dict(moments["e_gap"])
    view["star_spread"] = dict(moments["e_gap"])
    return _round_moments(view)


def _unready() -> dict[str, Any] | None:
    if not lightgbm_import_error():
        return None
    status = dependency_status()
    detail = status.get("hint") or status.get("lightgbm_error") or "LightGBM ne se charge pas."
    return {"ok": False, "error": f"{detail} Sinon : ./launch install-nextdata.", **status}


def _reading_block(
    step: dict[str, Any],
    key: str,
    history: list[dict[str, Any]],
    walked: dict[str, Any],
    star_pool: int,
) -> tuple[dict[str, Any], dict[str, dict[str, float]]]:
    from synchro.nextdata.backtest import calibrated_view

    reading = step["readings"][key]
    view, calibration = calibrated_view(step, key, history, star_pool)
    block: dict[str, Any] = {
        "importance": reading["importance"],
        "engine": reading["engine"],
        "grid": dict(reading["grid"]),
        "alternates": reading["alternates"],
        "quantiles": view,
        "calibration": calibration,
        "mae_sum": ((walked["metrics"].get(key) or {}).get("mae") or {}).get("sum"),
        "arbitration": reading["arbitration"],
    }
    if reading["library"] == "lightgbm":
        chronos = reading["chronos"]
        block["chronos"] = chronos
        block["blend_weight"] = (chronos or {}).get("weight", 1.0)
    return block, view


def _persist_grid(grid: dict[str, Any], frame: Frame, persist: dict[str, int] | None) -> dict[str, Any] | None:
    """Grille Persist du prochain tirage : n−1 et n−2 sont les deux derniers tirages sortis."""
    if not persist:
        return None
    snapped = snap_grid(
        grid["numbers"],
        grid["stars"],
        frame.rows,
        radius=persist["radius"],
        limit=persist["limit"],
        star_pool=star_pool_of(frame.horizon[0] if frame.horizon else None, frame.star_pool),
    )
    return {
        "grid": {"numbers": snapped["numbers"], "stars": snapped["stars"]},
        "swaps": snapped["swaps"],
        "held": snapped["held"],
    }


def persist_info(
    draws: list[dict[str, Any]],
    frame: Frame,
    persist: dict[str, int] | None,
) -> dict[str, Any] | None:
    """Réglage Persist, les deux tirages repris et la table de l’archive reçue, toutes années."""
    if not persist:
        return None
    return {
        **persist,
        "recent": recent_draws(frame.rows),
        "base": base_rates(normalized_draws(draws, frame.weekday)),
    }


def run_forecast(
    draws: list[dict[str, Any]],
    *,
    focus: int = 50,
    years: Iterable[str] | None = None,
    primary: str = "corpus",
    weekday: str | None = None,
    covariates: Iterable[str] | None = None,
    with_chronos: bool = False,
    estimators: int = 32,
    chunk: int | None = None,
    persist: dict[str, int] | None = None,
) -> dict[str, Any]:
    """Prochain tirage et retour, au même réglage, par tranches de pas.

    Chaque appel calcule au plus `chunk` pas manquants : le prochain tirage
    d’abord, puis le retour du plus récent au plus ancien. Il rend tout ce qui
    est prêt ; `progress.complete` dit quand le retour est entier. Les bandes du
    prochain tirage sont calibrées sur les pas du retour déjà prêts.
    """
    refused = _unready()
    if refused:
        return refused
    mode_primary = primary if primary in ("corpus", "fenetre") else "corpus"
    families = normalize_families(covariates)
    try:
        frame = build_frame(draws, years=years, focus=int(focus), weekday=weekday)
    except ValueError as exc:
        return {"ok": False, "error": str(exc), **dependency_status()}

    from synchro.nextdata import backtest
    from synchro.nextdata.steps import StepSettings, compute_state, ensure_steps, parts_needed, worker_count

    settings = StepSettings(focus=frame.focus, families=tuple(families), estimators=int(estimators))
    parts = parts_needed(with_chronos)
    n = len(frame.rows)
    order = [n, *reversed(backtest.retour_indices(frame))]
    ready, remaining = ensure_steps(frame, order, settings, parts, limit=chunk or worker_count())
    steps = backtest.assemble(frame, ready, with_chronos=with_chronos)
    upcoming = steps[n]
    for mode in ("corpus", "fenetre"):
        if mode not in upcoming["readings"]:
            error = backtest.model_error(ready[n]["parts"], mode) or "Aucune grille entière n’a pu être projetée."
            return {"ok": False, "error": error, **dependency_status()}

    history = [steps[t] for t in sorted(steps) if frame.focus_start <= t < n]
    walked = backtest.retour_report(history, frame=frame, persist=persist)
    walked["bands"] = backtest.band_report(history, frame.star_pool)
    modes: dict[str, Any] = {}
    views: dict[str, dict[str, dict[str, float]]] = {}
    grids: dict[str, dict[str, Any]] = {}
    for mode in ("corpus", "fenetre"):
        block, views[mode] = _reading_block(upcoming, mode, history, walked, frame.star_pool)
        block["persist"] = _persist_grid(block["grid"], frame, persist)
        grids[mode] = block["grid"]
        cat_key = f"{mode}_catboost"
        if cat_key in upcoming["readings"]:
            block["catboost"], views[cat_key] = _reading_block(upcoming, cat_key, history, walked, frame.star_pool)
            block["catboost"]["persist"] = _persist_grid(block["catboost"]["grid"], frame, persist)
            grids[cat_key] = block["catboost"]["grid"]
        modes[mode] = block

    catboost_error = catboost_import_error()
    if catboost_error is None and not any(key.endswith("_catboost") for key in upcoming["readings"]):
        catboost_error = backtest.model_error(ready[n]["parts"], "corpus", "catboost")
    chronos_used = any((modes[mode].get("chronos") or {}).get("available") for mode in modes)
    base = recount(frame.rows[frame.focus_start :], star_pool=frame.star_pool)
    return {
        "ok": True,
        "focus": frame.focus,
        "focus_requested": int(focus),
        "years": frame.years,
        "years_present": frame.years_present,
        "primary": mode_primary,
        "weekday": frame.weekday,
        "covariates": families,
        "pulse": public_pulse(frame.horizon[0]),
        "next_date": frame.next_date,
        "star_pool": frame.star_pool,
        "anchor_year": frame.anchor_year,
        "engine": modes[mode_primary]["engine"],
        "estimators": settings.estimators,
        "catboost": any(key.endswith("_catboost") for key in upcoming["readings"]),
        "catboost_error": catboost_error,
        "dependencies": dependency_status(),
        "modes": modes,
        "base": public_base(base),
        "backtest": walked,
        "chart": _chart(frame, walked["rows"], views, grids),
        "best_mae_sum": walked["best_mae_sum"],
        "chronos": {
            "requested": with_chronos,
            "used": chronos_used,
            "error": chronos_problem(with_chronos, chronos_used),
        },
        "progress": {"ready": len(ready), "total": len(order), "complete": remaining == 0},
        "compute": compute_state(),
        "persist": persist_info(draws, frame, persist),
    }


def run_training(
    draws: list[dict[str, Any]],
    *,
    focus: int = 50,
    years: Iterable[str] | None = None,
    weekday: str | None = None,
    covariates: Iterable[str] | None = None,
    estimators: int = 32,
    shift: int | None = None,
    with_chronos: bool = False,
    chunk: int | None = None,
    persist: dict[str, int] | None = None,
) -> dict[str, Any]:
    """Banc −1…−10 : les dix derniers pas du retour, au réglage du pronostic.

    Sans `shift`, chaque appel calcule au plus `chunk` pas manquants : les dix
    décalages d’abord, puis les tirages d’avant qui calibrent leurs bandes.
    Avec `shift`, seul ce décalage se calcule ; ses bandes et les poids de
    Chronos se règlent sur ce que le cache a déjà.
    """
    refused = _unready()
    if refused:
        return refused
    families = normalize_families(covariates)
    try:
        frame = build_frame(draws, years=years, focus=int(focus), weekday=weekday)
    except ValueError as exc:
        return {"ok": False, "error": str(exc), **dependency_status()}

    from synchro.nextdata import backtest
    from synchro.nextdata.steps import MIN_HISTORY, StepSettings, compute_state, ensure_steps, parts_needed, worker_count

    settings = StepSettings(focus=frame.focus, families=tuple(families), estimators=int(estimators))
    parts = parts_needed(with_chronos)
    n = len(frame.rows)
    retour = list(reversed(backtest.retour_indices(frame)))
    lags = [int(shift)] if shift is not None else list(range(1, backtest.SHIFT_MAX + 1))
    targets = [n - lag for lag in lags if n - lag >= MIN_HISTORY]
    if shift is not None:
        ready, _left = ensure_steps(frame, targets, settings, parts, limit=len(targets))
        cached, _rest = ensure_steps(frame, [t for t in retour if t not in ready], settings, parts, limit=0)
        ready.update(cached)
        order = targets
        remaining = 0
    else:
        order = targets + [t for t in retour if t not in targets]
        ready, remaining = ensure_steps(frame, order, settings, parts, limit=chunk or worker_count())
    steps = backtest.assemble(frame, ready, with_chronos=with_chronos)
    report = backtest.shift_report(frame, steps, lags=lags, chronos_requested=with_chronos, persist=persist)
    report["chronos"]["error"] = chronos_problem(with_chronos, report["chronos"]["used"])
    catboost_error = catboost_import_error()
    info = persist_info(draws, frame, persist)
    if info:
        info.pop("recent", None)
    return {
        "ok": True,
        "focus": frame.focus,
        "focus_requested": int(focus),
        "years": frame.years,
        "years_present": frame.years_present,
        "weekday": frame.weekday,
        "covariates": families,
        "pulse": report["shifts"][-1]["pulse"] if report["shifts"] else public_pulse(frame.horizon[0]),
        "star_pool": frame.star_pool,
        "anchor_year": frame.anchor_year,
        "estimators": settings.estimators,
        "catboost": catboost_error is None,
        "catboost_error": catboost_error,
        "dependencies": dependency_status(),
        **report,
        "progress": {
            "ready": sum(1 for t in order if t in ready),
            "total": len(order),
            "complete": remaining == 0,
        },
        "compute": compute_state(),
        "persist": info,
    }


def _chart(
    frame: Frame,
    steps: list[dict[str, Any]],
    views: dict[str, dict[str, dict[str, float]]],
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
    for mode, view in views.items():
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
