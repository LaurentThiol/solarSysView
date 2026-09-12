"""Vocabulaire chartiste : figures, signaux, objectifs projetés, rôles de pivots.

Identifiants anglais, libellés français — même convention que `synchro.morpho.lexicon`.
"""

from __future__ import annotations

FIGURE_IDS = (
    "ete",
    "ete_inv",
    "double_top",
    "triple_top",
    "double_bottom",
    "triple_bottom",
    "wedge_rising",
    "wedge_falling",
    "triangle_sym",
    "triangle_asc",
    "triangle_desc",
    "rectangle",
    "flag",
    "pennant",
    "cup_handle",
    "diamond",
    "broadening_top",
    "none",
)

FIGURE_LABELS: dict[str, str] = {
    "ete": "Tête & épaules",
    "ete_inv": "ETE inversée",
    "double_top": "Double sommet",
    "triple_top": "Triple sommet",
    "double_bottom": "Double creux",
    "triple_bottom": "Triple creux",
    "wedge_rising": "Biseau ascendant",
    "wedge_falling": "Biseau descendant",
    "triangle_sym": "Triangle symétrique",
    "triangle_asc": "Triangle ascendant",
    "triangle_desc": "Triangle descendant",
    "rectangle": "Rectangle / range",
    "flag": "Drapeau",
    "pennant": "Fanion",
    "cup_handle": "Tasse avec anse",
    "diamond": "Diamant",
    "broadening_top": "Broadening top",
    "none": "Aucune figure",
}

# reversal_down / reversal_up / continuation / range — le "Type" de la table.
FIGURE_KINDS: dict[str, str] = {
    "ete": "reversal_down",
    "ete_inv": "reversal_up",
    "double_top": "reversal_down",
    "triple_top": "reversal_down",
    "double_bottom": "reversal_up",
    "triple_bottom": "reversal_up",
    "wedge_rising": "reversal_down",
    "wedge_falling": "reversal_up",
    "triangle_sym": "continuation",
    "triangle_asc": "continuation",
    "triangle_desc": "continuation",
    "rectangle": "range",
    "flag": "continuation",
    "pennant": "continuation",
    "cup_handle": "reversal_up",
    "diamond": "reversal_down",
    "broadening_top": "reversal_down",
    "none": "range",
}

FIGURE_SIGNALS: dict[str, str] = {
    "ete": "Cassure de la ligne de cou",
    "ete_inv": "Cassure de la ligne de cou par le haut",
    "double_top": "Cassure du support intermédiaire",
    "triple_top": "Cassure du support intermédiaire",
    "double_bottom": "Cassure de la résistance",
    "triple_bottom": "Cassure de la résistance",
    "wedge_rising": "Cassure de la borne basse",
    "wedge_falling": "Cassure de la borne haute",
    "triangle_sym": "Cassure d'une des bornes",
    "triangle_asc": "Cassure de la résistance plate",
    "triangle_desc": "Cassure du support plat",
    "rectangle": "Cassure d'une borne",
    "flag": "Cassure dans le sens du mât",
    "pennant": "Cassure dans le sens du mât",
    "cup_handle": "Cassure de la lèvre",
    "diamond": "Cassure d'une des bornes",
    "broadening_top": "Cassure du dernier creux",
    "none": "—",
}

FIGURE_TARGETS: dict[str, str] = {
    "ete": "Distance tête↔cou reportée sous la ligne de cou",
    "ete_inv": "Distance tête↔cou reportée au-dessus",
    "double_top": "Hauteur de la figure reportée sous le support",
    "triple_top": "Hauteur de la figure reportée sous le support",
    "double_bottom": "Hauteur de la figure reportée au-dessus",
    "triple_bottom": "Hauteur de la figure reportée au-dessus",
    "wedge_rising": "Base du biseau reportée sous la cassure",
    "wedge_falling": "Base du biseau reportée au-dessus",
    "triangle_sym": "Base du triangle reportée",
    "triangle_asc": "Base reportée au-dessus",
    "triangle_desc": "Base reportée en-dessous",
    "rectangle": "Hauteur du range reportée",
    "flag": "Longueur du mât reportée",
    "pennant": "Longueur du mât reportée",
    "cup_handle": "Profondeur de la tasse reportée",
    "diamond": "Hauteur reportée",
    "broadening_top": "Hauteur reportée",
    "none": "—",
}

PIVOT_ROLES = (
    "left_shoulder",
    "head",
    "right_shoulder",
    "neck_left",
    "neck_right",
    "top",
    "bottom",
    "support",
    "resistance",
    "apex",
    "upper",
    "lower",
    "lip_left",
    "lip_right",
    "handle_low",
    "pole_start",
    "pole_end",
    "breakout",
    "point",
)

PIVOT_ROLE_LABELS: dict[str, str] = {
    "left_shoulder": "Épaule gauche",
    "head": "Tête",
    "right_shoulder": "Épaule droite",
    "neck_left": "Cou (gauche)",
    "neck_right": "Cou (droite)",
    "top": "Sommet",
    "bottom": "Creux",
    "support": "Support",
    "resistance": "Résistance",
    "apex": "Apex",
    "upper": "Borne haute",
    "lower": "Borne basse",
    "lip_left": "Lèvre gauche",
    "lip_right": "Lèvre droite",
    "handle_low": "Bas de l'anse",
    "pole_start": "Pied du mât",
    "pole_end": "Tête du mât",
    "breakout": "Cassure",
    "point": "Point",
}

# Symétrie verticale d'une fenêtre : la figure devient son opposé.
FLIP_MAP: dict[str, str] = {
    "ete": "ete_inv",
    "ete_inv": "ete",
    "double_top": "double_bottom",
    "double_bottom": "double_top",
    "triple_top": "triple_bottom",
    "triple_bottom": "triple_top",
    "wedge_rising": "wedge_falling",
    "wedge_falling": "wedge_rising",
    "triangle_asc": "triangle_desc",
    "triangle_desc": "triangle_asc",
    "triangle_sym": "triangle_sym",
    "rectangle": "rectangle",
    "flag": "flag",
    "pennant": "pennant",
    "diamond": "diamond",
    "cup_handle": "cup_handle",
    "broadening_top": "broadening_top",
    "none": "none",
}

# Classes apprises par les modèles (l'ordre fixe l'index des logits).
MODEL_CLASSES = FIGURE_IDS


def label_of(figure_id: str) -> str:
    return FIGURE_LABELS.get(figure_id, figure_id)


def kind_of(figure_id: str) -> str:
    return FIGURE_KINDS.get(figure_id, "range")


def signal_of(figure_id: str) -> str:
    return FIGURE_SIGNALS.get(figure_id, "—")


def target_basis(figure_id: str) -> str:
    return FIGURE_TARGETS.get(figure_id, "—")


def flip_of(figure_id: str) -> str:
    return FLIP_MAP.get(figure_id, figure_id)


def class_index(figure_id: str) -> int:
    return MODEL_CLASSES.index(figure_id) if figure_id in MODEL_CLASSES else MODEL_CLASSES.index("none")


def class_at(index: int) -> str:
    if 0 <= index < len(MODEL_CLASSES):
        return MODEL_CLASSES[index]
    return "none"


def describe(figure_id: str) -> dict[str, str]:
    return {
        "figure": figure_id,
        "label": label_of(figure_id),
        "kind": kind_of(figure_id),
        "signal": signal_of(figure_id),
        "target": target_basis(figure_id),
    }


def catalog() -> list[dict[str, str]]:
    """La table des figures, prête pour l'UI."""
    return [describe(fid) for fid in FIGURE_IDS if fid != "none"]
