"""Skill d'un sens contre le remaniement de la même fenêtre."""

from __future__ import annotations

import random
from typing import Any, Sequence

from synchro.chartisme.sense import name_sense


def sense_skill(
    values: Sequence[float],
    reference_sigma: float | None,
    *,
    n: int = 24,
    seed: int = 0,
) -> dict[str, Any] | None:
    """Positif quand le sens observé est plus rare que la moitié des remaniements.

    Le remaniement garde les valeurs et change l'ordre. Il se calcule après la lecture.
    """
    named = name_sense(values, reference_sigma)
    if named is None or n <= 0:
        return None
    rng = random.Random(seed)
    pool = [float(value) for value in values]
    same = 0
    for _ in range(n):
        shuffled = pool[:]
        rng.shuffle(shuffled)
        other = name_sense(shuffled, reference_sigma)
        if other is not None and other["sense"] == named["sense"]:
            same += 1
    base = same / n
    return {
        "skill": 0.5 - base,
        "base": base,
        "n": n,
        "sense": named["sense"],
    }
