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
from synchro.nextdata.models import (
    CHRONOS_SERIES,
    RANK_SERIES,
    _clip,
    pas_du_decalage,
    star_pool_of,
    timesfm_point,
)
from synchro.nextdata.pulse_features import public_pulse, pulse_of
from synchro.nextdata.panel import Frame
from synchro.nextdata.persist import NUMBER_POOL, NUMBER_SLOTS, STAR_SLOTS, score_swaps, snap_grid
from synchro.nextdata.project import beam, compose_ranks, project_under_sums, stamp_grid
from synchro.nextdata.steps import MIN_HISTORY
from synchro.nextdata.xray import core_trace, public_xray
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
# Le mélange ne porte que sur les deux sommes. Aucun rang n’y entre.
CHRONOS_TARGETS = {"sum": "sum", "star_sum": "star_sum"}
RANK_FIELDS = RANK_SERIES
SUM_READINGS = ("lightgbm", "chronos", "timesfm")


def _mean_reading(prefix: list[dict[str, Any]]) -> dict[str, Any]:
    """Moyenne des tirages d’avant, puis projection sur ces deux sommes. Pas une grille jouée."""
    if not prefix:
        return {"sum": 0.0, "star_sum": 0.0}
    def avg(name: str) -> float:
        return sum(float(row[name]) for row in prefix) / len(prefix)
    numbers, stars = project_under_sums(
        [avg(name) for name in ("n1", "n2", "n3", "n4", "n5")],
        [avg("e1"), avg("e2")],
        avg("sum"),
        avg("star_sum"),
    )
    packed = _pack(numbers, stars, avg("sum"))
    packed["sum"] = avg("sum")
    packed["star_sum"] = avg("star_sum")
    # La moyenne n’est pas une grille jouée : les rangs projetés servent aux écarts.
    packed["numbers"] = []
    packed["stars"] = []
    return packed


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


def assert_no_rank_weight(weights: dict[str, float]) -> None:
    """Un poids non nul sur n1…n5 ou e1, e2 est refusé. Seules les sommes se mélangent."""
    leaked = [name for name in (*RANK_FIELDS, "g1", "g2", "g3", "g4", "e_gap") if abs(float(weights.get(name, 0.0))) > 0]
    if leaked:
        raise ValueError("Un rang ne reçoit pas de poids : " + ", ".join(leaked) + ".")


def sum_weights(errors: dict[str, float], ready: int) -> dict[str, float]:
    """Poids d’une somme. Moins de dix pas : TimesFM dehors, Chronos moitié-moitié avec LightGBM.

    À dix pas, le poids va à la lecture la moins trompée. Une lecture dont l’erreur
    n’est pas plus basse reste à 0. À erreur égale, LightGBM garde le poids.
    """
    assert_no_rank_weight(errors)
    present = {name: float(value) for name, value in errors.items() if value is not None and name in SUM_READINGS}
    held_out = ready < CHRONOS_WINDOW and "timesfm" in present
    if held_out:
        present.pop("timesfm")
    weights = {name: 0.0 for name in present}
    if held_out:
        weights["timesfm"] = 0.0
    if ready < CHRONOS_WINDOW:
        if "lightgbm" in present and "chronos" in present:
            weights["lightgbm"] = 0.5
            weights["chronos"] = 0.5
        elif "lightgbm" in present:
            weights["lightgbm"] = 1.0
        elif "chronos" in present:
            weights["chronos"] = 1.0
        return weights
    if not present:
        return weights
    best = min(present.values())
    tied = [name for name, err in present.items() if err <= best + 1e-12]
    winner = "lightgbm" if "lightgbm" in tied else sorted(tied)[0]
    for name in weights:
        weights[name] = 1.0 if name == winner else 0.0
    return weights


def _timesfm_bands(parts: dict[str, Any], mode: str, index: int = 0) -> dict[str, dict[str, float]] | None:
    block = (parts.get("timesfm") or {}).get(mode) or {}
    horizon = block.get("horizon")
    if isinstance(horizon, list) and 0 <= index < len(horizon):
        step = horizon[index]
        if isinstance(step, dict) and all(isinstance(step.get(name), dict) for name in CHRONOS_SERIES):
            return step
    if all(isinstance(block.get(name), dict) for name in CHRONOS_SERIES):
        return {name: block[name] for name in CHRONOS_SERIES}
    return None


def _sum_record(
    frame: Frame,
    mode: str,
    window: list[tuple[int, dict[str, Any]]],
) -> tuple[int, dict[str, dict[str, float]]]:
    """Erreurs moyennes de sum et star_sum, par lecture, sur les pas d’avant. Jamais le tirage noté."""
    totals: dict[str, dict[str, list[float]]] = {name: {} for name in CHRONOS_SERIES}
    count = 0
    for t, step in window:
        if t >= len(frame.rows):
            continue
        mids = _lightgbm_mids(step["parts"], mode, _target_pool(frame, t))
        chronos = _chronos_bands(step["parts"], mode)
        times = _timesfm_bands(step["parts"], mode, 0)
        if mids is None:
            continue
        row = frame.rows[t]
        count += 1
        sources = {"lightgbm": mids}
        if chronos is not None:
            sources["chronos"] = {name: float(chronos[name]["mid"]) for name in CHRONOS_SERIES}
        if times is not None:
            sources["timesfm"] = {name: float(times[name]["mid"]) for name in CHRONOS_SERIES}
        for name in CHRONOS_SERIES:
            truth = float(row[name])
            bucket = totals[name]
            for reading, values in sources.items():
                bucket.setdefault(reading, []).append(abs(float(values[name]) - truth))
    mae = {
        name: {reading: sum(errs) / len(errs) for reading, errs in groups.items() if errs}
        for name, groups in totals.items()
    }
    return count, mae


def _mix_quantile(pieces: dict[str, float], weights: dict[str, float]) -> float:
    used = {name: value for name, value in pieces.items() if weights.get(name, 0.0) > 0}
    if not used:
        return float(next(iter(pieces.values())))
    total = sum(weights[name] for name in used)
    return sum(weights[name] * value for name, value in used.items()) / total


def _blend_chronos(
    frame: Frame,
    mode: str,
    moments: dict[str, dict[str, float]],
    parts: dict[str, Any],
    window: list[tuple[int, dict[str, Any]]],
    star_pool: int,
    *,
    with_timesfm: bool = False,
) -> dict[str, Any]:
    """Mélange seulement sum et star_sum. Les rangs ne reçoivent pas de poids.

    Moins de dix pas prêts : TimesFM reste dehors, Chronos reste moitié-moitié
    avec LightGBM. CatBoost n’est pas mélangé.
    """
    bands = _chronos_bands(parts, mode)
    times = _timesfm_bands(parts, mode, 0) if with_timesfm else None
    if bands is None and times is None:
        return {"available": False, "weight": 1.0}
    count, mae = _sum_record(frame, mode, window)
    per_series: dict[str, dict[str, float]] = {}
    for name in CHRONOS_SERIES:
        errors: dict[str, float] = {}
        known = mae.get(name) or {}
        if count >= CHRONOS_WINDOW and "lightgbm" in known:
            errors["lightgbm"] = known["lightgbm"]
        else:
            errors["lightgbm"] = 0.0
        if bands is not None and (count < CHRONOS_WINDOW or "chronos" in known):
            errors["chronos"] = 0.0 if count < CHRONOS_WINDOW else known["chronos"]
        if times is not None and (count < CHRONOS_WINDOW or "timesfm" in known):
            errors["timesfm"] = 0.0 if count < CHRONOS_WINDOW else known["timesfm"]
        per_series[name] = sum_weights(errors, count if bands is not None or times is not None else 0)
    for name, target in CHRONOS_TARGETS.items():
        if target not in moments:
            continue
        pieces = {
            edge: {
                "lightgbm": float(moments[target][edge]),
                **({} if bands is None else {"chronos": float(bands[name][edge])}),
                **({} if times is None else {"timesfm": float(times[name][edge])}),
            }
            for edge in ("lo", "mid", "hi")
        }
        weights = per_series[name]
        moments[target] = {
            edge: _clip(target, _mix_quantile(pieces[edge], weights), star_pool) for edge in ("lo", "mid", "hi")
        }
    lgb_sum = per_series["sum"].get("lightgbm", 1.0)
    sum_mae = mae.get("sum") or {}
    note = {
        "available": bands is not None,
        "weight": round(float(lgb_sum), 4),
        "weights": {name: round(float(per_series[name].get("lightgbm", 1.0)), 4) for name in CHRONOS_SERIES},
        "shares": {name: {reading: round(float(share), 4) for reading, share in per_series[name].items()} for name in CHRONOS_SERIES},
        "window": count,
        "holdout_mae_lgb": None if count < CHRONOS_WINDOW or "lightgbm" not in sum_mae else round(sum_mae["lightgbm"], 4),
        "holdout_mae_chronos": None if count < CHRONOS_WINDOW or "chronos" not in sum_mae else round(sum_mae["chronos"], 4),
        "covariates": (parts.get("chronos") or {}).get("covariates"),
        "shape": _shape_owner(per_series["sum"]),
        "star_shape": _shape_owner(per_series["star_sum"]),
    }
    if bands is not None:
        note.update({name: round(float(bands[name]["mid"]), 4) for name in CHRONOS_SERIES})
    if times is not None:
        note["timesfm"] = {
            "available": True,
            "sum": round(float(times["sum"]["mid"]), 4),
            "star_sum": round(float(times["star_sum"]["mid"]), 4),
            "lo": {"sum": round(float(times["sum"]["lo"]), 4), "star_sum": round(float(times["star_sum"]["lo"]), 4)},
            "hi": {"sum": round(float(times["sum"]["hi"]), 4), "star_sum": round(float(times["star_sum"]["hi"]), 4)},
            "weights": {name: round(float(per_series[name].get("timesfm", 0.0)), 4) for name in CHRONOS_SERIES},
        }
    assert_no_rank_weight({name: 0.0 for name in RANK_FIELDS})
    return note


def _shape_owner(weights: dict[str, float]) -> str:
    """La forme retenue est celle de la lecture qui a le poids. À égalité, LightGBM."""
    if not weights:
        return "lightgbm"
    best = max(weights.values())
    tied = [name for name, weight in weights.items() if weight >= best - 1e-12 and weight > 0]
    if not tied or "lightgbm" in tied:
        return "lightgbm"
    return sorted(tied)[0]


def _forme(source: dict[str, Any] | None, names: tuple[str, ...]) -> list[float] | None:
    if not source:
        return None
    values: list[float] = []
    for name in names:
        raw = source.get(name)
        if isinstance(raw, dict) and "mid" in raw:
            values.append(float(raw["mid"]))
        elif isinstance(raw, (int, float)) and not isinstance(raw, bool):
            values.append(float(raw))
        else:
            return None
    return values


def _winner_forme(parts: dict[str, Any], mode: str, moments: dict[str, Any], owner: str, names: tuple[str, ...]) -> list[float] | None:
    if owner == "chronos":
        block = ((parts.get("chronos") or {}).get(mode) or {}).get("stage2")
        found = _forme(block, names)
        if found is not None:
            return found
    if owner == "timesfm":
        block = (parts.get("timesfm") or {}).get(mode) or {}
        found = _forme(block.get("stage2"), names)
        if found is not None:
            return found
    if owner == "darts":
        block = (parts.get("darts") or {}).get(mode) or {}
        found = _forme(block.get("stage2") if isinstance(block, dict) else None, names)
        if found is not None:
            return found
    levels = []
    for name in names:
        band = moments.get(f"level:{name}") or moments.get(name)
        if not isinstance(band, dict) or "mid" not in band:
            return None
        levels.append(float(band["mid"]))
    return levels


def _assemble(
    frame: Frame,
    t: int,
    step: dict[str, Any],
    window: list[tuple[int, dict[str, Any]]],
    with_chronos: bool,
    pulse: bool,
    with_timesfm: bool = False,
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
        "mean": _mean_reading(rows[:t]),
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
        darts_names: list[str] = []
        if library == "lightgbm":
            darts = (parts.get("darts") or {}).get(mode)
            if darts:
                before_mids = {
                    name: float(band["mid"])
                    for name, band in moments.items()
                    if isinstance(band, dict) and "mid" in band
                }
                _apply_external(moments, darts, names=("sum", "star_sum"), star_pool=pool)
                engine = "darts"
                darts_names = [
                    name
                    for name, mid in before_mids.items()
                    if isinstance(moments.get(name), dict) and float(moments[name]["mid"]) != mid
                ]
        before_chronos = {
            name: dict(band)
            for name, band in moments.items()
            if isinstance(band, dict) and "mid" in band
        }
        timesfm_note = None
        if library == "lightgbm" and (with_chronos or with_timesfm):
            chronos = _blend_chronos(
                frame, mode, moments, parts, window, pool, with_timesfm=with_timesfm
            )
            timesfm_note = chronos.get("timesfm")
        composed, trace = compose_ranks(moments, last)
        source = rows[t] if t < len(rows) else frame.horizon[0]
        ranked = beam(composed, base, star_pool=pool, pulse=pulse_of(source) if pulse else None)
        if not ranked:
            continue
        owner = (chronos or {}).get("shape") or "lightgbm"
        star_owner = (chronos or {}).get("star_shape") or owner
        number_shape = _winner_forme(parts, mode, moments, owner, ("n1", "n2", "n3", "n4", "n5"))
        star_shape = _winner_forme(parts, mode, moments, star_owner, ("e1", "e2"))
        if number_shape is None:
            number_shape = [float(value) for value in ranked[0]["numbers"]]
        if star_shape is None:
            star_shape = [float(value) for value in ranked[0]["stars"]]
        projected_numbers, projected_stars = project_under_sums(
            number_shape,
            star_shape,
            float(moments["sum"]["mid"]),
            float(moments["star_sum"]["mid"]),
            pool,
        )
        ranked[0] = {
            **ranked[0],
            "numbers": projected_numbers,
            "stars": projected_stars,
        }
        best = ranked[0]
        packed = _pack(best["numbers"], best["stars"], moments["sum"]["mid"])
        packed["sum_model"] = round(float(moments["sum"]["mid"]), 4)
        arbitration = None if trace is None else stamp_grid(trace, best["numbers"], best["stars"])
        out["readings"][key] = {
            "mode": mode,
            "library": library,
            "engine": engine,
            "moments": composed,
            "view": _rank_view(composed, pool),
            "grid": {"numbers": best["numbers"], "stars": best["stars"], "score": best["score"]},
            "alternates": [
                {"numbers": item["numbers"], "stars": item["stars"], "score": item["score"]} for item in ranked[1:]
            ],
            "packed": packed,
            "arbitration": arbitration,
            "chronos": chronos,
            "timesfm": timesfm_note,
            "timesfm_horizon": ((parts.get("timesfm") or {}).get(mode) or {}).get("horizon"),
            "timesfm_rank_horizon": ((parts.get("timesfm") or {}).get(mode) or {}).get("rank_horizon"),
            "importance": block.get("importance") or [],
            "xray_core": core_trace(
                moments_before=before_chronos,
                chronos=chronos,
                window_t=[past_t for past_t, _past in window],
                library=library,
                engine=engine,
                darts_names=darts_names,
                composed=composed,
                ranked=ranked,
                arbitration=arbitration,
                star_pool=pool,
                scored_t=t,
                error=model_error(parts, mode, library),
            ),
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
    with_timesfm: bool = False,
) -> dict[str, Any]:
    """Un pas assemblé ne change pas tant que ses morceaux et ceux des pas qui règlent le mélange ne changent pas."""
    used = window if with_chronos or with_timesfm else []
    target = None if t >= len(frame.rows) else (tuple(frame.rows[t]["numbers"]), tuple(frame.rows[t]["stars"]))
    key = (
        step["key"],
        tuple(past["key"] for _t, past in used),
        bool(with_chronos),
        bool(with_timesfm),
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
    built = _assemble(frame, t, step, used, with_chronos, pulse, with_timesfm)
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
    with_timesfm: bool = False,
) -> dict[int, dict[str, Any]]:
    """Les pas prêts, assemblés. Les poids des sommes se règlent sur les dix pas prêts d’avant.

    Ordre : étage 1, mélange des deux sommes, étage 2, projection, puis la grille.
    `pulse` ajoute au faisceau le log π de chaque numéro choisi. Sans la famille, le terme est absent.
    """
    order = sorted(ready)
    out: dict[int, dict[str, Any]] = {}
    for index, t in enumerate(order):
        built = _memo(
            frame,
            t,
            ready[t],
            [(p, ready[p]) for p in order[max(0, index - CHRONOS_WINDOW) : index]],
            with_chronos,
            pulse,
            with_timesfm,
        )
        # L’origine est celle de cette réponse. Le mémo, lui, ne la fige pas.
        stamped = dict(built)
        stamped["origin"] = dict(ready[t].get("origin") or {})
        stamped["part_keys"] = dict(ready[t].get("part_keys") or {})
        out[t] = stamped
    return out


def calibrated_view(
    step: dict[str, Any],
    key: str,
    history: Iterable[dict[str, Any]],
    star_pool: int,
) -> tuple[dict[str, dict[str, float]], dict[str, Any]]:
    """Bandes d’une lecture, calibrées sur les pas d’avant de la même lecture."""
    selected = [past for past in history if key in past["readings"] and past.get("truth")]
    pairs = [(past["readings"][key]["view"], past["truth"]) for past in selected]
    moved, info = calibrate(step["readings"][key]["view"], pairs, star_pool)
    info["history_t"] = [int(past["t"]) for past in selected if past.get("t") is not None]
    return moved, info


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
    timesfm_requested: bool = False,
    persist: dict[str, int] | None = None,
    xray_context: dict[str, Any] | None = None,
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
            "mean": _shift_side(step["mean"], actual, None),
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
            snapped = None
            if persist:
                snapped = persist_side(frame, t, reading, persist)
                twin = _shift_side(snapped, actual, view)
                # Mêmes bandes que la lecture : la jumelle porte aussi sa couverture brute et son calibrage.
                twin["in_band_raw"] = side["in_band_raw"]
                twin["calibrated"] = side["calibrated"]
                twin["calibration_steps"] = side["calibration_steps"]
                twin["swaps"] = snapped["swaps"]
                twin["held"] = snapped["held"]
                readings[f"{key}_persist"] = twin
            if xray_context is not None:
                side["xray"] = public_xray(
                    frame,
                    step,
                    key,
                    reading,
                    calibration=info,
                    moved=view,
                    persist_snap=snapped,
                    **xray_context,
                )
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
    origin = steps.get(len(rows) - SHIFT_MAX)
    shared_horizon = None
    shared_ranks = None
    if origin:
        for reading in (origin.get("readings") or {}).values():
            if isinstance(reading.get("timesfm_horizon"), list):
                shared_horizon = reading["timesfm_horizon"]
                shared_ranks = reading.get("timesfm_rank_horizon")
                break
    if shared_horizon:
        for shift in shifts:
            pas = pas_du_decalage(int(shift["x"]))
            band = timesfm_point(shared_horizon, pas)
            ranks = timesfm_point(shared_ranks, pas) if isinstance(shared_ranks, list) else None
            shift["timesfm_pas"] = {"pas": pas, "sum": band.get("sum"), "star_sum": band.get("star_sum"), "rangs": ranks}
    timesfm_used = any(shift.get("timesfm_pas") for shift in shifts) or any(
        (reading.get("timesfm") or {}).get("available")
        for step in steps.values()
        for reading in (step.get("readings") or {}).values()
    )
    return {
        "shifts": shifts,
        "summary": _shift_summary(shifts, frame.star_pool),
        "chronos": {"requested": chronos_requested, "used": chronos_used},
        "timesfm": {"requested": timesfm_requested, "used": bool(timesfm_used)},
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
        "ecarts": {
            "sommes": {name: errors.get(name) for name in ("sum", "star_sum")},
            "rangs": {name: errors.get(name) for name in RANK_FIELDS},
        },
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
        sommes = {}
        rangs = {}
        for name in ("sum", "star_sum"):
            values = [((side.get("ecarts") or {}).get("sommes") or {}).get(name) for side in sides]
            kept_values = [value for value in values if value is not None]
            sommes[name] = None if not kept_values else round(sum(abs(value) for value in kept_values) / len(kept_values), 4)
        for name in RANK_FIELDS:
            values = [((side.get("ecarts") or {}).get("rangs") or {}).get(name) for side in sides]
            kept_values = [value for value in values if value is not None]
            rangs[name] = None if not kept_values else round(sum(abs(value) for value in kept_values) / len(kept_values), 4)
        summary[key] = {
            "mae_sum": None if not sum_errors else round(sum(abs(value) for value in sum_errors) / len(sum_errors), 4),
            "mae_sum_ci": mean_interval((abs(value) for value in sum_errors), floor=0.0),
            "etages": {"sommes": sommes, "rangs": rangs},
            "hits_numbers": None
            if not number_hits
            else round(sum(float(value) for value in number_hits) / len(number_hits), 4),
            "hits_stars": None if not star_hits else round(sum(float(value) for value in star_hits) / len(star_hits), 4),
            "hits_chance": _chance(number_hits, star_hits, star_pools),
            "versus": versus[key],
            "count": len(sum_errors),
        }
    return summary
