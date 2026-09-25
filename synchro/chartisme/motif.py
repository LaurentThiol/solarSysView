"""Épine simplifiée → graphe de motif → figures du catalogue.

Les nœuds sont les pivots de l'épine. Trois familles d'arêtes :

- `segment` : la jambe entre deux pivots consécutifs, avec son symbole
  (sens, pente, tertile d'étendue) ;
- `hvg` : visibilité horizontale. Deux sommets d'un double top se voient ;
  la tête d'une ETE bloque la vue entre les épaules ;
- `nvg` : visibilité naturelle, à `τ` près. Côté +1, rien ne dépasse le
  segment (résistance) ; côté −1, rien ne passe en dessous (support).

Une figure n'est retenue que si le même motif, aux mêmes rôles, revient sur
au moins deux tolérances de la pyramide. Le détecteur géométrique n'est pas
remplacé : quand les deux lectures s'accordent, les deux confiances montent.
"""

from __future__ import annotations

from typing import Any, Sequence

from synchro.analysis.tech import activity_confirms
from synchro.chartisme.rails import classify_bounds, line_at, median_line, slope_bias_of
from synchro.chartisme.simplify import (
    DEFAULT_TAU,
    DEFAULT_TAUS,
    FLAT_GRADE,
    STEEP_GRADE,
    pyramid as build_pyramid,
)

ACTIVITY_PERIOD = 20
HOLD_BARS = 2
INDEX_TOL = 3
LEVEL_FLOOR = 0.06
MIN_PULLBACK = 0.18
MIN_PROMINENCE = 0.12
AGREEMENT = 1.12

def _span(values: Sequence[float]) -> float:
    if not values:
        return 0.0
    return float(max(values) - min(values))


def horizontal_visibility(prices: Sequence[float]) -> list[tuple[int, int]]:
    """Arêtes de visibilité horizontale, par pile. Indices dans `prices`.

    `i` voit `j` quand chaque valeur intermédiaire est strictement sous le
    plus bas des deux. Les points consécutifs se voient toujours.
    """
    ys = [float(v) for v in prices]
    edges: list[tuple[int, int]] = []
    stack: list[int] = []
    for index, price in enumerate(ys):
        while stack and ys[stack[-1]] <= price:
            edges.append((stack.pop(), index))
        if stack:
            edges.append((stack[-1], index))
        stack.append(index)
    return edges


def _line_value(i0: int, y0: float, i1: int, y1: float, index: int) -> float:
    if i1 == i0:
        return y0
    return y0 + (y1 - y0) * ((index - i0) / (i1 - i0))


def natural_visibility(
    indices: Sequence[int],
    prices: Sequence[float],
    tolerance: float,
) -> list[tuple[int, int, int]]:
    """Arêtes de visibilité naturelle entre les nœuds de l'épine.

    Le côté +1 exige qu'aucun nœud intermédiaire ne dépasse le segment de
    plus de `tolerance` ; le côté −1, qu'aucun ne passe en dessous. Une
    paire sans nœud intermédiaire reste un simple `segment`.
    """
    idx = [int(i) for i in indices]
    ys = [float(v) for v in prices]
    count = len(idx)
    edges: list[tuple[int, int, int]] = []
    tol = abs(float(tolerance))
    for left in range(count):
        for right in range(left + 2, count):
            for side in (1, -1):
                clear = True
                for mid in range(left + 1, right):
                    line = _line_value(idx[left], ys[left], idx[right], ys[right], idx[mid])
                    if side > 0 and ys[mid] > line + tol:
                        clear = False
                        break
                    if side < 0 and ys[mid] < line - tol:
                        clear = False
                        break
                if clear:
                    edges.append((left, right, side))
    return edges


def _grade(dy: float, dx: int, span: float, length: int) -> float:
    """Hausse de la jambe, rapportée à la hauteur de la fenêtre.

    Une oscillation courte dans une consolidation reste plate : ce qui compte
    est l'étendue franchie, pas le fait que deux barres voisines soient raides.
    """
    del dx, length
    if span <= 0:
        return 0.0
    return abs(dy) / span


def _slope_name(grade: float) -> str:
    if grade < FLAT_GRADE:
        return "flat"
    if grade < STEEP_GRADE:
        return "moderate"
    return "steep"


def _tertiles(amplitudes: Sequence[float]) -> list[int]:
    count = len(amplitudes)
    if count == 0:
        return []
    order = sorted(range(count), key=lambda i: (amplitudes[i], i))
    out = [0] * count
    for rank, index in enumerate(order):
        out[index] = min(2, (rank * 3) // count)
    return out


def leg_word(
    pivots: Sequence[dict[str, Any]],
    *,
    span: float,
    length: int,
) -> list[dict[str, Any]]:
    """Une jambe = sens, classe de pente, tertile d'étendue."""
    rows: list[dict[str, Any]] = []
    amplitudes: list[float] = []
    for pos in range(len(pivots) - 1):
        start = pivots[pos]
        end = pivots[pos + 1]
        dy = float(end["price"]) - float(start["price"])
        dx = int(end["index"]) - int(start["index"])
        amplitudes.append(abs(dy))
        if dy > 0:
            direction = "up"
        elif dy < 0:
            direction = "down"
        else:
            direction = "flat"
        rows.append(
            {
                "start": int(start["index"]),
                "end": int(end["index"]),
                "direction": direction,
                "slope": _slope_name(_grade(dy, dx, span, length)),
                "dy": dy,
            }
        )
    thirds = _tertiles(amplitudes)
    for row, third in zip(rows, thirds):
        row["tertile"] = third
        row["symbol"] = f"{row['direction']}:{row['slope']}:{third}"
    return rows


def transition_counts(legs: Sequence[dict[str, Any]]) -> dict[str, int]:
    counts: dict[str, int] = {}
    for pos in range(len(legs) - 1):
        key = f"{legs[pos]['symbol']}|{legs[pos + 1]['symbol']}"
        counts[key] = counts.get(key, 0) + 1
    return counts


def build_network(
    values: Sequence[float],
    *,
    tau: float = DEFAULT_TAU,
    variable: bool = True,
    dates: Sequence[str | None] | None = None,
    level: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Graphe de motif d'une coupe. `graph_version` vaut 2."""
    ys = [float(v) for v in values]
    count = len(ys)
    span = _span(ys)
    spine = level if level is not None else build_pyramid(ys, (tau,), variable=variable, dates=dates)[0]
    pivots = list(spine["pivots"])
    nodes: list[dict[str, Any]] = []
    for slot, pivot in enumerate(pivots):
        x = 0.0 if count <= 1 else pivot["index"] / (count - 1)
        y = 0.5 if span <= 0 else (float(pivot["price"]) - min(ys)) / span
        nodes.append(
            {
                "slot": slot,
                "index": int(pivot["index"]),
                "date": pivot.get("date"),
                "price": float(pivot["price"]),
                "type": pivot["type"],
                "saliency": float(pivot.get("saliency") or 0.0),
                "x": x,
                "y": y,
                "hvg_degree": 0,
            }
        )
    prices = [node["price"] for node in nodes]
    hvg = horizontal_visibility(prices) if len(nodes) >= 2 else []
    degree = [0] * len(nodes)
    for left, right in hvg:
        degree[left] += 1
        degree[right] += 1
    for node, deg in zip(nodes, degree):
        node["hvg_degree"] = deg
    nvg = (
        natural_visibility(
            [node["index"] for node in nodes],
            prices,
            tau * span,
        )
        if span > 0 and len(nodes) >= 3
        else []
    )
    edges: list[dict[str, Any]] = []
    for slot in range(len(nodes) - 1):
        edges.append({"source": slot, "target": slot + 1, "kind": "segment", "side": 0})
    for left, right in hvg:
        if right == left + 1:
            continue
        edges.append({"source": left, "target": right, "kind": "hvg", "side": 0})
    for left, right, side in nvg:
        edges.append({"source": left, "target": right, "kind": "nvg", "side": side})
    legs = leg_word(pivots, span=span, length=count)
    return {
        "graph_version": 2,
        "tau": float(spine["tau"]),
        "variable": bool(spine["variable"]),
        "span": span,
        "length": count,
        "nodes": nodes,
        "edges": edges,
        "word": [leg["symbol"] for leg in legs],
        "legs": legs,
        "transitions": transition_counts(legs),
        "indices": list(spine["indices"]),
    }


def _linked(network: dict[str, Any], kind: str, left: int, right: int, side: int | None = None) -> bool:
    lo, hi = (left, right) if left < right else (right, left)
    for edge in network["edges"]:
        if edge["kind"] != kind or edge["source"] != lo or edge["target"] != hi:
            continue
        if side is None or edge["side"] == side:
            return True
    return False


def _band(network: dict[str, Any], eps: float) -> float:
    return max(float(eps), LEVEL_FLOOR, float(network["tau"])) * float(network["span"])


def _line_through(a: dict[str, Any], b: dict[str, Any]) -> tuple[float, float] | None:
    dx = float(b["index"] - a["index"])
    if dx == 0:
        return None
    slope = (float(b["price"]) - float(a["price"])) / dx
    return slope, float(a["price"]) - slope * float(a["index"])


def _deviation(line: tuple[float, float], nodes: Sequence[dict[str, Any]]) -> float:
    if not nodes:
        return 0.0
    return max(abs(float(node["price"]) - line_at(line, float(node["index"]))) for node in nodes)


def _chains(network: dict[str, Any], side: int) -> list[list[dict[str, Any]]]:
    wanted = "H" if side > 0 else "L"
    selected = [node for node in network["nodes"] if node["type"] == wanted]
    if len(selected) < 2:
        return []
    tol = float(network["tau"]) * float(network["span"])
    chains: list[list[dict[str, Any]]] = []
    current = [selected[0]]
    for node in selected[1:]:
        if not _linked(network, "nvg", current[-1]["slot"], node["slot"], side):
            if len(current) >= 2:
                chains.append(current)
            current = [node]
            continue
        trial = [*current, node]
        line = _line_through(trial[0], trial[-1])
        if line is not None and _deviation(line, trial) <= tol + 1e-9:
            current = trial
        else:
            if len(current) >= 2:
                chains.append(current)
            current = [node]
    if len(current) >= 2:
        chains.append(current)
    return chains


def _overlap_span(upper: Sequence[dict[str, Any]], lower: Sequence[dict[str, Any]]) -> float:
    lo = max(upper[0]["index"], lower[0]["index"])
    hi = min(upper[-1]["index"], lower[-1]["index"])
    if hi <= lo:
        return 0.0
    shortest = min(upper[-1]["index"] - upper[0]["index"], lower[-1]["index"] - lower[0]["index"])
    if shortest <= 0:
        return 1.0
    return (hi - lo) / shortest


def _breakout(
    values: Sequence[float],
    dates: Sequence[Any],
    activity: Sequence[float],
    *,
    start: int,
    level: float | tuple[float, float],
    direction: str,
) -> dict[str, Any] | None:
    def at(index: int) -> float:
        if isinstance(level, tuple):
            return line_at(level, float(index))
        return float(level)

    for index in range(start + 1, len(values)):
        bound = at(index)
        crossed = values[index] < bound if direction == "down" else values[index] > bound
        if not crossed:
            continue
        ratio = 0.0
        if activity and 0 <= index < len(activity):
            window = list(activity[max(0, index - ACTIVITY_PERIOD) : index])
            mean = sum(window) / len(window) if window else 0.0
            ratio = float(activity[index]) / mean if mean > 0 else 0.0
        volume_ok = bool(activity) and activity_confirms(list(activity), index, ACTIVITY_PERIOD)
        holds = True
        for ahead in range(index + 1, min(len(values), index + 1 + HOLD_BARS)):
            edge = at(ahead)
            if (values[ahead] >= edge) if direction == "down" else (values[ahead] <= edge):
                holds = False
                break
        confirmed = bool(volume_ok and holds) if activity else holds
        return {
            "index": index,
            "date": dates[index] if index < len(dates) else None,
            "value": float(values[index]),
            "level": float(bound),
            "direction": direction,
            "activity_ratio": round(ratio, 3),
            "volume_ok": volume_ok,
            "holds": holds,
            "confirmed": confirmed,
            "fake": not confirmed,
        }
    return None


def _assemble(
    figure: str,
    *,
    pivots: list[dict[str, Any]],
    guides: list[dict[str, Any]],
    fit: float,
    dates: Sequence[Any],
    length: int,
    breakout: dict[str, Any] | None,
    target: float | None,
    slope_bias: str | None = None,
) -> dict[str, Any]:
    from synchro.chartisme.catalog import kind_of, label_of, signal_of, target_basis
    from synchro.chartisme.figures import _score, _weigh

    indexes = [p["index"] for p in pivots] or [0]
    first, last = min(indexes), max(indexes)
    weighed = _weigh(_score(fit), first, last, len(pivots), length)
    hit: dict[str, Any] = {
        "figure": figure,
        "label": label_of(figure),
        "kind": kind_of(figure),
        "signal": signal_of(figure),
        "confidence": round(weighed, 4),
        "from_index": first,
        "to_index": last,
        "from": dates[first] if first < len(dates) else None,
        "to": dates[last] if last < len(dates) else None,
        "pivots": pivots,
        "guides": guides,
        "breakout": breakout,
        "target": None if target is None else {"value": float(target), "basis": target_basis(figure)},
        "detector": "motif",
    }
    if slope_bias:
        hit["slope_bias"] = slope_bias
    return hit


def _pivot(node: dict[str, Any], role: str) -> dict[str, Any]:
    return {
        "index": int(node["index"]),
        "date": node.get("date"),
        "value": float(node["price"]),
        "role": role,
    }


def _guide(role: str, points: Sequence[tuple[int, float]], kind: str = "segment") -> dict[str, Any]:
    return {
        "role": role,
        "kind": kind,
        "dashed": True,
        "points": [{"index": int(i), "value": float(v)} for i, v in points],
    }


def _between(nodes: Sequence[dict[str, Any]], kind: str, start: int, end: int) -> list[dict[str, Any]]:
    return [node for node in nodes if node["type"] == kind and start < node["index"] < end]


def _match_reversals(network: dict[str, Any], values: Sequence[float], dates: Sequence[Any], activity: Sequence[float], eps: float) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    span = float(network["span"])
    if span <= 0:
        return out
    band = _band(network, eps)
    nodes = network["nodes"]
    highs = [node for node in nodes if node["type"] == "H"]
    lows = [node for node in nodes if node["type"] == "L"]
    length = int(network["length"])

    for inverted, extremes, counters in (
        (False, highs, lows),
        (True, lows, highs),
    ):
        figure_ete = "ete_inv" if inverted else "ete"
        direction = "up" if inverted else "down"
        for slot in range(len(extremes) - 2):
            left, head, right = extremes[slot], extremes[slot + 1], extremes[slot + 2]
            lp, hp, rp = float(left["price"]), float(head["price"]), float(right["price"])
            prominence = min(lp - hp, rp - hp) if inverted else min(hp - lp, hp - rp)
            if prominence < MIN_PROMINENCE * span:
                continue
            if abs(lp - rp) > max(band, eps * 2 * span):
                continue
            if _linked(network, "hvg", left["slot"], right["slot"]):
                continue
            def _peak(node: dict[str, Any]) -> float:
                # Les bouts portent une saillance conventionnelle de 1 : elle
                # dit qu'ils n'ont pas été éliminés, pas qu'ils dominent.
                if int(node["index"]) in (0, length - 1):
                    return 0.0
                return float(node["saliency"])

            if _peak(head) + 1e-12 < max(_peak(left), _peak(right)):
                continue
            necks = [node for node in counters if left["index"] < node["index"] < right["index"]]
            if len(necks) < 2:
                continue
            neck_a, neck_b = necks[0], necks[-1]
            line = _line_through(neck_a, neck_b)
            if line is None:
                continue
            depth = abs(hp - line_at(line, float(head["index"])))
            if depth <= eps * span:
                continue
            breakout = _breakout(
                values,
                dates,
                activity,
                start=right["index"],
                level=line,
                direction=direction,
            )
            anchor = breakout["index"] if breakout else length - 1
            neck_at = line_at(line, float(anchor))
            target = neck_at - depth if direction == "down" else neck_at + depth
            out.append(
                _assemble(
                    figure_ete,
                    pivots=[
                        _pivot(left, "left_shoulder"),
                        _pivot(neck_a, "neck_left"),
                        _pivot(head, "head"),
                        _pivot(neck_b, "neck_right"),
                        _pivot(right, "right_shoulder"),
                    ],
                    guides=[
                        _guide(
                            "neckline",
                            [(neck_a["index"], line_at(line, float(neck_a["index"]))), (anchor, neck_at)],
                        )
                    ],
                    fit=abs(lp - rp) / span,
                    dates=dates,
                    length=length,
                    breakout=breakout,
                    target=target,
                )
            )

        for count, figure in (
            (3, "triple_bottom" if inverted else "triple_top"),
            (2, "double_bottom" if inverted else "double_top"),
        ):
            for slot in range(len(extremes) - count + 1):
                group = extremes[slot : slot + count]
                prices = [float(node["price"]) for node in group]
                if max(prices) - min(prices) > band:
                    continue
                if count == 2 and not _linked(network, "hvg", group[0]["slot"], group[1]["slot"]):
                    continue
                if count == 3 and not (
                    _linked(network, "hvg", group[0]["slot"], group[1]["slot"])
                    and _linked(network, "hvg", group[1]["slot"], group[2]["slot"])
                ):
                    continue
                mids = _between(counters, "H" if inverted else "L", group[0]["index"], group[-1]["index"])
                if len(mids) != count - 1:
                    continue
                level = max(float(node["price"]) for node in mids) if inverted else min(
                    float(node["price"]) for node in mids
                )
                extreme = min(prices) if inverted else max(prices)
                height = abs(extreme - level)
                if height <= MIN_PULLBACK * span:
                    continue
                others = [
                    node
                    for node in extremes
                    if node not in group and abs(float(node["price"]) - (sum(prices) / len(prices))) <= band
                ]
                if others:
                    continue
                breakout = _breakout(
                    values,
                    dates,
                    activity,
                    start=group[-1]["index"],
                    level=level,
                    direction=direction,
                )
                role = "bottom" if inverted else "top"
                counter_role = "resistance" if inverted else "support"
                out.append(
                    _assemble(
                        figure,
                        pivots=[*[_pivot(node, role) for node in group], *[_pivot(node, counter_role) for node in mids]],
                        guides=[
                            _guide(
                                counter_role,
                                [
                                    (group[0]["index"], level),
                                    (breakout["index"] if breakout else length - 1, level),
                                ],
                                kind="level",
                            )
                        ],
                        fit=(max(prices) - min(prices)) / span,
                        dates=dates,
                        length=length,
                        breakout=breakout,
                        target=level - height if direction == "down" else level + height,
                    )
                )
    return out


def _match_bounds(network: dict[str, Any], values: Sequence[float], dates: Sequence[Any], activity: Sequence[float]) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    span = float(network["span"])
    if span <= 0:
        return out
    uppers = _chains(network, 1)
    lowers = _chains(network, -1)
    length = int(network["length"])
    for upper_nodes in uppers:
        for lower_nodes in lowers:
            if _overlap_span(upper_nodes, lower_nodes) <= 0:
                continue
            upper = _line_through(upper_nodes[0], upper_nodes[-1])
            lower = _line_through(lower_nodes[0], lower_nodes[-1])
            if upper is None or lower is None:
                continue
            first = min(upper_nodes[0]["index"], lower_nodes[0]["index"])
            last = max(upper_nodes[-1]["index"], lower_nodes[-1]["index"])
            named = classify_bounds(upper, lower, first, last)
            if named is None:
                continue
            figure, direction = named
            err = (
                _deviation(upper, upper_nodes) + _deviation(lower, lower_nodes)
            ) / span
            base = abs(line_at(upper, first) - line_at(lower, first))
            if base <= 0:
                continue
            median = median_line(upper, lower)
            guides = [
                _guide("upper", [(first, line_at(upper, first)), (last, line_at(upper, last))]),
                _guide("lower", [(first, line_at(lower, first)), (last, line_at(lower, last))]),
                _guide(
                    "median",
                    [(first, line_at(median, first)), (last, line_at(median, last))],
                    kind="median",
                ),
            ]
            if direction == "any":
                down = _breakout(values, dates, activity, start=last, level=lower, direction="down")
                up = _breakout(values, dates, activity, start=last, level=upper, direction="up")
                cands = [item for item in (down, up) if item is not None]
                breakout = min(cands, key=lambda item: item["index"]) if cands else None
            else:
                rail = lower if direction == "down" else upper
                breakout = _breakout(values, dates, activity, start=last, level=rail, direction=direction)
            if breakout is None:
                origin = float(values[-1]) if values else 0.0
                target = origin - base if direction == "down" else origin + base
            else:
                origin = float(breakout["value"])
                target = origin - base if breakout["direction"] == "down" else origin + base
            pivots = [_pivot(node, "upper") for node in upper_nodes]
            pivots.extend(_pivot(node, "lower") for node in lower_nodes)
            pivots.sort(key=lambda item: item["index"])
            out.append(
                _assemble(
                    figure,
                    pivots=pivots,
                    guides=guides,
                    fit=err,
                    dates=dates,
                    length=length,
                    breakout=breakout,
                    target=target,
                    slope_bias=slope_bias_of(upper, lower, first, last),
                )
            )
    return out


def _match_flag(network: dict[str, Any], values: Sequence[float], dates: Sequence[Any], activity: Sequence[float]) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    legs = network["legs"]
    nodes = network["nodes"]
    span = float(network["span"])
    if span <= 0 or len(legs) < 4:
        return out
    length = int(network["length"])
    for pos, pole in enumerate(legs):
        if pole["slope"] != "steep" or pole["tertile"] < 2:
            continue
        rest = legs[pos + 1 : pos + 4]
        if len(rest) < 3 or any(leg["slope"] == "steep" for leg in rest):
            continue
        pause_start = int(rest[0]["start"])
        pause_end = int(rest[-1]["end"])
        pause = [float(v) for v in values[pause_start : pause_end + 1]]
        if len(pause) < 4:
            continue
        half = len(pause) // 2
        head = max(pause[:half]) - min(pause[:half])
        tail = max(pause[half:]) - min(pause[half:])
        figure = "pennant" if head > 0 and tail < 0.75 * head else "flag"
        direction = "up" if pole["direction"] == "up" else "down"
        if direction == "flat":
            continue
        level = max(pause) if direction == "up" else min(pause)
        breakout = _breakout(values, dates, activity, start=pause_end, level=level, direction=direction)
        pole_len = abs(float(pole["dy"]))
        origin = float(breakout["value"]) if breakout else float(values[-1])
        target = origin + pole_len if direction == "up" else origin - pole_len
        start_node = next(node for node in nodes if node["index"] == pole["start"])
        end_node = next((node for node in nodes if node["index"] == pause_end), nodes[-1])
        out.append(
            _assemble(
                figure,
                pivots=[_pivot(start_node, "pole_start"), _pivot(end_node, "pole_end")],
                guides=[
                    _guide(
                        "pause",
                        [(pause_start, min(pause)), (pause_end, max(pause))],
                        kind="level",
                    )
                ],
                fit=0.05,
                dates=dates,
                length=length,
                breakout=breakout,
                target=target,
            )
        )
        break
    return out


def _match_cup(network: dict[str, Any], values: Sequence[float], dates: Sequence[Any], activity: Sequence[float], eps: float) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    span = float(network["span"])
    nodes = network["nodes"]
    if span <= 0 or len(nodes) < 4:
        return out
    band = _band(network, eps)
    length = int(network["length"])
    highs = [node for node in nodes if node["type"] == "H"]
    lows = [node for node in nodes if node["type"] == "L"]
    for left_i, left in enumerate(highs):
        for right in highs[left_i + 1 :]:
            if abs(float(left["price"]) - float(right["price"])) > band:
                continue
            bowl = [node for node in lows if left["index"] < node["index"] < right["index"]]
            if not bowl:
                continue
            bottom = min(bowl, key=lambda node: float(node["price"]))
            depth = float(left["price"]) - float(bottom["price"])
            if depth < 0.28 * span:
                continue
            interior = [
                node
                for node in nodes
                if left["index"] < node["index"] < right["index"] and node is not bottom
            ]
            if any(float(node["saliency"]) > float(bottom["saliency"]) for node in interior):
                continue
            handle = [node for node in lows if node["index"] > right["index"]]
            if not handle:
                continue
            handle_low = handle[0]
            if float(handle_low["price"]) <= float(bottom["price"]):
                continue
            if float(right["price"]) - float(handle_low["price"]) > 0.5 * depth:
                continue
            lip = (float(left["price"]) + float(right["price"])) / 2
            breakout = _breakout(values, dates, activity, start=handle_low["index"], level=lip, direction="up")
            out.append(
                _assemble(
                    "cup_handle",
                    pivots=[
                        _pivot(left, "lip_left"),
                        _pivot(bottom, "bottom"),
                        _pivot(right, "lip_right"),
                        _pivot(handle_low, "handle_low"),
                    ],
                    guides=[_guide("lip", [(left["index"], lip), (right["index"], lip)], kind="level")],
                    fit=abs(float(left["price"]) - float(right["price"])) / span,
                    dates=dates,
                    length=length,
                    breakout=breakout,
                    target=(breakout["value"] if breakout else float(values[-1])) + depth,
                )
            )
            return out
    return out


def match_network(
    network: dict[str, Any],
    values: Sequence[float],
    dates: Sequence[Any],
    activity: Sequence[float],
    *,
    eps: float = 0.05,
) -> list[dict[str, Any]]:
    """Figures d'un graphe, avant le filtre de stabilité."""
    hits: list[dict[str, Any]] = []
    ys = [float(v) for v in values]
    hits.extend(_match_reversals(network, ys, dates, activity, eps))
    hits.extend(_match_bounds(network, ys, dates, activity))
    hits.extend(_match_flag(network, ys, dates, activity))
    hits.extend(_match_cup(network, ys, dates, activity, eps))
    return hits


def _roles(hit: dict[str, Any]) -> dict[str, tuple[int, ...]]:
    groups: dict[str, list[int]] = {}
    for pivot in hit.get("pivots") or []:
        groups.setdefault(str(pivot["role"]), []).append(int(pivot["index"]))
    return {role: tuple(sorted(indexes)) for role, indexes in groups.items()}


def same_motif(left: dict[str, Any], right: dict[str, Any], *, tol: int = INDEX_TOL) -> bool:
    """Même figure, mêmes rôles, indices à `tol` barres près."""
    if left.get("figure") != right.get("figure"):
        return False
    a, b = _roles(left), _roles(right)
    if set(a) != set(b):
        return False
    for role in a:
        if len(a[role]) != len(b[role]):
            return False
        if any(abs(x - y) > tol for x, y in zip(a[role], b[role])):
            return False
    return True


def stable_hits(groups: Sequence[Sequence[dict[str, Any]]]) -> list[dict[str, Any]]:
    """Ne garde que les motifs revus sur au moins deux tolérances."""
    flat: list[tuple[int, dict[str, Any]]] = []
    for level, hits in enumerate(groups):
        for hit in hits:
            flat.append((level, hit))
    used: set[int] = set()
    kept: list[dict[str, Any]] = []
    levels = max(1, len(groups))
    for index, (_level, hit) in enumerate(flat):
        if index in used:
            continue
        buddies = [index]
        seen = {_level}
        for other_index, (other_level, other) in enumerate(flat):
            if other_index == index or other_index in used:
                continue
            if same_motif(hit, other):
                buddies.append(other_index)
                seen.add(other_level)
        if len(seen) < 2:
            continue
        for buddy in buddies:
            used.add(buddy)
        best = max((flat[buddy][1] for buddy in buddies), key=lambda item: item["confidence"])
        persistence = len(seen) / levels
        chosen = dict(best)
        chosen["pivots"] = list(best["pivots"])
        chosen["guides"] = list(best["guides"])
        chosen["persistence"] = round(persistence, 4)
        chosen["confidence"] = round(min(0.99, float(best["confidence"]) * (0.55 + 0.45 * persistence)), 4)
        kept.append(chosen)
    return kept


def read_figures(
    values: Sequence[float],
    dates: Sequence[Any] | None = None,
    activity: Sequence[float] | None = None,
    *,
    eps: float = 0.05,
    taus: Sequence[float] = DEFAULT_TAUS,
    variable: bool = True,
) -> list[dict[str, Any]]:
    """Motifs stables d'une fenêtre. Liste vide si le tracé est trop court."""
    ys = [float(v) for v in values]
    if len(ys) < 8:
        return []
    labels = list(dates) if dates is not None else [None] * len(ys)
    if len(labels) < len(ys):
        labels = [*labels, *([None] * (len(ys) - len(labels)))]
    act = [float(a) for a in (activity or [])]
    levels = build_pyramid(ys, taus, variable=variable, dates=labels)
    groups = []
    for level in levels:
        network = build_network(ys, tau=float(level["tau"]), variable=variable, dates=labels, level=level)
        groups.append(match_network(network, ys, labels, act, eps=eps))
    return stable_hits(groups)


def _zone_overlap(left: dict[str, Any], right: dict[str, Any]) -> float:
    lo = max(int(left["from_index"]), int(right["from_index"]))
    hi = min(int(left["to_index"]), int(right["to_index"]))
    if hi <= lo:
        return 0.0
    shortest = min(
        int(left["to_index"]) - int(left["from_index"]),
        int(right["to_index"]) - int(right["from_index"]),
    )
    if shortest <= 0:
        return 0.0
    return (hi - lo) / shortest


def apply_agreement(
    geometric: list[dict[str, Any]],
    motifs: Sequence[dict[str, Any]],
) -> list[dict[str, Any]]:
    """Même figure sur la même zone : la lecture géométrique est confirmée.

    Le motif ne redessine pas la figure déjà vue — pivots, ligne de cou et
    cassure restent ceux du détecteur géométrique, règle d'or comprise. Il
    s'ajoute seulement lorsqu'aucune lecture géométrique ne couvre la zone.
    """
    extra: list[dict[str, Any]] = []
    for motif in motifs:
        host = next(
            (
                hit
                for hit in geometric
                if hit.get("figure") == motif.get("figure") and _zone_overlap(hit, motif) > 0.5
            ),
            None,
        )
        if host is None:
            extra.append(motif)
            continue
        host["confidence"] = round(min(0.99, float(host["confidence"]) * AGREEMENT), 4)
        host["agreed"] = True
    return [*geometric, *extra]
