/** Lectures du retour arrière de nextData. */

export const RETOUR_READINGS = [
  { id: "corpus", label: "LightGBM · trois ans" },
  { id: "fenetre", label: "LightGBM · fenêtre seule" },
  { id: "corpus_catboost", label: "CatBoost · trois ans" },
  { id: "fenetre_catboost", label: "CatBoost · fenêtre seule" },
  { id: "corpus_persist", label: "LightGBM · trois ans · Persist", twin: true },
  { id: "fenetre_persist", label: "LightGBM · fenêtre seule · Persist", twin: true },
  { id: "corpus_catboost_persist", label: "CatBoost · trois ans · Persist", twin: true },
  { id: "fenetre_catboost_persist", label: "CatBoost · fenêtre seule · Persist", twin: true },
  { id: "persistence", label: "Persistance" },
  { id: "mean", label: "Moyenne" },
] as const

export type RetourId = (typeof RETOUR_READINGS)[number]["id"]

type SumMetrics = Partial<Record<string, { mae: Record<string, number | null | undefined> }>>

export function retourLabel(id: RetourId): string {
  return RETOUR_READINGS.find((item) => item.id === id)?.label ?? id
}

/**
 * Lecture au MAE de somme le plus bas, persistance et moyenne comprises. À égalité, la première de la liste.
 * Une jumelle Persist ne diffère de sa lecture que de quelques échanges : elle se compare à elle, pas au classement.
 */
export function lowestSumMae(metrics: SumMetrics): RetourId | null {
  let best: RetourId | null = null
  let bestValue = Number.POSITIVE_INFINITY
  for (const item of RETOUR_READINGS) {
    if ("twin" in item) continue
    const value = metrics[item.id]?.mae.sum
    if (value == null || !Number.isFinite(value) || value >= bestValue) continue
    best = item.id
    bestValue = value
  }
  return best
}
