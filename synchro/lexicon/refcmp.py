"""Comparaison aux horloges Réf : quarts de phase, pas un sens de courbe."""

from __future__ import annotations

from datetime import date
from typing import Any, Sequence

from synchro.analysis.common import as_date
from synchro.ref.phases import phase

FAST_CLOCKS = ("lunaire", "carrington")
SEASON_CLOCK = "tropique"
SLOW_CLOCKS = ("schwabe", "hale", "nodal", "saros", "meton", "gleissberg")
MEASURED = ("f107", "kp", "cosmiques", "enso", "qbo")
QUADRANT_FIELDS = ("sum", "parity", "star_sum")
# Moins d'un quart de tour : les quarts ne se séparent pas.
MIN_SPAN = 0.25


def _dates(draws: Sequence[dict[str, Any]]) -> list[date]:
    return [as_date(draw["draw_date"]) for draw in draws]


def phase_span(phases: Sequence[float]) -> float:
    """Arc occupé sur le cercle [0, 1)."""
    if len(phases) < 2:
        return 0.0
    ordered = sorted(float(value) % 1.0 for value in phases)
    gaps = [ordered[index + 1] - ordered[index] for index in range(len(ordered) - 1)]
    gaps.append(ordered[0] + 1.0 - ordered[-1])
    return 1.0 - max(gaps)


def quadrant(value: float) -> int:
    wrapped = float(value) % 1.0
    if wrapped == 0.0 and value != 0.0:
        return 0
    return min(3, int(wrapped * 4))


def _means(
    draws: Sequence[dict[str, Any]],
    phases: Sequence[float],
    series: dict[str, Sequence[float]],
) -> dict[str, dict[str, Any]]:
    buckets: dict[str, dict[int, list[float]]] = {field: {q: [] for q in range(4)} for field in QUADRANT_FIELDS}
    for index, angle in enumerate(phases):
        cell = quadrant(angle)
        for field in QUADRANT_FIELDS:
            values = series.get(field) or []
            if index < len(values):
                buckets[field][cell].append(float(values[index]))
    out: dict[str, dict[str, Any]] = {}
    for field, cells in buckets.items():
        means = {cell: (sum(values) / len(values) if values else None) for cell, values in cells.items()}
        occupied = [cell for cell, mean in means.items() if mean is not None]
        winner = None
        if occupied:
            winner = max(occupied, key=lambda cell: (means[cell] or 0.0, -cell))
        out[field] = {"means": means, "winner": winner, "occupied": len(occupied)}
    return out


def clock_on_window(
    clock: str,
    draws: Sequence[dict[str, Any]],
    series: dict[str, Sequence[float]],
) -> dict[str, Any]:
    days = _dates(draws)
    phases = [phase(clock, day) for day in days]
    span = phase_span(phases)
    short = span < MIN_SPAN
    return {
        "clock": clock,
        "span": span,
        "short": short,
        "fields": _means(draws, phases, series),
    }


def compare_clocks(
    windows: dict[int, dict[str, Any]],
) -> list[dict[str, Any]]:
    """`windows` : longueur → {draws, series}."""
    rows: list[dict[str, Any]] = []
    for clock in (*FAST_CLOCKS, SEASON_CLOCK):
        by_length = {
            length: clock_on_window(clock, payload["draws"], payload["series"])
            for length, payload in windows.items()
        }
        for field in QUADRANT_FIELDS:
            winners = {
                length: by_length[length]["fields"][field]["winner"] for length in by_length
            }
            shorts = [by_length[length]["short"] for length in by_length]
            if clock == SEASON_CLOCK and any(shorts):
                verdict = "peu de course"
            elif None in winners.values():
                verdict = "abstention"
            elif winners.get(20) != winners.get(100) and 20 in winners and 100 in winners:
                verdict = "opposé"
            elif len(set(winners.values())) == 1:
                verdict = "aligné"
            else:
                verdict = "emboîté"
            rows.append(
                {
                    "clock": clock,
                    "field": field,
                    "verdict": verdict,
                    "winners": {str(length): winners[length] for length in winners},
                    "spans": {str(length): by_length[length]["span"] for length in by_length},
                }
            )
    return rows


def slow_stamps(draws: Sequence[dict[str, Any]]) -> list[dict[str, Any]]:
    if not draws:
        return []
    day = as_date(draws[-1]["draw_date"])
    return [{"clock": clock, "phase": phase(clock, day), "date": day.isoformat()} for clock in SLOW_CLOCKS]


def measured_lines(loaded: dict[str, Any] | None = None) -> list[dict[str, Any]]:
    present = loaded or {}
    rows = []
    for name in MEASURED:
        if name in present and present[name]:
            rows.append({"id": name, "status": "chargée"})
        else:
            rows.append({"id": name, "status": "non chargée"})
    return rows
