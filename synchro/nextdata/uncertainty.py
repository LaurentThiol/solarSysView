"""Marges à 95 % du retour et des décalages.

Sur dix décalages, une MAE de somme varie d’environ ±5,8 points au seul gré des
tirages : passer sous la persistance n’y prouve rien. Chaque mesure du retour
et de nextDataTraining reçoit donc sa marge.

- Une moyenne, MAE comprise : intervalle de Student à n − 1 degrés de liberté.
- Deux lectures notées sur les mêmes tirages : l’écart |erreur de a| − |erreur
  de b|, tirage par tirage, et l’intervalle de Student de sa moyenne. C’est le
  test de Diebold et Mariano à un pas, corrigé par Harvey, Leybourne et
  Newbold : à un pas, il revient au test de Student apparié. Apparier retire le
  bruit commun au tirage, car une somme sortie très haute trompe toutes les
  lectures à la fois.
- Les communs d’une grille prise au hasard : loi hypergéométrique sur un
  tirage, (50, 5, 5) pour les numéros et (12, 2, 2) pour les étoiles, convolée
  sur les n tirages notés.
- Une part, la couverture d’une bande : intervalle de Wilson.
"""

from __future__ import annotations

import math
from functools import lru_cache
from itertools import accumulate
from typing import Any, Iterable, Sequence

import numpy as np
from scipy.stats import t as student

from synchro.analysis.inference import wilson_interval

LEVEL = 0.95
TAIL = (1.0 - LEVEL) / 2.0


def _round(value: float | None) -> float | None:
    return None if value is None else round(float(value), 4)


def _student(data: list[float]) -> tuple[float, float | None, float | None, float | None]:
    """Moyenne, bornes à 95 % et p bilatéral contre 0. Sans deuxième valeur, ni bornes ni p."""
    count = len(data)
    mean = math.fsum(data) / count
    if count < 2:
        return mean, None, None, None
    spread = math.sqrt(math.fsum((value - mean) ** 2 for value in data) / (count - 1))
    scale = spread / math.sqrt(count)
    half = float(student.ppf(1.0 - TAIL, count - 1)) * scale
    if scale == 0.0:
        p = 1.0 if mean == 0.0 else 0.0
    else:
        p = float(2.0 * student.sf(abs(mean) / scale, count - 1))
    return mean, mean - half, mean + half, p


def mean_interval(values: Iterable[float], *, floor: float | None = None) -> dict[str, Any]:
    """Moyenne et intervalle de Student à 95 %. `floor` borne le bas : une MAE ne descend pas sous 0."""
    data = [float(value) for value in values]
    if not data:
        return {"value": None, "lo": None, "hi": None, "count": 0}
    mean, lo, hi, _p = _student(data)
    if lo is not None and floor is not None:
        lo = max(floor, lo)
    return {"value": _round(mean), "lo": _round(lo), "hi": _round(hi), "count": len(data)}


def paired_gap(a: Sequence[float | None], b: Sequence[float | None]) -> dict[str, Any]:
    """|erreur de a| − |erreur de b|, sur les tirages notés des deux côtés. Les listes sont alignées.

    « lower » : tout l’intervalle est sous 0, a se trompe moins que b. « higher » :
    il est au-dessus. « undecided » : il contient 0, ou une seule paire ne trace
    pas d’intervalle.
    """
    gaps = [abs(float(x)) - abs(float(y)) for x, y in zip(a, b, strict=True) if x is not None and y is not None]
    if not gaps:
        return {"value": None, "lo": None, "hi": None, "count": 0, "p": None, "verdict": None}
    mean, lo, hi, p = _student(gaps)
    verdict = "undecided"
    if hi is not None and hi < 0.0:
        verdict = "lower"
    elif lo is not None and lo > 0.0:
        verdict = "higher"
    return {
        "value": _round(mean),
        "lo": _round(lo),
        "hi": _round(hi),
        "count": len(gaps),
        "p": _round(p),
        "verdict": verdict,
    }


def versus_all(errors: dict[str, Sequence[float | None]], rivals: Iterable[str]) -> dict[str, dict[str, Any]]:
    """Pour chaque lecture, son écart apparié à chaque rivale, sur les mêmes tirages."""
    names = [name for name in rivals if name in errors]
    return {
        key: {name: paired_gap(series, errors[name]) for name in names if name != key}
        for key, series in errors.items()
    }


@lru_cache(maxsize=32)
def hits_law(count: int, slots: int, pool: int) -> tuple[float, ...]:
    """Loi exacte du total des communs d’une grille au hasard sur `count` tirages.

    Sur un tirage, une grille de `slots` boules et un tirage de `slots` boules
    parmi `pool` en partagent k avec la probabilité C(s, k) C(P − s, s − k) / C(P, s).
    Les tirages sont indépendants : la loi du total est la convolée des `count` lois.
    """
    one = _one_hit_law(int(slots), int(pool))
    law = np.ones(1)
    for _ in range(count):
        law = np.convolve(law, one)
    return tuple(float(mass) for mass in law)


def _one_hit_law(slots: int, pool: int) -> np.ndarray:
    one = np.array(
        [math.comb(slots, k) * math.comb(pool - slots, slots - k) for k in range(slots + 1)],
        dtype=float,
    )
    return one / math.comb(pool, slots)


@lru_cache(maxsize=32)
def hits_law_mixed(pools: tuple[int, ...], slots: int) -> tuple[float, ...]:
    """Loi des communs quand la taille de l’urne peut changer entre les tirages."""
    law = np.ones(1)
    for pool in pools:
        law = np.convolve(law, _one_hit_law(int(slots), int(pool)))
    return tuple(float(mass) for mass in law)


def _chance_report(seen: list[int], law: tuple[float, ...], expected: float) -> dict[str, Any]:
    count = len(seen)
    cumulative = list(accumulate(law))
    lo = next(total for total, mass in enumerate(cumulative) if mass >= TAIL - 1e-12)
    hi = next(total for total, mass in enumerate(cumulative) if mass >= 1.0 - TAIL - 1e-12)
    observed = sum(seen)
    return {
        "observed": _round(observed / count),
        "expected": _round(expected),
        "lo": _round(lo / count),
        "hi": _round(hi / count),
        "p": _round(min(1.0, math.fsum(law[observed:]))),
        "count": count,
    }


def chance_hits(hits: Iterable[int], *, slots: int, pool: int) -> dict[str, Any] | None:
    """Les communs d’une lecture face au hasard, sur ses tirages notés.

    `expected` est la moyenne du hasard par tirage, s²/P. Une grille au hasard,
    notée sur autant de tirages, tombe entre `lo` et `hi` en moyenne 95 fois
    sur 100. `p` est la probabilité qu’elle fasse au moins aussi bien.
    """
    seen = [int(value) for value in hits]
    if not seen:
        return None
    count = len(seen)
    law = hits_law(count, int(slots), int(pool))
    return _chance_report(seen, law, slots * slots / pool)


def chance_hits_mixed(
    hits: Iterable[int],
    *,
    slots: int,
    pools: Iterable[int],
) -> dict[str, Any] | None:
    """Même rapport, avec la loi exacte de chaque urne dans l’ordre des tirages."""
    seen = [int(value) for value in hits]
    if not seen:
        return None
    pool_list = [int(pool) for pool in pools]
    if len(pool_list) != len(seen):
        raise ValueError("Un nombre de boules communes et une urne sont attendus par tirage.")
    law = hits_law_mixed(tuple(pool_list), int(slots))
    expected = math.fsum(slots * slots / pool for pool in pool_list) / len(pool_list)
    return _chance_report(seen, law, expected)


def share_interval(successes: int, count: int) -> tuple[float | None, float | None]:
    """Bornes de Wilson à 95 % d’une part. Sans tirage, pas de bornes."""
    if count <= 0:
        return None, None
    _share, lo, hi = wilson_interval(int(successes), int(count))
    return _round(lo), _round(hi)
