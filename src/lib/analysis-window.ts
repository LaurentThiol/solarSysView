import {
  type AnalysisDraw,
  chiSquareUniform,
  series,
  sma,
  atr,
  bollinger,
  type VariableName,
} from "@/lib/analysis"

export const WINDOW_PRESETS = [
  "last_20",
  "last_50",
  "last_100",
  "last_200",
  "months_3",
  "months_6",
  "months_12",
  "year",
  "formula",
  "all",
  "custom",
] as const

export type WindowPreset = (typeof WINDOW_PRESETS)[number]

export const WINDOW_PRESET_LABELS: Record<WindowPreset, string> = {
  last_20: "20 derniers tirages",
  last_50: "50 derniers tirages",
  last_100: "100 derniers tirages",
  last_200: "200 derniers tirages",
  months_3: "3 mois",
  months_6: "6 mois",
  months_12: "12 mois",
  year: "Année civile",
  formula: "Formule actuelle (12 ★)",
  all: "Tout l’historique",
  custom: "Personnalisé",
}

const LAST_N: Partial<Record<WindowPreset, number>> = {
  last_20: 20,
  last_50: 50,
  last_100: 100,
  last_200: 200,
}

const MONTHS: Partial<Record<WindowPreset, number>> = {
  months_3: 3,
  months_6: 6,
  months_12: 12,
}

export const DEFAULT_WARMUP = 52

export type WindowSpec = {
  preset: WindowPreset
  fromDate?: string
  toDate?: string
  lastN?: number
  warmup?: number
}

export type ResolvedWindow<T extends { date: string }> = {
  preset: WindowPreset
  fromDate: string | null
  toDate: string | null
  drawCount: number
  warmupCount: number
  warmupFrom: string | null
  starPools: number[]
  starPoolBreak: boolean
  work: T[]
  warmup: T[]
  withWarmup: T[]
  compare: { fromDate: string | null; toDate: string | null; drawCount: number; work: T[] }
}

function ordered<T extends { date: string }>(draws: T[]) {
  return [...draws].sort((a, b) => a.date.localeCompare(b.date))
}

function parseIso(iso: string) {
  return new Date(`${iso.slice(0, 10)}T12:00:00Z`)
}

function formatIso(d: Date) {
  return d.toISOString().slice(0, 10)
}

export function addMonths(iso: string, months: number) {
  const d = parseIso(iso)
  const day = d.getUTCDate()
  d.setUTCDate(1)
  d.setUTCMonth(d.getUTCMonth() + months)
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate()
  d.setUTCDate(Math.min(day, last))
  return formatIso(d)
}

function starPool(draw: { star_pool?: number }) {
  return draw.star_pool
}

export function sliceSeries<T>(values: T[], warmupCount: number) {
  return values.slice(Math.max(0, warmupCount))
}

export function resolveWindow<T extends { date: string; star_pool?: number }>(
  draws: T[],
  spec: WindowSpec
): ResolvedWindow<T> {
  const preset = spec.preset
  const warmupN = spec.warmup ?? DEFAULT_WARMUP
  const empty: ResolvedWindow<T> = {
    preset,
    fromDate: null,
    toDate: null,
    drawCount: 0,
    warmupCount: 0,
    warmupFrom: null,
    starPools: [],
    starPoolBreak: false,
    work: [],
    warmup: [],
    withWarmup: [],
    compare: { fromDate: null, toDate: null, drawCount: 0, work: [] },
  }
  const all = ordered(draws)
  if (all.length === 0) return empty

  const end = spec.toDate ?? all[all.length - 1].date
  let work = all.filter((d) => d.date <= end)

  const lastN = spec.lastN ?? LAST_N[preset]
  if (lastN != null) {
    work = work.slice(-Math.max(1, lastN))
  } else if (MONTHS[preset] != null) {
    const start = spec.fromDate ?? addMonths(end, -MONTHS[preset]!)
    work = work.filter((d) => d.date >= start)
  } else if (preset === "year") {
    const start = spec.fromDate ?? `${end.slice(0, 4)}-01-01`
    work = work.filter((d) => d.date >= start)
  } else if (preset === "formula") {
    work = work.filter((d) => (starPool(d) ?? 12) >= 12)
    if (spec.fromDate) work = work.filter((d) => d.date >= spec.fromDate!)
  } else if (preset === "custom" || preset === "all") {
    if (spec.fromDate) work = work.filter((d) => d.date >= spec.fromDate!)
  }

  if (work.length === 0) return empty

  const workStart = work[0].date
  const before = all.filter((d) => d.date < workStart)
  const warmup = warmupN > 0 ? before.slice(-warmupN) : []
  const pools = [
    ...new Set(work.map((d) => starPool(d)).filter((p): p is number => p != null)),
  ].sort((a, b) => a - b)
  const compareRows = before.slice(-work.length)

  function meta(rows: T[]) {
    if (rows.length === 0) {
      return { fromDate: null, toDate: null, drawCount: 0, work: [] as T[] }
    }
    return {
      fromDate: rows[0].date,
      toDate: rows[rows.length - 1].date,
      drawCount: rows.length,
      work: rows,
    }
  }

  return {
    preset,
    fromDate: work[0].date,
    toDate: work[work.length - 1].date,
    drawCount: work.length,
    warmupCount: warmup.length,
    warmupFrom: warmup[0]?.date ?? null,
    starPools: pools,
    starPoolBreak: new Set(pools).size > 1,
    work,
    warmup,
    withWarmup: [...warmup, ...work],
    compare: meta(compareRows),
  }
}

function mean(values: number[]) {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0
}

function stdev(values: number[]) {
  if (values.length < 2) return 0
  const m = mean(values)
  return Math.sqrt(values.reduce((acc, v) => acc + (v - m) ** 2, 0) / (values.length - 1))
}

export function coverage(draws: AnalysisDraw[]) {
  const seen = new Set<number>()
  for (const draw of draws) for (const n of draw.numbers) seen.add(n)
  return seen.size
}

export type WindowCompare = {
  a: WindowSide
  b: WindowSide
  deltaMean: number | null
  freqDelta: { value: number; delta: number; a: number; b: number }[]
}

type WindowSide = {
  drawCount: number
  fromDate: string | null
  toDate: string | null
  mean: number | null
  std: number | null
  last: number | null
  zscore: number | null
  coverage: number
  chiSquare: number | null
  frequencies: number[]
}

function packSide(rows: AnalysisDraw[], variable: VariableName, n?: number): WindowSide {
  if (rows.length === 0) {
    return {
      drawCount: 0,
      fromDate: null,
      toDate: null,
      mean: null,
      std: null,
      last: null,
      zscore: null,
      coverage: 0,
      chiSquare: null,
      frequencies: Array(51).fill(0),
    }
  }
  const payload = series(rows, variable, n)
  const values = payload.values
  const mu = mean(values)
  const sigma = stdev(values)
  const last = values.at(-1) ?? null
  const z = last != null && sigma > 0 ? (last - mu) / sigma : null
  const chi = chiSquareUniform(rows)
  const frequencies = Array(51).fill(0)
  for (const draw of rows) for (const v of draw.numbers) frequencies[v] += 1
  return {
    drawCount: rows.length,
    fromDate: payload.points[0]?.date ?? null,
    toDate: payload.points.at(-1)?.date ?? null,
    mean: mu,
    std: sigma,
    last,
    zscore: z,
    coverage: coverage(rows),
    chiSquare: chi.stat,
    frequencies,
  }
}

export function compareWindows(
  drawsA: AnalysisDraw[],
  drawsB: AnalysisDraw[],
  variable: VariableName = "sum",
  n?: number
): WindowCompare {
  const a = packSide(drawsA, variable, n)
  const b = packSide(drawsB, variable, n)
  const freqDelta: WindowCompare["freqDelta"] = []
  if (a.drawCount && b.drawCount) {
    for (let ball = 1; ball <= 50; ball += 1) {
      const pa = a.frequencies[ball] / a.drawCount
      const pb = b.frequencies[ball] / b.drawCount
      freqDelta.push({ value: ball, delta: pa - pb, a: a.frequencies[ball], b: b.frequencies[ball] })
    }
    freqDelta.sort((x, y) => Math.abs(y.delta) - Math.abs(x.delta))
  }
  return {
    a,
    b,
    deltaMean: a.mean != null && b.mean != null ? a.mean - b.mean : null,
    freqDelta: freqDelta.slice(0, 10),
  }
}

export type ProfilePoint = {
  date: string
  mean: number | null
  std: number | null
  coverage: number
  bbWidth: number | null
  atr: number | null
}

export function rollingProfile(
  draws: AnalysisDraw[],
  variable: VariableName = "sum",
  period = 20,
  n?: number
) {
  const rows = ordered(draws)
  const payload = series(rows, variable, n)
  const values = payload.values
  const p = Math.max(2, period)
  const meanLine = sma(values, p)
  const bands = bollinger(values, p, 2)
  const candles = values.map((value, i) => {
    const prev = i ? values[i - 1] : value
    return {
      key: rows[i].date,
      from: rows[i].date,
      to: rows[i].date,
      count: 1,
      o: prev,
      h: Math.max(prev, value),
      l: Math.min(prev, value),
      c: value,
    }
  })
  const atrLine = atr(candles, Math.min(p, Math.max(2, candles.length)))
  const points: ProfilePoint[] = rows.map((draw, i) => {
    const start = Math.max(0, i - p + 1)
    const chunk = values.slice(start, i + 1)
    const mid = bands.middle[i]
    const up = bands.upper[i]
    const lo = bands.lower[i]
    const bbWidth = mid && up != null && lo != null ? (up - lo) / mid : null
    return {
      date: draw.date,
      mean: meanLine[i],
      std: chunk.length >= 2 ? stdev(chunk) : null,
      coverage: coverage(rows.slice(start, i + 1)),
      bbWidth,
      atr: atrLine[i] ?? null,
    }
  })
  return {
    variable,
    period: p,
    drawCount: rows.length,
    points,
  }
}

export function inWindow(date: string, fromDate: string | null, toDate: string | null) {
  if (fromDate && date < fromDate) return false
  if (toDate && date > toDate) return false
  return true
}

export function formatWindowBanner(window: ResolvedWindow<{ date: string }>) {
  if (!window.drawCount) return "Aucune fenêtre — aucun tirage."
  const breakNote = window.starPoolBreak
    ? ` · rupture star_pool (${window.starPools.join(" / ")})`
    : ""
  return `Du ${window.fromDate} au ${window.toDate} · ${window.drawCount} tirage${
    window.drawCount > 1 ? "s" : ""
  } · warmup ${window.warmupCount}${breakNote}`
}
