export type FrequencyItem = {
  value: number
  count: number
  lastSeen: string | null
  delayDraws: number
}

/** Attente géométrique d’une boule : 50 / 5 = 10 tirages. */
export function expectedNumberDelay() {
  return 50 / 5
}

/** Attente géométrique d’une étoile : pool / 2 (6 sur la formule à 12 ★). */
export function expectedStarDelay(pool = 12) {
  return pool > 0 ? pool / 2 : 0
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
  options?: { minDelay?: number }
) {
  const minDelay = options?.minDelay
  return [...items]
    .filter((item) => minDelay == null || item.delayDraws > minDelay)
    .sort(
      (a, b) =>
        b.delayDraws - a.delayDraws || a.count - b.count || a.value - b.value
    )
    .slice(0, n)
}
