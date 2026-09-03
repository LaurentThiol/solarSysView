"""Morpho — glyphes, géométrie, règles, anticipation, VLM local."""

from synchro.morpho.anticipation import anticipate
from synchro.morpho.geometry import analyze_draw, detect, jaccard, signature_vector
from synchro.morpho.lexicon import MOTIF_IDS, MOTIF_LABELS, caption_from_facts, label_of
from synchro.morpho.neighbors import neighbors_for, neighbors_of_grid
from synchro.morpho.rules import (
    draft_rule_from_state,
    evaluate_rules,
    match_condition,
    normalize_rule,
)
from synchro.morpho.vlm import analyze as vlm_analyze
from synchro.morpho.vlm import status as vlm_status

__all__ = [
    "MOTIF_IDS",
    "MOTIF_LABELS",
    "analyze_draw",
    "anticipate",
    "caption_from_facts",
    "detect",
    "draft_rule_from_state",
    "evaluate_rules",
    "jaccard",
    "label_of",
    "match_condition",
    "neighbors_for",
    "neighbors_of_grid",
    "normalize_rule",
    "signature_vector",
    "vlm_analyze",
    "vlm_status",
]
