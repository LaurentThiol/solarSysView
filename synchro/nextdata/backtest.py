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
from synchro.nextdata.forecast import _apply_external, _rank_view, blend_mid, blend_weight
from synchro.nextdata.models import CHRONOS_SERIES, _clip, star_pool_of
from synchro.nextdata.pulse_features import public_pulse, pulse_of
from synchro.nextdata.panel import Frame
from synchro.nextdata.persist import NUMBER_POOL, NUMBER_SLOTS, STAR_SLOTS, score_swaps, snap_grid
from synchro.nextdata.project import beam, compose_ranks, stamp_grid
from synchro.nextdata.steps import MIN_HISTORY
from synchro.nextdata.uncertainty import chance_hits, chance_hits_mixed, mean_interval, versus_all

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
CHRONOS_WINDOW = 10
# n1 rejoint le niveau : c’est lui qui fait le centre du rang, la chaîne n’y pèse plus.
CHRONOS_TARGETS = {"sum": "sum", "star_sum": "star_sum", "n1": "level:n1"}


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
        star_pool=_target_pool(frame, t),
    )
    packed = _pack(snapped["numbers"], snapped["stars"], reading["packed"].get("sum_model"))
    swaps = snapped["swaps"]
    if t < len(frame.rows):
        swaps = score_swaps(swaps, frame.rows[t]["numbers"], frame.rows[t]["stars"])
    packed["swaps"] = swaps
    packed["held"] = snapped["held"]
    return packed


def retour_indices(frame: Frame) -> list[int]:
    """Pas du retour : chaque tirage du focus."""
    return list(range(max(frame.focus_start, MIN_HISTORY), len(frame.rows)))


def _model_block(parts: dict[str, Any], mode: str, library: str) -> dict[str, Any] | None:
    block = (parts.get(library) or {}).get(mode) or {}
    return block if "moments" in block else None


def model_error(parts: dict[str, Any], mode: str, library: str = "lightgbm") -> str | None:
    block = (parts.get(library) or {}).get(mode) or {}
    return block.get("error")


def _chronos_bands(parts: dict[str, Any], mode: str) -> dict[str, dict[str, float]] | None:
    block = (parts.get("chronos") or {}).get(mode) or {}
    if all(isinstance(block.get(name), dict) for name in CHRONOS_SERIES):
        return block
    return None


def _target_pool(frame: Frame, t: int) -> int:
    """Urne du tirage noté, ou celle du prochain tirage quand t est l’horizon."""
    if t < len(frame.rows):
        return star_pool_of(frame.rows[t], frame.star_pool)
    return star_pool_of(frame.horizon[0] if frame.horizon else None, frame.star_pool)


def _lightgbm_mids(parts: dict[str, Any], mode: str, star_pool: int) -> dict[str, float] | None:
    """Médianes LightGBM que Chronos rejoint, Darts compris, avant tout mélange."""
    block = _model_block(parts, mode, "lightgbm")
    if block is None:
        return None
    moments = {target: dict(block["moments"][target]) for target in CHRONOS_TARGETS.values() if target in block["moments"]}
    if len(moments) < len(CHRONOS_TARGETS):
        return None
    darts = (parts.get("darts") or {}).get(mode)
    if darts:
        _apply_external(moments, darts, names=("sum", "star_sum"), star_pool=star_pool)
    return {name: float(moments[target]["mid"]) for name, target in CHRONOS_TARGETS.items()}


def _chronos_weights(
    frame: Frame,
    mode: str,
    window: list[tuple[int, dict[str, Any]]],
) -> tuple[dict[str, float], dict[str, tuple[float, float]] | None, int]:
    """Poids de LightGBM par série, sur les erreurs moyennes des pas d’avant. Moitié-moitié tant qu’il en manque."""
    totals = {name: [0.0, 0.0] for name in CHRONOS_SERIES}
    count = 0
    for t, step in window:
        mids = _lightgbm_mids(step["parts"], mode, _target_pool(frame, t))
        bands = _chronos_bands(step["parts"], mode)
        if mids is None or bands is None or t >= len(frame.rows):
            continue
        row = frame.rows[t]
        for name in CHRONOS_SERIES:
            truth = float(row[name])
            totals[name][0] += abs(mids[name] - truth)
            totals[name][1] += abs(float(bands[name]["mid"]) - truth)
        count += 1
    if count < CHRONOS_WINDOW:
        return {name: 0.5 for name in CHRONOS_SERIES}, None, count
    mae = {name: (lgb / count, chronos / count) for name, (lgb, chronos) in totals.items()}
    return {name: blend_weight(*pair) for name, pair in mae.items()}, mae, count


def _blend_chronos(
    frame: Frame,
    mode: str,
    moments: dict[str, dict[str, float]],
    parts: dict[str, Any],
    window: list[tuple[int, dict[str, Any]]],
    star_pool: int,
) -> dict[str, Any]:
    """Chronos rejoint LightGBM sur la somme, la somme des étoiles et le niveau de n1, bornes 10–90 comprises.

    Chaque série a son poids, réglé sur les pas d’avant (`window`), jamais sur
    le tirage noté. CatBoost n’est pas mélangé.
    """
    bands = _chronos_bands(parts, mode)
    if bands is None:
        return {"available": False, "weight": 1.0}
    weights, mae, count = _chronos_weights(frame, mode, window)
    for name, target in CHRONOS_TARGETS.items():
        if target not in moments:
            continue
        moments[target] = {
            key: _clip(target, blend_mid(moments[target][key], bands[name][key], weights[name]), star_pool)
            for key in ("lo", "mid", "hi")
        }
    return {
        "available": True,
        "weight": round(weights["sum"], 4),
        "weights": {name: round(value, 4) for name, value in weights.items()},
        "window": count,
        "holdout_mae_lgb": None if mae is None else round(mae["sum"][0], 4),
        "holdout_mae_chronos": None if mae is None else round(mae["sum"][1], 4),
        "covariates": (parts.get("chronos") or {}).get("covariates"),
        **{name: round(float(bands[name]["mid"]), 4) for name in CHRONOS_SERIES},
    }


def _assemble(
    frame: Frame,
    t: int,
    step: dict[str, Any],
    window: list[tuple[int, dict[str, Any]]],
    with_chronos: bool,
    pulse: bool,
) -> dict[str, Any]:
    rows = frame.rows
    parts = step["parts"]
    last = rows[t - 1]
    pool = _target_pool(frame, t)
    base = recount(rows[max(0, t - frame.focus) : t], star_pool=pool)
    out: dict[str, Any] = {
        "t": t,
        "date": rows[t]["date"] if t < len(rows) else frame.next_date,
        "star_pool": pool,
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
                _apply_external(moments, darts, star_pool=pool)
                engine = "darts"
            if with_chronos:
                chronos = _blend_chronos(frame, mode, moments, parts, window, pool)
        composed, trace = compose_ranks(moments, last)
        if trace is not None and chronos and chronos["available"]:
            trace["numbers"][0]["chronos"] = {"value": chronos["n1"], "share": round(1.0 - chronos["weights"]["n1"], 4)}
        source = rows[t] if t < len(rows) else frame.horizon[0]
        ranked = beam(composed, base, star_pool=pool, pulse=pulse_of(source) if pulse else None)
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
            "view": _rank_view(composed, pool),
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


def _pulse_key(frame: Frame, t: int, pulse: bool) -> tuple[tuple[float, ...], tuple[float, ...]] | None:
    if not pulse:
        return None
    source = frame.rows[t] if t < len(frame.rows) else frame.horizon[0]
    state = pulse_of(source) or {}
    return (tuple(state.get("pi") or ()), tuple(state.get("star_pi") or ()))


def _memo(
    frame: Frame,
    t: int,
    step: dict[str, Any],
    window: list[tuple[int, dict[str, Any]]],
    with_chronos: bool,
    pulse: bool,
) -> dict[str, Any]:
    """Un pas assemblé ne change pas tant que ses morceaux et ceux des pas qui règlent Chronos ne changent pas. Lecture seule."""
    used = window if with_chronos else []
    target = None if t >= len(frame.rows) else (tuple(frame.rows[t]["numbers"]), tuple(frame.rows[t]["stars"]))
    key = (
        step["key"],
        tuple(past["key"] for _t, past in used),
        bool(with_chronos),
        frame.focus,
        frame.star_pool,
        target,
        _pulse_key(frame, t, pulse),
    )
    with _MEMO_LOCK:
        hit = _MEMO.get(key)
        if hit is not None:
            _MEMO.move_to_end(key)
            return hit
    built = _assemble(frame, t, step, used, with_chronos, pulse)
    with _MEMO_LOCK:
        _MEMO[key] = built
        while len(_MEMO) > _MEMO_LIMIT:
            _MEMO.popitem(last=False)
    return built


def assemble(
    frame: Frame,
    ready: dict[int, dict[str, Any]],
    *,
    with_chronos: bool = False,
    pulse: bool = False,
) -> dict[int, dict[str, Any]]:
    """Les pas prêts, assemblés. Les poids de Chronos se règlent sur les CHRONOS_WINDOW pas prêts d’avant.

    `pulse` ajoute au faisceau le log π de chaque numéro choisi. Sans la famille, le terme est absent.
    """
    order = sorted(ready)
    return {
        t: _memo(
            frame,
            t,
            ready[t],
            [(p, ready[p]) for p in order[max(0, index - CHRONOS_WINDOW) : index]],
            with_chronos,
            pulse,
        )
        for index, t in enumerate(order)
    }


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
        pairs = [
            (step["readings"][key]["view"], step["truth"], int(step.get("star_pool") or star_pool))
            for step in steps
            if key in step["readings"] and step.get("truth")
        ]
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
    `versus` compare chaque lecture, tirage par tirage, aux lectures qui ne sont
    pas des jumelles : une jumelle s’y compare donc à sa lecture d’origine.
    """
    star_pool = frame.star_pool if frame is not None else 12
    kept: list[dict[str, Any]] = []
    for step in steps:
        if any(mode not in step["readings"] for mode in MODES):
            continue
        item: dict[str, Any] = {
            "date": step["date"],
            "star_pool": int(step.get("star_pool") or star_pool),
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
    metrics = {mode: _metrics(kept, mode, star_pool) for mode in metric_keys}
    metrics["persistence"] = _metrics(kept, "persistence", star_pool)
    metrics["mean"] = _sum_only(kept, "mean")
    sums = {key: _aligned(kept, key, "sum") for key in metrics}
    for key, gaps in versus_all(sums, _rivals(metrics)).items():
        metrics[key]["versus"] = gaps
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


def _aligned(steps: list[dict[str, Any]], mode: str, field: str) -> list[float | None]:
    """Écart prévu − sorti à chaque pas, None quand la lecture ou le tirage n’a pas ce champ."""
    out: list[float | None] = []
    for step in steps:
        side = step.get(mode) or {}
        actual = step["actual"]
        if side.get(field) is None or actual.get(field) is None:
            out.append(None)
            continue
        out.append(float(side[field]) - float(actual[field]))
    return out


def _errors(steps: list[dict[str, Any]], mode: str, field: str) -> list[float]:
    return [err for err in _aligned(steps, mode, field) if err is not None]


def _rivals(keys: Iterable[str]) -> list[str]:
    """Lectures auxquelles chacune se compare : toutes, sauf les jumelles Persist."""
    return [key for key in keys if not key.endswith("_persist")]


def _chance(number_hits: list[int], star_hits: list[int], star_pools: list[int]) -> dict[str, Any]:
    return {
        "numbers": chance_hits(number_hits, slots=NUMBER_SLOTS, pool=NUMBER_POOL),
        "stars": chance_hits_mixed(star_hits, slots=STAR_SLOTS, pools=star_pools),
    }


def _metrics(steps: list[dict[str, Any]], mode: str, star_pool: int = 12) -> dict[str, Any]:
    mae = {}
    rmse = {}
    for field in FIELDS:
        errs = _errors(steps, mode, field)
        mae[field] = _mae(errs)
        rmse[field] = _rmse(errs)
    number_hits = []
    star_hits = []
    star_pools = []
    for step in steps:
        side = step.get(mode) or {}
        if not side.get("numbers"):
            continue
        number_hits.append(_hits(side["numbers"], step["actual"]["numbers"]))
        star_hits.append(_hits(side["stars"], step["actual"]["stars"]))
        star_pools.append(int(step.get("star_pool") or star_pool))
    return {
        "mae": mae,
        "rmse": rmse,
        "mae_sum_ci": mean_interval((abs(err) for err in _errors(steps, mode, "sum")), floor=0.0),
        "hits_numbers": _mae([float(v) for v in number_hits]) if number_hits else None,
        "hits_stars": _mae([float(v) for v in star_hits]) if star_hits else None,
        "hits_chance": _chance(number_hits, star_hits, star_pools),
    }


def _sum_only(steps: list[dict[str, Any]], mode: str) -> dict[str, Any]:
    errs = _errors(steps, mode, "sum")
    return {
        "mae": {"sum": _mae(errs)},
        "rmse": {"sum": _rmse(errs)},
        "mae_sum_ci": mean_interval((abs(err) for err in errs), floor=0.0),
        "hits_numbers": None,
        "hits_stars": None,
        "hits_chance": {"numbers": None, "stars": None},
    }


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
            "mae_sum_ci": block.get("mae_sum_ci"),
            "hits_chance": block.get("hits_chance"),
            "versus": block.get("versus", {}),
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
            view, info = calibrated_view(step, key, history, int(step.get("star_pool") or frame.star_pool))
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
                "star_pool": int(step.get("star_pool") or frame.star_pool),
                "actual": _public_numbers(actual),
                "pulse": public_pulse(rows[t]),
                "readings": readings,
            }
        )
    return {
        "shifts": shifts,
        "summary": _shift_summary(shifts, frame.star_pool),
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


def _shift_summary(shifts: list[dict[str, Any]], star_pool: int = 12) -> dict[str, Any]:
    """MAE de somme et communs de chaque lecture sur les décalages, avec leurs marges à 95 %.

    `versus` compare chaque lecture, décalage par décalage, aux lectures qui ne
    sont pas des jumelles Persist, moyenne et persistance comprises.
    """
    keys: set[str] = set()
    for shift in shifts:
        keys.update(shift["readings"])
    ordered = sorted(keys)
    sums = {
        key: [((shift["readings"].get(key) or {}).get("errors") or {}).get("sum") for shift in shifts]
        for key in ordered
    }
    versus = versus_all(sums, _rivals(ordered))
    summary: dict[str, Any] = {}
    for key in ordered:
        sides = [shift["readings"][key] for shift in shifts if key in shift["readings"]]
        sum_errors = [value for value in sums[key] if value is not None]
        number_hits = [int(side["hits_numbers"]) for side in sides if side.get("hits_numbers") is not None]
        star_hits = [int(side["hits_stars"]) for side in sides if side.get("hits_stars") is not None]
        star_pools = [
            int(shift.get("star_pool") or star_pool)
            for shift in shifts
            if key in shift["readings"] and shift["readings"][key].get("hits_stars") is not None
        ]
        summary[key] = {
            "mae_sum": None if not sum_errors else round(sum(abs(value) for value in sum_errors) / len(sum_errors), 4),
            "mae_sum_ci": mean_interval((abs(value) for value in sum_errors), floor=0.0),
            "hits_numbers": None
            if not number_hits
            else round(sum(float(value) for value in number_hits) / len(number_hits), 4),
            "hits_stars": None if not star_hits else round(sum(float(value) for value in star_hits) / len(star_hits), 4),
            "hits_chance": _chance(number_hits, star_hits, star_pools),
            "versus": versus[key],
            "count": len(sum_errors),
        }
    return summary
