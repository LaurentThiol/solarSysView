"""Épisode : une fenêtre datée et son sens mesuré."""

from __future__ import annotations

from typing import Any, Sequence

from synchro.chartisme.sense import name_sense, series_sigma


def episode_from_window(
    values: Sequence[float],
    dates: Sequence[str],
    reference_sigma: float | None,
    *,
    module: str,
    series: str,
    facts: dict[str, Any] | None = None,
    context: dict[str, Any] | None = None,
    from_index: int = 0,
) -> dict[str, Any]:
    """Fenêtre nommée par `name_sense`. Le sens est `None` sous 16 tirages."""
    named = name_sense(values, reference_sigma)
    count = len(values)
    start = dates[0] if dates else None
    end = dates[-1] if dates else None
    return {
        "draw_date": end,
        "from_date": start,
        "to_date": end,
        "from_index": from_index,
        "to_index": from_index + count - 1 if count else from_index,
        "module": module,
        "series": series,
        "sense": named,
        "facts": dict(facts or {}),
        "context": dict(context or {}),
        "outcome": {"status": "open"},
    }


def reference_sigma(values: Sequence[float]) -> float:
    """Écart-type de toute la courbe chargée, commun aux fenêtres 20/50/100."""
    return series_sigma(values)


def close_outcome(
    values: Sequence[float],
    end_index: int,
    sense_name: str | None,
    *,
    horizon: int = 5,
    sigma: float | None = None,
) -> dict[str, Any]:
    """Issue après l'horizon : le pas suivant suit-il le sens nommé ?

    `open` s'il n'y a pas assez de tirages après la fenêtre.
    """
    if sense_name not in {"monte", "baisse", "stable"}:
        return {"status": "open", "horizon": horizon}
    if end_index < 0 or end_index >= len(values) - 1:
        return {"status": "open", "horizon": horizon}
    future = list(values[end_index + 1 : end_index + 1 + max(1, horizon)])
    if not future:
        return {"status": "open", "horizon": horizon}
    delta = float(future[-1]) - float(values[end_index])
    if sense_name == "monte":
        status = "reached" if delta > 0 else "invalidated"
    elif sense_name == "baisse":
        status = "reached" if delta < 0 else "invalidated"
    else:
        band = float(sigma) if sigma is not None else 0.0
        status = "reached" if abs(delta) <= band else "invalidated"
    return {"status": status, "horizon": horizon, "delta": delta}


def figure_outcome(
    values: Sequence[float],
    hit: dict[str, Any],
    *,
    horizon: int | None = None,
) -> dict[str, Any]:
    """Issue d'une figure chartiste, via `target_reached`. Le sens de fenêtre reste `close_outcome`."""
    from synchro.chartisme.figures import target_reached

    return target_reached(values, hit, horizon=horizon)
