"""Fiches semées depuis le code du sens de fenêtre."""

from __future__ import annotations

from typing import Any

from synchro.chartisme.sense import REGISTERS, SENSES, sense_sentence

EQUATION = (
    "Droite des deux bouts. stable si |Δ| ≤ σ des résidus. "
    "Registre = σ_résidus / σ de toute la courbe : 05 jusqu'à 0,5, 1 jusqu'à 1, sup au-delà. "
    "Abstention si moins de 16 tirages."
)

SCOPE = (
    "Fenêtre d'au moins 16 tirages. Le σ de référence est celui de toute la courbe chargée, "
    "pas celui de la fenêtre. Ce n'est pas le symbole de jambe (up:moderate:2). "
    "Le jour affiché choisit le prédécesseur : en Mardi, le mardi précédent."
)

_KEYWORDS = {
    "monte": ["monte", "fenêtre", "déplacement"],
    "baisse": ["baisse", "fenêtre", "déplacement"],
    "stable": ["stable", "fenêtre", "nuage"],
}
_REGISTER_WORD = {
    "05": "nuage serré",
    "1": "nuage habituel",
    "sup": "nuage large",
}


def fiche_id(sense: str, register: str) -> str:
    return f"sense.{sense}.{register}"


def fiche_id_from_symbol(symbol: str) -> str | None:
    sense, _, register = str(symbol or "").partition(":")
    if sense not in SENSES or register not in REGISTERS:
        return None
    return fiche_id(sense, register)


def _svg(sense: str, register: str) -> str:
    """Vignette : droite des deux bouts, bruit selon le registre."""
    width, height = 160, 64
    points = []
    for index in range(20):
        if sense == "monte":
            base = 8 + index * 2.4
        elif sense == "baisse":
            base = 56 - index * 2.4
        else:
            base = 32
        if register == "1" and index in {6, 13}:
            base += 6 if sense != "baisse" else -6
        if register == "sup" and index % 4 == 2:
            base += 14 if index % 8 else -14
        y = max(4, min(height - 4, base))
        x = 4 + index * (width - 8) / 19
        points.append(f"{x:.1f},{y:.1f}")
    y0 = points[0].split(",")[1]
    y1 = points[-1].split(",")[1]
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} {height}" '
        f'width="{width}" height="{height}">'
        f'<line x1="4" y1="{y0}" x2="{width - 4}" y2="{y1}" stroke="#94a3b8" stroke-width="1"/>'
        f'<polyline fill="none" stroke="#0f172a" stroke-width="1.5" points="{" ".join(points)}"/>'
        f"</svg>"
    )


def seed_card(sense: str, register: str) -> dict[str, Any]:
    symbol = f"{sense}:{register}"
    named = {
        "symbol": symbol,
        "sense": sense,
        "register": register,
    }
    return {
        "id": fiche_id(sense, register),
        "status": "confirmed",
        "symbol": symbol,
        "equation": EQUATION,
        "keywords": [*_KEYWORDS[sense], _REGISTER_WORD[register]],
        "gloss": sense_sentence(named),
        "scope": SCOPE,
        "image_svg": _svg(sense, register),
        "quality": {"episodes": 0, "skill": None, "reviewed": None},
        "source": "code",
        "revision": 1,
    }


def seed_cards() -> list[dict[str, Any]]:
    return [seed_card(sense, register) for sense in SENSES for register in REGISTERS]


def draft_tension(left: str, right: str, *, detail: str) -> dict[str, Any]:
    """Brouillon pour une opposition qui n'a pas encore de fiche confirmée."""
    card_id = f"tension.{left}.{right}"
    return {
        "id": card_id,
        "status": "draft",
        "symbol": None,
        "equation": "Opposition de sens entre deux champs libres, à la même fenêtre.",
        "keywords": [left, right, "opposé"],
        "gloss": detail,
        "scope": "Même date, mêmes longueurs 20/50/100. À confirmer avant d'entrer dans une lecture.",
        "image_svg": "",
        "quality": {"episodes": 0, "skill": None, "reviewed": None},
        "source": "llm",
        "revision": 1,
    }
