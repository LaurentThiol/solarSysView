from __future__ import annotations

from datetime import datetime, timedelta, timezone
from unittest.mock import patch

from fastapi.testclient import TestClient

from synchro.app import create_app
from synchro.llm_usage import (
    dashboard,
    estimate_tokens,
    health_payload,
    normalize_event,
    percentile_p50,
    pick_chat_model,
    ping_generate,
    record_usage,
    summarize_rows,
    vlm_health,
)


def _client() -> TestClient:
    return TestClient(create_app())


def test_estimate_tokens_and_p50() -> None:
    assert estimate_tokens("") == 0
    assert estimate_tokens("abcd") == 1
    assert percentile_p50([]) is None
    assert percentile_p50([10]) == 10
    assert percentile_p50([1, 8, 9]) == 8


def test_pick_chat_model_skips_embed_and_vision() -> None:
    names = ["nomic-embed-text", "moondream", "qwen2.5:7b", "llama3.2"]
    assert pick_chat_model(names, "qwen2.5") == "qwen2.5:7b"
    assert pick_chat_model(["moondream", "nomic-embed-text"], None) == "llama3.2"


def test_summarize_keeps_idle_rows_and_marks_errors(monkeypatch) -> None:
    now = datetime(2026, 9, 18, 12, tzinfo=timezone.utc)
    events = [
        normalize_event(
            {
                "surface": "brain",
                "provider": "local",
                "model": "qwen2.5:7b",
                "ok": True,
                "prompt_tokens": 100,
                "completion_tokens": 20,
                "latency_ms": 800,
                "created_at": (now - timedelta(hours=1)).isoformat(),
            }
        ),
        normalize_event(
            {
                "surface": "ia",
                "provider": "google",
                "model": "gemini-2.5-flash",
                "ok": False,
                "error": "quota",
                "created_at": (now - timedelta(minutes=5)).isoformat(),
            }
        ),
        normalize_event(
            {
                "surface": "brain",
                "provider": "local",
                "model": "qwen2.5:7b",
                "ok": True,
                "prompt_tokens": 40,
                "latency_ms": 400,
                "created_at": (now - timedelta(days=3)).isoformat(),
            }
        ),
    ]
    rows = { (row["surface"], row["provider"]): row for row in summarize_rows(events, now=now) }
    brain = rows[("brain", "local")]
    assert brain["status"] == "ok"
    assert brain["ok"] == 1
    assert brain["prompt_tokens"] == 100
    assert brain["latency_p50_ms"] == 800
    assert brain["model"] == "qwen2.5:7b"
    gemini = rows[("ia", "google")]
    assert gemini["status"] == "err"
    assert gemini["err"] == 1
    assert gemini["last_error"] == "quota"
    idle = rows[("ia", "local")]
    assert idle["status"] == "idle"
    assert idle["ok"] == 0


def test_file_fallback_roundtrip(tmp_path, monkeypatch) -> None:
    path = tmp_path / "llm-usage.json"
    monkeypatch.setenv("SYNCHRO_LLM_USAGE_PATH", str(path))
    monkeypatch.setattr("synchro.db.database_configured", lambda: False)
    stored = record_usage(
        {
            "surface": "ia",
            "provider": "local",
            "model": "llama3.2",
            "ok": True,
            "prompt_tokens": 12,
            "completion_tokens": 3,
            "latency_ms": 90,
        }
    )
    assert stored["source"] == "file"
    assert path.is_file()
    with (
        patch("synchro.brain.ping_ollama", return_value={"ok": True, "host": "http://127.0.0.1:11434", "models": ["qwen2.5:7b", "nomic-embed-text"]}),
        patch("synchro.morpho.vlm.ollama_vision_status", return_value={"ok": True, "model": "moondream", "host": "http://127.0.0.1:11434"}),
    ):
        payload = dashboard()
    assert payload["ok"] is True
    assert payload["source"] == "file"
    assert payload["health"]["embed"]["ok"] is True
    assert payload["health"]["vlm"]["ok"] is True
    recent = payload["recent"]
    assert recent[0]["model"] == "llama3.2"


def test_vlm_health_follows_loaded_morpho_backend() -> None:
    with (
        patch(
            "synchro.morpho.vlm.status",
            return_value={
                "loaded": True,
                "backend": "transformers",
                "model_id": "vikhyatk/moondream2",
                "available": ["transformers"],
            },
        ),
        patch("synchro.morpho.vlm.ollama_vision_status", return_value={"ok": False, "model": None}),
    ):
        probe = vlm_health()
    assert probe["ok"] is True
    assert probe["loaded"] is True
    assert probe["backend"] == "transformers"
    assert probe["model"] == "vikhyatk/moondream2"


def test_vlm_health_absent_when_not_loaded_and_no_ollama_vision() -> None:
    with (
        patch(
            "synchro.morpho.vlm.status",
            return_value={"loaded": False, "backend": None, "model_id": None, "available": []},
        ),
        patch("synchro.morpho.vlm.ollama_vision_status", return_value={"ok": False, "model": None}),
    ):
        probe = vlm_health()
    assert probe["ok"] is False
    assert probe["loaded"] is False


def test_health_payload_vlm_ok_when_morpho_loaded() -> None:
    with (
        patch(
            "synchro.brain.ping_ollama",
            return_value={"ok": True, "host": "http://127.0.0.1:11434", "models": ["llama3.2:latest"]},
        ),
        patch(
            "synchro.morpho.vlm.status",
            return_value={
                "loaded": True,
                "backend": "transformers",
                "model_id": "vikhyatk/moondream2",
                "available": ["transformers"],
            },
        ),
        patch("synchro.morpho.vlm.ollama_vision_status", return_value={"ok": False, "model": None}),
    ):
        payload = health_payload([])
    assert payload["vlm"]["ok"] is True
    assert payload["embed"]["ok"] is False


def test_usage_api_records_and_lists(tmp_path, monkeypatch) -> None:
    monkeypatch.setenv("SYNCHRO_LLM_USAGE_PATH", str(tmp_path / "usage.json"))
    monkeypatch.setattr("synchro.db.database_configured", lambda: False)
    with (
        patch("synchro.brain.ping_ollama", return_value={"ok": False, "host": "http://127.0.0.1:11434", "error": "down"}),
        patch("synchro.morpho.vlm.ollama_vision_status", return_value={"ok": False, "model": None}),
        _client() as client,
    ):
        created = client.post(
            "/api/llm/usage",
            json={
                "surface": "brain",
                "provider": "local",
                "model": "qwen2.5",
                "ok": True,
                "prompt_tokens": 8,
                "completion_tokens": 2,
                "latency_ms": 50,
            },
        )
        assert created.status_code == 200
        listed = client.get("/api/llm/usage")
    assert listed.status_code == 200
    body = listed.json()
    assert body["ok"] is True
    brain = next(row for row in body["rows"] if row["surface"] == "brain" and row["provider"] == "local")
    assert brain["ok"] == 1
    assert body["recent"][0]["model"] == "qwen2.5"


def test_ping_generate_records_success(tmp_path, monkeypatch) -> None:
    monkeypatch.setenv("SYNCHRO_LLM_USAGE_PATH", str(tmp_path / "usage.json"))
    monkeypatch.setattr("synchro.db.database_configured", lambda: False)
    monkeypatch.setattr("synchro.llm_usage.env_chat_model", lambda: "")
    with (
        patch("synchro.brain.ping_ollama", return_value={"ok": True, "host": "http://127.0.0.1:11434", "models": ["qwen2.5:7b"]}),
        patch(
            "synchro.llm_usage._native_generate",
            return_value={"text": "ok", "prompt_tokens": 5, "completion_tokens": 1, "kind": "generate"},
        ),
    ):
        result = ping_generate()
    assert result["ok"] is True
    assert result["model"] == "qwen2.5:7b"
    from synchro.llm_usage import read_file_events

    events = read_file_events()
    assert events[-1]["surface"] == "ping"
    assert events[-1]["ok"] is True


def test_admin_panel_exposes_llm_card() -> None:
    from pathlib import Path

    root = Path(__file__).resolve().parents[1]
    panel = (root / "src/components/admin-panel.tsx").read_text(encoding="utf-8")
    card = (root / "src/components/admin-llm-card.tsx").read_text(encoding="utf-8")
    assert "AdminLlmCard" in panel
    assert "Ping generate" in card
    assert "Usage 24 h" in card
    assert "vlmLabel" in card
    assert "llm_usage" in (root / "synchro/db.py").read_text(encoding="utf-8")
