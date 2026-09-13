"""Harmo — étude harmonique des séries de tirages.

Les unités naturelles sont des cycles/tirage et des cycles/an, pas des hertz.
Le « réseau 50 Hz » est l’analogue d’un peigne de raies verrouillé sur le
calendrier, pas une interpolation vers une grille kHz.
"""

from __future__ import annotations

from typing import Any


def scipy_available() -> bool:
    try:
        import numpy  # noqa: F401
        import scipy  # noqa: F401
    except ImportError:
        return False
    return True


def extras_status() -> dict[str, Any]:
    """Disponibilité de scipy et des extras (pywt, ssqueezepy, librosa)."""
    status = {
        "ok": scipy_available(),
        "scipy": False,
        "numpy": False,
        "pywt": False,
        "librosa": False,
        "ssqueezepy": False,
        "scipy_version": None,
        "numpy_version": None,
        "install_cmd": "./launch install-harmo",
        "disclaimer": (
            "Les tirages sont indépendants. Harmo décrit le tracé d’une série "
            "(somme, retard, présence…), pas le prochain tirage. Les unités sont "
            "des cycles/tirage et des cycles/an, pas des hertz."
        ),
    }
    try:
        import numpy as np

        status["numpy"] = True
        status["numpy_version"] = str(np.__version__)
    except Exception:
        pass
    try:
        import scipy

        status["scipy"] = True
        status["scipy_version"] = str(scipy.__version__)
    except Exception:
        pass
    try:
        import pywt  # noqa: F401

        status["pywt"] = True
    except Exception:
        pass
    try:
        import librosa  # noqa: F401

        status["librosa"] = True
    except Exception:
        pass
    try:
        import ssqueezepy  # noqa: F401

        status["ssqueezepy"] = True
    except Exception:
        pass
    status["ok"] = bool(status["scipy"] and status["numpy"])
    return status


__all__ = ["extras_status", "scipy_available"]
