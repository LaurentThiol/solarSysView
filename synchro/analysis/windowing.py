"""Fenêtre temporelle de travail : slice, warmup, rupture star_pool, profil, A/B."""

from __future__ import annotations

from calendar import monthrange
from datetime import date
from typing import Any

from synchro.analysis.common import as_date, filter_draws_by_weekday, numbers_of, ordered_draws
from synchro.weekday import normalize_weekday_filter
from synchro.analysis.inference import chi_square_uniform, number_frequencies
from synchro.analysis.ta import atr, bollinger, sma
from synchro.analysis.variables import series as extract_series
from synchro.short_cycle import SHORT_CYCLE_MAX, local_range

PRESETS = (
    "last_20",
    "last_50",
    "last_100",
    "last_200",
    "months_3",
    "months_6",
    "months_12",
    "year",
    "year_n1",
    "year_n2",
    "formula",
    "all",
    "custom",
)

LAST_N = {
    "last_20": 20,
    "last_50": 50,
    "last_100": 100,
    "last_200": 200,
}

MONTHS = {
    "months_3": 3,
    "months_6": 6,
    "months_12": 12,
}

DEFAULT_WARMUP = 52  # max(MACD 26, Ichimoku 52)


def add_months(day: date, months: int) -> date:
    month_index = day.month - 1 + months
    year = day.year + month_index // 12
    month = month_index % 12 + 1
    last = monthrange(year, month)[1]
    return date(year, month, min(day.day, last))


def _star_pool(draw: dict[str, Any]) -> int | None:
    raw = draw.get("star_pool")
    if raw is None:
        return None
    return int(raw)


def _mean(values: list[float]) -> float:
    return sum(values) / len(values) if values else 0.0


def _std(values: list[float]) -> float:
    if len(values) < 2:
        return 0.0
    mu = _mean(values)
    var = sum((x - mu) ** 2 for x in values) / (len(values) - 1)
    return var ** 0.5


def coverage(draws: list[dict[str, Any]]) -> int:
    seen: set[int] = set()
    for draw in draws:
        seen.update(numbers_of(draw))
    return len(seen)


def slice_series(values: list[Any], warmup_count: int) -> list[Any]:
    """Garde uniquement la fenêtre de travail (après warmup)."""
    start = max(0, int(warmup_count))
    return values[start:]


def resolve_window(
    draws: list[dict[str, Any]],
    *,
    preset: str = "last_100",
    from_date: str | date | None = None,
    to_date: str | date | None = None,
    last_n: int | None = None,
    warmup: int = DEFAULT_WARMUP,
    weekday: str | None = None,
) -> dict[str, Any]:
    """Découpe l’archive en warmup + jeu de travail.

    Les agrégats (χ², Bayes, …) doivent lire `work` uniquement.
    Les indicateurs à mémoire (EMA, Ichimoku) se calculent sur `with_warmup`.
    `weekday` (mardi/vendredi) filtre l’archive avant last_n / warmup.
    """
    if preset not in PRESETS:
        raise ValueError(f"preset inconnu: {preset}. Choisir parmi {PRESETS}.")
    day = normalize_weekday_filter(weekday)
    ordered = ordered_draws(filter_draws_by_weekday(draws, day))
    if not ordered:
        return {
            "preset": preset,
            "from_date": None,
            "to_date": None,
            "draw_count": 0,
            "warmup_count": 0,
            "warmup_from": None,
            "star_pools": [],
            "star_pool_break": False,
            "weekday": day,
            "work": [],
            "warmup": [],
            "with_warmup": [],
            "compare": {"work": [], "from_date": None, "to_date": None, "draw_count": 0},
        }

    end = as_date(to_date) if to_date else as_date(ordered[-1]["draw_date"])
    start: date | None = as_date(from_date) if from_date else None
    work = [d for d in ordered if as_date(d["draw_date"]) <= end]

    if preset in LAST_N or last_n is not None:
        n = int(last_n) if last_n is not None else LAST_N[preset]
        work = work[-max(1, n) :]
    elif preset in MONTHS:
        start = add_months(end, -MONTHS[preset])
        work = [d for d in work if as_date(d["draw_date"]) >= start]
    elif preset == "year":
        start = date(end.year, 1, 1)
        work = [d for d in work if as_date(d["draw_date"]) >= start]
    elif preset in {"year_n1", "year_n2"}:
        offset = 2 if preset == "year_n2" else 1
        start = date(end.year - offset, 1, 1)
        cap = date(end.year - offset, 12, 31)
        work = [d for d in work if start <= as_date(d["draw_date"]) <= cap]
    elif preset == "formula":
        work = [d for d in work if (_star_pool(d) or 12) >= 12]
        if start:
            work = [d for d in work if as_date(d["draw_date"]) >= start]
    elif preset == "custom":
        if start:
            work = [d for d in work if as_date(d["draw_date"]) >= start]
    elif preset == "all":
        if start:
            work = [d for d in work if as_date(d["draw_date"]) >= start]

    if not work:
        return {
            "preset": preset,
            "from_date": None,
            "to_date": None,
            "draw_count": 0,
            "warmup_count": 0,
            "warmup_from": None,
            "star_pools": [],
            "star_pool_break": False,
            "weekday": day,
            "work": [],
            "warmup": [],
            "with_warmup": [],
            "compare": {"work": [], "from_date": None, "to_date": None, "draw_count": 0},
        }

    work_start = as_date(work[0]["draw_date"])
    before = [d for d in ordered if as_date(d["draw_date"]) < work_start]
    warm_n = max(0, int(warmup))
    warmup_rows = before[-warm_n:] if warm_n else []
    pools = sorted({p for p in (_star_pool(d) for d in work) if p is not None})
    compare_rows = before[-len(work) :] if before else []

    def _meta(rows: list[dict[str, Any]]) -> dict[str, Any]:
        if not rows:
            return {"from_date": None, "to_date": None, "draw_count": 0, "work": []}
        return {
            "from_date": as_date(rows[0]["draw_date"]).isoformat(),
            "to_date": as_date(rows[-1]["draw_date"]).isoformat(),
            "draw_count": len(rows),
            "work": rows,
        }

    return {
        "preset": preset,
        "from_date": as_date(work[0]["draw_date"]).isoformat(),
        "to_date": as_date(work[-1]["draw_date"]).isoformat(),
        "draw_count": len(work),
        "weekday": day,
        "warmup_count": len(warmup_rows),
        "warmup_from": as_date(warmup_rows[0]["draw_date"]).isoformat() if warmup_rows else None,
        "star_pools": pools,
        "star_pool_break": len(set(pools)) > 1,
        "work": work,
        "warmup": warmup_rows,
        "with_warmup": warmup_rows + work,
        "compare": _meta(compare_rows),
    }


def compare_windows(
    draws_a: list[dict[str, Any]],
    draws_b: list[dict[str, Any]],
    variable: str = "sum",
    n: int | None = None,
) -> dict[str, Any]:
    """Compare deux fenêtres (moyenne, z, χ², fréquences)."""

    def _pack(rows: list[dict[str, Any]]) -> dict[str, Any]:
        if not rows:
            return {
                "draw_count": 0,
                "from_date": None,
                "to_date": None,
                "mean": None,
                "std": None,
                "last": None,
                "zscore": None,
                "coverage": 0,
                "chi_square": None,
                "frequencies": [0] * 51,
            }
        payload = extract_series(rows, variable, n=n)
        values = [float(v) for v in payload["values"]]
        mu = _mean(values)
        sigma = _std(values)
        last = values[-1] if values else None
        z = (last - mu) / sigma if last is not None and sigma > 0 else None
        chi = chi_square_uniform(rows)
        return {
            "draw_count": len(rows),
            "from_date": payload["from_date"],
            "to_date": payload["to_date"],
            "mean": round(mu, 4) if values else None,
            "std": round(sigma, 4) if values else None,
            "last": last,
            "zscore": round(z, 4) if z is not None else None,
            "coverage": coverage(rows),
            "chi_square": chi["stat"],
            "chi_pvalue": chi["pvalue"],
            "frequencies": number_frequencies(rows),
        }

    a = _pack(draws_a)
    b = _pack(draws_b)
    freq_delta = []
    if a["draw_count"] and b["draw_count"]:
        fa, fb = a["frequencies"], b["frequencies"]
        na, nb = a["draw_count"], b["draw_count"]
        for ball in range(1, 51):
            pa = fa[ball] / na
            pb = fb[ball] / nb
            freq_delta.append({"value": ball, "delta": pa - pb, "a": fa[ball], "b": fb[ball]})
        freq_delta.sort(key=lambda row: abs(row["delta"]), reverse=True)
    mean_delta = None
    if a["mean"] is not None and b["mean"] is not None:
        mean_delta = round(a["mean"] - b["mean"], 4)
    return {
        "a": a,
        "b": b,
        "delta_mean": mean_delta,
        "freq_delta": freq_delta[:10],
    }


def _synthetic_candles(values: list[float]) -> list[dict[str, float]]:
    out: list[dict[str, float]] = []
    prev = values[0] if values else 0.0
    for value in values:
        out.append(
            {
                "o": prev,
                "h": max(prev, value),
                "l": min(prev, value),
                "c": value,
            }
        )
        prev = value
    return out


def rolling_profile(
    draws: list[dict[str, Any]],
    *,
    variable: str = "sum",
    period: int = 20,
    n: int | None = None,
) -> dict[str, Any]:
    """Profil glissant sur toute l’ère (moyenne, σ, couverture, ADX, largeur Bollinger)."""
    ordered = ordered_draws(draws)
    payload = extract_series(ordered, variable, n=n)
    values = [float(v) for v in payload["values"]]
    period = max(2, int(period))
    mean_line = sma(values, period)
    bands = bollinger(values, period, 2.0)
    candles = _synthetic_candles(values)
    adx_period = min(period, max(2, len(candles)))
    atr_line = atr(candles, adx_period) if candles else []
    width: list[float | None] = [None] * len(values)
    for i, mid in enumerate(bands["middle"]):
        if mid is None or mid == 0:
            continue
        up, lo = bands["upper"][i], bands["lower"][i]
        if up is None or lo is None:
            continue
        width[i] = (up - lo) / mid
    points = []
    for i, draw in enumerate(ordered):
        start = max(0, i - period + 1)
        chunk = values[start : i + 1]
        points.append(
            {
                "date": as_date(draw["draw_date"]).isoformat(),
                "mean": mean_line[i],
                "std": _std(chunk) if len(chunk) >= 2 else None,
                "short_range": local_range(values, i, SHORT_CYCLE_MAX),
                "coverage": coverage(ordered[start : i + 1]),
                "bb_width": width[i],
                "atr": atr_line[i] if i < len(atr_line) else None,
            }
        )
    return {
        "variable": variable,
        "period": period,
        "draw_count": len(ordered),
        "from_date": payload["from_date"],
        "to_date": payload["to_date"],
        "points": points,
    }
