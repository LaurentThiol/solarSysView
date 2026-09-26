"""Lecture, fiches, mode automatique. Le cloud attend une confirmation explicite."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable

from synchro.lexicon.helptext import ask_local, drafts_for, local_question
from synchro.lexicon.reading import build_reading
from synchro.lexicon.store import LexiconStore

Ask = Callable[[str], str | None]


def _stamp() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def prepare_reading(
    draws: list[dict[str, Any]],
    *,
    weekday: str | None = None,
    store: LexiconStore | None = None,
    specialists: list[dict[str, Any]] | None = None,
    shuffles: int = 24,
) -> dict[str, Any]:
    reading = build_reading(
        draws,
        weekday=weekday,
        shuffles=shuffles,
        specialists=specialists,
    )
    reading["id"] = uuid.uuid4().hex
    reading["created_at"] = _stamp()
    held = store or LexiconStore()
    from synchro.lexicon.outcomes import merge_episodes, replay_open

    ledger = replay_open(draws, merge_episodes(held.load_episodes(), reading.get("episodes") or []))
    held.save_episodes(ledger)
    if reading["opens_llm"]:
        ids = {card["id"] for card in held.load_cards()}
        for draft in drafts_for(reading, ids):
            held.save_card(draft)
    _touch_quality(held, reading, ledger)
    from synchro.lexicon.memory import difficulties, pack_for

    cards = held.load_cards()
    reading["pack"] = pack_for(cards, reading.get("episodes") or [], weekday=reading.get("weekday"))
    reading["difficulties"] = difficulties(cards, reading.get("episodes") or [])
    reading["question"] = local_question(reading) if reading["opens_llm"] else None
    held.save_reading(reading)
    return reading


def _touch_quality(store: LexiconStore, reading: dict[str, Any], ledger: list[dict[str, Any]]) -> None:
    from synchro.lexicon.cards import fiche_id_from_symbol
    from synchro.lexicon.outcomes import tally_by_symbol

    skills: dict[str, Any] = {}
    for episode in reading.get("episodes") or []:
        symbol = (episode.get("sense") or {}).get("symbol")
        skill = ((episode.get("facts") or {}).get("skill") or {}).get("skill")
        if symbol and isinstance(skill, (int, float)) and not isinstance(skill, bool):
            skills[symbol] = skill
    cards = {card["id"]: card for card in store.load_cards()}
    for symbol, counts in tally_by_symbol(ledger).items():
        card_id = fiche_id_from_symbol(symbol)
        card = cards.get(card_id or "")
        if not card or card.get("status") != "confirmed":
            continue
        quality = dict(card.get("quality") or {})
        quality["outcomes"] = counts
        quality["episodes"] = sum(sum(day.values()) for day in counts.values())
        if symbol in skills:
            quality["skill"] = skills[symbol]
        quality["reviewed"] = reading.get("created_at")
        store.update_card(card_id, {"quality": quality})


def run_if_automatic(
    draws: list[dict[str, Any]],
    *,
    weekday: str | None = None,
    store: LexiconStore | None = None,
    ask: Ask | None = None,
    specialists: list[dict[str, Any]] | None = None,
    shuffles: int = 24,
) -> dict[str, Any] | None:
    held = store or LexiconStore()
    if not held.load_mode().get("automatic"):
        return None
    reading = prepare_reading(
        draws,
        weekday=weekday,
        store=held,
        specialists=specialists,
        shuffles=shuffles,
    )
    if not reading["opens_llm"]:
        return reading
    caller = ask if ask is not None else ask_local
    answers = []
    for _item in (reading.get("oppositions") or [])[:3]:
        text = caller(reading["question"] or "")
        answers.append({"provider": "local" if text else "queued", "text": text})
    reading["local_answers"] = answers
    held.save_reading(reading)
    return reading


def answer_help(
    reading: dict[str, Any],
    *,
    escalate: bool = False,
    cloud_note: str | None = None,
    ask: Ask | None = None,
    store: LexiconStore | None = None,
) -> dict[str, Any]:
    """Le modèle local répond d'abord. Le cloud n'écrit une note que si on le confirme."""
    question = reading.get("question") or local_question(reading)
    if store is not None and reading.get("opens_llm") and not escalate:
        from synchro.lexicon.memory import remember

        remember(store, reading.get("pack") or [])
    if not reading.get("opens_llm"):
        return {
            "ok": True,
            "provider": "local",
            "question": question,
            "text": None,
            "escalate": False,
            "awaiting_note": True,
        }
    if not escalate:
        caller = ask if ask is not None else ask_local
        text = caller(question) if reading.get("opens_llm") else None
        return {
            "ok": True,
            "provider": "local" if text else "queued",
            "question": question,
            "text": text,
            "escalate": False,
        }
    note = (cloud_note or "").strip()
    if not note:
        return {
            "ok": True,
            "provider": "local",
            "question": question,
            "text": None,
            "escalate": False,
            "awaiting_note": True,
        }
    return {
        "ok": True,
        "provider": "cloud",
        "question": question,
        "text": note,
        "escalate": True,
        "note": {"author": "brain", "provider": "cloud", "body": note},
    }


def load_draws_for_read(*, era: str = "current") -> list[dict[str, Any]]:
    from synchro import db

    return [db.serialize_draw(row) for row in db.all_draws(era=era)]


def specialist_rows(root: Path | None = None) -> list[dict[str, Any]]:
    try:
        from synchro.brain_specialists.train import list_specialists
    except Exception:
        return []
    try:
        return [row for row in list_specialists(root=root) if row.get("target") in {"sum", "parity"}]
    except Exception:
        return []
