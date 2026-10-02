/**
 * pronosticNext — grilles 5 numéros filtrées par curseurs,
 * classées par une lecture reverse des tirages 20 / 50 / 100 / 200.
 *
 * Poids d’un tirage : le plus récent pèse n, le plus ancien pèse 1
 * (même rang que Couple). Chaque horizon distinct vote une fois.
 * La chance est la part de la grille parmi les solutions retenues,
 * pas la loi uniforme du tirage officiel.
 */

import { DECADE_LABELS } from "@/lib/grid-shape"
import { coupleRankWeight } from "@/lib/next/couple"

export const REVERSE_HORIZONS = [20, 50, 100, 200] as const
export type ReverseHorizon = (typeof REVERSE_HORIZONS)[number]

export const BALL_MIN = 1
export const BALL_MAX = 50
export const NUMBER_DRAW = 5
export const SUM_MIN = 15
export const SUM_MAX = 240
export const EVEN_MIN = 0
export const EVEN_MAX = 5
export const DECADE_COUNT = 5
export const DECADE_PER_MIN = 0
export const DECADE_PER_MAX = 5

export const NUMBER_UNIVERSE = 2_118_760
export const PRONOSTIC_LIST_LIMIT = 30

export const UNIFORM_BALL = NUMBER_DRAW / BALL_MAX
export const UNIFORM_PAIR = 10 / 1225
export const UNIFORM_TRIPLE = 10 / 19600
export const TRIPLE_COUNT = 19600

/** Pseudo-tirages du lissage. Une absence reste un écart fini, pas un zéro. */
export const BALL_KAPPA = 1
export const PAIR_KAPPA = 2
export const TRIPLE_KAPPA = 8

const PAIR_STRIDE = BALL_MAX + 1
const INV5 = 1 / NUMBER_DRAW
const INV10 = 0.1
const INV3 = 1 / 3

const COMB3 = new Int32Array(BALL_MAX + 1)
const DECADE_OF = new Uint8Array(BALL_MAX + 1)
const IS_EVEN = new Uint8Array(BALL_MAX + 1)

for (let n = 0; n <= BALL_MAX; n += 1) {
  COMB3[n] = n < 3 ? 0 : (n * (n - 1) * (n - 2)) / 6
  if (n >= 1) {
    DECADE_OF[n] = Math.floor((n - 1) / 10)
    IS_EVEN[n] = (n & 1) === 0 ? 1 : 0
  }
}

/** Rang combinatoire d’un triple 1 ≤ a < b < c ≤ 50, dans [0, 19599]. */
export function tripleIndex(a: number, b: number, c: number): number {
  const y = b - 1
  return COMB3[c - 1] + ((y * (y - 1)) >> 1) + (a - 1)
}

export function slotBounds(index: number): { min: number; max: number } {
  const i = Math.min(NUMBER_DRAW - 1, Math.max(0, index))
  return { min: i + 1, max: BALL_MAX - (NUMBER_DRAW - 1 - i) }
}

export type ClosedBand = { min: number; max: number }

export type PronosticFilters = {
  sum: ClosedBand | null
  even: ClosedBand | null
  decades: Array<ClosedBand | null>
  slots: Array<ClosedBand | null>
}

export type ReverseDraw = {
  date: string
  numbers: readonly number[]
}

export type ScoreParts = {
  ball: number
  couple: number
  triple: number
  score: number
}

export type HorizonObservation = {
  horizon: ReverseHorizon
  drawCount: number
  blended: boolean
  newest: string | null
  oldest: string | null
  meanSum: number | null
  meanEven: number | null
  meanDecade: number[] | null
  meanSlot: number[] | null
}

export type ReverseModel = {
  horizons: HorizonObservation[]
  uniform: boolean
  ballLog: Float64Array
  pairLog: Float64Array
  tripleLog: Float64Array
}

export type PronosticSolution = {
  numbers: [number, number, number, number, number]
  score: number
  chance: number
  /** chance × nombre de solutions. 1 = part égale. */
  lift: number
  ball: number
  couple: number
  triple: number
}

export type PronosticResult = {
  count: number
  universe: number
  listed: PronosticSolution[]
  chanceMassListed: number
  /** Index 1–50 : probabilité que la grille tirée selon les chances contienne le numéro. */
  marginal: number[]
  horizons: HorizonObservation[]
  uniform: boolean
  active: string[]
}

type PreparedDraw = { date: string; numbers: number[] }

type WindowStats = {
  W: number
  ball: Float64Array
  pair: Float64Array
  triple: Float64Array
  meanSum: number
  meanEven: number
  meanDecade: number[]
  meanSlot: number[]
}

function clampInt(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min
  return Math.min(max, Math.max(min, Math.round(value)))
}

function orderBand(band: ClosedBand, absMin: number, absMax: number): ClosedBand | null {
  const min = clampInt(Math.min(band.min, band.max), absMin, absMax)
  const max = clampInt(Math.max(band.min, band.max), absMin, absMax)
  if (min <= absMin && max >= absMax) return null
  return { min, max }
}

export function emptyFilters(): PronosticFilters {
  return {
    sum: null,
    even: null,
    decades: [null, null, null, null, null],
    slots: [null, null, null, null, null],
  }
}

export function canonicalizeFilters(input: PronosticFilters): PronosticFilters {
  const decades = Array.from({ length: DECADE_COUNT }, (_, index) => {
    const band = input.decades[index]
    return band ? orderBand(band, DECADE_PER_MIN, DECADE_PER_MAX) : null
  })
  const slots = Array.from({ length: NUMBER_DRAW }, (_, index) => {
    const band = input.slots[index]
    const theo = slotBounds(index)
    return band ? orderBand(band, theo.min, theo.max) : null
  })
  return {
    sum: input.sum ? orderBand(input.sum, SUM_MIN, SUM_MAX) : null,
    even: input.even ? orderBand(input.even, EVEN_MIN, EVEN_MAX) : null,
    decades,
    slots,
  }
}

function bandLabel(band: ClosedBand) {
  return band.min === band.max ? String(band.min) : `${band.min}–${band.max}`
}

export function describeFilters(filters: PronosticFilters): string[] {
  const active: string[] = []
  const spec = canonicalizeFilters(filters)
  if (spec.sum) active.push(`Total ${bandLabel(spec.sum)}`)
  if (spec.even) {
    const minOdd = NUMBER_DRAW - spec.even.max
    const maxOdd = NUMBER_DRAW - spec.even.min
    const pairs = spec.even.min === spec.even.max ? `${spec.even.min} pairs` : `${bandLabel(spec.even)} pairs`
    const odds = minOdd === maxOdd ? `${minOdd} impairs` : `${minOdd}–${maxOdd} impairs`
    active.push(`${pairs} · ${odds}`)
  }
  spec.decades.forEach((band, index) => {
    if (band) active.push(`${DECADE_LABELS[index]} : ${bandLabel(band)}`)
  })
  spec.slots.forEach((band, index) => {
    if (band) active.push(`n${index + 1} ${bandLabel(band)}`)
  })
  return active
}

function validNumbers(numbers: readonly number[] | undefined): number[] | null {
  if (!numbers || numbers.length !== NUMBER_DRAW) return null
  const seen = new Set<number>()
  const out: number[] = []
  for (const value of numbers) {
    if (!Number.isInteger(value) || value < BALL_MIN || value > BALL_MAX || seen.has(value)) return null
    seen.add(value)
    out.push(value)
  }
  out.sort((left, right) => left - right)
  return out
}

function prepareDraws(draws: readonly ReverseDraw[]): PreparedDraw[] {
  return draws
    .map((draw, index) => ({ draw, index }))
    .sort((left, right) => right.draw.date.localeCompare(left.draw.date) || left.index - right.index)
    .map((item) => {
      const numbers = validNumbers(item.draw.numbers)
      return numbers ? { date: item.draw.date, numbers } : null
    })
    .filter((item): item is PreparedDraw => item != null)
}

function windowStats(draws: readonly PreparedDraw[]): WindowStats {
  const n = draws.length
  const W = (n * (n + 1)) / 2
  const ball = new Float64Array(PAIR_STRIDE)
  const pair = new Float64Array(PAIR_STRIDE * PAIR_STRIDE)
  const triple = new Float64Array(TRIPLE_COUNT)
  let sumW = 0
  let evenW = 0
  const decadeW = [0, 0, 0, 0, 0]
  const slotW = [0, 0, 0, 0, 0]
  for (let rank = 0; rank < n; rank += 1) {
    const weight = coupleRankWeight(rank, n)
    const nums = draws[rank].numbers
    let sum = 0
    let even = 0
    for (let i = 0; i < NUMBER_DRAW; i += 1) {
      const value = nums[i]
      sum += value
      even += IS_EVEN[value]
      decadeW[DECADE_OF[value]] += weight
      slotW[i] += weight * value
      ball[value] += weight
    }
    sumW += weight * sum
    evenW += weight * even
    for (let i = 0; i < NUMBER_DRAW; i += 1) {
      for (let j = i + 1; j < NUMBER_DRAW; j += 1) {
        pair[nums[i] * PAIR_STRIDE + nums[j]] += weight
        for (let k = j + 1; k < NUMBER_DRAW; k += 1) {
          triple[tripleIndex(nums[i], nums[j], nums[k])] += weight
        }
      }
    }
  }
  const inv = W > 0 ? 1 / W : 0
  return {
    W,
    ball,
    pair,
    triple,
    meanSum: sumW * inv,
    meanEven: evenW * inv,
    meanDecade: decadeW.map((value) => value * inv),
    meanSlot: slotW.map((value) => value * inv),
  }
}

function addLift(target: Float64Array, hits: Float64Array, uniform: number, kappa: number, weight: number) {
  const denom = weight + kappa
  const prior = kappa * uniform
  const scale = 1 / uniform
  for (let i = 0; i < hits.length; i += 1) {
    target[i] += Math.log(((hits[i] + prior) / denom) * scale)
  }
}

function scaleAll(target: Float64Array, factor: number) {
  for (let i = 0; i < target.length; i += 1) target[i] *= factor
}

export function buildReverseModel(draws: readonly ReverseDraw[]): ReverseModel {
  const prepared = prepareDraws(draws)
  const ballLog = new Float64Array(PAIR_STRIDE)
  const pairLog = new Float64Array(PAIR_STRIDE * PAIR_STRIDE)
  const tripleLog = new Float64Array(TRIPLE_COUNT)
  const cache = new Map<number, WindowStats>()
  const seen = new Set<number>()
  let blend = 0
  const horizons: HorizonObservation[] = []

  for (const horizon of REVERSE_HORIZONS) {
    const drawCount = Math.min(horizon, prepared.length)
    const blended = drawCount > 0 && !seen.has(drawCount)
    if (drawCount > 0) seen.add(drawCount)
    if (drawCount === 0) {
      horizons.push({
        horizon,
        drawCount: 0,
        blended: false,
        newest: null,
        oldest: null,
        meanSum: null,
        meanEven: null,
        meanDecade: null,
        meanSlot: null,
      })
      continue
    }
    let stats = cache.get(drawCount)
    if (!stats) {
      stats = windowStats(prepared.slice(0, drawCount))
      cache.set(drawCount, stats)
    }
    if (blended) {
      blend += 1
      addLift(ballLog, stats.ball, UNIFORM_BALL, BALL_KAPPA, stats.W)
      addLift(pairLog, stats.pair, UNIFORM_PAIR, PAIR_KAPPA, stats.W)
      addLift(tripleLog, stats.triple, UNIFORM_TRIPLE, TRIPLE_KAPPA, stats.W)
    }
    horizons.push({
      horizon,
      drawCount,
      blended,
      newest: prepared[0]?.date ?? null,
      oldest: prepared[drawCount - 1]?.date ?? null,
      meanSum: stats.meanSum,
      meanEven: stats.meanEven,
      meanDecade: stats.meanDecade,
      meanSlot: stats.meanSlot,
    })
  }

  if (blend > 1) {
    const factor = 1 / blend
    scaleAll(ballLog, factor)
    scaleAll(pairLog, factor)
    scaleAll(tripleLog, factor)
  }

  return {
    horizons,
    uniform: blend === 0,
    ballLog,
    pairLog,
    tripleLog,
  }
}

export function modelSignature(model: ReverseModel): string {
  return model.horizons
    .map((item) => `${item.horizon}:${item.drawCount}:${item.newest ?? ""}:${item.oldest ?? ""}:${item.blended ? 1 : 0}`)
    .join("|")
}

function computeScore(
  model: ReverseModel,
  a: number,
  b: number,
  c: number,
  d: number,
  e: number,
  out: ScoreParts
): number {
  const ball =
    (model.ballLog[a] + model.ballLog[b] + model.ballLog[c] + model.ballLog[d] + model.ballLog[e]) * INV5
  const pairs = model.pairLog
  const couple =
    (pairs[a * PAIR_STRIDE + b] +
      pairs[a * PAIR_STRIDE + c] +
      pairs[a * PAIR_STRIDE + d] +
      pairs[a * PAIR_STRIDE + e] +
      pairs[b * PAIR_STRIDE + c] +
      pairs[b * PAIR_STRIDE + d] +
      pairs[b * PAIR_STRIDE + e] +
      pairs[c * PAIR_STRIDE + d] +
      pairs[c * PAIR_STRIDE + e] +
      pairs[d * PAIR_STRIDE + e]) *
    INV10
  const triples = model.tripleLog
  const triple =
    (triples[tripleIndex(a, b, c)] +
      triples[tripleIndex(a, b, d)] +
      triples[tripleIndex(a, b, e)] +
      triples[tripleIndex(a, c, d)] +
      triples[tripleIndex(a, c, e)] +
      triples[tripleIndex(a, d, e)] +
      triples[tripleIndex(b, c, d)] +
      triples[tripleIndex(b, c, e)] +
      triples[tripleIndex(b, d, e)] +
      triples[tripleIndex(c, d, e)]) *
    INV10
  out.ball = ball
  out.couple = couple
  out.triple = triple
  out.score = (ball + couple + triple) * INV3
  return out.score
}

export function scoreGrid(model: ReverseModel, numbers: readonly number[]): ScoreParts | null {
  const nums = validNumbers(numbers)
  if (!nums) return null
  const out: ScoreParts = { ball: 0, couple: 0, triple: 0, score: 0 }
  computeScore(model, nums[0], nums[1], nums[2], nums[3], nums[4], out)
  return out
}

type WalkBounds = {
  lo: number[]
  hi: number[]
  sumMin: number
  sumMax: number
  evenMin: number
  evenMax: number
  evenOn: boolean
  decadeOn: boolean
  decMin: number[]
  decMax: number[]
}

function walkBounds(filters: PronosticFilters): WalkBounds | null {
  const spec = canonicalizeFilters(filters)
  const lo: number[] = []
  const hi: number[] = []
  for (let i = 0; i < NUMBER_DRAW; i += 1) {
    const theo = slotBounds(i)
    const band = spec.slots[i]
    lo.push(band?.min ?? theo.min)
    hi.push(band?.max ?? theo.max)
    if (lo[i] > hi[i]) return null
  }
  const sumMin = spec.sum?.min ?? SUM_MIN
  const sumMax = spec.sum?.max ?? SUM_MAX
  if (sumMin > sumMax) return null
  const decMin = spec.decades.map((band) => band?.min ?? DECADE_PER_MIN)
  const decMax = spec.decades.map((band) => band?.max ?? DECADE_PER_MAX)
  return {
    lo,
    hi,
    sumMin,
    sumMax,
    evenMin: spec.even?.min ?? EVEN_MIN,
    evenMax: spec.even?.max ?? EVEN_MAX,
    evenOn: spec.even != null,
    decadeOn: spec.decades.some((band) => band != null),
    decMin,
    decMax,
  }
}

function walk(bounds: WalkBounds, visit: (a: number, b: number, c: number, d: number, e: number) => void) {
  const { lo, hi, sumMin, sumMax, evenMin, evenMax, evenOn, decadeOn, decMin, decMax } = bounds
  const decades = [0, 0, 0, 0, 0]
  for (let n1 = lo[0]; n1 <= hi[0]; n1 += 1) {
    const n2start = n1 + 1 > lo[1] ? n1 + 1 : lo[1]
    for (let n2 = n2start; n2 <= hi[1]; n2 += 1) {
      const n3start = n2 + 1 > lo[2] ? n2 + 1 : lo[2]
      for (let n3 = n3start; n3 <= hi[2]; n3 += 1) {
        const n4start = n3 + 1 > lo[3] ? n3 + 1 : lo[3]
        for (let n4 = n4start; n4 <= hi[3]; n4 += 1) {
          const partial = n1 + n2 + n3 + n4
          const floor = n4 + 1 > lo[4] ? n4 + 1 : lo[4]
          const start = partial + floor < sumMin ? sumMin - partial : floor
          let end = sumMax - partial
          if (end > hi[4]) end = hi[4]
          if (start > end) continue
          for (let n5 = start; n5 <= end; n5 += 1) {
            if (evenOn) {
              const even = IS_EVEN[n1] + IS_EVEN[n2] + IS_EVEN[n3] + IS_EVEN[n4] + IS_EVEN[n5]
              if (even < evenMin || even > evenMax) continue
            }
            if (decadeOn) {
              decades[0] = 0
              decades[1] = 0
              decades[2] = 0
              decades[3] = 0
              decades[4] = 0
              decades[DECADE_OF[n1]] += 1
              decades[DECADE_OF[n2]] += 1
              decades[DECADE_OF[n3]] += 1
              decades[DECADE_OF[n4]] += 1
              decades[DECADE_OF[n5]] += 1
              if (
                decades[0] < decMin[0] ||
                decades[0] > decMax[0] ||
                decades[1] < decMin[1] ||
                decades[1] > decMax[1] ||
                decades[2] < decMin[2] ||
                decades[2] > decMax[2] ||
                decades[3] < decMin[3] ||
                decades[3] > decMax[3] ||
                decades[4] < decMin[4] ||
                decades[4] > decMax[4]
              ) {
                continue
              }
            }
            visit(n1, n2, n3, n4, n5)
          }
        }
      }
    }
  }
}

type Draft = {
  numbers: [number, number, number, number, number]
  score: number
}

function lexSmaller(
  left: readonly [number, number, number, number, number],
  right: readonly [number, number, number, number, number]
) {
  for (let i = 0; i < NUMBER_DRAW; i += 1) {
    if (left[i] !== right[i]) return left[i] < right[i]
  }
  return false
}

function isBetter(score: number, numbers: Draft["numbers"], other: Draft) {
  if (score !== other.score) return score > other.score
  return lexSmaller(numbers, other.numbers)
}

export function solvePronostic(
  filters: PronosticFilters,
  model: ReverseModel,
  listLimit = PRONOSTIC_LIST_LIMIT
): PronosticResult {
  const active = describeFilters(filters)
  const bounds = walkBounds(filters)
  const limit = Math.max(1, Math.min(500, Math.round(listLimit)))
  const base = {
    universe: NUMBER_UNIVERSE,
    horizons: model.horizons,
    uniform: model.uniform,
    active,
    marginal: Array.from({ length: PAIR_STRIDE }, () => 0),
  }
  if (!bounds) {
    return { ...base, count: 0, listed: [], chanceMassListed: 0 }
  }

  const scratch: ScoreParts = { ball: 0, couple: 0, triple: 0, score: 0 }
  const listed: Draft[] = []
  let worst = 0
  let count = 0
  let maxScore = Number.NEGATIVE_INFINITY

  walk(bounds, (n1, n2, n3, n4, n5) => {
    const score = computeScore(model, n1, n2, n3, n4, n5, scratch)
    count += 1
    if (score > maxScore) maxScore = score
    if (listed.length < limit) {
      const numbers: Draft["numbers"] = [n1, n2, n3, n4, n5]
      listed.push({ numbers, score })
      if (
        listed.length === 1 ||
        isBetter(listed[worst].score, listed[worst].numbers, listed[listed.length - 1])
      ) {
        worst = listed.length - 1
      }
      return
    }
    // La marche est lexicographique : à score égal, un combo plus tardif est
    // déjà pire que le pire retenu. On ne le matérialise pas.
    const worstDraft = listed[worst]
    if (score <= worstDraft.score) return
    listed[worst] = { numbers: [n1, n2, n3, n4, n5], score }
    worst = 0
    for (let i = 1; i < listed.length; i += 1) {
      if (isBetter(listed[worst].score, listed[worst].numbers, listed[i])) worst = i
    }
  })

  if (count === 0 || !Number.isFinite(maxScore)) {
    return { ...base, count: 0, listed: [], chanceMassListed: 0 }
  }

  let partition = 0
  const marginal = new Float64Array(PAIR_STRIDE)
  walk(bounds, (n1, n2, n3, n4, n5) => {
    const weight = Math.exp(computeScore(model, n1, n2, n3, n4, n5, scratch) - maxScore)
    partition += weight
    marginal[n1] += weight
    marginal[n2] += weight
    marginal[n3] += weight
    marginal[n4] += weight
    marginal[n5] += weight
  })

  const inv = partition > 0 ? 1 / partition : 0
  const marginalOut = Array.from({ length: PAIR_STRIDE }, (_, index) => marginal[index] * inv)
  const solutions: PronosticSolution[] = listed.map((draft) => {
    const parts: ScoreParts = { ball: 0, couple: 0, triple: 0, score: 0 }
    computeScore(model, draft.numbers[0], draft.numbers[1], draft.numbers[2], draft.numbers[3], draft.numbers[4], parts)
    const chance = Math.exp(draft.score - maxScore) * inv
    return {
      numbers: draft.numbers,
      score: draft.score,
      chance,
      lift: chance * count,
      ball: parts.ball,
      couple: parts.couple,
      triple: parts.triple,
    }
  })
  solutions.sort((left, right) => {
    if (right.chance !== left.chance) return right.chance - left.chance
    return lexSmaller(left.numbers, right.numbers) ? -1 : 1
  })

  return {
    ...base,
    count,
    listed: solutions,
    chanceMassListed: solutions.reduce((sum, item) => sum + item.chance, 0),
    marginal: marginalOut,
  }
}

export function formatChance(chance: number): string {
  if (!Number.isFinite(chance) || chance <= 0) return "0 %"
  if (chance >= 0.0001) {
    return chance.toLocaleString("fr-FR", {
      style: "percent",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  }
  const one = Math.max(1, Math.round(1 / chance))
  return `1 sur ${one.toLocaleString("fr-FR")}`
}

export function formatLift(lift: number): string {
  if (!Number.isFinite(lift) || lift <= 0) return "—"
  return `×${lift.toLocaleString("fr-FR", {
    minimumFractionDigits: lift < 10 ? 2 : 0,
    maximumFractionDigits: 2,
  })}`
}

export function formatCount(value: number): string {
  return Math.round(value).toLocaleString("fr-FR")
}
