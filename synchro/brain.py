"""Brain : embeddings locaux (Ollama) et recherche cosinus.

Pas de repli cloud : si Ollama est down, on skip l'embedding.
"""

from __future__ import annotations

import json
import math
import urllib.error
import urllib.request
from typing import Any

from synchro.config import get_settings

DEFAULT_EMBED_MODEL = "nomic-embed-text"
DEFAULT_LLM_BASE = "http://127.0.0.1:11434"


def normalize_llm_base(raw: str | None) -> str:
    """Loopback IPv4: Ollama listens on 127.0.0.1, not ::1 (localhost on some stacks)."""
    base = (raw or "").strip().rstrip("/")
    if not base:
        return DEFAULT_LLM_BASE
    if "://" not in base:
        base = f"http://{base}"
    return base.replace("://localhost", "://127.0.0.1").replace("://[::1]", "://127.0.0.1")


def llm_base() -> str:
    settings = get_settings()
    return normalize_llm_base(settings.local_llm_base_url or settings.ollama_host or DEFAULT_LLM_BASE)


def openai_models_url(base: str) -> str:
    if base.endswith("/v1"):
        return f"{base}/models"
    return f"{base}/v1/models"


def _read_json(url: str, timeout: float) -> Any:
    with urllib.request.urlopen(url, timeout=timeout) as response:
        return json.loads(response.read().decode("utf-8"))


def ping_ollama(timeout: float = 1.5) -> dict[str, Any]:
    """Ollama `/api/tags`, then OpenAI-compat `/v1/models` (llama-server, LM Studio)."""
    base = llm_base()
    last_error = "injoignable"
    try:
        payload = _read_json(f"{base}/api/tags", timeout)
        names = [item.get("name") for item in payload.get("models") or [] if item.get("name")]
        return {"ok": True, "host": base, "models": names}
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, OSError, ValueError) as exc:
        last_error = str(exc)
    try:
        payload = _read_json(openai_models_url(base), timeout)
        names = [item.get("id") for item in payload.get("data") or [] if item.get("id")]
        return {"ok": True, "host": base, "models": names}
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, OSError, ValueError) as exc:
        last_error = str(exc)
    return {"ok": False, "host": base, "error": last_error}


def embed_text(text: str, model: str = DEFAULT_EMBED_MODEL, timeout: float = 20) -> dict[str, Any]:
    base = llm_base()
    body = json.dumps({"model": model, "prompt": text}).encode("utf-8")
    request = urllib.request.Request(
        f"{base}/api/embeddings",
        data=body,
        headers={"content-type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, OSError) as exc:
        return {"ok": False, "error": str(exc), "model": model}
    vector = payload.get("embedding")
    if not isinstance(vector, list) or not vector:
        return {"ok": False, "error": "embedding vide", "model": model}
    return {"ok": True, "embedding": [float(v) for v in vector], "model": model}


def cosine(a: list[float], b: list[float]) -> float:
    n = min(len(a), len(b))
    if n <= 0:
        return 0.0
    num = 0.0
    na = 0.0
    nb = 0.0
    for i in range(n):
        num += a[i] * b[i]
        na += a[i] * a[i]
        nb += b[i] * b[i]
    if not na or not nb:
        return 0.0
    return num / (math.sqrt(na) * math.sqrt(nb))


def pack_embed_text(payload: dict[str, Any], notes: list[str] | None = None) -> str:
    last = payload.get("last") if isinstance(payload.get("last"), dict) else {}
    last_txt = " ".join(f"{k}={v}" for k, v in last.items() if v is not None and v != "")
    parts = [
        str(payload.get("handle") or ""),
        str(payload.get("label") or ""),
        str((payload.get("window") or {}).get("banner") or ""),
        last_txt,
        " ".join(notes or []),
    ]
    return " · ".join(part for part in parts if part)


def retrieve(query_vec: list[float], rows: list[dict[str, Any]], k: int = 8) -> list[dict[str, Any]]:
    scored: list[tuple[float, dict[str, Any]]] = []
    for row in rows:
        vector = row.get("embedding")
        if not isinstance(vector, list) or not vector:
            continue
        scored.append((cosine(query_vec, [float(v) for v in vector]), row))
    scored.sort(key=lambda item: item[0], reverse=True)
    out = []
    for score, row in scored[:k]:
        item = dict(row)
        item["score"] = round(score, 4)
        out.append(item)
    return out
