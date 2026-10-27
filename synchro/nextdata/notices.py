"""Avis d’import que nextData n’a pas à montrer.

Darts, en chargeant `LightGBMModel`, prévient pour StatsForecast et deux fois
pour XGBoost. nextData n’ajuste que LightGBM. Chaque processus du pool de Méga
recommence, et le journal de `./launch` s’en remplit. Chronos charge un modèle
public : le Hub rappelle qu’un jeton lèverait le plafond, sans empêcher le
chargement. Une vraie erreur, au niveau ERROR, reste visible.

Ce module n’entre pas dans la clé du cache des pas : il ne change aucun calcul.
"""

from __future__ import annotations

import logging
import warnings


def _optional_notice(message: str) -> bool:
    """Avis d’un paquet que nextData n’appelle pas, ou de l’accès public au Hub."""
    if "StatsForecast module could not be imported" in message:
        return True
    if "The `XGBoost` module could not be imported" in message:
        return True
    return "unauthenticated requests to the HF Hub" in message


def quiet_optional_model_notices() -> None:
    """Pose le filtre une fois par processus. Les appels suivants ne font rien.

    Le filtre est sur `Logger.handle` : un journal enfant n’interroge pas le
    filtre de son parent, et Darts comme le Hub écrivent avant que l’API ait
    branché ses handlers.
    """
    current = logging.Logger.handle
    if getattr(current, "_synchro_optional_notices", False):
        return

    def handle(self: logging.Logger, record: logging.LogRecord) -> None:
        if record.levelno == logging.WARNING:
            try:
                message = record.getMessage()
            except Exception:
                message = str(record.msg)
            if _optional_notice(message):
                return
        current(self, record)

    handle._synchro_optional_notices = True  # type: ignore[attr-defined]
    logging.Logger.handle = handle  # type: ignore[method-assign]
    warnings.filterwarnings("ignore", message=r".*StatsForecast module could not be imported.*")
    warnings.filterwarnings("ignore", message=r".*The `XGBoost` module could not be imported.*")
    warnings.filterwarnings("ignore", message=r".*unauthenticated requests to the HF Hub.*")
