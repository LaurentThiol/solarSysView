"""Journal de suivi des modifications. Validation sans base, importée par init_db."""

from __future__ import annotations

import json
import re
import secrets
from datetime import date, datetime
from pathlib import Path
from typing import Any

SOURCES = frozenset({"seed", "agent", "dev"})
SLUG_RE = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


class JournalError(ValueError):
    """Fiche de journal illisible."""


def journal_root(root: Path | None = None) -> Path:
    base = root if root is not None else Path(__file__).resolve().parents[1]
    return base / "docs" / "journal"


def new_dev_slug() -> str:
    return "dev-" + secrets.token_hex(4)


def parse_journal_entry(raw: Any, *, source: str, origin: str = "fiche") -> dict[str, Any]:
    if not isinstance(raw, dict):
        raise JournalError(f"{origin} : une fiche est un objet.")
    if source not in SOURCES:
        raise JournalError(f"{origin} : source inconnue.")
    file_source = raw.get("source", source)
    if file_source not in SOURCES:
        raise JournalError(f"{origin} : source inconnue.")
    slug = _required_text(raw, "slug", origin)
    if not SLUG_RE.fullmatch(slug):
        raise JournalError(f"{origin} : slug invalide ({slug}).")
    happened = _required_date(raw, "happened_on", origin)
    area = _required_text(raw, "area", origin)
    title = _required_text(raw, "title", origin)
    body = _required_text(raw, "body", origin)
    pr_number = _optional_int(raw.get("pr_number"), origin, "pr_number")
    pr_url = _optional_text(raw.get("pr_url"))
    prs = _parse_prs(raw.get("prs", []), origin)
    return {
        "slug": slug,
        "happened_on": happened,
        "area": area,
        "title": title,
        "body": body,
        "pr_number": pr_number,
        "pr_url": pr_url,
        "prs": prs,
        "source": file_source,
    }


def load_journal_documents(root: Path | None = None) -> list[dict[str, Any]]:
    folder = journal_root(root)
    documents: list[dict[str, Any]] = []
    seed = folder / "seed.json"
    if seed.is_file():
        documents.extend(_read_file(seed, default_source="seed"))
    inbox = folder / "inbox"
    if inbox.is_dir():
        for path in sorted(inbox.glob("*.json")):
            documents.extend(_read_file(path, default_source="agent"))
    return documents


def entries_to_insert(
    existing_slugs: set[str],
    existing_pr_numbers: set[int],
    entries: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """Ignore un slug ou un numéro de PR déjà en base. N’écrase rien."""
    slugs = set(existing_slugs)
    numbers = set(existing_pr_numbers)
    pending: list[dict[str, Any]] = []
    for entry in entries:
        slug = entry["slug"]
        number = entry.get("pr_number")
        if slug in slugs:
            continue
        if isinstance(number, int) and number in numbers:
            continue
        slugs.add(slug)
        if isinstance(number, int):
            numbers.add(number)
        pending.append(entry)
    return pending


def _read_file(path: Path, *, default_source: str) -> list[dict[str, Any]]:
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise JournalError(f"{path.name} : JSON illisible.") from exc
    rows = payload if isinstance(payload, list) else [payload]
    return [
        parse_journal_entry(row, source=default_source, origin=path.name)
        for row in rows
    ]


def _required_text(raw: dict[str, Any], key: str, origin: str) -> str:
    value = raw.get(key)
    if not isinstance(value, str) or not value.strip():
        raise JournalError(f"{origin} : {key} manquant.")
    return value.strip()


def _optional_text(value: Any) -> str | None:
    if value is None:
        return None
    if not isinstance(value, str):
        return None
    text = value.strip()
    return text or None


def _optional_int(value: Any, origin: str, key: str) -> int | None:
    if value is None or value == "":
        return None
    if isinstance(value, bool) or not isinstance(value, int):
        raise JournalError(f"{origin} : {key} doit être un entier.")
    return value


def _required_date(raw: dict[str, Any], key: str, origin: str) -> date:
    value = raw.get(key)
    if not isinstance(value, str) or not DATE_RE.fullmatch(value):
        raise JournalError(f"{origin} : {key} doit être une date AAAA-MM-JJ.")
    try:
        return date.fromisoformat(value)
    except ValueError as exc:
        raise JournalError(f"{origin} : {key} n’est pas une date.") from exc


def _parse_prs(value: Any, origin: str) -> list[dict[str, Any]]:
    if value is None:
        return []
    if not isinstance(value, list):
        raise JournalError(f"{origin} : prs doit être une liste.")
    points: list[dict[str, Any]] = []
    for index, item in enumerate(value, start=1):
        if not isinstance(item, dict):
            raise JournalError(f"{origin} : point de PR {index} illisible.")
        number = item.get("number")
        if isinstance(number, bool) or not isinstance(number, int):
            raise JournalError(f"{origin} : point de PR {index} sans numéro.")
        title = item.get("title")
        if not isinstance(title, str) or not title.strip():
            raise JournalError(f"{origin} : point de PR {index} sans titre.")
        merged = item.get("merged_on")
        if not isinstance(merged, str) or not DATE_RE.fullmatch(merged):
            raise JournalError(f"{origin} : point de PR sans date.")
        try:
            date.fromisoformat(merged)
        except ValueError as exc:
            raise JournalError(f"{origin} : point de PR sans date.") from exc
        url = item.get("url", "")
        if not isinstance(url, str):
            raise JournalError(f"{origin} : point de PR {index} sans URL.")
        points.append(
            {
                "number": number,
                "title": title.strip(),
                "merged_on": merged,
                "url": url.strip(),
            }
        )
    return points


def entry_for_create(raw: dict[str, Any]) -> dict[str, Any]:
    """Fiche écrite depuis l’interface. Le slug est attribué ici."""
    payload = dict(raw)
    payload["slug"] = new_dev_slug()
    payload.setdefault("source", "dev")
    if not payload.get("happened_on"):
        payload["happened_on"] = datetime.now().date().isoformat()
    pr_number = payload.get("pr_number")
    prs = payload.get("prs") or []
    if pr_number and not prs:
        payload["prs"] = [
            {
                "number": pr_number,
                "title": str(payload.get("title") or "").strip(),
                "merged_on": payload["happened_on"],
                "url": str(payload.get("pr_url") or "").strip(),
            }
        ]
    return parse_journal_entry(payload, source="dev", origin="saisie")
