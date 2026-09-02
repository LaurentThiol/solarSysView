from __future__ import annotations

from datetime import date
from typing import Any, Iterable


def as_date(value: date | str) -> date:
    if isinstance(value, date):
        return value
    return date.fromisoformat(str(value)[:10])


def numbers_of(draw: dict[str, Any]) -> list[int]:
    return [int(n) for n in draw["numbers"]]


def stars_of(draw: dict[str, Any]) -> list[int]:
    return [int(s) for s in draw["stars"]]


def weekday_of(draw: dict[str, Any]) -> str:
    return str(draw.get("weekday") or "").strip().lower()


def ordered_draws(draws: Iterable[dict[str, Any]]) -> list[dict[str, Any]]:
    return sorted(draws, key=lambda d: as_date(d["draw_date"]))


def iso(value: date) -> str:
    return value.isoformat()
