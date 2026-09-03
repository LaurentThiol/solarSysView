from datetime import date
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


DRAWS = [
    {
        "draw_date": date(2026, 8, 21),
        "weekday": "mardi",
        "numbers": [1, 2, 3, 4, 5],
        "stars": [1, 2],
        "star_pool": 12,
    },
    {
        "draw_date": date(2026, 8, 25),
        "weekday": "vendredi",
        "numbers": [1, 11, 21, 31, 41],
        "stars": [1, 12],
        "star_pool": 12,
    },
    {
        "draw_date": date(2026, 8, 28),
        "weekday": "mardi",
        "numbers": [22, 23, 24, 32, 33],
        "stars": [5, 6],
        "star_pool": 12,
    },
]


def test_analyze_does_not_need_neon() -> None:
    with _client() as client:
        response = client.post(
            "/api/morpho/analyze",
            json={"numbers": [1, 2, 3, 4, 5], "stars": [1, 2], "date": "2026-08-21"},
        )
    assert response.status_code == 200
    body = response.json()
    assert "align_h" in body["motifs"]
    assert body["svg"].startswith("<svg")


def test_status_and_svg() -> None:
    with _client() as client:
        status = client.get("/api/morpho/status")
        svg = client.get("/api/morpho/svg?numbers=1,2,3,4,5&stars=1,2")
    assert status.status_code == 200
    assert status.json()["ok"] is True
    assert svg.json()["svg"].startswith("<svg")


def test_neighbors_and_anticipate_use_draws() -> None:
    with (
        patch("synchro.db.database_configured", return_value=True),
        patch("synchro.db.all_draws", return_value=DRAWS),
    ):
        with _client() as client:
            neighbors = client.post(
                "/api/morpho/neighbors?era=current&k=2",
                json={"numbers": [1, 2, 3, 4, 5], "stars": [1, 2], "date": "2026-08-21"},
            )
            anti = client.get("/api/morpho/anticipate?era=current&n=60&seed=0")
    assert neighbors.status_code == 200
    assert len(neighbors.json()["items"]) <= 2
    assert anti.status_code == 200
    assert anti.json()["ok"] is True


def test_evaluate_rules_without_neon() -> None:
    with patch("synchro.db.database_configured", return_value=False):
        with _client() as client:
            response = client.post(
                "/api/morpho/rules/evaluate",
                json={"numbers": [1, 2, 3, 4, 5], "stars": [1, 2], "date": "2026-08-21"},
            )
    assert response.status_code == 200
    assert response.json()["firings"] == []


def test_vlm_status_exposes_install_hint() -> None:
    with _client() as client:
        status = client.get("/api/morpho/vlm/status")
    assert status.status_code == 200
    body = status.json()
    assert "available" in body
    assert body.get("install_cmd") == "./launch install-vlm"
    if not body.get("loaded") and not body.get("available"):
        assert body.get("hint")
        assert "install-vlm" in body["hint"]


def test_vlm_load_without_extras_skips_gguf() -> None:
    import os
    import time

    os.environ["MORPHO_VLM_NO_INSTALL"] = "1"
    os.environ.pop("MORPHO_GGUF_PATH", None)
    with _client() as client:
        first = client.post("/api/morpho/vlm/load")
        assert first.status_code == 200
        body = first.json()
        for _ in range(40):
            if body.get("loaded") or not body.get("busy"):
                break
            time.sleep(0.05)
            body = client.get("/api/morpho/vlm/status").json()
    blob = f"{body.get('error') or ''} {body.get('hint') or ''}"
    if body.get("loaded"):
        return
    assert "install-vlm" in blob or "Moondream" in blob
    assert "MORPHO_GGUF_PATH" not in blob
