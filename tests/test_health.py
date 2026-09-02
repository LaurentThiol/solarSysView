from __future__ import annotations

from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from synchro.app import create_app


@pytest.fixture(autouse=True)
def _no_neon_on_startup() -> None:
    with patch("synchro.db.database_configured", return_value=False):
        yield


def _client() -> TestClient:
    return TestClient(create_app())


def test_alive_does_not_need_database() -> None:
    with _client() as client:
        response = client.get("/api/alive")
    assert response.status_code == 200
    body = response.json()
    assert body["ok"] is True
    assert body["service"] == "synchro"


def test_health_reports_neon_when_unconfigured() -> None:
    with patch(
        "synchro.db.ping",
        return_value={
            "ok": False,
            "connected": False,
            "configured": False,
            "host": None,
            "waking": False,
            "error": "DATABASE_URL absent",
        },
    ):
        with _client() as client:
            response = client.get("/api/health")
    assert response.status_code == 200
    body = response.json()
    assert body["alive"] is True
    assert body["ok"] is False
    assert body["neon"]["configured"] is False
    assert body["draws"] is None


def test_health_ok_includes_draws() -> None:
    neon = {"ok": True, "connected": True, "configured": True, "latency_ms": 12, "host": "ep.neon.tech", "waking": False}
    with (
        patch("synchro.db.ping", return_value=neon),
        patch("synchro.db.init_db"),
        patch("synchro.db.latest_draw", return_value=None),
        patch("synchro.db.count_draws", return_value=1976),
        patch("synchro.db.last_sync", return_value=None),
    ):
        with _client() as client:
            response = client.get("/api/health")
    assert response.status_code == 200
    body = response.json()
    assert body["ok"] is True
    assert body["draws"] == 1976
    assert body["neon"]["latency_ms"] == 12


def test_shutdown_localhost_schedules_stop() -> None:
    class Immediate:
        def __init__(self, target=None, daemon=None):
            self.target = target

        def start(self) -> None:
            if self.target:
                self.target()

    with (
        patch("synchro.app.threading.Thread", side_effect=lambda **kw: Immediate(**kw)),
        patch("synchro.app.os.kill") as kill,
    ):
        with _client() as client:
            response = client.post("/api/shutdown")
        assert response.status_code == 200
        assert response.json() == {"ok": True}
        assert kill.called


def test_neon_host_from_url() -> None:
    from synchro.db import _neon_host

    assert (
        _neon_host("postgresql://u:p@ep-x.eu-central-1.aws.neon.tech/neondb")
        == "ep-x.eu-central-1.aws.neon.tech"
    )
    assert _neon_host(None) is None


def test_reload_env_rereads_settings() -> None:
    with _client() as client:
        response = client.post("/api/reload-env")
    assert response.status_code == 200
    body = response.json()
    assert body["ok"] is True
    assert body["neon"]["configured"] is False
    assert body["neon"]["connected"] is False

