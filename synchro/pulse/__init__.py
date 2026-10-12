"""Pulse — générateurs d’onde sur les présences des boules et des étoiles.

Les périodes sont en tirages (2 à 60). L’horloge est l’index de tirage.
"""

from synchro.pulse.scan import detail_series, scan_draws, status_payload

__all__ = ["detail_series", "scan_draws", "status_payload"]
