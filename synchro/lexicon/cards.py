"""Fiches semées depuis le code du sens de fenêtre."""

from __future__ import annotations

from typing import Any

from synchro.chartisme.sense import REGISTERS, SENSES, sense_sentence

EQUATION = (
    "Droite des deux bouts. stable si |Δ| ≤ σ des résidus.\n"
    "Registre = σ_résidus / σ de toute la courbe : 05 jusqu'à 0,5, 1 jusqu'à 1, sup au-delà.\n"
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


# Encre claire sur puits sombre : le trait #0f172a disparaissait sur la carte.
_WELL = "#12182a"
_GRID = "#31405c"
_INK = "#f4efe4"
_CHORD = "#9fd0f5"


def _series(sense: str, register: str) -> list[float]:
    """Valeurs 0…1, le haut de l'échelle vers 1. Le registre élargit le nuage."""
    values: list[float] = []
    for index in range(20):
        t = index / 19
        if sense == "monte":
            base = 0.18 + t * 0.64
        elif sense == "baisse":
            base = 0.82 - t * 0.64
        else:
            base = 0.5
        noise = 0.0
        if register == "1" and index in {6, 13}:
            noise = 0.14 if index == 6 else -0.14
        if register == "sup" and index % 4 == 2:
            noise = 0.28 if (index // 4) % 2 == 0 else -0.28
        values.append(min(0.94, max(0.06, base + noise)))
    return values


def _svg(sense: str, register: str) -> str:
    """Fenêtre lisible : courbe claire, droite des deux bouts en pointillés."""
    width, height = 480, 168
    left, right, top, bottom = 20, 460, 16, 148
    span = bottom - top

    def xy(index: int, value: float) -> tuple[float, float]:
        x = left + index * (right - left) / 19
        y = bottom - value * span
        return x, y

    coords = [xy(index, value) for index, value in enumerate(_series(sense, register))]
    x0, y0 = coords[0]
    x1, y1 = coords[-1]
    grids = []
    for frac in (0.25, 0.5, 0.75):
        gy = bottom - frac * span
        grids.append(
            f'<line x1="{left}" y1="{gy:.1f}" x2="{right}" y2="{gy:.1f}" '
            f'stroke="{_GRID}" stroke-width="1"/>'
        )
    points = " ".join(f"{x:.1f},{y:.1f}" for x, y in coords)
    label = f"{sense}:{register}"
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} {height}" '
        f'width="{width}" height="{height}" role="img" aria-label="{label}">'
        f"<title>{label}</title>"
        f'<rect width="{width}" height="{height}" rx="12" fill="{_WELL}"/>'
        f"{''.join(grids)}"
        f'<line x1="{x0:.1f}" y1="{y0:.1f}" x2="{x1:.1f}" y2="{y1:.1f}" '
        f'stroke="{_CHORD}" stroke-width="2" stroke-dasharray="7 5" stroke-linecap="round"/>'
        f'<polyline fill="none" stroke="{_INK}" stroke-width="3" stroke-linejoin="round" '
        f'stroke-linecap="round" points="{points}"/>'
        f'<circle cx="{x0:.1f}" cy="{y0:.1f}" r="4.5" fill="{_CHORD}"/>'
        f'<circle cx="{x1:.1f}" cy="{y1:.1f}" r="4.5" fill="{_CHORD}"/>'
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
