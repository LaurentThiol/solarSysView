export type FrequencyItem = {
  value: number
  count: number
  lastSeen: string | null
  delayDraws: number
}

/** Âge moyen d’un numéro : tirages depuis sa dernière sortie. (1 − 5/50) / (5/50) = 9. */
export function expectedNumberDelay() {
  return (50 - 5) / 5
}

/** Âge moyen d’une étoile. Sur 12 ★, (1 − 2/12) / (2/12) = 5. */
export function expectedStarDelay(pool = 12) {
  if (pool <= 2) return 0
  return (pool - 2) / 2
}

export function hottest(
  items: FrequencyItem[],
  n: number,
  options?: { minCount?: number }
) {
  const minCount = options?.minCount
  return [...items]
    .filter((item) => minCount == null || item.count > minCount)
    .sort(
      (a, b) =>
        b.count - a.count || a.delayDraws - b.delayDraws || a.value - b.value
    )
    .slice(0, n)
}

export function overdue(
  items: FrequencyItem[],
  n: number,
  options?: { minDelay?: number; exclude?: number[] }
) {
  const minDelay = options?.minDelay
  const excluded = new Set(options?.exclude ?? [])
  return [...items]
    .filter(
      (item) =>
        (minDelay == null || item.delayDraws > minDelay) &&
        !excluded.has(item.value)
    )
    .sort(
      (a, b) =>
        b.delayDraws - a.delayDraws || a.count - b.count || a.value - b.value
    )
    .slice(0, n)
}
