import { overlayBands, type BandPoint } from "./draw-overlays"

/** Champs d’un point de courbe déjà trié (n1 ≤ … ≤ n5, e1 ≤ e2). */
export type DeltaSource = {
  date: string
  weekday?: string
  id: number
  n1: number
  n2: number
  n3: number
  n4: number
  n5: number
  sumNumbers: number
  e1: number
  e2: number
  sumStars: number
}

/** Séries dont on trace l’écart au tirage précédent. */
export const DELTA_KEYS = [
  "n1",
  "n2",
  "n3",
  "n4",
  "n5",
  "e1",
  "e2",
  "sumNumbers",
  "sumStars",
] as const

export type DeltaKey = (typeof DELTA_KEYS)[number]

export type DeltaView = "sums" | "numbers" | "stars" | "all"

export const DELTA_VIEW_KEYS: Record<DeltaView, readonly DeltaKey[]> = {
  sums: ["sumNumbers", "sumStars"],
  numbers: ["n1", "n2", "n3", "n4", "n5"],
  stars: ["e1", "e2"],
  all: DELTA_KEYS,
}

export type DeltaPoint = {
  date: string
  weekday?: string
  id: number
  prevDate: string | null
  n1: number | null
  n2: number | null
  n3: number | null
  n4: number | null
  n5: number | null
  e1: number | null
  e2: number | null
  sumNumbers: number | null
  sumStars: number | null
  level_n1: number
  level_n2: number
  level_n3: number
  level_n4: number
  level_n5: number
  level_e1: number
  level_e2: number
  level_sumNumbers: number
  level_sumStars: number
}

const EMPTY_BAND: BandPoint = {
  sma: null,
  upper: null,
  lower: null,
  percentB: null,
}

function levelKey(key: DeltaKey): `level_${DeltaKey}` {
  return `level_${key}`
}

/** Écart tirage n − tirage n−1. Le premier point de la fenêtre n’a pas de prédécesseur. */
export function toDeltaSeries(series: DeltaSource[]): DeltaPoint[] {
  return series.map((point, index) => {
    const prev = index > 0 ? series[index - 1] : undefined
    const row: DeltaPoint = {
      date: point.date,
      weekday: point.weekday,
      id: point.id,
      prevDate: prev?.date ?? null,
      n1: null,
      n2: null,
      n3: null,
      n4: null,
      n5: null,
      e1: null,
      e2: null,
      sumNumbers: null,
      sumStars: null,
      level_n1: point.n1,
      level_n2: point.n2,
      level_n3: point.n3,
      level_n4: point.n4,
      level_n5: point.n5,
      level_e1: point.e1,
      level_e2: point.e2,
      level_sumNumbers: point.sumNumbers,
      level_sumStars: point.sumStars,
    }
    if (!prev) return row
    for (const key of DELTA_KEYS) {
      row[key] = point[key] - prev[key]
    }
    return row
  })
}

export function finiteDeltas(values: Array<number | null | undefined>): number[] {
  return values.filter(
    (value): value is number => typeof value === "number" && Number.isFinite(value)
  )
}

export type DeltaSummary = {
  min: number
  max: number
  avg: number
  meanAbs: number
  last: number
  streak: { sign: -1 | 0 | 1; length: number }
}

function streakOf(values: number[]): { sign: -1 | 0 | 1; length: number } {
  let index = values.length - 1
  while (index >= 0 && values[index] === 0) index -= 1
  if (index < 0) return { sign: 0, length: 0 }
  const sign: -1 | 1 = values[index] > 0 ? 1 : -1
  let length = 0
  for (let cursor = index; cursor >= 0; cursor -= 1) {
    const value = values[cursor]
    if (value === 0 || Math.sign(value) !== sign) break
    length += 1
  }
  return { sign, length }
}

export function summarizeDelta(values: Array<number | null | undefined>): DeltaSummary | null {
  const finite = finiteDeltas(values)
  if (finite.length === 0) return null
  const min = Math.min(...finite)
  const max = Math.max(...finite)
  const avg = finite.reduce((sum, value) => sum + value, 0) / finite.length
  const meanAbs = finite.reduce((sum, value) => sum + Math.abs(value), 0) / finite.length
  return {
    min,
    max,
    avg,
    meanAbs,
    last: finite[finite.length - 1] ?? 0,
    streak: streakOf(finite),
  }
}

/** SMA / Bollinger sur les écarts finis, réalignés sur l’index du graphique (trou au premier tirage). */
export function deltaOverlayBands(
  values: Array<number | null | undefined>,
  period: number
): BandPoint[] {
  const finite = finiteDeltas(values)
  const bands = overlayBands(finite, period)
  let cursor = 0
  return values.map((value) => {
    if (typeof value !== "number" || !Number.isFinite(value)) return EMPTY_BAND
    const band = bands[cursor] ?? EMPTY_BAND
    cursor += 1
    return band
  })
}

/** Domaine qui contient 0, pour que la ligne de base reste dans le cadre. */
export function deltaDomain(values: number[]): [number, number] {
  if (values.length === 0) return [-1, 1]
  let lo = Math.min(0, ...values)
  let hi = Math.max(0, ...values)
  if (lo === hi) {
    lo -= 1
    hi += 1
  }
  const pad = Math.max(1, (hi - lo) * 0.08)
  return [lo - pad, hi + pad]
}

export function previousLevel(point: DeltaPoint, key: DeltaKey): number | null {
  const delta = point[key]
  if (delta == null) return null
  return point[levelKey(key)] - delta
}
