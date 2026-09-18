"""Brain : embeddings locaux (Ollama) et recherche cosinus.

Pas de repli cloud : si Ollama est down, on skip l'embedding.
"""

from __future__ import annotations

import json
import math
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Any
from urllib.parse import urlparse

from synchro.config import get_settings

DEFAULT_EMBED_MODEL = "nomic-embed-text"
DEFAULT_LLM_BASE = "http://127.0.0.1:11434"
LOOPBACK_HOSTS = {"127.0.0.1", "localhost", "::1", "0.0.0.0"}


def normalize_llm_base(raw: str | None) -> str:
    """Prefer 127.0.0.1; ping still retries localhost if IPv4 loopback is closed."""
    base = (raw or "").strip().rstrip("/")
    if not base:
        return DEFAULT_LLM_BASE
    if "://" not in base:
        base = f"http://{base}"
    return base.replace("://localhost", "://127.0.0.1").replace("://[::1]", "://127.0.0.1")


def llm_base() -> str:
    settings = get_settings()
    return normalize_llm_base(settings.local_llm_base_url or settings.ollama_host or DEFAULT_LLM_BASE)


def llm_bases() -> list[str]:
    primary = llm_base()
    out: list[str] = []
    for base in (
        primary,
        primary.replace("://127.0.0.1", "://localhost"),
        primary.replace("://127.0.0.1", "://[::1]"),
        primary.replace("://localhost", "://127.0.0.1"),
    ):
        if base and base not in out:
            out.append(base)
    return out


def openai_models_url(base: str) -> str:
    if base.endswith("/v1"):
        return f"{base}/models"
    return f"{base}/v1/models"


def _is_loopback(url: str) -> bool:
    host = (urlparse(url).hostname or "").strip("[]").lower()
    return host in LOOPBACK_HOSTS


def _open(url: str, timeout: float, data: bytes | None = None, headers: dict[str, str] | None = None):
    # urllib honors HTTP_PROXY even for 127.0.0.1; curl does not. Bypass on loopback.
    handlers: list[Any] = []
    if _is_loopback(url):
        handlers.append(urllib.request.ProxyHandler({}))
    opener = urllib.request.build_opener(*handlers)
    request = urllib.request.Request(
        url,
        data=data,
        headers=headers or {"accept": "application/json", "connection": "close"},
        method="POST" if data is not None else "GET",
    )
    return opener.open(request, timeout=timeout)


def _read_json(url: str, timeout: float) -> Any:
    with _open(url, timeout) as response:
        return json.loads(response.read().decode("utf-8"))


def ping_ollama(timeout: float = 0.8) -> dict[str, Any]:
    """Ollama `/api/tags`, then OpenAI-compat `/v1/models`, then `/api/version`."""
    last_error = "injoignable"
    last_host = llm_base()
    jobs: list[tuple[str, str, str]] = []
    for base in llm_bases():
        last_host = base
        jobs.append((base, f"{base}/api/tags", "tags"))
        jobs.append((base, openai_models_url(base), "models"))
        jobs.append((base, f"{base}/api/version", "version"))

    def _one(job: tuple[str, str, str]) -> tuple[str, str, Any]:
        base, url, kind = job
        return base, kind, _read_json(url, timeout)

    executor = ThreadPoolExecutor(max_workers=len(jobs) or 1)
    version_hit: str | None = None
    try:
        futures = [executor.submit(_one, job) for job in jobs]
        for future in as_completed(futures, timeout=timeout + 0.4):
            try:
                base, kind, payload = future.result()
            except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, OSError, ValueError) as exc:
                last_error = str(exc)
                continue
            except Exception as exc:  # noqa: BLE001 — surface urllib wrapper errors
                last_error = str(exc)
                continue
            if kind == "version":
                version_hit = base
                continue
            if kind == "tags":
                names = [item.get("name") for item in payload.get("models") or [] if item.get("name")]
                return {"ok": True, "host": base, "models": names}
            names = [item.get("id") for item in payload.get("data") or [] if item.get("id")]
            return {"ok": True, "host": base, "models": names}
    except TimeoutError:
        last_error = "timeout"
    finally:
        executor.shutdown(wait=False, cancel_futures=True)
    if version_hit:
        return {"ok": True, "host": version_hit, "models": []}
    return {"ok": False, "host": last_host, "error": last_error}


def ping_ollama_tags(timeout: float = 0.8) -> dict[str, Any]:
    """Native Ollama `/api/tags` only — not LM Studio / llama-server `/v1/models`."""
    last_error = "injoignable"
    last_host = llm_base()
    for base in llm_bases():
        last_host = base
        try:
            payload = _read_json(f"{base}/api/tags", timeout)
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, OSError, ValueError) as exc:
            last_error = str(exc)
            continue
        names = [item.get("name") for item in payload.get("models") or [] if item.get("name")]
        return {"ok": True, "host": base, "models": names, "kind": "tags"}
    return {"ok": False, "host": last_host, "error": last_error, "kind": None}


def embed_text(text: str, model: str = DEFAULT_EMBED_MODEL, timeout: float = 20) -> dict[str, Any]:
    body = json.dumps({"model": model, "prompt": text}).encode("utf-8")
    last_error = "injoignable"
    started = time.perf_counter()
    for base in llm_bases():
        try:
            with _open(
                f"{base}/api/embeddings",
                timeout,
                data=body,
                headers={"content-type": "application/json", "connection": "close"},
            ) as response:
                payload = json.loads(response.read().decode("utf-8"))
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, OSError) as exc:
            last_error = str(exc)
            continue
        vector = payload.get("embedding")
        latency_ms = round((time.perf_counter() - started) * 1000)
        if isinstance(vector, list) and vector:
            prompt_tokens = payload.get("prompt_eval_count")
            estimated = not isinstance(prompt_tokens, (int, float))
            try:
                from synchro.llm_usage import estimate_tokens, record_usage

                record_usage(
                    {
                        "surface": "embed",
                        "provider": "local",
                        "model": model,
                        "ok": True,
                        "prompt_tokens": estimate_tokens(text) if estimated else int(prompt_tokens),
                        "completion_tokens": 0,
                        "estimated": estimated,
                        "latency_ms": latency_ms,
                    }
                )
            except Exception:
                pass
            return {"ok": True, "embedding": [float(v) for v in vector], "model": model}
        last_error = "embedding vide"
    try:
        from synchro.llm_usage import record_usage

        record_usage(
            {
                "surface": "embed",
                "provider": "local",
                "model": model,
                "ok": False,
                "error": last_error,
                "latency_ms": round((time.perf_counter() - started) * 1000),
            }
        )
    except Exception:
        pass
    return {"ok": False, "error": last_error, "model": model}


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
