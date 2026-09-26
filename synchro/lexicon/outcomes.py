"""Carnet d'issues : une fenêtre ouverte se ferme quand l'horizon est passé."""

from __future__ import annotations

from typing import Any, Sequence

from synchro.analysis.common import filter_draws_by_weekday, ordered_draws
from synchro.analysis.variables import series as extract_series
from synchro.lexicon.episode import close_outcome

HORIZON = 5
DAYS = ("tous", "mardi", "vendredi")
_STATUSES = ("reached", "invalidated", "open")


def episode_key(episode: dict[str, Any]) -> str:
    facts = episode.get("facts") or {}
    day = facts.get("weekday") or "tous"
    end = str(episode.get("to_date") or "")[:10]
    return f"{day}|{episode.get('series')}|{facts.get('length')}|{end}"


def empty_outcomes() -> dict[str, dict[str, int]]:
    return {day: {status: 0 for status in _STATUSES} for day in DAYS}


def merge_episodes(ledger: Sequence[dict[str, Any]], fresh: Sequence[dict[str, Any]]) -> list[dict[str, Any]]:
    """Une fenêtre ne revient pas à `open` une fois son issue écrite."""
    by_key: dict[str, dict[str, Any]] = {}
    for episode in ledger:
        if episode.get("sense"):
            by_key[episode_key(episode)] = episode
    for episode in fresh:
        if not episode.get("sense"):
            continue
        key = episode_key(episode)
        previous = by_key.get(key)
        status = ((previous or {}).get("outcome") or {}).get("status")
        if status in {"reached", "invalidated"}:
            episode = {**episode, "outcome": previous["outcome"]}
        by_key[key] = episode
    rows = list(by_key.values())
    rows.sort(key=lambda episode: str(episode.get("to_date") or ""))
    opened = [episode for episode in rows if (episode.get("outcome") or {}).get("status") == "open"]
    closed = [episode for episode in rows if (episode.get("outcome") or {}).get("status") != "open"]
    if len(closed) > 360:
        closed = closed[-360:]
    return closed + opened


def replay_open(
    draws: Sequence[dict[str, Any]],
    episodes: Sequence[dict[str, Any]],
    *,
    horizon: int = HORIZON,
) -> list[dict[str, Any]]:
    """Ferme les épisodes dont au moins `horizon` tirages suivent la fenêtre."""
    updated = []
    for episode in episodes:
        if (episode.get("outcome") or {}).get("status") != "open":
            updated.append(episode)
            continue
        closed = _close_if_ready(draws, episode, horizon)
        if closed is None:
            updated.append(episode)
        else:
            updated.append({**episode, "outcome": closed})
    return updated


def _close_if_ready(draws: Sequence[dict[str, Any]], episode: dict[str, Any], horizon: int) -> dict[str, Any] | None:
    sense = episode.get("sense") or {}
    name = sense.get("sense")
    if name not in {"monte", "baisse", "stable"}:
        return None
    day = (episode.get("facts") or {}).get("weekday") or "tous"
    filtered = filter_draws_by_weekday(draws, None if day == "tous" else day)
    ordered = ordered_draws(filtered)
    payload = extract_series(list(ordered), str(episode.get("series") or "sum"))
    points = payload.get("points") or []
    values = [float(point["value"]) for point in points]
    dates = [str(point["date"])[:10] for point in points]
    target = str(episode.get("to_date") or "")[:10]
    if target not in dates:
        return None
    index = dates.index(target)
    if len(values) - 1 - index < horizon:
        return None
    return close_outcome(values, index, name, horizon=horizon, sigma=sense.get("sigma"))


def tally_by_symbol(episodes: Sequence[dict[str, Any]]) -> dict[str, dict[str, dict[str, int]]]:
    """Comptes par symbole et par jour. Le skill de remaniement n'entre pas ici."""
    tallies: dict[str, dict[str, dict[str, int]]] = {}
    for episode in episodes:
        symbol = (episode.get("sense") or {}).get("symbol")
        if not symbol:
            continue
        day = (episode.get("facts") or {}).get("weekday") or "tous"
        if day not in DAYS:
            day = "tous"
        status = (episode.get("outcome") or {}).get("status") or "open"
        if status not in _STATUSES:
            status = "open"
        bucket = tallies.setdefault(symbol, empty_outcomes())
        bucket[day][status] += 1
    return tallies


def recall_line(outcomes: dict[str, Any] | None, weekday: str | None) -> str:
    day = weekday if weekday in DAYS else "tous"
    bucket = (outcomes or {}).get(day) or {}
    return (
        f"Rappel {day} : {int(bucket.get('reached') or 0)} suivis, "
        f"{int(bucket.get('invalidated') or 0)} invalidés, "
        f"{int(bucket.get('open') or 0)} ouverts."
    )
