"""Cycles — registre commun et TFT d'interprétation.

Les tirages restent indépendants. Ce paquet aligne des horloges et des
courbes déjà produites par les autres modules, puis lit leur poids. Il ne
propose pas de grille.
"""

from __future__ import annotations

from typing import Any


DISCLAIMER = (
    "Les tirages sont indépendants. Cycles décrit la structure temporelle "
    "de l'archive (phases, poids, ablation), pas le prochain tirage."
)


def torch_available() -> bool:
    try:
        import torch  # noqa: F401
    except ImportError:
        return False
    return True


def status() -> dict[str, Any]:
    torch_ok = torch_available()
    version = None
    if torch_ok:
        import torch

        version = getattr(torch, "__version__", None)
    return {
        "ok": True,
        "torch": torch_ok,
        "torch_version": version,
        "install_cmd": "pip install -r requirements-cycles.txt",
        "disclaimer": DISCLAIMER,
        "note": (
            "Le registre et le panneau répondent sans torch. "
            "Le fit TFT demande torch."
        ),
    }
