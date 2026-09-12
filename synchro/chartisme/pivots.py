"""Pivots de swing pour le chartisme.

`synchro.analysis.tech.zigzag` filtre en pourcentage du *niveau* et laisse sa
direction indéterminée au départ : tant qu'elle l'est, l'extrême courant suit le
prix dans les deux sens, et une oscillation entière peut être avalée en tête de
fenêtre (une tête & épaules y perd son épaule gauche). Le seuil relatif au
niveau n'a d'ailleurs pas de sens sur les courbes `hit` (valeurs 0/1).

Ici le seuil est relatif à l'**amplitude de la fenêtre** — ce qui va de pair avec
la normalisation dans le carré unité — et la direction initiale est levée en
suivant simultanément le maximum et le minimum courants. Même forme de sortie
que `zigzag` (`index`, `date`, `price`, `type`), donc `swing_structure`,
`support_resistance_levels` et `trendline` restent utilisables tels quels.
"""

from __future__ import annotations

from typing import Any, Sequence

DEFAULT_PCT = 0.08


def swing_threshold(values: Sequence[float], pct: float = DEFAULT_PCT) -> float:
    """Seuil de swing : `pct` de l'amplitude, jambe dominante mise à part.

    Une jambe monotone gonfle l'amplitude sans rien dire des oscillations —
    le mât d'un drapeau vaut trois fois sa consolidation, et la sortie de
    cassure autant que la figure qu'elle clôt. Un seuil pris sur l'amplitude
    brute avale alors les pivots propres de la figure, qui devient invisible :
    un drapeau sur cinq ne renvoyait plus rien du tout.

    On retient donc la plus petite des deux amplitudes, brute et détendancée.
    Sur une fenêtre sans pente les deux coïncident et rien ne change ; sur une
    fenêtre emportée par une jambe, la seconde rend la main aux oscillations.
    La pente est prise entre les deux bouts plutôt qu'aux moindres carrés :
    moins fine, mais reproductible au bit près par le jumeau TypeScript.
    """
    if not values:
        return 0.0
    span = max(values) - min(values)
    count = len(values)
    if count >= 4:
        slope = (values[-1] - values[0]) / (count - 1)
        residual = [v - slope * i for i, v in enumerate(values)]
        span = min(span, max(residual) - min(residual))
    if span > 0:
        return span * pct
    return 0.0


def swing_pivots(
    values: Sequence[float],
    dates: Sequence[str | None] | None = None,
    pct: float = DEFAULT_PCT,
    *,
    threshold: float | None = None,
) -> list[dict[str, Any]]:
    """Extrêmes alternés séparés d'au moins `pct` de l'amplitude de la fenêtre."""
    series = [float(v) for v in values]
    n = len(series)
    labels: list[str | None] = list(dates or [])
    # Faute de dates, le champ reste vide : une fenêtre sans calendrier ne doit
    # pas faire passer un indice pour une date.
    if len(labels) != n:
        labels = [None] * n
    if n < 2:
        return []
    limit = swing_threshold(series, pct) if threshold is None else float(threshold)
    if limit <= 0:
        return []

    def pivot(kind: str, index: int) -> dict[str, Any]:
        return {"index": index, "date": labels[index], "price": series[index], "type": kind}

    pivots: list[dict[str, Any]] = []
    hi_i = lo_i = 0
    direction = 0
    for i in range(1, n):
        value = series[i]
        if direction == 0:
            if value > series[hi_i]:
                hi_i = i
            if value < series[lo_i]:
                lo_i = i
            if series[hi_i] - value >= limit:
                # Un sommet s'est formé ; le creux qui le précède ouvre la fenêtre.
                if lo_i < hi_i:
                    pivots.append(pivot("L", lo_i))
                pivots.append(pivot("H", hi_i))
                direction = -1
                lo_i = i
            elif value - series[lo_i] >= limit:
                if hi_i < lo_i:
                    pivots.append(pivot("H", hi_i))
                pivots.append(pivot("L", lo_i))
                direction = 1
                hi_i = i
        elif direction > 0:
            if value > series[hi_i]:
                hi_i = i
            elif series[hi_i] - value >= limit:
                pivots.append(pivot("H", hi_i))
                direction = -1
                lo_i = i
        else:
            if value < series[lo_i]:
                lo_i = i
            elif value - series[lo_i] >= limit:
                pivots.append(pivot("L", lo_i))
                direction = 1
                hi_i = i

    # Dernier extrême en cours : c'est lui qui porte les figures en formation.
    if direction > 0:
        pivots.append(pivot("H", hi_i))
    elif direction < 0:
        pivots.append(pivot("L", lo_i))

    deduped: list[dict[str, Any]] = []
    for item in pivots:
        if deduped and deduped[-1]["index"] == item["index"]:
            continue
        if deduped and deduped[-1]["type"] == item["type"]:
            better = (
                item["price"] > deduped[-1]["price"]
                if item["type"] == "H"
                else item["price"] < deduped[-1]["price"]
            )
            if better:
                deduped[-1] = item
            continue
        deduped.append(item)
    return deduped
