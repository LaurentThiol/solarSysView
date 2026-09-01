from __future__ import annotations

from collections import Counter
from datetime import date
from typing import Any

from synchro.fdj import CURRENT_FORMAT_START


def compute_stats(draws: list[dict[str, Any]]) -> dict[str, Any]:
    if not draws:
        return {
            "draw_count": 0,
            "from_date": None,
            "to_date": None,
            "numbers": [],
            "stars": [],
            "even_odd": {},
            "sum": {},
        }

    ordered = sorted(draws, key=lambda d: _as_date(d["draw_date"]))
    last_date = _as_date(ordered[-1]["draw_date"])
    star_max = max(int(d.get("star_pool") or 12) for d in ordered)

    number_freq = Counter()
    star_freq = Counter()
    last_seen_n: dict[int, date] = {}
    last_seen_s: dict[int, date] = {}
    even_odd = Counter()
    sums: list[int] = []

    for draw in ordered:
        draw_date = _as_date(draw["draw_date"])
        numbers = [int(n) for n in draw["numbers"]]
        stars = [int(s) for s in draw["stars"]]
        number_freq.update(numbers)
        star_freq.update(stars)
        for n in numbers:
            last_seen_n[n] = draw_date
        for s in stars:
            last_seen_s[s] = draw_date
        even = sum(1 for n in numbers if n % 2 == 0)
        even_odd[f"{even}p/{5 - even}i"] += 1
        sums.append(sum(numbers))

    def delay(last: date | None) -> int | None:
        if last is None:
            return None
        return (last_date - last).days

    numbers_out = []
    for n in range(1, 51):
        seen = last_seen_n.get(n)
        numbers_out.append(
            {
                "value": n,
                "count": int(number_freq.get(n, 0)),
                "last_seen": seen.isoformat() if seen else None,
                "delay_days": delay(seen),
            }
        )
    stars_out = []
    for s in range(1, star_max + 1):
        seen = last_seen_s.get(s)
        stars_out.append(
            {
                "value": s,
                "count": int(star_freq.get(s, 0)),
                "last_seen": seen.isoformat() if seen else None,
                "delay_days": delay(seen),
            }
        )

    avg_sum = round(sum(sums) / len(sums), 1)
    return {
        "draw_count": len(ordered),
        "from_date": _as_date(ordered[0]["draw_date"]).isoformat(),
        "to_date": last_date.isoformat(),
        "current_format": _as_date(ordered[0]["draw_date"]) >= CURRENT_FORMAT_START,
        "numbers": numbers_out,
        "stars": stars_out,
        "even_odd": dict(even_odd),
        "sum": {
            "min": min(sums),
            "max": max(sums),
            "avg": avg_sum,
        },
        "hottest_numbers": sorted(numbers_out, key=lambda x: (-x["count"], x["value"]))[:10],
        "coldest_numbers": sorted(numbers_out, key=lambda x: (x["count"], x["value"]))[:10],
        "overdue_numbers": sorted(
            [x for x in numbers_out if x["delay_days"] is not None],
            key=lambda x: -x["delay_days"],
        )[:10],
        "hottest_stars": sorted(stars_out, key=lambda x: (-x["count"], x["value"]))[:5],
        "overdue_stars": sorted(
            [x for x in stars_out if x["delay_days"] is not None],
            key=lambda x: -x["delay_days"],
        )[:5],
    }


def _as_date(value: date | str) -> date:
    if isinstance(value, date):
        return value
    return date.fromisoformat(str(value)[:10])
