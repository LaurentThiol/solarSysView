"""runArcade : le champion d'un lancement et les versions de ses skills, écrits dans Neon."""

from __future__ import annotations

import re
from typing import Any

ISO_DAY = re.compile(r"^\d{4}-\d{2}-\d{2}$")
ORIGINS = {"maison", "ia", "variation"}
PARAM_KEYS = ("curve", "gesture", "ratio", "span", "window", "days")


def _day(value: Any) -> str | None:
    if not isinstance(value, str):
        return None
    head = value[:10]
    return head if ISO_DAY.match(head) else None


def _params(row: dict[str, Any]) -> dict[str, Any]:
    """Champs du geste. La suite ajoute sa formule et R, la figure sa forme et son n : chacune pour son geste seulement."""
    params = {key: row.get(key) for key in PARAM_KEYS}
    if row.get("gesture") == "figure":
        params["forme"] = row.get("forme") or "triangle"
        params["n"] = _int_or_none(row.get("n"))
    if row.get("gesture") != "suite":
        return params
    params["suite"] = row.get("suite") or "logistique"
    params["r"] = 2 if row.get("r") is None else row.get("r")
    return params


def _int_or_none(value: Any) -> int | None:
    if value is None or value == "":
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def normalize_champion(payload: dict[str, Any]) -> dict[str, Any]:
    """Aplati les versions de skills. Une skill sans identifiant ou sans version refuse le champion."""
    skills = payload.get("skills") or []
    if not skills:
        raise ValueError("champion sans skill")
    versions: list[dict[str, Any]] = []
    for skill in skills:
        skill_id = str(skill.get("id") or "").strip()[:80]
        if not skill_id:
            raise ValueError("skill sans identifiant")
        rows = skill.get("versions") or []
        if not rows:
            raise ValueError(f"skill {skill_id} sans version")
        for row in rows:
            version = _int_or_none(row.get("version"))
            if version is None or version < 1:
                raise ValueError(f"skill {skill_id} : version invalide")
            versions.append(
                {
                    "skill_id": skill_id,
                    "skill_name": str(skill.get("name") or skill_id)[:80],
                    "version": version,
                    "parent": _int_or_none(row.get("parent")),
                    "cutoff": _day(row.get("cutoff")),
                    "origin": row.get("origin") if row.get("origin") in ORIGINS else "ia",
                    "params": _params(row),
                    "phrase": str(row.get("phrase") or "")[:280],
                    "exam_cents": _int_or_none(row.get("examCents")),
                }
            )
    return {
        "generation": int(payload["generation"]),
        "runner": str(payload["runner"])[:40],
        "cents": int(payload["cents"]),
        "exam_cents": _int_or_none(payload.get("examCents")),
        "calls": int(payload.get("calls") or 0),
        "race_from": _day(payload.get("raceFrom")),
        "race_to": _day(payload.get("raceTo")),
        "payload": payload,
        "versions": versions,
    }


def champion_from_row(row: dict[str, Any]) -> dict[str, Any]:
    """Le champion tel qu'il a été envoyé, plus son numéro Neon."""
    payload = dict(row.get("payload") or {})
    payload["id"] = row.get("id")
    return payload
