from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from synchro.app import create_app
from synchro.run_arcade import champion_from_row, normalize_champion


def _champion() -> dict:
    return {
        "generation": 2,
        "runner": "R3",
        "cents": 5650,
        "examCents": 5100,
        "calls": 14,
        "raceFrom": "2026-08-04",
        "raceTo": "2026-10-27",
        "skills": [
            {
                "id": "r3-base",
                "name": "Geste de base",
                "versions": [
                    {
                        "curve": "*",
                        "gesture": "glisse",
                        "ratio": 0.618,
                        "span": "bande",
                        "window": 8,
                        "days": None,
                        "version": 1,
                        "parent": None,
                        "cutoff": "",
                        "origin": "maison",
                        "phrase": "toutes les courbes poursuit le pas sur 8 tirages.",
                        "examCents": None,
                    },
                    {
                        "curve": "*",
                        "gesture": "moyenne",
                        "ratio": 0.618,
                        "span": "bande",
                        "window": 5,
                        "days": 60,
                        "version": 2,
                        "parent": 1,
                        "cutoff": "2026-07-28",
                        "origin": "ia",
                        "phrase": "toutes les courbes rejoint sa moyenne sur 60 jours.",
                        "examCents": 5100,
                    },
                ],
            }
        ],
        "journal": [],
        "savedAt": "2026-10-30T09:00:00.000Z",
    }


def test_normalize_flattens_versions_with_their_cutoff() -> None:
    record = normalize_champion(_champion())
    assert record["generation"] == 2
    assert record["race_from"] == "2026-08-04"
    assert [row["version"] for row in record["versions"]] == [1, 2]
    assert record["versions"][0]["cutoff"] is None
    assert record["versions"][1]["cutoff"] == "2026-07-28"
    assert record["versions"][1]["parent"] == 1
    assert record["versions"][1]["params"]["days"] == 60
    with pytest.raises(ValueError):
        normalize_champion({**_champion(), "skills": [{"id": "", "versions": []}]})


def test_champion_needs_neon(monkeypatch) -> None:
    monkeypatch.setattr("synchro.db.database_configured", lambda: False)
    client = TestClient(create_app())
    response = client.post("/api/brain/run-arcade/champion", json=_champion())
    assert response.status_code == 503
    assert "Neon" in response.json()["detail"]
    assert client.get("/api/brain/run-arcade/champion").status_code == 503


def test_champion_round_trip(monkeypatch) -> None:
    stored: dict = {}

    def insert(record: dict) -> dict:
        stored["row"] = {"id": 7, "payload": record["payload"]}
        return {"id": 7, "created_at": None, "versions": len(record["versions"])}

    monkeypatch.setattr("synchro.db.database_configured", lambda: True)
    monkeypatch.setattr("synchro.db.insert_run_arcade_champion", insert)
    monkeypatch.setattr("synchro.db.latest_run_arcade_champion", lambda: stored.get("row"))
    client = TestClient(create_app())
    created = client.post("/api/brain/run-arcade/champion", json=_champion())
    assert created.status_code == 200
    assert created.json() == {"ok": True, "source": "neon", "id": 7, "versions": 2}
    read = client.get("/api/brain/run-arcade/champion").json()
    assert read["ok"] is True
    assert read["champion"]["runner"] == "R3"
    assert read["champion"]["skills"][0]["versions"][1]["cutoff"] == "2026-07-28"
    assert champion_from_row({"id": 3, "payload": {"runner": "R1"}}) == {"runner": "R1", "id": 3}


def test_champion_rejects_an_empty_skill_list(monkeypatch) -> None:
    monkeypatch.setattr("synchro.db.database_configured", lambda: True)
    client = TestClient(create_app())
    response = client.post("/api/brain/run-arcade/champion", json={**_champion(), "skills": []})
    assert response.status_code == 422
