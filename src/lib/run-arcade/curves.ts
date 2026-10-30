import { decadeCounts } from "@/lib/grid-shape"
import {
  NUMBER_SUM_MAX,
  NUMBER_SUM_MIN,
  STAR_SUM_MAX,
  STAR_SUM_MIN,
  theoreticalSlot,
} from "@/lib/pronostic/bounds"

export const NUMBER_KEYS = ["n1", "n2", "n3", "n4", "n5"] as const
export const STAR_KEYS = ["e1", "e2"] as const
export const RANK_KEYS = [...NUMBER_KEYS, ...STAR_KEYS] as const
export const SUM_KEYS = ["sumNumbers", "sumStars"] as const
export const DECADE_KEYS = ["d0", "d1", "d2", "d3", "d4"] as const

/** Ordre de pensée : les totales d’abord, puis les détails qui doivent les respecter. */
export const CURVE_KEYS = [...SUM_KEYS, ...RANK_KEYS, ...DECADE_KEYS] as const

export type RankKey = (typeof RANK_KEYS)[number]
export type DecadeKey = (typeof DECADE_KEYS)[number]
export type CurveKey = (typeof CURVE_KEYS)[number]

export type RankPoint = { date: string } & Record<RankKey, number>
export type CurveValues = Record<CurveKey, number>

export type CurveKind = "total" | "detail"

export type CurveMeta = {
  key: CurveKey
  label: string
  kind: CurveKind
  lo: number
  hi: number
}

export const DECADE_BANDS = [
  { lo: 1, hi: 10 },
  { lo: 11, hi: 20 },
  { lo: 21, hi: 30 },
  { lo: 31, hi: 40 },
  { lo: 41, hi: 50 },
] as const

/** Colonnes du rail : totales et décennies à gauche, rangs à droite. */
export const RAIL_LEFT: readonly CurveKey[] = [...SUM_KEYS, ...DECADE_KEYS]
export const RAIL_RIGHT: readonly CurveKey[] = [...RANK_KEYS]

const LABELS: Record<CurveKey, string> = {
  sumNumbers: "Σn",
  sumStars: "Σ★",
  n1: "n1",
  n2: "n2",
  n3: "n3",
  n4: "n4",
  n5: "n5",
  e1: "e1",
  e2: "e2",
  d0: "d0",
  d1: "d1",
  d2: "d2",
  d3: "d3",
  d4: "d4",
}

export function isCurveKey(value: unknown): value is CurveKey {
  return typeof value === "string" && (CURVE_KEYS as readonly string[]).includes(value)
}

export function isRankKey(key: CurveKey): key is RankKey {
  return (RANK_KEYS as readonly string[]).includes(key)
}

export function isDecadeKey(key: CurveKey): key is DecadeKey {
  return (DECADE_KEYS as readonly string[]).includes(key)
}

export function curveLabel(key: CurveKey) {
  return LABELS[key]
}

export function curveMeta(key: CurveKey): CurveMeta {
  const label = LABELS[key]
  if (key === "sumNumbers") return { key, label, kind: "total", lo: NUMBER_SUM_MIN, hi: NUMBER_SUM_MAX }
  if (key === "sumStars") return { key, label, kind: "total", lo: STAR_SUM_MIN, hi: STAR_SUM_MAX }
  if (isDecadeKey(key)) return { key, label, kind: "detail", lo: 0, hi: 5 }
  const stars = key === "e1" || key === "e2"
  const slot = theoreticalSlot(stars ? "stars" : "numbers", Number(key.slice(1)) - 1)
  return { key, label, kind: "detail", lo: slot.lo, hi: slot.hi }
}

export function curveValues(point: RankPoint): CurveValues {
  const numbers = NUMBER_KEYS.map((key) => point[key])
  const decades = decadeCounts(numbers)
  return {
    sumNumbers: numbers.reduce((total, value) => total + value, 0),
    sumStars: point.e1 + point.e2,
    n1: point.n1,
    n2: point.n2,
    n3: point.n3,
    n4: point.n4,
    n5: point.n5,
    e1: point.e1,
    e2: point.e2,
    d0: decades[0],
    d1: decades[1],
    d2: decades[2],
    d3: decades[3],
    d4: decades[4],
  }
}

export function curveAt(point: RankPoint, key: CurveKey) {
  return curveValues(point)[key]
}

/** Années civiles n−1 et n du tirage le plus récent, dans l’ordre chronologique. */
export function buildTrack(points: readonly RankPoint[]): RankPoint[] {
  const sorted = [...points].sort((a, b) => a.date.localeCompare(b.date))
  if (sorted.length === 0) return []
  const newest = Number(sorted[sorted.length - 1].date.slice(0, 4))
  if (!Number.isFinite(newest)) return sorted.map((point) => ({ ...point }))
  return sorted
    .filter((point) => Number(point.date.slice(0, 4)) >= newest - 1)
    .map((point) => ({ ...point }))
}
