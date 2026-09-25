"""Panneau : une ligne par tirage, une colonne par canal.

L'index est celui de `variables.series` et de Harmo. Le warmup nourrit
l'encodeur ; les scores ne lisent que la fenêtre de travail.
"""

from __future__ import annotations

from datetime import date
from typing import Any, Sequence

import numpy as np

from synchro.analysis.tech import activity_from_close
from synchro.analysis.variables import series as extract_series
from synchro.cycles.registry import (
    AGGREGATE_NAMES,
    Channel,
    _dates,
    _iso,
    carrington_phase,
    causal_zscore,
    clock_channels,
    dominant_period,
    figure_occupancy,
    fixed_period_phase,
    harmo_channel,
    index_phase,
    lunar_phase,
    morpho_gap_std,
    notes_for,
    relief_centroid,
    schwabe_phase,
    series_channels,
    sincos,
    static_vector,
    tropical_phase,
)
from synchro.harmo.series import sampling_stats

_ANCHOR = date(2000, 1, 1)
_KNOWN_PHASE = {
    "lunar": lunar_phase,
    "carrington": carrington_phase,
    "schwabe": schwabe_phase,
    "tropical": tropical_phase,
}


def target_values(draws: Sequence[dict[str, Any]], name: str, n: int | None) -> np.ndarray:
    return np.asarray(extract_series(list(draws), name, n)["values"], dtype=float)


def build_panel(
    draws: Sequence[dict[str, Any]],
    *,
    variable: str = "sum",
    n: int | None = None,
    warmup: int = 0,
    harmo_period_draws: float | None = None,
) -> dict[str, Any]:
    """Assemble le panneau. `harmo_period_draws` fige la raie (passé d'entraînement)."""
    rows = list(draws)
    if not rows:
        raise ValueError("Aucun tirage dans le panneau.")
    days = _dates(rows)
    dates = [_iso(day) for day in days]
    sampling = sampling_stats(dates)
    target = target_values(rows, variable, n)
    length = int(target.size)

    aggregates = {
        name: np.asarray(extract_series(rows, name)["values"], dtype=float)
        for name in AGGREGATE_NAMES
    }
    activity = np.asarray(activity_from_close(target.tolist()), dtype=float)
    occupancy, figure_period = figure_occupancy(target)
    gap_std = morpho_gap_std(rows)
    centroid = relief_centroid(rows)
    residual = causal_zscore(target)

    if harmo_period_draws is None:
        packed = dominant_period(target, float(sampling["draws_per_year"] or 104.0))
        harmo_period_draws = packed.get("period_draws")
        harmo_period_days = None
        if harmo_period_draws and sampling.get("draws_per_year"):
            harmo_period_days = float(harmo_period_draws) * 365.25 / float(sampling["draws_per_year"])
    else:
        harmo_period_days = None
        if sampling.get("draws_per_year"):
            harmo_period_days = float(harmo_period_draws) * 365.25 / float(sampling["draws_per_year"])

    known_meta: list[Channel] = []
    known_cols: list[np.ndarray] = []

    weekday = np.array([1.0 if str(row.get("weekday")) == "mardi" else 0.0 for row in rows])
    known_meta.append(clock_channels()[0])
    known_cols.append(weekday)

    for channel in clock_channels()[1:]:
        if channel.id in _KNOWN_PHASE:
            phase = _KNOWN_PHASE[channel.id](days)
        else:
            phase = fixed_period_phase(days, float(channel.period_days or 1.0), _ANCHOR)
        sine, cosine = sincos(phase)
        known_meta.append(channel)
        known_cols.append(sine)
        known_meta.append(
            Channel(
                f"{channel.id}:cos",
                f"{channel.label} cos",
                channel.module,
                channel.kind,
                "known",
                period_days=channel.period_days,
                group=channel.group,
            )
        )
        known_cols.append(cosine)
        # Le sinus porte l'id du groupe ; on remplace le canal d'origine par son sinus nommé.
        known_meta[-2] = Channel(
            f"{channel.id}:sin",
            f"{channel.label} sin",
            channel.module,
            channel.kind,
            "known",
            period_days=channel.period_days,
            period_draws=channel.period_draws,
            group=channel.group,
            note=channel.note,
        )

    harmo = harmo_channel(
        float(harmo_period_draws) if harmo_period_draws else None,
        float(harmo_period_days) if harmo_period_days else None,
    )
    harmo_phi = index_phase(length, harmo.period_draws)
    h_sin, h_cos = sincos(harmo_phi)
    known_meta.append(
        Channel(
            "harmo:sin",
            "Raie Harmo sin",
            "harmo",
            "spectral",
            "known",
            period_days=harmo.period_days,
            period_draws=harmo.period_draws,
            group="harmo",
            note=harmo.note,
        )
    )
    known_cols.append(h_sin)
    known_meta.append(
        Channel(
            "harmo:cos",
            "Raie Harmo cos",
            "harmo",
            "spectral",
            "known",
            period_days=harmo.period_days,
            period_draws=harmo.period_draws,
            group="harmo",
        )
    )
    known_cols.append(h_cos)

    past_meta = series_channels(variable)
    past_cols: list[np.ndarray] = [aggregates[name] for name in AGGREGATE_NAMES]
    past_cols.extend([activity, occupancy, gap_std, centroid, residual])
    # La période d'occupation est portée par le canal chartiste.
    for index, channel in enumerate(past_meta):
        if channel.id == "chartisme:occupancy":
            past_meta[index] = Channel(
                channel.id,
                channel.label,
                channel.module,
                channel.kind,
                channel.role,
                period_draws=figure_period,
                group=channel.group,
                note=channel.note,
            )

    known = np.column_stack(known_cols).astype(float)
    past = np.column_stack(past_cols).astype(float)
    star_pool = rows[-1].get("star_pool")
    static = static_vector(variable, n, int(star_pool) if star_pool is not None else None)

    work_start = min(max(int(warmup), 0), max(length - 1, 0))
    phases = {
        "lunar": lunar_phase(days),
        "carrington": carrington_phase(days),
        "schwabe": schwabe_phase(days),
        "tropical": tropical_phase(days),
        "anomalistique": fixed_period_phase(days, 27.55455, _ANCHOR),
        "draconitique": fixed_period_phase(days, 27.21222, _ANCHOR),
        "saros": fixed_period_phase(days, 6585.3211, _ANCHOR),
        "harmo": harmo_phi,
    }

    return {
        "variable": variable,
        "n": n,
        "dates": dates,
        "draw_count": length,
        "warmup": work_start,
        "work_start": work_start,
        "sampling": sampling,
        "static": static,
        "target": target,
        "past": past,
        "past_channels": past_meta,
        "known": known,
        "known_channels": known_meta,
        "phases": phases,
        "occupancy": occupancy,
        "notes": notes_for(variable),
        "groups": _groups(known_meta),
    }


def _groups(channels: Sequence[Channel]) -> list[dict[str, Any]]:
    buckets: dict[str, list[int]] = {}
    labels: dict[str, str] = {}
    for index, channel in enumerate(channels):
        key = channel.group or channel.id
        buckets.setdefault(key, []).append(index)
        labels.setdefault(key, channel.label.replace(" sin", "").replace(" cos", ""))
    return [
        {"id": key, "label": labels[key], "columns": cols}
        for key, cols in buckets.items()
    ]


def registry_payload(panel: dict[str, Any]) -> dict[str, Any]:
    """Vue JSON du registre : métadonnées et phase au dernier tirage, pas les matrices."""
    last = max(panel["draw_count"] - 1, 0)
    channels = []
    for channel in panel["known_channels"] + panel["past_channels"]:
        row = channel.as_dict()
        if channel.role == "known" and channel.id.endswith(":sin"):
            group = channel.group or ""
            phase = panel["phases"].get(group)
            row["phase"] = round(float(phase[last]), 5) if phase is not None else None
        else:
            row["phase"] = None
        channels.append(row)
    static_rows = [
        {
            "id": f"static:{key}",
            "label": key,
            "module": "analyse",
            "kind": "series",
            "role": "static",
            "value": value,
        }
        for key, value in panel["static"].items()
    ]
    return {
        "ok": True,
        "variable": panel["variable"],
        "n": panel["n"],
        "draw_count": panel["draw_count"],
        "from_date": panel["dates"][0] if panel["dates"] else None,
        "to_date": panel["dates"][-1] if panel["dates"] else None,
        "channels": channels,
        "static": static_rows,
        "groups": panel["groups"],
        "notes": panel["notes"],
        "sampling": {
            "draws_per_year": panel["sampling"].get("draws_per_year"),
            "span_days": panel["sampling"].get("span_days"),
        },
    }


def panel_payload(panel: dict[str, Any], *, max_points: int = 240) -> dict[str, Any]:
    """Séries affichables : cible, phases, occupation. La matrice complète reste côté fit."""
    start = int(panel["work_start"])
    dates = panel["dates"][start:]
    target = panel["target"][start:]
    step = max(1, int(np.ceil(len(dates) / max_points))) if dates else 1
    idx = list(range(0, len(dates), step))

    def take(values: np.ndarray) -> list[float | None]:
        return [round(float(values[i]), 5) for i in idx]

    past_ids = [channel.id for channel in panel["past_channels"]]

    def past_series(channel_id: str) -> list[float | None]:
        index = past_ids.index(channel_id)
        return take(panel["past"][start:, index])

    series = {
        "target": take(target),
        "occupancy": take(panel["occupancy"][start:]),
        "activity": past_series("chartisme:activity"),
        "morpho": past_series("morpho:gap_std"),
        "relief": past_series("relief:centroid"),
        "residual": past_series("pronostic:z"),
    }
    for name, phase in panel["phases"].items():
        series[name] = take(np.asarray(phase)[start:])
    return {
        "ok": True,
        "variable": panel["variable"],
        "n": panel["n"],
        "dates": [dates[i] for i in idx],
        "series": series,
        "static": panel["static"],
        "notes": panel["notes"],
        "draw_count": len(dates),
        "channel_count": {
            "known": len(panel["known_channels"]),
            "past": len(panel["past_channels"]),
        },
    }
