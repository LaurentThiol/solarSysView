"""Façade VLM : protocole VQA ancré. Backends optionnels derrière la même API."""

from __future__ import annotations

import hashlib
import io
import os
import re
import subprocess
import sys
import threading
from pathlib import Path
from typing import Any

from synchro.morpho.board import point_to_number, point_to_star
from synchro.morpho.geometry import detect
from synchro.morpho.lexicon import caption_from_facts
from synchro.morpho.rules import draft_rule_from_state, validate_draft

PROMPT_ID = "morpho-vqa-v1"
GROUNDING_THRESHOLD = 0.4
DEFAULT_MODEL_ID = "vikhyatk/moondream2"
DEFAULT_REVISION = "2025-06-21"
INSTALL_CMD = "./launch install-vlm"
INSTALL_HINT = (
    "Moondream n'est pas installé. Lancez ./launch install-vlm "
    "(torch + transformers, ~2 Go, une fois) puis recliquez "
    "Charger / interroger — ou laissez le bouton installer tout seul."
)

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


def backend_order(preferred: str | None = None) -> list[str]:
    if preferred:
        return [preferred]
    names = ["transformers", "photon"]
    if gguf_configured():
        names.append("gguf")
    return names


def install_allowed() -> bool:
    if os.environ.get("MORPHO_VLM_NO_INSTALL") == "1":
        return False
    if os.environ.get("PYTEST_CURRENT_TEST"):
        return False
    return True


def status() -> dict[str, Any]:
    loaded = _backend is not None
    busy = _worker is not None and _worker.is_alive()
    available = _probe_available()
    hint = None if loaded or available else INSTALL_HINT
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
    try:
        import transformers  # noqa: F401

        found.append("transformers")
    except Exception:
        pass
    try:
        import moondream  # noqa: F401

        found.append("photon")
    except Exception:
        pass
    if gguf_configured():
        try:
            from llama_cpp import Llama  # noqa: F401

            found.append("gguf")
        except Exception:
            pass
    return found


def load(backend: str | None = None, *, install: bool = False) -> dict[str, Any]:
    """Charge le premier backend disponible. No-op si déjà chargé."""
    global _backend, _last_error
    if _backend is not None:
        return status()
    if install and not _probe_available() and install_allowed():
        _pip_install_extras()
    errors: list[str] = []
    for name in backend_order(backend):
        try:
            if name == "photon":
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
            errors.append(f"{name}: {exc}")
    detail = " | ".join(errors)
    if errors:
        raise RuntimeError(f"aucun backend VLM local. {INSTALL_HINT} — {detail}")
    raise RuntimeError(f"aucun backend VLM local. {INSTALL_HINT}")


def ensure_loaded(backend: str | None = None, *, install: bool = True) -> dict[str, Any]:
    """Démarre le chargement (et l'install pip si besoin) en arrière-plan."""
    global _worker
    if _backend is not None:
        return {"ok": True, **status()}
    with _lock:
        if _worker is not None and _worker.is_alive():
            return {"ok": False, **status()}
        will_install = install and not _probe_available() and install_allowed()
        _phase = "installing" if will_install else "loading"
        _last_message = (
            "Installation de torch + transformers (une fois, ~2 Go)…"
            if will_install
            else "Chargement de Moondream2 (poids Hugging Face)…"
        )
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
        if install and not _probe_available() and install_allowed():
            _phase = "installing"
            _last_message = "Installation de torch + transformers (une fois, ~2 Go)…"
            _last_error = None
            _pip_install_extras()
        _phase = "loading"
        _last_message = "Chargement de Moondream2 (poids Hugging Face)…"
        load(backend, install=False)
        _last_error = None
        _last_message = None
        _phase = None
    except Exception as exc:
        _last_error = str(exc)
        _last_message = None
        _phase = None


def _pip_install_extras() -> None:
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


def unload() -> None:
    global _backend, _phase, _last_error, _last_message
    _backend = None
    _phase = None
    _last_error = None
    _last_message = None


def _load_photon() -> dict[str, Any]:
    import moondream as md

    if hasattr(md, "vl"):
        model = md.vl()
    elif hasattr(md, "photon"):
        model = md.photon("moondream2")
    else:
        raise RuntimeError("API moondream inconnue (attendu md.vl ou md.photon)")
    return {"name": "photon", "model": model, "model_id": "moondream2", "revision": None}


def _load_transformers() -> dict[str, Any]:
    import torch
    from transformers import AutoModelForCausalLM

    kwargs: dict[str, Any] = {
        "revision": DEFAULT_REVISION,
        "trust_remote_code": True,
    }
    if torch.cuda.is_available():
        kwargs["device_map"] = {"": "cuda"}
    elif getattr(torch.backends, "mps", None) and torch.backends.mps.is_available():
        kwargs["device_map"] = {"": "mps"}
    model = AutoModelForCausalLM.from_pretrained(DEFAULT_MODEL_ID, **kwargs)
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


def _ask(png: bytes, question: str) -> str:
    if _backend is None:
        raise RuntimeError("VLM non chargé")
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
    model = _backend["model"]
    if not hasattr(model, "point"):
        return []
    image = _pil_image(png)
    raw = model.point(image, target)
    if isinstance(raw, dict):
        return list(raw.get("points") or [])
    return list(raw or [])


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

    if _backend is not None:
        backend_name = _backend["name"]
        used_vlm = True
        fact_line = "; ".join(facts)
        for key, pattern, question in _QUERY_SPECS:
            answer = _ask(blob, question)
            parsed = parse_label(answer, pattern)
            if parsed:
                queries[key] = parsed
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
        "prompt_id": PROMPT_ID,
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
    drift = _ask(png, "One sentence: what spatial change occurs from left to right among the filled dots?")
    move = parse_label(
        _ask(png, "Reply with exactly one of: left, right, up, down, none. Does the cluster migrate?"),
        "left|right|up|down|none",
    )
    return {"ok": True, "loaded": True, "drift": drift, "cluster_move": move}


def contrastive_query(
    a: tuple[list[int], list[int]],
    b: tuple[list[int], list[int]],
) -> dict[str, Any]:
    from synchro.morpho.render import side_by_side_png

    png = side_by_side_png(a, b)
    if _backend is None:
        return {"ok": True, "loaded": False, "difference": None}
    difference = _ask(
        png,
        "One sentence: what is the morphological difference between the left glyph and the right glyph?",
    )
    return {"ok": True, "loaded": True, "difference": difference}


def draft_rule(state: dict[str, Any]) -> dict[str, Any]:
    return validate_draft(draft_rule_from_state(state))
