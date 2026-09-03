export const MOTIF_IDS = [
  "align_h",
  "align_v",
  "diagonal",
  "line",
  "wedge",
  "cluster",
  "spread",
  "center",
  "periphery",
  "top",
  "bottom",
  "left",
  "right",
  "mirror_v",
  "w_shape",
  "stars_adj",
  "stars_same_row",
] as const

export type MotifId = (typeof MOTIF_IDS)[number]

export const MOTIF_LABELS: Record<MotifId, string> = {
  align_h: "Alignement horizontal",
  align_v: "Alignement vertical",
  diagonal: "Diagonale",
  line: "Ligne (5 collinéaires)",
  wedge: "Coin / wedge",
  cluster: "Grappe compacte",
  spread: "Dispersion",
  center: "Occupation centrale",
  periphery: "Périphérie",
  top: "Haut de grille",
  bottom: "Bas de grille",
  left: "Gauche",
  right: "Droite",
  mirror_v: "Miroir vertical",
  w_shape: "W / M",
  stars_adj: "Étoiles adjacentes",
  stars_same_row: "Étoiles même rangée",
}

export function labelOf(id: string) {
  return MOTIF_LABELS[id as MotifId] ?? id
}

export function factsFrom(motifs: string[], descriptors: Record<string, number>) {
  const facts = motifs.map(labelOf)
  if (descriptors.centroid_row != null && descriptors.centroid_col != null) {
    facts.push(
      `centroïde (${descriptors.centroid_row.toFixed(2)}, ${descriptors.centroid_col.toFixed(2)})`
    )
  }
  return facts
}

export function captionFromFacts(facts: string[], residual?: string | null) {
  const core = facts.length ? facts.join(" ; ") : "aucune forme du lexique"
  const extra = residual?.trim()
  return extra ? `${core}. ${extra}` : core
}
