"""Repli archive embarquée quand Neon n’est pas configuré.

Même fichier que l’UI (`src/data/euromillions-2026.json`) : scipy peut
étudier les tirages locaux sans inventer une grille kHz ni exiger la base.
"""

from __future__ import annotations

import json
from datetime import date
from functools import lru_cache
from pathlib import Path
from typing import Any

from synchro.fdj import star_pool_for

JSON_PATH = (
    Path(__file__).resolve().parents[2] / "src" / "data" / "euromillions-2026.json"
)


def _row(item: dict[str, Any]) -> dict[str, Any]:
    draw_date = date.fromisoformat(str(item["date"])[:10])
    return {
        "draw_date": draw_date,
        "weekday": item.get("weekday"),
        "numbers": list(item["numbers"]),
        "stars": list(item["stars"]),
        "star_pool": int(item.get("star_pool") or star_pool_for(draw_date)),
    }


@lru_cache(maxsize=1)
def _load() -> tuple[dict[str, Any], ...]:
    if not JSON_PATH.is_file():
        return ()
    payload = json.loads(JSON_PATH.read_text(encoding="utf-8"))
    return tuple(_row(item) for item in payload if item.get("date") and item.get("numbers"))


def bundled_draws(era: str = "current") -> list[dict[str, Any]]:
    rows = list(_load())
    if era == "current":
        rows = [d for d in rows if int(d.get("star_pool") or 12) >= 12]
    return rows
