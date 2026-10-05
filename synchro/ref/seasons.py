"""Saisons boréales : longitude du Soleil, solstices et équinoxes.

Les instants suivent Meeus, *Astronomical Algorithms*, ch. 27 (équinoxes et
solstices, années 1000–3000), en temps terrestre. La conversion en UTC
retire ΔT selon les polynômes d'Espenak & Meeus (NASA). L'affichage est à
la minute : l'écart avec les éphémérides publiées tient dans une minute.
"""

from __future__ import annotations

import math
from datetime import date, datetime, timedelta, timezone
from typing import Any

from synchro.ref.cycles import julian_day

_J2000 = 2451545.0

# Termes périodiques (A, B°, C°) ajoutés à JDE0. Meeus, table 27.C.
_PERIODIC: tuple[tuple[float, float, float], ...] = (
    (485, 324.96, 1934.136),
    (203, 337.23, 32964.467),
    (199, 342.08, 20.186),
    (182, 27.85, 445267.112),
    (156, 73.14, 45036.886),
    (136, 171.52, 22518.443),
    (77, 222.54, 65928.934),
    (74, 296.72, 3034.906),
    (70, 243.58, 9037.513),
    (58, 119.81, 33718.147),
    (52, 297.17, 150.678),
    (50, 21.02, 2281.226),
    (45, 247.54, 29929.562),
    (44, 325.15, 31555.956),
    (29, 60.93, 4443.417),
    (18, 155.12, 67555.328),
    (17, 288.79, 4562.452),
    (16, 198.04, 62894.029),
    (14, 199.76, 31436.921),
    (12, 95.39, 14577.848),
    (12, 287.11, 31931.756),
    (12, 320.81, 34777.259),
    (9, 227.73, 1222.114),
    (8, 15.45, 16859.074),
)

# JDE0 = a + b Y + c Y² + d Y³ + e Y⁴, Y = (année − 2000) / 1000.
_JDE0: dict[str, tuple[float, float, float, float, float]] = {
    "march": (2451623.80984, 365242.37404, 0.05169, -0.00411, -0.00057),
    "june": (2451716.56767, 365241.62603, 0.00325, 0.00888, -0.00030),
    "september": (2451810.21715, 365242.01767, -0.11575, 0.00337, 0.00078),
    "december": (2451900.05952, 365242.74049, -0.06223, -0.00823, 0.00032),
}

_MARKS: tuple[tuple[str, str, str, str, float], ...] = (
    ("ete", "june", "solstice_ete", "Solstice d'été", 90.0),
    ("hiver", "december", "solstice_hiver", "Solstice d'hiver", 270.0),
    ("mars", "march", "equinoxe_mars", "Équinoxe de mars", 0.0),
    ("septembre", "september", "equinoxe_septembre", "Équinoxe de septembre", 180.0),
)


def sun_longitude(jd: float) -> float:
    """Longitude écliptique du Soleil, en degrés. 0 = équinoxe de mars."""
    elapsed = jd - _J2000
    mean = 280.46646 + 0.98564736 * elapsed
    anomaly = math.radians((357.52911 + 0.98560028 * elapsed) % 360.0)
    longitude = mean + 1.9148 * math.sin(anomaly) + 0.0200 * math.sin(2.0 * anomaly)
    return longitude % 360.0


def _delta_t_seconds(year: float) -> float:
    """ΔT = TT − UT, secondes. Polynômes Espenak & Meeus."""
    y = year
    if y < 1800 or y >= 2150:
        u = (y - 1820.0) / 100.0
        return -20.0 + 32.0 * u * u
    if y < 1860:
        t = y - 1800.0
        return (
            13.72
            - 0.332447 * t
            + 0.0068612 * t**2
            + 0.0041116 * t**3
            - 0.00037436 * t**4
            + 0.0000121272 * t**5
            - 0.0000001699 * t**6
            + 0.000000000875 * t**7
        )
    if y < 1900:
        t = y - 1860.0
        return (
            7.62
            + 0.5737 * t
            - 0.251754 * t**2
            + 0.01680668 * t**3
            - 0.0004473624 * t**4
            + t**5 / 233174.0
        )
    if y < 1920:
        t = y - 1900.0
        return -2.79 + 1.494119 * t - 0.0598939 * t**2 + 0.0061966 * t**3 - 0.000197 * t**4
    if y < 1941:
        t = y - 1920.0
        return 21.20 + 0.84493 * t - 0.076100 * t**2 + 0.0020936 * t**3
    if y < 1961:
        t = y - 1950.0
        return 29.07 + 0.407 * t - t**2 / 233.0 + t**3 / 2547.0
    if y < 1986:
        t = y - 1975.0
        return 45.45 + 1.067 * t - t**2 / 260.0 - t**3 / 718.0
    if y < 2005:
        t = y - 2000.0
        return (
            63.86
            + 0.3345 * t
            - 0.060374 * t**2
            + 0.0017275 * t**3
            + 0.000651814 * t**4
            + 0.00002373599 * t**5
        )
    if y < 2050:
        t = y - 2000.0
        return 62.92 + 0.32217 * t + 0.005589 * t**2
    u = (y - 1820.0) / 100.0
    return -20.0 + 32.0 * u * u - 0.5628 * (2150.0 - y)


def _event_jd_utc(year: int, kind: str) -> float:
    y = (year - 2000) / 1000.0
    a, b, c, d, e = _JDE0[kind]
    jde0 = a + b * y + c * y * y + d * y**3 + e * y**4
    centuries = (jde0 - _J2000) / 36525.0
    argument = math.radians(35999.373 * centuries - 2.47)
    delta_lambda = 1.0 + 0.0334 * math.cos(argument) + 0.0007 * math.cos(2.0 * argument)
    correction = sum(
        coeff * math.cos(math.radians(angle + freq * centuries))
        for coeff, angle, freq in _PERIODIC
    )
    jde = jde0 + 0.00001 * correction / delta_lambda
    return jde - _delta_t_seconds(year) / 86400.0


def _jd_to_utc(jd: float) -> datetime:
    """Jour julien → instant UTC. Inverse de `julian_day`."""
    z = math.floor(jd + 0.5)
    frac = (jd + 0.5) - z
    if z < 2299161:
        a = int(z)
    else:
        alpha = math.floor((z - 1867216.25) / 36524.25)
        a = int(z + 1 + alpha - alpha // 4)
    b = a + 1524
    c = math.floor((b - 122.1) / 365.25)
    d = math.floor(365.25 * c)
    e = math.floor((b - d) / 30.6001)
    day = b - d - math.floor(30.6001 * e) + frac
    month = e - 1 if e < 14 else e - 13
    year = c - 4716 if month > 2 else c - 4715
    whole = math.floor(day)
    seconds = int(round((day - whole) * 86400.0))
    return datetime(int(year), int(month), int(whole), tzinfo=timezone.utc) + timedelta(seconds=seconds)


def _round_minute(moment: datetime) -> datetime:
    return (moment + timedelta(seconds=30)).replace(second=0, microsecond=0)


def _upcoming(when: date, kind: str) -> datetime:
    """Prochain instant de l'événement, à partir de 00:00 UTC du jour choisi."""
    start = julian_day(when, hour=0.0)
    found: float | None = None
    for year in range(when.year - 1, when.year + 3):
        jd = _event_jd_utc(year, kind)
        if jd + 1e-8 >= start and (found is None or jd < found):
            found = jd
    if found is None:
        raise ValueError(f"Pas d'instant pour {kind} autour de {when.isoformat()}")
    return _round_minute(_jd_to_utc(found))


def _season(longitude: float) -> tuple[str, str]:
    if longitude < 90.0:
        return "printemps", "Printemps"
    if longitude < 180.0:
        return "ete", "Été"
    if longitude < 270.0:
        return "automne", "Automne"
    return "hiver", "Hiver"


def _event(when: date, kind: str, event_id: str, label: str, longitude: float) -> dict[str, Any]:
    moment = _upcoming(when, kind)
    return {
        "id": event_id,
        "label": label,
        "kind": "solstice" if event_id.startswith("solstice") else "equinoxe",
        "longitude_deg": longitude,
        "date": moment.date().isoformat(),
        "time_utc": moment.strftime("%H:%M"),
        "instant": moment.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "days": (moment.date() - when).days,
    }


def season_state(day: date) -> dict[str, Any]:
    """Saison à midi UTC, et les prochains solstices et équinoxes."""
    longitude = sun_longitude(julian_day(day))
    code, label = _season(longitude)
    events = {
        key: _event(day, kind, event_id, event_label, mark)
        for key, kind, event_id, event_label, mark in _MARKS
    }
    return {
        "date": day.isoformat(),
        "longitude_deg": round(longitude, 2),
        "fraction": round(longitude / 360.0, 5),
        "season": code,
        "season_label": label,
        "hemisphere": "nord",
        "solstices": {"ete": events["ete"], "hiver": events["hiver"]},
        "equinoxes": {"mars": events["mars"], "septembre": events["septembre"]},
    }
