"""Journal des grilles jouées (histoJeux) : scoring vs tirage FDJ, stats descriptives."""

from __future__ import annotations

from collections import Counter
from datetime import date
from typing import Any

from synchro.analysis.inference import wilson_interval
from synchro.ranks import RANK_LABELS, evaluate_grid, validate_grid

PLAY_SOURCES = ("combinaisons", "jeux", "manuel")
PLAY_SOURCE_LABELS = {
    "combinaisons": "Combinaisons",
    "jeux": "Jeux",
    "manuel": "Manuel",
}
MAX_COPIES = 20
PLAY_DATE_WEEKDAYS = (1, 4)  # mardi, vendredi


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


def weekday_fr(day: date) -> str:
    names = ("lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche")
    return names[day.weekday()]


def grid_key(numbers: list[int], stars: list[int]) -> str:
    nums = ",".join(str(n) for n in sorted(numbers))
    ets = ",".join(str(s) for s in sorted(stars))
    return f"{nums}|{ets}"


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
    out = {
        **play,
        "numbers": sorted(int(n) for n in numbers),
        "stars": sorted(int(s) for s in stars),
        "copies": copies,
        "source": source,
        "source_label": PLAY_SOURCE_LABELS[source],
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
    out["status"] = "settled"
    out["result"] = result
    out["draw"] = {
        "numbers": list(draw.get("numbers") or []),
        "stars": list(draw.get("stars") or []),
        "weekday": (draw.get("weekday") or out["weekday"]),
        "star_pool": draw.get("star_pool"),
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

    return {
        "plays": total_n,
        "tickets": total_n,
        "rows": len(items),
        "pending": pending_n,
        "settled": settled_n,
        "wins": win_n,
        "p_win": (win_n / settled_n) if settled_n else None,
        "wilson": None if p_hat is None else {"p": p_hat, "lo": lo, "hi": hi},
        "unique_grids": len(unique_keys),
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
