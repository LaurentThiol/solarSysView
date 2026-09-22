"""Journal des grilles jouées (histoJeux) : scoring vs tirage FDJ, stats descriptives."""

from __future__ import annotations

import json
import math
from collections import Counter
from datetime import date
from typing import Any

from synchro.analysis.combinatorics import rank_probabilities
from synchro.analysis.inference import wilson_interval
from synchro.ranks import RANK_LABELS, evaluate_grid, validate_grid

PLAY_SOURCES = ("combinaisons", "jeux", "pronostic", "manuel")
PLAY_SOURCE_LABELS = {
    "combinaisons": "Combinaisons",
    "jeux": "Jeux",
    "pronostic": "Pronostic",
    "manuel": "Manuel",
}
MAX_COPIES = 20
PLAY_DATE_WEEKDAYS = (1, 4)  # mardi, vendredi
BINOM_ALPHA = 0.05
MAX_SPEC_BYTES = 32_000
DECADE_LABELS = ("1–10", "11–20", "21–30", "31–40", "41–50")
DECADE_MAX_PER = 5
NUMBER_DRAW = 5
STAR_DRAW = 2
NUMBER_SUM_MIN = 15
NUMBER_SUM_MAX = 240
STAR_SUM_MIN = 3
STAR_SUM_MAX = 23
NUMBER_SPREAD_MIN = 4
NUMBER_SPREAD_MAX = 49
NUMBER_CONSEC_MIN = 0
NUMBER_CONSEC_MAX = 4
STAR_SPREAD_MIN = 1
STAR_SPREAD_MAX = 11
STAR_CONSEC_MIN = 0
STAR_CONSEC_MAX = 1
DEFAULT_THRESHOLD = 1

SPEC_KEYS = (
    "numberChance",
    "starChance",
    "numberThreshold",
    "starThreshold",
    "numberForced",
    "starForced",
    "numberMinSum",
    "numberMaxSum",
    "numberMinEven",
    "numberMaxEven",
    "numberMinSpread",
    "numberMaxSpread",
    "numberMinConsecutive",
    "numberMaxConsecutive",
    "numberDecadeMin",
    "numberDecadeMax",
    "starMinSum",
    "starMaxSum",
    "starMinEven",
    "starMaxEven",
    "starMinSpread",
    "starMaxSpread",
    "starMinConsecutive",
    "starMaxConsecutive",
)


def parse_play_date(value: Any) -> date:
    if isinstance(value, date):
        parsed = date(value.year, value.month, value.day)
    else:
        text = str(value or "").strip()[:10]
        try:
            parsed = date.fromisoformat(text)
        except ValueError as exc:
            raise ValueError("Date de tirage invalide.") from exc
    if parsed.weekday() not in PLAY_DATE_WEEKDAYS:
        raise ValueError("EuroMillions ne tire que le mardi et le vendredi.")
    return parsed


def normalize_source(value: Any) -> str:
    key = str(value or "manuel").strip().lower()
    return key if key in PLAY_SOURCES else "manuel"


def normalize_copies(value: Any) -> int:
    try:
        copies = int(value)
    except (TypeError, ValueError):
        copies = 1
    return max(1, min(MAX_COPIES, copies))


def normalize_play_spec(value: Any) -> dict[str, Any] | None:
    if value is None or value == "":
        return None
    if isinstance(value, str):
        try:
            value = json.loads(value)
        except json.JSONDecodeError:
            return None
    if not isinstance(value, dict):
        return None
    out = {key: value[key] for key in SPEC_KEYS if key in value}
    if not out:
        return None
    encoded = json.dumps(out, ensure_ascii=False, default=str)
    if len(encoded.encode("utf-8")) > MAX_SPEC_BYTES:
        return None
    return out


def weekday_fr(day: date) -> str:
    names = ("lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche")
    return names[day.weekday()]


def grid_key(numbers: list[int], stars: list[int]) -> str:
    nums = ",".join(str(n) for n in sorted(numbers))
    ets = ",".join(str(s) for s in sorted(stars))
    return f"{nums}|{ets}"


def prize_at_rank(draw: dict[str, Any] | None, rank: int | None) -> float | None:
    if draw is None or rank is None:
        return None
    for item in draw.get("prizes") or []:
        try:
            if int(item.get("rank")) != rank:
                continue
        except (TypeError, ValueError):
            continue
        value = item.get("prize")
        if value is None:
            return None
        try:
            return float(value)
        except (TypeError, ValueError):
            return None
    return None


def play_prize_amount(
    draw: dict[str, Any] | None,
    rank: int | None,
    copies: int,
) -> float | None:
    """Rapport FDJ du rang × copies. 0 si pas de rang et échelle connue ; None si n.d."""
    if not draw or not (draw.get("prizes") or []):
        return None
    if rank is None:
        return 0.0
    unit = prize_at_rank(draw, rank)
    if unit is None:
        return None
    return unit * copies


def official_p_any_rank(star_pool: int = 12) -> float:
    ranks = rank_probabilities(star_pool)
    p_no = next(float(row["p"]) for row in ranks if row["rank"] is None)
    return 1.0 - p_no


def _log_binomial_pmf(k: int, n: int, p: float) -> float:
    if p <= 0:
        return 0.0 if k == 0 else -math.inf
    if p >= 1:
        return 0.0 if k == n else -math.inf
    return (
        math.lgamma(n + 1)
        - math.lgamma(k + 1)
        - math.lgamma(n - k + 1)
        + k * math.log(p)
        + (n - k) * math.log1p(-p)
    )


def binom_two_sided_exact(successes: int, trials: int, probability: float) -> float:
    """Test binomial exact bilatéral, en log-factorielles pour éviter l'explosion."""
    if trials <= 0:
        return 1.0
    k = min(trials, max(0, successes))
    target = _log_binomial_pmf(k, trials, probability)
    total = 0.0
    for i in range(trials + 1):
        value = _log_binomial_pmf(i, trials, probability)
        if value <= target + 1e-9:
            total += math.exp(value)
    return min(1.0, total)


def binomial_vs_official(
    wins: int,
    n: int,
    *,
    p0: float | None = None,
    tickets: int | None = None,
    draws: int | None = None,
) -> dict[str, Any] | None:
    if n <= 0:
        return None
    p_ref = official_p_any_rank() if p0 is None else p0
    p_value = binom_two_sided_exact(wins, n, p_ref)
    compatible = p_value >= BINOM_ALPHA
    return {
        "n": n,
        "wins": wins,
        "p0": p_ref,
        "expected": n * p_ref,
        "p_value": p_value,
        "alpha": BINOM_ALPHA,
        "compatible": compatible,
        "verdict": "écart non détectable" if compatible else "écart notable vs le hasard",
        "tickets": n if tickets is None else tickets,
        "draws": n if draws is None else draws,
    }


def _as_int_list(value: Any) -> list[int]:
    if not isinstance(value, list):
        return []
    out: list[int] = []
    for item in value:
        try:
            out.append(int(item))
        except (TypeError, ValueError):
            continue
    return out


def summarize_play_spec(spec: dict[str, Any] | None) -> list[str]:
    if not spec:
        return []
    chips: list[str] = []
    n_min = int(spec.get("numberMinSum", NUMBER_SUM_MIN))
    n_max = int(spec.get("numberMaxSum", NUMBER_SUM_MAX))
    if n_min > NUMBER_SUM_MIN or n_max < NUMBER_SUM_MAX:
        chips.append(f"Σ {n_min}–{n_max}")
    n_even_min = int(spec.get("numberMinEven", 0))
    n_even_max = int(spec.get("numberMaxEven", NUMBER_DRAW))
    if n_even_min > 0 or n_even_max < NUMBER_DRAW:
        chips.append(f"{n_even_min}–{n_even_max} paires")
    n_spread_min = int(spec.get("numberMinSpread", NUMBER_SPREAD_MIN))
    n_spread_max = int(spec.get("numberMaxSpread", NUMBER_SPREAD_MAX))
    if n_spread_min > NUMBER_SPREAD_MIN or n_spread_max < NUMBER_SPREAD_MAX:
        chips.append(f"étendue {n_spread_min}–{n_spread_max}")
    n_consec_min = int(spec.get("numberMinConsecutive", NUMBER_CONSEC_MIN))
    n_consec_max = int(spec.get("numberMaxConsecutive", NUMBER_CONSEC_MAX))
    if n_consec_min > NUMBER_CONSEC_MIN or n_consec_max < NUMBER_CONSEC_MAX:
        chips.append(f"{n_consec_min}–{n_consec_max} consécutifs")
    decade_min = _as_int_list(spec.get("numberDecadeMin"))
    decade_max = _as_int_list(spec.get("numberDecadeMax"))
    for i, label in enumerate(DECADE_LABELS):
        lo = decade_min[i] if i < len(decade_min) else 0
        hi = decade_max[i] if i < len(decade_max) else DECADE_MAX_PER
        if lo > 0 or hi < DECADE_MAX_PER:
            chips.append(f"{label} {lo}–{hi}")
    forced = sorted(set(_as_int_list(spec.get("numberForced"))))
    if forced:
        chips.append("forcés " + ", ".join(str(n) for n in forced))
    chance = spec.get("numberChance") or []
    excluded = [
        i + 1
        for i, raw in enumerate(chance[:50])
        if isinstance(raw, (int, float)) and raw <= 0
    ]
    if excluded:
        shown = excluded[:6]
        suffix = "…" if len(excluded) > 6 else ""
        chips.append("hors " + ", ".join(str(n) for n in shown) + suffix)
    threshold = int(spec.get("numberThreshold", DEFAULT_THRESHOLD))
    if threshold > DEFAULT_THRESHOLD:
        chips.append(f"seuil {threshold} %")
    s_min = int(spec.get("starMinSum", STAR_SUM_MIN))
    s_max = int(spec.get("starMaxSum", STAR_SUM_MAX))
    if s_min > STAR_SUM_MIN or s_max < STAR_SUM_MAX:
        chips.append(f"★ Σ {s_min}–{s_max}")
    s_even_min = int(spec.get("starMinEven", 0))
    s_even_max = int(spec.get("starMaxEven", STAR_DRAW))
    if s_even_min > 0 or s_even_max < STAR_DRAW:
        chips.append(f"★ {s_even_min}–{s_even_max} paires")
    star_forced = sorted(set(_as_int_list(spec.get("starForced"))))
    if star_forced:
        chips.append("★ forcées " + ", ".join(str(n) for n in star_forced))
    star_chance = spec.get("starChance") or []
    star_excluded = [
        i + 1
        for i, raw in enumerate(star_chance[:12])
        if isinstance(raw, (int, float)) and raw <= 0
    ]
    if star_excluded:
        chips.append("★ hors " + ", ".join(str(n) for n in star_excluded))
    number_slots = spec.get("numberSlotBands") or spec.get("number_slot_bands")
    if isinstance(number_slots, list) and number_slots:
        parts = []
        for i, item in enumerate(number_slots[:5]):
            if isinstance(item, dict) and "lo" in item and "hi" in item:
                parts.append(f"n{i + 1} {int(item['lo'])}–{int(item['hi'])}")
        if parts:
            chips.append(" ".join(parts))
    star_slots = spec.get("starSlotBands") or spec.get("star_slot_bands")
    if isinstance(star_slots, list) and star_slots:
        parts = []
        for i, item in enumerate(star_slots[:2]):
            if isinstance(item, dict) and "lo" in item and "hi" in item:
                parts.append(f"e{i + 1} {int(item['lo'])}–{int(item['hi'])}")
        if parts:
            chips.append(" ".join(parts))
    return chips


def decorate_play(play: dict[str, Any], draw: dict[str, Any] | None) -> dict[str, Any]:
    numbers = list(play.get("numbers") or [])
    stars = list(play.get("stars") or [])
    play_date = play.get("play_date")
    if isinstance(play_date, date):
        day = date(play_date.year, play_date.month, play_date.day)
    else:
        day = date.fromisoformat(str(play_date)[:10])
    copies = normalize_copies(play.get("copies"))
    source = normalize_source(play.get("source"))
    spec = normalize_play_spec(play.get("spec"))
    out = {
        **play,
        "numbers": sorted(int(n) for n in numbers),
        "stars": sorted(int(s) for s in stars),
        "copies": copies,
        "source": source,
        "source_label": PLAY_SOURCE_LABELS[source],
        "spec": spec,
        "spec_summary": summarize_play_spec(spec),
        "weekday": weekday_fr(day),
        "status": "pending",
        "result": None,
        "draw": None,
        "repeat_key": f"{day.isoformat()}|{grid_key(numbers, stars)}",
    }
    if not draw:
        return out
    result = evaluate_grid(
        out["numbers"],
        out["stars"],
        list(draw.get("numbers") or []),
        list(draw.get("stars") or []),
    )
    result["prize"] = play_prize_amount(draw, result.get("rank"), copies)
    out["status"] = "settled"
    out["result"] = result
    out["draw"] = {
        "numbers": list(draw.get("numbers") or []),
        "stars": list(draw.get("stars") or []),
        "weekday": (draw.get("weekday") or out["weekday"]),
        "star_pool": draw.get("star_pool"),
        "prizes": list(draw.get("prizes") or []),
    }
    return out


def _weighted(items: list[dict[str, Any]]) -> int:
    return sum(normalize_copies(item.get("copies")) for item in items)


def summarize_plays(items: list[dict[str, Any]]) -> dict[str, Any]:
    settled = [item for item in items if item.get("status") == "settled"]
    pending = [item for item in items if item.get("status") != "settled"]
    wins = [
        item
        for item in settled
        if (item.get("result") or {}).get("rank") is not None
    ]
    by_rank: Counter[str] = Counter()
    by_match: Counter[str] = Counter()
    by_source: Counter[str] = Counter()
    by_weekday: Counter[str] = Counter()
    number_played: Counter[int] = Counter()
    star_played: Counter[int] = Counter()
    number_hits: Counter[int] = Counter()
    star_hits: Counter[int] = Counter()
    unique_keys: set[str] = set()
    prize_total = 0.0
    prize_known = 0

    for item in items:
        copies = normalize_copies(item.get("copies"))
        source = normalize_source(item.get("source"))
        by_source[source] += copies
        by_weekday[str(item.get("weekday") or weekday_fr(parse_play_date(item["play_date"])))] += copies
        unique_keys.add(grid_key(list(item.get("numbers") or []), list(item.get("stars") or [])))
        for value in item.get("numbers") or []:
            number_played[int(value)] += copies
        for value in item.get("stars") or []:
            star_played[int(value)] += copies
        result = item.get("result") or {}
        if item.get("status") != "settled":
            continue
        rank = result.get("rank")
        by_rank["none" if rank is None else str(rank)] += copies
        matched_n = int(result.get("matched_numbers") or 0)
        matched_s = int(result.get("matched_stars") or 0)
        by_match[f"{matched_n}+{matched_s}"] += copies
        for value in result.get("winning_numbers") or []:
            number_hits[int(value)] += copies
        for value in result.get("winning_stars") or []:
            star_hits[int(value)] += copies
        prize = result.get("prize")
        if prize is not None:
            prize_total += float(prize)
            prize_known += copies

    settled_n = _weighted(settled)
    win_n = _weighted(wins)
    pending_n = _weighted(pending)
    total_n = _weighted(items)
    rank_rows = []
    for rank in range(1, 14):
        count = by_rank.get(str(rank), 0)
        if count:
            rank_rows.append(
                {
                    "rank": rank,
                    "label": RANK_LABELS[rank],
                    "count": count,
                }
            )
    none_count = by_rank.get("none", 0)
    if none_count:
        rank_rows.append({"rank": None, "label": "Pas de gain", "count": none_count})

    p_hat, lo, hi = wilson_interval(win_n, settled_n) if settled_n else (None, None, None)
    p0 = official_p_any_rank()
    settled_dates = {
        str(item.get("play_date"))[:10]
        for item in settled
        if item.get("play_date") is not None
    }
    binomial = binomial_vs_official(
        len(wins),
        len(settled),
        p0=p0,
        tickets=settled_n,
        draws=len(settled_dates),
    )
    covers_p0 = None if p_hat is None else lo <= p0 <= hi

    return {
        "plays": total_n,
        "tickets": total_n,
        "rows": len(items),
        "pending": pending_n,
        "settled": settled_n,
        "wins": win_n,
        "p_win": (win_n / settled_n) if settled_n else None,
        "p0": p0,
        "wilson": None if p_hat is None else {"p": p_hat, "lo": lo, "hi": hi},
        "covers_p0": covers_p0,
        "binomial": binomial,
        "unique_grids": len(unique_keys),
        "prize_total": prize_total,
        "prize_known": prize_known,
        "by_rank": rank_rows,
        "by_match": [
            {"label": key, "count": count}
            for key, count in sorted(by_match.items(), key=lambda row: (-row[1], row[0]))
        ],
        "by_source": [
            {"id": key, "label": PLAY_SOURCE_LABELS[key], "count": by_source[key]}
            for key in PLAY_SOURCES
            if by_source[key]
        ],
        "by_weekday": [
            {"id": key, "count": count}
            for key, count in sorted(by_weekday.items(), key=lambda row: row[0])
        ],
        "numbers_played": [
            {"value": value, "played": number_played[value], "hits": number_hits[value]}
            for value, _ in number_played.most_common(10)
        ],
        "stars_played": [
            {"value": value, "played": star_played[value], "hits": star_hits[value]}
            for value, _ in star_played.most_common(8)
        ],
    }


def validate_play_grid(numbers: list[int], stars: list[int]) -> tuple[list[int], list[int]]:
    validate_grid(numbers, stars)
    return sorted(numbers), sorted(stars)
