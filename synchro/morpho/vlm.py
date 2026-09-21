"""Façade VLM : protocole VQA ancré. Backends optionnels derrière la même API."""

from __future__ import annotations

import base64
import hashlib
import io
import json
import os
import re
import subprocess
import sys
import threading
import time
from pathlib import Path
from typing import Any

from synchro.morpho.board import cell_number, cell_star, pixel_to_norm, point_to_number, point_to_star
from synchro.morpho.geometry import detect
from synchro.morpho.lexicon import caption_from_facts
from synchro.morpho.rules import draft_rule_from_state, validate_draft

PROMPT_ID = "morpho-vqa-v1"
PROMPT_ID_V2 = "morpho-vqa-v2"
GROUNDING_THRESHOLD = 0.4
DEFAULT_MODEL_ID = "vikhyatk/moondream2"
DEFAULT_REVISION = "2025-06-21"
INSTALL_CMD = "./launch install-vlm"
OLLAMA_HINT = (
    "Pour Morpho via Ollama : ollama pull qwen2.5vl:7b puis Charger / interroger "
    "(pas besoin de torch). Repli léger : ollama pull moondream."
)
INSTALL_HINT = (
    "Aucun VLM local. "
    "Recommandé : ollama pull qwen2.5vl:7b puis Charger / interroger. "
    "Repli : ollama pull moondream, ou ./launch install-vlm "
    "(torch + transformers + accelerate, ~2 Go)."
)
OLLAMA_LOAD_PROGRESS = "Connexion au VLM Ollama…"
COMPAT_HINT = (
    "Incompatibilité transformers 5 / Moondream2 : HfMoondream n'expose pas "
    "all_tied_weights_keys. Relancez ./launch install-vlm (transformers 4.x, <5) "
    "puis redémarrez — ou recliquez Charger / interroger."
)
LOAD_HINT = (
    "Échec du chargement de Moondream (paquets présents — ce n'est pas une "
    "installation manquante)."
)
INSTALL_PROGRESS = "Installation de torch + transformers + accelerate (une fois, ~2 Go)…"
PIN_PROGRESS = "Rétrogradation de transformers vers 4.x (compatible Moondream2)…"
LOAD_PROGRESS = "Chargement de Moondream2 (poids Hugging Face)…"
TRANSFORMERS_MODULES = ("transformers", "torch", "accelerate", "einops")

_QUERY_SPECS = (
    ("region", "top|bottom|center|periphery|mixed", "Reply with exactly one of: top, bottom, center, periphery, mixed. Where are the filled dots concentrated?"),
    ("collinear", "yes|no", "Reply with exactly one of: yes, no. Are three or more filled dots roughly collinear?"),
    ("compact", "compact|spread|mixed", "Reply with exactly one of: compact, spread, mixed. How compact is the cluster of filled dots?"),
    ("stars", "adjacent|apart|unclear", "Look at the lower smaller grid only. Reply with exactly one of: adjacent, apart, unclear. Are the two filled dots adjacent?"),
)

_backend: dict[str, Any] | None = None
_lock = threading.Lock()
_worker: threading.Thread | None = None
_phase: str | None = None
_last_error: str | None = None
_last_message: str | None = None
_ollama_vision_cache: tuple[float, dict[str, Any]] | None = None
OLLAMA_VISION_TTL_S = 10.0
VISION_EXCLUDE = re.compile(r"(embed|nomic-embed|tts|whisper|clip)", re.I)
VISION_RANK = (
    (re.compile(r"qwen2\.5vl|qwen2\.5-?vl", re.I), 0),
    (re.compile(r"qwen2-vl|qwen.*vl", re.I), 1),
    (re.compile(r"minicpm-?v", re.I), 2),
    (re.compile(r"llava", re.I), 3),
    (re.compile(r"llama3\.2-vision|(?:^|[^a-z0-9])vision", re.I), 4),
    (re.compile(r"moondream", re.I), 5),
)
VISION_CHAT = re.compile(
    r"qwen2\.5vl|qwen2\.5-?vl|qwen2-vl|qwen.*vl|llava|llama3\.2-vision|minicpm-?v",
    re.I,
)
_JSON_OBJECT = re.compile(r"\{.*\}", re.S)
VQA_V2_PROMPT = (
    "Reply with one JSON object only, no markdown. "
    "The image is a 5x10 number grid (rows 0-4, cols 0-9 map to numbers 1-50) "
    "above a 2x6 star grid (rows 0-1, cols 0-5 map to stars 1-12). Filled dots are occupied. "
    'Schema: {{"region":"top|bottom|center|periphery|mixed","collinear":"yes|no",'
    '"compact":"compact|spread|mixed","stars":"adjacent|apart|unclear",'
    '"caption":"one sentence","cells":[{{"row":0,"col":0}}],'
    '"star_cells":[{{"row":0,"col":0}}],'
    '"boxes":[{{"x":0.1,"y":0.1,"w":0.04,"h":0.06,"kind":"number"}}]}} '
    "Do not invent objects. Do not contradict these facts: {facts}"
)
SEQUENCE_V2_PROMPT = (
    "Reply with one JSON object only, no markdown. "
    'Schema: {"drift":"one sentence","cluster_move":"left|right|up|down|none"}. '
    "What spatial change occurs from left to right among the filled dots?"
)
CONTRASTIVE_V2_PROMPT = (
    "Reply with one JSON object only, no markdown. "
    'Schema: {"difference":"one sentence"}. '
    "What is the morphological difference between the left glyph and the right glyph?"
)


def extras_requirements_path() -> Path:
    return Path(__file__).resolve().parents[2] / "requirements-morpho.txt"


def image_hash(png: bytes) -> str:
    return hashlib.sha256(png).hexdigest()[:16]


def parse_label(answer: str, pattern: str) -> str | None:
    text = (answer or "").strip().lower()
    for token in pattern.split("|"):
        if re.search(rf"\b{re.escape(token)}\b", text):
            return token
    return None


def project_points(
    points: list[dict[str, Any]],
    *,
    kind: str,
) -> list[int]:
    found: list[int] = []
    for point in points:
        x = float(point.get("x", point.get("x_norm", 0)))
        y = float(point.get("y", point.get("y_norm", 0)))
        hit = point_to_number(x, y) if kind == "number" else point_to_star(x, y)
        if hit is not None:
            found.append(hit)
    return sorted(set(found))


def grounding_score(predicted: list[int], truth: list[int]) -> float:
    a, b = set(predicted), set(truth)
    if not a and not b:
        return 1.0
    if not a or not b:
        return 0.0
    return len(a & b) / len(a | b)


def geometry_queries(portrait: dict[str, Any]) -> dict[str, str]:
    motifs = set(portrait.get("motifs") or [])
    region = "mixed"
    for key in ("center", "top", "bottom", "periphery"):
        if key in motifs:
            region = "periphery" if key == "periphery" else key
            break
    if "center" in motifs:
        region = "center"
    compact = "mixed"
    if "cluster" in motifs:
        compact = "compact"
    elif "spread" in motifs:
        compact = "spread"
    return {
        "region": region,
        "collinear": "yes" if {"align_h", "align_v", "diagonal", "line"} & motifs else "no",
        "compact": compact,
        "stars": "adjacent" if "stars_adj" in motifs else "apart",
    }


def gguf_configured() -> bool:
    path = (os.environ.get("MORPHO_GGUF_PATH") or "").strip()
    return bool(path)


def vision_model_rank(name: str) -> int | None:
    lower = (name or "").strip()
    if not lower or VISION_EXCLUDE.search(lower):
        return None
    for pattern, rank in VISION_RANK:
        if pattern.search(lower):
            return rank
    return None


def is_vision_chat_model(name: str) -> bool:
    lower = (name or "").strip()
    if not lower or VISION_EXCLUDE.search(lower) or re.search(r"moondream", lower, re.I):
        return False
    return bool(VISION_CHAT.search(lower))


def parse_json_object(raw: str) -> dict[str, Any] | None:
    text = (raw or "").strip()
    if not text:
        return None
    fence = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", text, re.S)
    if fence:
        text = fence.group(1)
    else:
        match = _JSON_OBJECT.search(text)
        if match:
            text = match.group(0)
    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        return None
    return data if isinstance(data, dict) else None


def cells_to_values(cells: Any, *, kind: str) -> list[int]:
    found: list[int] = []
    if not isinstance(cells, list):
        return found
    for cell in cells:
        if not isinstance(cell, dict):
            continue
        try:
            row = int(cell.get("row"))
            col = int(cell.get("col"))
        except (TypeError, ValueError):
            continue
        try:
            value = cell_number(row, col) if kind == "number" else cell_star(row, col)
        except ValueError:
            continue
        found.append(value)
    return sorted(set(found))


def boxes_to_predicted(boxes: Any) -> tuple[list[int], list[int]]:
    numbers: list[int] = []
    stars: list[int] = []
    if not isinstance(boxes, list):
        return numbers, stars
    for box in boxes:
        if not isinstance(box, dict):
            continue
        try:
            x = float(box.get("x", 0))
            y = float(box.get("y", 0))
            width = float(box.get("w", box.get("width", 0)) or 0)
            height = float(box.get("h", box.get("height", 0)) or 0)
        except (TypeError, ValueError):
            continue
        cx = x + width / 2 if width else x
        cy = y + height / 2 if height else y
        if cx > 1 or cy > 1:
            cx, cy = pixel_to_norm(cx, cy)
        kind = str(box.get("kind") or "").lower()
        hit_number = point_to_number(cx, cy)
        hit_star = point_to_star(cx, cy)
        if kind in {"star", "s"}:
            if hit_star is not None:
                stars.append(hit_star)
        elif kind in {"number", "n"}:
            if hit_number is not None:
                numbers.append(hit_number)
        elif hit_number is not None:
            numbers.append(hit_number)
        elif hit_star is not None:
            stars.append(hit_star)
    return sorted(set(numbers)), sorted(set(stars))


def pick_vision_model(names: list[str]) -> str | None:
    wanted = (os.environ.get("MORPHO_VLM_MODEL") or "").strip()
    if wanted:
        for name in names:
            if name == wanted or name.startswith(f"{wanted}:") or wanted.startswith(f"{name}:"):
                if vision_model_rank(name) is not None:
                    return name
    scored: list[tuple[int, int, str]] = []
    for name in names:
        rank = vision_model_rank(name)
        if rank is None:
            continue
        scored.append((rank, len(name), name))
    if not scored:
        return None
    scored.sort()
    return scored[0][2]


def clear_ollama_vision_cache() -> None:
    global _ollama_vision_cache
    _ollama_vision_cache = None


def ollama_vision_status(*, force: bool = False) -> dict[str, Any]:
    """True only if native `/api/tags` lists a vision model (not OpenAI-compat)."""
    global _ollama_vision_cache
    now = time.monotonic()
    if not force and _ollama_vision_cache and now - _ollama_vision_cache[0] < OLLAMA_VISION_TTL_S:
        return _ollama_vision_cache[1]
    from synchro.brain import ping_ollama_tags

    ping = ping_ollama_tags()
    if not ping.get("ok") or ping.get("kind") != "tags":
        result: dict[str, Any] = {
            "ok": False,
            "host": ping.get("host"),
            "model": None,
            "models": [],
        }
    else:
        models = [str(item) for item in (ping.get("models") or []) if item]
        model = pick_vision_model(models)
        result = {
            "ok": bool(model),
            "host": ping.get("host"),
            "model": model,
            "models": models,
        }
    _ollama_vision_cache = (now, result)
    return result


def backend_order(preferred: str | None = None) -> list[str]:
    if preferred:
        return [preferred]
    names: list[str] = []
    if ollama_vision_status().get("ok"):
        names.append("ollama")
    names.extend(["transformers", "photon"])
    if gguf_configured():
        names.append("gguf")
    return names


def install_allowed() -> bool:
    if os.environ.get("MORPHO_VLM_NO_INSTALL") == "1":
        return False
    if os.environ.get("PYTEST_CURRENT_TEST"):
        return False
    return True


def _module_available(name: str) -> bool:
    try:
        __import__(name)
        return True
    except Exception:
        return False


def _transformers_ready() -> bool:
    return all(_module_available(name) for name in TRANSFORMERS_MODULES)


def extras_missing() -> bool:
    return not _probe_available()


def package_major(version: str | None) -> int | None:
    if not version:
        return None
    match = re.match(r"\d+", str(version).lstrip("vV"))
    return int(match.group(0)) if match else None


def transformers_needs_pin(version: str | None) -> bool:
    major = package_major(version)
    return major is not None and major >= 5


def _transformers_version() -> str | None:
    try:
        import transformers

        return getattr(transformers, "__version__", None)
    except Exception:
        return None


def _installed_transformers_needs_pin() -> bool:
    return transformers_needs_pin(_transformers_version())


def _stack_needs_install(preferred: str | None = None) -> bool:
    if preferred == "ollama":
        return False
    if preferred is None and ollama_vision_status().get("ok"):
        return False
    return extras_missing() or _installed_transformers_needs_pin()


def _install_progress_message() -> str:
    if extras_missing():
        return INSTALL_PROGRESS
    if _installed_transformers_needs_pin():
        return PIN_PROGRESS
    return INSTALL_PROGRESS


def looks_like_compat_error(exc: BaseException | str) -> bool:
    text = str(exc).lower()
    return "all_tied_weights_keys" in text or (
        "hfmoondream" in text and "has no attribute" in text
    )


def _looks_like_missing_extra(exc: BaseException | str) -> bool:
    if looks_like_compat_error(exc):
        return False
    text = str(exc).lower()
    return any(
        token in text
        for token in (
            "accelerate",
            "einops",
            "no module named 'transformers'",
            "no module named 'torch'",
            "no module named 'moondream'",
            "pip install accelerate",
        )
    )


def _should_retry_install(exc: BaseException | str) -> bool:
    return _looks_like_missing_extra(exc) or looks_like_compat_error(exc)


def format_vlm_load_error(errors: list[str]) -> str:
    detail = " | ".join(item for item in errors if item)
    if looks_like_compat_error(detail) or any(looks_like_compat_error(item) for item in errors):
        prefix = COMPAT_HINT
    elif not _probe_available() or _looks_like_missing_extra(detail):
        prefix = f"aucun backend VLM local. {OLLAMA_HINT} {INSTALL_HINT}"
    else:
        prefix = LOAD_HINT
    if detail:
        return f"{prefix} — {detail}"
    return prefix


def _has_tied_weights_attr(model: Any) -> bool:
    return "all_tied_weights_keys" in getattr(model, "__dict__", {})


def ensure_tied_weights_attr(model: Any, *, allow_post_init: bool = True) -> None:
    """HfMoondream skips post_init(); transformers 5 reads all_tied_weights_keys after __init__."""
    if _has_tied_weights_attr(model):
        return
    if allow_post_init:
        method = getattr(model, "post_init", None)
        if callable(method):
            try:
                method()
            except Exception:
                pass
    if not _has_tied_weights_attr(model):
        try:
            model.all_tied_weights_keys = {}
        except Exception:
            pass


def apply_hf_moondream_compat(cls: type) -> type:
    """Wrap a remote-code HfMoondream class so __init__ runs post_init() (upstream v5 fix)."""
    if getattr(cls, "_morpho_tied_compat", False):
        return cls
    orig_init = cls.__init__

    def wrapped_init(self, *args, **kwargs):
        orig_init(self, *args, **kwargs)
        ensure_tied_weights_attr(self, allow_post_init=True)

    cls.__init__ = wrapped_init  # type: ignore[method-assign]
    cls._morpho_tied_compat = True
    return cls


def patch_loaded_hf_moondream_classes() -> list[type]:
    patched: list[type] = []
    for module in list(sys.modules.values()):
        try:
            cls = getattr(module, "HfMoondream", None)
        except Exception:
            continue
        if isinstance(cls, type):
            apply_hf_moondream_compat(cls)
            patched.append(cls)
    return patched


def _install_tied_weights_getattr_patch():
    """Fallback if HfMoondream is constructed before we can wrap its __init__."""
    try:
        import torch.nn as nn
    except Exception:
        return lambda: None
    orig = nn.Module.__getattr__
    if getattr(orig, "_morpho_tied_patch", False):
        return lambda: None

    def patched(self, name):
        if name == "all_tied_weights_keys":
            return {}
        return orig(self, name)

    patched._morpho_tied_patch = True  # type: ignore[attr-defined]
    nn.Module.__getattr__ = patched

    def restore() -> None:
        if nn.Module.__getattr__ is patched:
            nn.Module.__getattr__ = orig

    return restore


def _optional_backend_noise(name: str, exc: BaseException) -> bool:
    if name == "ollama":
        return True
    if name == "photon" and _is_missing_module(exc, "moondream"):
        return True
    if name == "gguf":
        return True
    return False


def _is_missing_module(exc: BaseException, module: str) -> bool:
    if isinstance(exc, ModuleNotFoundError):
        missing = getattr(exc, "name", None) or str(exc)
        return module in str(missing)
    return f"no module named '{module}'" in str(exc).lower()


def status() -> dict[str, Any]:
    loaded = _backend is not None
    busy = _worker is not None and _worker.is_alive()
    available = _probe_available()
    ollama = ollama_vision_status()
    if loaded:
        hint = None
    elif ollama.get("ok"):
        hint = f"VLM Ollama prêt ({ollama.get('model')}). Pas besoin de torch."
    elif _installed_transformers_needs_pin():
        hint = COMPAT_HINT
    elif available:
        hint = None
    else:
        hint = f"{OLLAMA_HINT} {INSTALL_HINT}"
    return {
        "loaded": loaded,
        "busy": busy,
        "phase": None if loaded else _phase,
        "backend": None if not loaded else _backend.get("name"),
        "model_id": None if not loaded else _backend.get("model_id"),
        "revision": None if not loaded else _backend.get("revision"),
        "prompt_id": PROMPT_ID,
        "available": available,
        "hint": hint,
        "error": None if loaded else _last_error,
        "message": None if loaded else _last_message,
        "install_cmd": INSTALL_CMD,
    }


def _probe_available() -> list[str]:
    found: list[str] = []
    if ollama_vision_status().get("ok"):
        found.append("ollama")
    if _transformers_ready():
        found.append("transformers")
    if _module_available("moondream"):
        found.append("photon")
    if gguf_configured() and _module_available("llama_cpp"):
        found.append("gguf")
    return found


def _load_first_backend(preferred: str | None = None) -> dict[str, Any]:
    global _backend, _last_error
    errors: list[str] = []
    for name in backend_order(preferred):
        try:
            if name == "ollama":
                _backend = _load_ollama()
            elif name == "photon":
                _backend = _load_photon()
            elif name == "transformers":
                _backend = _load_transformers()
            elif name == "gguf":
                _backend = _load_gguf()
            else:
                continue
            _last_error = None
            return status()
        except Exception as exc:
            if preferred or not _optional_backend_noise(name, exc):
                errors.append(f"{name}: {exc}")
    raise RuntimeError(format_vlm_load_error(errors))


def load(backend: str | None = None, *, install: bool = False) -> dict[str, Any]:
    """Charge le premier backend disponible. No-op si déjà chargé."""
    if _backend is not None:
        return status()
    tried_install = False
    if install and _stack_needs_install(backend) and install_allowed():
        _pip_install_extras()
        tried_install = True
    try:
        return _load_first_backend(backend)
    except RuntimeError as exc:
        if install and install_allowed() and not tried_install and _should_retry_install(exc):
            _pip_install_extras()
            return _load_first_backend(backend)
        raise


def ensure_loaded(backend: str | None = None, *, install: bool = True) -> dict[str, Any]:
    """Démarre le chargement (et l'install pip si besoin) en arrière-plan."""
    global _worker, _phase, _last_error, _last_message
    if _backend is not None:
        return {"ok": True, **status()}
    with _lock:
        if _worker is not None and _worker.is_alive():
            return {"ok": False, **status()}
        will_install = install and _stack_needs_install(backend) and install_allowed()
        _phase = "installing" if will_install else "loading"
        if will_install:
            _last_message = _install_progress_message()
        elif (backend or "ollama") == "ollama" and ollama_vision_status().get("ok"):
            _last_message = OLLAMA_LOAD_PROGRESS
        else:
            _last_message = LOAD_PROGRESS
        _last_error = None
        _worker = threading.Thread(
            target=_load_worker,
            args=(backend, install),
            daemon=True,
            name="morpho-vlm-load",
        )
        _worker.start()
    return {"ok": False, **status()}


def _load_worker(backend: str | None, install: bool) -> None:
    global _phase, _last_error, _last_message
    try:
        if install and _stack_needs_install(backend) and install_allowed():
            _phase = "installing"
            _last_message = _install_progress_message()
            _last_error = None
            _pip_install_extras()
        _phase = "loading"
        _last_message = (
            OLLAMA_LOAD_PROGRESS
            if (backend or "ollama") == "ollama" and ollama_vision_status().get("ok")
            else LOAD_PROGRESS
        )
        load(backend, install=False)
        _last_error = None
        _last_message = None
        _phase = None
    except Exception as exc:
        if install and install_allowed() and _should_retry_install(exc):
            try:
                _phase = "installing"
                _last_message = _install_progress_message()
                _last_error = None
                _pip_install_extras()
                _phase = "loading"
                _last_message = LOAD_PROGRESS
                load(backend, install=False)
                _last_error = None
                _last_message = None
                _phase = None
                return
            except Exception as retry_exc:
                _last_error = str(retry_exc)
                _last_message = None
                _phase = None
                return
        _last_error = str(exc)
        _last_message = None
        _phase = None


def _pip_install_extras() -> None:
    import importlib

    req = extras_requirements_path()
    if not req.is_file():
        raise RuntimeError(f"fichier introuvable : {req}")
    proc = subprocess.run(
        [sys.executable, "-m", "pip", "install", "-r", str(req)],
        capture_output=True,
        text=True,
        check=False,
    )
    if proc.returncode != 0:
        tail = (proc.stderr or proc.stdout or "").strip()[-800:]
        raise RuntimeError(f"pip install -r requirements-morpho.txt a échoué : {tail}")
    importlib.invalidate_caches()


def unload() -> None:
    global _backend, _phase, _last_error, _last_message
    _backend = None
    _phase = None
    _last_error = None
    _last_message = None
    clear_ollama_vision_cache()


def _load_ollama() -> dict[str, Any]:
    probe = ollama_vision_status(force=True)
    if not probe.get("ok") or not probe.get("model") or not probe.get("host"):
        raise RuntimeError("Ollama n'expose pas de modèle vision (ollama pull qwen2.5vl:7b)")
    return {
        "name": "ollama",
        "model": None,
        "host": probe["host"],
        "model_id": probe["model"],
        "revision": None,
    }


def _chat_ollama(host: str, model: str, png: bytes, question: str, timeout: float = 120) -> str:
    from synchro.brain import _open

    encoded = base64.standard_b64encode(png).decode("ascii")
    body = json.dumps(
        {
            "model": model,
            "stream": False,
            "keep_alive": "30m",
            "messages": [{"role": "user", "content": question, "images": [encoded]}],
        }
    ).encode("utf-8")
    with _open(
        f"{host.rstrip('/')}/api/chat",
        timeout,
        data=body,
        headers={"content-type": "application/json", "connection": "close"},
    ) as response:
        payload = json.loads(response.read().decode("utf-8"))
    message = payload.get("message") if isinstance(payload, dict) else None
    if isinstance(message, dict) and message.get("content"):
        return str(message["content"]).strip()
    if isinstance(payload, dict) and payload.get("response"):
        return str(payload["response"]).strip()
    error = ""
    if isinstance(payload, dict):
        error = str(payload.get("error") or "")
    raise RuntimeError(error or "réponse VLM Ollama vide")


def _load_photon() -> dict[str, Any]:
    import moondream as md

    if hasattr(md, "vl"):
        model = md.vl()
    elif hasattr(md, "photon"):
        model = md.photon("moondream2")
    else:
        raise RuntimeError("API moondream inconnue (attendu md.vl ou md.photon)")
    return {"name": "photon", "model": model, "model_id": "moondream2", "revision": None}


def _target_torch_device() -> str:
    import torch

    if torch.cuda.is_available():
        return "cuda"
    mps = getattr(torch.backends, "mps", None)
    if mps is not None and mps.is_available():
        return "mps"
    return "cpu"


def _load_pretrained_causal_lm(config, kwargs: dict[str, Any]):
    from transformers import AutoModelForCausalLM

    patch_loaded_hf_moondream_classes()
    restore = _install_tied_weights_getattr_patch()
    try:
        return AutoModelForCausalLM.from_pretrained(DEFAULT_MODEL_ID, config=config, **kwargs)
    finally:
        restore()


def _load_transformers() -> dict[str, Any]:
    from transformers import AutoConfig

    device = _target_torch_device()
    kwargs: dict[str, Any] = {
        "revision": DEFAULT_REVISION,
        "trust_remote_code": True,
    }
    use_device_map = device != "cpu" and _module_available("accelerate")
    if use_device_map:
        kwargs["device_map"] = {"": device}
    config = AutoConfig.from_pretrained(
        DEFAULT_MODEL_ID,
        revision=DEFAULT_REVISION,
        trust_remote_code=True,
    )
    patch_loaded_hf_moondream_classes()
    try:
        model = _load_pretrained_causal_lm(config, kwargs)
    except Exception as exc:
        if use_device_map and "accelerate" in str(exc).lower():
            kwargs.pop("device_map", None)
            model = _load_pretrained_causal_lm(config, kwargs)
        elif looks_like_compat_error(exc):
            patch_loaded_hf_moondream_classes()
            model = _load_pretrained_causal_lm(config, kwargs)
        else:
            raise
    ensure_tied_weights_attr(model, allow_post_init=False)
    if "device_map" not in kwargs and device != "cpu":
        model = model.to(device)
    tokenizer = None
    try:
        from transformers import AutoTokenizer

        tokenizer = AutoTokenizer.from_pretrained(DEFAULT_MODEL_ID, revision=DEFAULT_REVISION)
    except Exception:
        tokenizer = None
    return {
        "name": "transformers",
        "model": model,
        "tokenizer": tokenizer,
        "model_id": DEFAULT_MODEL_ID,
        "revision": DEFAULT_REVISION,
    }


def _load_gguf() -> dict[str, Any]:
    path = (os.environ.get("MORPHO_GGUF_PATH") or "").strip()
    if not path:
        raise RuntimeError("définir MORPHO_GGUF_PATH")
    if not Path(path).is_file():
        raise RuntimeError(f"fichier GGUF introuvable : {path}")
    try:
        from llama_cpp import Llama  # noqa: F401
    except ImportError as exc:
        raise RuntimeError("installer llama-cpp-python") from exc
    raise RuntimeError("backend GGUF Moondream non branché (llama.cpp vision)")


def _pil_image(png: bytes):
    from PIL import Image

    return Image.open(io.BytesIO(png)).convert("RGB")


def _ask(png: bytes, question: str, timeout: float | None = None) -> str:
    if _backend is None:
        raise RuntimeError("VLM non chargé")
    if _backend.get("name") == "ollama":
        host = str(_backend.get("host") or "")
        model = str(_backend.get("model_id") or "")
        if not host or not model:
            raise RuntimeError("backend Ollama incomplet")
        return _chat_ollama(host, model, png, question, timeout=timeout or 120)
    model = _backend["model"]
    image = _pil_image(png)
    if hasattr(model, "query"):
        result = model.query(image, question)
        if isinstance(result, dict):
            return str(result.get("answer") or "")
        return str(result)
    if hasattr(model, "answer_question"):
        encoded = model.encode_image(image) if hasattr(model, "encode_image") else image
        tokenizer = _backend.get("tokenizer")
        if tokenizer is not None:
            return str(model.answer_question(encoded, question, tokenizer))
        return str(model.answer_question(encoded, question))
    raise RuntimeError(f"backend sans query(): {_backend.get('name')}")


def _point(png: bytes, target: str) -> list[dict[str, Any]]:
    if _backend is None:
        return []
    if _backend.get("name") == "ollama":
        return []
    model = _backend["model"]
    if not hasattr(model, "point"):
        return []
    image = _pil_image(png)
    raw = model.point(image, target)
    if isinstance(raw, dict):
        return list(raw.get("points") or [])
    return list(raw or [])


def _morpho_provider() -> str:
    name = str((_backend or {}).get("name") or "")
    return "ollama" if name == "ollama" else "hf"


def _record_morpho(*, ok: bool, error: str | None = None, latency_ms: int | None = None, text: str = "") -> None:
    if _backend is None:
        return
    try:
        from synchro.llm_usage import estimate_tokens, record_usage

        estimated = bool(text)
        record_usage(
            {
                "surface": "morpho",
                "provider": _morpho_provider(),
                "model": str(_backend.get("model_id") or ""),
                "ok": ok,
                "error": error,
                "prompt_tokens": None,
                "completion_tokens": estimate_tokens(text) if estimated and ok else None,
                "estimated": estimated and ok,
                "latency_ms": latency_ms,
            }
        )
    except Exception:
        pass


def analyze(
    numbers: list[int],
    stars: list[int],
    *,
    png: bytes | None = None,
    residual_ok: bool = True,
) -> dict[str, Any]:
    from synchro.morpho.render import glyph_png

    portrait = detect(numbers, stars)
    facts = portrait["facts"]
    geo_q = geometry_queries(portrait)
    blob = png or glyph_png(numbers, stars, show_labels=False)
    queries = dict(geo_q)
    residual = None
    points: list[dict[str, Any]] = []
    predicted_numbers: list[int] = []
    predicted_stars: list[int] = []
    score = None
    used_vlm = False
    backend_name = None

    prompt_id = PROMPT_ID
    if _backend is not None:
        backend_name = _backend["name"]
        used_vlm = True
        started = time.perf_counter()
        try:
            fact_line = "; ".join(facts)
            if backend_name == "ollama" and is_vision_chat_model(str(_backend.get("model_id") or "")):
                prompt_id = PROMPT_ID_V2
                raw = _ask(blob, VQA_V2_PROMPT.format(facts=fact_line), timeout=120)
                parsed = parse_json_object(raw) or {}
                for key, pattern, _question in _QUERY_SPECS:
                    label = parse_label(str(parsed.get(key) or ""), pattern)
                    if label:
                        queries[key] = label
                residual = str(parsed.get("caption") or raw).strip()
                predicted_numbers = cells_to_values(parsed.get("cells"), kind="number")
                predicted_stars = cells_to_values(parsed.get("star_cells"), kind="star")
                box_numbers, box_stars = boxes_to_predicted(parsed.get("boxes"))
                predicted_numbers = sorted(set(predicted_numbers + box_numbers))
                predicted_stars = sorted(set(predicted_stars + box_stars))
            else:
                for key, pattern, question in _QUERY_SPECS:
                    answer = _ask(blob, question)
                    parsed_label = parse_label(answer, pattern)
                    if parsed_label:
                        queries[key] = parsed_label
                residual = _ask(
                    blob,
                    "One sentence. Describe only the geometric arrangement of filled dots. "
                    f"Do not invent objects. Do not contradict these facts: {fact_line}.",
                ).strip()
                points = _point(blob, "filled circle")
                predicted_numbers = project_points(points, kind="number")
                predicted_stars = project_points(points, kind="star")
            if predicted_numbers or predicted_stars:
                score = 0.75 * grounding_score(predicted_numbers, numbers) + 0.25 * grounding_score(
                    predicted_stars, stars
                )
                score = round(score, 4)
            bits = [residual or ""] + [str(value) for value in queries.values()]
            _record_morpho(ok=True, latency_ms=round((time.perf_counter() - started) * 1000), text=" ".join(bits))
        except Exception as exc:
            _record_morpho(ok=False, error=str(exc), latency_ms=round((time.perf_counter() - started) * 1000))
            raise

    allow_residual = residual_ok and (score is None or score >= GROUNDING_THRESHOLD)
    caption = caption_from_facts(facts, residual if allow_residual else None)
    state = {
        **portrait,
        "queries": queries,
        "caption": caption,
        "residual": residual if allow_residual else None,
        "points": points,
        "predicted_numbers": predicted_numbers,
        "predicted_stars": predicted_stars,
        "grounding_score": score,
        "vlm": used_vlm,
        "backend": backend_name,
        "model_id": None if _backend is None else _backend.get("model_id"),
        "revision": None if _backend is None else _backend.get("revision"),
        "prompt_id": prompt_id,
        "image_hash": image_hash(blob),
    }
    return state


def sequence_query(draws: list[tuple[list[int], list[int]]]) -> dict[str, Any]:
    from synchro.morpho.render import montage_png

    if len(draws) < 2:
        return {"ok": False, "error": "montage : au moins deux glyphes"}
    png = montage_png(draws)
    if _backend is None:
        return {"ok": True, "loaded": False, "drift": None, "cluster_move": None}
    started = time.perf_counter()
    try:
        if _backend.get("name") == "ollama" and is_vision_chat_model(str(_backend.get("model_id") or "")):
            parsed = parse_json_object(_ask(png, SEQUENCE_V2_PROMPT, timeout=120)) or {}
            drift = str(parsed.get("drift") or "").strip()
            move = parse_label(str(parsed.get("cluster_move") or ""), "left|right|up|down|none")
        else:
            drift = _ask(png, "One sentence: what spatial change occurs from left to right among the filled dots?")
            move = parse_label(
                _ask(png, "Reply with exactly one of: left, right, up, down, none. Does the cluster migrate?"),
                "left|right|up|down|none",
            )
        _record_morpho(
            ok=True,
            latency_ms=round((time.perf_counter() - started) * 1000),
            text=f"{drift or ''} {move or ''}",
        )
        return {"ok": True, "loaded": True, "drift": drift, "cluster_move": move}
    except Exception as exc:
        _record_morpho(ok=False, error=str(exc), latency_ms=round((time.perf_counter() - started) * 1000))
        raise


def contrastive_query(
    a: tuple[list[int], list[int]],
    b: tuple[list[int], list[int]],
) -> dict[str, Any]:
    from synchro.morpho.render import side_by_side_png

    png = side_by_side_png(a, b)
    if _backend is None:
        return {"ok": True, "loaded": False, "difference": None}
    started = time.perf_counter()
    try:
        if _backend.get("name") == "ollama" and is_vision_chat_model(str(_backend.get("model_id") or "")):
            parsed = parse_json_object(_ask(png, CONTRASTIVE_V2_PROMPT, timeout=120)) or {}
            difference = str(parsed.get("difference") or "").strip()
        else:
            difference = _ask(
                png,
                "One sentence: what is the morphological difference between the left glyph and the right glyph?",
            )
        _record_morpho(
            ok=True,
            latency_ms=round((time.perf_counter() - started) * 1000),
            text=str(difference or ""),
        )
        return {"ok": True, "loaded": True, "difference": difference}
    except Exception as exc:
        _record_morpho(ok=False, error=str(exc), latency_ms=round((time.perf_counter() - started) * 1000))
        raise


def draft_rule(state: dict[str, Any]) -> dict[str, Any]:
    return validate_draft(draft_rule_from_state(state))
