/** Loi du pas n − n−1 si deux tirages indépendants sont tirés dans l’urne. */

export type ChanceLaw = {
  meanAbs: number
  meanLevel: number
  /** P(Δ = d) pour deux statistiques d’ordre indépendantes. */
  mass: (delta: number) => number
  /** P(|Δ| ≥ value). */
  absAtLeast: (value: number) => number
}

const laws = new Map<string, ChanceLaw>()

function comb(n: number, k: number) {
  if (k < 0 || n < 0 || k > n) return 0
  const take = Math.min(k, n - k)
  let value = 1
  for (let i = 1; i <= take; i += 1) {
    value = (value * (n - take + i)) / i
  }
  return value
}

/**
 * Pas de la statistique d’ordre `rank` (1 = plus petit) dans un tirage
 * de `draw` boules distinctes parmi `pool`.
 */
export function orderStepLaw(pool: number, draw: number, rank: number): ChanceLaw {
  const key = `${pool}:${draw}:${rank}`
  const cached = laws.get(key)
  if (cached) return cached
  const ways = comb(pool, draw)
  const lo = rank
  const hi = pool - draw + rank
  const pmf: number[] = []
  let meanLevel = 0
  for (let value = lo; value <= hi; value += 1) {
    const probability = (comb(value - 1, rank - 1) * comb(pool - value, draw - rank)) / ways
    pmf[value] = probability
    meanLevel += value * probability
  }
  const delta = new Map<number, number>()
  let meanAbs = 0
  for (let left = lo; left <= hi; left += 1) {
    const leftP = pmf[left] ?? 0
    if (leftP === 0) continue
    for (let right = lo; right <= hi; right += 1) {
      const probability = leftP * (pmf[right] ?? 0)
      if (probability === 0) continue
      const step = left - right
      delta.set(step, (delta.get(step) ?? 0) + probability)
      meanAbs += Math.abs(step) * probability
    }
  }
  const absMass = new Map<number, number>()
  for (const [step, probability] of delta) {
    const abs = Math.abs(step)
    absMass.set(abs, (absMass.get(abs) ?? 0) + probability)
  }
  const absSteps = [...absMass.keys()].sort((a, b) => a - b)
  const law: ChanceLaw = {
    meanAbs,
    meanLevel,
    mass: (value) => delta.get(value) ?? 0,
    absAtLeast: (value) => {
      const target = Math.abs(value)
      let tail = 0
      for (const step of absSteps) {
        if (step + 1e-9 >= target) tail += absMass.get(step) ?? 0
      }
      return tail
    },
  }
  laws.set(key, law)
  return law
}

export type OrderRankKey = "n1" | "n2" | "n3" | "n4" | "n5" | "e1" | "e2"

const NUMBER_RANK: Record<"n1" | "n2" | "n3" | "n4" | "n5", number> = {
  n1: 1,
  n2: 2,
  n3: 3,
  n4: 4,
  n5: 5,
}

export function rankStepLaw(key: OrderRankKey, starPool = 12): ChanceLaw {
  if (key.startsWith("n")) {
    return orderStepLaw(50, 5, NUMBER_RANK[key as "n1"])
  }
  const rank = key === "e1" ? 1 : 2
  return orderStepLaw(starPool, 2, rank)
}

export function isOrderRankKey(key: string): key is OrderRankKey {
  return key === "n1" || key === "n2" || key === "n3" || key === "n4" || key === "n5" || key === "e1" || key === "e2"
}
