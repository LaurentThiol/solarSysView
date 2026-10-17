/**
 * Décalage zonal sur Annuel.
 * Une suite de 3 à 10 tirages se lit comme une chaîne de sens.
 * La corrélation croisée cherche un écart en jours, zone par zone.
 * Sans alias `@/` (tests Node).
 */

import { annualBarX } from "./annual-sum"
import { seriesSigma } from "./chartisme/sense"

export const SUITE_LENGTHS = [3, 4, 5, 6, 7, 8, 9, 10] as const
export const DEFAULT_SUITE_LENGTH = 8
export const LAG_LIMIT_DAYS = 21
export const PAIR_TOLERANCE_DAYS = 3
export const NULL_PERMUTATIONS = 200

export type SuiteSense = "monte" | "baisse" | "stable"

export type SenseRun = {
  sense: SuiteSense
  length: number
}

export type LagPoint = {
  date: string
  sum: number
  month: number
  day: number
}

export type LagZone = {
  chain: SenseRun[]
  chainLabel: string
  /** Jours calendaires retenus. Null : pas de décalage retenu. */
  tau: number | null
  r0: number | null
  rTau: number | null
  nullPercentile: number | null
  kept: boolean
  fromDate: string
  toDate: string
  fromX: number
  toX: number
  startIndex: number
  endIndex: number
}

export type AnnualLagOptions = {
  length?: number
  permutations?: number
  seed?: number
}

const DAY_MS = 86_400_000

export function clampSuiteLength(length: number): number {
  const value = Math.trunc(length)
  if (value >= SUITE_LENGTHS[0] && value <= SUITE_LENGTHS[SUITE_LENGTHS.length - 1]) return value
  return DEFAULT_SUITE_LENGTH
}

/**
 * Chaîne de sens d’une suite.
 * Le premier tirage prend le sens du premier pas, chaque suivant prend le sens
 * du pas qui y arrive. Les longueurs additionnées valent donc la suite.
 * Un pas monte s’il dépasse l’écart-type, baisse s’il le dépasse vers le bas.
 */
export function suiteChain(sums: readonly number[], sigma: number): SenseRun[] {
  if (sums.length < 2 || !Number.isFinite(sigma)) return []
  const labels: SuiteSense[] = new Array(sums.length)
  labels[0] = stepSense(sums[1] - sums[0], sigma)
  for (let index = 1; index < sums.length; index += 1) {
    labels[index] = stepSense(sums[index] - sums[index - 1], sigma)
  }
  return runLength(labels)
}

export function formatChain(runs: readonly SenseRun[]): string {
  return runs.map((run) => `${run.length} ${run.sense}`).join(" + ")
}

export function formatLagDays(tau: number): string {
  if (tau > 0) return `+${tau} j`
  if (tau < 0) return `−${Math.abs(tau)} j`
  return "0 j"
}

export function lagNullPhrase(zone: { kept: boolean; tau: number | null }): string {
  if (zone.kept && zone.tau != null) return `${formatLagDays(zone.tau)} dépasse le 95e centile du nul`
  return "pas de décalage retenu"
}

/** r de Pearson. Chaque série est centrée et réduite. */
export function pearson(left: readonly number[], right: readonly number[]): number | null {
  const count = left.length
  if (count < 3 || count !== right.length) return null
  let meanLeft = 0
  let meanRight = 0
  for (let index = 0; index < count; index += 1) {
    meanLeft += left[index]
    meanRight += right[index]
  }
  meanLeft /= count
  meanRight /= count
  let product = 0
  let leftSquare = 0
  let rightSquare = 0
  for (let index = 0; index < count; index += 1) {
    const a = left[index] - meanLeft
    const b = right[index] - meanRight
    product += a * b
    leftSquare += a * a
    rightSquare += b * b
  }
  if (leftSquare === 0 || rightSquare === 0) return null
  const value = product / Math.sqrt(leftSquare * rightSquare)
  return Number.isFinite(value) ? value : null
}

export function pairSuiteIndices(
  suite: readonly LagPoint[],
  older: readonly LagPoint[],
  tau: number,
  toleranceDays = PAIR_TOLERANCE_DAYS
): number[] | null {
  if (suite.length === 0 || older.length === 0) return null
  const year = Number(older[0].date.slice(0, 4))
  const utc = older.map((point) => dateUtc(point.date))
  return pairIndices(suite, utc, year, tau, toleranceDays)
}

export function annualLagZones(
  newer: readonly LagPoint[],
  older: readonly LagPoint[],
  options: AnnualLagOptions = {}
): LagZone[] {
  const length = clampSuiteLength(options.length ?? DEFAULT_SUITE_LENGTH)
  const permutations = Math.max(1, Math.trunc(options.permutations ?? NULL_PERMUTATIONS))
  const seed = options.seed ?? 1
  const left = normalize(newer)
  const right = normalize(older)
  if (left.length < length || right.length < length) return []

  const leftSigma = seriesSigma(left.map((point) => point.sum))
  const rightSigma = seriesSigma(right.map((point) => point.sum))
  const shared = sharedMonths(left, right)
  const rightYear = Number(right[0].date.slice(0, 4))
  const rightUtc = right.map((point) => dateUtc(point.date))
  const rightValues = right.map((point) => point.sum)
  const hits: LagZone[] = []

  for (let start = 0; start + length <= left.length; start += 1) {
    const suite = left.slice(start, start + length)
    if (!suite.every((point) => shared.has(point.month))) continue
    const sums = suite.map((point) => point.sum)
    const chain = suiteChain(sums, leftSigma)
    const chainLabel = formatChain(chain)
    const aligned = pairIndices(suite, rightUtc, rightYear, 0, PAIR_TOLERANCE_DAYS)
    const r0 = aligned ? pearson(sums, aligned.map((index) => rightValues[index])) : null
    const bar = r0 == null ? 0 : Math.abs(r0)
    let best: { tau: number; r: number; percentile: number } | null = null

    for (let tau = -LAG_LIMIT_DAYS; tau <= LAG_LIMIT_DAYS; tau += 1) {
      if (tau === 0) continue
      const paired = pairIndices(suite, rightUtc, rightYear, tau, PAIR_TOLERANCE_DAYS)
      if (!paired) continue
      const otherSums = paired.map((index) => rightValues[index])
      if (formatChain(suiteChain(otherSums, rightSigma)) !== chainLabel) continue
      const correlation = pearson(sums, otherSums)
      if (correlation == null || !(Math.abs(correlation) > bar)) continue
      const percentile = nullAbsPercentile(
        sums,
        rightValues,
        paired,
        permutations,
        mixSeed(seed, suite[0].date, tau, length)
      )
      if (!(Math.abs(correlation) > percentile)) continue
      const next = { tau, r: correlation, percentile }
      if (!best || prefers(next, best)) best = next
    }

    if (!best && r0 == null) continue
    const end = start + length - 1
    hits.push({
      chain,
      chainLabel,
      tau: best?.tau ?? null,
      r0,
      rTau: best?.r ?? null,
      nullPercentile: best?.percentile ?? null,
      kept: best != null,
      fromDate: suite[0].date,
      toDate: suite[suite.length - 1].date,
      fromX: annualBarX(suite[0].month, suite[0].day),
      toX: annualBarX(suite[suite.length - 1].month, suite[suite.length - 1].day),
      startIndex: start,
      endIndex: end,
    })
  }

  return collapseLagZones(hits)
}

/** Suites qui se chevauchent, même chaîne et même τ, deviennent une zone. */
export function collapseLagZones(zones: readonly LagZone[]): LagZone[] {
  return [
    ...collapseGroup(
      zones.filter((zone) => zone.kept),
      true
    ),
    ...collapseGroup(
      zones.filter((zone) => !zone.kept),
      false
    ),
  ]
}

function collapseGroup(zones: readonly LagZone[], byTau: boolean): LagZone[] {
  const sorted = [...zones].sort(
    (a, b) => a.startIndex - b.startIndex || a.endIndex - b.endIndex
  )
  const out: LagZone[] = []
  for (const zone of sorted) {
    const last = out[out.length - 1]
    if (
      last &&
      zone.startIndex <= last.endIndex &&
      zone.chainLabel === last.chainLabel &&
      (!byTau || zone.tau === last.tau)
    ) {
      out[out.length - 1] = absorb(last, zone)
    } else {
      out.push(cloneZone(zone))
    }
  }
  return out
}

function absorb(into: LagZone, hit: LagZone): LagZone {
  const intoScore = into.kept ? Math.abs(into.rTau ?? 0) : Math.abs(into.r0 ?? 0)
  const hitScore = hit.kept ? Math.abs(hit.rTau ?? 0) : Math.abs(hit.r0 ?? 0)
  const base = hitScore > intoScore ? hit : into
  const start = into.startIndex <= hit.startIndex ? into : hit
  const end = into.endIndex >= hit.endIndex ? into : hit
  return {
    ...cloneZone(base),
    fromDate: start.fromDate,
    toDate: end.toDate,
    fromX: Math.min(into.fromX, hit.fromX),
    toX: Math.max(into.toX, hit.toX),
    startIndex: Math.min(into.startIndex, hit.startIndex),
    endIndex: Math.max(into.endIndex, hit.endIndex),
  }
}

function cloneZone(zone: LagZone): LagZone {
  return { ...zone, chain: zone.chain.map((run) => ({ ...run })) }
}

function prefers(
  next: { tau: number; r: number },
  best: { tau: number; r: number }
): boolean {
  const delta = Math.abs(next.r) - Math.abs(best.r)
  if (delta > 1e-9) return true
  if (delta < -1e-9) return false
  const reach = Math.abs(next.tau) - Math.abs(best.tau)
  if (reach !== 0) return reach < 0
  return next.tau < best.tau
}

function pairIndices(
  suite: readonly LagPoint[],
  olderUtc: readonly number[],
  year: number,
  tau: number,
  toleranceDays: number
): number[] | null {
  const tolerance = toleranceDays * DAY_MS
  const indices: number[] = []
  let previous = -1
  for (const point of suite) {
    const target = targetUtc(point, tau, year)
    const index = nearestIndex(olderUtc, target, tolerance)
    if (index == null || index <= previous) return null
    indices.push(index)
    previous = index
  }
  return indices
}

function nearestIndex(utc: readonly number[], target: number, tolerance: number): number | null {
  let lo = 0
  let hi = utc.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (utc[mid] < target) lo = mid + 1
    else hi = mid
  }
  let best = -1
  let bestDist = tolerance + 1
  for (const index of [lo - 1, lo]) {
    if (index < 0 || index >= utc.length) continue
    const dist = Math.abs(utc[index] - target)
    if (dist < bestDist || (dist === bestDist && (best < 0 || index < best))) {
      best = index
      bestDist = dist
    }
  }
  if (best < 0 || bestDist > tolerance) return null
  return best
}

function targetUtc(point: LagPoint, tau: number, year: number): number {
  const shifted = new Date(dateUtc(point.date) + tau * DAY_MS)
  return Date.UTC(year, shifted.getUTCMonth(), shifted.getUTCDate())
}

function nullAbsPercentile(
  sums: readonly number[],
  olderValues: readonly number[],
  indices: readonly number[],
  permutations: number,
  seed: number
): number {
  const rng = mulberry32(seed)
  const absolute: number[] = []
  const copy = olderValues.slice()
  for (let draw = 0; draw < permutations; draw += 1) {
    fisherYates(copy, rng)
    const paired = indices.map((index) => copy[index])
    const correlation = pearson(sums, paired)
    if (correlation != null) absolute.push(Math.abs(correlation))
  }
  if (absolute.length === 0) return Number.POSITIVE_INFINITY
  absolute.sort((a, b) => a - b)
  const rank = Math.min(absolute.length - 1, Math.max(0, Math.ceil(0.95 * absolute.length) - 1))
  return absolute[rank]
}

function fisherYates(values: number[], rng: () => number) {
  for (let index = values.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(rng() * (index + 1))
    const held = values[index]
    values[index] = values[swap]
    values[swap] = held
  }
}

function mulberry32(seed: number) {
  let state = seed >>> 0
  if (state === 0) state = 1
  return function next() {
    state = (state + 0x6d2b79f5) | 0
    let value = Math.imul(state ^ (state >>> 15), 1 | state)
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296
  }
}

function mixSeed(seed: number, date: string, tau: number, length: number): number {
  let hash = (seed >>> 0) || 1
  const text = `${date}|${tau}|${length}`
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function stepSense(delta: number, sigma: number): SuiteSense {
  if (delta > sigma) return "monte"
  if (delta < -sigma) return "baisse"
  return "stable"
}

function runLength(labels: readonly SuiteSense[]): SenseRun[] {
  const runs: SenseRun[] = []
  for (const sense of labels) {
    const last = runs[runs.length - 1]
    if (last && last.sense === sense) last.length += 1
    else runs.push({ sense, length: 1 })
  }
  return runs
}

function sharedMonths(left: readonly LagPoint[], right: readonly LagPoint[]): Set<number> {
  const older = new Set(right.map((point) => point.month))
  const shared = new Set<number>()
  for (const point of left) {
    if (older.has(point.month)) shared.add(point.month)
  }
  return shared
}

function normalize(points: readonly LagPoint[]): LagPoint[] {
  const byDate = new Map<string, LagPoint>()
  for (const point of points) {
    if (!point.date || !Number.isFinite(point.sum)) continue
    byDate.set(point.date.slice(0, 10), {
      date: point.date.slice(0, 10),
      sum: point.sum,
      month: point.month,
      day: point.day,
    })
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date))
}

function dateUtc(date: string): number {
  return Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10)))
}
