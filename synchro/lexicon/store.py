"""Journal local atomique, et miroir Neon quand il répond."""

from __future__ import annotations

import json
import os
import tempfile
from pathlib import Path
from typing import Any

from synchro.config import ROOT
from synchro.lexicon.cards import seed_cards

LEXICON_DIR = ROOT / ".brain" / "lexicon"


def atomic_write(path: Path, data: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp_name = tempfile.mkstemp(dir=str(path.parent), prefix=f".{path.name}.")
    tmp = Path(tmp_name)
    try:
        os.write(fd, data)
        os.fsync(fd)
        os.close(fd)
        fd = -1
        os.replace(tmp, path)
    finally:
        if fd >= 0:
            os.close(fd)
        if tmp.exists():
            tmp.unlink()


def _append_journal(path: Path, line: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = (json.dumps(line, ensure_ascii=False) + "\n").encode("utf-8")
    with path.open("ab") as handle:
        handle.write(payload)
        handle.flush()
        os.fsync(handle.fileno())


def _read_json(path: Path) -> Any | None:
    if not path.exists():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError, UnicodeDecodeError):
        return None


def _replay(journal: Path) -> list[dict[str, Any]]:
    if not journal.exists():
        return []
    cards: dict[str, dict[str, Any]] = {}
    try:
        text = journal.read_text(encoding="utf-8")
    except (OSError, UnicodeDecodeError):
        return []
    for raw in text.splitlines():
        raw = raw.strip()
        if not raw:
            continue
        try:
            line = json.loads(raw)
        except json.JSONDecodeError:
            continue
        card = line.get("card")
        if isinstance(card, dict) and card.get("id"):
            current = cards.get(card["id"])
            if current is None or int(card.get("revision") or 0) >= int(current.get("revision") or 0):
                cards[card["id"]] = card
    return [cards[key] for key in sorted(cards)]


class LexiconStore:
    def __init__(self, root: Path | None = None) -> None:
        self.root = root or LEXICON_DIR
        self.journal = self.root / "journal.jsonl"
        self.cards_path = self.root / "cards.json"
        self.mode_path = self.root / "mode.json"
        self.readings_path = self.root / "readings.json"
        self.episodes_path = self.root / "episodes.json"
        self.embeddings_path = self.root / "embeddings.json"
        self.images = self.root / "images"

    def load_cards(self) -> list[dict[str, Any]]:
        snapshot = _read_json(self.cards_path)
        rows = snapshot.get("cards") if isinstance(snapshot, dict) else None
        if isinstance(rows, list) and rows and all(isinstance(row, dict) for row in rows):
            return rows
        replayed = _replay(self.journal)
        if replayed:
            return replayed
        return self._seed()

    def _seed(self) -> list[dict[str, Any]]:
        cards = seed_cards()
        for card in cards:
            self.save_card(card, mirror=False)
        return self.load_cards()

    def save_card(self, card: dict[str, Any], *, mirror: bool = True) -> dict[str, Any]:
        _append_journal(self.journal, {"op": "upsert", "card": card})
        svg = card.get("image_svg") or ""
        if svg:
            atomic_write(self.images / f"{card['id']}.svg", str(svg).encode("utf-8"))
        cards = _replay(self.journal)
        atomic_write(
            self.cards_path,
            json.dumps({"cards": cards}, ensure_ascii=False).encode("utf-8"),
        )
        if mirror:
            _mirror_card(card)
        return card

    def update_card(self, card_id: str, patch: dict[str, Any]) -> dict[str, Any] | None:
        current = next((card for card in self.load_cards() if card["id"] == card_id), None)
        if current is None:
            return None
        merged = {**current, **{key: value for key, value in patch.items() if value is not None}}
        merged["id"] = card_id
        merged["revision"] = int(current.get("revision") or 1) + 1
        if patch.get("status") in {"draft", "confirmed"}:
            merged["status"] = patch["status"]
        return self.save_card(merged)

    def load_mode(self) -> dict[str, Any]:
        payload = _read_json(self.mode_path)
        if isinstance(payload, dict):
            return {"automatic": bool(payload.get("automatic"))}
        return {"automatic": False}

    def save_mode(self, automatic: bool) -> dict[str, Any]:
        mode = {"automatic": bool(automatic)}
        atomic_write(self.mode_path, json.dumps(mode).encode("utf-8"))
        return mode

    def save_reading(self, reading: dict[str, Any]) -> dict[str, Any]:
        payload = _read_json(self.readings_path)
        rows = payload.get("readings") if isinstance(payload, dict) else []
        if not isinstance(rows, list):
            rows = []
        rows.append(reading)
        rows = rows[-40:]
        atomic_write(
            self.readings_path,
            json.dumps({"readings": rows}, ensure_ascii=False).encode("utf-8"),
        )
        _mirror_reading(reading)
        return reading

    def load_embeddings(self) -> dict[str, list[float]]:
        payload = _read_json(self.embeddings_path)
        vectors = payload.get("vectors") if isinstance(payload, dict) else None
        if not isinstance(vectors, dict):
            return {}
        return {str(key): value for key, value in vectors.items() if isinstance(value, list)}

    def save_embedding(self, card_id: str, vector: list[float]) -> None:
        vectors = self.load_embeddings()
        vectors[card_id] = vector
        atomic_write(
            self.embeddings_path,
            json.dumps({"vectors": vectors}).encode("utf-8"),
        )

    def load_episodes(self) -> list[dict[str, Any]]:
        payload = _read_json(self.episodes_path)
        rows = payload.get("episodes") if isinstance(payload, dict) else None
        if not isinstance(rows, list):
            return []
        return [row for row in rows if isinstance(row, dict)]

    def save_episodes(self, episodes: list[dict[str, Any]]) -> list[dict[str, Any]]:
        atomic_write(
            self.episodes_path,
            json.dumps({"episodes": episodes}, ensure_ascii=False).encode("utf-8"),
        )
        return episodes

    def load_readings(self) -> list[dict[str, Any]]:
        payload = _read_json(self.readings_path)
        rows = payload.get("readings") if isinstance(payload, dict) else []
        if not isinstance(rows, list):
            return []
        return rows


def _mirror_enabled() -> bool:
    # Sous pytest le miroir Neon n'est pas le sujet : le journal local l'est.
    return not os.environ.get("PYTEST_CURRENT_TEST")


def _mirror_card(card: dict[str, Any]) -> None:
    if not _mirror_enabled():
        return
    try:
        from synchro import db

        db.upsert_lexicon_card(card)
    except Exception:
        return


def _mirror_reading(reading: dict[str, Any]) -> None:
    if not _mirror_enabled():
        return
    try:
        from synchro import db

        db.insert_lexicon_reading(reading)
    except Exception:
        return
