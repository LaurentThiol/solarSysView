"""Projection entière et faisceau autour des rangs prévus."""

from __future__ import annotations

import math
from typing import Any

from synchro.nextdata.covariates import consecutive_count, spread_of
from synchro.nextdata.empirical import log_ball, smoothed_lift

NUMBER_BOUNDS = [(index, 50 - 5 + index) for index in range(1, 6)]


def _band(moment: dict[str, float] | None, default: float) -> tuple[float, float, float]:
    if not moment:
        return default, default, default
    mid = float(moment.get("mid", default))
    lo = float(moment.get("lo", mid))
    hi = float(moment.get("hi", mid))
    if hi < lo:
        lo, hi = hi, lo
    mid = min(hi, max(lo, mid))
    return lo, mid, hi


def reconstruct(n1: float, gaps: list[float]) -> list[float]:
    ranks = [float(n1)]
    for gap in gaps:
        ranks.append(ranks[-1] + max(1.0, float(gap)))
    return ranks


def _room(values: list[int], index: int, lo: list[int], hi: list[int]) -> tuple[int, int]:
    low = lo[index]
    high = hi[index]
    if index:
        low = max(low, values[index - 1] + 1)
    if index < len(values) - 1:
        high = min(high, values[index + 1] - 1)
    remain_after = len(values) - index - 1
    high = min(high, hi[-1] - remain_after)
    taken_before = index
    low = max(low, lo[0] + taken_before)
    return low, high


def project_increasing(values: list[float], lo: list[int], hi: list[int]) -> list[int]:
    """Entiers strictement croissants, chacun dans sa borne de rang."""
    out: list[int] = []
    previous = lo[0] - 1
    size = len(values)
    for index, raw in enumerate(values):
        remain = size - index - 1
        low = max(lo[index], previous + 1)
        high = min(hi[index], hi[-1] - remain)
        if low > high:
            low = high
        snapped = int(round(raw))
        snapped = min(high, max(low, snapped))
        out.append(snapped)
        previous = snapped
    return out


def _step_cost(value: int, delta: int, center: float, scale: float) -> float:
    """Ce que coûte un pas à un rang : le carré de son écart au centre, à l’échelle de sa bande.

    Au carré, chaque pas de plus sur un même rang coûte davantage : un total à
    déplacer se répartit en proportion du carré des largeurs, au lieu d’épuiser
    un seul rang.
    """
    width = max(float(scale), 1e-6)
    return ((value + delta - center) / width) ** 2 - ((value - center) / width) ** 2


def _fits(values: list[int], lo: list[int], hi: list[int]) -> bool:
    inside = all(lo[index] <= value <= hi[index] for index, value in enumerate(values))
    return inside and all(left < right for left, right in zip(values, values[1:]))


def _guides(values: list[int], centers: list[float] | None, scales: list[float] | None) -> tuple[list[float], list[float]]:
    chosen = [float(value) for value in values] if centers is None else [float(value) for value in centers]
    widths = [1.0] * len(values) if scales is None else [float(value) for value in scales]
    return chosen, widths


def _nudge_spread(
    values: list[int],
    target: int,
    lo: list[int],
    hi: list[int],
    centers: list[float] | None = None,
    scales: list[float] | None = None,
) -> list[int]:
    """Ramène max − min vers la cible sans changer la somme ni l’ordre.

    Un pas bouge une extrémité et compense sur un autre rang. Parmi les paires
    possibles, il prend celle qui éloigne le moins les rangs de leurs centres.
    """
    out = list(values)
    centers, scales = _guides(out, centers, scales)
    last = len(out) - 1
    for _ in range(120):
        spread = out[last] - out[0]
        if spread == int(target):
            break
        widen = spread < int(target)
        best: tuple[tuple[float, int, int], list[int]] | None = None
        for end, move in ((last, 1 if widen else -1), (0, -1 if widen else 1)):
            for other in range(len(out)):
                if other == end:
                    continue
                trial = list(out)
                trial[end] += move
                trial[other] -= move
                if not _fits(trial, lo, hi):
                    continue
                if abs(int(target) - (trial[last] - trial[0])) >= abs(int(target) - spread):
                    continue
                cost = _step_cost(out[end], move, centers[end], scales[end])
                cost += _step_cost(out[other], -move, centers[other], scales[other])
                key = (cost, end, other)
                if best is None or key < best[0]:
                    best = (key, trial)
        if best is None:
            break
        out = best[1]
    return out


def _nudge_sum(
    values: list[int],
    target: int,
    lo: list[int],
    hi: list[int],
    centers: list[float] | None = None,
    scales: list[float] | None = None,
) -> list[int]:
    """Rapproche la somme de la cible, un pas à la fois.

    Chaque pas va au rang qu’il éloigne le moins de son centre, à l’échelle de
    sa bande : la correction se répartit au lieu de pousser toujours n5 ou n1.
    """
    out = list(values)
    centers, scales = _guides(out, centers, scales)
    for _ in range(250):
        gap = int(target) - sum(out)
        if gap == 0:
            break
        step = 1 if gap > 0 else -1
        best: tuple[float, float, int] | None = None
        for index in range(len(out)):
            low, high = _room(out, index, lo, hi)
            if not low <= out[index] + step <= high:
                continue
            key = (_step_cost(out[index], step, centers[index], scales[index]), -scales[index], index)
            if best is None or key < best:
                best = key
        if best is None:
            break
        out[best[2]] += step
    return out


def project_numbers(moments: dict[str, dict[str, float]]) -> tuple[list[int], list[float]]:
    _, n1, _ = _band(moments.get("n1"), 8)
    gaps = []
    for name in ("g1", "g2", "g3", "g4"):
        _, mid, _ = _band(moments.get(name), 8)
        gaps.append(mid)
    raw = reconstruct(n1, gaps)
    lo = [bound[0] for bound in NUMBER_BOUNDS]
    hi = [bound[1] for bound in NUMBER_BOUNDS]
    mids, scales, _ = rank_scales(moments)
    ints = project_increasing(raw, lo, hi)
    _, sum_mid, _ = _band(moments.get("sum"), float(sum(ints)))
    ints = _nudge_sum(ints, int(round(sum_mid)), lo, hi, mids, scales)
    if moments.get("spread"):
        _, spread_mid, _ = _band(moments.get("spread"), float(ints[-1] - ints[0]))
        ints = _nudge_spread(ints, int(round(spread_mid)), lo, hi, mids, scales)
    return ints, raw


def project_stars(moments: dict[str, dict[str, float]], star_pool: int) -> list[int]:
    pool = max(2, min(12, int(star_pool)))
    _, e1, _ = _band(moments.get("e1"), 2)
    _, gap, _ = _band(moments.get("e_gap"), 3)
    raw = [e1, e1 + max(1.0, gap)]
    lo = [1, 2]
    hi = [pool - 1, pool]
    bands = rank_bands(moments, pool)
    centers = [bands[name]["mid"] for name in ("e1", "e2")]
    scales = [max(1.0, bands[name]["hi"] - bands[name]["lo"]) for name in ("e1", "e2")]
    ints = project_increasing(raw, lo, hi)
    _, sum_mid, _ = _band(moments.get("star_sum"), float(sum(ints)))
    return _nudge_sum(ints, int(round(sum_mid)), lo, hi, centers, scales)


def _valid_numbers(values: list[int]) -> bool:
    if len(values) != 5 or len(set(values)) != 5:
        return False
    if values != sorted(values):
        return False
    for index, number in enumerate(values):
        low, high = NUMBER_BOUNDS[index]
        if number < low or number > high:
            return False
    return True


def _valid_stars(values: list[int], pool: int) -> bool:
    if len(values) != 2 or len(set(values)) != 2 or values != sorted(values):
        return False
    return 1 <= values[0] < values[1] <= pool


def _neighbors(values: list[int], lo: list[int], hi: list[int], radius: int = 3) -> list[list[int]]:
    found: list[list[int]] = []
    seen = {tuple(values)}
    for index in range(len(values)):
        for delta in range(-radius, radius + 1):
            if delta == 0:
                continue
            trial = list(values)
            trial[index] += delta
            low, high = _room(trial, index, lo, hi)
            if trial[index] < low or trial[index] > high:
                continue
            if any(trial[i] >= trial[i + 1] for i in range(len(trial) - 1)):
                continue
            key = tuple(trial)
            if key in seen:
                continue
            seen.add(key)
            found.append(trial)
    return found


def _shape_distance(actual: float, moment: dict[str, float] | None) -> float:
    """Écart à la médiane prévue, à l’échelle de la bande. Moment absent : 0."""
    if not moment:
        return 0.0
    lo, mid, hi = _band(moment, actual)
    return abs(float(actual) - mid) / max(1.0, hi - lo)


def _gap(moment: dict[str, float] | None, default: float) -> tuple[float, float, float]:
    lo, mid, hi = _band(moment, default)
    return max(1.0, lo), max(1.0, mid), max(1.0, hi)


def _spread_out(parts: list[tuple[float, float, float]]) -> tuple[float, float]:
    below = math.sqrt(sum((mid - lo) ** 2 for lo, mid, _hi in parts))
    above = math.sqrt(sum((hi - mid) ** 2 for _lo, mid, hi in parts))
    return below, above


def _direct_band(
    moments: dict[str, dict[str, float]],
    name: str,
    mid: float,
    low: float,
    high: float,
) -> dict[str, float] | None:
    level = moments.get(f"level:{name}")
    if not level:
        return None
    lo, _, hi = _band(level, mid)
    return {"lo": max(low, min(lo, mid)), "mid": mid, "hi": min(high, max(hi, mid))}


def rank_bands(moments: dict[str, dict[str, float]], star_pool: int = 12) -> dict[str, dict[str, float]]:
    """Bandes de n1…n5, e1 et e2, autour des rangs tenus.

    La bande d’un rang est celle de sa prévision directe (`level:`) quand elle
    existe. Sinon elle se reconstruit depuis la chaîne : les écarts bas et haut
    de n1 et des g s’ajoutent en quadrature, car additionner les largeurs
    supposerait des écarts qui grandissent tous ensemble, alors qu’ils se
    partagent les cinquante numéros. Chaque bande reste dans les valeurs que
    son rang peut prendre.
    """
    first = _band(moments.get("n1"), 8)
    gaps = [_gap(moments.get(name), 8) for name in ("g1", "g2", "g3", "g4")]
    mids = reconstruct(first[1], [gap[1] for gap in gaps])
    out: dict[str, dict[str, float]] = {}
    for index, (low, high) in enumerate(NUMBER_BOUNDS):
        name = f"n{index + 1}"
        mid = min(high, max(low, mids[index]))
        direct = _direct_band(moments, name, mid, low, high)
        if direct is not None:
            out[name] = direct
            continue
        below, above = _spread_out([first, *gaps[:index]])
        out[name] = {"lo": max(low, mid - below), "mid": mid, "hi": min(high, mid + above)}
    pool = max(2, min(12, int(star_pool)))
    e1 = _band(moments.get("e1"), 2)
    e_gap = _gap(moments.get("e_gap"), 3)
    e1_mid = min(pool - 1, max(1.0, e1[1]))
    out["e1"] = _direct_band(moments, "e1", e1_mid, 1.0, pool - 1.0) or {
        "lo": max(1.0, min(e1[0], e1_mid)),
        "mid": e1_mid,
        "hi": min(pool - 1, max(e1[2], e1_mid)),
    }
    e2_mid = min(pool, max(2.0, e1[1] + e_gap[1]))
    direct = _direct_band(moments, "e2", e2_mid, 2.0, float(pool))
    if direct is not None:
        out["e2"] = direct
    else:
        below, above = _spread_out([e1, e_gap])
        out["e2"] = {"lo": max(2.0, e2_mid - below), "mid": e2_mid, "hi": min(pool, e2_mid + above)}
    return out


def rank_scales(moments: dict[str, dict[str, float]]) -> tuple[list[float], list[float], list[float]]:
    """Médiane reconstruite et largeur de bande de chaque rang."""
    every = rank_bands(moments)
    bands = [every[f"n{rank}"] for rank in range(1, 6)]
    mids = [band["mid"] for band in bands]
    scales = [max(1.0, band["hi"] - band["lo"]) for band in bands]
    return mids, scales, [max(1.0, band["hi"] - band["mid"]) for band in bands]


def score_grid(
    numbers: list[int],
    stars: list[int],
    moments: dict[str, dict[str, float]],
    base: dict[str, Any],
) -> float:
    """Plus le score est haut, plus la grille colle aux rangs, à l’étendue, aux consécutifs et à la base."""
    mids, scales, _ = rank_scales(moments)
    distance = 0.0
    for index, number in enumerate(numbers):
        distance += abs(number - mids[index]) / scales[index]
    _, sum_mid, sum_hi = _band(moments.get("sum"), float(sum(numbers)))
    sum_lo = _band(moments.get("sum"), float(sum(numbers)))[0]
    distance += abs(sum(numbers) - sum_mid) / max(1.0, sum_hi - sum_lo)
    _, parity_mid, parity_hi = _band(moments.get("parity"), 2.5)
    parity_lo = _band(moments.get("parity"), 2.5)[0]
    even = sum(1 for number in numbers if number % 2 == 0)
    distance += abs(even - parity_mid) / max(1.0, parity_hi - parity_lo)
    distance += _shape_distance(spread_of(numbers), moments.get("spread"))
    distance += _shape_distance(consecutive_count(numbers), moments.get("consecutive"))
    star_spread_moment = moments.get("star_spread") or moments.get("e_gap")
    distance += _shape_distance(spread_of(stars), star_spread_moment)
    distance += _shape_distance(consecutive_count(stars), moments.get("star_consecutive"))

    draws = max(int(base.get("draw_count") or 0), 1)
    number_counts = base.get("number_counts") or {}
    star_counts = base.get("star_counts") or {}
    pair_counts = base.get("pair_counts") or {}
    triple_counts = base.get("triple_counts") or {}
    pool = int(base.get("star_pool") or 12)

    frequency = 0.0
    for number in numbers:
        frequency += log_ball(float(number_counts.get(number, 0)), draws, slots=5, pool=50)
    frequency /= 5.0
    if stars:
        star_log = 0.0
        for star in stars:
            star_log += log_ball(float(star_counts.get(star, 0)), draws, slots=2, pool=pool)
        frequency += star_log / len(stars)

    couple_log = 0.0
    pairs = list(_pair_list(numbers))
    for pair in pairs:
        couple_log += math.log(
            max(
                smoothed_lift(
                    float(pair_counts.get(pair, 0)),
                    [float(number_counts.get(pair[0], 0)), float(number_counts.get(pair[1], 0))],
                    draws,
                ),
                1e-6,
            )
        )
    if pairs:
        couple_log /= len(pairs)

    triple_log = 0.0
    triples = list(_triple_list(numbers))
    for triple in triples:
        triple_log += math.log(
            max(
                smoothed_lift(
                    float(triple_counts.get(triple, 0)),
                    [float(number_counts.get(part, 0)) for part in triple],
                    draws,
                ),
                1e-6,
            )
        )
    if triples:
        triple_log /= len(triples)
    return -distance + frequency + couple_log + triple_log


def _pair_list(numbers: list[int]):
    ordered = sorted(numbers)
    for i, left in enumerate(ordered):
        for right in ordered[i + 1 :]:
            yield (left, right)


def _triple_list(numbers: list[int]):
    ordered = sorted(numbers)
    for i, a in enumerate(ordered):
        for j in range(i + 1, len(ordered)):
            for c in ordered[j + 1 :]:
                yield (a, ordered[j], c)


_WEIGHT_FLOOR = 0.05
_CHAIN_PRIOR = 1.0
_LEVEL_PRIOR = 1.0
_DELTA_PRIOR = 0.75
_NUMBER_RANKS = ("n1", "n2", "n3", "n4", "n5")
_NUMBER_GAPS = ("g1", "g2", "g3", "g4")
_STAR_RANKS = ("e1", "e2")


def _round4(value: float) -> float:
    return round(float(value), 4)


def _has_evolution(moments: dict[str, Any]) -> bool:
    return any(str(key).startswith("level:") or str(key).startswith("delta:") for key in moments)


def _previous_rank(previous: dict[str, Any] | None, name: str) -> float | None:
    if not previous or name not in previous or previous[name] is None:
        return None
    return float(previous[name])


def _mix_weights(parts: list[tuple[str, float, float, float]]) -> dict[str, float]:
    """Poids = prior / largeur, plancher 0,05, puis renormalisés."""
    scores = [prior / max(float(width), 1e-6) for _key, _center, width, prior in parts]
    total = sum(scores) or 1.0
    weights = [score / total for score in scores]
    for _ in range(4):
        weights = [max(_WEIGHT_FLOOR, weight) for weight in weights]
        total = sum(weights) or 1.0
        weights = [weight / total for weight in weights]
    return {parts[index][0]: weights[index] for index in range(len(parts))}


def _chain_number_bands(moments: dict[str, dict[str, float]]) -> list[tuple[float, float, float]]:
    lo, mid, hi = _band(moments.get("n1"), 8)
    bands = [(lo, mid, hi)]
    for name in _NUMBER_GAPS:
        gap_lo, gap_mid, gap_hi = _band(moments.get(name), 8)
        lo = lo + max(1.0, gap_lo)
        mid = mid + max(1.0, gap_mid)
        hi = hi + max(1.0, gap_hi)
        bands.append((lo, mid, hi))
    return bands


def _union_clip(
    value: float,
    chain_lo: float,
    chain_hi: float,
    level: dict[str, float] | None,
) -> float:
    lo, hi = chain_lo, chain_hi
    if level:
        level_lo, _, level_hi = _band(level, value)
        lo = min(lo, level_lo)
        hi = max(hi, level_hi)
    if hi < lo:
        lo, hi = hi, lo
    return min(hi, max(lo, value))


def _clip_gap(raw: float, moment: dict[str, float] | None) -> tuple[float, float, float, bool]:
    lo, _, hi = _band(moment, max(1.0, raw))
    lo = max(1.0, lo)
    hi = max(lo, hi)
    clipped = min(hi, max(lo, raw))
    return clipped, lo, hi, abs(clipped - raw) > 1e-6


def _rank_reading(
    name: str,
    chain: tuple[float, float, float],
    moments: dict[str, dict[str, float]],
    previous: dict[str, Any] | None,
) -> tuple[dict[str, Any], float]:
    """Centre d’un rang : ses deux prévisions directes, le niveau et le delta.

    La chaîne n’y entre que faute de prévision directe : additionner des
    médianes d’écarts tire n2…n5 vers le bas, la médiane d’une somme n’étant
    pas la somme des médianes. Elle reste dans la trace, pour comparaison.
    """
    chain_lo, chain_mid, chain_hi = chain
    parts: list[tuple[str, float, float, float]] = []
    level = moments.get(f"level:{name}")
    if level:
        _level_lo, level_mid, level_hi = _band(level, chain_mid)
        parts.append(("level", level_mid, max(level_hi - _level_lo, 1e-6), _LEVEL_PRIOR))
    delta = moments.get(f"delta:{name}")
    last = _previous_rank(previous, name)
    delta_level: float | None = None
    if delta and last is not None:
        delta_lo, delta_mid, delta_hi = _band(delta, 0.0)
        delta_level = last + delta_mid
        parts.append(("delta", delta_level, max(delta_hi - delta_lo, 1e-6), _DELTA_PRIOR))
    if not parts:
        parts.append(("chain", chain_mid, max(chain_hi - chain_lo, 1e-6), _CHAIN_PRIOR))
    weights = _mix_weights(parts)
    blend = sum(weights[key] * center for key, center, _width, _prior in parts)
    full = {"chain": 0.0, "level": 0.0, "delta": 0.0}
    full.update(weights)
    reading = {
        "rank": name,
        "chain": _round4(chain_mid),
        "level": None if level is None else _round4(_band(level, chain_mid)[1]),
        "delta": None if delta_level is None else _round4(delta_level),
        "weights": {key: _round4(value) for key, value in full.items()},
        "blend": _round4(blend),
        "clipped": None,
        "grid": None,
    }
    return reading, blend


def _gap_trace(name: str, raw: float, moment: dict[str, float] | None) -> tuple[dict[str, Any], float]:
    clipped, lo, hi, hit = _clip_gap(raw, moment)
    return (
        {
            "name": name,
            "blend": _round4(raw),
            "lo": _round4(lo),
            "hi": _round4(hi),
            "clipped": _round4(clipped),
            "hit": hit,
        },
        clipped,
    )


def compose_ranks(
    moments: dict[str, dict[str, float]],
    previous: dict[str, Any] | None,
) -> tuple[dict[str, dict[str, float]], dict[str, Any] | None]:
    """Centre de chaque rang par ses prévisions directes, puis écarts tenus dans la bande de la chaîne.

    Sans clés `level:` ni `delta:`, la chaîne reste telle quelle. Les médianes
    réécrites sont `n1`, `g1`…`g4`, `e1` et `e_gap`, celles que la projection lit.
    """
    if not _has_evolution(moments):
        return moments, None

    number_bands = _chain_number_bands(moments)
    number_rows: list[dict[str, Any]] = []
    number_blend: list[float] = []
    for index, name in enumerate(_NUMBER_RANKS):
        reading, blend = _rank_reading(name, number_bands[index], moments, previous)
        number_rows.append(reading)
        number_blend.append(blend)

    gap_rows: list[dict[str, Any]] = []
    gap_values: list[float] = []
    for index, name in enumerate(_NUMBER_GAPS):
        row, clipped = _gap_trace(name, number_blend[index + 1] - number_blend[index], moments.get(name))
        gap_rows.append(row)
        gap_values.append(clipped)

    chain_lo, _, chain_hi = number_bands[0]
    held_n1 = _union_clip(number_blend[0], chain_lo, chain_hi, moments.get("level:n1"))
    held_numbers = reconstruct(held_n1, gap_values)
    for index, value in enumerate(held_numbers):
        number_rows[index]["clipped"] = _round4(value)

    e1_lo, e1_mid, e1_hi = _band(moments.get("e1"), 2)
    _gap_lo, gap_mid, gap_hi = _band(moments.get("e_gap"), 3)
    e2_mid = e1_mid + max(1.0, gap_mid)
    e2_width = max((e1_hi - e1_lo) + max(0.0, gap_hi - _gap_lo), 1e-6)
    e2_half = e2_width / 2.0
    star_bands = [
        (e1_lo, e1_mid, e1_hi),
        (e2_mid - e2_half, e2_mid, e2_mid + e2_half),
    ]
    star_rows: list[dict[str, Any]] = []
    star_blend: list[float] = []
    for index, name in enumerate(_STAR_RANKS):
        reading, blend = _rank_reading(name, star_bands[index], moments, previous)
        star_rows.append(reading)
        star_blend.append(blend)
    star_gap, star_gap_value = _gap_trace("e_gap", star_blend[1] - star_blend[0], moments.get("e_gap"))
    held_e1 = _union_clip(star_blend[0], e1_lo, e1_hi, moments.get("level:e1"))
    held_stars = [held_e1, held_e1 + star_gap_value]
    for index, value in enumerate(held_stars):
        star_rows[index]["clipped"] = _round4(value)

    out = dict(moments)
    out["n1"] = dict(moments.get("n1") or {"lo": held_n1, "mid": held_n1, "hi": held_n1})
    out["n1"]["mid"] = held_numbers[0]
    for index, name in enumerate(_NUMBER_GAPS):
        current = moments.get(name) or {"lo": gap_values[index], "mid": gap_values[index], "hi": gap_values[index]}
        out[name] = dict(current)
        out[name]["mid"] = gap_values[index]
    out["e1"] = dict(moments.get("e1") or {"lo": held_e1, "mid": held_e1, "hi": held_e1})
    out["e1"]["mid"] = held_stars[0]
    current_gap = moments.get("e_gap") or {"lo": star_gap_value, "mid": star_gap_value, "hi": star_gap_value}
    out["e_gap"] = dict(current_gap)
    out["e_gap"]["mid"] = star_gap_value

    _, sum_mid, _ = _band(moments.get("sum"), float(sum(held_numbers)))
    _, star_sum_mid, _ = _band(moments.get("star_sum"), float(sum(held_stars)))
    trace = {
        "numbers": number_rows,
        "gaps": gap_rows,
        "stars": star_rows,
        "star_gap": star_gap,
        "sum_target": _round4(sum_mid),
        "sum_grid": None,
        "star_sum_target": _round4(star_sum_mid),
        "star_sum_grid": None,
    }
    return out, trace


def stamp_grid(trace: dict[str, Any], numbers: list[int], stars: list[int]) -> dict[str, Any]:
    """Pose la grille retenue sur la trace, après le nudge et le voisin."""
    for index, row in enumerate(trace["numbers"]):
        row["grid"] = int(numbers[index]) if index < len(numbers) else None
    for index, row in enumerate(trace["stars"]):
        row["grid"] = int(stars[index]) if index < len(stars) else None
    trace["sum_grid"] = int(sum(int(number) for number in numbers))
    trace["star_sum_grid"] = int(sum(int(star) for star in stars))
    return trace


def beam(
    moments: dict[str, dict[str, float]],
    base: dict[str, Any],
    *,
    star_pool: int = 12,
    radius: int = 3,
) -> list[dict[str, Any]]:
    """Centre projeté, puis voisins à ±1…±3 sur un rang. Le meilleur score d’abord."""
    pool = max(2, min(12, int(star_pool or base.get("star_pool") or 12)))
    center, _raw = project_numbers(moments)
    stars = project_stars(moments, pool)
    if not _valid_numbers(center):
        center = project_increasing(
            center,
            [b[0] for b in NUMBER_BOUNDS],
            [b[1] for b in NUMBER_BOUNDS],
        )
    number_alts = [center]
    number_alts.extend(
        _neighbors(center, [b[0] for b in NUMBER_BOUNDS], [b[1] for b in NUMBER_BOUNDS], radius)
    )
    # Second anneau court, pour ne pas rester collé au premier pas.
    extra: list[list[int]] = []
    for candidate in number_alts[1:9]:
        extra.extend(
            _neighbors(candidate, [b[0] for b in NUMBER_BOUNDS], [b[1] for b in NUMBER_BOUNDS], 1)
        )
    seen = {tuple(item) for item in number_alts}
    for candidate in extra:
        key = tuple(candidate)
        if key not in seen and _valid_numbers(candidate):
            seen.add(key)
            number_alts.append(candidate)
    star_lo = [1, 2]
    star_hi = [pool - 1, pool]
    star_alts = [stars]
    star_alts.extend(_neighbors(stars, star_lo, star_hi, radius=min(radius, 2)))

    ranked: list[dict[str, Any]] = []
    taken: set[tuple[tuple[int, ...], tuple[int, ...]]] = set()
    for nums in number_alts:
        if not _valid_numbers(nums):
            continue
        for star in star_alts:
            if not _valid_stars(star, pool):
                continue
            key = (tuple(nums), tuple(star))
            if key in taken:
                continue
            taken.add(key)
            ranked.append(
                {
                    "numbers": list(nums),
                    "stars": list(star),
                    "score": round(score_grid(nums, star, moments, base), 6),
                }
            )
    ranked.sort(key=lambda item: (-item["score"], item["numbers"], item["stars"]))
    return ranked[:6]
