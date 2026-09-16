from __future__ import annotations

from unittest.mock import patch

from fastapi.testclient import TestClient

from synchro.app import create_app
from synchro.brain import cosine, normalize_llm_base, openai_models_url, pack_embed_text


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


def test_normalize_llm_base_rewrites_localhost() -> None:
    assert normalize_llm_base("http://localhost:11434/") == "http://127.0.0.1:11434"
    assert normalize_llm_base("127.0.0.1:1234") == "http://127.0.0.1:1234"
    assert openai_models_url("http://127.0.0.1:8080/v1") == "http://127.0.0.1:8080/v1/models"
    assert openai_models_url("http://127.0.0.1:11434") == "http://127.0.0.1:11434/v1/models"


def test_llm_bases_also_tries_ipv6_loopback() -> None:
    from synchro import brain as brain_mod

    with patch.object(brain_mod, "llm_base", return_value="http://127.0.0.1:11434"):
        bases = brain_mod.llm_bases()
    assert "http://127.0.0.1:11434" in bases
    assert "http://localhost:11434" in bases
    assert "http://[::1]:11434" in bases


def test_ping_ollama_falls_back_to_openai_compat() -> None:
    import urllib.error

    from synchro import brain as brain_mod

    def fake_read(url: str, timeout: float):
        if url.endswith("/api/tags"):
            raise urllib.error.URLError("no tags")
        if url.endswith("/v1/models"):
            return {"data": [{"id": "qwen2.5"}, {"id": "nomic-embed-text"}]}
        raise AssertionError(url)

    with (
        patch.object(brain_mod, "_read_json", side_effect=fake_read),
        patch.object(brain_mod, "llm_base", return_value="http://127.0.0.1:8080"),
    ):
        result = brain_mod.ping_ollama()
    assert result["ok"] is True
    assert result["models"] == ["qwen2.5", "nomic-embed-text"]


def test_ping_ollama_accepts_version_when_catalogs_fail() -> None:
    import urllib.error

    from synchro import brain as brain_mod

    def fake_read(url: str, timeout: float):
        if url.endswith("/api/version"):
            return {"version": "0.11.0"}
        raise urllib.error.URLError("no catalog")

    with (
        patch.object(brain_mod, "_read_json", side_effect=fake_read),
        patch.object(brain_mod, "llm_base", return_value="http://127.0.0.1:11434"),
    ):
        result = brain_mod.ping_ollama()
    assert result["ok"] is True
    assert result["models"] == []


def test_ping_ollama_retries_localhost_when_ipv4_loopback_fails() -> None:
    from synchro import brain as brain_mod

    def fake_read(url: str, timeout: float):
        if "127.0.0.1" in url:
            raise OSError("refused")
        if url == "http://localhost:11434/api/tags":
            return {"models": [{"name": "mistral"}]}
        raise AssertionError(url)

    with (
        patch.object(brain_mod, "_read_json", side_effect=fake_read),
        patch.object(brain_mod, "llm_base", return_value="http://127.0.0.1:11434"),
    ):
        result = brain_mod.ping_ollama()
    assert result["ok"] is True
    assert result["host"] == "http://localhost:11434"
    assert result["models"] == ["mistral"]


def test_ping_ollama_tags_ignores_openai_compat() -> None:
    import urllib.error

    from synchro import brain as brain_mod

    def fake_read(url: str, timeout: float):
        if url.endswith("/api/tags"):
            raise urllib.error.URLError("no tags")
        if "/v1/models" in url:
            return {"data": [{"id": "moondream"}]}
        raise AssertionError(url)

    with (
        patch.object(brain_mod, "_read_json", side_effect=fake_read),
        patch.object(brain_mod, "llm_base", return_value="http://127.0.0.1:1234"),
    ):
        result = brain_mod.ping_ollama_tags()
    assert result["ok"] is False
    assert result["kind"] is None


def test_ping_ollama_tags_returns_native_catalog() -> None:
    from synchro import brain as brain_mod

    def fake_read(url: str, timeout: float):
        if url.endswith("/api/tags"):
            return {"models": [{"name": "moondream"}, {"name": "llama3.2"}]}
        raise AssertionError(url)

    with (
        patch.object(brain_mod, "_read_json", side_effect=fake_read),
        patch.object(brain_mod, "llm_base", return_value="http://127.0.0.1:11434"),
    ):
        result = brain_mod.ping_ollama_tags()
    assert result["ok"] is True
    assert result["kind"] == "tags"
    assert result["models"] == ["moondream", "llama3.2"]


def test_loopback_json_bypasses_http_proxy() -> None:
    import urllib.request

    from synchro import brain as brain_mod

    seen: list[object] = []

    class FakeResponse:
        def __enter__(self):
            return self

        def __exit__(self, *args: object) -> None:
            return None

        def read(self) -> bytes:
            return b'{"models":[]}'

    class FakeOpener:
        def open(self, request: object, timeout: object = None) -> FakeResponse:
            return FakeResponse()

    def fake_build(*handlers: object) -> FakeOpener:
        seen.extend(handlers)
        return FakeOpener()

    with patch.object(urllib.request, "build_opener", side_effect=fake_build):
        brain_mod._read_json("http://127.0.0.1:11434/api/tags", 1)
    assert any(isinstance(handler, urllib.request.ProxyHandler) for handler in seen)


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


def test_brain_mascot_is_a_two_lobe_drawing() -> None:
    from pathlib import Path

    src = (Path(__file__).resolve().parents[1] / "src/components/brain/brain-mascot.tsx").read_text(
        encoding="utf-8"
    )
    assert "useId(" in src
    assert "brain-fill-${uid}" in src
    assert 'mood === "sleep"' in src
    assert 'mood === "think"' in src
    assert 'mood === "talk"' in src
    assert "M30 30c-9 1-16 10-16 20" not in src
    assert "clipPath" in src


def test_brain_and_ia_prompts_allow_forecast_as_hypothesis() -> None:
    from pathlib import Path

    root = Path(__file__).resolve().parents[1]
    brain = (root / "src/lib/brain/prompt.ts").read_text(encoding="utf-8")
    ia = (root / "src/lib/ia/prompt.ts").read_text(encoding="utf-8")
    disclaimer = (root / "src/lib/capture/snapshot.ts").read_text(encoding="utf-8")
    for prompt in (brain, ia):
        assert "hypothèse" in prompt
        assert "pronostic" in prompt
        assert "refuse" not in prompt
        assert "Tu ne prédis pas" not in prompt
    assert "indépendant" in disclaimer
    assert "hypothèse" in disclaimer
    assert "Ils ne prédisent pas" not in disclaimer


def test_brain_demo_is_wired_in_the_lab() -> None:
    from pathlib import Path

    root = Path(__file__).resolve().parents[1]
    demo = (root / "src/lib/brain/demo.ts").read_text(encoding="utf-8")
    lecture = (root / "src/lib/brain/lecture.ts").read_text(encoding="utf-8")
    lab = (root / "src/components/brain/brain-lab.tsx").read_text(encoding="utf-8")
    bar = (root / "src/components/brain/brain-demo.tsx").read_text(encoding="utf-8")
    readme = (root / "README.md").read_text(encoding="utf-8")
    catalog = (root / "src/lib/brain/catalog.ts").read_text(encoding="utf-8")
    for handle in ("rsi", "ete", "fft", "cluster", "score"):
        assert handle in demo
    assert "lectureFromWorkingSet" in lecture
    assert "sans modèle" in lecture
    assert "Lancer la démo" in bar
    assert "Suivant" in bar
    assert "Annuler" in bar
    assert "BrainDemoPopup" in lab
    assert "demoWaiting" in lab
    assert "title:" in demo
    assert "La fenêtre de travail" in demo
    assert "Lire la table" in lab
    assert "listSpecialists" in lab
    assert "demoWantsStart" in lab
    assert "/brain?demo=1" in readme
    assert 'id: "tour"' in catalog
