"""Poids et rapports hors dépôt, miroir Chartisme."""

from __future__ import annotations

import json
import re
import unicodedata
from pathlib import Path
from typing import Any

import numpy as np

from synchro.config import ROOT

BRAIN_DIR = ROOT / ".brain"
SPECIALISTS_DIR = BRAIN_DIR / "specialists"

_SLUG_RE = re.compile(r"[^a-z0-9]+")


def slugify(name: str) -> str:
    text = unicodedata.normalize("NFKD", name or "")
    text = "".join(ch for ch in text if not unicodedata.combining(ch))
    text = _SLUG_RE.sub("-", text.lower()).strip("-")
    return text[:80] or "specialiste"


def specialist_dir(slug: str, *, root: Path | None = None) -> Path:
    base = (root or SPECIALISTS_DIR).resolve()
    return base / slugify(slug)


def ensure_dir(path: Path) -> Path:
    path.mkdir(parents=True, exist_ok=True)
    return path


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def read_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def save_weights(path: Path, arrays: dict[str, Any]) -> None:
    packed = {key: np.asarray(value) for key, value in arrays.items()}
    np.savez_compressed(path, **packed)


def load_weights(path: Path) -> dict[str, np.ndarray]:
    with np.load(path, allow_pickle=False) as data:
        return {key: data[key] for key in data.files}


def list_slugs(root: Path | None = None) -> list[str]:
    base = root or SPECIALISTS_DIR
    if not base.exists():
        return []
    out = []
    for child in sorted(base.iterdir()):
        if child.is_dir() and (child / "config.json").exists():
            out.append(child.name)
    return out
