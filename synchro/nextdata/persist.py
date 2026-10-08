"""Persist dans nextData : une boule prévue près de n−1 ou n−2 prend la place de la boule reprise.

La grille vise `limit` numéros et une étoile du tirage d’avant ou d’encore
avant. Les boules déjà reprises comptent : une grille qui en a assez ne bouge
pas. Sinon, le numéro prévu le plus proche d’une boule de n−1 ou n−2, à
`radius` au plus, est remplacé par elle.

Un échange se note contre le tirage sorti : gagné si la boule reprise sort et
pas celle qu’elle remplace, perdu dans le cas inverse, neutre sinon. Des
tirages indépendants donnent autant de gagnés que de perdus : la table de
l’archive dit si une boule de n−1 ou n−2 sort plus souvent que sa voisine.
"""

from __future__ import annotations

import math
from math import comb
from typing import Any, Iterable

PERSIST_RADII: tuple[int, ...] = (1, 2, 3)
PERSIST_LIMITS: tuple[int, ...] = (1, 2)
STAR_TARGET = 1
NUMBER_POOL = 50
NUMBER_SLOTS = 5
STAR_SLOTS = 2
FAR = PERSIST_RADII[-1] + 1
Z95 = 1.959964
Z80 = 0.841621


def parse_persist(raw: Any) -> dict[str, int] | None:
    """`null`, `false` ou un rayon nul éteignent Persist. Sinon rayon 1 à 3, 1 ou 2 numéros visés."""
    if raw in (None, False):
        return None
    if not isinstance(raw, dict):
        raise ValueError("Persist se règle avec un rayon et un nombre de numéros.")
    raw_radius = raw.get("radius")
    raw_limit = raw.get("limit", 1)
    if isinstance(raw_radius, bool) or isinstance(raw_limit, bool):
        raise ValueError("Persist se règle à ±1, ±2 ou ±3.")
    try:
        radius = int(raw_radius or 0)
        limit = int(1 if raw_limit is None else raw_limit)
    except (TypeError, ValueError):
        raise ValueError("Persist se règle à ±1, ±2 ou ±3.") from None
    if radius == 0:
        return None
    if radius not in PERSIST_RADII:
        raise ValueError("Persist se règle à ±1, ±2 ou ±3.")
    if limit not in PERSIST_LIMITS:
        raise ValueError("Persist vise 1 ou 2 numéros.")
    return {"radius": radius, "limit": limit}


def memory(before: list[dict[str, Any]], key: str) -> dict[int, int]:
    """Boules de n−1 puis de n−2, avec leur décalage. Une boule des deux tirages garde 1."""
    out: dict[int, int] = {}
    for lag, row in enumerate(reversed(before[-2:]), start=1):
        for value in row.get(key) or []:
            out.setdefault(int(value), lag)
    return out


def _snap(
    values: Iterable[int],
    recent: dict[int, int],
    *,
    radius: int,
    target: int,
    top: int,
) -> tuple[list[int], list[dict[str, int]], int]:
    grid = [int(value) for value in values]
    held = sum(1 for value in grid if value in recent)
    need = max(0, int(target) - held)
    if need == 0 or radius < 1:
        return sorted(grid), [], held
    candidates = sorted(
        (abs(value - ball), lag, ball, index)
        for index, value in enumerate(grid)
        if value not in recent
        for ball, lag in recent.items()
        if 1 <= abs(value - ball) <= radius and ball not in grid and 1 <= ball <= top
    )
    swaps: list[dict[str, int]] = []
    moved: set[int] = set()
    taken: set[int] = set()
    for distance, lag, ball, index in candidates:
        if len(swaps) >= need:
            break
        if index in moved or ball in taken:
            continue
        swaps.append({"from": grid[index], "to": ball, "lag": lag, "distance": distance})
        moved.add(index)
        taken.add(ball)
    for swap in swaps:
        grid[grid.index(swap["from"])] = swap["to"]
    return sorted(grid), swaps, held


def snap_grid(
    numbers: Iterable[int],
    stars: Iterable[int],
    before: list[dict[str, Any]],
    *,
    radius: int,
    limit: int,
    star_pool: int = 12,
) -> dict[str, Any]:
    """Grille Persist. `before` s’arrête au tirage d’avant celui qui est prévu."""
    pool = max(2, min(12, int(star_pool)))
    new_numbers, number_swaps, number_held = _snap(
        numbers, memory(before, "numbers"), radius=radius, target=limit, top=NUMBER_POOL
    )
    new_stars, star_swaps, star_held = _snap(
        stars, memory(before, "stars"), radius=radius, target=STAR_TARGET, top=pool
    )
    swaps = [{"kind": "number", **swap} for swap in number_swaps]
    swaps.extend({"kind": "star", **swap} for swap in star_swaps)
    return {
        "numbers": new_numbers,
        "stars": new_stars,
        "swaps": swaps,
        "held": {"numbers": number_held, "stars": star_held},
    }


def score_swaps(
    swaps: list[dict[str, Any]],
    numbers: Iterable[int],
    stars: Iterable[int],
) -> list[dict[str, Any]]:
    drawn = {"number": {int(value) for value in numbers}, "star": {int(value) for value in stars}}
    scored = []
    for swap in swaps:
        pool = drawn[swap["kind"]]
        came = swap["to"] in pool
        left = swap["from"] in pool
        outcome = "gain" if came and not left else "loss" if left and not came else "neutral"
        scored.append({**swap, "outcome": outcome})
    return scored


def recent_draws(before: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """n−1 puis n−2, pour nommer les boules reprises."""
    return [
        {"lag": lag, "date": row["date"], "numbers": list(row["numbers"]), "stars": list(row["stars"])}
        for lag, row in enumerate(reversed(before[-2:]), start=1)
    ]


def wilson(hits: int, seen: int) -> tuple[float, float]:
    if seen <= 0:
        return 0.0, 1.0
    share = hits / seen
    spread = 1.0 + Z95 * Z95 / seen
    center = (share + Z95 * Z95 / (2.0 * seen)) / spread
    half = Z95 * math.sqrt(share * (1.0 - share) / seen + Z95 * Z95 / (4.0 * seen * seen)) / spread
    return max(0.0, center - half), min(1.0, center + half)


def _rate(hits: int, seen: int) -> dict[str, Any]:
    lo, hi = wilson(hits, seen)
    return {
        "drawn": int(hits),
        "seen": int(seen),
        "rate": round(hits / seen, 6) if seen else None,
        "lo": round(lo, 6),
        "hi": round(hi, 6),
    }


def _edge(memory_side: tuple[int, int], near_side: tuple[int, int]) -> dict[str, float | None]:
    """p(reprise) − p(voisine), intervalle de Newcombe (deux intervalles de Wilson)."""
    k1, n1 = memory_side
    k2, n2 = near_side
    if n1 <= 0 or n2 <= 0:
        return {"value": None, "lo": None, "hi": None}
    p1, p2 = k1 / n1, k2 / n2
    l1, u1 = wilson(k1, n1)
    l2, u2 = wilson(k2, n2)
    diff = p1 - p2
    return {
        "value": round(diff, 6),
        "lo": round(diff - math.sqrt((p1 - l1) ** 2 + (u2 - p2) ** 2), 6),
        "hi": round(diff + math.sqrt((u1 - p1) ** 2 + (p2 - l2) ** 2), 6),
    }


def swap_noise(slots: int, pool: int) -> float:
    """Variance d’un échange au hasard : gagné ou perdu, chacun avec s/P · (P − s)/(P − 1)."""
    each = (slots / pool) * ((pool - slots) / (pool - 1))
    return 2.0 * each


def swaps_to_detect(edge: float, slots: int, pool: int) -> int:
    """Échanges pour voir `edge` de plus par boule reprise, à 80 % de puissance, 5 % bilatéral."""
    return int(math.ceil(((Z95 + Z80) ** 2) * swap_noise(slots, pool) / (edge * edge)))


def _none_left(pool: int, slots: int, remembered: int) -> float:
    return comb(pool - remembered, slots) / comb(pool, slots) if pool - remembered >= slots else 0.0


def base_rates(rows: list[dict[str, Any]]) -> dict[str, Any] | None:
    """Sortie d’une boule selon sa distance à n−1 ∪ n−2, sur tous les tirages reçus.

    Distance 0 : la boule était dans l’un des deux tirages. Le hasard donne
    5/50 à chaque numéro et 2/pool à chaque étoile, quelle que soit la distance.
    """
    if len(rows) < 3:
        return None
    tallies: dict[str, dict[int, list[float]]] = {"number": {}, "star": {}}
    number_any = star_any = either = 0
    number_chance = star_chance = either_chance = 0.0
    star_expected = 0.0
    star_candidates = 0
    scored = 0
    for t in range(2, len(rows)):
        row = rows[t]
        before = rows[t - 2 : t]
        pool = max(2, min(12, int(row.get("star_pool") or 12)))
        number_memory = set(memory(before, "numbers"))
        star_memory = {ball for ball in memory(before, "stars") if ball <= pool}
        drawn_numbers = set(row["numbers"])
        drawn_stars = set(row["stars"])
        for kind, top, recent, drawn in (
            ("number", NUMBER_POOL, number_memory, drawn_numbers),
            ("star", pool, star_memory, drawn_stars),
        ):
            if not recent:
                continue
            for ball in range(1, top + 1):
                distance = min(FAR, min(abs(ball - other) for other in recent))
                cell = tallies[kind].setdefault(distance, [0.0, 0.0])
                cell[0] += 1.0 if ball in drawn else 0.0
                cell[1] += 1.0
                if kind == "star":
                    star_expected += STAR_SLOTS / pool
                    star_candidates += 1
        number_hit = bool(drawn_numbers & number_memory)
        star_hit = bool(drawn_stars & star_memory)
        number_any += number_hit
        star_any += star_hit
        either += number_hit or star_hit
        no_number = _none_left(NUMBER_POOL, NUMBER_SLOTS, len(number_memory))
        no_star = _none_left(pool, STAR_SLOTS, len(star_memory))
        number_chance += 1.0 - no_number
        star_chance += 1.0 - no_star
        either_chance += 1.0 - no_number * no_star
        scored += 1

    def side(kind: str, chance: float, slots: int, pool: int, observed: int, expected: float) -> dict[str, Any]:
        cells = tallies[kind]
        by_distance = []
        for distance in range(0, FAR + 1):
            hits, seen = cells.get(distance, [0.0, 0.0])
            item = {"distance": distance, "far": distance == FAR, **_rate(int(hits), int(seen))}
            by_distance.append(item)
        held = cells.get(0, [0.0, 0.0])
        edges = []
        for radius in PERSIST_RADII:
            near = [sum(cells.get(d, [0.0, 0.0])[i] for d in range(1, radius + 1)) for i in (0, 1)]
            edges.append(
                {
                    "radius": radius,
                    "near": _rate(int(near[0]), int(near[1])),
                    **_edge((int(held[0]), int(held[1])), (int(near[0]), int(near[1]))),
                }
            )
        return {
            "chance": round(chance, 6),
            "at_least_one": {"observed": round(observed / scored, 6), "chance": round(expected / scored, 6)},
            "by_distance": by_distance,
            "edge": edges,
            "swaps_for_one_point": swaps_to_detect(0.01, slots, pool),
        }

    pool_now = max(2, min(12, int(rows[-1].get("star_pool") or 12)))
    star_rate = star_expected / star_candidates if star_candidates else STAR_SLOTS / pool_now
    return {
        "draws": scored,
        "first": rows[2]["date"],
        "last": rows[-1]["date"],
        "numbers": side("number", NUMBER_SLOTS / NUMBER_POOL, NUMBER_SLOTS, NUMBER_POOL, number_any, number_chance),
        "stars": side("star", star_rate, STAR_SLOTS, pool_now, star_any, star_chance),
        "any": {"observed": round(either / scored, 6), "chance": round(either_chance / scored, 6)},
    }
