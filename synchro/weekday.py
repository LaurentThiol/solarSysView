"""Filtre mardi / vendredi (insensible à la casse). Pas de mercredi."""

from __future__ import annotations

from contextvars import ContextVar, Token
from typing import Any, Iterable

_request_weekday: ContextVar[str | None] = ContextVar("request_weekday", default=None)


def normalize_weekday_filter(value: str | None) -> str | None:
    text = str(value or "").strip().lower()
    if text in {"mardi", "vendredi"}:
        return text
    return None


def bind_request_weekday(value: str | None) -> Token[str | None]:
    return _request_weekday.set(normalize_weekday_filter(value))


def reset_request_weekday(token: Token[str | None]) -> None:
    _request_weekday.reset(token)


def request_weekday() -> str | None:
    return _request_weekday.get()


def weekday_of(draw: dict[str, Any]) -> str:
    return str(draw.get("weekday") or "").strip().lower()


def filter_draws_by_weekday(
    draws: Iterable[dict[str, Any]],
    weekday: str | None = None,
) -> list[dict[str, Any]]:
    day = normalize_weekday_filter(weekday)
    rows = list(draws)
    if not day:
        return rows
    return [draw for draw in rows if weekday_of(draw) == day]


def draw_weekday_clause(
    weekday: str | None,
    params: dict[str, Any],
) -> str | None:
    day = normalize_weekday_filter(weekday)
    if not day:
        return None
    params["weekday"] = day
    return "LOWER(COALESCE(weekday, '')) = %(weekday)s"
