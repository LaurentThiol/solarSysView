"""Lectures hors dépôt, sous `.brain/decision-tree/`."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from synchro.brain_specialists.store import ensure_dir, slugify
from synchro.config import ROOT

TREE_DIR = ROOT / ".brain" / "decision-tree"

_SUMMARY_SKIP = {"tree_svg", "case_svg", "path_svg", "tree", "x_note"}


def tree_dir(root: Path | None = None) -> Path:
    return (root or TREE_DIR).resolve()


def reading_dir(slug: str, *, root: Path | None = None) -> Path:
    return tree_dir(root) / slugify(slug)


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def read_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def new_slug(question: str, label: str) -> str:
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")
    return slugify(f"{question}-{label}-{stamp}")


def save_reading(report: dict[str, Any], *, root: Path | None = None) -> Path:
    directory = ensure_dir(reading_dir(str(report["slug"]), root=root))
    svg = report.get("tree_svg")
    case = report.get("case_svg")
    if isinstance(svg, str) and svg:
        (directory / "tree.svg").write_text(svg, encoding="utf-8")
    if isinstance(case, str) and case:
        (directory / "case.svg").write_text(case, encoding="utf-8")
    path_svg = report.get("path_svg")
    if isinstance(path_svg, str) and path_svg:
        (directory / "path.svg").write_text(path_svg, encoding="utf-8")
    config = {
        "slug": report.get("slug"),
        "question": report.get("question"),
        "label": report.get("label"),
        "series": report.get("series"),
        "era": report.get("era"),
        "weekday": report.get("weekday"),
        "criterion": report.get("criterion"),
        "max_depth": report.get("max_depth"),
        "min_samples_leaf": report.get("min_samples_leaf"),
        "permutations": report.get("permutations"),
        "include_stars": report.get("include_stars"),
        "created_at": report.get("created_at"),
    }
    write_json(directory / "config.json", config)
    write_json(directory / "rules.json", {"slug": report.get("slug"), "rules": report.get("rules") or []})
    stored = {
        key: value
        for key, value in report.items()
        if key not in {"tree_svg", "case_svg", "path_svg"}
    }
    write_json(directory / "report.json", stored)
    return directory


def load_reading(slug: str, *, root: Path | None = None, with_svg: bool = True) -> dict[str, Any]:
    directory = reading_dir(slug, root=root)
    path = directory / "report.json"
    if not path.exists():
        raise FileNotFoundError(slug)
    report = read_json(path)
    if with_svg:
        tree_svg = directory / "tree.svg"
        case_svg = directory / "case.svg"
        report["tree_svg"] = tree_svg.read_text(encoding="utf-8") if tree_svg.exists() else None
        report["case_svg"] = case_svg.read_text(encoding="utf-8") if case_svg.exists() else None
        path_svg = directory / "path.svg"
        report["path_svg"] = path_svg.read_text(encoding="utf-8") if path_svg.exists() else None
    return report


def list_report_paths(root: Path | None = None) -> list[Path]:
    base = tree_dir(root)
    if not base.exists():
        return []
    return sorted(base.glob("*/report.json"), key=lambda path: path.stat().st_mtime, reverse=True)


def summarize(report: dict[str, Any]) -> dict[str, Any]:
    return {key: value for key, value in report.items() if key not in _SUMMARY_SKIP}
