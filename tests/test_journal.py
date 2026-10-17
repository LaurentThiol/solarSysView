"""Journal de suivi : schéma, import idempotent, fiches refusées."""

from datetime import date
from pathlib import Path
import subprocess

import pytest

from synchro.db import SCHEMA_SQL
from synchro.journal import JournalError, entries_to_insert, load_journal_documents, parse_journal_entry

ROOT = Path(__file__).resolve().parents[1]


def test_schema_has_dev_journal() -> None:
    assert "CREATE TABLE IF NOT EXISTS dev_journal" in SCHEMA_SQL
    assert "hidden" in SCHEMA_SQL
    assert "prs" in SCHEMA_SQL
    source = (ROOT / "synchro" / "db.py").read_text(encoding="utf-8")
    assert "ON CONFLICT (slug) DO NOTHING" in source


def test_missing_title_is_refused() -> None:
    with pytest.raises(JournalError, match="title"):
        parse_journal_entry(
            {
                "slug": "evolution",
                "happened_on": "2026-10-17",
                "area": "Évolution",
                "title": "  ",
                "body": "Texte.",
            },
            source="agent",
        )


def test_pr_point_without_date_is_refused() -> None:
    with pytest.raises(JournalError, match="date"):
        parse_journal_entry(
            {
                "slug": "evolution",
                "happened_on": "2026-10-17",
                "area": "Évolution",
                "title": "Annuel",
                "body": "Texte.",
                "prs": [{"number": 311, "title": "segments", "url": "https://example.test/311"}],
            },
            source="seed",
        )


def test_existing_slug_is_skipped() -> None:
    entry = parse_journal_entry(
        {
            "slug": "evolution",
            "happened_on": "2026-10-17",
            "area": "Évolution",
            "title": "Annuel",
            "body": "Texte corrigé dans l’interface.",
        },
        source="seed",
    )
    assert entries_to_insert({"evolution"}, set(), [entry]) == []
    fresh = entries_to_insert(set(), set(), [entry])
    assert len(fresh) == 1
    assert fresh[0]["happened_on"] == date(2026, 10, 17)
    again = dict(entry)
    assert entries_to_insert(set(), set(), [entry, again]) == [entry]


def test_existing_pr_number_is_skipped() -> None:
    entry = parse_journal_entry(
        {
            "slug": "annuel-verts",
            "happened_on": "2026-10-17",
            "area": "Évolution",
            "title": "Segments",
            "body": "Texte.",
            "pr_number": 311,
        },
        source="agent",
    )
    assert entries_to_insert(set(), {311}, [entry]) == []


def test_seed_lists_every_merged_pr_with_a_date() -> None:
    documents = load_journal_documents(ROOT)
    assert len(documents) >= 20
    numbers = [point["number"] for entry in documents for point in entry["prs"]]
    assert len(numbers) == len(set(numbers))
    assert 1 in numbers
    assert 312 in numbers
    assert 313 in numbers
    assert all(point["merged_on"] for entry in documents for point in entry["prs"])
    assert all(entry["source"] == "seed" for entry in documents)


def test_agents_instructions_are_tracked() -> None:
    text = (ROOT / "AGENTS.md").read_text(encoding="utf-8")
    assert "docs/journal/inbox" in text
    assert "Journal : inchangé" in text
    ignore = (ROOT / ".gitignore").read_text(encoding="utf-8")
    assert "\nAGENTS.md\n" not in ignore
    template = (ROOT / ".github" / "pull_request_template.md").read_text(encoding="utf-8")
    assert "Journal" in template


def test_journal_nav_and_filters() -> None:
    result = subprocess.run(
        [
            "node",
            "--experimental-strip-types",
            "--import",
            str(ROOT / "tests" / "node-register.mjs"),
            "--test",
            str(ROOT / "tests" / "test_nav.ts"),
            str(ROOT / "tests" / "test_journal.ts"),
        ],
        cwd=ROOT,
        capture_output=True,
        text=True,
    )
    assert result.returncode == 0, result.stdout + result.stderr
