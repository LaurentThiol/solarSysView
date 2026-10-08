/** Persist dans nextData : échanges vers n−1 ou n−2, leur issue et ce qu’ils coûtent. */

import { sharedValues } from "@/lib/nextdata/compare"
import { gridShape } from "@/lib/nextdata/shape"

export const PERSIST_RADII = [1, 2, 3] as const
export const PERSIST_LIMITS = [1, 2] as const

export type PersistRadius = (typeof PERSIST_RADII)[number]
export type PersistLimit = (typeof PERSIST_LIMITS)[number]
export type PersistSetting = { radius: PersistRadius; limit: PersistLimit }

export type SwapKind = "number" | "star"
export type SwapOutcome = "gain" | "loss" | "neutral"

export type PersistSwap = {
  kind: SwapKind
  from: number
  to: number
  lag: 1 | 2
  distance: number
  outcome?: SwapOutcome
}

export type PersistHeld = { numbers: number; stars: number }

export type PersistGrid = {
  numbers: number[]
  stars: number[]
  swaps?: PersistSwap[]
  held?: PersistHeld | null
}

export type RateCell = { drawn: number; seen: number; rate: number | null; lo: number; hi: number }
export type DistanceCell = RateCell & { distance: number; far: boolean }
export type EdgeCell = { radius: number; near: RateCell; value: number | null; lo: number | null; hi: number | null }

export type BaseSide = {
  chance: number
  at_least_one: { observed: number; chance: number }
  by_distance: DistanceCell[]
  edge: EdgeCell[]
  swaps_for_one_point: number
}

export type PersistBase = {
  draws: number
  first: string
  last: string
  numbers: BaseSide
  stars: BaseSide
  any: { observed: number; chance: number }
}

export type RecentDraw = { lag: 1 | 2; date: string; numbers: number[]; stars: number[] }

export type PersistInfo = {
  radius: number
  limit: number
  recent?: RecentDraw[]
  base: PersistBase | null
}

const Z95 = 1.959964

export function persistKey(reading: string) {
  return `${reading}_persist`
}

/** Variance d’un échange quand les tirages sont indépendants : gagné ou perdu, chacun s/P · (P − s)/(P − 1). */
export function swapVariance(kind: SwapKind, starPool = 12) {
  const slots = kind === "number" ? 5 : 2
  const pool = kind === "number" ? 50 : starPool
  return 2 * (slots / pool) * ((pool - slots) / (pool - 1))
}

/** Demi-largeur à 95 % du net gagnés − perdus, au hasard, pour `count` échanges. */
export function swapNoise(count: number, kind: SwapKind, starPool = 12) {
  if (count <= 0) return 0
  return Z95 * Math.sqrt(count * swapVariance(kind, starPool))
}

/** Test exact des signes, bilatéral : autant de gagnés que de perdus si la reprise ne change rien. */
export function signTest(gains: number, losses: number): number | null {
  const n = gains + losses
  if (n <= 0) return null
  const k = Math.min(gains, losses)
  let logTerm = -n * Math.LN2
  const logs = [logTerm]
  for (let i = 0; i < k; i += 1) {
    logTerm += Math.log(n - i) - Math.log(i + 1)
    logs.push(logTerm)
  }
  const peak = Math.max(...logs)
  const tail = Math.exp(peak) * logs.reduce((total, value) => total + Math.exp(value - peak), 0)
  return Math.min(1, 2 * tail)
}

export type SwapTally = {
  swaps: number
  gains: number
  losses: number
  neutral: number
  net: number
  p: number | null
  noise: number
}

export function tallySwaps(lists: (PersistSwap[] | null | undefined)[], kind: SwapKind, starPool = 12): SwapTally {
  let gains = 0
  let losses = 0
  let neutral = 0
  for (const list of lists) {
    for (const swap of list ?? []) {
      if (swap.kind !== kind) continue
      if (swap.outcome === "gain") gains += 1
      else if (swap.outcome === "loss") losses += 1
      else neutral += 1
    }
  }
  const swaps = gains + losses + neutral
  return {
    swaps,
    gains,
    losses,
    neutral,
    net: gains - losses,
    p: signTest(gains, losses),
    noise: swapNoise(swaps, kind, starPool),
  }
}

type GridLike = { numbers: number[]; stars: number[] }

export const PAIRED_FIELDS = [
  { key: "sum", label: "somme" },
  { key: "n1", label: "n1" },
  { key: "n2", label: "n2" },
  { key: "n3", label: "n3" },
  { key: "n4", label: "n4" },
  { key: "n5", label: "n5" },
  { key: "e1", label: "e1" },
  { key: "e2", label: "e2" },
  { key: "spread", label: "étendue" },
  { key: "consecutive", label: "consécutifs" },
] as const

export type PairedFieldKey = (typeof PAIRED_FIELDS)[number]["key"]

export function gridFields(grid: GridLike): Record<PairedFieldKey, number | null> {
  const numbers = [...grid.numbers].sort((a, b) => a - b)
  const stars = [...grid.stars].sort((a, b) => a - b)
  const shape = gridShape(numbers, stars)
  return {
    sum: numbers.length ? numbers.reduce((total, value) => total + value, 0) : null,
    n1: numbers[0] ?? null,
    n2: numbers[1] ?? null,
    n3: numbers[2] ?? null,
    n4: numbers[3] ?? null,
    n5: numbers[4] ?? null,
    e1: stars[0] ?? null,
    e2: stars[1] ?? null,
    spread: numbers.length ? shape.spread : null,
    consecutive: numbers.length ? shape.consecutive : null,
  }
}

export type PersistPair = {
  actual: GridLike
  raw?: GridLike | null
  persist?: PersistGrid | null
}

export type PairedField = {
  key: PairedFieldKey
  label: string
  raw: number | null
  persist: number | null
  delta: number | null
}

export type PairedPersist = {
  draws: number
  moved: number
  numbers: SwapTally
  stars: SwapTally
  hits: { raw: { numbers: number; stars: number }; persist: { numbers: number; stars: number } }
  fields: PairedField[]
}

function sameGrid(left: GridLike, right: GridLike) {
  const a = [...left.numbers].sort((x, y) => x - y).join("-") + "+" + [...left.stars].sort((x, y) => x - y).join("-")
  const b = [...right.numbers].sort((x, y) => x - y).join("-") + "+" + [...right.stars].sort((x, y) => x - y).join("-")
  return a === b
}

/** Même grille du modèle, avec et sans Persist : MAE de chaque champ, communs et issue des échanges. */
export function pairPersist(pairs: PersistPair[], starPool = 12): PairedPersist | null {
  const ready = pairs.filter(
    (pair): pair is { actual: GridLike; raw: GridLike; persist: PersistGrid } =>
      Boolean(pair.raw?.numbers.length && pair.persist?.numbers.length && pair.actual.numbers.length)
  )
  if (ready.length === 0) return null
  const sums = {
    raw: Object.fromEntries(PAIRED_FIELDS.map((field) => [field.key, { total: 0, count: 0 }])),
    persist: Object.fromEntries(PAIRED_FIELDS.map((field) => [field.key, { total: 0, count: 0 }])),
  } as Record<"raw" | "persist", Record<PairedFieldKey, { total: number; count: number }>>
  const hits = { raw: { numbers: 0, stars: 0 }, persist: { numbers: 0, stars: 0 } }
  let moved = 0
  for (const pair of ready) {
    const truth = gridFields(pair.actual)
    for (const side of ["raw", "persist"] as const) {
      const grid = pair[side]
      const values = gridFields(grid)
      for (const field of PAIRED_FIELDS) {
        const predicted = values[field.key]
        const actual = truth[field.key]
        if (predicted == null || actual == null) continue
        sums[side][field.key].total += Math.abs(predicted - actual)
        sums[side][field.key].count += 1
      }
      hits[side].numbers += sharedValues(pair.actual.numbers, grid.numbers).length
      hits[side].stars += sharedValues(pair.actual.stars, grid.stars).length
    }
    if (!sameGrid(pair.raw, pair.persist)) moved += 1
  }
  const mean = (cell: { total: number; count: number }) => (cell.count ? cell.total / cell.count : null)
  const fields = PAIRED_FIELDS.map((field) => {
    const raw = mean(sums.raw[field.key])
    const persist = mean(sums.persist[field.key])
    return {
      key: field.key,
      label: field.label,
      raw,
      persist,
      delta: raw == null || persist == null ? null : persist - raw,
    }
  })
  const lists = ready.map((pair) => pair.persist.swaps)
  const count = ready.length
  return {
    draws: count,
    moved,
    numbers: tallySwaps(lists, "number", starPool),
    stars: tallySwaps(lists, "star", starPool),
    hits: {
      raw: { numbers: hits.raw.numbers / count, stars: hits.raw.stars / count },
      persist: { numbers: hits.persist.numbers / count, stars: hits.persist.stars / count },
    },
    fields,
  }
}

export function lagLabel(lag: 1 | 2) {
  return lag === 1 ? "n−1" : "n−2"
}

const OUTCOME_LABEL: Record<SwapOutcome, string> = {
  gain: "gagné",
  loss: "perdu",
  neutral: "neutre",
}

export function swapLabel(swap: PersistSwap) {
  const star = swap.kind === "star" ? "★ " : ""
  const outcome = swap.outcome ? ` · ${OUTCOME_LABEL[swap.outcome]}` : ""
  return `${star}${swap.from} → ${swap.to} · ${lagLabel(swap.lag)}${outcome}`
}

export function swappedValues(swaps: PersistSwap[] | null | undefined, kind: SwapKind) {
  return new Set((swaps ?? []).filter((swap) => swap.kind === kind).map((swap) => swap.to))
}

export function radiusLabel(radius: number) {
  return `±${radius}`
}

function frenchNumber(value: number, digits: number) {
  return value.toLocaleString("fr-FR", { minimumFractionDigits: digits, maximumFractionDigits: digits })
}

/** Part en pour cent, une décimale : 0,0982 → « 9,8 % ». */
export function formatRate(value: number | null | undefined, digits = 1) {
  if (value == null || !Number.isFinite(value)) return "—"
  return value.toLocaleString("fr-FR", {
    style: "percent",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })
}

/** Écart de parts en points : −0,0036 → « −0,4 pt ». */
export function formatPoints(value: number | null | undefined, digits = 1) {
  if (value == null || !Number.isFinite(value)) return "—"
  const rounded = Math.round(value * 100 * 10 ** digits) / 10 ** digits
  const body = frenchNumber(Math.abs(rounded), digits)
  if (rounded > 0) return `+${body} pt`
  if (rounded < 0) return `−${body} pt`
  return `${body} pt`
}

export function formatPValue(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "—"
  if (value < 0.001) return "< 0,001"
  return frenchNumber(value, value < 0.1 ? 3 : 2)
}

export function formatCount(value: number) {
  return value.toLocaleString("fr-FR")
}

/** Écart d’une valeur moyenne, signe compris, une décimale. */
export function formatDelta(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "—"
  const rounded = Math.round(value * 100) / 100
  const body = frenchNumber(Math.abs(rounded), 2)
  if (rounded > 0) return `+${body}`
  if (rounded < 0) return `−${body}`
  return body
}

export function edgeFor(side: BaseSide, radius: number) {
  return side.edge.find((cell) => cell.radius === radius) ?? null
}
