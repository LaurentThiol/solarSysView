"""Canaux de cycle : une phase par tirage, quel que soit le module source.

Une horloge connue (Réf, raie Harmo) entre en futur connu. Une occupation
chartiste ou une série sœur entre en passé observé. La phase est dans
[0, 1) ; le couple sin/cos évite le saut 0/1.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from datetime import date, datetime
from typing import Any, Sequence

import numpy as np

from synchro.analysis.common import as_date
from synchro.analysis.tech import activity_from_close
from synchro.analysis.variables import VARIABLE_NAMES, series as extract_series
from synchro.harmo.series import sampling_stats
from synchro.harmo.util import freq_pack
from synchro.ref.cycles import _CARRINGTON_DAYS, _SYNODIC_DAYS, carrington, lunar_state, schwabe
from synchro.short_cycle import SHORT_CYCLE_MAX, SHORT_CYCLE_MIN, short_residual

# Agrégats libres : les 18 courbes sans delay/hit.
AGGREGATE_NAMES: tuple[str, ...] = tuple(
    name for name in VARIABLE_NAMES if name not in {"delay", "hit", "star_delay", "star_hit"}
)

_TROPICAL_DAYS = 365.2425
_SAROS_DAYS = 6585.3211
_ANOMALISTIC_DAYS = 27.55455
_DRACONIC_DAYS = 27.21222
_MAX_CYCLE = 120

SAW_VARIABLES = {"delay", "star_delay", "hit", "star_hit"}


@dataclass(frozen=True)
class Channel:
    id: str
    label: str
    module: str
    kind: str
    role: str
    period_days: float | None = None
    period_draws: float | None = None
    group: str | None = None
    note: str | None = None

    def as_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "label": self.label,
            "module": self.module,
            "kind": self.kind,
            "role": self.role,
            "period_days": _num(self.period_days),
            "period_draws": _num(self.period_draws),
            "group": self.group,
            "note": self.note,
        }


def _num(value: float | None) -> float | None:
    if value is None:
        return None
    out = float(value)
    if not math.isfinite(out):
        return None
    return round(out, 5)


def _dates(draws: Sequence[dict[str, Any]]) -> list[date]:
    return [as_date(row["draw_date"]) for row in draws]


def _wrap(values: np.ndarray) -> np.ndarray:
    return np.mod(values.astype(float), 1.0)


def sincos(phase: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    angle = 2.0 * math.pi * _wrap(np.asarray(phase, dtype=float))
    return np.sin(angle), np.cos(angle)


def lunar_phase(days: Sequence[date]) -> np.ndarray:
    return np.array([lunar_state(day)["fraction"] for day in days], dtype=float)


def carrington_phase(days: Sequence[date]) -> np.ndarray:
    return np.array([carrington(day)["fraction"] for day in days], dtype=float)


def schwabe_phase(days: Sequence[date]) -> np.ndarray:
    out = []
    for day in days:
        fraction = schwabe(day).get("fraction")
        out.append(0.0 if fraction is None else float(fraction))
    return _wrap(np.array(out, dtype=float))


def tropical_phase(days: Sequence[date]) -> np.ndarray:
    out = []
    for day in days:
        start = date(day.year, 1, 1)
        out.append((day - start).days / _TROPICAL_DAYS)
    return _wrap(np.array(out, dtype=float))


def fixed_period_phase(days: Sequence[date], period_days: float, anchor: date) -> np.ndarray:
    out = np.array([(day - anchor).days / period_days for day in days], dtype=float)
    return _wrap(out)


def dominant_period(values: Sequence[float], draws_per_year: float) -> dict[str, Any]:
    """Raie la plus forte d'une FFT sur l'index de tirage, hors continu.

    Période tenue fixe ensuite : la phase Harmo est une horloge, pas une
    crête qui se réestime à chaque pas.
    """
    x = np.asarray(values, dtype=float)
    n = int(x.size)
    if n < 16:
        return {"period_draws": None, "cycles_per_draw": None, "cycles_per_year": None}
    centered = x - float(np.mean(x))
    spec = np.abs(np.fft.rfft(centered))
    spec[0] = 0.0
    if spec.size < 3 or float(np.max(spec)) <= 0:
        return {"period_draws": None, "cycles_per_draw": None, "cycles_per_year": None}
    k = int(np.argmax(spec))
    freq = k / n
    packed = freq_pack(freq, draws_per_year)
    return packed


def index_phase(n: int, period_draws: float | None) -> np.ndarray:
    if not period_draws or period_draws <= 1:
        return np.zeros(n, dtype=float)
    idx = np.arange(n, dtype=float)
    return _wrap(idx / float(period_draws))


def _local_extrema(values: np.ndarray) -> list[int]:
    if values.size < 3:
        return []
    pivots = [0]
    for i in range(1, values.size - 1):
        left = values[i] - values[i - 1]
        right = values[i + 1] - values[i]
        if left == 0 or right == 0:
            continue
        if left * right < 0:
            pivots.append(i)
    if pivots[-1] != values.size - 1:
        pivots.append(int(values.size - 1))
    return pivots


def _arch_bands(
    values: Sequence[float],
    low: int,
    high: int,
) -> tuple[np.ndarray, float | None, np.ndarray, np.ndarray]:
    """Occupation, période médiane, hauteur et phase des arches dont la durée est dans [low, high]."""
    x = np.asarray(values, dtype=float)
    n = int(x.size)
    occupied = np.zeros(n, dtype=float)
    heights = np.zeros(n, dtype=float)
    phase = np.zeros(n, dtype=float)
    pivots = _local_extrema(x)
    lengths: list[float] = []
    for a, b in zip(pivots, pivots[1:]):
        span = b - a
        if span < low or span > high:
            continue
        segment = x[a : b + 1]
        height = float(segment.max() - segment.min()) if segment.size else 0.0
        occupied[a : b + 1] = 1.0
        heights[a : b + 1] = height
        if span > 0:
            slots = np.arange(a, b + 1, dtype=float)
            phase[a : b + 1] = (slots - a) / float(span)
        lengths.append(float(span))
    period = float(np.median(lengths)) if lengths else None
    return occupied, period, heights, phase


def figure_occupancy(values: Sequence[float]) -> tuple[np.ndarray, float | None]:
    """Occupation des arches longues : durée de 9 à MAX_CYCLE tirages.

    Les arches de 4 à 8 tirages sont le canal court. Les mélanger ici
    tirait la médiane vers une période qui n'est ni l'une ni l'autre.
    """
    occupied, period, _heights, _phase = _arch_bands(values, SHORT_CYCLE_MAX + 1, _MAX_CYCLE)
    return occupied, period


def short_cycle_band(
    values: Sequence[float],
) -> tuple[np.ndarray, float | None, np.ndarray, np.ndarray]:
    """Occupation, période, étendue et phase des arches de 4 à 8 tirages.

    La phase vaut 0 au pivot de départ et 1 au pivot suivant. Hors arche
    courte, occupation, étendue et phase restent à 0.
    """
    return _arch_bands(values, SHORT_CYCLE_MIN, SHORT_CYCLE_MAX)


def morpho_gap_span(draws: Sequence[dict[str, Any]]) -> np.ndarray:
    """Étendue des quatre trous g1–g4 : max − min, la forme du glyphe."""
    gaps = np.column_stack(
        [
            np.asarray(extract_series(list(draws), name)["values"], dtype=float)
            for name in ("g1", "g2", "g3", "g4")
        ]
    )
    return gaps.max(axis=1) - gaps.min(axis=1)


def relief_centroid(draws: Sequence[dict[str, Any]]) -> np.ndarray:
    return np.asarray(extract_series(list(draws), "centroid")["values"], dtype=float)


def causal_zscore(values: Sequence[float], period: int = SHORT_CYCLE_MAX) -> np.ndarray:
    """Résidu court. Le nom reste pour les appelants ; l'échelle est l'étendue.

    `(x − médiane des `period` tirages précédents) / (étendue / 2)`.
    Étendue nulle : résidu nul. À t, rien après t.
    """
    return short_residual(values, span=period)


def clock_channels() -> list[Channel]:
    return [
        Channel(
            "weekday",
            "Mardi / vendredi",
            "analyse",
            "calendar",
            "known",
            period_days=3.5,
            group="weekday",
            note="1 mardi, 0 vendredi. Connu sans le tirage.",
        ),
        Channel(
            "lunar",
            "Lune synodique",
            "ref",
            "physical",
            "known",
            period_days=_SYNODIC_DAYS,
            group="lunar",
            note="Fraction du mois synodique (Réf).",
        ),
        Channel(
            "carrington",
            "Carrington",
            "ref",
            "physical",
            "known",
            period_days=_CARRINGTON_DAYS,
            group="carrington",
            note="Fraction de la rotation solaire.",
        ),
        Channel(
            "schwabe",
            "Schwabe",
            "ref",
            "physical",
            "known",
            period_days=_TROPICAL_DAYS * 11.0,
            group="schwabe",
            note="Place dans le cycle de taches. Lent face à une fenêtre courte.",
        ),
        Channel(
            "tropical",
            "Année tropique",
            "ref",
            "physical",
            "known",
            period_days=_TROPICAL_DAYS,
            group="tropical",
            note="Saison, jour de l'année.",
        ),
        Channel(
            "anomalistique",
            "Mois anomalistique",
            "ref",
            "physical",
            "known",
            period_days=_ANOMALISTIC_DAYS,
            group="anomalistique",
            note="Candidat Réf : période connue, phase posée sans série téléchargée.",
        ),
        Channel(
            "draconitique",
            "Mois draconitique",
            "ref",
            "physical",
            "known",
            period_days=_DRACONIC_DAYS,
            group="draconitique",
            note="Candidat Réf.",
        ),
        Channel(
            "saros",
            "Saros",
            "ref",
            "physical",
            "known",
            period_days=_SAROS_DAYS,
            group="saros",
            note="Candidat Réf, très lent.",
        ),
    ]


def series_channels(target: str) -> list[Channel]:
    rows = [
        Channel(
            f"series:{name}",
            name,
            "analyse",
            "series",
            "past",
            group="series",
            note="Série sœur au même index de tirage." if name != target else "Cible, lue en passé causal.",
        )
        for name in AGGREGATE_NAMES
    ]
    rows.extend(
        [
            Channel(
                "chartisme:activity",
                "Activité",
                "chartisme",
                "geometric",
                "past",
                group="chartisme",
                note="|Δ| de la cible. Passé observé, pas une horloge.",
            ),
            Channel(
                "chartisme:occupancy",
                "Occupation de figure",
                "chartisme",
                "geometric",
                "past",
                group="chartisme",
                note="1 si le tirage est dans une arche de 9 à 120 tirages. Plafond de lecture, pas une fréquence.",
            ),
            Channel(
                "chartisme:court",
                "Cycle court",
                "chartisme",
                "geometric",
                "past",
                group="chartisme",
                note="1 si l'arche de pivots dure de 4 à 8 tirages.",
            ),
            Channel(
                "chartisme:etendue",
                "Étendue courte",
                "chartisme",
                "geometric",
                "past",
                group="chartisme",
                note="max − min de l'arche courte qui contient le tirage. 0 hors de cette arche.",
            ),
            Channel(
                "morpho:gap_span",
                "Étendue des trous",
                "morpho",
                "series",
                "past",
                group="morpho",
                note="max − min de g1–g4 : forme du glyphe.",
            ),
            Channel(
                "relief:centroid",
                "Centroïde n1→n5",
                "relief",
                "series",
                "past",
                group="relief",
                note="Hauteur moyenne du profil.",
            ),
            Channel(
                "pronostic:z",
                "Résidu causal",
                "pronostic",
                "series",
                "past",
                group="pronostic",
                note="Écart de la cible à la médiane des 8 tirages précédents, divisé par la demi-étendue. Étendue nulle : résidu nul.",
            ),
        ]
    )
    return rows


def short_clock_channel(period_draws: float | None) -> Channel:
    return Channel(
        "harmo:court",
        "Cycle court",
        "harmo",
        "spectral",
        "known",
        period_draws=period_draws,
        group="harmo_court",
        note="Phase de l'arche de 4 à 8 tirages. Période = médiane de ces arches. La raie dominante reste le canal lent.",
    )


def harmo_channel(period_draws: float | None, period_days: float | None) -> Channel:
    return Channel(
        "harmo:dominant",
        "Raie Harmo",
        "harmo",
        "spectral",
        "known",
        period_days=period_days,
        period_draws=period_draws,
        group="harmo",
        note="Phase de la raie FFT dominante, période tenue fixe. Futur connu une fois la période estimée sur le passé.",
    )


def static_vector(name: str, n: int | None, star_pool: int | None) -> dict[str, float]:
    family = float(AGGREGATE_NAMES.index(name)) if name in AGGREGATE_NAMES else float(len(AGGREGATE_NAMES))
    bounded = 1.0 if name in {"n1", "n5", "e1", "e2", "delay", "star_delay"} else 0.0
    saw = 1.0 if name in SAW_VARIABLES else 0.0
    return {
        "family": family,
        "index": float(n or 0),
        "bounded": bounded,
        "saw": saw,
        "star_pool": float(star_pool or 12) / 12.0,
    }


def notes_for(variable: str) -> list[dict[str, str]]:
    notes = [
        {
            "id": "independence",
            "level": "info",
            "text": (
                "Les tirages sont indépendants. Une horloge sélectionnée décrit "
                "le tracé, elle ne propose pas de grille."
            ),
        }
    ]
    if variable in {"delay", "star_delay"}:
        notes.append(
            {
                "id": "delay_saw",
                "level": "warn",
                "text": (
                    "La série retard est un reset en dents de scie : ses harmoniques "
                    "sont structurelles. Ce n'est pas une vibration."
                ),
            }
        )
    if variable in {"hit", "star_hit"}:
        notes.append(
            {
                "id": "hit_pulse",
                "level": "info",
                "text": "Présence = impulsions 0/1. Une raie y est souvent celle du rythme de sortie.",
            }
        )
    return notes


def _iso(day: date | datetime) -> str:
    if isinstance(day, datetime):
        return day.date().isoformat()
    return day.isoformat()
