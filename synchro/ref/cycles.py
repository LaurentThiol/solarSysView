"""Cycles physiques calculés sans réseau.

Le lunaire suit le mois synodique moyen (Meeus). Le solaire local donne le
numéro de rotation de Carrington et la place dans le cycle de Schwabe. Les
flux GOES passent par SunPy, à part, parce qu'ils demandent un téléchargement.
"""

from __future__ import annotations

import math
from datetime import date, datetime, timedelta, timezone
from typing import Any

# Nouvelle lune moyenne de janvier 2000 (Meeus, ch. 49).
_NEW_MOON_JD = 2451550.09766
_SYNODIC_DAYS = 29.530588861

# Jour civil du début de la rotation n°1 (9 novembre 1853).
# L'instant officiel est 21:38 UT le même jour ; on ancre ici minuit UT
# pour qu'une date sans heure tombe dans la rotation annoncée.
# La période est une moyenne : les débuts observés dérivent de quelques jours.
_CARRINGTON_JD0 = 2398166.5
_CARRINGTON_DAYS = 27.2753

# Minima lissés SILSO (mois du minimum, cycle qui commence).
_SCHWABE_MINIMA: tuple[tuple[date, int], ...] = (
    (date(1996, 8, 1), 23),
    (date(2008, 12, 1), 24),
    (date(2019, 12, 1), 25),
)
_SCHWABE_MEAN_YEARS = 11.0

_PHASE_BANDS: tuple[tuple[float, str, str], ...] = (
    (0.03, "nouvelle", "Nouvelle lune"),
    (0.22, "croissant", "Premier croissant"),
    (0.28, "quartier", "Premier quartier"),
    (0.47, "gibbeuse", "Gibbeuse croissante"),
    (0.53, "pleine", "Pleine lune"),
    (0.72, "gibbeuse", "Gibbeuse décroissante"),
    (0.78, "quartier", "Dernier quartier"),
    (0.97, "croissant", "Dernier croissant"),
    (1.01, "nouvelle", "Nouvelle lune"),
)


def julian_day(day: date, hour: float = 12.0) -> float:
    """Jour julien à l'heure UTC donnée (défaut : midi)."""
    year, month = day.year, day.month
    day_fraction = day.day + hour / 24.0
    if month <= 2:
        year -= 1
        month += 12
    century = year // 100
    gregorian = 2 - century + century // 4
    return (
        math.floor(365.25 * (year + 4716))
        + math.floor(30.6001 * (month + 1))
        + day_fraction
        + gregorian
        - 1524.5
    )


def _parse_day(value: date | datetime | str | None) -> date:
    if value is None:
        return datetime.now(timezone.utc).date()
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    text = str(value).strip()
    if not text:
        return datetime.now(timezone.utc).date()
    return date.fromisoformat(text[:10])


def _phase_name(fraction: float) -> tuple[str, str]:
    wrapped = fraction % 1.0
    for limit, code, label in _PHASE_BANDS:
        if wrapped < limit:
            return code, label
    return "nouvelle", "Nouvelle lune"


def _illumination(fraction: float) -> float:
    return (1.0 - math.cos(2.0 * math.pi * (fraction % 1.0))) / 2.0


def lunar_state(day: date | datetime | str | None = None) -> dict[str, Any]:
    """Âge, fraction synodique et éclairement pour une date UTC."""
    when = _parse_day(day)
    jd = julian_day(when)
    age = (jd - _NEW_MOON_JD) % _SYNODIC_DAYS
    fraction = age / _SYNODIC_DAYS
    code, label = _phase_name(fraction)
    quarters = {
        "nouvelle": (1.0 - fraction) * _SYNODIC_DAYS,
        "premier_quartier": ((0.25 - fraction) % 1.0) * _SYNODIC_DAYS,
        "pleine": ((0.5 - fraction) % 1.0) * _SYNODIC_DAYS,
        "dernier_quartier": ((0.75 - fraction) % 1.0) * _SYNODIC_DAYS,
    }
    upcoming = {
        name: (when + timedelta(days=delta)).isoformat()
        for name, delta in quarters.items()
    }
    return {
        "date": when.isoformat(),
        "julian_day": round(jd, 5),
        "age_days": round(age, 3),
        "synodic_days": _SYNODIC_DAYS,
        "fraction": round(fraction, 5),
        "illumination": round(_illumination(fraction), 4),
        "phase": code,
        "phase_label": label,
        "next": upcoming,
    }


def lunar_month(day: date | datetime | str | None = None) -> list[dict[str, Any]]:
    """Un jour par date du mois civil qui contient `day`."""
    when = _parse_day(day)
    cursor = when.replace(day=1)
    if cursor.month == 12:
        end = date(cursor.year + 1, 1, 1)
    else:
        end = date(cursor.year, cursor.month + 1, 1)
    rows: list[dict[str, Any]] = []
    while cursor < end:
        rows.append(lunar_state(cursor))
        cursor += timedelta(days=1)
    return rows


def lunar_report(day: date | datetime | str | None = None) -> dict[str, Any]:
    when = _parse_day(day)
    return {
        "ok": True,
        "cycle": "lunaire",
        "title": "Cycle lunaire synodique",
        "period_days": _SYNODIC_DAYS,
        "note": (
            "Mois synodique moyen. L'âge est compté depuis la nouvelle lune. "
            "Ce n'est pas une prévision de tirage."
        ),
        "today": lunar_state(when),
        "month": lunar_month(when),
    }


def carrington(day: date | datetime | str | None = None) -> dict[str, Any]:
    """Numéro de rotation de Carrington et fraction dans la rotation."""
    when = _parse_day(day)
    jd = julian_day(when)
    elapsed = (jd - _CARRINGTON_JD0) / _CARRINGTON_DAYS
    number = math.floor(elapsed) + 1
    fraction = elapsed - math.floor(elapsed)
    start = when - timedelta(days=fraction * _CARRINGTON_DAYS)
    end = start + timedelta(days=_CARRINGTON_DAYS)
    return {
        "date": when.isoformat(),
        "number": int(number),
        "fraction": round(fraction, 5),
        "period_days": _CARRINGTON_DAYS,
        "rotation_start": start.isoformat(),
        "rotation_end": end.isoformat(),
    }


def schwabe(day: date | datetime | str | None = None) -> dict[str, Any]:
    """Place dans le cycle de taches (Schwabe) à partir des minima SILSO."""
    when = _parse_day(day)
    started: tuple[date, int] | None = None
    following: tuple[date, int] | None = None
    for minimum, number in _SCHWABE_MINIMA:
        if minimum <= when:
            started = (minimum, number)
        elif following is None:
            following = (minimum, number)
    if started is None:
        return {
            "date": when.isoformat(),
            "cycle": None,
            "fraction": None,
            "note": "Avant le minimum de 1996 couvert par cette table.",
        }
    start, number = started
    if following is not None:
        end = following[0]
        span = (end - start).days
        fraction = (when - start).days / span if span else 0.0
        bounded = True
    else:
        span_days = _SCHWABE_MEAN_YEARS * 365.2425
        fraction = (when - start).days / span_days
        end = start + timedelta(days=span_days)
        bounded = False
    return {
        "date": when.isoformat(),
        "cycle": number,
        "minimum": start.isoformat(),
        "next_minimum_estimate": end.isoformat(),
        "fraction": round(fraction, 4),
        "bounded_by_observed_minimum": bounded,
        "mean_years": _SCHWABE_MEAN_YEARS,
    }


def sunpy_status() -> dict[str, Any]:
    try:
        import sunpy
    except ImportError:
        return {
            "available": False,
            "package": "sunpy",
            "hint": "pip install -r requirements-ref.txt",
        }
    version = getattr(sunpy, "__version__", None)
    return {"available": True, "package": "sunpy", "version": version}


def solar_report(day: date | datetime | str | None = None) -> dict[str, Any]:
    when = _parse_day(day)
    return {
        "ok": True,
        "cycle": "solaire",
        "title": "Cycle solaire",
        "note": (
            "Carrington décrit la rotation des régions actives (~27,3 j). "
            "Schwabe décrit le cycle des taches (~11 ans). "
            "Les flux X GOES et les listes d'éruptions se demandent à part, via SunPy."
        ),
        "date": when.isoformat(),
        "carrington": carrington(when),
        "schwabe": schwabe(when),
        "sunpy": sunpy_status(),
    }


def catalog() -> dict[str, Any]:
    """Cycles qu'on peut encore suivre, en plus du lunaire et du solaire."""
    items = [
        {
            "id": "anomalistique",
            "label": "Anomalistique",
            "period": "27,55 j",
            "kind": "lune",
            "source": "Éphéméride (périgée / apogée)",
            "why": "Distance Terre–Lune. Module l'amplitude des marées, pas la phase.",
        },
        {
            "id": "draconitique",
            "label": "Draconitique",
            "period": "27,21 j",
            "kind": "lune",
            "source": "Nœuds de l'orbite lunaire",
            "why": "Passage aux nœuds : condition des éclipses, distincte de la nouvelle lune.",
        },
        {
            "id": "nodal",
            "label": "Nodal",
            "period": "18,6 ans",
            "kind": "lune",
            "source": "Régression des nœuds",
            "why": "Module les marées de vive-eau sur presque deux décennies.",
        },
        {
            "id": "saros",
            "label": "Saros",
            "period": "18,03 ans",
            "kind": "lune",
            "source": "NASA Five Millennium Canon of Eclipses",
            "why": "Récurrence des éclipses (223 mois synodiques).",
        },
        {
            "id": "meton",
            "label": "Méton",
            "period": "19 ans",
            "kind": "lune",
            "source": "Calendrier luni-solaire",
            "why": "235 mois synodiques retombent presque sur 19 années tropiques.",
        },
        {
            "id": "vive-eau",
            "label": "Vive-eau / morte-eau",
            "period": "14,77 j",
            "kind": "lune",
            "source": "Demi-mois synodique",
            "why": "Enveloppe de marée utile : le M2 (12,4 h) est plus court qu'un tirage.",
        },
        {
            "id": "tropique",
            "label": "Année tropique",
            "period": "365,24 j",
            "kind": "terre",
            "source": "Déclinaison solaire, durée du jour",
            "why": "Saisons. Calculable en local, comme la phase lunaire.",
        },
        {
            "id": "chandler",
            "label": "Chandler",
            "period": "~433 j",
            "kind": "terre",
            "source": "IERS, mouvement du pôle",
            "why": "Oscillation libre de l'axe terrestre. Lent face au mardi / vendredi.",
        },
        {
            "id": "hale",
            "label": "Hale",
            "period": "~22 ans",
            "kind": "soleil",
            "source": "Polarité magnétique (double Schwabe)",
            "why": "Le champ solaire inverse une fois par cycle de taches.",
        },
        {
            "id": "gleissberg",
            "label": "Gleissberg",
            "period": "~80–90 ans",
            "kind": "soleil",
            "source": "Enveloppe des maxima SILSO",
            "why": "Modulation de l'amplitude des cycles de Schwabe. Très lent.",
        },
        {
            "id": "f107",
            "label": "Flux F10.7",
            "period": "quotidien",
            "kind": "soleil",
            "source": "NOAA / NRCan, 10,7 cm",
            "why": "Proxy EUV du Soleil, publié chaque jour, voisin du cycle de Schwabe.",
        },
        {
            "id": "kp",
            "label": "Kp / Ap / Dst",
            "period": "~27 j (récurrence)",
            "kind": "géomagnétisme",
            "source": "NOAA SWPC, GFZ Potsdam",
            "why": "Réponse terrestre au vent solaire. La récurrence suit Carrington.",
        },
        {
            "id": "cosmiques",
            "label": "Rayons cosmiques",
            "period": "cycle solaire + Forbush (jours)",
            "kind": "géomagnétisme",
            "source": "Moniteurs à neutrons (Oulu, Moscow)",
            "why": "Anti-corrélés au cycle solaire. Les baisses de Forbush durent quelques jours.",
        },
        {
            "id": "enso",
            "label": "ENSO",
            "period": "2–7 ans",
            "kind": "climat",
            "source": "NOAA ONI (Niño 3.4)",
            "why": "Oscillation océan–atmosphère. Physique, mais pas un éphéméride.",
        },
        {
            "id": "qbo",
            "label": "QBO",
            "period": "~28 mois",
            "kind": "climat",
            "source": "Vent zonal stratosphérique (Freie Universität Berlin)",
            "why": "Quasi-biennale. Indépendante du calendrier des tirages.",
        },
    ]
    return {
        "ok": True,
        "active": ["lunaire", "solaire"],
        "note": (
            "Lunaire et solaire sont calculés dans Réf. Les autres sont des "
            "candidats : période connue, source publique, échelle comparable "
            "ou plus lente que le mardi / vendredi."
        ),
        "items": items,
    }
