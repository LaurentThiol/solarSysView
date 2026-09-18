from __future__ import annotations

import pytest


@pytest.fixture(autouse=True)
def _isolate_llm_usage(tmp_path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("SYNCHRO_LLM_USAGE_PATH", str(tmp_path / "llm-usage.json"))
    monkeypatch.setenv("SYNCHRO_LLM_USAGE_FILE_ONLY", "1")
