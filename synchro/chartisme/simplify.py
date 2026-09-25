"""Réduction du tracé qui garde l'esprit du mouvement.

Trois coupes, trois usages :

- Visvalingam–Whyatt ordonne les points par aire effective. Couper cet ordre à
  une tolérance `τ` donne une épine ; couper plus haut en donne une plus
  grossière. `τ` est une fraction de l'aire de la fenêtre (amplitude × durée).
- La tolérance peut varier le long du tracé, comme une quantification qui
  suit le contraste : l'aire exigée vaut `τ × (étendue locale / étendue)²`.
  Une consolidation serrée conserve ses appuis, une jambe monotone n'en garde
  que les bouts.
- Ramer–Douglas–Peucker, en distance perpendiculaire, sert les polylignes.
  LTTB ne sert que l'affichage à budget fixe : il préserve les pics visuels,
  pas l'alternance sommet/creux.

Chaque indice renvoyé est un indice d'origine. La cassure et l'objectif se
mesurent sur la série brute.
"""

from __future__ import annotations

import math
from typing import Any, Sequence

DEFAULT_TAUS: tuple[float, ...] = (0.015, 0.04, 0.09)
DEFAULT_TAU = 0.04

# Pente d'une jambe, en fraction de la hauteur de la fenêtre.
FLAT_GRADE = 0.12
STEEP_GRADE = 0.35


def _span(values: Sequence[float]) -> float:
    if not values:
        return 0.0
    return float(max(values) - min(values))


def window_area(values: Sequence[float]) -> float:
    """Aire de la fenêtre : amplitude × durée, en indices d'origine."""
    count = len(values)
    if count < 2:
        return 0.0
    return _span(values) * float(count - 1)


def local_radius(count: int) -> int:
    """Demi-fenêtre de l'étendue locale. Entière, pour que les deux jumeaux coïncident."""
    if count < 2:
        return 0
    return max(2, (count - 1) // 8)


def local_extent(values: Sequence[float], index: int, radius: int | None = None) -> float:
    count = len(values)
    if count == 0:
        return 0.0
    rad = local_radius(count) if radius is None else radius
    lo = max(0, index - rad)
    hi = min(count, index + rad + 1)
    chunk = values[lo:hi]
    return float(max(chunk) - min(chunk))


def _triangle_area(
    ax: float, ay: float, bx: float, by: float, cx: float, cy: float
) -> float:
    return abs((ax - bx) * (cy - by) - (cx - bx) * (ay - by)) * 0.5


def visvalingam_areas(values: Sequence[float]) -> list[float]:
    """Aire effective de chaque point, dans l'ordre d'élimination de Visvalingam.

    Les extrémités ne partent pas : leur aire est infinie. L'aire d'un point
    retiré est relevée chez ses voisins lorsqu'ils paraîtraient moins
    importants que lui — la pyramide reste monotone.
    """
    ys = [float(v) for v in values]
    count = len(ys)
    if count == 0:
        return []
    areas = [math.inf] * count
    if count < 3:
        return areas
    prev = [-1, *range(count - 1)]
    nxt = [*range(1, count), -1]

    def tri(index: int) -> float:
        left, right = prev[index], nxt[index]
        if left < 0 or right < 0:
            return math.inf
        return _triangle_area(float(left), ys[left], float(index), ys[index], float(right), ys[right])

    for index in range(1, count - 1):
        areas[index] = tri(index)

    alive = count
    while alive > 2:
        best = -1
        best_area = math.inf
        for index in range(1, count - 1):
            if prev[index] < 0 or nxt[index] < 0:
                continue
            area = areas[index]
            # Égalité d'aire : le plus petit indice part le premier.
            if area < best_area or (area == best_area and index < best):
                best = index
                best_area = area
        if best < 0:
            break
        removed = areas[best]
        left, right = prev[best], nxt[best]
        nxt[left] = right
        prev[right] = left
        prev[best] = -1
        nxt[best] = -1
        alive -= 1
        for neighbor in (left, right):
            if neighbor <= 0 or neighbor >= count - 1:
                continue
            if prev[neighbor] < 0 or nxt[neighbor] < 0:
                continue
            recomputed = tri(neighbor)
            if recomputed < removed:
                recomputed = removed
            areas[neighbor] = recomputed
    areas[0] = math.inf
    areas[-1] = math.inf
    return areas


def _required_area(
    values: Sequence[float],
    index: int,
    tau: float,
    *,
    variable: bool,
    area: float,
    span: float,
) -> float:
    if not variable or span <= 0:
        return tau * area
    local = local_extent(values, index)
    ratio = local / span
    return tau * area * ratio * ratio


def cut_indices(
    values: Sequence[float],
    areas: Sequence[float] | None = None,
    tau: float = DEFAULT_TAU,
    *,
    variable: bool = True,
) -> list[int]:
    """Indices survivant à la coupe `τ`. Les bouts restent."""
    ys = [float(v) for v in values]
    count = len(ys)
    if count == 0:
        return []
    if count <= 2:
        return list(range(count))
    span = _span(ys)
    if span <= 0:
        return [0, count - 1]
    computed = list(areas) if areas is not None else visvalingam_areas(ys)
    total = window_area(ys)
    kept: list[int] = []
    for index, importance in enumerate(computed):
        if index == 0 or index == count - 1 or importance == math.inf:
            kept.append(index)
            continue
        if importance + 0.0 >= _required_area(
            ys, index, tau, variable=variable, area=total, span=span
        ):
            kept.append(index)
    return kept


def saliency_of(values: Sequence[float], areas: Sequence[float] | None = None) -> list[float]:
    """Aire effective rapportée à l'aire de la fenêtre. Les bouts valent 1."""
    ys = [float(v) for v in values]
    count = len(ys)
    if count == 0:
        return []
    computed = list(areas) if areas is not None else visvalingam_areas(ys)
    total = window_area(ys)
    out: list[float] = []
    for importance in computed:
        if total <= 0 or importance == math.inf:
            out.append(1.0)
        else:
            out.append(float(importance) / total)
    return out


def _alternate(
    values: Sequence[float], indices: Sequence[int]
) -> list[tuple[int, str]]:
    """Pivots H/L alternés le long de l'épine. Un plat consécutif garde l'extrême."""
    ys = [float(v) for v in values]
    chosen = [int(i) for i in indices]
    labeled: list[tuple[int, str]] = []
    last = len(chosen) - 1
    for pos, index in enumerate(chosen):
        y = ys[index]
        if pos == 0:
            kind = "H" if last < 0 or y >= ys[chosen[1]] else "L"
        elif pos == last:
            kind = "H" if y >= ys[chosen[pos - 1]] else "L"
        else:
            left = ys[chosen[pos - 1]]
            right = ys[chosen[pos + 1]]
            if y >= left and y >= right and (y > left or y > right):
                kind = "H"
            elif y <= left and y <= right and (y < left or y < right):
                kind = "L"
            else:
                continue
        if labeled and labeled[-1][1] == kind:
            prev, prev_kind = labeled[-1]
            if prev_kind == "H" and y >= ys[prev]:
                labeled[-1] = (index, kind)
            elif prev_kind == "L" and y <= ys[prev]:
                labeled[-1] = (index, kind)
            continue
        labeled.append((index, kind))
    return labeled


def spine_pivots(
    values: Sequence[float],
    indices: Sequence[int],
    *,
    saliency: Sequence[float] | None = None,
    dates: Sequence[str | None] | None = None,
) -> list[dict[str, Any]]:
    """Épine → pivots alternés, saillance = aire qui a fait survivre le point."""
    ys = [float(v) for v in values]
    weights = list(saliency) if saliency is not None else saliency_of(ys)
    labels = list(dates) if dates is not None else [None] * len(ys)
    if len(labels) != len(ys):
        labels = [None] * len(ys)
    pivots: list[dict[str, Any]] = []
    for index, kind in _alternate(ys, indices):
        pivots.append(
            {
                "index": index,
                "date": labels[index],
                "price": ys[index],
                "type": kind,
                "saliency": float(weights[index]) if index < len(weights) else 0.0,
            }
        )
    return pivots


def simplify(
    values: Sequence[float],
    tau: float = DEFAULT_TAU,
    *,
    variable: bool = True,
    dates: Sequence[str | None] | None = None,
) -> dict[str, Any]:
    """Une coupe : indices gardés, aires, pivots alternés."""
    ys = [float(v) for v in values]
    areas = visvalingam_areas(ys)
    indices = cut_indices(ys, areas, tau, variable=variable)
    weights = saliency_of(ys, areas)
    return {
        "tau": float(tau),
        "variable": bool(variable),
        "indices": indices,
        "areas": weights,
        "pivots": spine_pivots(ys, indices, saliency=weights, dates=dates),
    }


def pyramid(
    values: Sequence[float],
    taus: Sequence[float] = DEFAULT_TAUS,
    *,
    variable: bool = True,
    dates: Sequence[str | None] | None = None,
) -> list[dict[str, Any]]:
    """La même élimination, coupée à chaque tolérance."""
    ys = [float(v) for v in values]
    areas = visvalingam_areas(ys)
    weights = saliency_of(ys, areas)
    levels: list[dict[str, Any]] = []
    for tau in taus:
        indices = cut_indices(ys, areas, float(tau), variable=variable)
        levels.append(
            {
                "tau": float(tau),
                "variable": bool(variable),
                "indices": indices,
                "areas": weights,
                "pivots": spine_pivots(ys, indices, saliency=weights, dates=dates),
            }
        )
    return levels


def _perp_distance(
    index: int, y: float, left: int, y_left: float, right: int, y_right: float
) -> float:
    dx = float(right - left)
    dy = y_right - y_left
    denom = math.hypot(dx, dy)
    if denom == 0.0:
        return abs(y - y_left)
    return abs(dy * float(index) - dx * y + float(right) * y_left - y_right * float(left)) / denom


def rdp_indices(values: Sequence[float], tau: float = DEFAULT_TAU) -> list[int]:
    """Ramer–Douglas–Peucker. `τ` est une fraction de l'amplitude."""
    ys = [float(v) for v in values]
    count = len(ys)
    if count == 0:
        return []
    if count <= 2:
        return list(range(count))
    span = _span(ys)
    if span <= 0:
        return [0, count - 1]
    epsilon = float(tau) * span
    keep = [False] * count
    keep[0] = True
    keep[-1] = True

    def recurse(left: int, right: int) -> None:
        if right <= left + 1:
            return
        best = -1
        best_dist = -1.0
        for index in range(left + 1, right):
            dist = _perp_distance(index, ys[index], left, ys[left], right, ys[right])
            if dist > best_dist:
                best_dist = dist
                best = index
        if best >= 0 and best_dist > epsilon:
            recurse(left, best)
            keep[best] = True
            recurse(best, right)

    recurse(0, count - 1)
    return [index for index, flagged in enumerate(keep) if flagged]


def lttb_indices(values: Sequence[float], k: int = 15) -> list[int]:
    """Largest-Triangle-Three-Buckets, pour un affichage à budget fixe.

    Le seau choisit le point qui forme le plus grand triangle avec le point
    déjà retenu et la moyenne du seau suivant. Ce n'est pas une épine de
    reconnaissance : l'alternance sommet/creux n'y est pas garantie.
    """
    ys = [float(v) for v in values]
    count = len(ys)
    if count == 0 or k <= 0:
        return []
    if k >= count or count < 3 or k < 3:
        if k >= count:
            return list(range(count))
        return [0, count - 1][: max(k, 1)] if count > 1 else [0]
    sampled = [0]
    every = (count - 2) / (k - 2)
    anchor = 0
    for bucket in range(k - 2):
        avg_start = math.floor((bucket + 1) * every) + 1
        avg_end = math.floor((bucket + 2) * every) + 1
        if avg_end > count:
            avg_end = count
        if avg_start >= avg_end:
            avg_start = max(0, avg_end - 1)
        length = avg_end - avg_start
        if length <= 0:
            break
        avg_x = 0.0
        avg_y = 0.0
        for index in range(avg_start, avg_end):
            avg_x += float(index)
            avg_y += ys[index]
        avg_x /= float(length)
        avg_y /= float(length)
        range_start = math.floor(bucket * every) + 1
        range_end = math.floor((bucket + 1) * every) + 1
        if range_end > count - 1:
            range_end = count - 1
        if range_start >= range_end:
            range_start = max(1, range_end - 1)
        max_area = -1.0
        chosen = range_start
        ax = float(anchor)
        ay = ys[anchor]
        for index in range(range_start, range_end):
            area = abs((ax - avg_x) * (ys[index] - ay) - (ax - float(index)) * (avg_y - ay))
            if area > max_area:
                max_area = area
                chosen = index
        if sampled[-1] != chosen:
            sampled.append(chosen)
        anchor = chosen
    if sampled[-1] != count - 1:
        sampled.append(count - 1)
    return sampled
