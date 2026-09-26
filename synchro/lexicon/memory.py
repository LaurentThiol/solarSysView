"""Mémoire des fiches : confirmées seulement, embedding local si Ollama répond."""

from __future__ import annotations

import os
from typing import Any

from synchro.brain import cosine


def _symbol(episode: dict[str, Any]) -> str | None:
    sense = episode.get("sense") or {}
    symbol = sense.get("symbol")
    return str(symbol) if symbol else None


def pack_for(
    cards: list[dict[str, Any]],
    episodes: list[dict[str, Any]],
    *,
    weekday: str | None = None,
) -> list[dict[str, Any]]:
    """Fiches confirmées citées par les épisodes. Un brouillon n'entre pas dans le pack."""
    from synchro.lexicon.outcomes import recall_line

    symbols = {symbol for symbol in (_symbol(episode) for episode in episodes) if symbol}
    pack = []
    for card in cards:
        if card.get("status") != "confirmed":
            continue
        if not str(card.get("id") or "").startswith("sense."):
            continue
        if card.get("symbol") not in symbols:
            continue
        outcomes = (card.get("quality") or {}).get("outcomes")
        pack.append(
            {
                "id": card["id"],
                "symbol": card.get("symbol"),
                "status": "confirmed",
                "equation": card.get("equation"),
                "gloss": card.get("gloss"),
                "keywords": list(card.get("keywords") or []),
                "outcomes": outcomes,
                "recall": recall_line(outcomes, weekday) if outcomes else None,
                "skill": (card.get("quality") or {}).get("skill"),
            }
        )
    return pack


def difficulties(cards: list[dict[str, Any]], episodes: list[dict[str, Any]]) -> list[str]:
    """Skill ≤ 0 et brouillon cité sont notés. Ils n'ouvrent pas le cloud."""
    by_symbol = {card.get("symbol"): card for card in cards if card.get("symbol")}
    notes: list[str] = []
    for episode in episodes:
        symbol = _symbol(episode)
        card = by_symbol.get(symbol)
        if card is not None and card.get("status") != "confirmed":
            notes.append(f"draft:{card.get('id')}")
        skill = ((episode.get("facts") or {}).get("skill") or {}).get("skill")
        if isinstance(skill, (int, float)) and not isinstance(skill, bool) and skill <= 0 and symbol:
            notes.append(f"skill:{symbol}")
    return notes


def retrieve(cards: list[dict[str, Any]], symbol: str, query: list[float] | None = None) -> list[dict[str, Any]]:
    """Même symbole, famille `sense.*`, confirmées. Le vecteur classe, il n'ajoute pas de brouillon."""
    family = [
        card
        for card in cards
        if card.get("status") == "confirmed"
        and card.get("symbol") == symbol
        and str(card.get("id") or "").startswith("sense.")
    ]
    if not query:
        return family
    scored: list[tuple[float, dict[str, Any]]] = []
    plain: list[dict[str, Any]] = []
    for card in family:
        vector = card.get("embedding")
        if isinstance(vector, list) and vector:
            scored.append((cosine(query, [float(value) for value in vector]), card))
        else:
            plain.append(card)
    scored.sort(key=lambda item: item[0], reverse=True)
    return [card for _score, card in scored] + plain


def embed_card(card: dict[str, Any]) -> list[float] | None:
    """Ollama uniquement. `None` si le modèle local ne répond pas — pas de cloud."""
    if os.environ.get("PYTEST_CURRENT_TEST") or os.environ.get("SYNCHRO_LEXICON_NO_LLM") == "1":
        return None
    text = " ".join(str(word) for word in (card.get("keywords") or []))
    gloss = str(card.get("gloss") or "").strip()
    phrase = f"{text} {gloss}".strip()
    if not phrase:
        return None
    try:
        from synchro.brain import embed_text

        result = embed_text(phrase, timeout=2)
    except Exception:
        return None
    vector = result.get("embedding") if isinstance(result, dict) else None
    if isinstance(vector, list) and vector:
        return [float(value) for value in vector]
    return None


def remember(store: Any, cards: list[dict[str, Any]]) -> None:
    """Une fiche confirmée sans vecteur, au plus. Un échec local n'interrompt pas la lecture."""
    try:
        held = store.load_embeddings()
    except Exception:
        return
    for card in cards:
        if card.get("status") != "confirmed" or not card.get("id"):
            continue
        if card["id"] in held:
            continue
        vector = embed_card(card)
        if not vector:
            return
        try:
            store.save_embedding(card["id"], vector)
        except Exception:
            return
        return
