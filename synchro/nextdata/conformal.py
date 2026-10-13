"""Bandes 10–90 calibrées sur les erreurs du retour (méthode dite conforme).

Une bande de quantiles apprise sur peu de tirages se croit plus sûre qu’elle ne
l’est : sur le retour, la bande 10–90 contenait le tirage six fois sur dix, pas
huit. Sur les m pas du retour qui précèdent un tirage, on relève de combien la
bande a manqué le tirage sorti, par le bas (bas − sorti) et par le haut
(sorti − haut). Chaque bord est déplacé de la ⌈0,9 (m + 1)⌉-ième plus petite de
ces valeurs. Si les tirages sont échangeables, chaque bord laisse alors passer
au plus un tirage sur dix, et la bande en contient au moins huit sur dix. Une
valeur négative resserre une bande trop large.
"""

from __future__ import annotations

import math
from bisect import insort
from typing import Any, Iterable

from synchro.nextdata.uncertainty import share_interval

LEVEL = 0.9
MIN_STEPS = 9
FIELDS = (
    "sum",
    "parity",
    "star_sum",
    "spread",
    "consecutive",
    "star_consecutive",
    "n1",
    "n2",
    "n3",
    "n4",
    "n5",
    "e1",
    "e2",
    "e_gap",
    "star_spread",
)


def field_bounds(field: str, star_pool: int = 12) -> tuple[float, float]:
    pool = max(2, min(12, int(star_pool)))
    if field in ("n1", "n2", "n3", "n4", "n5"):
        rank = int(field[1])
        return float(rank), float(45 + rank)
    fixed = {
        "sum": (15.0, 240.0),
        "parity": (0.0, 5.0),
        "star_sum": (3.0, float(2 * pool - 1)),
        "spread": (4.0, 49.0),
        "consecutive": (0.0, 4.0),
        "star_consecutive": (0.0, 1.0),
        "e1": (1.0, float(pool - 1)),
        "e2": (2.0, float(pool)),
        "e_gap": (1.0, float(pool - 1)),
        "star_spread": (1.0, float(pool - 1)),
    }
    return fixed.get(field, (-math.inf, math.inf))


def truth_of(row: dict[str, Any]) -> dict[str, float]:
    """Valeurs sorties d’un tirage, champ par champ."""
    return {field: float(row[field]) for field in FIELDS if row.get(field) is not None}


def _rank(count: int) -> int | None:
    # 0,9 × 10 vaut 9,000000000000002 en flottant : sans la marge, le rang 9 de 9 manquerait.
    rank = math.ceil(LEVEL * (count + 1) - 1e-9)
    return rank if 1 <= rank <= count else None


def edge(scores: Iterable[float]) -> float | None:
    """La ⌈0,9 (m + 1)⌉-ième plus petite des m valeurs. None sous 9 valeurs."""
    ordered = sorted(float(value) for value in scores)
    rank = _rank(len(ordered))
    return None if rank is None else ordered[rank - 1]


def _moved(band: dict[str, float], down: float, up: float, field: str, star_pool: int) -> dict[str, float]:
    floor, ceiling = field_bounds(field, star_pool)
    mid = float(band["mid"])
    lo = max(floor, min(float(band["lo"]) - down, mid))
    hi = min(ceiling, max(float(band["hi"]) + up, mid))
    return {"lo": round(lo, 4), "mid": round(mid, 4), "hi": round(hi, 4)}


def calibrate(
    view: dict[str, dict[str, float]],
    history: list[tuple[dict[str, dict[str, float]], dict[str, float]]],
    star_pool: int = 12,
) -> tuple[dict[str, dict[str, float]], dict[str, Any]]:
    """Bandes déplacées par les manques des pas d’avant.

    `history` : couples (bandes brutes, valeurs sorties) des pas qui précèdent le
    tirage. Un champ qui n’a pas neuf pas d’avant garde sa bande brute.
    """
    out = {name: dict(band) for name, band in view.items()}
    edges: dict[str, dict[str, float]] = {}
    for field in FIELDS:
        band = view.get(field)
        if not band:
            continue
        pairs = [(past[field], actual[field]) for past, actual in history if field in past and field in actual]
        down = edge(float(past["lo"]) - value for past, value in pairs)
        up = edge(value - float(past["hi"]) for past, value in pairs)
        if down is None or up is None:
            continue
        out[field] = _moved(band, down, up, field, star_pool)
        edges[field] = {"down": round(down, 4), "up": round(up, 4)}
    return out, {"steps": len(history), "calibrated": bool(edges), "edges": edges}


def _rate(hits: list[bool]) -> float | None:
    return None if not hits else round(sum(1 for hit in hits if hit) / len(hits), 4)


def _share(hits: list[bool], name: str) -> dict[str, Any]:
    lo, hi = share_interval(sum(1 for hit in hits if hit), len(hits))
    return {name: _rate(hits), f"{name}_count": len(hits), f"{name}_lo": lo, f"{name}_hi": hi}


def coverage(
    pairs: list[tuple[dict[str, dict[str, float]], dict[str, float]] | tuple[dict[str, dict[str, float]], dict[str, float], int]],
    star_pool: int = 12,
) -> dict[str, dict[str, Any]]:
    """Part des tirages dans la bande, brute puis calibrée sur les seuls pas d’avant.

    `pairs` suit l’ordre des tirages. La couverture calibrée commence au pas qui
    a neuf pas d’avant ; elle se mesure donc hors échantillon. Chaque part a ses
    bornes de Wilson à 95 %.
    """
    below: dict[str, list[float]] = {field: [] for field in FIELDS}
    above: dict[str, list[float]] = {field: [] for field in FIELDS}
    raw: dict[str, list[bool]] = {field: [] for field in FIELDS}
    held: dict[str, list[bool]] = {field: [] for field in FIELDS}
    for pair in pairs:
        view, actual = pair[:2]
        target_pool = int(pair[2]) if len(pair) > 2 else star_pool
        for field in FIELDS:
            band = view.get(field)
            value = actual.get(field)
            if not band or value is None:
                continue
            raw[field].append(float(band["lo"]) <= value <= float(band["hi"]))
            rank = _rank(len(below[field]))
            if rank is not None:
                moved = _moved(band, below[field][rank - 1], above[field][rank - 1], field, target_pool)
                held[field].append(moved["lo"] <= value <= moved["hi"])
            insort(below[field], float(band["lo"]) - value)
            insort(above[field], value - float(band["hi"]))
    return {field: {**_share(raw[field], "raw"), **_share(held[field], "calibrated")} for field in FIELDS if raw[field]}
