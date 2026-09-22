"""Espace d’évaluation des grilles EuroMillions (miroir de src/lib/jeux.ts)."""

from __future__ import annotations

import math
from itertools import combinations
from typing import Any

NUMBER_DRAW = 5
STAR_DRAW = 2
NUMBER_POOL = 50
STAR_POOL = 12
NUMBER_SUM_MIN = 15
NUMBER_SUM_MAX = 240
STAR_SUM_MIN = 3
STAR_SUM_MAX = 23
TOTAL_NUMBER_WAYS = math.comb(NUMBER_POOL, NUMBER_DRAW)
TOTAL_STAR_WAYS = math.comb(STAR_POOL, STAR_DRAW)
TOTAL_GRIDS = TOTAL_NUMBER_WAYS * TOTAL_STAR_WAYS
DEFAULT_THRESHOLD = 1
DEFAULT_CHANCE = 100
LIST_LIMIT = 50
DECADE_COUNT = 5
DECADE_MAX_PER = 5
NUMBER_SPREAD_MIN = 4
NUMBER_SPREAD_MAX = 49
NUMBER_CONSEC_MAX = 4
STAR_SPREAD_MIN = 1
STAR_SPREAD_MAX = 11
STAR_CONSEC_MAX = 1


def _meta(kind: str) -> dict[str, Any]:
    if kind == "numbers":
        return {
            "values": list(range(1, NUMBER_POOL + 1)),
            "draw": NUMBER_DRAW,
            "pool_max": NUMBER_POOL,
            "sum_min": NUMBER_SUM_MIN,
            "sum_max": NUMBER_SUM_MAX,
            "universe": TOTAL_NUMBER_WAYS,
        }
    return {
        "values": list(range(1, STAR_POOL + 1)),
        "draw": STAR_DRAW,
        "pool_max": STAR_POOL,
        "sum_min": STAR_SUM_MIN,
        "sum_max": STAR_SUM_MAX,
        "universe": TOTAL_STAR_WAYS,
    }


def clamp_chance(value: float) -> int:
    if value != value:  # NaN
        return DEFAULT_CHANCE
    return max(0, min(100, int(round(value))))


def clamp_int(value: float, lo: int, hi: int) -> int:
    if value != value:
        return lo
    return max(lo, min(hi, int(round(value))))


def even_from_percent(percent: float, draw: int) -> int:
    return clamp_int((percent / 100) * draw, 0, draw)


def order_band(minimum: float, maximum: float, lo: int, hi: int) -> tuple[int, int]:
    a = clamp_int(minimum, lo, hi)
    b = clamp_int(maximum, lo, hi)
    return (a, b) if a <= b else (b, a)


def ball_role(chance: int, threshold: int, forced: bool) -> str:
    if forced:
        return "forced" if chance > 0 else "excluded"
    if chance <= 0:
        return "excluded"
    if chance < threshold:
        return "excluded"
    return "optional"


def _read_chance(chance: Any, value: int) -> int:
    if isinstance(chance, dict):
        return clamp_chance(chance.get(value, 0))
    if isinstance(chance, (list, tuple)) and 0 <= value < len(chance):
        return clamp_chance(chance[value])
    return 0


def classify(spec: dict[str, Any]) -> dict[str, Any]:
    meta = _meta(spec["kind"])
    forced_set = {
        int(value)
        for value in spec.get("forced") or []
        if isinstance(value, (int, float)) and 1 <= int(value) <= meta["pool_max"]
    }
    threshold = clamp_int(spec.get("threshold", DEFAULT_THRESHOLD), 0, 100)
    chance = spec.get("chance") or {}
    optional: list[int] = []
    forced: list[int] = []
    excluded: list[int] = []
    for value in meta["values"]:
        p = _read_chance(chance, value)
        role = ball_role(p, threshold, value in forced_set)
        if role == "forced":
            forced.append(value)
        elif role == "optional":
            optional.append(value)
        else:
            excluded.append(value)
    return {
        "optional": optional,
        "forced": forced,
        "excluded": excluded,
        "draw": meta["draw"],
        "threshold": threshold,
        "meta": meta,
    }


def _is_even(value: int) -> int:
    return 1 if value % 2 == 0 else 0


def _weight(chance: float) -> float:
    return clamp_chance(chance) / 100.0


def _decade_index(value: int) -> int:
    return min(4, max(0, (value - 1) // 10))


def _consecutive(values: list[int]) -> int:
    s = set(values)
    return sum(1 for n in s if (n + 1) in s)


def _shape_bands(spec: dict[str, Any], kind: str) -> dict[str, Any]:
    if kind == "numbers":
        spread = order_band(spec.get("min_spread", NUMBER_SPREAD_MIN), spec.get("max_spread", NUMBER_SPREAD_MAX), NUMBER_SPREAD_MIN, NUMBER_SPREAD_MAX)
        consec = order_band(spec.get("min_consecutive", 0), spec.get("max_consecutive", NUMBER_CONSEC_MAX), 0, NUMBER_CONSEC_MAX)
        decade_min = list(spec.get("decade_min") or [0] * DECADE_COUNT)
        decade_max = list(spec.get("decade_max") or [DECADE_MAX_PER] * DECADE_COUNT)
    else:
        spread = order_band(spec.get("min_spread", STAR_SPREAD_MIN), spec.get("max_spread", STAR_SPREAD_MAX), STAR_SPREAD_MIN, STAR_SPREAD_MAX)
        consec = order_band(spec.get("min_consecutive", 0), spec.get("max_consecutive", STAR_CONSEC_MAX), 0, STAR_CONSEC_MAX)
        decade_min = [0] * DECADE_COUNT
        decade_max = [DECADE_MAX_PER] * DECADE_COUNT
    decade_min = [clamp_int(decade_min[i] if i < len(decade_min) else 0, 0, DECADE_MAX_PER) for i in range(DECADE_COUNT)]
    decade_max = [clamp_int(decade_max[i] if i < len(decade_max) else DECADE_MAX_PER, 0, DECADE_MAX_PER) for i in range(DECADE_COUNT)]
    for i in range(DECADE_COUNT):
        if decade_min[i] > decade_max[i]:
            decade_min[i], decade_max[i] = decade_max[i], decade_min[i]
    return {
        "min_spread": spread[0],
        "max_spread": spread[1],
        "min_consecutive": consec[0],
        "max_consecutive": consec[1],
        "decade_min": decade_min,
        "decade_max": decade_max,
    }


def _slot_bands(spec: dict[str, Any], kind: str) -> list[tuple[int, int]] | None:
    raw = spec.get("slot_bands")
    if raw is None:
        raw = spec.get("slotBands")
    draw = NUMBER_DRAW if kind == "numbers" else STAR_DRAW
    pool = NUMBER_POOL if kind == "numbers" else STAR_POOL
    if not isinstance(raw, (list, tuple)) or len(raw) != draw:
        return None
    out: list[tuple[int, int]] = []
    for i, item in enumerate(raw):
        theo_lo = i + 1
        theo_hi = pool - (draw - 1 - i)
        if isinstance(item, dict):
            lo = clamp_int(item.get("lo", theo_lo), theo_lo, theo_hi)
            hi = clamp_int(item.get("hi", theo_hi), theo_lo, theo_hi)
        elif isinstance(item, (list, tuple)) and len(item) >= 2:
            lo = clamp_int(item[0], theo_lo, theo_hi)
            hi = clamp_int(item[1], theo_lo, theo_hi)
        else:
            return None
        if lo > hi:
            lo, hi = hi, lo
        out.append((lo, hi))
    theo = [(i + 1, pool - (draw - 1 - i)) for i in range(draw)]
    if all(band == theo[i] for i, band in enumerate(out)):
        return None
    return out


def _combo_passes_slots(combo: list[int], spec: dict[str, Any], kind: str) -> bool:
    bands = _slot_bands(spec, kind)
    if not bands:
        return True
    sorted_combo = sorted(combo)
    if len(sorted_combo) != len(bands):
        return False
    return all(lo <= value <= hi for value, (lo, hi) in zip(sorted_combo, bands))


def _shape_restricted(spec: dict[str, Any], kind: str) -> bool:
    bands = _shape_bands(spec, kind)
    if kind == "numbers":
        if bands["min_spread"] > NUMBER_SPREAD_MIN or bands["max_spread"] < NUMBER_SPREAD_MAX:
            return True
        if bands["min_consecutive"] > 0 or bands["max_consecutive"] < NUMBER_CONSEC_MAX:
            return True
        return any(bands["decade_min"][i] > 0 or bands["decade_max"][i] < DECADE_MAX_PER for i in range(DECADE_COUNT))
    if bands["min_spread"] > STAR_SPREAD_MIN or bands["max_spread"] < STAR_SPREAD_MAX:
        return True
    return bands["min_consecutive"] > 0 or bands["max_consecutive"] < STAR_CONSEC_MAX


def _combo_passes_shape(combo: list[int], spec: dict[str, Any], kind: str) -> bool:
    if not combo:
        return True
    bands = _shape_bands(spec, kind)
    spread = max(combo) - min(combo)
    if spread < bands["min_spread"] or spread > bands["max_spread"]:
        return False
    consec = _consecutive(combo)
    if consec < bands["min_consecutive"] or consec > bands["max_consecutive"]:
        return False
    if kind == "numbers":
        decades = [0] * DECADE_COUNT
        for value in combo:
            decades[_decade_index(value)] += 1
        for i in range(DECADE_COUNT):
            if decades[i] < bands["decade_min"][i] or decades[i] > bands["decade_max"][i]:
                return False
    return True


def combo_survives(values: list[int], spec: dict[str, Any]) -> bool:
    kind = spec["kind"]
    meta = _meta(kind)
    if len(values) != meta["draw"]:
        return False
    classified = classify(spec)
    allowed = set(classified["optional"]) | set(classified["forced"])
    if any(value not in allowed for value in values):
        return False
    if any(value not in values for value in classified["forced"]):
        return False
    band = order_band(spec.get("min_sum", meta["sum_min"]), spec.get("max_sum", meta["sum_max"]), meta["sum_min"], meta["sum_max"])
    even_band = order_band(spec.get("min_even", 0), spec.get("max_even", meta["draw"]), 0, meta["draw"])
    total = sum(values)
    even = sum(_is_even(value) for value in values)
    if not (band[0] <= total <= band[1] and even_band[0] <= even <= even_band[1]):
        return False
    if not _combo_passes_slots(sorted(values), spec, kind):
        return False
    return _combo_passes_shape(sorted(values), spec, kind)


def grid_survives(grid: dict[str, Any], numbers: dict[str, Any], stars: dict[str, Any]) -> bool:
    return combo_survives(list(grid["numbers"]), {**numbers, "kind": "numbers"}) and combo_survives(
        list(grid["stars"]), {**stars, "kind": "stars"}
    )


def _gather_from_visit(spec: dict[str, Any], classified: dict[str, Any], band: tuple[int, int], even_band: tuple[int, int], chance) -> dict[str, Any]:
    meta = classified["meta"]
    forced = classified["forced"]
    optional = classified["optional"]
    need = classified["draw"] - len(forced)
    must_sum = sum(forced)
    must_even = sum(_is_even(value) for value in forced)
    count = 0
    mass = 0.0
    sum_acc = 0
    by_sum: dict[int, int] = {}
    by_even: dict[int, int] = {}
    forced_mass = 1.0
    for value in forced:
        forced_mass *= _weight(_read_chance(chance, value))

    def accept(rest: tuple[int, ...]) -> None:
        nonlocal count, mass, sum_acc
        combo = sorted(forced + list(rest))
        total = must_sum + sum(rest)
        even = must_even + sum(_is_even(value) for value in rest)
        if not (band[0] <= total <= band[1] and even_band[0] <= even <= even_band[1]):
            return
        if not _combo_passes_shape(combo, spec, spec["kind"]):
            return
        if not _combo_passes_slots(combo, spec, spec["kind"]):
            return
        w = forced_mass
        for value in rest:
            w *= _weight(_read_chance(chance, value))
        count += 1
        mass += w
        sum_acc += total
        by_sum[total] = by_sum.get(total, 0) + 1
        by_even[even] = by_even.get(even, 0) + 1

    if need == 0:
        accept(())
    else:
        for rest in combinations(optional, need):
            accept(rest)

    return {
        "count": count,
        "mass": mass,
        "by_sum": [{"sum": s, "count": n} for s, n in sorted(by_sum.items())],
        "by_even": [
            {"even": e, "odd": meta["draw"] - e, "count": n} for e, n in sorted(by_even.items())
        ],
        "mean_sum": (sum_acc / count) if count else None,
    }


def evaluate_pool(spec: dict[str, Any]) -> dict[str, Any]:
    meta = _meta(spec["kind"])
    classified = classify(spec)
    band = order_band(spec.get("min_sum", meta["sum_min"]), spec.get("max_sum", meta["sum_max"]), meta["sum_min"], meta["sum_max"])
    even_band = order_band(spec.get("min_even", 0), spec.get("max_even", meta["draw"]), 0, meta["draw"])
    must_sum = sum(classified["forced"])
    must_even = sum(_is_even(value) for value in classified["forced"])
    need = classified["draw"] - len(classified["forced"])
    chance = spec.get("chance") or {}

    def ch(value: int) -> float:
        return _read_chance(chance, value)

    base = {
        "kind": spec["kind"],
        "draw": meta["draw"],
        "pool_max": meta["pool_max"],
        "universe": meta["universe"],
        "pool_size": len(classified["optional"]) + len(classified["forced"]),
        "optional": classified["optional"],
        "forced": classified["forced"],
        "excluded": classified["excluded"],
    }
    if need < 0 or base["pool_size"] < meta["draw"]:
        return {**base, "count": 0, "mass": 0.0, "by_sum": [], "by_even": [], "mean_sum": None}

    remain_min_sum = band[0] - must_sum
    remain_max_sum = band[1] - must_sum
    remain_min_even = even_band[0] - must_even
    remain_max_even = even_band[1] - must_even
    slot_bands = _slot_bands(spec, spec["kind"])
    slot_restricted = slot_bands is not None
    visit = _shape_restricted(spec, spec["kind"]) or (slot_restricted and len(classified["forced"]) > 0)

    if visit:
        gathered = _gather_from_visit(spec, classified, band, even_band, chance)
        return {**base, **gathered}

    if need == 0:
        ok = band[0] <= must_sum <= band[1] and even_band[0] <= must_even <= even_band[1]
        if ok:
            ok = _combo_passes_slots(classified["forced"], spec, spec["kind"])
        mass = 1.0
        if ok:
            for value in classified["forced"]:
                mass *= _weight(ch(value))
        return {
            **base,
            "count": 1 if ok else 0,
            "mass": mass if ok else 0.0,
            "by_sum": [{"sum": must_sum, "count": 1}] if ok else [],
            "by_even": [{"even": must_even, "odd": meta["draw"] - must_even, "count": 1}] if ok else [],
            "mean_sum": must_sum if ok else None,
        }

    if remain_max_sum < 0 or remain_max_even < 0 or remain_min_even > need:
        return {**base, "count": 0, "mass": 0.0, "by_sum": [], "by_even": [], "mean_sum": None}

    max_k = need
    max_sum = max(0, remain_max_sum)
    max_even = max(0, min(need, remain_max_even))
    layers = [[[[0, 0.0] for _ in range(max_even + 1)] for _ in range(max_sum + 1)] for _ in range(max_k + 1)]
    layers[0][0][0] = [1, 1.0]
    for value in classified["optional"]:
        w = _weight(ch(value))
        even = _is_even(value)
        for k in range(max_k, 0, -1):
            if slot_bands is not None:
                lo, hi = slot_bands[k - 1]
                if value < lo or value > hi:
                    continue
            for s in range(max_sum, value - 1, -1):
                for e in range(max_even, even - 1, -1):
                    prev_c, prev_m = layers[k - 1][s - value][e - even]
                    if prev_c == 0 and prev_m == 0:
                        continue
                    layers[k][s][e][0] += prev_c
                    layers[k][s][e][1] += prev_m * w

    count = 0
    mass = 0.0
    sum_acc = 0
    by_sum: dict[int, int] = {}
    by_even: dict[int, int] = {}
    s_lo = max(0, remain_min_sum)
    s_hi = min(max_sum, remain_max_sum)
    e_lo = max(0, remain_min_even)
    e_hi = min(max_even, remain_max_even)
    for s in range(s_lo, s_hi + 1):
        for e in range(e_lo, e_hi + 1):
            cell_c, cell_m = layers[need][s][e]
            if cell_c == 0:
                continue
            count += cell_c
            mass += cell_m
            sum_acc += s * cell_c
            by_sum[s + must_sum] = by_sum.get(s + must_sum, 0) + cell_c
            by_even[e + must_even] = by_even.get(e + must_even, 0) + cell_c

    for value in classified["forced"]:
        mass *= _weight(ch(value))

    return {
        **base,
        "count": count,
        "mass": mass,
        "by_sum": [{"sum": s, "count": n} for s, n in sorted(by_sum.items())],
        "by_even": [
            {"even": e, "odd": meta["draw"] - e, "count": n} for e, n in sorted(by_even.items())
        ],
        "mean_sum": (sum_acc / count + must_sum) if count else None,
    }


def evaluate_game(numbers: dict[str, Any], stars: dict[str, Any]) -> dict[str, Any]:
    number_result = evaluate_pool({**numbers, "kind": "numbers"})
    star_result = evaluate_pool({**stars, "kind": "stars"})
    grids = number_result["count"] * star_result["count"]
    return {
        "numbers": number_result,
        "stars": star_result,
        "grids": grids,
        "mass": number_result["mass"] * star_result["mass"],
        "universe": TOTAL_GRIDS,
        "fraction": grids / TOTAL_GRIDS if TOTAL_GRIDS else 0.0,
        "one_in": (TOTAL_GRIDS / grids) if grids else None,
    }


def chance_map(values: dict[int, float] | None = None, pool_max: int = NUMBER_POOL, default: int = DEFAULT_CHANCE) -> dict[int, int]:
    out = {i: default for i in range(1, pool_max + 1)}
    if values:
        for key, p in values.items():
            out[int(key)] = clamp_chance(p)
    return out
