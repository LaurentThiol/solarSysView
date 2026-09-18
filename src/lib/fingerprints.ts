/** Portraits numériques des tirages : z-score par variable Analyse, hors delay/hit. */

export type FingerprintDraw = {
  date: string
  numbers: number[]
  stars: number[]
}

/** Axes d’un portrait de tirage : hors delay/hit, qui suivent une boule, pas le tirage. */
export const FINGERPRINT_AXES = [
  "sum",
  "spread",
  "parity",
  "high_low",
  "consecutive",
  "centroid",
  "n1",
  "n2",
  "n3",
  "n4",
  "n5",
  "g1",
  "g2",
  "g3",
  "g4",
  "star_sum",
  "e1",
  "e2",
] as const

export type FingerprintAxis = (typeof FINGERPRINT_AXES)[number]

export const FINGERPRINT_AXIS_LABELS: Record<FingerprintAxis, string> = {
  sum: "Somme des numéros",
  spread: "Étendue (max − min)",
  parity: "Pairs / impairs",
  high_low: "Numéros ≥ 26",
  consecutive: "Paires consécutives",
  centroid: "Centre de masse",
  n1: "Plus petit numéro",
  n2: "2ᵉ numéro trié",
  n3: "3ᵉ numéro trié",
  n4: "4ᵉ numéro trié",
  n5: "Plus grand numéro",
  g1: "Écart n2 − n1",
  g2: "Écart n3 − n2",
  g3: "Écart n4 − n3",
  g4: "Écart n5 − n4",
  star_sum: "Somme des étoiles",
  e1: "Plus petite étoile",
  e2: "Plus grande étoile",
}

export const DEFAULT_TWIN_K = 8

export type DrawParams = Record<FingerprintAxis, number>

export type AxisNorm = {
  axis: FingerprintAxis
  mean: number
  std: number
}

export type FingerprintRow = {
  date: string
  numbers: number[]
  stars: number[]
  params: DrawParams
  z: number[]
}

export type TwinHit = {
  date: string
  numbers: number[]
  stars: number[]
  params: DrawParams
  delta: Partial<Record<FingerprintAxis, number>>
  z: number[]
  score: number
}

export type FingerprintIndex = {
  axes: FingerprintAxis[]
  norms: AxisNorm[]
  rows: FingerprintRow[]
  query: FingerprintRow | null
  neighbors: TwinHit[]
}

const AXIS_SET = new Set<string>(FINGERPRINT_AXES)

export function isFingerprintAxis(value: string | null | undefined): value is FingerprintAxis {
  return Boolean(value && AXIS_SET.has(value))
}

export function parseFingerprintAxes(raw: readonly string[] | null | undefined): FingerprintAxis[] {
  if (!raw?.length) return [...FINGERPRINT_AXES]
  const seen = new Set<FingerprintAxis>()
  for (const item of raw) {
    if (isFingerprintAxis(item) && !seen.has(item)) seen.add(item)
  }
  return seen.size ? [...seen] : [...FINGERPRINT_AXES]
}

export function fingerprintAxisLabel(axis: FingerprintAxis): string {
  return FINGERPRINT_AXIS_LABELS[axis]
}

export function cosine(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length)
  if (!n) return 0
  let num = 0
  let na = 0
  let nb = 0
  for (let i = 0; i < n; i += 1) {
    num += a[i] * b[i]
    na += a[i] * a[i]
    nb += b[i] * b[i]
  }
  if (!na || !nb) return 0
  return num / (Math.sqrt(na) * Math.sqrt(nb))
}

function mean(values: number[]): number {
  return values.length ? values.reduce((acc, value) => acc + value, 0) / values.length : 0
}

function sampleStd(values: number[]): number {
  if (values.length < 2) return 0
  const mu = mean(values)
  const variance = values.reduce((acc, value) => acc + (value - mu) ** 2, 0) / (values.length - 1)
  return Math.sqrt(variance)
}

export function zScore(value: number, mu: number, std: number): number {
  if (!std) return 0
  return (value - mu) / std
}

export function roundDelta(axis: FingerprintAxis, value: number): number {
  if (axis === "centroid") return Math.round(value * 10000) / 10000
  const nearest = Math.round(value)
  if (Math.abs(value - nearest) < 1e-9) return nearest
  return Math.round(value * 10000) / 10000
}

export function paramDeltas(
  query: DrawParams,
  other: DrawParams,
  axes: readonly FingerprintAxis[]
): Partial<Record<FingerprintAxis, number>> {
  const out: Partial<Record<FingerprintAxis, number>> = {}
  for (const axis of axes) {
    out[axis] = roundDelta(axis, other[axis] - query[axis])
  }
  return out
}

export function formatDeltaChip(axis: FingerprintAxis, value: number): string {
  const shown = roundDelta(axis, value)
  const sign = shown > 0 ? "+" : shown < 0 ? "−" : ""
  const abs = shown < 0 ? -shown : shown
  return `${axis} ${sign}${abs}`
}

function orderStatistic(pool: number[], rank: number): number {
  if (!pool.length) return 0
  const ranked = [...pool].sort((a, b) => a - b)
  return ranked[Math.min(Math.max(rank, 1), ranked.length) - 1]
}

function consecutivePairs(numbers: number[]): number {
  const set = new Set(numbers)
  let count = 0
  for (const value of set) if (set.has(value + 1)) count += 1
  return count
}

export function paramsOf(draw: FingerprintDraw): DrawParams {
  const nums = draw.numbers
  return {
    sum: nums.reduce((acc, value) => acc + value, 0),
    spread: nums.length ? Math.max(...nums) - Math.min(...nums) : 0,
    parity: nums.filter((n) => n % 2 === 0).length,
    high_low: nums.filter((n) => n >= 26).length,
    consecutive: consecutivePairs(nums),
    centroid: nums.length ? nums.reduce((acc, value) => acc + value, 0) / 5 : 0,
    n1: orderStatistic(nums, 1),
    n2: orderStatistic(nums, 2),
    n3: orderStatistic(nums, 3),
    n4: orderStatistic(nums, 4),
    n5: orderStatistic(nums, 5),
    g1: orderStatistic(nums, 2) - orderStatistic(nums, 1),
    g2: orderStatistic(nums, 3) - orderStatistic(nums, 2),
    g3: orderStatistic(nums, 4) - orderStatistic(nums, 3),
    g4: orderStatistic(nums, 5) - orderStatistic(nums, 4),
    star_sum: draw.stars.reduce((acc, value) => acc + value, 0),
    e1: orderStatistic(draw.stars, 1),
    e2: orderStatistic(draw.stars, 2),
  }
}

export function drawParams(draws: FingerprintDraw[]): Map<string, DrawParams> {
  const ordered = [...draws].sort((a, b) => a.date.localeCompare(b.date))
  return new Map(ordered.map((draw) => [draw.date, paramsOf(draw)]))
}

function emptyParams(): DrawParams {
  return Object.fromEntries(FINGERPRINT_AXES.map((axis) => [axis, 0])) as DrawParams
}

function normsFor(rows: DrawParams[], axes: readonly FingerprintAxis[]): AxisNorm[] {
  return axes.map((axis) => {
    const values = rows.map((row) => row[axis])
    return { axis, mean: mean(values), std: sampleStd(values) }
  })
}

function zVector(params: DrawParams, norms: readonly AxisNorm[]): number[] {
  return norms.map((norm) => zScore(params[norm.axis], norm.mean, norm.std))
}

function asRow(draw: FingerprintDraw, params: DrawParams, norms: readonly AxisNorm[]): FingerprintRow {
  return {
    date: draw.date,
    numbers: draw.numbers,
    stars: draw.stars,
    params,
    z: zVector(params, norms),
  }
}

export function buildFingerprintIndex(
  draws: FingerprintDraw[],
  options: {
    axes?: readonly string[] | null
    queryDate?: string | null
    queryDraw?: Pick<FingerprintDraw, "numbers" | "stars" | "date"> | null
    k?: number
  } = {}
): FingerprintIndex {
  const axes = parseFingerprintAxes(options.axes)
  const ordered = [...draws].sort((a, b) => a.date.localeCompare(b.date))
  const paramsByDate = drawParams(ordered)
  const paramRows = ordered.map((draw) => paramsByDate.get(draw.date) ?? emptyParams())
  const norms = normsFor(paramRows, axes)
  const rows = ordered.map((draw, i) => asRow(draw, paramRows[i], norms))

  let query: FingerprintRow | null = null
  if (options.queryDraw && !options.queryDate) {
    const params = paramsOf({
      date: options.queryDraw.date || "query",
      numbers: options.queryDraw.numbers,
      stars: options.queryDraw.stars,
    })
    query = {
      date: options.queryDraw.date || "query",
      numbers: options.queryDraw.numbers,
      stars: options.queryDraw.stars,
      params,
      z: zVector(params, norms),
    }
  } else {
    const wanted = options.queryDate || rows.at(-1)?.date
    query = rows.find((row) => row.date === wanted) ?? rows.at(-1) ?? null
  }

  const k = Math.max(0, options.k ?? DEFAULT_TWIN_K)
  const neighbors: TwinHit[] = []
  if (query && rows.length) {
    const scored = rows
      .filter((row) => row.date !== query.date)
      .map((row) => ({
        date: row.date,
        numbers: row.numbers,
        stars: row.stars,
        params: row.params,
        delta: paramDeltas(query.params, row.params, axes),
        z: row.z,
        score: Math.round(cosine(query.z, row.z) * 10000) / 10000,
      }))
    scored.sort((a, b) => b.score - a.score || b.date.localeCompare(a.date))
    neighbors.push(...scored.slice(0, k))
  }

  return { axes, norms, rows, query, neighbors }
}

export function zFill(z: number): string {
  const clamped = Math.max(-2.5, Math.min(2.5, z))
  const t = Math.abs(clamped) / 2.5
  const hue = clamped < 0 ? "var(--chart-2)" : "var(--chart-5)"
  return `color-mix(in oklab, ${hue} ${Math.round(t * 72)}%, var(--muted))`
}
