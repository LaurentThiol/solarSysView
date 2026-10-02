/**
 * Lien d’un couple sur la vue « Chaque numéro » :
 * n1–n5 sont les boules triées, le trait joint les deux rangs
 * de chaque tirage où les deux boules sortent ensemble.
 */

export const NUMBER_RANK_KEYS = ["n1", "n2", "n3", "n4", "n5"] as const

export type NumberRankKey = (typeof NUMBER_RANK_KEYS)[number]

export type CoupleChartLink = {
  a: number
  b: number
}

export type CoupleNumberLink = {
  date: string
  low: number
  high: number
  lowKey: NumberRankKey
  highKey: NumberRankKey
}

type RankPoint = {
  date: string
  n1: number
  n2: number
  n3: number
  n4: number
  n5: number
}

export function orderedCouple(couple: CoupleChartLink): { low: number; high: number } | null {
  const low = Math.min(couple.a, couple.b)
  const high = Math.max(couple.a, couple.b)
  if (!Number.isInteger(low) || !Number.isInteger(high) || low === high) return null
  if (low < 1 || high > 50) return null
  return { low, high }
}

export function coupleLinkKey(couple: CoupleChartLink): string {
  const ordered = orderedCouple(couple)
  if (!ordered) return ""
  return `${ordered.low}-${ordered.high}`
}

export function coupleNumberLinks(
  series: readonly RankPoint[],
  couple: CoupleChartLink
): CoupleNumberLink[] {
  const ordered = orderedCouple(couple)
  if (!ordered) return []
  const links: CoupleNumberLink[] = []
  for (const point of series) {
    let lowKey: NumberRankKey | null = null
    let highKey: NumberRankKey | null = null
    for (const key of NUMBER_RANK_KEYS) {
      const value = point[key]
      if (value === ordered.low) lowKey = key
      else if (value === ordered.high) highKey = key
    }
    if (!lowKey || !highKey) continue
    links.push({
      date: point.date,
      low: ordered.low,
      high: ordered.high,
      lowKey,
      highKey,
    })
  }
  return links
}

export function formatCoupleChartLink(couple: CoupleChartLink, count: number): string {
  const ordered = orderedCouple(couple)
  if (!ordered) return ""
  const label = `${ordered.low}–${ordered.high}`
  if (count <= 0) return `Couple ${label} : aucune co-sortie dans les tirages tracés.`
  const noun = count > 1 ? "co-sorties reliées" : "co-sortie reliée"
  return `Couple ${label} · ${count} ${noun} sur n1–n5.`
}
