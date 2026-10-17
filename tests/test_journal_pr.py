"""Brouillon de journal posté sur une pull request."""

from pathlib import Path

from synchro.journal_pr import (
    INCHANGE,
    area_of,
    branch_slug,
    comment_for_pull_request,
    journal_section_is_filled,
)

ROOT = Path(__file__).resolve().parents[1]
TEMPLATE = """## Journal

<!-- Brouillon (zone, titre, paragraphe) ou « Journal : inchangé ». -->

Journal :
"""


def _comment(**overrides: object) -> str | None:
    payload = {
        "title": "Annuel : segments verts",
        "body": TEMPLATE,
        "branch": "cursor/annual-same-sense-e231",
        "files": ["src/components/evolution-annual.tsx", "tests/test_annual_lag.ts"],
        "commits": ["Annuel : segments verts quand n et n−1 vont dans le même sens"],
        "number": 311,
        "url": "https://github.com/LaurentThiol/Synchro/pull/311",
        "author": "LaurentThiol",
        "inbox_exists": False,
        "happened_on": "2026-10-17",
    }
    payload.update(overrides)
    return comment_for_pull_request(**payload)  # type: ignore[arg-type]


def test_empty_template_still_gets_a_draft() -> None:
    comment = _comment()
    assert comment is not None
    assert "synchro-journal-draft" in comment
    assert "Zone : Évolution" in comment
    assert "docs/journal/inbox/annual-same-sense-e231.json" in comment
    assert '"pr_number": 311' in comment


def test_filled_section_and_explicit_skip_are_silent() -> None:
    assert journal_section_is_filled(TEMPLATE) is False
    filled = "## Journal\n\nZone : Évolution\nTitre : Segments verts\n\nLe trait vert suit le même sens.\n"
    assert _comment(body=filled) is None
    assert _comment(body=f"{TEMPLATE}\n{INCHANGE}\n") is None
    assert _comment(inbox_exists=True) is None


def test_dependabot_and_tests_only_do_not_invent_a_fiche() -> None:
    assert _comment(author="dependabot[bot]", title="Dépendances: bump recharts") is None
    assert _comment(title="Dépendances: bump recharts", files=["package.json"]) is None
    comment = _comment(files=["tests/test_annual_lag.ts"], title="tests : le profil")
    assert comment is not None
    assert comment.strip().endswith(INCHANGE)


def test_next_is_not_nextdata_and_journal_only_is_unchanged() -> None:
    assert area_of("src/app/next/page.tsx") == "Next"
    assert area_of("src/app/nextdata/page.tsx") == "nextData"
    assert area_of("src/app/api/nextdata/[...path]/route.ts") == "nextData"
    comment = _comment(
        title="Journal : brouillon",
        files=["synchro/journal_pr.py", ".github/workflows/journal.yml", "AGENTS.md"],
    )
    assert comment is not None
    assert INCHANGE in comment
    assert "Zone :" not in comment


def test_majority_area_keeps_the_other_zone() -> None:
    comment = _comment(
        title="nextData : chaque retard et chaque lien garde sa valeur",
        files=[
            "src/components/combinaisons/combinaisons-panel.tsx",
            "src/lib/combinations.ts",
            "src/lib/nextdata/help.ts",
            "synchro/nextdata/covariates.py",
            "synchro/nextdata/panel.py",
            "tests/test_nextdata.py",
        ],
        commits=[
            "nextData : chaque retard et chaque lien garde sa valeur",
            "tests : le profil Combinaisons garde le retard de chaque boule",
        ],
    )
    assert comment is not None
    assert "Zone : nextData" in comment
    assert "Combinaisons" in comment
    assert "Des tests couvrent" in comment


def test_branch_slug_drops_the_cursor_prefix() -> None:
    assert branch_slug("cursor/journal-suivi-e4d9") == "journal-suivi-e4d9"


def test_workflow_runs_on_draft_open() -> None:
    workflow = (ROOT / ".github" / "workflows" / "journal.yml").read_text(encoding="utf-8")
    assert "opened" in workflow
    assert "synchronize" in workflow
    assert "synchro-journal-draft" in workflow
    agents = (ROOT / "AGENTS.md").read_text(encoding="utf-8")
    assert "Draft opened" in agents
    assert ".github/workflows/journal.yml" in agents
