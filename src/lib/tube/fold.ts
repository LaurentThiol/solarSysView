import type { TubeSection } from "./model"

export type PhaseBin = {
  start: number
  mid: number
  count: number
  sum: number | null
  lower: number | null
  upper: number | null
  deformedLower: number | null
  deformedUpper: number | null
  center: number | null
  widthFactor: number | null
}

/** Tube replié : l'axe horizontal est la phase lunaire, pas le temps. */
export function foldOnPhase(sections: readonly TubeSection[], bins = 12): PhaseBin[] {
  const count = Math.max(4, Math.floor(bins))
  const buckets = Array.from({ length: count }, () => [] as TubeSection[])
  for (const section of sections) {
    const fraction = ((section.moonFraction % 1) + 1) % 1
    const index = Math.min(count - 1, Math.floor(fraction * count))
    buckets[index].push(section)
  }
  return buckets.map((bucket, index) => {
    const start = index / count
    const mid = start + 0.5 / count
    if (!bucket.length) {
      return {
        start,
        mid,
        count: 0,
        sum: null,
        lower: null,
        upper: null,
        deformedLower: null,
        deformedUpper: null,
        center: null,
        widthFactor: null,
      }
    }
    const avg = (pick: (section: TubeSection) => number) =>
      bucket.reduce((total, section) => total + pick(section), 0) / bucket.length
    return {
      start,
      mid,
      count: bucket.length,
      sum: avg((section) => section.sum),
      lower: avg((section) => section.lower),
      upper: avg((section) => section.upper),
      deformedLower: avg((section) => section.deformedLower),
      deformedUpper: avg((section) => section.deformedUpper),
      center: avg((section) => section.deformedCenter),
      widthFactor: avg((section) => section.widthFactor),
    }
  })
}
