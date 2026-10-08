from __future__ import annotations

import pytest


@pytest.fixture(autouse=True)
def _isolate_llm_usage(tmp_path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("SYNCHRO_LLM_USAGE_PATH", str(tmp_path / "llm-usage.json"))
    monkeypatch.setenv("SYNCHRO_LLM_USAGE_FILE_ONLY", "1")


@pytest.fixture(autouse=True)
def _isolate_nextdata_steps(tmp_path, monkeypatch: pytest.MonkeyPatch) -> None:
    """Pas nextData dans un cache jetable, calculés dans le processus du test."""
    monkeypatch.setenv("SYNCHRO_NEXTDATA_CACHE", str(tmp_path / "nextdata-steps"))
    monkeypatch.setenv("SYNCHRO_NEXTDATA_WORKERS", "1")
