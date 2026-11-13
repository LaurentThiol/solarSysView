"""Pronostic et banc nextData : les pas des modèles, assemblés en lectures.

Les morceaux d’un pas se calculent dans `models` et se rangent dans le cache.
L’assemblage suit l’étage 1 (somme et somme des étoiles), le mélange de ces
deux sommes, l’étage 2 (rangs), la projection, puis Persist. TimesFM reste
éteint tant que son bouton n’est pas allumé. Le pronostic, le retour et les
décalages lisent les mêmes pas, au même réglage.
"""

from __future__ import annotations

import importlib.util
from typing import Any, Iterable

from synchro.nextdata.covariates import SHAPE_SERIES, TEMPORAL_TARGETS, active_block, grid_shape, normalize_families
from synchro.nextdata.empirical import public_base, recount
from synchro.nextdata.models import (
    TIMESFM_LICENSE,
    _clamp_span,
    _clip,
    chronos_error,
    darts_error,
    star_pool_of,
    timesfm_error,
)
from synchro.nextdata.notices import quiet_optional_model_notices
from synchro.nextdata.panel import Frame, build_frame, normalized_draws
from synchro.nextdata.persist import base_rates, recent_draws, snap_grid
from synchro.nextdata.project import rank_bands
from synchro.nextdata.pulse_features import public_pulse
from synchro.nextdata.xray import public_xray

# Avant le premier Darts ou Chronos : ce module est importé par l’API et par le pool.
quiet_optional_model_notices()


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
        "darts_error": darts_error(),
        "chronos": _installed("chronos"),
        "chronos_error": chronos_error(),
        "timesfm": _installed("timesfm"),
        "timesfm_error": timesfm_error(),
        "timesfm_license": TIMESFM_LICENSE,
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


def timesfm_problem(requested: bool, used: bool) -> str | None:
    """Ce que la page dit quand TimesFM est demandé et n’a rien donné à l’étage 1."""
    if not requested or used:
        return None
    if not _installed("timesfm"):
        return "TimesFM n’est pas installé : ./launch install-nextdata."
    error = timesfm_error()
    if error is None:
        return None
    return f"TimesFM n’a pas répondu ({error}) ; il sera retenté au prochain démarrage de l’API."


def darts_problem() -> str | None:
    """Ce que la page dit quand Darts a échoué dans ce processus : LightGBM garde sa médiane."""
    error = darts_error()
    if error is None:
        return None
    return f"Darts n’a pas répondu ({error}) ; LightGBM garde sa médiane. Il sera retenté au prochain démarrage de l’API."


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


def _xray_context(
    *,
    focus_requested: int,
    families: list[str],
    block_requested: str | None,
    excluded: list[str],
    estimators: int,
    chronos_requested: bool,
    timesfm_requested: bool,
    persist: dict[str, int] | None,
) -> dict[str, Any]:
    return {
        "focus_requested": focus_requested,
        "families": families,
        "block_requested": block_requested,
        "excluded": excluded,
        "estimators": estimators,
        "chronos_requested": chronos_requested,
        "timesfm_requested": timesfm_requested,
        "persist": persist,
    }


def _publish_xray(
    frame: Frame,
    step: dict[str, Any],
    key: str,
    block: dict[str, Any],
    moved: dict[str, Any],
    context: dict[str, Any],
) -> dict[str, Any]:
    return public_xray(
        frame,
        step,
        key,
        step["readings"][key],
        calibration=block.get("calibration"),
        moved=moved,
        persist_snap=block.get("persist"),
        **context,
    )


def _plain(value: Any) -> Any:
    """Résumé HTTP : nombres, textes, listes. Pas de tenseur."""
    if value is None or isinstance(value, (str, int, float, bool)):
        return value
    if isinstance(value, dict):
        return {str(key): _plain(item) for key, item in value.items() if key != "tensor"}
    if isinstance(value, (list, tuple)):
        return [_plain(item) for item in value]
    return None


def relief_of(steps: dict[int, dict[str, Any]], limit: int = 10) -> dict[str, Any]:
    """Dix pas au plus : sommes par lecture, rangs projetés, tirage sorti. La coque TimesFM si elle a répondu."""
    chosen = [steps[t] for t in sorted(steps) if isinstance(steps[t], dict) and steps[t].get("readings")]
    chosen = chosen[-limit:]
    ranks = ("n1", "n2", "n3", "n4", "n5", "e1", "e2")
    out_steps = []
    opened = False
    for step in chosen:
        sommes: dict[str, Any] = {}
        rangs: dict[str, Any] = {}
        shell = None
        for key, reading in (step.get("readings") or {}).items():
            packed = reading.get("packed") or {}
            sommes[key] = {"sum": packed.get("sum"), "star_sum": packed.get("star_sum")}
            rangs[key] = [packed.get(name) for name in ranks]
            if packed.get("sum") is not None:
                opened = True
            note = reading.get("timesfm") or {}
            if note.get("available") and note.get("lo") and note.get("hi"):
                shell = {"lo": note["lo"], "hi": note["hi"]}
        actual = step.get("actual") or {}
        out_steps.append(
            {
                "label": step.get("date"),
                "sommes": sommes,
                "rangs": rangs,
                "sorti": [*(actual.get("numbers") or []), *(actual.get("stars") or [])],
                "timesfm": shell,
            }
        )
    return {"open": opened, "steps": out_steps}


def nodered_summary(report: dict[str, Any]) -> dict[str, Any]:
    """Ce que Node-RED affiche. Familles, sommes, mélange, rangs, projection, coupure. Pas les tenseurs."""
    modes = report.get("modes") or {}
    first = next(iter(modes.values()), {}) if isinstance(modes, dict) else {}
    chronos = (first.get("chronos") or {}) if isinstance(first, dict) else {}
    grid = (first.get("grid") or {}) if isinstance(first, dict) else {}
    shifts = report.get("shifts") or []
    return _plain(
        {
            "familles": report.get("covariates") or [],
            "coupure": report.get("next_date") or (shifts[0].get("date") if shifts else None),
            "etage1": {
                key: {"sum": (block.get("quantiles") or {}).get("sum"), "star_sum": (block.get("quantiles") or {}).get("star_sum")}
                for key, block in modes.items()
                if isinstance(block, dict)
            },
            "melange": chronos.get("shares") or chronos.get("weights"),
            "etage2": {"numbers": grid.get("numbers"), "stars": grid.get("stars")},
            "projection": {"numbers": grid.get("numbers"), "stars": grid.get("stars")},
            "decalages": [
                {"k": shift.get("x"), "pas": (shift.get("timesfm_pas") or {}).get("pas"), "date": shift.get("date")}
                for shift in shifts
            ],
        }
    )


def publish_nodered(summary: dict[str, Any]) -> bool:
    """POST le résumé si Node-RED écoute. S’il est arrêté, nextData continue sans lui."""
    import json
    import urllib.error
    import urllib.request

    payload = json.dumps(summary).encode("utf-8")
    request = urllib.request.Request(
        "http://127.0.0.1:1880/nextdata/pas",
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=0.2) as response:
            return 200 <= int(response.status) < 300
    except (OSError, urllib.error.URLError, TimeoutError, ValueError):
        return False


def run_forecast(
    draws: list[dict[str, Any]],
    *,
    focus: int = 50,
    years: Iterable[str] | None = None,
    primary: str = "corpus",
    weekday: str | None = None,
    covariates: Iterable[str] | None = None,
    with_chronos: bool = False,
    with_timesfm: bool = False,
    estimators: int = 32,
    chunk: int | None = None,
    persist: dict[str, int] | None = None,
    block: str | None = None,
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
        chosen_block, excluded = active_block(block, families)
        frame = build_frame(draws, years=years, focus=int(focus), weekday=weekday)
    except ValueError as exc:
        return {"ok": False, "error": str(exc), **dependency_status()}

    from synchro.nextdata import backtest
    from synchro.nextdata.steps import StepSettings, compute_state, ensure_steps, parts_needed, worker_count

    settings = StepSettings(
        focus=frame.focus,
        families=tuple(families),
        estimators=int(estimators),
        excluded=excluded,
    )
    parts = parts_needed(with_chronos, with_timesfm)
    n = len(frame.rows)
    target_pool = star_pool_of(frame.horizon[0] if frame.horizon else None, frame.star_pool)
    order = [n, *reversed(backtest.retour_indices(frame))]
    ready, remaining = ensure_steps(frame, order, settings, parts, limit=chunk or worker_count())
    steps = backtest.assemble(
        frame, ready, with_chronos=with_chronos, with_timesfm=with_timesfm, pulse="pulse" in families
    )
    upcoming = steps[n]
    for mode in ("corpus", "fenetre"):
        if mode not in upcoming["readings"]:
            error = backtest.model_error(ready[n]["parts"], mode) or "Aucune grille entière n’a pu être projetée."
            return {"ok": False, "error": error, **dependency_status()}

    history = [steps[t] for t in sorted(steps) if frame.focus_start <= t < n]
    walked = backtest.retour_report(history, frame=frame, persist=persist)
    walked["bands"] = backtest.band_report(history, target_pool)
    modes: dict[str, Any] = {}
    views: dict[str, dict[str, dict[str, float]]] = {}
    grids: dict[str, dict[str, Any]] = {}
    xray_context = _xray_context(
        focus_requested=int(focus),
        families=families,
        block_requested=block if isinstance(block, str) and block else None,
        excluded=list(excluded),
        estimators=settings.estimators,
        chronos_requested=with_chronos,
        timesfm_requested=with_timesfm,
        persist=persist,
    )
    for mode in ("corpus", "fenetre"):
        block, views[mode] = _reading_block(upcoming, mode, history, walked, target_pool)
        block["persist"] = _persist_grid(block["grid"], frame, persist)
        block["xray"] = _publish_xray(frame, upcoming, mode, block, views[mode], xray_context)
        grids[mode] = block["grid"]
        cat_key = f"{mode}_catboost"
        if cat_key in upcoming["readings"]:
            block["catboost"], views[cat_key] = _reading_block(upcoming, cat_key, history, walked, target_pool)
            block["catboost"]["persist"] = _persist_grid(block["catboost"]["grid"], frame, persist)
            block["catboost"]["xray"] = _publish_xray(frame, upcoming, cat_key, block["catboost"], views[cat_key], xray_context)
            grids[cat_key] = block["catboost"]["grid"]
        modes[mode] = block

    catboost_error = catboost_import_error()
    if catboost_error is None and not any(key.endswith("_catboost") for key in upcoming["readings"]):
        catboost_error = backtest.model_error(ready[n]["parts"], "corpus", "catboost")
    chronos_used = any((modes[mode].get("chronos") or {}).get("available") for mode in modes)
    base = recount(frame.rows[frame.focus_start :], star_pool=target_pool)
    report = {
        "ok": True,
        "focus": frame.focus,
        "focus_requested": int(focus),
        "years": frame.years,
        "years_present": frame.years_present,
        "primary": mode_primary,
        "weekday": frame.weekday,
        "covariates": families,
        "block": chosen_block,
        "pulse": public_pulse(frame.horizon[0]),
        "next_date": frame.next_date,
        "star_pool": target_pool,
        "anchor_year": frame.anchor_year,
        "engine": modes[mode_primary]["engine"],
        "estimators": settings.estimators,
        "catboost": any(key.endswith("_catboost") for key in upcoming["readings"]),
        "catboost_error": catboost_error,
        "dependencies": dependency_status(),
        "modes": modes,
        "base": public_base(base),
        "backtest": walked,
        "relief": relief_of({t: step for t, step in steps.items() if t < n}),
        "chart": _chart(frame, walked["rows"], views, grids),
        "best_mae_sum": walked["best_mae_sum"],
        "chronos": {
            "requested": with_chronos,
            "used": chronos_used,
            "error": chronos_problem(with_chronos, chronos_used),
        },
        "timesfm": {
            "requested": with_timesfm,
            "used": any((modes[mode].get("timesfm") or {}).get("available") for mode in modes),
            "error": timesfm_problem(
                with_timesfm, any((modes[mode].get("timesfm") or {}).get("available") for mode in modes)
            ),
            "license": TIMESFM_LICENSE,
        },
        "darts": {"error": darts_problem()},
        "progress": {"ready": len(ready), "total": len(order), "complete": remaining == 0},
        "compute": compute_state(),
        "persist": persist_info(draws, frame, persist),
    }
    publish_nodered(nodered_summary(report))
    return report


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
    with_timesfm: bool = False,
    chunk: int | None = None,
    persist: dict[str, int] | None = None,
    block: str | None = None,
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
        chosen_block, excluded = active_block(block, families)
        frame = build_frame(draws, years=years, focus=int(focus), weekday=weekday)
    except ValueError as exc:
        return {"ok": False, "error": str(exc), **dependency_status()}

    from synchro.nextdata import backtest
    from synchro.nextdata.steps import MIN_HISTORY, StepSettings, compute_state, ensure_steps, parts_needed, worker_count

    settings = StepSettings(
        focus=frame.focus,
        families=tuple(families),
        estimators=int(estimators),
        excluded=excluded,
    )
    parts = parts_needed(with_chronos, with_timesfm)
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
    steps = backtest.assemble(
        frame, ready, with_chronos=with_chronos, with_timesfm=with_timesfm, pulse="pulse" in families
    )
    report = backtest.shift_report(
        frame,
        steps,
        lags=lags,
        chronos_requested=with_chronos,
        timesfm_requested=with_timesfm,
        persist=persist,
        xray_context=_xray_context(
            focus_requested=int(focus),
            families=families,
            block_requested=block if isinstance(block, str) and block else None,
            excluded=list(excluded),
            estimators=settings.estimators,
            chronos_requested=with_chronos,
            timesfm_requested=with_timesfm,
            persist=persist,
        ),
    )
    report["chronos"]["error"] = chronos_problem(with_chronos, report["chronos"]["used"])
    report["timesfm"]["error"] = timesfm_problem(with_timesfm, report["timesfm"]["used"])
    report["timesfm"]["license"] = TIMESFM_LICENSE
    catboost_error = catboost_import_error()
    info = persist_info(draws, frame, persist)
    if info:
        info.pop("recent", None)
    report["relief"] = relief_of(steps)
    published = {
        "ok": True,
        "focus": frame.focus,
        "focus_requested": int(focus),
        "years": frame.years,
        "years_present": frame.years_present,
        "weekday": frame.weekday,
        "covariates": families,
        "block": chosen_block,
        "pulse": report["shifts"][-1]["pulse"] if report["shifts"] else public_pulse(frame.horizon[0]),
        "star_pool": frame.star_pool,
        "anchor_year": frame.anchor_year,
        "estimators": settings.estimators,
        "catboost": catboost_error is None,
        "catboost_error": catboost_error,
        "dependencies": dependency_status(),
        **report,
        "darts": {"error": darts_problem()},
        "progress": {
            "ready": sum(1 for t in order if t in ready),
            "total": len(order),
            "complete": remaining == 0,
        },
        "compute": compute_state(),
        "persist": info,
    }
    publish_nodered(nodered_summary(published))
    return published


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
    points.append(forecast)
    return points
