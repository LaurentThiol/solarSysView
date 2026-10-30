/** Ratios du nombre d’or : 1/φ², 1/φ, √φ, φ, φ². */
export const GOLDEN_RATIOS = [0.382, 0.618, 1.272, 1.618, 2.618] as const

export type GoldenRatio = (typeof GOLDEN_RATIOS)[number]

export function formatRatio(ratio: number) {
  return ratio.toFixed(3).replace(/0+$/, "").replace(/\.$/, "").replace(".", ",")
}

/** Niveau d’un ratio. En dessous de 1, il est dans le span. Au-dessus, il prolonge au-delà du haut, comme fibLevels. */
export function goldenLevel(lo: number, hi: number, ratio: number) {
  const span = hi - lo
  if (ratio <= 1) return lo + ratio * span
  return hi + (ratio - 1) * span
}

/** Part du span visée par le runner. 1,618 vise 0,618, 2,618 vise encore 0,618. */
export function aimRatio(ratio: number) {
  if (ratio <= 1) return ratio
  const frac = ratio - Math.floor(ratio)
  return frac === 0 ? 0.618 : frac
}

export function goldenAim(lo: number, hi: number, ratio: number) {
  return lo + aimRatio(ratio) * (hi - lo)
}

export function nearestGolden(value: number): GoldenRatio | null {
  if (!Number.isFinite(value)) return null
  let best: GoldenRatio = GOLDEN_RATIOS[0]
  for (const ratio of GOLDEN_RATIOS) {
    if (Math.abs(ratio - value) < Math.abs(best - value)) best = ratio
  }
  return Math.abs(best - value) <= 0.05 ? best : null
}
