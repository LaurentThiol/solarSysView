// Vocabulaire chartiste : figures, signaux, objectifs projetés, rôles de pivots.
// Identifiants anglais, libellés français — même convention que `morpho/lexicon`.

export const FIGURE_IDS = [
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
] as const

export type FigureId = (typeof FIGURE_IDS)[number]

// reversal_down / reversal_up / continuation / range — le « Type » de la table.
export type FigureKind = "reversal_down" | "reversal_up" | "continuation" | "range"

export const FIGURE_LABELS: Record<FigureId, string> = {
  ete: "Tête & épaules",
  ete_inv: "ETE inversée",
  double_top: "Double sommet",
  triple_top: "Triple sommet",
  double_bottom: "Double creux",
  triple_bottom: "Triple creux",
  wedge_rising: "Biseau ascendant",
  wedge_falling: "Biseau descendant",
  triangle_sym: "Triangle symétrique",
  triangle_asc: "Triangle ascendant",
  triangle_desc: "Triangle descendant",
  rectangle: "Rectangle / range",
  flag: "Drapeau",
  pennant: "Fanion",
  cup_handle: "Tasse avec anse",
  diamond: "Diamant",
  broadening_top: "Broadening top",
  none: "Aucune figure",
}

export const FIGURE_KINDS: Record<FigureId, FigureKind> = {
  ete: "reversal_down",
  ete_inv: "reversal_up",
  double_top: "reversal_down",
  triple_top: "reversal_down",
  double_bottom: "reversal_up",
  triple_bottom: "reversal_up",
  wedge_rising: "reversal_down",
  wedge_falling: "reversal_up",
  triangle_sym: "continuation",
  triangle_asc: "continuation",
  triangle_desc: "continuation",
  rectangle: "range",
  flag: "continuation",
  pennant: "continuation",
  cup_handle: "reversal_up",
  diamond: "reversal_down",
  broadening_top: "reversal_down",
  none: "range",
}

export const FIGURE_SIGNALS: Record<FigureId, string> = {
  ete: "Cassure de la ligne de cou",
  ete_inv: "Cassure de la ligne de cou par le haut",
  double_top: "Cassure du support intermédiaire",
  triple_top: "Cassure du support intermédiaire",
  double_bottom: "Cassure de la résistance",
  triple_bottom: "Cassure de la résistance",
  wedge_rising: "Cassure de la borne basse",
  wedge_falling: "Cassure de la borne haute",
  triangle_sym: "Cassure d'une des bornes",
  triangle_asc: "Cassure de la résistance plate",
  triangle_desc: "Cassure du support plat",
  rectangle: "Cassure d'une borne",
  flag: "Cassure dans le sens du mât",
  pennant: "Cassure dans le sens du mât",
  cup_handle: "Cassure de la lèvre",
  diamond: "Cassure d'une des bornes",
  broadening_top: "Cassure du dernier creux",
  none: "—",
}

export const FIGURE_TARGETS: Record<FigureId, string> = {
  ete: "Distance tête↔cou reportée sous la ligne de cou",
  ete_inv: "Distance tête↔cou reportée au-dessus",
  double_top: "Hauteur de la figure reportée sous le support",
  triple_top: "Hauteur de la figure reportée sous le support",
  double_bottom: "Hauteur de la figure reportée au-dessus",
  triple_bottom: "Hauteur de la figure reportée au-dessus",
  wedge_rising: "Base du biseau reportée sous la cassure",
  wedge_falling: "Base du biseau reportée au-dessus",
  triangle_sym: "Base du triangle reportée",
  triangle_asc: "Base reportée au-dessus",
  triangle_desc: "Base reportée en-dessous",
  rectangle: "Hauteur du range reportée",
  flag: "Longueur du mât reportée",
  pennant: "Longueur du mât reportée",
  cup_handle: "Profondeur de la tasse reportée",
  diamond: "Hauteur reportée",
  broadening_top: "Hauteur reportée",
  none: "—",
}

export const PIVOT_ROLES = [
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
] as const

export type PivotRole = (typeof PIVOT_ROLES)[number]

export const PIVOT_ROLE_LABELS: Record<PivotRole, string> = {
  left_shoulder: "Épaule gauche",
  head: "Tête",
  right_shoulder: "Épaule droite",
  neck_left: "Cou (gauche)",
  neck_right: "Cou (droite)",
  top: "Sommet",
  bottom: "Creux",
  support: "Support",
  resistance: "Résistance",
  apex: "Apex",
  upper: "Borne haute",
  lower: "Borne basse",
  lip_left: "Lèvre gauche",
  lip_right: "Lèvre droite",
  handle_low: "Bas de l'anse",
  pole_start: "Pied du mât",
  pole_end: "Tête du mât",
  breakout: "Cassure",
  point: "Point",
}

// Symétrie verticale d'une fenêtre : la figure devient son opposé.
export const FLIP_MAP: Record<FigureId, FigureId> = {
  ete: "ete_inv",
  ete_inv: "ete",
  double_top: "double_bottom",
  double_bottom: "double_top",
  triple_top: "triple_bottom",
  triple_bottom: "triple_top",
  wedge_rising: "wedge_falling",
  wedge_falling: "wedge_rising",
  triangle_asc: "triangle_desc",
  triangle_desc: "triangle_asc",
  triangle_sym: "triangle_sym",
  rectangle: "rectangle",
  flag: "flag",
  pennant: "pennant",
  diamond: "diamond",
  cup_handle: "cup_handle",
  broadening_top: "broadening_top",
  none: "none",
}

// Classes apprises par les modèles (l'ordre fixe l'index des logits).
export const MODEL_CLASSES = FIGURE_IDS

export type FigureDescription = {
  figure: string
  label: string
  kind: FigureKind
  signal: string
  target: string
}

export function labelOf(figureId: string) {
  return FIGURE_LABELS[figureId as FigureId] ?? figureId
}

export function kindOf(figureId: string): FigureKind {
  return FIGURE_KINDS[figureId as FigureId] ?? "range"
}

export function signalOf(figureId: string) {
  return FIGURE_SIGNALS[figureId as FigureId] ?? "—"
}

export function targetBasis(figureId: string) {
  return FIGURE_TARGETS[figureId as FigureId] ?? "—"
}

export function flipOf(figureId: string) {
  return FLIP_MAP[figureId as FigureId] ?? figureId
}

export function classIndex(figureId: string) {
  const index = MODEL_CLASSES.indexOf(figureId as FigureId)
  return index >= 0 ? index : MODEL_CLASSES.indexOf("none")
}

export function classAt(index: number): FigureId {
  if (index >= 0 && index < MODEL_CLASSES.length) return MODEL_CLASSES[index]
  return "none"
}

export function describe(figureId: string): FigureDescription {
  return {
    figure: figureId,
    label: labelOf(figureId),
    kind: kindOf(figureId),
    signal: signalOf(figureId),
    target: targetBasis(figureId),
  }
}

/** La table des figures, prête pour l'UI. */
export function catalog(): FigureDescription[] {
  return FIGURE_IDS.filter((id) => id !== "none").map((id) => describe(id))
}
