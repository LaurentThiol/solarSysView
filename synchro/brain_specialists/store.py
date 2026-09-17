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
# « Père impair » était une coquille de « Paire impair ».
_SLUG_ALIASES = {"pere-impair": "paire-impair"}
_NAME_ALIASES = {"père impair": "Paire impair", "pere impair": "Paire impair"}


def slugify(name: str) -> str:
    text = unicodedata.normalize("NFKD", name or "")
    text = "".join(ch for ch in text if not unicodedata.combining(ch))
    text = _SLUG_RE.sub("-", text.lower()).strip("-")
    slug = text[:80] or "specialiste"
    return _SLUG_ALIASES.get(slug, slug)


def canonicalize_config(config: dict[str, Any]) -> dict[str, Any]:
    slug = slugify(str(config.get("slug") or config.get("name") or ""))
    config["slug"] = slug
    config["handle"] = f"specialist.{slug}"
    name = (config.get("name") or "").strip()
    if name.lower() in _NAME_ALIASES:
        config["name"] = _NAME_ALIASES[name.lower()]
    return config


def migrate_legacy_slugs(root: Path | None = None) -> None:
    base = (root or SPECIALISTS_DIR).resolve()
    if not base.exists():
        return
    for old, new in _SLUG_ALIASES.items():
        src, dst = base / old, base / new
        if src.is_dir() and src.resolve() != dst.resolve() and not dst.exists():
            src.rename(dst)
        config_path = dst / "config.json"
        if not config_path.exists():
            continue
        config = read_json(config_path)
        before = (config.get("slug"), config.get("name"), config.get("handle"))
        canonicalize_config(config)
        after = (config.get("slug"), config.get("name"), config.get("handle"))
        if before != after:
            write_json(config_path, config)


def specialist_dir(slug: str, *, root: Path | None = None) -> Path:
    migrate_legacy_slugs(root)
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
    migrate_legacy_slugs(root)
    base = root or SPECIALISTS_DIR
    if not base.exists():
        return []
    out = []
    for child in sorted(base.iterdir()):
        if child.is_dir() and (child / "config.json").exists():
            out.append(child.name)
    return out
