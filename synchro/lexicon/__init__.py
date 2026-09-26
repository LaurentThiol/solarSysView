"""Dictionnaire de concepts et demandes de lecture.

Les épisodes portent le sens mesuré d'une fenêtre. Les fiches en sont la
définition, confirmée à la main. La demande 20/50/100 compare ces sens.
"""

from synchro.lexicon.cards import fiche_id, seed_cards
from synchro.lexicon.episode import close_outcome, episode_from_window
from synchro.lexicon.reading import build_reading

__all__ = [
    "build_reading",
    "close_outcome",
    "episode_from_window",
    "fiche_id",
    "seed_cards",
]
