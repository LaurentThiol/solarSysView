import { swingPivots, swingThreshold } from "./chartisme/pivots"

/**
 * Atténuation façon balle qui rebondit, sur n1…n5 et e1, e2.
 *
 * Une balle de restitution e (0 < e < 1) touche, monte, retombe. D'un rebond
 * au suivant la hauteur suit h → e² h, et la durée de vol τ → e τ. Ici un
 * rebond est un creux, un sommet, un creux. On ne garde une fenêtre que si
 * les hauteurs s'amortissent et que chaque arche ressemble à une parabole.
 * Lecture du tracé : les tirages restent indépendants.
 */

export const BOUNCE_SERIES = ["n1", "n2", "n3", "n4", "n5", "e1", "e2"] as const

export type BounceSeriesId = (typeof BOUNCE_SERIES)[number]

export const MIN_BOUNCES = 3
export const MAX_BOUNCES = 8

const E_MIN = 0.35
const MAX_RISE = 0.15

/** Seuils de la recherche. Les monter (sauf l’amplitude, un multiple) la rend plus sévère. */
export type BounceQuery = {
  minBounces: number
  minR2: number
  minParabola: number
  maxRestitution: number
  swingScale: number
}

export const DEFAULT_BOUNCE_QUERY: BounceQuery = {
  minBounces: MIN_BOUNCES,
  minR2: 0.55,
  minParabola: 0.7,
  maxRestitution: 0.92,
  swingScale: 1,
}

export type BouncePoint = {
  index: number
  date: string | null
  value: number
}

export type BounceEpisode = {
  id: string
  series: BounceSeriesId
  fromIndex: number
  toIndex: number
  fromDate: string | null
  toDate: string | null
  bounces: number
  restitution: number
  heightRatio: number
  r2: number
  halfLifeDraws: number
  parabola: number
  timeAgreement: number
  score: number
  envelope: BouncePoint[]
  impacts: BouncePoint[]
  apexes: BouncePoint[]
}

export type BounceCapture = {
  series: BounceSeriesId
  restitution: number
  bounces: number
  from: string | null
  to: string | null
  score: number
}

type BounceSample = { date: string } & Record<BounceSeriesId, number>

type Arch = {
  left: number
  apex: number
  right: number
  height: number
  duration: number
  chordAtApex: number
}

/** Seuil plancher : 2 points sur un numéro, 1 sur une étoile. */
export function bounceFloor(series: BounceSeriesId) {
  return series === "e1" || series === "e2" ? 1 : 2
}

export function bounceCaptureOf(episode: BounceEpisode): BounceCapture {
  return {
    series: episode.series,
    restitution: episode.restitution,
    bounces: episode.bounces,
    from: episode.fromDate,
    to: episode.toDate,
    score: episode.score,
  }
}

export function findBounces(
  input: { values: number[]; dates?: Array<string | null> | null },
  series: BounceSeriesId,
  query?: Partial<BounceQuery>
): BounceEpisode[] {
  const gates = resolveQuery(query)
  const values = input.values.map(Number)
  if (values.some((value) => !Number.isFinite(value))) return []
  const dates = alignDates(input.dates, values.length)
  const arches = bounceArches(values, series, gates.swingScale)
  const found: BounceEpisode[] = []
  const maxCount = Math.min(MAX_BOUNCES, arches.length)
  for (let count = gates.minBounces; count <= maxCount; count += 1) {
    for (let start = 0; start + count <= arches.length; start += 1) {
      const window = arches.slice(start, start + count)
      if (!archesChain(window)) continue
      const episode = scoreWindow(window, values, dates, series, gates)
      if (episode) found.push(episode)
    }
  }
  return suppressOverlaps(found)
}

export function scanBounces(points: BounceSample[], query?: Partial<BounceQuery>): BounceEpisode[] {
  const dates = points.map((point) => point.date)
  const found: BounceEpisode[] = []
  for (const series of BOUNCE_SERIES) {
    const values = points.map((point) => point[series])
    found.push(...findBounces({ values, dates }, series, query))
  }
  return found.sort(compareEpisodes)
}

function resolveQuery(query?: Partial<BounceQuery>): BounceQuery {
  const merged = { ...DEFAULT_BOUNCE_QUERY, ...query }
  return {
    minBounces: clampInt(merged.minBounces, MIN_BOUNCES, MAX_BOUNCES),
    minR2: clamp01(merged.minR2),
    minParabola: clamp01(merged.minParabola),
    maxRestitution: Math.min(0.99, Math.max(E_MIN, merged.maxRestitution)),
    swingScale: Math.min(4, Math.max(1, merged.swingScale)),
  }
}

function alignDates(dates: Array<string | null> | null | undefined, count: number) {
  if (!dates || dates.length !== count) return valuesBlank(count)
  return dates.map((date) => date ?? null)
}

function valuesBlank(count: number): Array<string | null> {
  return Array.from({ length: count }, () => null)
}

function bounceArches(values: number[], series: BounceSeriesId, swingScale: number): Arch[] {
  if (values.length < 4) return []
  const floor = bounceFloor(series)
  const adaptive = swingThreshold(values)
  const limit = Math.max(adaptive, floor) * swingScale
  const pivots = swingPivots(values, null, undefined, { threshold: limit })
  const arches: Arch[] = []
  for (let i = 0; i + 2 < pivots.length; i += 1) {
    const left = pivots[i]
    const apex = pivots[i + 1]
    const right = pivots[i + 2]
    if (!left || !apex || !right) continue
    if (left.type !== "L" || apex.type !== "H" || right.type !== "L") continue
    if (!(left.index < apex.index && apex.index < right.index)) continue
    const yLeft = values[left.index] ?? 0
    const yRight = values[right.index] ?? 0
    const yApex = values[apex.index] ?? 0
    const base = chordAt(left.index, yLeft, right.index, yRight, apex.index)
    const height = yApex - base
    if (!(height > 0)) continue
    arches.push({
      left: left.index,
      apex: apex.index,
      right: right.index,
      height,
      duration: right.index - left.index,
      chordAtApex: base,
    })
  }
  return arches
}

function archesChain(arches: Arch[]) {
  for (let i = 0; i < arches.length - 1; i += 1) {
    const current = arches[i]
    const next = arches[i + 1]
    if (!current || !next || current.right !== next.left) return false
  }
  return true
}

function scoreWindow(
  arches: Arch[],
  values: number[],
  dates: Array<string | null>,
  series: BounceSeriesId,
  gates: BounceQuery
): BounceEpisode | null {
  const heights = arches.map((arch) => arch.height)
  const checked = heightLaw(heights, gates.maxRestitution)
  if (!checked) return null
  const bounceIndex = heights.map((_, index) => index)
  const fit = logFit(bounceIndex, heights)
  if (!fit || !(fit.slope < 0) || fit.r2 < gates.minR2) return null
  const parabola = median(arches.map((arch) => parabolaScore(values, arch)))
  if (!(parabola >= gates.minParabola)) return null

  const timeAgreement = durationAgreement(
    checked.restitution,
    arches.map((arch) => arch.duration)
  )
  const score = 0.55 * fit.r2 + 0.25 * parabola + 0.2 * timeAgreement
  const first = arches[0]
  const last = arches[arches.length - 1]
  if (!first || !last) return null

  const envelope = arches.map((arch, index) =>
    pointAt(
      arch.apex,
      arch.chordAtApex + Math.exp(fit.intercept + fit.slope * index),
      dates,
      values
    )
  )
  const impacts = [
    pointAt(first.left, values[first.left] ?? 0, dates, values),
    ...arches.map((arch) => pointAt(arch.right, values[arch.right] ?? 0, dates, values)),
  ]
  const apexes = arches.map((arch) => pointAt(arch.apex, values[arch.apex] ?? 0, dates, values))
  const fromIndex = first.left
  const toIndex = last.right
  const firstHeight = heights[0] ?? 0
  const lastHeight = heights[heights.length - 1] ?? 0

  return {
    id: `${series}:${fromIndex}:${toIndex}`,
    series,
    fromIndex,
    toIndex,
    fromDate: dates[fromIndex] ?? null,
    toDate: dates[toIndex] ?? null,
    bounces: arches.length,
    restitution: checked.restitution,
    heightRatio: firstHeight > 0 ? lastHeight / firstHeight : 0,
    r2: fit.r2,
    halfLifeDraws: halfLife(arches, heights),
    parabola,
    timeAgreement,
    score,
    envelope,
    impacts,
    apexes,
  }
}

/** Hauteurs positives, au plus une remontée légère, restitution dans la bande. */
function heightLaw(heights: number[], maxRestitution: number): { restitution: number } | null {
  if (heights.some((height) => !(height > 0))) return null
  let rises = 0
  const ratios: number[] = []
  for (let i = 0; i < heights.length - 1; i += 1) {
    const prev = heights[i] ?? 0
    const next = heights[i + 1] ?? 0
    if (next > prev) {
      rises += 1
      if (rises > 1 || next >= prev * (1 + MAX_RISE)) return null
    }
    ratios.push(Math.sqrt(next / prev))
  }
  const restitution = median(ratios)
  if (restitution < E_MIN || restitution > maxRestitution) return null
  return { restitution }
}

function durationAgreement(restitution: number, durations: number[]) {
  if (durations.length < 2) return 0
  const ratios: number[] = []
  for (let i = 0; i < durations.length - 1; i += 1) {
    const prev = durations[i] ?? 0
    const next = durations[i + 1] ?? 0
    if (!(prev > 0)) return 0
    ratios.push(next / prev)
  }
  const eTau = median(ratios)
  if (!(eTau < 1)) return 0
  return clamp01(1 - Math.abs(eTau - restitution) / 0.25)
}

function halfLife(arches: Arch[], heights: number[]) {
  const origin = arches[0]?.apex ?? 0
  const xs = arches.map((arch) => arch.apex - origin)
  const fit = logFit(xs, heights)
  if (fit && fit.slope < 0) return Math.LN2 / -fit.slope
  const bounceFit = logFit(
    heights.map((_, index) => index),
    heights
  )
  if (!bounceFit || !(bounceFit.slope < 0) || arches.length < 2) return Number.POSITIVE_INFINITY
  const last = arches[arches.length - 1]
  const gap = last ? (last.apex - origin) / (arches.length - 1) : 0
  return (Math.LN2 / -bounceFit.slope) * gap
}

function parabolaScore(values: number[], arch: Arch) {
  const spanLeft = arch.apex - arch.left
  const spanRight = arch.right - arch.apex
  if (spanLeft <= 0 || spanRight <= 0) return 0
  const clear: number[] = []
  const shape: number[] = []
  for (let index = arch.left; index <= arch.right; index += 1) {
    const base = chordAt(
      arch.left,
      values[arch.left] ?? 0,
      arch.right,
      values[arch.right] ?? 0,
      index
    )
    clear.push((values[index] ?? 0) - base)
    const t =
      index <= arch.apex ? (arch.apex - index) / spanLeft : (index - arch.apex) / spanRight
    shape.push(1 - t * t)
  }
  return pearson(clear, shape)
}

function chordAt(i0: number, y0: number, i1: number, y1: number, index: number) {
  if (i1 === i0) return y0
  return y0 + ((y1 - y0) * (index - i0)) / (i1 - i0)
}

function logFit(xs: number[], heights: number[]) {
  const n = heights.length
  if (n < 2 || xs.length !== n) return null
  const ys = heights.map((height) => Math.log(height))
  if (ys.some((value) => !Number.isFinite(value))) return null
  let sx = 0
  let sy = 0
  let sxx = 0
  let sxy = 0
  for (let i = 0; i < n; i += 1) {
    const x = xs[i] ?? 0
    const y = ys[i] ?? 0
    sx += x
    sy += y
    sxx += x * x
    sxy += x * y
  }
  const den = n * sxx - sx * sx
  if (den === 0) return null
  const slope = (n * sxy - sx * sy) / den
  const intercept = (sy - slope * sx) / n
  const mean = sy / n
  let ssTot = 0
  let ssRes = 0
  for (let i = 0; i < n; i += 1) {
    const y = ys[i] ?? 0
    const predicted = intercept + slope * (xs[i] ?? 0)
    ssTot += (y - mean) ** 2
    ssRes += (y - predicted) ** 2
  }
  const r2 = ssTot <= 1e-12 ? 0 : 1 - ssRes / ssTot
  return { slope, intercept, r2 }
}

function pearson(left: number[], right: number[]) {
  const n = left.length
  if (n < 3 || right.length !== n) return 0
  let meanLeft = 0
  let meanRight = 0
  for (let i = 0; i < n; i += 1) {
    meanLeft += left[i] ?? 0
    meanRight += right[i] ?? 0
  }
  meanLeft /= n
  meanRight /= n
  let num = 0
  let denLeft = 0
  let denRight = 0
  for (let i = 0; i < n; i += 1) {
    const a = (left[i] ?? 0) - meanLeft
    const b = (right[i] ?? 0) - meanRight
    num += a * b
    denLeft += a * a
    denRight += b * b
  }
  if (denLeft <= 1e-12 || denRight <= 1e-12) return 0
  return num / Math.sqrt(denLeft * denRight)
}

function pointAt(
  index: number,
  value: number,
  dates: Array<string | null>,
  values: number[]
): BouncePoint {
  return {
    index,
    date: dates[index] ?? null,
    value: Number.isFinite(value) ? value : (values[index] ?? 0),
  }
}

function suppressOverlaps(episodes: BounceEpisode[]) {
  const sorted = [...episodes].sort(compareEpisodes)
  const kept: BounceEpisode[] = []
  for (const episode of sorted) {
    const clash = kept.some(
      (other) =>
        other.series === episode.series &&
        episode.fromIndex < other.toIndex &&
        episode.toIndex > other.fromIndex
    )
    if (!clash) kept.push(episode)
  }
  return kept.sort(compareEpisodes)
}

function compareEpisodes(a: BounceEpisode, b: BounceEpisode) {
  if (a.score !== b.score) return b.score - a.score
  if (a.series !== b.series) return a.series < b.series ? -1 : 1
  return a.fromIndex - b.fromIndex
}

function median(values: number[]) {
  if (!values.length) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 1) return sorted[mid] ?? 0
  return ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2
}

function clamp01(value: number) {
  if (!Number.isFinite(value)) return 0
  return Math.min(1, Math.max(0, value))
}

function clampInt(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min
  return Math.min(max, Math.max(min, Math.round(value)))
}
