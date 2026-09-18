"""Journal d'usage LLM : Neon, repli fichier, agrégats Admin."""

from __future__ import annotations

import json
import os
import re
import threading
import time
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

from synchro.config import ROOT, get_settings

SURFACES = frozenset({"brain", "ia", "morpho", "embed", "ping"})
PROVIDERS = frozenset({"local", "google", "openai", "ollama", "hf"})
CHAT_SKIP = re.compile(
    r"(embed|nomic-embed|tts|whisper|clip|llava|vision|qwen.*vl|moondream|minicpm-?v)",
    re.I,
)
FIXED_ROWS: tuple[tuple[str, str, str, str], ...] = (
    ("brain", "local", "Brain", "Local"),
    ("brain", "google", "Brain", "Gemini"),
    ("brain", "openai", "Brain", "OpenAI"),
    ("ia", "local", "IA", "Local"),
    ("ia", "google", "IA", "Gemini"),
    ("ia", "openai", "IA", "OpenAI"),
    ("morpho", "ollama", "Morpho VLM", "Ollama"),
    ("morpho", "hf", "Morpho VLM", "Hugging Face"),
    ("embed", "local", "Embeddings", "Local"),
)
FILE_CAP = 500
PRUNE_DAYS = 30
ERROR_MAX = 500
MODEL_MAX = 80
_file_lock = threading.Lock()


def usage_path() -> Path:
    raw = (os.environ.get("SYNCHRO_LLM_USAGE_PATH") or "").strip()
    if raw:
        return Path(raw)
    return ROOT / ".brain" / "llm-usage.json"


def estimate_tokens(text: str) -> int:
    trimmed = (text or "").strip()
    if not trimmed:
        return 0
    return max(1, round(len(trimmed) / 4))


def is_chat_model(name: str) -> bool:
    return bool(name) and not CHAT_SKIP.search(name)


def env_chat_model() -> str:
    settings = get_settings()
    return (os.environ.get("LOCAL_LLM_MODEL") or settings.local_llm_model or "").strip()


def model_served(wanted: str, names: list[str]) -> str | None:
    if not wanted:
        return None
    for name in names:
        if name == wanted or name.startswith(f"{wanted}:") or wanted.startswith(f"{name}:"):
            return name
    return None


def pick_chat_model(names: list[str], wanted: str | None = None) -> str:
    chat = [name for name in names if is_chat_model(name)]
    served = model_served(wanted or "", chat)
    if served:
        return served
    if wanted and is_chat_model(wanted):
        return wanted
    return chat[0] if chat else (wanted or "llama3.2")


def _now() -> datetime:
    return datetime.now(timezone.utc)


def as_datetime(value: Any) -> datetime:
    if isinstance(value, datetime):
        if value.tzinfo is None:
            return value.replace(tzinfo=timezone.utc)
        return value
    if isinstance(value, str) and value.strip():
        text = value.strip().replace("Z", "+00:00")
        try:
            parsed = datetime.fromisoformat(text)
        except ValueError:
            return _now()
        if parsed.tzinfo is None:
            return parsed.replace(tzinfo=timezone.utc)
        return parsed
    return _now()


def _int_or_none(value: Any) -> int | None:
    if value is None or value is False:
        return None
    if isinstance(value, bool):
        return None
    try:
        number = int(value)
    except (TypeError, ValueError):
        return None
    return number if number >= 0 else None


def normalize_event(payload: dict[str, Any] | None) -> dict[str, Any]:
    raw = payload or {}
    surface = str(raw.get("surface") or "ia").strip().lower()
    if surface not in SURFACES:
        surface = "ia"
    provider = str(raw.get("provider") or "local").strip().lower()
    if provider not in PROVIDERS:
        provider = "local"
    model = str(raw.get("model") or "").strip()[:MODEL_MAX]
    error = str(raw.get("error") or "").strip()[:ERROR_MAX] or None
    created = as_datetime(raw.get("created_at"))
    ident = raw.get("id")
    if ident is None or ident == "":
        ident = str(uuid.uuid4())
    return {
        "id": ident,
        "created_at": created.isoformat(),
        "surface": surface,
        "provider": provider,
        "model": model,
        "ok": bool(raw.get("ok")),
        "error": error,
        "prompt_tokens": _int_or_none(raw.get("prompt_tokens")),
        "completion_tokens": _int_or_none(raw.get("completion_tokens")),
        "estimated": bool(raw.get("estimated")),
        "latency_ms": _int_or_none(raw.get("latency_ms")),
    }


def _read_file_unlocked(path: Path) -> list[dict[str, Any]]:
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError, UnicodeDecodeError):
        return []
    events = payload.get("events") if isinstance(payload, dict) else payload
    if not isinstance(events, list):
        return []
    return [normalize_event(item) for item in events if isinstance(item, dict)]


def read_file_events() -> list[dict[str, Any]]:
    path = usage_path()
    with _file_lock:
        return _read_file_unlocked(path)


def _write_file_unlocked(path: Path, events: list[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    trimmed = events[-FILE_CAP:]
    path.write_text(
        json.dumps({"events": trimmed}, ensure_ascii=False, indent=0),
        encoding="utf-8",
    )


def append_file_event(event: dict[str, Any]) -> dict[str, Any]:
    path = usage_path()
    normalized = normalize_event(event)
    with _file_lock:
        events = _read_file_unlocked(path)
        events.append(normalized)
        _write_file_unlocked(path, events)
    return normalized


def clear_file_events() -> None:
    path = usage_path()
    with _file_lock:
        if path.is_file():
            try:
                path.unlink()
            except OSError:
                _write_file_unlocked(path, [])


def percentile_p50(values: list[int]) -> int | None:
    if not values:
        return None
    ordered = sorted(values)
    return ordered[(len(ordered) - 1) // 2]


def _empty_row(surface: str, provider: str, surface_label: str, provider_label: str) -> dict[str, Any]:
    return {
        "surface": surface,
        "provider": provider,
        "surface_label": surface_label,
        "provider_label": provider_label,
        "status": "idle",
        "model": None,
        "ok": 0,
        "err": 0,
        "prompt_tokens": 0,
        "completion_tokens": 0,
        "estimated": False,
        "latency_p50_ms": None,
        "last_ok_at": None,
        "last_error": None,
        "last_at": None,
        "_window_last_ok": None,
    }


def _labels_for(surface: str, provider: str) -> tuple[str, str]:
    for item_surface, item_provider, surface_label, provider_label in FIXED_ROWS:
        if item_surface == surface and item_provider == provider:
            return surface_label, provider_label
    surface_label = {
        "brain": "Brain",
        "ia": "IA",
        "morpho": "Morpho VLM",
        "embed": "Embeddings",
        "ping": "Ping",
    }.get(surface, surface)
    provider_label = {
        "local": "Local",
        "google": "Gemini",
        "openai": "OpenAI",
        "ollama": "Ollama",
        "hf": "Hugging Face",
    }.get(provider, provider)
    return surface_label, provider_label


def summarize_rows(events: list[dict[str, Any]], *, now: datetime | None = None, hours: int = 24) -> list[dict[str, Any]]:
    moment = now or _now()
    cutoff = moment - timedelta(hours=hours)
    rows: dict[tuple[str, str], dict[str, Any]] = {}
    for surface, provider, surface_label, provider_label in FIXED_ROWS:
        rows[(surface, provider)] = _empty_row(surface, provider, surface_label, provider_label)

    dated = sorted(events, key=lambda item: as_datetime(item.get("created_at")))
    for event in dated:
        key = (str(event.get("surface")), str(event.get("provider")))
        if key not in rows:
            surface_label, provider_label = _labels_for(*key)
            rows[key] = _empty_row(key[0], key[1], surface_label, provider_label)
        row = rows[key]
        created = as_datetime(event.get("created_at"))
        row["last_at"] = created.isoformat()
        if event.get("model"):
            row["model"] = event["model"]
        if event.get("ok"):
            row["last_ok_at"] = created.isoformat()
        else:
            row["last_error"] = event.get("error")
        if created < cutoff:
            continue
        row["_window_last_ok"] = bool(event.get("ok"))
        if event.get("ok"):
            row["ok"] += 1
        else:
            row["err"] += 1
        if event.get("prompt_tokens"):
            row["prompt_tokens"] += int(event["prompt_tokens"])
        if event.get("completion_tokens"):
            row["completion_tokens"] += int(event["completion_tokens"])
        if event.get("estimated"):
            row["estimated"] = True

    latencies: dict[tuple[str, str], list[int]] = {key: [] for key in rows}
    for event in dated:
        created = as_datetime(event.get("created_at"))
        if created < cutoff or not event.get("ok"):
            continue
        latency = event.get("latency_ms")
        if isinstance(latency, int):
            latencies[(str(event.get("surface")), str(event.get("provider")))].append(latency)

    ordered_keys = [(s, p) for s, p, _, _ in FIXED_ROWS]
    extra_keys = [key for key in rows if key not in set(ordered_keys)]
    out: list[dict[str, Any]] = []
    for key in ordered_keys + extra_keys:
        row = rows[key]
        row["latency_p50_ms"] = percentile_p50(latencies.get(key, []))
        if row["ok"] + row["err"] == 0:
            row["status"] = "idle"
        elif row["_window_last_ok"]:
            row["status"] = "ok"
        else:
            row["status"] = "err"
        row.pop("_window_last_ok", None)
        out.append(row)
    return out


def recent_events(events: list[dict[str, Any]], limit: int = 20) -> list[dict[str, Any]]:
    dated = sorted(events, key=lambda item: as_datetime(item.get("created_at")), reverse=True)
    return dated[:limit]


def last_local_ok_at(events: list[dict[str, Any]]) -> str | None:
    for event in sorted(events, key=lambda item: as_datetime(item.get("created_at")), reverse=True):
        if event.get("ok") and event.get("provider") in {"local", "ollama"}:
            return as_datetime(event.get("created_at")).isoformat()
    return None


def _flush_file_to_db() -> None:
    from synchro import db

    path = usage_path()
    with _file_lock:
        pending = _read_file_unlocked(path)
        if not pending:
            return
        for event in pending:
            db.insert_llm_usage(event)
        _write_file_unlocked(path, [])


def record_usage(payload: dict[str, Any]) -> dict[str, Any]:
    from synchro import db

    event = normalize_event(payload)
    file_only = (os.environ.get("SYNCHRO_LLM_USAGE_FILE_ONLY") or "").strip() in {"1", "true", "yes"}
    if not file_only and db.database_configured():
        try:
            _flush_file_to_db()
            row = db.insert_llm_usage(event)
            db.prune_llm_usage(days=PRUNE_DAYS)
            serialized = db.serialize_row(row, drop=())
            return {"ok": True, "source": "neon", "event": serialized}
        except Exception:
            pass
    stored = append_file_event(event)
    return {"ok": True, "source": "file", "event": stored}


def load_events() -> tuple[list[dict[str, Any]], str]:
    from synchro import db

    file_only = (os.environ.get("SYNCHRO_LLM_USAGE_FILE_ONLY") or "").strip() in {"1", "true", "yes"}
    if not file_only and db.database_configured():
        try:
            rows = db.list_llm_usage(days=PRUNE_DAYS, limit=2000)
            events = [db.serialize_row(row, drop=()) for row in rows]
            return events, "neon"
        except Exception:
            pass
    return read_file_events(), "file"


def health_payload(events: list[dict[str, Any]] | None = None) -> dict[str, Any]:
    from synchro import brain as brain_mod
    from synchro.morpho.vlm import ollama_vision_status

    ollama = brain_mod.ping_ollama()
    models = [str(item) for item in (ollama.get("models") or []) if item]
    vlm = ollama_vision_status()
    embed_ok = any("nomic-embed" in name for name in models)
    env_model = env_chat_model()
    chat_model = pick_chat_model(models, env_model) if ollama.get("ok") else env_model or None
    last_ok = last_local_ok_at(events or [])
    return {
        "ollama": ollama,
        "envModel": env_model or None,
        "chatModel": chat_model,
        "vlm": {
            "ok": bool(vlm.get("ok")),
            "model": vlm.get("model"),
            "host": vlm.get("host"),
        },
        "embed": {"ok": embed_ok, "model": "nomic-embed-text"},
        "lastLocalOkAt": last_ok,
        "localeOk": bool(ollama.get("ok") and last_ok),
    }


def dashboard() -> dict[str, Any]:
    events, source = load_events()
    return {
        "ok": True,
        "source": source,
        "health": health_payload(events),
        "rows": summarize_rows(events),
        "recent": recent_events(events, 20),
    }


def _native_generate(host: str, model: str, timeout: float) -> dict[str, Any]:
    from synchro.brain import _open

    body = json.dumps(
        {
            "model": model,
            "prompt": "ping",
            "stream": False,
            "keep_alive": "10m",
            "options": {"num_predict": 1},
        }
    ).encode("utf-8")
    with _open(
        f"{host.rstrip('/')}/api/generate",
        timeout,
        data=body,
        headers={"content-type": "application/json", "connection": "close"},
    ) as response:
        payload = json.loads(response.read().decode("utf-8"))
    if not isinstance(payload, dict):
        raise RuntimeError("réponse generate illisible")
    if payload.get("error"):
        raise RuntimeError(str(payload["error"]))
    text = str(payload.get("response") or "").strip()
    return {
        "text": text,
        "prompt_tokens": _int_or_none(payload.get("prompt_eval_count")),
        "completion_tokens": _int_or_none(payload.get("eval_count")),
        "kind": "generate",
    }


def _compat_ping(host: str, model: str, timeout: float) -> dict[str, Any]:
    from synchro.brain import _open

    base = host.rstrip("/")
    url = f"{base}/chat/completions" if base.endswith("/v1") else f"{base}/v1/chat/completions"
    body = json.dumps(
        {
            "model": model,
            "messages": [{"role": "user", "content": "ping"}],
            "max_tokens": 1,
            "stream": False,
        }
    ).encode("utf-8")
    with _open(
        url,
        timeout,
        data=body,
        headers={"content-type": "application/json", "connection": "close"},
    ) as response:
        payload = json.loads(response.read().decode("utf-8"))
    if not isinstance(payload, dict):
        raise RuntimeError("réponse chat illisible")
    if payload.get("error"):
        error = payload["error"]
        message = error.get("message") if isinstance(error, dict) else error
        raise RuntimeError(str(message or "chat error"))
    choices = payload.get("choices") or []
    message = choices[0].get("message") if choices and isinstance(choices[0], dict) else {}
    text = str((message or {}).get("content") or "").strip()
    usage = payload.get("usage") if isinstance(payload.get("usage"), dict) else {}
    return {
        "text": text,
        "prompt_tokens": _int_or_none(usage.get("prompt_tokens")),
        "completion_tokens": _int_or_none(usage.get("completion_tokens")),
        "kind": "chat",
    }


def ping_generate(timeout: float = 90.0) -> dict[str, Any]:
    from synchro import brain as brain_mod

    started = time.perf_counter()
    ping = brain_mod.ping_ollama()
    host = str(ping.get("host") or brain_mod.llm_base())
    models = [str(item) for item in (ping.get("models") or []) if item]
    model = pick_chat_model(models, env_chat_model())
    if not ping.get("ok"):
        error = str(ping.get("error") or "LLM local injoignable")
        record_usage(
            {
                "surface": "ping",
                "provider": "local",
                "model": model,
                "ok": False,
                "error": error,
                "latency_ms": round((time.perf_counter() - started) * 1000),
            }
        )
        return {"ok": False, "host": host, "model": model, "error": error}

    last_error = "generate vide"
    result: dict[str, Any] | None = None
    try:
        result = _native_generate(host, model, timeout)
    except Exception as exc:
        last_error = str(exc)
        try:
            result = _compat_ping(host, model, timeout)
        except Exception as fallback_exc:
            last_error = str(fallback_exc)

    latency_ms = round((time.perf_counter() - started) * 1000)
    if result is None:
        record_usage(
            {
                "surface": "ping",
                "provider": "local",
                "model": model,
                "ok": False,
                "error": last_error,
                "latency_ms": latency_ms,
            }
        )
        return {"ok": False, "host": host, "model": model, "error": last_error}

    prompt_tokens = result.get("prompt_tokens")
    completion_tokens = result.get("completion_tokens")
    estimated = prompt_tokens is None and completion_tokens is None
    if estimated:
        completion_tokens = estimate_tokens(str(result.get("text") or "ok"))
    stored = record_usage(
        {
            "surface": "ping",
            "provider": "local",
            "model": model,
            "ok": True,
            "prompt_tokens": prompt_tokens,
            "completion_tokens": completion_tokens,
            "estimated": estimated,
            "latency_ms": latency_ms,
        }
    )
    return {
        "ok": True,
        "host": host,
        "model": model,
        "kind": result.get("kind"),
        "latency_ms": latency_ms,
        "prompt_tokens": prompt_tokens,
        "completion_tokens": completion_tokens,
        "estimated": estimated,
        "source": stored.get("source"),
        "text": str(result.get("text") or "")[:80],
    }
