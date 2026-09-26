"""Cycle court : une arche de 4 à 8 tirages, mesurée par son étendue.

L'écart-type d'une fenêtre plus longue noie cette arche. L'étendue est
max − min sur les tirages de l'arche, ou sur les `span` tirages qui finissent
à un index. Pas de moyenne, pas de correction de Bessel.
"""

from __future__ import annotations

from typing import Sequence

import numpy as np

SHORT_CYCLE_MIN = 4
SHORT_CYCLE_MAX = 8


def local_range(values: Sequence[float], end: int, span: int = SHORT_CYCLE_MAX) -> float:
    """max − min de la fenêtre qui finit à `end` (inclus), sur au plus `span` tirages."""
    data = [float(value) for value in values]
    if not data:
        return 0.0
    last = min(max(int(end), 0), len(data) - 1)
    start = max(0, last - max(int(span), 1) + 1)
    window = data[start : last + 1]
    if not window:
        return 0.0
    return float(max(window) - min(window))


def short_residual(values: Sequence[float], span: int = SHORT_CYCLE_MAX) -> np.ndarray:
    """(x − médiane des tirages précédents) / (étendue / 2).

    La fenêtre est strictement avant t, au plus `span` tirages. Étendue nulle :
    résidu nul. À t, rien après t.
    """
    data = [float(value) for value in values]
    out = np.zeros(len(data), dtype=float)
    width = max(int(span), 1)
    for index, value in enumerate(data):
        window = data[max(0, index - width) : index]
        if not window:
            continue
        extent = max(window) - min(window)
        if extent <= 1e-12:
            continue
        ordered = sorted(window)
        mid = len(ordered) // 2
        if len(ordered) % 2:
            median = ordered[mid]
        else:
            median = (ordered[mid - 1] + ordered[mid]) / 2.0
        out[index] = (value - median) / (extent / 2.0)
    return out
