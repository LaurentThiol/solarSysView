"""Construction du signal : index de tirage vs calendrier."""

from __future__ import annotations

from typing import Any

import numpy as np

from synchro.analysis.common import as_date
from synchro.analysis.variables import VARIABLE_NAMES, series
from synchro.harmo.util import DISCLAIMER, MIN_SAMPLES, fnum, flist

NEEDS_N = {"delay", "hit", "star_delay", "star_hit"}
DEFAULT_BALL = 7
DEFAULT_STAR = 1


def default_index(variable: str, n: int | None) -> int | None:
    if variable not in NEEDS_N:
        return None
    if n is not None:
        return int(n)
    return DEFAULT_STAR if variable.startswith("star_") else DEFAULT_BALL


def notes_for(variable: str, sampling: dict[str, Any]) -> list[dict[str, str]]:
    notes: list[dict[str, str]] = [
        {
            "id": "independence",
            "level": "info",
            "text": DISCLAIMER,
        },
        {
            "id": "units",
            "level": "info",
            "text": (
                "L’axe fréquentiel est en cycles/tirage "
                "(et cycles/an via le calendrier). Le réseau est "
                "un peigne de raies verrouillé sur le calendrier."
            ),
        },
    ]
    deltas = sampling.get("delta_days") or []
    if len(deltas) >= 2:
        notes.append(
            {
                "id": "uneven",
                "level": "info",
                "text": (
                    "Mardi/vendredi : l’espacement n’est pas uniforme "
                    f"({', '.join(str(d) for d in deltas)} jours). Une FFT sur "
                    "l’index de tirage ignore ça ; Lomb-Scargle lit les dates."
                ),
            }
        )
    if sampling.get("week_near_nyquist"):
        notes.append(
            {
                "id": "nyquist_week",
                "level": "warn",
                "text": (
                    "Deux tirages par semaine : le cycle hebdomadaire est au "
                    "voisinage de Nyquist calendaire, donc mal observé."
                ),
            }
        )
    if variable in {"delay", "star_delay"}:
        notes.append(
            {
                "id": "delay_saw",
                "level": "warn",
                "text": (
                    "La série retard est un reset en dents de scie : elle "
                    "porte des harmoniques par construction. Ce n’est pas "
                    "une vibration mécanique."
                ),
            }
        )
    if variable in {"hit", "star_hit"}:
        notes.append(
            {
                "id": "hit_pulse",
                "level": "info",
                "text": (
                    "Présence = train d’impulsions 0/1, naturellement "
                    "« percussif » pour HPSS / l’enveloppe."
                ),
            }
        )
    return notes


def sampling_stats(dates: list[str]) -> dict[str, Any]:
    if not dates:
        return {
            "n": 0,
            "span_days": 0.0,
            "draws_per_year": 104.0,
            "delta_days": [],
            "nyquist_cycles_per_draw": 0.5,
            "nyquist_cycles_per_year": 52.0,
            "week_near_nyquist": True,
            "t_days": [],
        }
    parsed = [as_date(d) for d in dates]
    t0 = parsed[0]
    t_days = np.array([(d - t0).days for d in parsed], dtype=float)
    span = float(t_days[-1]) if t_days.size else 0.0
    deltas = sorted({int(x) for x in np.diff(t_days) if x > 0})
    years = span / 365.25 if span > 0 else 0.0
    dpy = (len(dates) - 1) / years if years > 0 else 104.0
    # Deux tirages / semaine ⇒ Nyquist calendaire ≈ 1/semaine.
    week_near = bool(dpy >= 90)
    return {
        "n": len(dates),
        "span_days": fnum(span),
        "draws_per_year": fnum(dpy),
        "delta_days": deltas,
        "nyquist_cycles_per_draw": 0.5,
        "nyquist_cycles_per_year": fnum(0.5 * dpy),
        "week_near_nyquist": week_near,
        "t_days": flist(t_days),
    }


def extract_values(
    draws: list[dict[str, Any]],
    variable: str,
    n: int | None,
) -> tuple[np.ndarray, list[str]]:
    idx = default_index(variable, n)
    payload = series(draws, variable, n=idx)
    values = np.asarray(payload["values"], dtype=float)
    dates = [str(p["date"]) for p in payload["points"]]
    return values, dates


def build_signal(
    work: list[dict[str, Any]],
    *,
    variable: str = "sum",
    n: int | None = None,
    with_warmup: list[dict[str, Any]] | None = None,
    warmup_count: int = 0,
) -> dict[str, Any]:
    """Série de travail. delay/hit sont calculés avec le warmup, puis coupés."""
    if variable not in VARIABLE_NAMES:
        raise ValueError(f"Variable inconnue: {variable}")
    idx = default_index(variable, n)
    source = with_warmup if with_warmup else work
    values_full, dates_full = extract_values(source, variable, idx)
    warm = max(0, int(warmup_count))
    if with_warmup is not None and warm > 0 and len(values_full) >= warm:
        values = values_full[warm:]
        dates = dates_full[warm:]
    else:
        values, dates = extract_values(work, variable, idx)
    sampling = sampling_stats(dates)
    t_days = np.asarray(sampling["t_days"], dtype=float)
    return {
        "variable": variable,
        "n": idx,
        "x": values,
        "dates": dates,
        "t_days": t_days,
        "index": np.arange(len(values), dtype=float),
        "draw_count": int(values.size),
        "sampling": sampling,
        "notes": notes_for(variable, sampling),
        "too_short": int(values.size) < MIN_SAMPLES,
        "min_samples": MIN_SAMPLES,
        "from_date": dates[0] if dates else None,
        "to_date": dates[-1] if dates else None,
    }
