from __future__ import annotations

from unittest.mock import patch

from fastapi.testclient import TestClient

from synchro.app import create_app
from synchro.brain import cosine, pack_embed_text


def _client() -> TestClient:
    return TestClient(create_app())


def test_cosine_identical_is_one() -> None:
    assert abs(cosine([1.0, 0.0, 0.0], [1.0, 0.0, 0.0]) - 1.0) < 1e-9
    assert cosine([1.0, 0.0], [0.0, 1.0]) == 0.0
    assert cosine([], [1.0]) == 0.0


def test_pack_embed_text_skips_empty_and_joins_notes() -> None:
    packed = pack_embed_text(
        {
            "handle": "rsi",
            "label": "RSI",
            "window": {"banner": "100 tirages"},
            "last": {"rsi": 72, "skip": None},
        },
        ["note humaine"],
    )
    assert "rsi" in packed
    assert "72" in packed
    assert "note humaine" in packed
    assert "skip" not in packed


def test_brain_status_does_not_need_neon() -> None:
    with patch(
        "synchro.brain.ping_ollama",
        return_value={"ok": False, "host": "http://127.0.0.1:11434", "error": "down"},
    ):
        with _client() as client:
            response = client.get("/api/brain/status")
    assert response.status_code == 200
    body = response.json()
    assert body["ok"] is True
    assert body["ollama"]["ok"] is False


def test_brain_retrieve_rejects_cloud() -> None:
    with _client() as client:
        response = client.post("/api/brain/retrieve", json={"text": "rsi", "cloud": True})
    assert response.status_code == 400
    assert "cloud" in response.json()["detail"].lower()


def test_brain_cloud_embed_rejected() -> None:
    with _client() as client:
        response = client.post(
            "/api/brain/readings",
            json={
                "catalog_id": "analyse/rsi",
                "handle": "rsi",
                "lab": "analyse",
                "cloud_embed": True,
            },
        )
    assert response.status_code == 400


def test_brain_retrieve_skips_when_ollama_down() -> None:
    with patch("synchro.brain.embed_text", return_value={"ok": False, "error": "down"}):
        with _client() as client:
            response = client.post("/api/brain/retrieve", json={"text": "rsi"})
    assert response.status_code == 200
    body = response.json()
    assert body["ok"] is False
    assert body["items"] == []
