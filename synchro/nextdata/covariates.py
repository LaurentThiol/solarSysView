"""Covariables d’un tirage réel : horloges, forme, couples et triples.

L’index est le rang du tirage. Les horloges sont connues avant le tirage
(covariables futures). Couples, triples, deltas et retards ne le sont qu’une
fois le tirage sorti (covariables passées) : leur historique s’arrête avant t.
"""

from __future__ import annotations

import math
from datetime import date
from itertools import combinations
from typing import Iterable

from synchro.ref.cycles import carrington, lunar_state, schwabe
from synchro.ref.phases import tropical_fraction

FAMILIES: tuple[str, ...] = (
    "calendrier",
    "lune",
    "forme",
    "decennies",
    "delta",
    "repetitions",
    "couples",
    "triples",
)

TARGETS: tuple[str, ...] = (
    "sum",
    "n1",
    "g1",
    "g2",
    "g3",
    "g4",
    "parity",
    "star_sum",
    "e1",
    "e_gap",
)

# Chaîne : chaque écart reçoit les rangs déjà prévus du même tirage.
CHAIN: tuple[tuple[str, tuple[str, ...]], ...] = (
    ("n1", ()),
    ("g1", ("n1",)),
    ("g2", ("n1", "g1")),
    ("g3", ("n1", "g1", "g2")),
    ("g4", ("n1", "g1", "g2", "g3")),
    ("e1", ()),
    ("e_gap", ("e1",)),
)

# Étendue et consécutifs : mêmes comptes que la page Évolution.
# L’étendue des étoiles est e_gap (e2 − e1), déjà dans la chaîne des rangs.
TEMPORAL_TARGETS: tuple[str, ...] = (
    "sum",
    "parity",
    "star_sum",
    "spread",
    "consecutive",
    "star_consecutive",
)
SHAPE_SERIES: tuple[str, ...] = ("spread", "consecutive", "star_spread", "star_consecutive")

PAST_FORME = (
    "spread",
    "high_low",
    "consecutive",
    "star_consecutive",
    "centroid",
    "short_residual",
    "mean_delay",
)
PAST_DECADES = ("d0", "d1", "d2", "d3", "d4", "decade_occupied")
PAST_DELTA = (
    "d_sum",
    "d_star_sum",
    "d_n1",
    "d_n2",
    "d_n3",
    "d_n4",
    "d_n5",
    "d_e1",
    "d_e2",
)
# Les comptes du bloc Persist d’Évolution : numéros puis étoiles, contre n−1 et n−2.
PAST_REPEATS = ("repeat_count", "repeat_count_2", "star_repeat_count", "star_repeat_count_2")
PAST_COUPLES = (
    "couple_ago_mean",
    "couple_ago_min",
    "couple_count_mean",
    "couple_affinity_mean",
    "couple_overlap",
    "star_couple_ago",
)
PAST_TRIPLES = (
    "triple_ago_mean",
    "triple_ago_min",
    "triple_count_mean",
    "triple_affinity_mean",
    "triple_overlap",
)
FUTURE_CALENDAR = (
    "weekday_mardi",
    "month",
    "day_of_year",
    "carrington_sin",
    "carrington_cos",
    "schwabe_sin",
    "schwabe_cos",
    "tropical_sin",
    "tropical_cos",
)
FUTURE_MOON = ("lunar_sin", "lunar_cos")

_PAST_BY_FAMILY: dict[str, tuple[str, ...]] = {
    "forme": PAST_FORME,
    "decennies": PAST_DECADES,
    "delta": PAST_DELTA,
    "repetitions": PAST_REPEATS,
    "couples": PAST_COUPLES,
    "triples": PAST_TRIPLES,
}
_FUTURE_BY_FAMILY: dict[str, tuple[str, ...]] = {
    "calendrier": FUTURE_CALENDAR,
    "lune": FUTURE_MOON,
}

_FAMILY_OF_COLUMN: dict[str, str] = {}
for _family, _cols in {**_PAST_BY_FAMILY, **_FUTURE_BY_FAMILY}.items():
    for _col in _cols:
        _FAMILY_OF_COLUMN[_col] = _family
for _col in TARGETS:
    _FAMILY_OF_COLUMN[_col] = "series"


def normalize_families(selected: Iterable[str] | None) -> list[str]:
    if not selected:
        return list(FAMILIES)
    wanted = []
    seen = set()
    for name in selected:
        key = str(name).strip().lower()
        if key in FAMILIES and key not in seen:
            wanted.append(key)
            seen.add(key)
    return wanted or list(FAMILIES)


def past_columns(families: Iterable[str]) -> list[str]:
    chosen = set(families)
    out: list[str] = []
    for family, cols in _PAST_BY_FAMILY.items():
        if family in chosen:
            out.extend(cols)
    return out


def future_columns(families: Iterable[str]) -> list[str]:
    chosen = set(families)
    out: list[str] = []
    for family, cols in _FUTURE_BY_FAMILY.items():
        if family in chosen:
            out.extend(cols)
    return out


def column_family(feature: str) -> str:
    """Famille d’un nom de colonne ou d’une feature décalée `lag:sum:1`."""
    body = feature
    if ":" in feature:
        parts = feature.split(":")
        body = parts[1] if len(parts) >= 2 else feature
        if feature.startswith("same:"):
            return "chaine"
    if body in _FAMILY_OF_COLUMN:
        return _FAMILY_OF_COLUMN[body]
    if body.startswith("couple") or body == "star_couple_ago":
        return "couples"
    if body.startswith("triple"):
        return "triples"
    if body.startswith("d_"):
        return "delta"
    if body.startswith("lunar"):
        return "lune"
    return "series"


def _sin_cos(fraction: float) -> tuple[float, float]:
    angle = 2.0 * math.pi * (float(fraction) % 1.0)
    return math.sin(angle), math.cos(angle)


def spread_of(values: Iterable[int]) -> float:
    """max − min. 0 si la grille a moins de deux boules."""
    ordered = sorted(int(value) for value in values)
    if len(ordered) < 2:
        return 0.0
    return float(ordered[-1] - ordered[0])


def grid_shape(numbers: Iterable[int], stars: Iterable[int]) -> dict[str, float]:
    """Étendue et consécutifs des numéros puis des étoiles."""
    nums = [int(value) for value in numbers]
    star = [int(value) for value in stars]
    return {
        "spread": spread_of(nums),
        "consecutive": consecutive_count(nums),
        "star_spread": spread_of(star),
        "star_consecutive": consecutive_count(star),
    }


def consecutive_count(values: Iterable[int]) -> float:
    """Paires (n, n+1). 0 à 4 pour les numéros, 0 ou 1 pour les étoiles."""
    present = {int(value) for value in values}
    return float(sum(1 for number in present if (number + 1) in present))


def clocks(day: date) -> dict[str, float]:
    """Horloges connues à la date du tirage, sans regarder les boules."""
    moon = float(lunar_state(day)["fraction"])
    car = float(carrington(day)["fraction"])
    schwabe_frac = schwabe(day).get("fraction")
    trop = float(tropical_fraction(day))
    lunar_sin, lunar_cos = _sin_cos(moon)
    car_sin, car_cos = _sin_cos(car)
    sch_sin, sch_cos = _sin_cos(float(schwabe_frac or 0.0))
    trop_sin, trop_cos = _sin_cos(trop)
    return {
        "weekday_mardi": 1.0 if day.weekday() == 1 else 0.0,
        "month": float(day.month),
        "day_of_year": float(day.timetuple().tm_yday),
        "lunar_sin": lunar_sin,
        "lunar_cos": lunar_cos,
        "carrington_sin": car_sin,
        "carrington_cos": car_cos,
        "schwabe_sin": sch_sin,
        "schwabe_cos": sch_cos,
        "tropical_sin": trop_sin,
        "tropical_cos": trop_cos,
    }


def _combos(values: list[int], width: int) -> list[tuple[int, ...]]:
    ordered = tuple(sorted(values))
    if len(ordered) < width:
        return []
    return list(combinations(ordered, width))


AGO_CAP = 25


def link_series(pools: list[list[int]], width: int) -> dict[str, list[float]]:
    """Ancienneté, part, affinité et recouvrement des co-sorties réelles.

    À l’indice t, tout ne voit que les tirages d’avant t, et rien ne grandit
    avec t : un arbre ne prolonge pas une tendance. L’ancienneté est plafonnée
    à AGO_CAP tirages, sinon un lien jamais vu vaudrait t ; plus haut, la
    censure du début du corpus la ferait encore suivre t. Le compte devient
    une part, rapportée aux t tirages lus. L’affinité d’une occurrence à
    l’indice i vaut i+1 (le plus récent pèse t, le plus ancien 1, comme
    `coupleRankWeight`) et se rapporte à son maximum t(t+1)/2.
    """
    prefix = "couple" if width == 2 else "triple"
    history: dict[tuple[int, ...], list[int]] = {}
    previous: set[tuple[int, ...]] = set()
    ago_mean: list[float] = []
    ago_min: list[float] = []
    count_mean: list[float] = []
    affinity_mean: list[float] = []
    overlap: list[float] = []
    for index, pool in enumerate(pools):
        keys = _combos(pool, width)
        read = float(max(index, 1))
        weight_total = float(max(index * (index + 1) // 2, 1))
        agos: list[float] = []
        counts: list[float] = []
        affinities: list[float] = []
        for key in keys:
            seen = history.get(key, [])
            if seen:
                agos.append(float(min(index - seen[-1], AGO_CAP)))
                counts.append(len(seen) / read)
                affinities.append(sum(hit + 1 for hit in seen) / weight_total)
            else:
                agos.append(float(min(index, AGO_CAP)))
                counts.append(0.0)
                affinities.append(0.0)
        width_now = max(len(keys), 1)
        ago_mean.append(sum(agos) / width_now if agos else 0.0)
        ago_min.append(min(agos) if agos else 0.0)
        count_mean.append(sum(counts) / width_now if counts else 0.0)
        affinity_mean.append(sum(affinities) / width_now if affinities else 0.0)
        overlap.append(float(len(set(keys) & previous)))
        for key in keys:
            history.setdefault(key, []).append(index)
        previous = set(keys)
    return {
        f"{prefix}_ago_mean": ago_mean,
        f"{prefix}_ago_min": ago_min,
        f"{prefix}_count_mean": count_mean,
        f"{prefix}_affinity_mean": affinity_mean,
        f"{prefix}_overlap": overlap,
    }


def star_couple_ago(stars: list[list[int]]) -> list[float]:
    """Ancienneté de la paire d’étoiles réellement sortie, plafonnée comme les couples. Pas de triple."""
    seen: dict[tuple[int, int], int] = {}
    out: list[float] = []
    for index, pool in enumerate(stars):
        key = tuple(sorted(pool)[:2])
        if len(key) < 2:
            out.append(float(min(index, AGO_CAP)))
            continue
        pair = (int(key[0]), int(key[1]))
        previous = seen.get(pair)
        out.append(float(min(index if previous is None else index - previous, AGO_CAP)))
        seen[pair] = index
    return out


def mean_delay(pools: list[list[int]]) -> list[float]:
    """Retard moyen des numéros de ce tirage, mesuré avant de les revoir."""
    last: dict[int, int] = {}
    out: list[float] = []
    for index, pool in enumerate(pools):
        if not pool:
            out.append(0.0)
            continue
        delays = [float(index - last[n]) if n in last else float(index) for n in pool]
        out.append(sum(delays) / len(delays))
        for number in pool:
            last[number] = index
    return out


def repeat_counts(pools: list[list[int]], lag: int = 1) -> list[float]:
    """Boules du tirage déjà sorties `lag` tirages plus tôt. 0 tant que ce tirage manque."""
    out: list[float] = []
    for index, pool in enumerate(pools):
        earlier = set(pools[index - lag]) if index >= lag else set()
        out.append(float(len(set(pool) & earlier)))
    return out

