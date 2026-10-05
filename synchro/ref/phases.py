"""Phases locales des cycles physiques, sans téléchargement.

Les séries mesurées (F10.7, Kp, rayons cosmiques, ENSO, QBO) ne sont pas
des horloges : une fraction 0–1 inventée ne dirait pas leur valeur du jour.
"""

from __future__ import annotations

import math
from datetime import date, datetime
from typing import Any, Callable

from synchro.ref.cycles import (
    _CARRINGTON_DAYS,
    _CARRINGTON_JD0,
    _NEW_MOON_JD,
    _SCHWABE_MINIMA,
    _SYNODIC_DAYS,
    julian_day,
    schwabe,
)
from synchro.ref.seasons import sun_longitude

_J2000 = 2451545.0
_ANOMALISTIC_DAYS = 27.554549878
_DRACONIC_DAYS = 27.212220817
_TROPICAL_DAYS = 365.242189
_NODAL_DAYS = 6798.383
_SAROS_DAYS = 6585.3211
_METON_DAYS = 6939.688
_CHANDLER_DAYS = 433.0
_GLEISSBERG_DAYS = 88.0 * _TROPICAL_DAYS
_FORTNIGHT_DAYS = _SYNODIC_DAYS / 2.0

# Éclipse du 8 avril 2024 : nouvelle lune au nœud, près du périgée.
_ECLIPSE_JD = 2460408.5
# Minimum pair de décembre 2008 : début d'un cycle de Hale (24 + 25).
_HALE_START = date(2008, 12, 1)
_HALE_YEARS = 22.0
# Enveloppe conventionnelle, pas un minimum observé.
_GLEISSBERG_JD0 = 2431092.5  # 1944-01-01
_CHANDLER_JD0 = 2458849.5  # 2020-01-01, zéro de phase arbitraire


def _day(value: date | datetime | str) -> date:
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    return date.fromisoformat(str(value)[:10])


def _wrap(jd: float, origin: float, period: float) -> float:
    return ((jd - origin) % period) / period


def _frac_deg(degrees: float) -> float:
    return (degrees % 360.0) / 360.0


def _sun_days(day: date) -> float:
    return julian_day(day) - _J2000


def synodic_fraction(day: date) -> float:
    return _wrap(julian_day(day), _NEW_MOON_JD, _SYNODIC_DAYS)


def anomalistic_fraction(day: date) -> float:
    """Anomalie moyenne. 0 = périgée, 0,5 = apogée."""
    anomaly = 134.9633964 + 13.0649929509 * _sun_days(day)
    return _frac_deg(anomaly)


def draconic_fraction(day: date) -> float:
    """Argument de latitude. 0 = nœud ascendant, 0,5 = nœud descendant."""
    argument = 93.2720950 + 13.2293500610 * _sun_days(day)
    return _frac_deg(argument)


def fortnight_fraction(day: date) -> float:
    """Vive-eau aux nouvelles et pleines lunes (0), morte-eau aux quartiers (0,5)."""
    return (synodic_fraction(day) * 2.0) % 1.0


def tropical_fraction(day: date) -> float:
    """Longitude écliptique du Soleil. 0 = équinoxe de mars."""
    return _frac_deg(sun_longitude(julian_day(day)))


def nodal_fraction(day: date) -> float:
    """Longitude moyenne du nœud ascendant, en marche arrière."""
    node = 125.04452 - 0.05295376 * _sun_days(day)
    return _frac_deg(node)


def saros_fraction(day: date) -> float:
    return _wrap(julian_day(day), _ECLIPSE_JD, _SAROS_DAYS)


def meton_fraction(day: date) -> float:
    return _wrap(julian_day(day), _NEW_MOON_JD, _METON_DAYS)


def carrington_fraction(day: date) -> float:
    elapsed = (julian_day(day) - _CARRINGTON_JD0) / _CARRINGTON_DAYS
    return elapsed - math.floor(elapsed)


def schwabe_fraction(day: date) -> float:
    state = schwabe(day)
    fraction = state.get("fraction")
    if fraction is None:
        return 0.0
    return float(fraction) % 1.0


def hale_fraction(day: date) -> float:
    """Deux cycles de Schwabe. 0 au minimum pair de décembre 2008."""
    span = _HALE_YEARS * _TROPICAL_DAYS
    return _wrap(julian_day(day), julian_day(_HALE_START), span)


def gleissberg_fraction(day: date) -> float:
    return _wrap(julian_day(day), _GLEISSBERG_JD0, _GLEISSBERG_DAYS)


def chandler_fraction(day: date) -> float:
    return _wrap(julian_day(day), _CHANDLER_JD0, _CHANDLER_DAYS)


PhaseFn = Callable[[date], float]

PHASES: dict[str, PhaseFn] = {
    "lunaire": synodic_fraction,
    "anomalistique": anomalistic_fraction,
    "draconitique": draconic_fraction,
    "vive-eau": fortnight_fraction,
    "tropique": tropical_fraction,
    "carrington": carrington_fraction,
    "schwabe": schwabe_fraction,
    "hale": hale_fraction,
    "nodal": nodal_fraction,
    "saros": saros_fraction,
    "meton": meton_fraction,
    "gleissberg": gleissberg_fraction,
    "chandler": chandler_fraction,
}

PHASE_META: dict[str, dict[str, str]] = {
    "lunaire": {"label": "Lunaire", "period": "29,53 j", "zero": "Nouvelle lune"},
    "anomalistique": {"label": "Anomalistique", "period": "27,55 j", "zero": "Périgée"},
    "draconitique": {"label": "Draconitique", "period": "27,21 j", "zero": "Nœud ascendant"},
    "vive-eau": {"label": "Vive-eau", "period": "14,77 j", "zero": "Nouvelle ou pleine lune"},
    "tropique": {"label": "Année tropique", "period": "365,24 j", "zero": "Équinoxe de mars"},
    "carrington": {"label": "Carrington", "period": "27,28 j", "zero": "Début de rotation"},
    "schwabe": {"label": "Schwabe", "period": "~11 ans", "zero": "Minimum de taches"},
    "hale": {"label": "Hale", "period": "~22 ans", "zero": "Minimum pair (2008)"},
    "nodal": {"label": "Nodal", "period": "18,6 ans", "zero": "Longitude conventionnelle"},
    "saros": {"label": "Saros", "period": "18,03 ans", "zero": "Éclipse du 8 avril 2024"},
    "meton": {"label": "Méton", "period": "19 ans", "zero": "Nouvelle lune de janvier 2000"},
    "gleissberg": {"label": "Gleissberg", "period": "~88 ans", "zero": "Repère 1944, enveloppe"},
    "chandler": {"label": "Chandler", "period": "433 j", "zero": "Repère 2020-01-01"},
}

MEASURED = (
    {
        "id": "f107",
        "label": "Flux F10.7",
        "period": "quotidien",
        "why": "Proxy EUV. Une phase locale ne remplace pas le flux du jour (Penticton / NOAA).",
    },
    {
        "id": "kp",
        "label": "Kp / Ap / Dst",
        "period": "~27 j",
        "why": "Indice mesuré. La récurrence de Carrington se voit dans la série, pas dans une horloge.",
    },
    {
        "id": "cosmiques",
        "label": "Rayons cosmiques",
        "period": "Schwabe + Forbush",
        "why": "Comptage des moniteurs à neutrons. Anti-corrélé au cycle solaire, avec des baisses de quelques jours.",
    },
    {
        "id": "enso",
        "label": "ENSO",
        "period": "2–7 ans",
        "why": "Indice océanique Niño 3.4. Ce n'est pas une période fixe.",
    },
    {
        "id": "qbo",
        "label": "QBO",
        "period": "~28 mois",
        "why": "Vent zonal stratosphérique. La quasi-période se lit sur la série de Berlin.",
    },
)


def phase(cycle_id: str, day: date | datetime | str) -> float:
    fn = PHASES.get(cycle_id)
    if fn is None:
        raise ValueError(f"Cycle sans phase locale : {cycle_id}")
    return round(fn(_day(day)), 5)


def phase_catalog() -> dict[str, Any]:
    items = []
    for cycle_id, meta in PHASE_META.items():
        items.append({"id": cycle_id, "local": True, **meta})
    for item in MEASURED:
        items.append({**item, "local": False, "zero": "Série mesurée"})
    return {
        "ok": True,
        "local": list(PHASE_META),
        "measured": [item["id"] for item in MEASURED],
        "items": items,
        "schwabe_minima": [minimum.isoformat() for minimum, _number in _SCHWABE_MINIMA],
    }
