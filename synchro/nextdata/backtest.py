"""Walk-forward sur le focus : trois ans (poids ×3) et fenêtre seule."""

from __future__ import annotations

import math
from typing import Any, Iterable

from synchro.nextdata.covariates import SHAPE_SERIES, grid_shape
from synchro.nextdata.empirical import recount
from synchro.nextdata.forecast import (
    _clip,
    _rank_view,
    blend_mid,
    blend_weight,
    chronos_point,
    predict_moments,
)
from synchro.nextdata.panel import Frame
from synchro.nextdata.project import beam

FIELDS = ("sum", "n1", "n2", "n3", "n4", "n5", "star_sum", "e1", "e2", *SHAPE_SERIES)
MODES = ("corpus", "fenetre")
SHIFT_MAX = 10
SHIFT_FIELDS = FIELDS


def _pack(numbers: list[int], stars: list[int], fallback_sum: float | None = None) -> dict[str, Any]:
    nums = [int(n) for n in numbers]
    star = [int(n) for n in stars]
    out: dict[str, Any] = {
        "numbers": nums,
        "stars": star,
        "sum": float(sum(nums) if nums else (fallback_sum or 0.0)),
        "star_sum": float(sum(star) if star else 0.0),
    }
    for index, name in enumerate(("n1", "n2", "n3", "n4", "n5")):
        out[name] = float(nums[index]) if index < len(nums) else None
    out["e1"] = float(star[0]) if star else None
    out["e2"] = float(star[1]) if len(star) > 1 else None
    out.update(grid_shape(nums, star))
    return out


def _actual(row: dict[str, Any]) -> dict[str, Any]:
    packed = _pack(row["numbers"], row["stars"], row["sum"])
    packed["sum"] = float(row["sum"])
    packed["star_sum"] = float(row["star_sum"])
    return packed


def _mae(errors: list[float]) -> float | None:
    if not errors:
        return None
    return sum(abs(err) for err in errors) / len(errors)


def _rmse(errors: list[float]) -> float | None:
    if not errors:
        return None
    return math.sqrt(sum(err * err for err in errors) / len(errors))


def _hits(left: list[int], right: list[int]) -> int:
    return len(set(left) & set(right))


def walk_forward(
    frame: Frame,
    families: Iterable[str],
    *,
    estimators: int = 12,
    libraries: tuple[str, ...] = ("lightgbm",),
) -> dict[str, Any]:
    rows = frame.rows
    steps: list[dict[str, Any]] = []
    min_history = 16
    for t in range(frame.focus_start, len(rows)):
        if t < min_history:
            continue
        prefix = rows[:t]
        horizon = [rows[t]]
        horizon.append(rows[t + 1] if t + 1 < len(rows) else frame.horizon[0])
        step: dict[str, Any] = {"date": rows[t]["date"], "actual": _actual(rows[t])}
        previous = prefix[-1]
        step["persistence"] = _actual(previous)
        step["mean"] = {"sum": sum(float(row["sum"]) for row in prefix) / len(prefix)}
        failed = False
        window = prefix[-frame.focus :]
        base = recount(window, star_pool=frame.star_pool)
        for mode in MODES:
            for library in libraries:
                key = mode if library == "lightgbm" else f"{mode}_catboost"
                try:
                    moments, _importance, _engine = predict_moments(
                        prefix,
                        horizon,
                        mode=mode,
                        focus=frame.focus,
                        families=families,
                        estimators=estimators,
                        quantiles=(0.5,),
                        library=library,
                    )
                except Exception:
                    if library == "lightgbm":
                        failed = True
                    break
                ranked = beam(moments, base, star_pool=frame.star_pool, radius=2)
                if not ranked:
                    if library == "lightgbm":
                        failed = True
                    break
                packed = _pack(ranked[0]["numbers"], ranked[0]["stars"], moments["sum"]["mid"])
                packed["sum_model"] = round(float(moments["sum"]["mid"]), 4)
                step[key] = packed
            if failed:
                break
        if failed or any(mode not in step for mode in MODES):
            continue
        steps.append(step)

    metric_keys = list(MODES)
    if any("corpus_catboost" in step for step in steps):
        metric_keys.extend(("corpus_catboost", "fenetre_catboost"))
    metrics = {mode: _metrics(steps, mode) for mode in metric_keys}
    metrics["persistence"] = _metrics(steps, "persistence")
    metrics["mean"] = _sum_only(steps, "mean")
    best = "corpus"
    corpus_mae = metrics["corpus"]["mae"].get("sum")
    window_mae = metrics["fenetre"]["mae"].get("sum")
    if corpus_mae is None and window_mae is not None:
        best = "fenetre"
    elif corpus_mae is not None and window_mae is not None and window_mae < corpus_mae:
        best = "fenetre"
    return {
        "rows": [_public_step(step) for step in steps],
        "metrics": _public_metrics(metrics),
        "best_mae_sum": best,
        "draw_count": len(steps),
    }


def _errors(steps: list[dict[str, Any]], mode: str, field: str) -> list[float]:
    out = []
    for step in steps:
        side = step.get(mode) or {}
        actual = step["actual"]
        if side.get(field) is None or actual.get(field) is None:
            continue
        out.append(float(side[field]) - float(actual[field]))
    return out


def _metrics(steps: list[dict[str, Any]], mode: str) -> dict[str, Any]:
    mae = {}
    rmse = {}
    for field in FIELDS:
        errs = _errors(steps, mode, field)
        mae[field] = _mae(errs)
        rmse[field] = _rmse(errs)
    number_hits = []
    star_hits = []
    for step in steps:
        side = step.get(mode) or {}
        if not side.get("numbers"):
            continue
        number_hits.append(_hits(side["numbers"], step["actual"]["numbers"]))
        star_hits.append(_hits(side["stars"], step["actual"]["stars"]))
    return {
        "mae": mae,
        "rmse": rmse,
        "hits_numbers": _mae([float(v) for v in number_hits]) if number_hits else None,
        "hits_stars": _mae([float(v) for v in star_hits]) if star_hits else None,
    }


def _sum_only(steps: list[dict[str, Any]], mode: str) -> dict[str, Any]:
    errs = _errors(steps, mode, "sum")
    return {"mae": {"sum": _mae(errs)}, "rmse": {"sum": _rmse(errs)}, "hits_numbers": None, "hits_stars": None}


def _round_map(values: dict[str, float | None]) -> dict[str, float | None]:
    return {key: None if value is None else round(float(value), 4) for key, value in values.items()}


def _public_metrics(metrics: dict[str, dict[str, Any]]) -> dict[str, Any]:
    out = {}
    for mode, block in metrics.items():
        out[mode] = {
            "mae": _round_map(block["mae"]),
            "rmse": _round_map(block["rmse"]),
            "hits_numbers": None if block["hits_numbers"] is None else round(float(block["hits_numbers"]), 4),
            "hits_stars": None if block["hits_stars"] is None else round(float(block["hits_stars"]), 4),
        }
    return out


def _public_step(step: dict[str, Any]) -> dict[str, Any]:
    def side(block: dict[str, Any]) -> dict[str, Any]:
        kept = {
            "numbers": block.get("numbers") or [],
            "stars": block.get("stars") or [],
            "sum": None if block.get("sum") is None else round(float(block["sum"]), 4),
        }
        for name in ("n1", "n2", "n3", "n4", "n5", "star_sum", "e1", "e2", *SHAPE_SERIES):
            value = block.get(name)
            kept[name] = None if value is None else round(float(value), 4)
        return kept

    published = {
        "date": step["date"],
        "actual": side(step["actual"]),
        "corpus": side(step["corpus"]),
        "fenetre": side(step["fenetre"]),
        "persistence": side(step["persistence"]),
        "mean": {"sum": round(float(step["mean"]["sum"]), 4)},
    }
    for key in ("corpus_catboost", "fenetre_catboost"):
        if step.get(key):
            published[key] = side(step[key])
    return published


def _signed(predicted: float | None, actual: float | None) -> float | None:
    if predicted is None or actual is None:
        return None
    return round(float(predicted) - float(actual), 4)


def _covers(actual: float | None, band: dict[str, float] | None) -> bool | None:
    if actual is None or not band:
        return None
    return float(band["lo"]) <= float(actual) <= float(band["hi"])


def _reading_key(mode: str, library: str) -> str:
    return mode if library == "lightgbm" else f"{mode}_catboost"


def _blend_shift_chronos(
    moments: dict[str, dict[str, float]],
    prefix: list[dict[str, Any]],
    follower: dict[str, Any],
    *,
    mode: str,
    focus: int,
    families: Iterable[str],
    estimators: int,
    star_pool: int,
) -> dict[str, Any]:
    """Même mélange que le pronostic : Chronos du dernier tirage connu, poids sur son écart.

    CatBoost n’est pas appelé ici. Le tirage noté ne sert pas à choisir le poids.
    """
    note: dict[str, Any] = {"available": False, "weight": 1.0}
    if len(prefix) < 17:
        return note
    holdout = prefix[-1]
    context = prefix[:-1]
    window = context[-focus:] if mode == "fenetre" else context
    if len(window) < 8:
        return note
    points = {
        name: chronos_point([float(row[name]) for row in window])
        for name in ("sum", "star_sum", "n1")
    }
    if points["sum"] is None:
        return note
    try:
        hold_moments, _importance, _engine = predict_moments(
            context,
            [holdout, follower],
            mode=mode,
            focus=focus,
            families=families,
            estimators=estimators,
            quantiles=(0.5,),
            library="lightgbm",
        )
    except Exception:
        return note
    base = recount(context[-focus:], star_pool=star_pool)
    ranked = beam(hold_moments, base, star_pool=star_pool, radius=1)
    if not ranked:
        return note
    lgb_sum = float(sum(ranked[0]["numbers"]))
    lgb_mae = abs(lgb_sum - float(holdout["sum"]))
    chrono_mae = abs(float(points["sum"]) - float(holdout["sum"]))
    weight = blend_weight(lgb_mae, chrono_mae)
    for name in ("sum", "star_sum", "n1"):
        point = points[name]
        if point is None or name not in moments:
            continue
        blended = _clip(name, blend_mid(moments[name]["mid"], point, weight))
        moments[name]["mid"] = blended
        moments[name]["lo"] = min(moments[name]["lo"], blended)
        moments[name]["hi"] = max(moments[name]["hi"], blended)
    return {
        "available": True,
        "weight": round(weight, 4),
        "holdout_mae_lgb": round(lgb_mae, 4),
        "holdout_mae_chronos": round(chrono_mae, 4),
    }


def shift_report(
    frame: Frame,
    families: Iterable[str],
    *,
    estimators: int = 12,
    libraries: tuple[str, ...] = ("lightgbm",),
    quantiles: tuple[float, ...] = (0.1, 0.5, 0.9),
    only: int | None = None,
    with_chronos: bool = False,
) -> dict[str, Any]:
    """Dix coupures −1…−10. Chaque prévision n'apprend pas le tirage qu'elle note.

    x = 1 cache le dernier tirage. x = 10 se place dix tirages plus tôt et
    prévoit celui qui venait juste après. L'écart est prévu − sorti.
    """
    rows = frame.rows
    shifts: list[dict[str, Any]] = []
    chronos_used = False
    lags = (only,) if only is not None else tuple(range(1, SHIFT_MAX + 1))
    for lag in lags:
        if len(rows) - lag < 16:
            break
        prefix = rows[:-lag]
        target = rows[-lag]
        follower = rows[-lag + 1] if lag > 1 else frame.horizon[0]
        horizon = [target, follower]
        readings: dict[str, Any] = {}
        previous = _actual(prefix[-1])
        actual = _actual(target)
        readings["persistence"] = _shift_side(previous, actual, None)
        window = prefix[-frame.focus :]
        base = recount(window, star_pool=frame.star_pool)
        for mode in MODES:
            for library in libraries:
                key = _reading_key(mode, library)
                try:
                    moments, _importance, _engine = predict_moments(
                        prefix,
                        horizon,
                        mode=mode,
                        focus=frame.focus,
                        families=families,
                        estimators=estimators,
                        quantiles=quantiles,
                        library=library,
                    )
                except Exception:
                    continue
                chronos_note = None
                if with_chronos and library == "lightgbm":
                    chronos_note = _blend_shift_chronos(
                        moments,
                        prefix,
                        target,
                        mode=mode,
                        focus=frame.focus,
                        families=families,
                        estimators=estimators,
                        star_pool=frame.star_pool,
                    )
                    chronos_used = chronos_used or bool(chronos_note.get("available"))
                ranked = beam(moments, base, star_pool=frame.star_pool, radius=1)
                if not ranked:
                    continue
                packed = _pack(ranked[0]["numbers"], ranked[0]["stars"], moments["sum"]["mid"])
                side = _shift_side(packed, actual, _rank_view(moments))
                if chronos_note and chronos_note.get("available"):
                    side["chronos"] = chronos_note
                readings[key] = side
        shifts.append(
            {
                "x": lag,
                "label": f"−{lag}",
                "date": target["date"],
                "actual": _public_numbers(actual),
                "readings": readings,
            }
        )
    return {
        "shifts": shifts,
        "summary": _shift_summary(shifts),
        "chronos": {"requested": with_chronos, "used": chronos_used},
    }


def _public_numbers(block: dict[str, Any]) -> dict[str, Any]:
    return {
        "numbers": block.get("numbers") or [],
        "stars": block.get("stars") or [],
        "sum": block.get("sum"),
        "n1": block.get("n1"),
        "n2": block.get("n2"),
        "n3": block.get("n3"),
        "n4": block.get("n4"),
        "n5": block.get("n5"),
        "star_sum": block.get("star_sum"),
        "e1": block.get("e1"),
        "e2": block.get("e2"),
        "spread": block.get("spread"),
        "consecutive": block.get("consecutive"),
        "star_spread": block.get("star_spread"),
        "star_consecutive": block.get("star_consecutive"),
    }


def _shift_side(
    predicted: dict[str, Any],
    actual: dict[str, Any],
    bands: dict[str, dict[str, float]] | None,
) -> dict[str, Any]:
    errors = {field: _signed(predicted.get(field), actual.get(field)) for field in SHIFT_FIELDS}
    in_band = {field: _covers(actual.get(field), None if bands is None else bands.get(field)) for field in SHIFT_FIELDS}
    numbers = predicted.get("numbers") or []
    stars = predicted.get("stars") or []
    return {
        "numbers": numbers,
        "stars": stars,
        "errors": errors,
        "in_band": in_band,
        "hits_numbers": _hits(numbers, actual.get("numbers") or []) if numbers else None,
        "hits_stars": _hits(stars, actual.get("stars") or []) if stars else None,
    }


def _shift_summary(shifts: list[dict[str, Any]]) -> dict[str, Any]:
    keys: set[str] = set()
    for shift in shifts:
        keys.update(shift["readings"])
    summary: dict[str, Any] = {}
    for key in sorted(keys):
        sum_errors = [
            shift["readings"][key]["errors"]["sum"]
            for shift in shifts
            if key in shift["readings"] and shift["readings"][key]["errors"].get("sum") is not None
        ]
        number_hits = [
            shift["readings"][key]["hits_numbers"]
            for shift in shifts
            if key in shift["readings"] and shift["readings"][key].get("hits_numbers") is not None
        ]
        summary[key] = {
            "mae_sum": None if not sum_errors else round(sum(abs(value) for value in sum_errors) / len(sum_errors), 4),
            "hits_numbers": None
            if not number_hits
            else round(sum(float(value) for value in number_hits) / len(number_hits), 4),
            "count": len(sum_errors),
        }
    return summary
