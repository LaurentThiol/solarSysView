/**
 * Triplets des boules 1–50 lus sur les tirages de la fenêtre,
 * du plus récent (rang 0, poids n) au plus ancien (poids 1).
 * Chaque chiffre vient des co-sorties à trois observées.
 */

import {
  BALL_MAX,
  BALL_MIN,
  classicalMds,
  coupleRankWeight,
  type BallPoint,
  type CoupleDraw,
  type CoupleReading,
} from "./couple.ts"

export const TRIPLE_EDGE_LIMIT = 40

export type TripleDraw = CoupleDraw

export type TripleLink = {
  a: number
  b: number
  c: number
  count: number
  affinity: number
  /** Rang inverse de la co-sortie la plus récente. 0 = tirage le plus récent. */
  ago: number
  /** Dates de co-sortie, de la plus récente à la plus ancienne. */
  dates: string[]
}

export type TripleReading = CoupleReading

export type TripleSchema = {
  drawCount: number
  newest: string | null
  oldest: string | null
  reading: TripleReading[]
  links: TripleLink[]
  edges: TripleLink[]
  points: BallPoint[]
  stress: number | null
}

type TripleAcc = {
  a: number
  b: number
  c: number
  count: number
  affinity: number
  ago: number
  dates: string[]
}

function ballsOf(numbers: readonly number[] | undefined): number[] {
  if (!numbers) return []
  const seen = new Set<number>()
  const out: number[] = []
  for (const value of numbers) {
    if (!Number.isInteger(value) || value < BALL_MIN || value > BALL_MAX || seen.has(value)) continue
    seen.add(value)
    out.push(value)
  }
  out.sort((left, right) => left - right)
  return out
}

function tripleKey(a: number, b: number, c: number): string {
  return `${a}-${b}-${c}`
}

export function formatTripleKey(link: Pick<TripleLink, "a" | "b" | "c">): string {
  return tripleKey(link.a, link.b, link.c)
}

export function triplesTouching(links: readonly TripleLink[], ball: number): TripleLink[] {
  return links.filter((link) => link.a === ball || link.b === ball || link.c === ball)
}

export function othersOf(link: TripleLink, ball: number): [number, number] {
  const rest = [link.a, link.b, link.c].filter((value) => value !== ball).sort((left, right) => left - right)
  return [rest[0] ?? link.a, rest[1] ?? link.b]
}

export const TRIPLE_SORT_KEYS = ["trio", "count", "weight", "ago"] as const

export type TripleSortKey = (typeof TRIPLE_SORT_KEYS)[number]
export type TripleSortDir = "asc" | "desc"

/** Premier clic : numéros et ancienneté croissants, compte et poids décroissants. */
export function defaultTripleSortDir(key: TripleSortKey): TripleSortDir {
  return key === "trio" || key === "ago" ? "asc" : "desc"
}

function tripleSortPrimary(link: TripleLink, key: TripleSortKey): number {
  if (key === "count") return link.count
  if (key === "weight") return link.affinity
  if (key === "ago") return link.ago
  return 0
}

/**
 * Tri d’une colonne du tableau Triplets.
 * À égalité : plus fort poids, puis plus grand compte, puis plus petit triplet.
 */
export function compareTripleLinks(
  left: TripleLink,
  right: TripleLink,
  key: TripleSortKey,
  dir: TripleSortDir
): number {
  const sign = dir === "asc" ? 1 : -1
  const primary =
    key === "trio"
      ? left.a - right.a || left.b - right.b || left.c - right.c
      : tripleSortPrimary(left, key) - tripleSortPrimary(right, key)
  if (primary !== 0) return primary * sign
  return (
    right.affinity - left.affinity ||
    right.count - left.count ||
    left.a - right.a ||
    left.b - right.b ||
    left.c - right.c
  )
}

export function sortTripleLinks(
  links: readonly TripleLink[],
  key: TripleSortKey,
  dir: TripleSortDir
): TripleLink[] {
  return [...links].sort((left, right) => compareTripleLinks(left, right, key, dir))
}

export function tripleSchema(
  draws: readonly TripleDraw[],
  edgeLimit = TRIPLE_EDGE_LIMIT
): TripleSchema {
  const readingDraws = draws
    .map((draw, index) => ({ draw, index }))
    .sort(
      (left, right) =>
        right.draw.date.localeCompare(left.draw.date) || left.index - right.index
    )
    .map((item) => item.draw)

  const n = readingDraws.length
  const reading: TripleReading[] = []
  const triples = new Map<string, TripleAcc>()
  const appearances = Array<number>(BALL_MAX + 1).fill(0)

  for (let rank = 0; rank < n; rank += 1) {
    const draw = readingDraws[rank]
    const numbers = ballsOf(draw.numbers)
    reading.push({ date: draw.date, numbers })
    const weight = coupleRankWeight(rank, n)
    for (const ball of numbers) appearances[ball] += 1
    for (let i = 0; i < numbers.length; i += 1) {
      for (let j = i + 1; j < numbers.length; j += 1) {
        for (let k = j + 1; k < numbers.length; k += 1) {
          const a = numbers[i]
          const b = numbers[j]
          const c = numbers[k]
          const key = tripleKey(a, b, c)
          const acc = triples.get(key)
          if (acc) {
            acc.count += 1
            acc.affinity += weight
            acc.dates.push(draw.date)
          } else {
            triples.set(key, {
              a,
              b,
              c,
              count: 1,
              affinity: weight,
              ago: rank,
              dates: [draw.date],
            })
          }
        }
      }
    }
  }

  const links = sortTripleLinks([...triples.values()], "weight", "desc")
  const limit = Number.isFinite(edgeLimit) ? Math.max(0, Math.trunc(edgeLimit)) : TRIPLE_EDGE_LIMIT
  const edges = links.slice(0, limit)

  if (n === 0) {
    return {
      drawCount: 0,
      newest: null,
      oldest: null,
      reading,
      links,
      edges,
      points: [],
      stress: null,
    }
  }

  const size = BALL_MAX - BALL_MIN + 1
  const pairWeight = new Map<string, number>()
  for (const link of links) {
    const pairs: [number, number][] = [
      [link.a, link.b],
      [link.a, link.c],
      [link.b, link.c],
    ]
    for (const [left, right] of pairs) {
      const key = left < right ? `${left}-${right}` : `${right}-${left}`
      pairWeight.set(key, (pairWeight.get(key) ?? 0) + link.affinity)
    }
  }

  const distances = Array.from({ length: size }, () => Array<number>(size).fill(1))
  for (let i = 0; i < size; i += 1) distances[i][i] = 0
  for (const [key, weight] of pairWeight) {
    const [left, right] = key.split("-").map((value) => Number(value))
    const i = left - BALL_MIN
    const j = right - BALL_MIN
    const dist = 1 / (1 + weight)
    distances[i][j] = dist
    distances[j][i] = dist
  }

  const embedded = classicalMds(distances, 3)
  const points: BallPoint[] = []
  for (let ball = BALL_MIN; ball <= BALL_MAX; ball += 1) {
    const coord = embedded.coords[ball - BALL_MIN] ?? [0, 0, 0]
    points.push({
      ball,
      x: coord[0] ?? 0,
      y: coord[1] ?? 0,
      z: coord[2] ?? 0,
      appearances: appearances[ball] ?? 0,
    })
  }

  return {
    drawCount: n,
    newest: reading[0]?.date ?? null,
    oldest: reading[n - 1]?.date ?? null,
    reading,
    links,
    edges,
    points,
    stress: embedded.stress,
  }
}
