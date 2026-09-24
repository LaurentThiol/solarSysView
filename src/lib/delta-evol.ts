import { overlayBands, type BandPoint } from "./draw-overlays"

function mulberry32(seed: number) {
  let state = seed >>> 0
  return () => {
    state += 0x6d2b79f5
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

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

/** Même sens = la grille glisse. Sens opposés = elle s’étire ou se resserre. */
export type EdgeMotion = "slide" | "stretch" | "squeeze" | "still"

export function edgeMotion(n1: number | null, n5: number | null): EdgeMotion | null {
  if (n1 == null || n5 == null) return null
  if (n1 === 0 || n5 === 0) return "still"
  if (Math.sign(n1) === Math.sign(n5)) return "slide"
  return n5 - n1 > 0 ? "stretch" : "squeeze"
}

export type EdgeMotionSummary = {
  slide: number
  stretch: number
  squeeze: number
  still: number
  last: EdgeMotion | null
  lastSlide: -1 | 1 | 0
}

export function summarizeEdgeMotion(
  steps: Array<{ n1: number | null; n5: number | null }>
): EdgeMotionSummary {
  const summary: EdgeMotionSummary = {
    slide: 0,
    stretch: 0,
    squeeze: 0,
    still: 0,
    last: null,
    lastSlide: 0,
  }
  for (const step of steps) {
    const motion = edgeMotion(step.n1, step.n5)
    if (!motion) continue
    summary[motion] += 1
    summary.last = motion
    summary.lastSlide = motion === "slide" && step.n1 != null && step.n1 !== 0 ? (step.n1 > 0 ? 1 : -1) : 0
  }
  return summary
}

export function deltaBinWidth(key: DeltaKey): number {
  if (key === "sumNumbers") return 10
  if (key === "sumStars") return 2
  return 1
}

export type DeltaBin = {
  bin: number
  label: string
  count: number
  holdsLast: boolean
}

function binStart(value: number, width: number) {
  return Math.floor(value / width) * width
}

function binLabel(bin: number, width: number) {
  if (width <= 1) return String(bin)
  const end = bin + width - 1
  return `${bin} – ${end}`
}

/** Histogramme des pas, bacs vides compris, avec le dernier pas marqué. */
export function deltaHistogram(
  values: Array<number | null | undefined>,
  binWidth: number,
  last: number | null = null
): DeltaBin[] {
  const finite = finiteDeltas(values)
  const width = Math.max(1, Math.floor(binWidth))
  if (finite.length === 0) return []
  const start = binStart(Math.min(...finite), width)
  const end = binStart(Math.max(...finite), width)
  const counts = new Map<number, number>()
  for (const value of finite) {
    const bin = binStart(value, width)
    counts.set(bin, (counts.get(bin) ?? 0) + 1)
  }
  const lastBin = last == null ? null : binStart(last, width)
  const bins: DeltaBin[] = []
  for (let bin = start; bin <= end; bin += width) {
    bins.push({
      bin,
      label: binLabel(bin, width),
      count: counts.get(bin) ?? 0,
      holdsLast: lastBin === bin,
    })
  }
  return bins
}

export type ShuffleAbs = {
  observed: number
  shuffleMean: number
  low: number
  high: number
  trials: number
}

function meanAbsStep(values: number[]) {
  if (values.length < 2) return 0
  let sum = 0
  for (let index = 1; index < values.length; index += 1) {
    sum += Math.abs(values[index] - values[index - 1])
  }
  return sum / (values.length - 1)
}

/**
 * |Δ| moyen des niveaux, comparé au même jeu remis dans un ordre aléatoire.
 * La fourchette est le 5e–95e centile des mélanges. Ce n’est pas un signal.
 */
export function shuffleMeanAbs(
  levels: number[],
  options: { trials?: number; seed?: number } = {}
): ShuffleAbs | null {
  if (levels.length < 2) return null
  const trials = Math.max(1, Math.floor(options.trials ?? 200))
  const random = mulberry32(options.seed ?? 1)
  const observed = meanAbsStep(levels)
  const samples: number[] = []
  const order = levels.slice()
  for (let trial = 0; trial < trials; trial += 1) {
    for (let index = order.length - 1; index > 0; index -= 1) {
      const swap = Math.floor(random() * (index + 1))
      const current = order[index]
      order[index] = order[swap]
      order[swap] = current
    }
    samples.push(meanAbsStep(order))
  }
  samples.sort((a, b) => a - b)
  const at = (quantile: number) => samples[Math.min(samples.length - 1, Math.max(0, Math.floor(quantile * samples.length)))]
  const shuffleMean = samples.reduce((sum, value) => sum + value, 0) / samples.length
  return {
    observed,
    shuffleMean,
    low: at(0.05) ?? shuffleMean,
    high: at(0.95) ?? shuffleMean,
    trials,
  }
}

export function shuffleSeed(key: string, length: number) {
  let seed = length + 1
  for (let index = 0; index < key.length; index += 1) {
    seed = Math.imul(seed, 33) + key.charCodeAt(index)
  }
  return seed >>> 0
}
