"""Façade VLM : protocole VQA ancré. Backends optionnels derrière la même API."""

from __future__ import annotations

import hashlib
import re
from typing import Any

from synchro.morpho.board import point_to_number, point_to_star
from synchro.morpho.geometry import detect
from synchro.morpho.lexicon import caption_from_facts
from synchro.morpho.rules import draft_rule_from_state, validate_draft

PROMPT_ID = "morpho-vqa-v1"
GROUNDING_THRESHOLD = 0.4
DEFAULT_MODEL_ID = "vikhyatk/moondream2"
DEFAULT_REVISION = "2025-06-21"

_QUERY_SPECS = (
    ("region", "top|bottom|center|periphery|mixed", "Reply with exactly one of: top, bottom, center, periphery, mixed. Where are the filled dots concentrated?"),
    ("collinear", "yes|no", "Reply with exactly one of: yes, no. Are three or more filled dots roughly collinear?"),
    ("compact", "compact|spread|mixed", "Reply with exactly one of: compact, spread, mixed. How compact is the cluster of filled dots?"),
    ("stars", "adjacent|apart|unclear", "Look at the lower smaller grid only. Reply with exactly one of: adjacent, apart, unclear. Are the two filled dots adjacent?"),
)

_backend: dict[str, Any] | None = None


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


def status() -> dict[str, Any]:
    loaded = _backend is not None
    return {
        "loaded": loaded,
        "backend": None if not loaded else _backend.get("name"),
        "model_id": None if not loaded else _backend.get("model_id"),
        "revision": None if not loaded else _backend.get("revision"),
        "prompt_id": PROMPT_ID,
        "available": _probe_available(),
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
    try:
        from llama_cpp import Llama  # noqa: F401

        found.append("gguf")
    except Exception:
        pass
    return found


def load(backend: str | None = None) -> dict[str, Any]:
    """Charge le premier backend disponible. No-op si déjà chargé."""
    global _backend
    if _backend is not None:
        return status()
    order = [backend] if backend else ["photon", "transformers", "gguf"]
    errors: list[str] = []
    for name in order:
        if not name:
            continue
        try:
            if name == "photon":
                _backend = _load_photon()
            elif name == "transformers":
                _backend = _load_transformers()
            elif name == "gguf":
                _backend = _load_gguf()
            else:
                continue
            return status()
        except Exception as exc:
            errors.append(f"{name}: {exc}")
    raise RuntimeError("aucun backend VLM local: " + " | ".join(errors) if errors else "aucun backend")


def unload() -> None:
    global _backend
    _backend = None


def _load_photon() -> dict[str, Any]:
    import moondream as md

    model = md.photon("moondream2")
    return {"name": "photon", "model": model, "model_id": "moondream2", "revision": None}


def _load_transformers() -> dict[str, Any]:
    from transformers import AutoModelForCausalLM, AutoTokenizer

    model = AutoModelForCausalLM.from_pretrained(
        DEFAULT_MODEL_ID,
        revision=DEFAULT_REVISION,
        trust_remote_code=True,
    )
    tokenizer = AutoTokenizer.from_pretrained(DEFAULT_MODEL_ID, revision=DEFAULT_REVISION)
    return {
        "name": "transformers",
        "model": model,
        "tokenizer": tokenizer,
        "model_id": DEFAULT_MODEL_ID,
        "revision": DEFAULT_REVISION,
    }


def _load_gguf() -> dict[str, Any]:
    raise RuntimeError("GGUF : définir MORPHO_GGUF_PATH et llama-cpp-python")


def _ask(png: bytes, question: str) -> str:
    if _backend is None:
        raise RuntimeError("VLM non chargé")
    name = _backend["name"]
    if name == "photon":
        from PIL import Image
        import io

        image = Image.open(io.BytesIO(png)).convert("RGB")
        return str(_backend["model"].query(image, question).get("answer") or "")
    if name == "transformers":
        from PIL import Image
        import io

        image = Image.open(io.BytesIO(png)).convert("RGB")
        model = _backend["model"]
        encoded = model.encode_image(image)
        return str(model.answer_question(encoded, question, _backend["tokenizer"]))
    raise RuntimeError(f"backend inconnu: {name}")


def _point(png: bytes, target: str) -> list[dict[str, Any]]:
    if _backend is None or _backend["name"] != "photon":
        return []
    from PIL import Image
    import io

    image = Image.open(io.BytesIO(png)).convert("RGB")
    raw = _backend["model"].point(image, target)
    return list(raw.get("points") or [])


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
