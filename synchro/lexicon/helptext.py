"""Question bornée au modèle local. Le cloud n'est pas appelé ici."""

from __future__ import annotations

import json
import os
from typing import Any
from urllib import request as urlrequest

from synchro.lexicon.cards import draft_tension


def local_question(reading: dict[str, Any]) -> str:
    lines = [
        "Quels faits manquent pour lire les oppositions déjà mesurées ?",
        "Ne pas ajouter de nombre qui ne soit pas dans la demande.",
        "Citer le champ, la longueur, le jour et la phase.",
    ]
    for item in reading.get("oppositions") or []:
        kind = item.get("kind")
        if kind == "horizon":
            lines.append(f"Horizon opposé sur {item.get('field')} entre 20 et 100.")
        elif kind == "relecture":
            lines.append(
                f"Relecture {item.get('length')} sur {item.get('field')} : "
                f"{item.get('study')} contre {item.get('previous')}."
            )
        elif kind == "libre":
            lines.append(
                f"Champs libres opposés à {item.get('length')} : "
                f"{item.get('left')} {item.get('left_sense')}, {item.get('right')} {item.get('right_sense')}."
            )
        elif kind == "forme":
            lines.append(f"Triplet d'étendue opposé à {item.get('length')} (spread, n1, n5).")
        elif kind == "ref":
            lines.append(
                f"Quart {item.get('clock')} différent entre 20 et 100 sur {item.get('field')}. "
                "Ce n'est pas une cause, c'est un autre endroit du calendrier."
            )
        elif kind == "specialiste":
            lines.append(f"Forecast spécialiste opposé au sens de {item.get('field')}, skill > 0.")
    for card in reading.get("pack") or []:
        if card.get("status") != "confirmed":
            continue
        lines.append(f"Fiche confirmée {card.get('id')} : {card.get('gloss')}.")
    return " ".join(lines)


def drafts_for(reading: dict[str, Any], existing_ids: set[str]) -> list[dict[str, Any]]:
    drafts = []
    for item in reading.get("oppositions") or []:
        if item.get("kind") != "libre":
            continue
        left, right = str(item.get("left")), str(item.get("right"))
        card = draft_tension(
            left,
            right,
            detail=(
                f"À {item.get('length')} tirages, {left} est {item.get('left_sense')} "
                f"et {right} est {item.get('right_sense')}."
            ),
        )
        if card["id"] in existing_ids:
            continue
        drafts.append(card)
        existing_ids.add(card["id"])
    return drafts[:3]


def ask_local(question: str, *, timeout: float = 4.0) -> str | None:
    """Un tour Ollama. `None` si le modèle local ne répond pas — pas de bascule cloud."""
    if os.environ.get("SYNCHRO_LEXICON_NO_LLM") == "1":
        return None
    base = (os.environ.get("LOCAL_LLM_BASE_URL") or os.environ.get("OLLAMA_HOST") or "http://127.0.0.1:11434").rstrip("/")
    model = (os.environ.get("LOCAL_LLM_MODEL") or "llama3.2").strip()
    body = json.dumps(
        {"model": model, "prompt": question, "stream": False},
        ensure_ascii=False,
    ).encode("utf-8")
    req = urlrequest.Request(
        f"{base}/api/generate",
        data=body,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urlrequest.urlopen(req, timeout=timeout) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except (OSError, json.JSONDecodeError, UnicodeDecodeError, TimeoutError):
        return None
    text = str(payload.get("response") or "").strip()
    return text or None
