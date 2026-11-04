from __future__ import annotations

from pathlib import Path
import subprocess

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
    assert "suite" not in record["versions"][1]["params"]
    suite = {
        **_champion()["skills"][0]["versions"][0],
        "gesture": "suite",
        "suite": "logistique",
        "r": 2,
    }
    stored = normalize_champion({**_champion(), "skills": [{**_champion()["skills"][0], "versions": [suite]}]})
    assert stored["versions"][0]["params"]["suite"] == "logistique"
    assert stored["versions"][0]["params"]["r"] == 2
    with pytest.raises(ValueError):
        normalize_champion({**_champion(), "skills": [{"id": "", "versions": []}]})


def _figure(**fields) -> dict:
    return {
        **_champion()["skills"][0]["versions"][0],
        "curve": "n2",
        "gesture": "figure",
        "version": 3,
        "parent": 2,
        "cutoff": "2026-07-28",
        "origin": "variation",
        **fields,
    }


def test_normalize_keeps_the_form_and_n_of_a_figure() -> None:
    skill = _champion()["skills"][0]
    versions = [
        *skill["versions"],
        _figure(forme="polygone", n=6),
        _figure(forme="cercle", n=None, version=4),
        _figure(forme=None, n="8", version=5),
    ]
    record = normalize_champion({**_champion(), "skills": [{**skill, "versions": versions}]})
    params = [row["params"] for row in record["versions"]]
    assert params[2]["forme"] == "polygone" and params[2]["n"] == 6
    assert params[3]["forme"] == "cercle" and params[3]["n"] is None
    assert params[4]["forme"] == "triangle" and params[4]["n"] == 8
    for plain in params[:2]:
        assert "forme" not in plain and "n" not in plain
    assert params[2]["curve"] == "n2" and params[2]["gesture"] == "figure"
    assert "suite" not in params[2] and "r" not in params[2]
    # Le geste ne change rien aux autres champs : la ligne garde sa coupure, son origine et son examen.
    assert record["versions"][2]["cutoff"] == "2026-07-28"
    assert record["versions"][2]["origin"] == "variation"


class _FakeCursor:
    """Garde les ordres SQL. `known` : la ligne que la recherche d'un doublon rend, sinon aucune."""

    def __init__(self, log: list[tuple[str, object]], known: dict | None) -> None:
        self.log = log
        self.known = known
        self._sql = ""

    def __enter__(self) -> "_FakeCursor":
        return self

    def __exit__(self, *args: object) -> None:
        return None

    def execute(self, sql: str, params: object = None) -> None:
        self.log.append((" ".join(sql.split()), params))
        self._sql = sql

    def fetchone(self) -> dict | None:
        if "FROM run_arcade_champions c" in self._sql:
            return self.known
        return {"id": 41, "created_at": None}


def _insert_with(monkeypatch, record: dict, known: dict | None) -> tuple[dict, list[tuple[str, object]]]:
    from contextlib import contextmanager

    from synchro import db

    log: list[tuple[str, object]] = []

    class Conn:
        def cursor(self) -> _FakeCursor:
            return _FakeCursor(log, known)

        def commit(self) -> None:
            log.append(("COMMIT", None))

    @contextmanager
    def fake_connection(*, timeout: float | None = None):
        yield Conn()

    monkeypatch.setattr("synchro.db.connection", fake_connection)
    return db.insert_run_arcade_champion(record), log


def test_a_champion_already_written_is_not_written_again(monkeypatch) -> None:
    record = normalize_champion(_champion())
    known = {"id": 12, "created_at": None, "versions": 2}
    row, log = _insert_with(monkeypatch, record, known)
    assert row == {"id": 12, "created_at": None, "versions": 2, "duplicate": True}
    statements = [sql for sql, _ in log]
    assert any("pg_advisory_xact_lock" in sql for sql in statements)
    assert not any(sql.startswith("INSERT") for sql in statements)
    lookup = next(params for sql, params in log if "FROM run_arcade_champions c" in sql)
    assert lookup == (2, "R3", "2026-10-30T09:00:00.000Z")


def test_a_new_champion_is_written_with_each_version(monkeypatch) -> None:
    record = normalize_champion(_champion())
    row, log = _insert_with(monkeypatch, record, None)
    assert row["id"] == 41 and row["versions"] == 2 and "duplicate" not in row
    inserts = [sql for sql, _ in log if sql.startswith("INSERT")]
    assert len(inserts) == 3
    assert "run_arcade_champions" in inserts[0] and all("run_arcade_skill_versions" in sql for sql in inserts[1:])


def test_a_champion_without_a_saved_date_is_never_taken_for_a_duplicate(monkeypatch) -> None:
    record = normalize_champion({**_champion(), "savedAt": None})
    known = {"id": 12, "created_at": None, "versions": 2}
    row, log = _insert_with(monkeypatch, record, known)
    assert "duplicate" not in row
    assert not any("FROM run_arcade_champions c" in sql for sql, _ in log)
    assert sum(1 for sql, _ in log if sql.startswith("INSERT")) == 3


def test_the_route_says_when_the_champion_was_already_written(monkeypatch) -> None:
    monkeypatch.setattr("synchro.db.database_configured", lambda: True)
    monkeypatch.setattr(
        "synchro.db.insert_run_arcade_champion",
        lambda record: {"id": 12, "created_at": None, "versions": 2, "duplicate": True},
    )
    response = TestClient(create_app()).post("/api/brain/run-arcade/champion", json=_champion())
    assert response.status_code == 200
    assert response.json() == {"ok": True, "source": "neon", "id": 12, "versions": 2, "duplicate": True}


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


def test_champion_keeps_the_exam_window_and_the_exam_end_of_each_version(monkeypatch) -> None:
    stored: dict = {}

    def insert(record: dict) -> dict:
        stored["row"] = {"id": 9, "payload": record["payload"]}
        return {"id": 9, "created_at": None, "versions": len(record["versions"])}

    champion = _champion()
    champion["examFrom"] = "2026-05-08"
    champion["examTo"] = "2026-07-31"
    champion["examTurns"] = 25
    champion["skills"][0]["versions"][1]["examTo"] = "2026-07-31"
    monkeypatch.setattr("synchro.db.database_configured", lambda: True)
    monkeypatch.setattr("synchro.db.insert_run_arcade_champion", insert)
    monkeypatch.setattr("synchro.db.latest_run_arcade_champion", lambda: stored.get("row"))
    client = TestClient(create_app())
    assert client.post("/api/brain/run-arcade/champion", json=champion).status_code == 200
    read = client.get("/api/brain/run-arcade/champion").json()["champion"]
    assert (read["examFrom"], read["examTo"], read["examTurns"]) == ("2026-05-08", "2026-07-31", 25)
    assert read["skills"][0]["versions"][1]["examTo"] == "2026-07-31"
    assert "examTo" not in read["skills"][0]["versions"][0]

    stored.clear()
    assert client.post("/api/brain/run-arcade/champion", json=_champion()).status_code == 200
    legacy = client.get("/api/brain/run-arcade/champion").json()["champion"]
    assert (legacy["examFrom"], legacy["examTo"], legacy["examTurns"]) == (None, None, None)
    assert client.post("/api/brain/run-arcade/champion", json={**_champion(), "examTurns": -1}).status_code == 422


def test_champion_keeps_its_depart_and_its_race_turns(monkeypatch) -> None:
    stored: dict = {}

    def insert(record: dict) -> dict:
        stored["row"] = {"id": 10, "payload": record["payload"]}
        return {"id": 10, "created_at": None, "versions": len(record["versions"])}

    champion = _champion()
    champion["depart"] = "2026-08-04"
    champion["raceTurns"] = 12
    monkeypatch.setattr("synchro.db.database_configured", lambda: True)
    monkeypatch.setattr("synchro.db.insert_run_arcade_champion", insert)
    monkeypatch.setattr("synchro.db.latest_run_arcade_champion", lambda: stored.get("row"))
    client = TestClient(create_app())
    assert client.post("/api/brain/run-arcade/champion", json=champion).status_code == 200
    read = client.get("/api/brain/run-arcade/champion").json()["champion"]
    assert (read["depart"], read["raceTurns"]) == ("2026-08-04", 12)

    stored.clear()
    assert client.post("/api/brain/run-arcade/champion", json=_champion()).status_code == 200
    legacy = client.get("/api/brain/run-arcade/champion").json()["champion"]
    assert (legacy["depart"], legacy["raceTurns"]) == (None, None)
    assert client.post("/api/brain/run-arcade/champion", json={**_champion(), "raceTurns": -1}).status_code == 422


def test_an_old_champion_written_after_a_recent_one_does_not_become_the_latest(monkeypatch) -> None:
    from contextlib import contextmanager

    from synchro import db

    recent = {
        "id": 2,
        "created_at": "2026-10-29T09:00:00",
        "payload": {**_champion(), "savedAt": "2026-10-30T09:00:00.000Z"},
    }
    old = {
        "id": 3,
        "created_at": "2026-10-31T09:00:00",
        "payload": {**_champion(), "savedAt": "2026-10-01T09:00:00.000Z"},
    }
    seen: list[str] = []

    class Cursor:
        def __enter__(self) -> "Cursor":
            return self

        def __exit__(self, *args: object) -> None:
            return None

        def execute(self, sql: str, params: object = None) -> None:
            seen.append(" ".join(sql.split()))

        def fetchall(self) -> list[dict]:
            # Postgres rend les lignes dans l'ordre du ORDER BY demandé.
            return [recent, old]

    class Conn:
        def cursor(self) -> Cursor:
            return Cursor()

    @contextmanager
    def fake_connection(*, timeout: float | None = None):
        yield Conn()

    monkeypatch.setattr("synchro.db.connection", fake_connection)
    rows = db.list_run_arcade_champions()
    assert [row["id"] for row in rows] == [2, 3]
    assert db.latest_run_arcade_champion()["id"] == 2
    assert seen
    for sql in seen:
        assert "ORDER BY payload->>'savedAt' DESC NULLS LAST, created_at DESC, id DESC" in sql


def test_champions_list_is_newest_first(monkeypatch) -> None:
    older = {"id": 1, "payload": {**_champion(), "generation": 1, "runner": "R1"}}
    newer = {"id": 2, "payload": _champion()}
    monkeypatch.setattr("synchro.db.database_configured", lambda: True)
    monkeypatch.setattr("synchro.db.list_run_arcade_champions", lambda limit: [newer, older][:limit])
    client = TestClient(create_app())
    body = client.get("/api/brain/run-arcade/champions").json()
    assert body["ok"] is True
    assert [item["runner"] for item in body["items"]] == ["R3", "R1"]
    assert body["items"][0]["id"] == 2
    assert client.get("/api/brain/run-arcade/champions?limit=1").json()["items"][0]["generation"] == 2


def test_champions_list_needs_neon(monkeypatch) -> None:
    monkeypatch.setattr("synchro.db.database_configured", lambda: False)
    assert TestClient(create_app()).get("/api/brain/run-arcade/champions").status_code == 503


def _node(script: str) -> None:
    root = Path(__file__).resolve().parents[1]
    result = subprocess.run(
        [
            "node",
            "--experimental-strip-types",
            "--import",
            str(root / "tests" / "node-register.mjs"),
            "--test",
            str(root / "tests" / script),
        ],
        cwd=root,
        capture_output=True,
        text=True,
    )
    assert result.returncode == 0, result.stdout + result.stderr


def test_run_arcade_node() -> None:
    _node("test_run_arcade.ts")


def test_run_arcade_chrome_node() -> None:
    _node("test_run_arcade_chrome.ts")


def test_run_arcade_think_node() -> None:
    _node("test_run_arcade_think.ts")


def test_run_arcade_window_node() -> None:
    _node("test_run_arcade_window.ts")


def test_run_arcade_depart_node() -> None:
    _node("test_run_arcade_depart.ts")


def test_run_arcade_relation_node() -> None:
    _node("test_run_arcade_relation.ts")


def test_run_arcade_session_node() -> None:
    _node("test_run_arcade_session.ts")


def test_run_arcade_fonctionnel_node() -> None:
    _node("test_run_arcade_fonctionnel.ts")


def test_run_arcade_lab_node() -> None:
    _node("test_run_arcade_lab.ts")


def test_run_arcade_brave_node() -> None:
    _node("test_run_arcade_brave.ts")


def test_run_arcade_soir_node() -> None:
    _node("test_run_arcade_soir.ts")


def test_run_arcade_layers_node() -> None:
    _node("test_run_arcade_layers.ts")


def test_run_arcade_examen_node() -> None:
    _node("test_run_arcade_examen.ts")


def test_run_arcade_client_node() -> None:
    _node("test_run_arcade_client.ts")


def test_run_arcade_robustesse_node() -> None:
    _node("test_run_arcade_robustesse.ts")


def test_run_arcade_routes_node() -> None:
    _node("test_run_arcade_routes.ts")


def test_every_run_arcade_ts_test_has_a_wrapper() -> None:
    tests = Path(__file__).resolve().parent
    wrappers = "".join(
        (tests / name).read_text(encoding="utf-8")
        for name in ("test_run_arcade_api.py", "test_run_arcade_help.py")
    )
    orphans = [
        path.name
        for path in sorted(tests.glob("test_run_arcade*.ts"))
        if f'"{path.name}"' not in wrappers
    ]
    assert orphans == [], f"Aucun wrapper pytest pour : {orphans}"


def test_champion_rejects_an_empty_skill_list(monkeypatch) -> None:
    monkeypatch.setattr("synchro.db.database_configured", lambda: True)
    client = TestClient(create_app())
    response = client.post("/api/brain/run-arcade/champion", json={**_champion(), "skills": []})
    assert response.status_code == 422
