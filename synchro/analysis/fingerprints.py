"""Portraits numériques des tirages : z-score par variable Analyse, hors delay/hit."""

from __future__ import annotations

import math
from typing import Any, Iterable

from synchro.analysis.common import as_date, iso, numbers_of, ordered_draws, stars_of
from synchro.analysis.variables import series

FINGERPRINT_AXES = (
    "sum",
    "spread",
    "parity",
    "high_low",
    "consecutive",
    "centroid",
    "n1",
    "n2",
    "n3",
    "n4",
    "n5",
    "g1",
    "g2",
    "g3",
    "g4",
    "star_sum",
    "e1",
    "e2",
)

DEFAULT_TWIN_K = 8

_AXIS_SET = set(FINGERPRINT_AXES)


def is_fingerprint_axis(name: str | None) -> bool:
    return bool(name) and name in _AXIS_SET


def parse_axes(raw: Iterable[str] | None) -> list[str]:
    if not raw:
        return list(FINGERPRINT_AXES)
    seen: list[str] = []
    for item in raw:
        if is_fingerprint_axis(item) and item not in seen:
            seen.append(item)
    return seen or list(FINGERPRINT_AXES)


def cosine(a: list[float], b: list[float]) -> float:
    n = min(len(a), len(b))
    if n <= 0:
        return 0.0
    num = 0.0
    na = 0.0
    nb = 0.0
    for i in range(n):
        num += a[i] * b[i]
        na += a[i] * a[i]
        nb += b[i] * b[i]
    if not na or not nb:
        return 0.0
    return num / (math.sqrt(na) * math.sqrt(nb))


def _mean(values: list[float]) -> float:
    return sum(values) / len(values) if values else 0.0


def _std(values: list[float]) -> float:
    if len(values) < 2:
        return 0.0
    mu = _mean(values)
    return math.sqrt(sum((value - mu) ** 2 for value in values) / (len(values) - 1))


def z_score(value: float, mu: float, std: float) -> float:
    if not std:
        return 0.0
    return (value - mu) / std


def round_delta(axis: str, value: float) -> float:
    if axis == "centroid":
        return round(value, 4)
    nearest = round(value)
    if abs(value - nearest) < 1e-9:
        return float(int(nearest))
    return round(value, 4)


def _draw_params(draws: list[dict[str, Any]]) -> dict[str, dict[str, float]]:
    ordered = ordered_draws(draws)
    if not ordered:
        return {}
    columns = {axis: series(ordered, axis)["values"] for axis in FINGERPRINT_AXES}
    out: dict[str, dict[str, float]] = {}
    for i, draw in enumerate(ordered):
        out[iso(as_date(draw["draw_date"]))] = {axis: float(columns[axis][i]) for axis in FINGERPRINT_AXES}
    return out


def _z_vector(params: dict[str, float], norms: list[dict[str, Any]]) -> list[float]:
    return [z_score(float(params[item["axis"]]), item["mean"], item["std"]) for item in norms]


def _payload_draw(draw: dict[str, Any], params: dict[str, float]) -> dict[str, Any]:
    return {
        "date": iso(as_date(draw.get("draw_date") or draw.get("date"))),
        "numbers": numbers_of(draw),
        "stars": stars_of(draw),
        "params": params,
    }


def _with_draw_date(draw: dict[str, Any]) -> dict[str, Any]:
    if draw.get("draw_date"):
        return draw
    return {**draw, "draw_date": draw.get("date")}


def analogs_report(
    draws: list[dict[str, Any]],
    *,
    query_date: str | None = None,
    numbers: list[int] | None = None,
    stars: list[int] | None = None,
    axes: Iterable[str] | None = None,
    k: int = DEFAULT_TWIN_K,
) -> dict[str, Any]:
    """Top-k jumeaux en cosinus sur les z-scores des axes choisis."""
    chosen = parse_axes(axes)
    ordered = ordered_draws(_with_draw_date(draw) for draw in draws if draw.get("draw_date") or draw.get("date"))
    params_by_date = _draw_params(ordered)
    param_rows = [params_by_date[iso(as_date(draw["draw_date"]))] for draw in ordered]
    norms = [
        {"axis": axis, "mean": _mean([row[axis] for row in param_rows]), "std": _std([row[axis] for row in param_rows])}
        for axis in chosen
    ]

    query_draw: dict[str, Any] | None = None
    query_params: dict[str, float] | None = None
    wanted = (query_date or "")[:10] or None
    if wanted:
        for draw in ordered:
            if iso(as_date(draw["draw_date"])) == wanted:
                query_draw = draw
                query_params = params_by_date[wanted]
                break
    if query_draw is None and numbers and stars:
        query_draw = {"draw_date": wanted or "1970-01-01", "numbers": numbers, "stars": stars}
        query_params = _draw_params([query_draw]).get(iso(as_date(query_draw["draw_date"])))
    if query_draw is None and ordered:
        query_draw = ordered[-1]
        query_params = params_by_date[iso(as_date(query_draw["draw_date"]))]
    if query_draw is None or query_params is None:
        return {
            "ok": True,
            "axes": chosen,
            "k": max(0, int(k)),
            "query": None,
            "items": [],
            "draw_count": 0,
        }

    query_z = _z_vector(query_params, norms)
    query_key = iso(as_date(query_draw["draw_date"]))
    scored: list[dict[str, Any]] = []
    for draw in ordered:
        date = iso(as_date(draw["draw_date"]))
        if date == query_key:
            continue
        params = params_by_date[date]
        scored.append(
            {
                **_payload_draw(draw, params),
                "delta": {axis: round_delta(axis, params[axis] - query_params[axis]) for axis in chosen},
                "score": round(cosine(query_z, _z_vector(params, norms)), 4),
            }
        )
    scored.sort(key=lambda row: (row["score"], row["date"]), reverse=True)
    limit = max(0, int(k))
    return {
        "ok": True,
        "axes": chosen,
        "k": limit,
        "query": _payload_draw(query_draw, query_params),
        "items": scored[:limit],
        "draw_count": len(ordered),
    }
