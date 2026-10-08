"""Retour et décalages : les pas du pronostic, relus sur les tirages déjà sortis.

Chaque pas s’assemble comme le prochain tirage : Darts sur LightGBM, Chronos
s’il est demandé, rangs arbitrés, puis faisceau des grilles voisines à ±3. Le
retour de nextData et les décalages de nextDataTraining sont les mêmes pas ;
leurs bandes 10–90 se calibrent sur les pas qui les précèdent.
"""

from __future__ import annotations

import copy
import math
import threading
from collections import OrderedDict
from typing import Any, Iterable

from synchro.nextdata.conformal import calibrate, coverage, truth_of
from synchro.nextdata.covariates import SHAPE_SERIES, grid_shape
from synchro.nextdata.empirical import recount
from synchro.nextdata.forecast import _apply_external, _clip, _rank_view, blend_mid, blend_weight
from synchro.nextdata.panel import Frame
from synchro.nextdata.persist import score_swaps, snap_grid
from synchro.nextdata.project import beam, compose_ranks, stamp_grid
from synchro.nextdata.steps import CHRONOS_SERIES, MIN_HISTORY

FIELDS = ("sum", "n1", "n2", "n3", "n4", "n5", "star_sum", "e1", "e2", *SHAPE_SERIES)
MODES = ("corpus", "fenetre")
READINGS = (
    ("corpus", "corpus", "lightgbm"),
    ("fenetre", "fenetre", "lightgbm"),
    ("corpus_catboost", "corpus", "catboost"),
    ("fenetre_catboost", "fenetre", "catboost"),
)
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


def persist_side(frame: Frame, t: int, reading: dict[str, Any], persist: dict[str, int]) -> dict[str, Any]:
    """Grille Persist d’une lecture au pas t, ses échanges et, si le tirage est sorti, leur issue."""
    grid = reading["grid"]
    snapped = snap_grid(
        grid["numbers"],
        grid["stars"],
        frame.rows[max(0, t - 2) : t],
        radius=persist["radius"],
        limit=persist["limit"],
        star_pool=frame.star_pool,
    )
    packed = _pack(snapped["numbers"], snapped["stars"], reading["packed"].get("sum_model"))
    swaps = snapped["swaps"]
    if t < len(frame.rows):
        swaps = score_swaps(swaps, frame.rows[t]["numbers"], frame.rows[t]["stars"])
    packed["swaps"] = swaps
    packed["held"] = snapped["held"]
    return packed


def retour_indices(frame: Frame, *, with_chronos: bool = False) -> list[int]:
    """Pas du retour : chaque tirage du focus. Chronos lit aussi le pas d’avant le premier."""
    start = max(frame.focus_start, MIN_HISTORY)
    first = start - 1 if with_chronos and start - 1 >= MIN_HISTORY else start
    return list(range(first, len(frame.rows)))


def _model_block(parts: dict[str, Any], mode: str, library: str) -> dict[str, Any] | None:
    block = (parts.get(library) or {}).get(mode) or {}
    return block if "moments" in block else None


def model_error(parts: dict[str, Any], mode: str, library: str = "lightgbm") -> str | None:
    block = (parts.get(library) or {}).get(mode) or {}
    return block.get("error")


def _blend_chronos(
    frame: Frame,
    t: int,
    mode: str,
    moments: dict[str, dict[str, float]],
    parts: dict[str, Any],
    previous: dict[str, Any] | None,
) -> dict[str, Any]:
    """Chronos prévoit le tirage du pas. Son poids se règle sur le pas d’avant, contre LightGBM seul.

    Le tirage noté ne sert pas à choisir le poids. CatBoost n’est pas mélangé.
    """
    note: dict[str, Any] = {"available": False, "weight": 1.0}
    points = (parts.get("chronos") or {}).get(mode) or {}
    if previous is None or points.get("sum") is None:
        return note
    held_points = (previous["parts"].get("chronos") or {}).get(mode) or {}
    if held_points.get("sum") is None:
        return note
    held = _memo(frame, t - 1, previous, None, False)["readings"].get(mode)
    if not held:
        return note
    truth = float(frame.rows[t - 1]["sum"])
    lgb_mae = abs(float(sum(held["grid"]["numbers"])) - truth)
    chrono_mae = abs(float(held_points["sum"]) - truth)
    weight = blend_weight(lgb_mae, chrono_mae)
    for name in CHRONOS_SERIES:
        point = points.get(name)
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
        **{name: None if points.get(name) is None else round(float(points[name]), 4) for name in CHRONOS_SERIES},
    }


def _assemble(
    frame: Frame,
    t: int,
    step: dict[str, Any],
    previous: dict[str, Any] | None,
    with_chronos: bool,
) -> dict[str, Any]:
    rows = frame.rows
    parts = step["parts"]
    last = rows[t - 1]
    base = recount(rows[max(0, t - frame.focus) : t], star_pool=frame.star_pool)
    out: dict[str, Any] = {
        "t": t,
        "date": rows[t]["date"] if t < len(rows) else frame.next_date,
        "persistence": _actual(last),
        "mean": {"sum": sum(float(row["sum"]) for row in rows[:t]) / t},
        "readings": {},
    }
    if t < len(rows):
        out["actual"] = _actual(rows[t])
        out["truth"] = truth_of(rows[t])
    for key, mode, library in READINGS:
        block = _model_block(parts, mode, library)
        if block is None:
            continue
        moments = copy.deepcopy(block["moments"])
        engine = library
        chronos = None
        if library == "lightgbm":
            darts = (parts.get("darts") or {}).get(mode)
            if darts:
                _apply_external(moments, darts, mix_n1=True)
                engine = "darts"
            if with_chronos:
                chronos = _blend_chronos(frame, t, mode, moments, parts, previous)
        composed, trace = compose_ranks(moments, last)
        ranked = beam(composed, base, star_pool=frame.star_pool)
        if not ranked:
            continue
        best = ranked[0]
        packed = _pack(best["numbers"], best["stars"], moments["sum"]["mid"])
        packed["sum_model"] = round(float(moments["sum"]["mid"]), 4)
        out["readings"][key] = {
            "mode": mode,
            "library": library,
            "engine": engine,
            "moments": composed,
            "view": _rank_view(composed, frame.star_pool),
            "grid": {"numbers": best["numbers"], "stars": best["stars"], "score": best["score"]},
            "alternates": ranked[1:],
            "packed": packed,
            "arbitration": None if trace is None else stamp_grid(trace, best["numbers"], best["stars"]),
            "chronos": chronos,
            "importance": block.get("importance") or [],
        }
    return out


_MEMO: OrderedDict[tuple[Any, ...], dict[str, Any]] = OrderedDict()
_MEMO_LIMIT = 4096
_MEMO_LOCK = threading.Lock()


def _memo(
    frame: Frame,
    t: int,
    step: dict[str, Any],
    previous: dict[str, Any] | None,
    with_chronos: bool,
) -> dict[str, Any]:
    """Un pas assemblé ne change pas tant que ses morceaux ne changent pas. Lecture seule."""
    used = previous if with_chronos else None
    target = None if t >= len(frame.rows) else (tuple(frame.rows[t]["numbers"]), tuple(frame.rows[t]["stars"]))
    key = (step["key"], None if used is None else used["key"], bool(with_chronos), frame.focus, frame.star_pool, target)
    with _MEMO_LOCK:
        hit = _MEMO.get(key)
        if hit is not None:
            _MEMO.move_to_end(key)
            return hit
    built = _assemble(frame, t, step, used, with_chronos)
    with _MEMO_LOCK:
        _MEMO[key] = built
        while len(_MEMO) > _MEMO_LIMIT:
            _MEMO.popitem(last=False)
    return built


def assemble(frame: Frame, ready: dict[int, dict[str, Any]], *, with_chronos: bool = False) -> dict[int, dict[str, Any]]:
    """Les pas prêts, assemblés. Chronos a besoin du pas d’avant : sans lui, il reste à l’écart."""
    return {t: _memo(frame, t, ready[t], ready.get(t - 1), with_chronos) for t in sorted(ready)}


def calibrated_view(
    step: dict[str, Any],
    key: str,
    history: Iterable[dict[str, Any]],
    star_pool: int,
) -> tuple[dict[str, dict[str, float]], dict[str, Any]]:
    """Bandes d’une lecture, calibrées sur les pas d’avant de la même lecture."""
    pairs = [(past["readings"][key]["view"], past["truth"]) for past in history if key in past["readings"] and past.get("truth")]
    return calibrate(step["readings"][key]["view"], pairs, star_pool)


def band_report(steps: list[dict[str, Any]], star_pool: int) -> dict[str, Any]:
    """Couverture des bandes sur le retour, brute puis calibrée sur les seuls pas d’avant."""
    out: dict[str, Any] = {}
    for key, _mode, _library in READINGS:
        pairs = [(step["readings"][key]["view"], step["truth"]) for step in steps if key in step["readings"] and step.get("truth")]
        if pairs:
            out[key] = coverage(pairs, star_pool)
    return out


def retour_report(
    steps: list[dict[str, Any]],
    *,
    frame: Frame | None = None,
    persist: dict[str, int] | None = None,
) -> dict[str, Any]:
    """Métriques du retour sur les pas prêts du focus. Un pas sans ses deux lectures LightGBM est écarté.

    Avec Persist, chaque lecture a sa jumelle `<lecture>_persist`, notée sur le même tirage.
    """
    kept: list[dict[str, Any]] = []
    for step in steps:
        if any(mode not in step["readings"] for mode in MODES):
            continue
        item: dict[str, Any] = {
            "date": step["date"],
            "actual": step["actual"],
            "persistence": step["persistence"],
            "mean": step["mean"],
        }
        for key, reading in step["readings"].items():
            side = dict(reading["packed"])
            if reading["arbitration"]:
                side["arbitration"] = reading["arbitration"]
            item[key] = side
            if persist and frame is not None:
                item[f"{key}_persist"] = persist_side(frame, step["t"], reading, persist)
        kept.append(item)

    metric_keys = list(MODES)
    if any("corpus_catboost" in item for item in kept):
        metric_keys.extend(("corpus_catboost", "fenetre_catboost"))
    metric_keys.extend(
        [f"{key}_persist" for key in metric_keys if any(f"{key}_persist" in item for item in kept)]
    )
    metrics = {mode: _metrics(kept, mode) for mode in metric_keys}
    metrics["persistence"] = _metrics(kept, "persistence")
    metrics["mean"] = _sum_only(kept, "mean")
    best = "corpus"
    corpus_mae = metrics["corpus"]["mae"].get("sum")
    window_mae = metrics["fenetre"]["mae"].get("sum")
    if corpus_mae is None and window_mae is not None:
        best = "fenetre"
    elif corpus_mae is not None and window_mae is not None and window_mae < corpus_mae:
        best = "fenetre"
    return {
        "rows": [_public_step(item) for item in kept],
        "metrics": _public_metrics(metrics),
        "best_mae_sum": best,
        "draw_count": len(kept),
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
        if block.get("arbitration"):
            kept["arbitration"] = block["arbitration"]
        if "swaps" in block:
            kept["swaps"] = block["swaps"]
            kept["held"] = block.get("held")
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
    for key, _mode, _library in READINGS:
        if step.get(f"{key}_persist"):
            published[f"{key}_persist"] = side(step[f"{key}_persist"])
    return published


def _signed(predicted: float | None, actual: float | None) -> float | None:
    if predicted is None or actual is None:
        return None
    return round(float(predicted) - float(actual), 4)


def _covers(actual: float | None, band: dict[str, float] | None) -> bool | None:
    if actual is None or not band:
        return None
    return float(band["lo"]) <= float(actual) <= float(band["hi"])


def shift_report(
    frame: Frame,
    steps: dict[int, dict[str, Any]],
    *,
    lags: Iterable[int] | None = None,
    chronos_requested: bool = False,
    persist: dict[str, int] | None = None,
) -> dict[str, Any]:
    """Dix coupures −1…−10 : les dix derniers pas du retour.

    x = 1 cache le dernier tirage. x = 10 se place dix tirages plus tôt et
    prévoit celui qui venait juste après. L’écart est prévu − sorti. Deux
    repères sans modèle, comme le retour de nextData : la persistance et la
    somme moyenne des tirages d’avant. Les bandes se calibrent sur les pas du
    focus qui précèdent la coupure. Avec Persist, chaque lecture a sa jumelle
    `<lecture>_persist`, notée sur le même tirage avec les mêmes bandes.
    """
    rows = frame.rows
    retour = [steps[t] for t in sorted(steps) if frame.focus_start <= t < len(rows)]
    shifts: list[dict[str, Any]] = []
    chronos_used = False
    for lag in lags if lags is not None else range(1, SHIFT_MAX + 1):
        t = len(rows) - int(lag)
        step = steps.get(t)
        if step is None or "actual" not in step:
            continue
        actual = step["actual"]
        history = [past for past in retour if past["t"] < t]
        readings: dict[str, Any] = {
            "persistence": _shift_side(step["persistence"], actual, None),
            "mean": _shift_side({"sum": step["mean"]["sum"]}, actual, None),
        }
        for key, reading in step["readings"].items():
            view, info = calibrated_view(step, key, history, frame.star_pool)
            side = _shift_side(reading["packed"], actual, view)
            side["in_band_raw"] = {field: _covers(actual.get(field), reading["view"].get(field)) for field in SHIFT_FIELDS}
            side["calibrated"] = info["calibrated"]
            side["calibration_steps"] = info["steps"]
            if reading["arbitration"]:
                side["arbitration"] = reading["arbitration"]
            if reading["chronos"] and reading["chronos"].get("available"):
                side["chronos"] = reading["chronos"]
                chronos_used = True
            readings[key] = side
            if persist:
                snapped = persist_side(frame, t, reading, persist)
                twin = _shift_side(snapped, actual, view)
                twin["swaps"] = snapped["swaps"]
                twin["held"] = snapped["held"]
                readings[f"{key}_persist"] = twin
        shifts.append(
            {
                "x": int(lag),
                "label": f"−{int(lag)}",
                "date": step["date"],
                "actual": _public_numbers(actual),
                "readings": readings,
            }
        )
    return {
        "shifts": shifts,
        "summary": _shift_summary(shifts),
        "chronos": {"requested": chronos_requested, "used": chronos_used},
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
