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

/** Part du span visée par le runner : cinq niveaux distincts dans la bande. */
export function aimRatio(ratio: number) {
  if (ratio <= 1) return ratio
  if (Math.abs(ratio - 1.272) <= 0.05) return 0.272
  if (Math.abs(ratio - 1.618) <= 0.05) return 0.764
  if (Math.abs(ratio - 2.618) <= 0.05) return 0.854
  return Math.min(1, Math.max(0, 1 - 0.382 / ratio))
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
