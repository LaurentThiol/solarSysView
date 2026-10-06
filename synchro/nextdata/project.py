"""Projection entière et faisceau autour des rangs prévus."""

from __future__ import annotations

import math
from typing import Any

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


def _nudge_sum(values: list[int], target: int, lo: list[int], hi: list[int]) -> list[int]:
    out = list(values)
    guard = 0
    while sum(out) < target and guard < 80:
        guard += 1
        moved = False
        for index in range(len(out) - 1, -1, -1):
            low, high = _room(out, index, lo, hi)
            if out[index] < high and out[index] >= low:
                out[index] += 1
                moved = True
                break
        if not moved:
            break
    guard = 0
    while sum(out) > target and guard < 80:
        guard += 1
        moved = False
        for index in range(len(out)):
            low, high = _room(out, index, lo, hi)
            if out[index] > low and out[index] <= high:
                out[index] -= 1
                moved = True
                break
        if not moved:
            break
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
    ints = project_increasing(raw, lo, hi)
    _, sum_mid, _ = _band(moments.get("sum"), float(sum(ints)))
    ints = _nudge_sum(ints, int(round(sum_mid)), lo, hi)
    return ints, raw


def project_stars(moments: dict[str, dict[str, float]], star_pool: int) -> list[int]:
    pool = max(2, min(12, int(star_pool)))
    _, e1, _ = _band(moments.get("e1"), 2)
    _, gap, _ = _band(moments.get("e_gap"), 3)
    raw = [e1, e1 + max(1.0, gap)]
    lo = [1, 2]
    hi = [pool - 1, pool]
    ints = project_increasing(raw, lo, hi)
    _, sum_mid, _ = _band(moments.get("star_sum"), float(sum(ints)))
    return _nudge_sum(ints, int(round(sum_mid)), lo, hi)


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


def rank_scales(moments: dict[str, dict[str, float]]) -> tuple[list[float], list[float], list[float]]:
    """Médiane reconstruite et largeur de quantile de chaque rang."""
    def piece(name: str, default: float) -> tuple[float, float, float]:
        return _band(moments.get(name), default)

    n1_lo, n1_mid, n1_hi = piece("n1", 8)
    mids = [n1_mid]
    los = [n1_lo]
    his = [n1_hi]
    for name in ("g1", "g2", "g3", "g4"):
        lo, mid, hi = piece(name, 8)
        mids.append(mids[-1] + max(1.0, mid))
        los.append(los[-1] + max(1.0, lo))
        his.append(his[-1] + max(1.0, hi))
    scales = [max(1.0, his[i] - los[i]) for i in range(5)]
    return mids, scales, [max(1.0, his[i] - mids[i]) for i in range(5)]


def score_grid(
    numbers: list[int],
    stars: list[int],
    moments: dict[str, dict[str, float]],
    base: dict[str, Any],
) -> float:
    """Plus le score est haut, plus la grille colle aux rangs et à la base recomptée."""
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
