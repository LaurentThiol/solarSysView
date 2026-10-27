"""Covariables d’un tirage réel : horloges, Pulse, forme, couples et triples.

L’index est le rang du tirage. Les horloges et Pulse sont connus avant le
tirage (covariables futures). Couples, triples, deltas et retards ne le sont
qu’une fois le tirage sorti (covariables passées) : leur historique s’arrête
avant t.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from datetime import date
from itertools import combinations
from typing import Iterable

from synchro.nextdata.pulse_features import FUTURE_PULSE, PULSE_AHEAD
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
    "pulse",
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

# Retards du tirage, du plus court au plus long. Cinq numéros, deux étoiles.
NUMBER_DELAY_SLOTS = 5
STAR_DELAY_SLOTS = 2
NUMBER_DELAYS = tuple(f"delay_{rank}" for rank in range(1, NUMBER_DELAY_SLOTS + 1))
STAR_DELAYS = tuple(f"star_delay_{rank}" for rank in range(1, STAR_DELAY_SLOTS + 1))
# Dix liens d’une grille 5 : C(5, 2) et C(5, 3). Chacun trié, pas moyenné.
LINK_SLOTS = 10

PAST_FORME = (
    "spread",
    "high_low",
    "consecutive",
    "star_consecutive",
    "centroid",
    "short_residual",
    *NUMBER_DELAYS,
    *STAR_DELAYS,
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


def _link_names(prefix: str) -> tuple[str, ...]:
    """Dix anciennetés, dix parts, dix affinités, puis le minimum et le recouvrement."""
    ranked = tuple(
        f"{prefix}_{kind}_{rank}"
        for kind in ("ago", "count", "affinity")
        for rank in range(1, LINK_SLOTS + 1)
    )
    return (*ranked, f"{prefix}_ago_min", f"{prefix}_overlap")


PAST_COUPLES = (*_link_names("couple"), "star_couple_ago")
PAST_TRIPLES = _link_names("triple")
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


def _kind_columns(prefix: str, kind: str) -> tuple[str, ...]:
    return tuple(f"{prefix}_{kind}_{rank}" for rank in range(1, LINK_SLOTS + 1))


@dataclass(frozen=True)
class Block:
    """Une part d’une famille. Méga la retire seule, sans éteindre le reste."""

    id: str
    family: str
    label: str
    columns: tuple[str, ...]


# Douze parts. Lune, décennies, delta et répétitions restent des familles entières.
BLOCKS: tuple[Block, ...] = (
    Block("calendrier-date", "calendrier", "Sans la date", ("weekday_mardi", "month", "day_of_year")),
    Block(
        "calendrier-cycles",
        "calendrier",
        "Sans les cycles",
        ("carrington_sin", "carrington_cos", "schwabe_sin", "schwabe_cos", "tropical_sin", "tropical_cos"),
    ),
    Block(
        "forme-profil",
        "forme",
        "Sans le profil",
        ("spread", "high_low", "consecutive", "star_consecutive", "centroid", "short_residual"),
    ),
    Block("forme-retards", "forme", "Sans les retards", (*NUMBER_DELAYS, *STAR_DELAYS)),
    Block(
        "couples-ago",
        "couples",
        "Sans ancienneté des couples",
        (*_kind_columns("couple", "ago"), "couple_ago_min", "star_couple_ago"),
    ),
    Block("couples-count", "couples", "Sans parts des couples", _kind_columns("couple", "count")),
    Block(
        "couples-affinity",
        "couples",
        "Sans affinités des couples",
        (*_kind_columns("couple", "affinity"), "couple_overlap"),
    ),
    Block(
        "triples-ago",
        "triples",
        "Sans ancienneté des triples",
        (*_kind_columns("triple", "ago"), "triple_ago_min"),
    ),
    Block("triples-count", "triples", "Sans parts des triples", _kind_columns("triple", "count")),
    Block(
        "triples-affinity",
        "triples",
        "Sans affinités des triples",
        (*_kind_columns("triple", "affinity"), "triple_overlap"),
    ),
    Block(
        "pulse-numeros",
        "pulse",
        "Sans Pulse numéros",
        tuple(name for name in FUTURE_PULSE if not name.startswith("star_")),
    ),
    Block(
        "pulse-etoiles",
        "pulse",
        "Sans Pulse étoiles",
        tuple(name for name in FUTURE_PULSE if name.startswith("star_")),
    ),
)

_BLOCK_BY_ID = {block.id: block for block in BLOCKS}


def known_block(block_id: object) -> Block | None:
    """Le jeton nommé, ou None s’il est absent. Un identifiant inconnu est refusé."""
    if block_id is None or block_id == "":
        return None
    if not isinstance(block_id, str):
        raise ValueError("Le bloc de covariables n’est pas reconnu.")
    found = _BLOCK_BY_ID.get(block_id)
    if found is None:
        raise ValueError("Le bloc de covariables n’est pas reconnu.")
    return found


def active_block(block_id: object, families: Iterable[str]) -> tuple[str | None, tuple[str, ...]]:
    """Identifiant et colonnes du jeton, si sa famille est cochée.

    Famille éteinte : le jeton ne retire rien. Identifiant inconnu : ValueError.
    """
    found = known_block(block_id)
    if found is None or found.family not in set(families):
        return None, ()
    return found.id, found.columns


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
    "pulse": FUTURE_PULSE,
}

_FAMILY_OF_COLUMN: dict[str, str] = {}
for _family, _cols in {**_PAST_BY_FAMILY, **_FUTURE_BY_FAMILY}.items():
    for _col in _cols:
        _FAMILY_OF_COLUMN[_col] = _family
for _col in TARGETS:
    _FAMILY_OF_COLUMN[_col] = "series"
for _col, _ahead in PULSE_AHEAD.items():
    _FAMILY_OF_COLUMN[_ahead] = "pulse"


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


def past_columns(families: Iterable[str], excluded: Iterable[str] | None = None) -> list[str]:
    skip = set(excluded or ())
    chosen = set(families)
    out: list[str] = []
    for family, cols in _PAST_BY_FAMILY.items():
        if family in chosen:
            out.extend(col for col in cols if col not in skip)
    return out


def future_columns(families: Iterable[str], excluded: Iterable[str] | None = None) -> list[str]:
    skip = set(excluded or ())
    chosen = set(families)
    out: list[str] = []
    for family, cols in _FUTURE_BY_FAMILY.items():
        if family in chosen:
            out.extend(col for col in cols if col not in skip)
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


def _sorted_slots(values: list[float], slots: int) -> list[float]:
    """Du plus petit au plus grand. Une grille courte est complétée par des zéros."""
    padded = [float(value) for value in values]
    if len(padded) < slots:
        padded.extend([0.0] * (slots - len(padded)))
    padded.sort()
    return padded[:slots]


def link_series(pools: list[list[int]], width: int) -> dict[str, list[float]]:
    """Ancienneté, part, affinité et recouvrement des co-sorties réelles.

    À l’indice t, tout ne voit que les tirages d’avant t, et rien ne grandit
    avec t : un arbre ne prolonge pas une tendance. L’ancienneté est plafonnée
    à AGO_CAP tirages, sinon un lien jamais vu vaudrait t ; plus haut, la
    censure du début du corpus la ferait encore suivre t. Le compte devient
    une part, rapportée aux t tirages lus. L’affinité d’une occurrence à
    l’indice i vaut i+1 (le plus récent pèse t, le plus ancien 1, comme
    `coupleRankWeight`) et se rapporte à son maximum t(t+1)/2.

    Les dix valeurs de chaque mesure sont gardées, triées. Deux grilles de
    même moyenne ne se confondent plus. Le minimum d’ancienneté et le
    recouvrement restent à part.
    """
    prefix = "couple" if width == 2 else "triple"
    history: dict[tuple[int, ...], list[int]] = {}
    previous: set[tuple[int, ...]] = set()
    ago_rows: list[list[float]] = []
    count_rows: list[list[float]] = []
    affinity_rows: list[list[float]] = []
    ago_min: list[float] = []
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
        ago_rows.append(_sorted_slots(agos, LINK_SLOTS))
        count_rows.append(_sorted_slots(counts, LINK_SLOTS))
        affinity_rows.append(_sorted_slots(affinities, LINK_SLOTS))
        ago_min.append(min(agos) if agos else 0.0)
        overlap.append(float(len(set(keys) & previous)))
        for key in keys:
            history.setdefault(key, []).append(index)
        previous = set(keys)
    out: dict[str, list[float]] = {
        f"{prefix}_ago_min": ago_min,
        f"{prefix}_overlap": overlap,
    }
    for kind, rows in (("ago", ago_rows), ("count", count_rows), ("affinity", affinity_rows)):
        for rank in range(LINK_SLOTS):
            out[f"{prefix}_{kind}_{rank + 1}"] = [row[rank] for row in rows]
    return out


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


def delay_profile(pools: list[list[int]], slots: int) -> list[list[float]]:
    """Retards des boules de ce tirage, du plus court au plus long.

    Comptés avant de les revoir : tirages depuis la sortie précédente, ou
    depuis le début du corpus si la boule n’est pas encore sortie. Une grille
    courte est complétée par des zéros. La moyenne de ces retards n’est pas
    une colonne.
    """
    last: dict[int, int] = {}
    out: list[list[float]] = []
    width = max(1, int(slots))
    for index, pool in enumerate(pools):
        delays = [float(index - last[n]) if n in last else float(index) for n in pool]
        for number in pool:
            last[number] = index
        out.append(_sorted_slots(delays, width))
    return out


def repeat_counts(pools: list[list[int]], lag: int = 1) -> list[float]:
    """Boules du tirage déjà sorties `lag` tirages plus tôt. 0 tant que ce tirage manque."""
    out: list[float] = []
    for index, pool in enumerate(pools):
        earlier = set(pools[index - lag]) if index >= lag else set()
        out.append(float(len(set(pool) & earlier)))
    return out

