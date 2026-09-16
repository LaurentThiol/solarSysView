"""Spécialistes Brain : un petit réseau par série (parité, somme…).

``synchro.brain`` est déjà un module (embeddings Ollama), d'où ce paquet
séparé. Entraînement numpy, hors dépôt (``.brain/specialists/``).
"""

from synchro.brain_specialists.features import FEATURES, FEATURE_IDS
from synchro.brain_specialists.store import BRAIN_DIR, SPECIALISTS_DIR, slugify
from synchro.brain_specialists.train import (
    delete_specialist,
    infer_specialist,
    list_specialists,
    load_specialist,
    make_uniform_draws,
    train_specialist,
)

__all__ = [
    "BRAIN_DIR",
    "FEATURE_IDS",
    "FEATURES",
    "SPECIALISTS_DIR",
    "delete_specialist",
    "infer_specialist",
    "list_specialists",
    "load_specialist",
    "make_uniform_draws",
    "slugify",
    "train_specialist",
]
