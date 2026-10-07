"""Table d’un pas par tirage réel, années civiles n / n−1 / n−2."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, timedelta
from typing import Any, Iterable

from synchro.analysis.common import as_date
from synchro.analysis.variables import decade_hist
from synchro.nextdata.covariates import (
    clocks,
    consecutive_count,
    link_series,
    mean_delay,
    repeat_counts,
    spread_of,
    star_couple_ago,
)
from synchro.short_cycle import short_residual

MIN_DRAWS = 24
YEAR_KEYS = ("n", "n-1", "n-2")


@dataclass
class Frame:
    rows: list[dict[str, Any]]
    horizon: list[dict[str, Any]]
    focus_start: int
    focus: int
    years: list[str]
    years_present: list[str]
    weekday: str
    star_pool: int
    anchor_year: int
    next_date: str


def _day(draw: dict[str, Any]) -> date:
    raw = draw.get("draw_date") or draw.get("date")
    if raw is None:
        raise ValueError("Tirage sans date.")
    return as_date(raw)


def _weekday(day: date, raw: Any) -> str:
    text = str(raw or "").strip().lower()
    if text in ("mardi", "vendredi"):
        return text
    if day.weekday() == 1:
        return "mardi"
    if day.weekday() == 4:
        return "vendredi"
    return ""


def _ints(values: Any, lo: int, hi: int) -> list[int]:
    if not isinstance(values, (list, tuple)):
        return []
    seen: set[int] = set()
    out: list[int] = []
    for item in values:
        try:
            number = int(item)
        except (TypeError, ValueError):
            continue
        if number < lo or number > hi or number in seen:
            continue
        seen.add(number)
        out.append(number)
    out.sort()
    return out


def next_draw_date(day: date, weekday: str | None = None) -> date:
    """Prochain mardi, vendredi, ou le jour demandé s’il est seul."""
    allowed = (1, 4)
    if weekday == "mardi":
        allowed = (1,)
    elif weekday == "vendredi":
        allowed = (4,)
    cursor = day + timedelta(days=1)
    for _ in range(14):
        if cursor.weekday() in allowed:
            return cursor
        cursor += timedelta(days=1)
    return cursor


def _normalize(draws: Iterable[dict[str, Any]]) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for draw in draws:
        try:
            day = _day(draw)
        except (TypeError, ValueError):
            continue
        numbers = _ints(draw.get("numbers"), 1, 50)
        stars = _ints(draw.get("stars"), 1, 12)
        if len(numbers) != 5 or len(stars) != 2:
            continue
        pool = draw.get("star_pool")
        try:
            star_pool = int(pool) if pool is not None else max(stars)
        except (TypeError, ValueError):
            star_pool = max(stars)
        star_pool = max(star_pool, max(stars), 2)
        rows.append(
            {
                "day": day,
                "date": day.isoformat(),
                "weekday": _weekday(day, draw.get("weekday")),
                "numbers": numbers,
                "stars": stars,
                "star_pool": min(12, star_pool),
            }
        )
    rows.sort(key=lambda row: (row["day"], row["date"]))
    deduped: list[dict[str, Any]] = []
    seen: set[date] = set()
    for row in rows:
        if row["day"] in seen:
            continue
        seen.add(row["day"])
        deduped.append(row)
    return deduped


def _year_keys(anchor: int, years: Iterable[str] | None) -> tuple[list[str], set[int]]:
    requested = [key for key in YEAR_KEYS if years is None or key in set(years)]
    if not requested:
        requested = list(YEAR_KEYS)
    mapping = {"n": anchor, "n-1": anchor - 1, "n-2": anchor - 2}
    return requested, {mapping[key] for key in requested}


def build_frame(
    draws: Iterable[dict[str, Any]],
    *,
    years: Iterable[str] | None = None,
    focus: int = 50,
    weekday: str | None = None,
) -> Frame:
    """Corpus des années cochées. Le focus est la queue de ce corpus."""
    normalized = _normalize(draws)
    if not normalized:
        raise ValueError("Aucun tirage réel exploitable.")
    anchor_year = int(normalized[-1]["day"].year)
    year_list, wanted_years = _year_keys(anchor_year, years)
    day_filter = weekday if weekday in ("mardi", "vendredi") else "tous"
    selected = [row for row in normalized if row["day"].year in wanted_years]
    if day_filter in ("mardi", "vendredi"):
        selected = [row for row in selected if row["weekday"] == day_filter]
    if len(selected) < MIN_DRAWS:
        raise ValueError(
            f"Il faut au moins {MIN_DRAWS} tirages dans les années cochées pour entraîner "
            f"({len(selected)} disponible{'s' if len(selected) != 1 else ''})."
        )

    numbers = [row["numbers"] for row in selected]
    stars = [row["stars"] for row in selected]
    sums = [float(sum(pool)) for pool in numbers]
    star_sums = [float(sum(pool)) for pool in stars]
    n_ranks = [[float(pool[i]) for pool in numbers] for i in range(5)]
    gaps = [[n_ranks[i + 1][t] - n_ranks[i][t] for t in range(len(selected))] for i in range(4)]
    e1 = [float(pool[0]) for pool in stars]
    e2 = [float(pool[1]) for pool in stars]
    e_gap = [e2[t] - e1[t] for t in range(len(selected))]
    parity = [float(sum(1 for n in pool if n % 2 == 0)) for pool in numbers]
    spread = [spread_of(pool) for pool in numbers]
    high_low = [float(sum(1 for n in pool if n >= 26)) for pool in numbers]
    consecutive = [consecutive_count(pool) for pool in numbers]
    star_spread = [spread_of(pool) for pool in stars]
    star_consecutive = [consecutive_count(pool) for pool in stars]
    decades = []
    for pool in numbers:
        bins = decade_hist({"numbers": pool})
        decades.append(bins)
    centroid = [sums[t] / 5.0 for t in range(len(selected))]
    residual = [float(value) for value in short_residual(sums)]
    delays = mean_delay(numbers)
    repeats = repeat_counts(numbers)
    couples = link_series(numbers, 2)
    triples = link_series(numbers, 3)
    star_ago = star_couple_ago(stars)

    def delta(values: list[float]) -> list[float]:
        out = [0.0]
        for index in range(1, len(values)):
            out.append(values[index] - values[index - 1])
        return out

    d_sum = delta(sums)
    d_star = delta(star_sums)
    d_n = [delta(series) for series in n_ranks]
    d_e1 = delta(e1)
    d_e2 = delta(e2)

    rows: list[dict[str, Any]] = []
    for index, row in enumerate(selected):
        clock = clocks(row["day"])
        bins = decades[index]
        built = {
            "date": row["date"],
            "weekday": row["weekday"],
            "numbers": list(row["numbers"]),
            "stars": list(row["stars"]),
            "sum": sums[index],
            "star_sum": star_sums[index],
            "n1": n_ranks[0][index],
            "n2": n_ranks[1][index],
            "n3": n_ranks[2][index],
            "n4": n_ranks[3][index],
            "n5": n_ranks[4][index],
            "g1": gaps[0][index],
            "g2": gaps[1][index],
            "g3": gaps[2][index],
            "g4": gaps[3][index],
            "parity": parity[index],
            "e1": e1[index],
            "e2": e2[index],
            "e_gap": e_gap[index],
            "spread": spread[index],
            "high_low": high_low[index],
            "consecutive": consecutive[index],
            "star_spread": star_spread[index],
            "star_consecutive": star_consecutive[index],
            "centroid": centroid[index],
            "short_residual": residual[index],
            "mean_delay": delays[index],
            "repeat_count": repeats[index],
            "d0": float(bins[0]),
            "d1": float(bins[1]),
            "d2": float(bins[2]),
            "d3": float(bins[3]),
            "d4": float(bins[4]),
            "decade_occupied": float(sum(1 for bin_count in bins if bin_count)),
            "d_sum": d_sum[index],
            "d_star_sum": d_star[index],
            "d_n1": d_n[0][index],
            "d_n2": d_n[1][index],
            "d_n3": d_n[2][index],
            "d_n4": d_n[3][index],
            "d_n5": d_n[4][index],
            "d_e1": d_e1[index],
            "d_e2": d_e2[index],
            "star_couple_ago": star_ago[index],
        }
        for key, values in couples.items():
            built[key] = values[index]
        for key, values in triples.items():
            built[key] = values[index]
        built.update(clock)
        rows.append(built)

    focus_used = max(1, min(int(focus), len(rows)))
    focus_start = len(rows) - focus_used
    present_years = []
    for key, year in (("n", anchor_year), ("n-1", anchor_year - 1), ("n-2", anchor_year - 2)):
        if key in year_list and any(row["date"].startswith(str(year)) for row in rows):
            present_years.append(key)
    scope = day_filter if day_filter in ("mardi", "vendredi") else None
    nxt = next_draw_date(selected[-1]["day"], scope)
    following = next_draw_date(nxt, scope)
    horizon = []
    for day in (nxt, following):
        item = {"date": day.isoformat(), "weekday": _weekday(day, None)}
        item.update(clocks(day))
        horizon.append(item)
    return Frame(
        rows=rows,
        horizon=horizon,
        focus_start=focus_start,
        focus=focus_used,
        years=year_list,
        years_present=present_years,
        weekday=day_filter,
        star_pool=int(selected[-1]["star_pool"]),
        anchor_year=anchor_year,
        next_date=nxt.isoformat(),
    )
