"""Nommer le sens d'une fenêtre : monte, baisse, stable.

Le symbole de jambe (`up:moderate:2`) classe un segment. Ici le nom porte sur
la fenêtre entière, et il ne le remplace pas.

La droite passe par les deux bouts — le même choix que les pivots, pour que
le jumeau TypeScript retombe sur les mêmes bits. L'écart-type est celui des
résidus autour de cette droite : une hausse nette et propre ne gonfle pas le
nuage. On le rapporte à l'écart-type de la courbe entière, pas à celui de la
fenêtre, sinon la somme serait toujours `sup` et une présence toujours `05`.

Registres exclusifs : `05` si le rapport ≤ 0,5, `1` s'il ≤ 1, `sup` au-delà.
Le sens est `stable` quand le déplacement net ne dépasse pas ce nuage.
"""

from __future__ import annotations

import math
from typing import Any, Sequence

# Même plancher que la plus courte fenêtre lisible du chartisme (`MIN_WINDOW`).
MIN_SENSE_LENGTH = 16

# Rapport σ résiduel / σ habituel.
TIGHT = 0.5
USUAL = 1.0

SENSES = ("monte", "baisse", "stable")
REGISTERS = ("05", "1", "sup")

_SENSE_GLOSS = {
    "monte": "la fenêtre monte",
    "baisse": "la fenêtre baisse",
    "stable": "la fenêtre reste stable",
}
_REGISTER_GLOSS = {
    "05": "le nuage autour de la droite tient dans la moitié de l'écart-type habituel",
    "1": "le nuage autour de la droite est de l'ordre de l'écart-type habituel",
    "sup": "le nuage autour de la droite dépasse l'écart-type habituel",
}


def series_sigma(values: Sequence[float]) -> float:
    """Écart-type de la série, divisé par n. Description du nuage, pas une estimation."""
    ys = [float(v) for v in values]
    count = len(ys)
    if count == 0:
        return 0.0
    mean = sum(ys) / count
    var = sum((value - mean) ** 2 for value in ys) / count
    return math.sqrt(var)


def register_of(ratio: float) -> str:
    """`05` ≤ 0,5, `1` ≤ 1, `sup` au-delà. Les bornes sont inclusives."""
    if ratio <= TIGHT:
        return "05"
    if ratio <= USUAL:
        return "1"
    return "sup"


def name_sense(values: Sequence[float], reference_sigma: float | None) -> dict[str, Any] | None:
    """Symbole `monte:05` / `baisse:1` / `stable:sup`, ou `None` si on s'abstient.

    On s'abstient sous `MIN_SENSE_LENGTH` points, ou si la référence n'est pas
    un écart-type (absente, négative, non finie). Une référence nulle nomme
    quand même : un nuage vide reste `05`, un nuage non nul est `sup`.
    """
    ys = [float(v) for v in values]
    count = len(ys)
    if count < MIN_SENSE_LENGTH:
        return None
    if reference_sigma is None:
        return None
    try:
        reference = float(reference_sigma)
    except (TypeError, ValueError):
        return None
    if not math.isfinite(reference) or reference < 0:
        return None

    delta = ys[-1] - ys[0]
    slope = delta / (count - 1)
    residuals = [ys[index] - (ys[0] + slope * index) for index in range(count)]
    sigma = series_sigma(residuals)
    if reference == 0:
        ratio = 0.0 if sigma == 0 else math.inf
    else:
        ratio = sigma / reference
    sense = "stable" if abs(delta) <= sigma else ("monte" if delta > 0 else "baisse")
    register = register_of(ratio)
    return {
        "symbol": f"{sense}:{register}",
        "sense": sense,
        "register": register,
        "sigma": sigma,
        "reference": reference,
        "ratio": ratio if math.isfinite(ratio) else None,
        "delta": delta,
    }


def sense_sentence(named: dict[str, Any] | None) -> str:
    """Phrase lue à côté du tracé. Le symbole reste en tête."""
    if not named:
        return "Fenêtre trop courte pour nommer le sens."
    sense = str(named.get("sense") or "")
    register = str(named.get("register") or "")
    symbol = str(named.get("symbol") or "")
    gloss = _SENSE_GLOSS.get(sense)
    cloud = _REGISTER_GLOSS.get(register)
    if not gloss or not cloud or not symbol:
        return "Fenêtre trop courte pour nommer le sens."
    return f"{symbol} — {gloss}, et {cloud}."
