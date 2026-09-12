"""Réseaux du module chartisme — optionnels, absence sans conséquence.

Deux modèles, deux points de vue sur la même fenêtre :

- `svgformer` lit la fenêtre comme une séquence de commandes de tracé, façon
  DeepSVG : la forme est une suite de gestes ;
- `gnn` la lit comme un graphe de points, où « épaules à même niveau » est une
  arête et non une coïncidence numérique.

Rien ici n'est importé au chargement du module. `torch` pèse plusieurs
centaines de mégaoctets et n'est pas une dépendance du logiciel : le module
chartisme fonctionne sans, avec ses détecteurs géométriques et l'appariement
DTW. La sonde ci-dessous dit seulement ce qui est disponible.
"""

from __future__ import annotations

import importlib.util
from pathlib import Path

INSTALL_CMD = "./launch install-chartisme"
INSTALL_HINT = (
    "Les réseaux ne sont pas installés. Lancez ./launch install-chartisme "
    "(torch + torch-geometric, une fois) — ou restez sans : les détecteurs "
    "géométriques et la recherche par ressemblance DTW n'en ont pas besoin."
)
TORCH_MODULES = ("torch",)
PYG_MODULES = ("torch", "torch_geometric")


def requirements_path() -> Path:
    return Path(__file__).resolve().parents[3] / "requirements-chartisme.txt"


def _module_available(name: str) -> bool:
    try:
        return importlib.util.find_spec(name) is not None
    except (ImportError, ValueError):
        return False


def _probe_available() -> list[str]:
    """Modèles utilisables ici et maintenant."""
    found: list[str] = []
    if all(_module_available(name) for name in TORCH_MODULES):
        found.append("svgformer")
    if all(_module_available(name) for name in PYG_MODULES):
        found.append("gnn")
    return found


def torch_available() -> bool:
    return "svgformer" in _probe_available()


def pyg_available() -> bool:
    return "gnn" in _probe_available()


def availability() -> dict[str, object]:
    """État des réseaux, pour l'API et la pastille d'en-tête."""
    found = _probe_available()
    return {
        "available": found,
        "torch": "svgformer" in found,
        "pyg": "gnn" in found,
        "install_cmd": INSTALL_CMD,
        "hint": None if found else INSTALL_HINT,
    }


__all__ = [
    "INSTALL_CMD",
    "INSTALL_HINT",
    "availability",
    "pyg_available",
    "requirements_path",
    "torch_available",
]
