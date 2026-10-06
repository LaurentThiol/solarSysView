"""Walk-forward sur le focus : trois ans (poids ×3) et fenêtre seule."""

from __future__ import annotations

import math
from typing import Any, Iterable

from synchro.nextdata.empirical import recount
from synchro.nextdata.forecast import predict_moments
from synchro.nextdata.panel import Frame
from synchro.nextdata.project import beam

FIELDS = ("sum", "n1", "n2", "n3", "n4", "n5", "star_sum", "e1", "e2")
MODES = ("corpus", "fenetre")


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
        for mode in MODES:
            try:
                moments, _importance, _engine = predict_moments(
                    prefix,
                    horizon,
                    mode=mode,
                    focus=frame.focus,
                    families=families,
                    estimators=estimators,
                    quantiles=(0.5,),
                )
            except ValueError:
                failed = True
                break
            window = prefix[-frame.focus :]
            base = recount(window, star_pool=frame.star_pool)
            ranked = beam(moments, base, star_pool=frame.star_pool, radius=2)
            if not ranked:
                failed = True
                break
            packed = _pack(ranked[0]["numbers"], ranked[0]["stars"], moments["sum"]["mid"])
            packed["sum_model"] = round(float(moments["sum"]["mid"]), 4)
            step[mode] = packed
        if failed or any(mode not in step for mode in MODES):
            continue
        steps.append(step)

    metrics = {mode: _metrics(steps, mode) for mode in MODES}
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
        for name in ("n1", "n2", "n3", "n4", "n5", "star_sum", "e1", "e2"):
            value = block.get(name)
            kept[name] = None if value is None else round(float(value), 4)
        return kept

    return {
        "date": step["date"],
        "actual": side(step["actual"]),
        "corpus": side(step["corpus"]),
        "fenetre": side(step["fenetre"]),
        "persistence": side(step["persistence"]),
        "mean": {"sum": round(float(step["mean"]["sum"]), 4)},
    }
