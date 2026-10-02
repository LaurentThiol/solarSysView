/**
 * Lien d’un triplet sur la vue « Chaque numéro » :
 * n1–n5 sont les boules triées, le trait joint les trois rangs
 * de chaque tirage où les trois boules sortent ensemble.
 */

import { NUMBER_RANK_KEYS, type NumberRankKey } from "./couple-chart.ts"

export type TripleChartLink = {
  a: number
  b: number
  c: number
}

export type TripleNumberLink = {
  date: string
  balls: [number, number, number]
  keys: [NumberRankKey, NumberRankKey, NumberRankKey]
}

type RankPoint = {
  date: string
  n1: number
  n2: number
  n3: number
  n4: number
  n5: number
}

export function orderedTriple(
  triple: TripleChartLink
): { balls: [number, number, number] } | null {
  const raw = [triple.a, triple.b, triple.c]
  if (raw.some((value) => !Number.isInteger(value) || value < 1 || value > 50)) return null
  const unique = [...new Set(raw)].sort((left, right) => left - right)
  if (unique.length !== 3) return null
  return { balls: [unique[0], unique[1], unique[2]] }
}

export function tripleLinkKey(triple: TripleChartLink): string {
  const ordered = orderedTriple(triple)
  if (!ordered) return ""
  return ordered.balls.join("-")
}

export function tripleNumberLinks(
  series: readonly RankPoint[],
  triple: TripleChartLink
): TripleNumberLink[] {
  const ordered = orderedTriple(triple)
  if (!ordered) return []
  const links: TripleNumberLink[] = []
  for (const point of series) {
    const keys: NumberRankKey[] = []
    for (const ball of ordered.balls) {
      let found: NumberRankKey | null = null
      for (const key of NUMBER_RANK_KEYS) {
        if (point[key] === ball) {
          found = key
          break
        }
      }
      if (!found) break
      keys.push(found)
    }
    const [lowKey, midKey, highKey] = keys
    if (!lowKey || !midKey || !highKey) continue
    links.push({
      date: point.date,
      balls: ordered.balls,
      keys: [lowKey, midKey, highKey],
    })
  }
  return links
}

export function formatTripleChartLink(triple: TripleChartLink, count: number): string {
  const ordered = orderedTriple(triple)
  if (!ordered) return ""
  const label = ordered.balls.join("–")
  if (count <= 0) return `Triple ${label} : aucune co-sortie dans les tirages tracés.`
  const noun = count > 1 ? "co-sorties reliées" : "co-sortie reliée"
  return `Triple ${label} · ${count} ${noun} sur n1–n5.`
}
