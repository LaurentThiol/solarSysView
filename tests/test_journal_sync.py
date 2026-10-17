"""Update du journal : les PR manquantes s'ajoutent, le texte reste."""

from pathlib import Path

from fastapi.testclient import TestClient

from synchro.app import create_app
from synchro.journal_sync import area_from_paths, area_from_title, describe_update, plan_journal_update

ROOT = Path(__file__).resolve().parents[1]


def _fiche(**overrides: object) -> dict:
    row = {
        "id": 1,
        "slug": "evolution",
        "area": "Évolution",
        "hidden": False,
        "source": "seed",
        "happened_on": "2026-10-16",
        "title": "Évolution",
        "body": "Texte réécrit dans la page.",
        "pr_number": None,
        "prs": [
            {
                "number": 311,
                "title": "segments",
                "merged_on": "2026-10-16",
                "url": "https://github.com/LaurentThiol/Synchro/pull/311",
            }
        ],
    }
    row.update(overrides)
    return row


def _pull(number: int, title: str, merged: str = "2026-10-17T17:08:45Z", author: str = "LaurentThiol") -> dict:
    return {
        "number": number,
        "title": title,
        "merged_at": merged,
        "html_url": f"https://github.com/LaurentThiol/Synchro/pull/{number}",
        "user": {"login": author},
    }


def test_update_appends_a_missing_pr_without_touching_the_text() -> None:
    plan = plan_journal_update(
        [_fiche()],
        [],
        [_pull(313, "Annuel : suites de décalage 3, 4 et 5"), _pull(311, "déjà là")],
        lambda _number: [],
    )
    assert plan["added"] == 1
    update = plan["updates"][0]
    assert update["id"] == 1
    assert "title" not in update
    assert "body" not in update
    assert [point["number"] for point in update["prs"]] == [311, 313]
    assert update["happened_on"] == "2026-10-17"
    assert plan["creates"] == []
    assert "à jour" not in describe_update(added=1, github="ok", github_kept=2, deferred=0)


def test_seed_point_joins_an_existing_fiche_and_a_hidden_number_stays_out() -> None:
    hidden = _fiche(id=9, slug="old", hidden=True, prs=[], pr_number=4, area="Évolution")
    plan = plan_journal_update(
        [_fiche(), hidden],
        [
            {
                "slug": "evolution",
                "area": "Évolution",
                "title": "Évolution",
                "body": "ancien texte du fichier",
                "happened_on": "2026-10-17",
                "prs": [
                    {"number": 312, "title": "taux", "merged_on": "2026-10-17", "url": "https://example.test/312"},
                    {"number": 4, "title": "cachée", "merged_on": "2026-09-02", "url": "https://example.test/4"},
                ],
            }
        ],
        [_pull(4, "Graphique"), _pull(312, "Annuel : taux")],
        lambda _number: [],
    )
    assert plan["added"] == 1
    numbers = [point["number"] for point in plan["updates"][0]["prs"]]
    assert numbers == [311, 312]
    assert 4 not in numbers


def test_files_choose_nextdata_and_dependabot_is_ignored() -> None:
    assert area_from_title("Annuel : suites") == "Évolution"
    assert area_from_title("nextData : retards") == "nextData"
    assert area_from_title("Next : couples") == "Next"
    assert area_from_paths(["src/app/nextdata/page.tsx", "src/app/next/page.tsx"]) == "nextData"
    plan = plan_journal_update(
        [],
        [],
        [
            _pull(266, "Dépendances: bump recharts", author="dependabot[bot]"),
            {"number": 8, "title": "fermée", "merged_at": None, "user": {"login": "LaurentThiol"}},
            _pull(314, "garde le retard"),
        ],
        lambda number: ["src/lib/nextdata/help.ts", "tests/test_nextdata.py"] if number == 314 else [],
    )
    assert plan["added"] == 1
    assert plan["creates"][0]["area"] == "nextData"
    assert plan["creates"][0]["slug"] == "nextdata"
    assert plan["github_kept"] == 1


def test_file_lookup_can_wait_for_another_pass() -> None:
    plan = plan_journal_update([_fiche()], [], [_pull(320, "sans zone")], lambda _number: None)
    assert plan["added"] == 0
    assert plan["deferred"] == 1
    message = describe_update(added=0, github="ok", github_kept=1, deferred=1)
    assert "relance Update" in message
    assert "à jour" not in message


def test_github_failure_does_not_claim_the_base_is_current() -> None:
    message = describe_update(added=0, github="error", github_kept=0, deferred=0)
    assert "GitHub n’a pas répondu" in message
    assert "à jour" not in message


def test_prs_column_update_leaves_title_and_body() -> None:
    source = (ROOT / "synchro" / "db.py").read_text(encoding="utf-8")
    chunk = source.split("def set_dev_journal_prs", 1)[1].split("def import_dev_journal", 1)[0]
    assert "SET prs" in chunk
    assert "title" not in chunk
    assert "body" not in chunk


def test_update_route_is_registered(monkeypatch) -> None:
    monkeypatch.setattr(
        "synchro.journal_sync.apply_journal_update",
        lambda: {"ok": True, "added": 0, "message": "0 PR passées, la base est à jour.", "items": []},
    )
    client = TestClient(create_app())
    response = client.post("/api/journal/update")
    assert response.status_code == 200
    assert response.json()["message"].endswith("à jour.")
