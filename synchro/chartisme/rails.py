"""Paire de rails chartistes : contacts, classification, hauteur, médiane.

Le zigzag d'école reste un gabarit pédagogique. Ici la géométrie affichée
passe par les pivots de touche, pas par l'enveloppe des moindres carrés.
L'erreur LS ne sert qu'à scorer la confiance.
"""

from __future__ import annotations

from typing import Any, Literal, Sequence

from synchro.chartisme.catalog import (
    canonical_figure,
    is_parallel_rail_figure,
    is_rail_figure,
)

FLAT_SLOPE = 0.12

Line = tuple[float, float]
SlopeBias = Literal["up", "down", "flat"]

TEMPLATE_SLOPES: dict[str, tuple[float, float]] = {
    "wedge_rising": (0.7, 1.45),
    "wedge_falling": (-1.45, -0.7),
    "triangle_sym": (-0.68, 0.68),
    "triangle_asc": (0.0, 0.7),
    "triangle_desc": (-0.7, 0.0),
    "rectangle": (0.0, 0.0),
    "canal": (0.85, 0.85),
    "broadening_top": (1.25, -1.25),
}


def line_at(line: Line, index: float) -> float:
    return line[0] * index + line[1]


def line_through(a: dict[str, float], b: dict[str, float]) -> Line | None:
    dx = float(b["index"]) - float(a["index"])
    if abs(dx) < 1e-12:
        return None
    slope = (float(b["price"]) - float(a["price"])) / dx
    return slope, float(a["price"]) - slope * float(a["index"])


def line_through_slope(point: dict[str, float], slope: float) -> Line:
    return slope, float(point["price"]) - slope * float(point["index"])


def median_line(upper: Line, lower: Line) -> Line:
    return (upper[0] + lower[0]) / 2.0, (upper[1] + lower[1]) / 2.0


def fit_ls_line(points: Sequence[dict[str, float]]) -> Line | None:
    if len(points) < 2:
        return None
    n = len(points)
    sum_x = sum(float(p["index"]) for p in points)
    sum_y = sum(float(p["price"]) for p in points)
    sum_xy = sum(float(p["index"]) * float(p["price"]) for p in points)
    sum_xx = sum(float(p["index"]) ** 2 for p in points)
    den = n * sum_xx - sum_x * sum_x
    if abs(den) < 1e-12:
        return None
    slope = (n * sum_xy - sum_x * sum_y) / den
    return slope, (sum_y - slope * sum_x) / n


def line_fit_error(line: Line, points: Sequence[dict[str, float]]) -> float:
    if not points:
        return 0.0
    return sum(abs(float(p["price"]) - line_at(line, float(p["index"]))) for p in points) / len(
        points
    )


def fit_supporting_line(
    points: Sequence[dict[str, float]],
    side: Literal["upper", "lower"],
    eps: float,
    scale: float,
) -> Line | None:
    """Rail appuyée sur les contacts : les autres pivots restent du bon côté."""
    if len(points) < 2:
        return None
    sorted_pts = sorted(points, key=lambda p: float(p["index"]))
    tol = max(eps * scale, 1e-9)
    best: dict[str, Any] | None = None
    for i in range(len(sorted_pts)):
        for j in range(i + 1, len(sorted_pts)):
            line = line_through(sorted_pts[i], sorted_pts[j])
            if line is None:
                continue
            ok = True
            touches = 0
            for point in sorted_pts:
                residual = float(point["price"]) - line_at(line, float(point["index"]))
                if side == "upper" and residual > tol:
                    ok = False
                    break
                if side == "lower" and residual < -tol:
                    ok = False
                    break
                if abs(residual) <= tol:
                    touches += 1
            if not ok:
                continue
            span = float(sorted_pts[j]["index"]) - float(sorted_pts[i]["index"])
            if (
                best is None
                or touches > best["touches"]
                or (touches == best["touches"] and span > best["span"])
            ):
                best = {"line": line, "touches": touches, "span": span}
    if best:
        return best["line"]
    return line_through(sorted_pts[0], sorted_pts[-1])


def _order_rails(left: Line, right: Line, at: float) -> tuple[Line, Line]:
    return (left, right) if line_at(left, at) >= line_at(right, at) else (right, left)


def classify_bounds(upper: Line, lower: Line, first: int, last: int) -> tuple[str, str] | None:
    """Bornes ajustées → (figure, sens attendu de la cassure)."""
    width = last - first
    if width <= 0:
        return None
    h0 = line_at(upper, first) - line_at(lower, first)
    h1 = line_at(upper, last) - line_at(lower, last)
    if h0 <= 0:
        return None
    flat = FLAT_SLOPE * h0 / width
    up, low = upper[0], lower[0]
    up_flat, low_flat = abs(up) <= flat, abs(low) <= flat
    ratio = h1 / h0
    if ratio < 0.75:
        if up > flat and low > flat:
            return "wedge_rising", "down"
        if up < -flat and low < -flat:
            return "wedge_falling", "up"
        if up_flat and low > flat:
            return "triangle_asc", "up"
        if low_flat and up < -flat:
            return "triangle_desc", "down"
        if up < -flat and low > flat:
            return "triangle_sym", "any"
        return None
    if ratio > 1.3:
        if up > flat and low < -flat:
            return "broadening_top", "down"
        return None
    if up_flat and low_flat:
        return "rectangle", "any"
    parallel = abs(up - low) <= max(2 * flat, 0.3 * (abs(up) + abs(low)) / 2)
    if parallel:
        return "canal", "any"
    return None


def slope_bias_of(upper: Line, lower: Line, first: int, last: int) -> SlopeBias:
    width = max(1, last - first)
    height = abs(line_at(upper, first) - line_at(lower, first))
    slope = (upper[0] + lower[0]) / 2.0
    flat = FLAT_SLOPE * max(height, 1e-9) / width
    if abs(slope) <= flat:
        return "flat"
    return "up" if slope > 0 else "down"


def _as_pair(
    upper: Line,
    lower: Line,
    highs: Sequence[dict[str, float]],
    lows: Sequence[dict[str, float]],
    ls_error: float,
) -> dict[str, Any] | None:
    idx = [int(p["index"]) for p in list(highs) + list(lows)]
    if not idx:
        return None
    first, last = min(idx), max(idx)
    used_upper, used_lower = _order_rails(upper, lower, float(first))
    verdict = classify_bounds(used_upper, used_lower, first, last)
    if verdict and verdict[0] == "rectangle":
        top = max(float(p["price"]) for p in highs)
        bottom = min(float(p["price"]) for p in lows)
        if top <= bottom:
            return None
        used_upper, used_lower = (0.0, top), (0.0, bottom)
        verdict = ("rectangle", "any")
    height = line_at(used_upper, first) - line_at(used_lower, first)
    if height <= 0:
        return None
    return {
        "upper": used_upper,
        "lower": used_lower,
        "median": median_line(used_upper, used_lower),
        "first": first,
        "last": last,
        "height": height,
        "slope_bias": slope_bias_of(used_upper, used_lower, first, last),
        "ls_error": ls_error,
        "figure": None if verdict is None else verdict[0],
        "expected": None if verdict is None else verdict[1],
    }


def fit_rail_pair(
    highs: Sequence[dict[str, float]],
    lows: Sequence[dict[str, float]],
    *,
    eps: float,
    scale: float,
) -> dict[str, Any] | None:
    """Ajuste une paire de rails sur des touches H/L.

    Géométrie : contacts. Si elles ne classent rien, repli sur les moindres
    carrés. Le score reste l'erreur LS dans les deux cas.
    """
    if len(highs) < 2 or len(lows) < 2:
        return None
    ls_upper = fit_ls_line(highs)
    ls_lower = fit_ls_line(lows)
    ls_error = (
        (line_fit_error(ls_upper, highs) + line_fit_error(ls_lower, lows)) / scale
        if ls_upper and ls_lower
        else 1.0
    )
    contact_upper = fit_supporting_line(highs, "upper", eps, scale)
    contact_lower = fit_supporting_line(lows, "lower", eps, scale)
    if contact_upper and contact_lower:
        contact = _as_pair(contact_upper, contact_lower, highs, lows, ls_error)
        if contact and contact["figure"]:
            return contact
    if ls_upper and ls_lower:
        fitted = _as_pair(ls_upper, ls_lower, highs, lows, ls_error)
        if fitted and fitted["figure"]:
            return fitted
    return None


def _template_slope(figure: str, which: Literal["up", "low"], height: float, width: float) -> float:
    spec = TEMPLATE_SLOPES.get(canonical_figure(figure))
    raw = 0.0 if spec is None else spec[0 if which == "up" else 1]
    return (raw * height) / max(1.0, width)


def second_rail_slope(
    figure: str,
    first: Line,
    first_is_upper: bool,
    width: float,
    height: float,
) -> float:
    ident = canonical_figure(figure)
    if ident == "rectangle":
        return 0.0
    if ident == "canal":
        return first[0]
    if ident == "triangle_sym":
        return -first[0]
    rise = max(abs(first[0]), (0.7 * height) / max(1.0, width))
    if ident == "triangle_asc":
        return rise if first_is_upper else 0.0
    if ident == "triangle_desc":
        return 0.0 if first_is_upper else -rise
    spec = TEMPLATE_SLOPES.get(ident)
    if spec is None:
        return first[0]
    other = spec[1] if first_is_upper else spec[0]
    self = spec[0] if first_is_upper else spec[1]
    if abs(self) > 1e-9:
        return first[0] * (other / self)
    return _template_slope(ident, "low" if first_is_upper else "up", height, width)


def _first_rail_line(figure: str, a: dict[str, float], b: dict[str, float]) -> Line | None:
    if canonical_figure(figure) == "rectangle":
        return 0.0, float(a["actual"])
    return line_through(
        {"index": float(a["index"]), "price": float(a["actual"])},
        {"index": float(b["index"]), "price": float(b["actual"])},
    )


def _opposite_extreme(
    first: Line,
    values: Sequence[float],
    first_index: int,
    last_index: int,
) -> dict[str, float] | None:
    best_index = first_index
    best_abs = -1.0
    for index in range(first_index, last_index + 1):
        if index < 0 or index >= len(values):
            continue
        value = float(values[index])
        residual = abs(value - line_at(first, float(index)))
        if residual >= best_abs:
            best_abs = residual
            best_index = index
    if best_abs < 0:
        return None
    return {"index": float(best_index), "actual": float(values[best_index])}


def sample_rails(
    upper: Line,
    lower: Line,
    dates: Sequence[str],
    first: int,
    last: int,
) -> dict[str, list[dict[str, Any]]]:
    i0, i1 = min(first, last), max(first, last)
    midline = median_line(upper, lower)
    upper_pts: list[dict[str, Any]] = []
    lower_pts: list[dict[str, Any]] = []
    median_pts: list[dict[str, Any]] = []
    mid: list[dict[str, Any]] = []
    for index in range(i0, i1 + 1):
        date = dates[index] if index < len(dates) else ""
        hi = line_at(upper, index)
        lo = line_at(lower, index)
        upper_pts.append({"index": index, "date": date, "actual": hi})
        lower_pts.append({"index": index, "date": date, "actual": lo})
        median_pts.append({"index": index, "date": date, "actual": line_at(midline, index)})
        mid.append({"index": index, "date": date, "actual": (hi + lo) / 2.0})
    return {"upper": upper_pts, "lower": lower_pts, "median": median_pts, "mid": mid}


def construct_rails(
    *,
    figure: str,
    dates: Sequence[str],
    a: dict[str, float],
    b: dict[str, float],
    c: dict[str, float] | None = None,
    values: Sequence[float] | None = None,
) -> dict[str, Any] | None:
    """Construction à la main : une borne (A–B), puis l'autre par C."""
    if not is_rail_figure(figure):
        return None
    first_line = _first_rail_line(figure, a, b)
    if first_line is None:
        return None
    span = [int(a["index"]), int(b["index"])] + ([int(c["index"])] if c else [])
    first, last = min(span), max(span)
    if last <= first:
        return None
    seed_height = max(
        abs(float(a["actual"]) - float(b["actual"])),
        abs(float(a["actual"]) - float(c["actual"])) if c else 0.0,
        1.0,
    )
    third = c
    if third is None and values is not None:
        third = _opposite_extreme(first_line, values, first, last)
    if third is None:
        fallback = line_through_slope(
            {"index": float(a["index"]), "price": float(a["actual"]) - seed_height},
            first_line[0],
        )
        third = {"index": float(last), "actual": line_at(fallback, last)}
    first_is_upper = line_at(first_line, float(third["index"])) >= float(third["actual"])
    width = last - first
    if is_parallel_rail_figure(figure) or canonical_figure(figure) == "canal":
        slope = 0.0 if canonical_figure(figure) == "rectangle" else first_line[0]
        second = line_through_slope(
            {"index": float(third["index"]), "price": float(third["actual"])},
            slope,
        )
    else:
        slope = second_rail_slope(figure, first_line, first_is_upper, float(width), seed_height)
        second = line_through_slope(
            {"index": float(third["index"]), "price": float(third["actual"])},
            slope,
        )
    upper, lower = _order_rails(first_line, second, float(first))
    height = line_at(upper, first) - line_at(lower, first)
    if height <= 0:
        return None
    return {
        "upper": upper,
        "lower": lower,
        "median": median_line(upper, lower),
        "first": first,
        "last": last,
        "height": height,
        "slope_bias": slope_bias_of(upper, lower, first, last),
        "samples": sample_rails(upper, lower, dates, first, last),
    }


def project_rail_target(
    values: Sequence[float],
    upper: Line,
    lower: Line,
    last: int,
    expected: str = "any",
) -> dict[str, Any] | None:
    height = line_at(upper, last) - line_at(lower, last)
    if height <= 0 or not values:
        return None
    for index in range(last + 1, len(values)):
        value = float(values[index])
        if value > line_at(upper, index) and expected != "down":
            return {"value": value + height, "direction": "up", "index": index}
        if value < line_at(lower, index) and expected != "up":
            return {"value": value - height, "direction": "down", "index": index}
    origin = float(values[min(len(values) - 1, max(last, 0))])
    direction = "down" if expected == "down" else "up"
    return {
        "value": origin - height if direction == "down" else origin + height,
        "direction": direction,
        "index": min(len(values) - 1, max(last, 0)),
    }
