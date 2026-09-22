/** Dispersion et contraste mardi / vendredi sur la fenêtre déjà choisie. */

import { numbersSum } from "./gains.ts"
import { consecutiveCount, spreadOf } from "./grid-shape.ts"
import { filterDrawsByWeekday } from "./weekday-scope.ts"

const NUMBER_POOL = 50
const NUMBER_DRAW = 5
/** Variance de population de {1,…,50} : (N² − 1) / 12. */
const NUMBER_POPULATION_VARIANCE = (NUMBER_POOL ** 2 - 1) / 12

/**
 * Écart type de la somme de 5 numéros distincts parmi 1–50.
 * n · σ² · (N − n) / (N − 1).
 */
export const NUMBER_SUM_SD = Math.sqrt(
  (NUMBER_DRAW * NUMBER_POPULATION_VARIANCE * (NUMBER_POOL - NUMBER_DRAW)) / (NUMBER_POOL - 1)
)

/** Premier effectif d’un soir inclus dans l’écart type cumulé. */
export const RUNNING_SUM_STD_FROM = 8

const BALL_POOL = 50
const LOW_EXPECTED = 5

const LANCZOS = [
  0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313,
  -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6,
  1.5056327351493116e-7,
]

export type DivergenceDraw = {
  date: string
  weekday?: string
  numbers: number[]
  stars: number[]
  star_pool?: number
}

export type DivergenceAxisId =
  | "sum"
  | "spread"
  | "parity"
  | "consecutive"
  | "n1"
  | "n5"
  | "star_sum"
  | "star_spread"

export type DivergenceMoments = {
  n: number
  mean: number | null
  std: number | null
  cv: number | null
}

export type DivergenceAxis = {
  id: DivergenceAxisId
  label: string
  mardi: DivergenceMoments
  vendredi: DivergenceMoments
  delta: number | null
  cohenD: number | null
  welchSe: number | null
  welchDf: number | null
  welchT: number | null
  welchP: number | null
  ciLow: number | null
  ciHigh: number | null
  varianceRatio: number | null
  brownForsytheF: number | null
  brownForsytheP: number | null
}

export type RunningSumStdPoint = {
  k: number
  mardi: number | null
  vendredi: number | null
  distanceMardi: number | null
  distanceVendredi: number | null
}

export type BallDivergence = {
  totalVariation: number | null
  chiSquare: number | null
  df: number | null
  lowCount: boolean
}

export type WeekdayDivergence = {
  starPoolBreak: boolean
  axes: DivergenceAxis[]
  runningSumStd: RunningSumStdPoint[]
  balls: BallDivergence
}

const MECHANICAL_AXES: Array<{ id: DivergenceAxisId; label: string }> = [
  { id: "sum", label: "Somme" },
  { id: "spread", label: "Étendue" },
  { id: "parity", label: "Pairs" },
  { id: "consecutive", label: "Consécutifs" },
  { id: "n1", label: "Plus petit" },
  { id: "n5", label: "Plus grand" },
]

const STAR_AXES: Array<{ id: DivergenceAxisId; label: string }> = [
  { id: "star_sum", label: "Somme étoiles" },
  { id: "star_spread", label: "Écart étoiles" },
]

function lgamma(z: number): number {
  if (z < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * z)) - lgamma(1 - z)
  let x = LANCZOS[0]
  const shifted = z - 1
  for (let i = 1; i < LANCZOS.length; i += 1) x += LANCZOS[i] / (shifted + i)
  const t = shifted + 7.5
  return 0.5 * Math.log(2 * Math.PI) + (shifted + 0.5) * Math.log(t) - t + Math.log(x)
}

function betaContinuedFraction(a: number, b: number, x: number): number {
  const maxIter = 200
  const eps = 3e-14
  const fpmin = 1e-30
  const qab = a + b
  const qap = a + 1
  const qam = a - 1
  let c = 1
  let d = 1 - (qab * x) / qap
  if (Math.abs(d) < fpmin) d = fpmin
  d = 1 / d
  let h = d
  for (let m = 1; m <= maxIter; m += 1) {
    const m2 = 2 * m
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2))
    d = 1 + aa * d
    if (Math.abs(d) < fpmin) d = fpmin
    c = 1 + aa / c
    if (Math.abs(c) < fpmin) c = fpmin
    d = 1 / d
    h *= d * c
    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2))
    d = 1 + aa * d
    if (Math.abs(d) < fpmin) d = fpmin
    c = 1 + aa / c
    if (Math.abs(c) < fpmin) c = fpmin
    d = 1 / d
    const del = d * c
    h *= del
    if (Math.abs(del - 1) < eps) break
  }
  return h
}

/** Bêta incomplète régularisée I_x(a, b). */
function regularizedBeta(a: number, b: number, x: number): number {
  if (x <= 0) return 0
  if (x >= 1) return 1
  const logBt = lgamma(a + b) - lgamma(a) - lgamma(b) + a * Math.log(x) + b * Math.log(1 - x)
  if (!Number.isFinite(logBt)) return x < (a + 1) / (a + b + 2) ? 0 : 1
  const bt = Math.exp(logBt)
  if (x < (a + 1) / (a + b + 2)) return (bt * betaContinuedFraction(a, b, x)) / a
  return 1 - (bt * betaContinuedFraction(b, a, 1 - x)) / b
}

function clamp01(value: number): number {
  if (value < 0) return 0
  if (value > 1) return 1
  return value
}

function studentTwoSided(t: number, df: number): number {
  if (!(df > 0) || !Number.isFinite(t)) return Number.NaN
  const x = df / (df + t * t)
  return clamp01(regularizedBeta(df / 2, 0.5, x))
}

function studentCritical(df: number, alpha = 0.05): number {
  let lo = 0
  let hi = 1
  while (studentTwoSided(hi, df) > alpha && hi < 1e6) hi *= 2
  for (let i = 0; i < 60; i += 1) {
    const mid = (lo + hi) / 2
    if (studentTwoSided(mid, df) > alpha) lo = mid
    else hi = mid
  }
  return (lo + hi) / 2
}

function fisherSurvival(f: number, d1: number, d2: number): number {
  if (!(f >= 0) || !(d1 > 0) || !(d2 > 0)) return Number.NaN
  if (f === 0) return 1
  if (!Number.isFinite(f)) return 0
  const x = d2 / (d2 + d1 * f)
  return clamp01(regularizedBeta(d2 / 2, d1 / 2, x))
}

function mean(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function sampleVariance(values: number[]): number {
  if (values.length < 2) return 0
  const mu = mean(values)
  return values.reduce((sum, value) => sum + (value - mu) ** 2, 0) / (values.length - 1)
}

function sampleStd(values: number[]): number {
  return Math.sqrt(sampleVariance(values))
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 1) return sorted[mid]
  return (sorted[mid - 1] + sorted[mid]) / 2
}

function momentsOf(values: number[]): DivergenceMoments {
  if (!values.length) return { n: 0, mean: null, std: null, cv: null }
  const mu = mean(values)
  if (values.length < 2) return { n: values.length, mean: mu, std: null, cv: null }
  const sigma = sampleStd(values)
  return {
    n: values.length,
    mean: mu,
    std: sigma,
    cv: mu === 0 ? null : sigma / Math.abs(mu),
  }
}

function contrastOf(a: number[], b: number[]) {
  const empty = {
    delta: null as number | null,
    cohenD: null as number | null,
    welchSe: null as number | null,
    welchDf: null as number | null,
    welchT: null as number | null,
    welchP: null as number | null,
    ciLow: null as number | null,
    ciHigh: null as number | null,
    varianceRatio: null as number | null,
    brownForsytheF: null as number | null,
    brownForsytheP: null as number | null,
  }
  if (a.length < 2 || b.length < 2) return empty
  const nA = a.length
  const nB = b.length
  const meanA = mean(a)
  const meanB = mean(b)
  const varA = sampleVariance(a)
  const varB = sampleVariance(b)
  const delta = meanA - meanB
  const se2 = varA / nA + varB / nB
  const se = Math.sqrt(se2)
  const dfPool = nA + nB - 2
  const pooledVar = dfPool > 0 ? ((nA - 1) * varA + (nB - 1) * varB) / dfPool : 0
  const pooledSd = Math.sqrt(pooledVar)
  const cohenD = pooledSd === 0 ? (delta === 0 ? 0 : null) : delta / pooledSd
  const varianceRatio = varB === 0 ? null : varA / varB
  const brown = brownForsythe(a, b)
  if (se === 0) {
    const same = delta === 0
    return {
      delta,
      cohenD,
      welchSe: 0,
      welchDf: null,
      welchT: same ? 0 : null,
      welchP: same ? 1 : 0,
      ciLow: delta,
      ciHigh: delta,
      varianceRatio,
      ...brown,
    }
  }
  const df = se2 ** 2 / ((varA / nA) ** 2 / (nA - 1) + (varB / nB) ** 2 / (nB - 1))
  const t = delta / se
  const p = studentTwoSided(t, df)
  const crit = studentCritical(df)
  return {
    delta,
    cohenD,
    welchSe: se,
    welchDf: df,
    welchT: t,
    welchP: p,
    ciLow: delta - crit * se,
    ciHigh: delta + crit * se,
    varianceRatio,
    ...brown,
  }
}

function brownForsythe(a: number[], b: number[]) {
  const devA = a.map((value) => Math.abs(value - median(a)))
  const devB = b.map((value) => Math.abs(value - median(b)))
  const meanA = mean(devA)
  const meanB = mean(devB)
  const grand = (meanA * devA.length + meanB * devB.length) / (devA.length + devB.length)
  const ssb = devA.length * (meanA - grand) ** 2 + devB.length * (meanB - grand) ** 2
  const ssw =
    devA.reduce((sum, value) => sum + (value - meanA) ** 2, 0) +
    devB.reduce((sum, value) => sum + (value - meanB) ** 2, 0)
  const dfw = devA.length + devB.length - 2
  if (dfw <= 0) return { brownForsytheF: null, brownForsytheP: null }
  if (ssw === 0) {
    if (ssb === 0) return { brownForsytheF: 0, brownForsytheP: 1 }
    return { brownForsytheF: Number.POSITIVE_INFINITY, brownForsytheP: 0 }
  }
  const f = ssb / (ssw / dfw)
  return { brownForsytheF: f, brownForsytheP: fisherSurvival(f, 1, dfw) }
}

function evenCount(values: number[]) {
  let count = 0
  for (const value of values) if (value % 2 === 0) count += 1
  return count
}

function axisValue(draw: DivergenceDraw, id: DivergenceAxisId): number {
  if (id === "star_sum") return numbersSum(draw.stars)
  if (id === "star_spread") return spreadOf(draw.stars)
  const numbers = draw.numbers
  if (id === "sum") return numbersSum(numbers)
  if (id === "spread") return spreadOf(numbers)
  if (id === "parity") return evenCount(numbers)
  if (id === "consecutive") return consecutiveCount(numbers)
  if (!numbers.length) return 0
  let min = numbers[0]
  let max = numbers[0]
  for (let i = 1; i < numbers.length; i += 1) {
    const value = numbers[i]
    if (value < min) min = value
    if (value > max) max = value
  }
  return id === "n1" ? min : max
}

function byDate<T extends { date: string }>(draws: T[]): T[] {
  return [...draws].sort((a, b) => a.date.localeCompare(b.date))
}

function starPoolBreak(draws: DivergenceDraw[]): boolean {
  const pools = new Set<number>()
  for (const draw of draws) {
    if (draw.star_pool == null || !Number.isFinite(draw.star_pool)) continue
    pools.add(draw.star_pool)
  }
  return pools.size > 1
}

function runningSumStd(mardi: number[], vendredi: number[]): RunningSumStdPoint[] {
  const last = Math.max(mardi.length, vendredi.length)
  const points: RunningSumStdPoint[] = []
  for (let k = RUNNING_SUM_STD_FROM; k <= last; k += 1) {
    const left = k <= mardi.length ? sampleStd(mardi.slice(0, k)) : null
    const right = k <= vendredi.length ? sampleStd(vendredi.slice(0, k)) : null
    points.push({
      k,
      mardi: left,
      vendredi: right,
      distanceMardi: left == null ? null : Math.abs(left - NUMBER_SUM_SD),
      distanceVendredi: right == null ? null : Math.abs(right - NUMBER_SUM_SD),
    })
  }
  return points
}

function ballDivergence(mardi: DivergenceDraw[], vendredi: DivergenceDraw[]): BallDivergence {
  const countM = Array.from({ length: BALL_POOL + 1 }, () => 0)
  const countV = Array.from({ length: BALL_POOL + 1 }, () => 0)
  let slotsM = 0
  let slotsV = 0
  for (const draw of mardi) {
    for (const value of draw.numbers) {
      if (value < 1 || value > BALL_POOL) continue
      countM[value] += 1
      slotsM += 1
    }
  }
  for (const draw of vendredi) {
    for (const value of draw.numbers) {
      if (value < 1 || value > BALL_POOL) continue
      countV[value] += 1
      slotsV += 1
    }
  }
  if (!slotsM || !slotsV) {
    return { totalVariation: null, chiSquare: null, df: null, lowCount: true }
  }
  let variation = 0
  let chi = 0
  let used = 0
  let minExpected = Number.POSITIVE_INFINITY
  const slots = slotsM + slotsV
  for (let ball = 1; ball <= BALL_POOL; ball += 1) {
    variation += Math.abs(countM[ball] / slotsM - countV[ball] / slotsV)
    const total = countM[ball] + countV[ball]
    if (!total) continue
    const expM = (total * slotsM) / slots
    const expV = (total * slotsV) / slots
    used += 1
    minExpected = Math.min(minExpected, expM, expV)
    if (expM) chi += (countM[ball] - expM) ** 2 / expM
    if (expV) chi += (countV[ball] - expV) ** 2 / expV
  }
  const df = used - 1
  const uniformLow = slotsM / BALL_POOL < LOW_EXPECTED || slotsV / BALL_POOL < LOW_EXPECTED
  return {
    totalVariation: variation / 2,
    chiSquare: df >= 1 ? chi : null,
    df: df >= 1 ? df : null,
    lowCount: uniformLow || minExpected < LOW_EXPECTED,
  }
}

function packAxis(
  id: DivergenceAxisId,
  label: string,
  mardiDraws: DivergenceDraw[],
  vendrediDraws: DivergenceDraw[]
): DivergenceAxis {
  const mardiValues = mardiDraws.map((draw) => axisValue(draw, id))
  const vendrediValues = vendrediDraws.map((draw) => axisValue(draw, id))
  return {
    id,
    label,
    mardi: momentsOf(mardiValues),
    vendredi: momentsOf(vendrediValues),
    ...contrastOf(mardiValues, vendrediValues),
  }
}

export function weekdayDivergence(draws: DivergenceDraw[]): WeekdayDivergence {
  const mardi = byDate(filterDrawsByWeekday(draws, "mardi"))
  const vendredi = byDate(filterDrawsByWeekday(draws, "vendredi"))
  const compared = [...mardi, ...vendredi]
  const breakPools = starPoolBreak(compared)
  const axes = MECHANICAL_AXES.map((axis) => packAxis(axis.id, axis.label, mardi, vendredi))
  if (!breakPools) {
    for (const axis of STAR_AXES) axes.push(packAxis(axis.id, axis.label, mardi, vendredi))
  }
  return {
    starPoolBreak: breakPools,
    axes,
    runningSumStd: runningSumStd(
      mardi.map((draw) => axisValue(draw, "sum")),
      vendredi.map((draw) => axisValue(draw, "sum"))
    ),
    balls: ballDivergence(mardi, vendredi),
  }
}
