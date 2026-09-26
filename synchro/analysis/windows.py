from __future__ import annotations

import math
from datetime import date
from typing import Any

from synchro.analysis.common import as_date, numbers_of, ordered_draws
from synchro.analysis.variables import series as extract_series
from synchro.short_cycle import SHORT_CYCLE_MAX, local_range


def _mean(values: list[float]) -> float:
    return sum(values) / len(values) if values else 0.0


def _std(values: list[float]) -> float:
    if len(values) < 2:
        return 0.0
    m = _mean(values)
    var = sum((x - m) ** 2 for x in values) / (len(values) - 1)
    return math.sqrt(var)


def _slope(values: list[float]) -> float:
    n = len(values)
    if n < 2:
        return 0.0
    xs = list(range(n))
    xbar = _mean([float(x) for x in xs])
    ybar = _mean(values)
    den = sum((x - xbar) ** 2 for x in xs)
    if den == 0:
        return 0.0
    num = sum((x - xbar) * (y - ybar) for x, y in zip(xs, values))
    return num / den


def _rsi_like(values: list[float]) -> float | None:
    if len(values) < 2:
        return None
    ups = 0
    downs = 0
    for a, b in zip(values, values[1:]):
        if b > a:
            ups += 1
        elif b < a:
            downs += 1
    total = ups + downs
    if total == 0:
        return 50.0
    return round(100.0 * ups / total, 2)


def coverage(draws: list[dict[str, Any]]) -> int:
    seen: set[int] = set()
    for draw in draws:
        seen.update(numbers_of(draw))
    return len(seen)


def rolling_stats(
    draws: list[dict[str, Any]],
    name: str = "sum",
    window: int = 20,
    n: int | None = None,
) -> dict[str, Any]:
    """Indicateurs sur une fenêtre glissante de X tirages, à la fin de la série."""
    window = max(1, int(window))
    payload = extract_series(draws, name, n=n)
    values = payload["values"]
    chunk = values[-window:]
    last = chunk[-1] if chunk else None
    mu = _mean(chunk)
    sigma = _std(chunk)
    z = None
    if last is not None and sigma > 0:
        z = round((last - mu) / sigma, 4)
    ordered = ordered_draws(draws)[-window:]
    return {
        "name": name,
        "n": n,
        "window": window,
        "sample_size": len(chunk),
        "mean": round(mu, 4) if chunk else None,
        "std": round(sigma, 4) if chunk else None,
        "min": min(chunk) if chunk else None,
        "max": max(chunk) if chunk else None,
        "last": last,
        "zscore": z,
        "slope": round(_slope(chunk), 6) if chunk else None,
        "rsi_like": _rsi_like(chunk),
        "coverage": coverage(ordered),
        "short": _short_band(values),
        "from_date": payload["from_date"],
        "to_date": payload["to_date"],
        "draw_count": payload["draw_count"],
    }


def _short_band(values: list[float], span: int = SHORT_CYCLE_MAX) -> dict[str, Any]:
    """Bande de 8 tirages : étendue, min, max, dernier. Pas de z-score."""
    if not values:
        return {"span": span, "sample_size": 0, "min": None, "max": None, "last": None, "range": None}
    chunk = values[-span:]
    return {
        "span": span,
        "sample_size": len(chunk),
        "min": min(chunk),
        "max": max(chunk),
        "last": chunk[-1],
        "range": local_range(values, len(values) - 1, span),
    }


def _week_key(dt: date) -> str:
    iso_year, iso_week, _ = dt.isocalendar()
    return f"{iso_year}-W{iso_week:02d}"


def ohlc_blocks(
    draws: list[dict[str, Any]],
    name: str = "sum",
    block: str = "month",
    window: int = 10,
    n: int | None = None,
) -> dict[str, Any]:
    """Chandeliers OHLC d’une variable (mois, semaine ISO, ou paquets de `window` tirages)."""
    if block not in {"month", "week", "window", "short"}:
        raise ValueError("block doit être month, week, window ou short.")
    payload = extract_series(draws, name, n=n)
    points = payload["points"]
    groups: list[tuple[str, list[dict[str, Any]]]] = []
    packet = SHORT_CYCLE_MAX if block == "short" else max(1, int(window))
    if block in {"window", "short"}:
        size = packet
        for i in range(0, len(points), size):
            chunk = points[i : i + size]
            groups.append((chunk[0]["date"], chunk))
    else:
        buckets: dict[str, list[dict[str, Any]]] = {}
        order: list[str] = []
        for point in points:
            dt = as_date(point["date"])
            key = dt.strftime("%Y-%m") if block == "month" else _week_key(dt)
            if key not in buckets:
                buckets[key] = []
                order.append(key)
            buckets[key].append(point)
        groups = [(key, buckets[key]) for key in order]

    candles = []
    for key, chunk in groups:
        values = [p["value"] for p in chunk]
        candles.append(
            {
                "key": key,
                "from": chunk[0]["date"],
                "to": chunk[-1]["date"],
                "count": len(chunk),
                "o": values[0],
                "h": max(values),
                "l": min(values),
                "c": values[-1],
            }
        )
    return {
        "name": name,
        "n": n,
        "block": block,
        "window": packet if block in {"window", "short"} else None,
        "draw_count": payload["draw_count"],
        "from_date": payload["from_date"],
        "to_date": payload["to_date"],
        "candles": candles,
    }


def heikin_ashi(candles: list[dict[str, Any]]) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    prev_o: float | None = None
    prev_c: float | None = None
    for candle in candles:
        o, h, l, c = candle["o"], candle["h"], candle["l"], candle["c"]
        ha_c = (o + h + l + c) / 4
        ha_o = (o + c) / 2 if prev_o is None else (prev_o + prev_c) / 2
        ha_h = max(h, ha_o, ha_c)
        ha_l = min(l, ha_o, ha_c)
        row = dict(candle)
        row.update({"o": ha_o, "h": ha_h, "l": ha_l, "c": ha_c, "style": "heikin_ashi"})
        out.append(row)
        prev_o, prev_c = ha_o, ha_c
    return out
