/** Lectures du retour arrière de nextData. */

export const RETOUR_READINGS = [
  { id: "corpus", label: "LightGBM · trois ans" },
  { id: "fenetre", label: "LightGBM · fenêtre seule" },
  { id: "corpus_catboost", label: "CatBoost · trois ans" },
  { id: "fenetre_catboost", label: "CatBoost · fenêtre seule" },
  { id: "persistence", label: "Persistance" },
  { id: "mean", label: "Moyenne" },
] as const

export type RetourId = (typeof RETOUR_READINGS)[number]["id"]

type SumMetrics = Partial<Record<string, { mae: Record<string, number | null | undefined> }>>

export function retourLabel(id: RetourId): string {
  return RETOUR_READINGS.find((item) => item.id === id)?.label ?? id
}

/** Lecture au MAE de somme le plus bas, persistance et moyenne comprises. À égalité, la première de la liste. */
export function lowestSumMae(metrics: SumMetrics): RetourId | null {
  let best: RetourId | null = null
  let bestValue = Number.POSITIVE_INFINITY
  for (const { id } of RETOUR_READINGS) {
    const value = metrics[id]?.mae.sum
    if (value == null || !Number.isFinite(value) || value >= bestValue) continue
    best = id
    bestValue = value
  }
  return best
}
