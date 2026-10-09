/** Lectures du retour arrière de nextData. */

import type { PairedGap } from "@/lib/nextdata/uncertainty"

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

type SumMetrics = Partial<
  Record<string, { mae: Record<string, number | null | undefined>; versus?: Record<string, PairedGap> }>
>

export function retourLabel(id: RetourId): string {
  return RETOUR_READINGS.find((item) => item.id === id)?.label ?? id
}

/** Lecture d’origine d’une jumelle Persist ; null pour une lecture qui n’en est pas une. */
export function twinOrigin(id: RetourId): RetourId | null {
  const item = RETOUR_READINGS.find((entry) => entry.id === id)
  return item && "twin" in item ? (id.slice(0, -"_persist".length) as RetourId) : null
}

/** Lectures hors jumelles, de la plus basse MAE de somme à la plus haute. À égalité, l’ordre de la liste. */
function ranked(metrics: SumMetrics): RetourId[] {
  const scored: { id: RetourId; value: number }[] = []
  for (const item of RETOUR_READINGS) {
    if ("twin" in item) continue
    const value = metrics[item.id]?.mae.sum
    if (value == null || !Number.isFinite(value)) continue
    scored.push({ id: item.id, value })
  }
  return scored.sort((a, b) => a.value - b.value).map((item) => item.id)
}

/**
 * Lecture au MAE de somme le plus bas, persistance et moyenne comprises. À égalité, la première de la liste.
 * Une jumelle Persist ne diffère de sa lecture que de quelques échanges : elle se compare à elle, pas au classement.
 */
export function lowestSumMae(metrics: SumMetrics): RetourId | null {
  return ranked(metrics)[0] ?? null
}

/** La plus basse MAE, la deuxième, et leur écart apparié tirage par tirage. */
export function lowestAgainstNext(
  metrics: SumMetrics
): { best: RetourId; next: RetourId | null; gap: PairedGap | null } | null {
  const [best, next] = ranked(metrics)
  if (!best) return null
  return { best, next: next ?? null, gap: next ? (metrics[best]?.versus?.[next] ?? null) : null }
}

/** « plus basse erreur », complétée quand l’écart avec la deuxième lecture ne tranche pas. */
export function lowestNote(lowest: ReturnType<typeof lowestAgainstNext>) {
  if (!lowest) return ""
  const verdict = lowest.gap?.verdict
  if (!lowest.next || verdict == null || verdict === "lower") return "plus basse erreur"
  return `plus basse erreur, non tranché face à ${retourLabel(lowest.next)}`
}
