import { comb } from "@/lib/analysis"
import { mulberry32, type CombinationGrid } from "@/lib/combinations"
import {
  DECADE_COUNT,
  DECADE_LABELS,
  DECADE_MAX_PER,
  NUMBER_CONSEC_MAX,
  NUMBER_CONSEC_MIN,
  NUMBER_SPREAD_MAX,
  NUMBER_SPREAD_MIN,
  STAR_CONSEC_MAX,
  STAR_CONSEC_MIN,
  STAR_SPREAD_MAX,
  STAR_SPREAD_MIN,
  comboPassesShape,
  defaultNumberShape,
  defaultStarShape,
  mergedPassesShape,
  shapeIsRestricted,
  type ShapeBands,
} from "@/lib/grid-shape"
import {
  comboPassesSlots,
  normalizeSlots,
  parseSlotBands,
  slotsRestricted,
  type SlotBand,
} from "@/lib/pronostic/bounds"

export type { SlotBand }

export const NUMBER_DRAW = 5
export const STAR_DRAW = 2
export const NUMBER_POOL = 50
export const STAR_POOL = 12
export const NUMBER_VALUES = Array.from({ length: NUMBER_POOL }, (_, i) => i + 1)
export const STAR_VALUES = Array.from({ length: STAR_POOL }, (_, i) => i + 1)

export const NUMBER_SUM_MIN = 15
export const NUMBER_SUM_MAX = 240
export const STAR_SUM_MIN = 3
export const STAR_SUM_MAX = 23

export const TOTAL_NUMBER_WAYS = comb(NUMBER_POOL, NUMBER_DRAW)
export const TOTAL_STAR_WAYS = comb(STAR_POOL, STAR_DRAW)
export const TOTAL_GRIDS = TOTAL_NUMBER_WAYS * TOTAL_STAR_WAYS

export const LIST_LIMIT = 50
export const SAMPLE_SIZE = 12
export const DEFAULT_THRESHOLD = 1
export const DEFAULT_CHANCE = 100

export const HANDOFF_KEY = "synchro.jeux.handoff"
export const SESSION_KEY = "synchro.jeux.spec"
export const TREE_CHANCE_KEY = "synchro.jeux.tree-chances"

export type TreeChanceHandoff = {
  slug: string
  phrase: string
  numberChance: number[]
}

export function readTreeChanceHandoff(): TreeChanceHandoff | null {
  if (typeof window === "undefined") return null
  try {
    const raw = sessionStorage.getItem(TREE_CHANCE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<TreeChanceHandoff>
    if (!parsed || !Array.isArray(parsed.numberChance)) return null
    return {
      slug: String(parsed.slug ?? ""),
      phrase: String(parsed.phrase ?? ""),
      numberChance: parsed.numberChance.map((value) => Number(value)),
    }
  } catch {
    return null
  }
}

export function clearTreeChanceHandoff() {
  if (typeof window === "undefined") return
  sessionStorage.removeItem(TREE_CHANCE_KEY)
}

export type PoolKind = "numbers" | "stars"

export type BallRole = "excluded" | "optional" | "forced"

export type PoolSpec = {
  kind: PoolKind
  chance: number[]
  threshold: number
  forced: number[]
  minSum: number
  maxSum: number
  minEven: number
  maxEven: number
  minSpread: number
  maxSpread: number
  minConsecutive: number
  maxConsecutive: number
  decadeMin: number[]
  decadeMax: number[]
  /** Bornes par statistique d’ordre (n1…n5 / e1–e2). Absentes = univers théorique. */
  slotBands?: SlotBand[]
}

export type SumBin = { sum: number; count: number }
export type EvenBin = { even: number; odd: number; count: number; label: string }

export type PoolResult = {
  kind: PoolKind
  draw: number
  poolMax: number
  count: number
  mass: number
  universe: number
  poolSize: number
  optional: number[]
  forced: number[]
  excluded: number[]
  bySum: SumBin[]
  byEven: EvenBin[]
  meanSum: number | null
  impossible: string | null
}

export type GameResult = {
  numbers: PoolResult
  stars: PoolResult
  grids: number
  mass: number
  universe: number
  fraction: number
  oneIn: number | null
}

function poolMeta(kind: PoolKind) {
  if (kind === "numbers") {
    return {
      values: NUMBER_VALUES,
      draw: NUMBER_DRAW,
      poolMax: NUMBER_POOL,
      sumMin: NUMBER_SUM_MIN,
      sumMax: NUMBER_SUM_MAX,
      universe: TOTAL_NUMBER_WAYS,
    }
  }
  return {
    values: STAR_VALUES,
    draw: STAR_DRAW,
    poolMax: STAR_POOL,
    sumMin: STAR_SUM_MIN,
    sumMax: STAR_SUM_MAX,
    universe: TOTAL_STAR_WAYS,
  }
}

export function defaultChance(kind: PoolKind): number[] {
  const { poolMax } = poolMeta(kind)
  const chance = Array.from({ length: poolMax + 1 }, () => 0)
  for (let value = 1; value <= poolMax; value += 1) chance[value] = DEFAULT_CHANCE
  return chance
}

export function clampChance(value: number) {
  if (!Number.isFinite(value)) return DEFAULT_CHANCE
  return Math.min(100, Math.max(0, Math.round(value)))
}

export function clampInt(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min
  return Math.min(max, Math.max(min, Math.round(value)))
}

export function evenPercent(even: number, draw: number) {
  if (draw <= 0) return 0
  return Math.round((even / draw) * 100)
}

export function evenFromPercent(percent: number, draw: number) {
  return clampInt((percent / 100) * draw, 0, draw)
}

export function orderBand(min: number, max: number, lo: number, hi: number) {
  const a = clampInt(min, lo, hi)
  const b = clampInt(max, lo, hi)
  if (a <= b) return { min: a, max: b, swapped: false }
  return { min: b, max: a, swapped: true }
}

export function ballRole(
  chance: number,
  threshold: number,
  forced: boolean
): BallRole {
  if (forced) return chance > 0 ? "forced" : "excluded"
  if (chance <= 0) return "excluded"
  if (chance < threshold) return "excluded"
  return "optional"
}

export function classifyBalls(spec: PoolSpec) {
  const { values, draw } = poolMeta(spec.kind)
  const forcedSet = new Set(
    spec.forced.filter((value) => Number.isInteger(value) && value >= 1 && value <= poolMeta(spec.kind).poolMax)
  )
  const threshold = clampInt(spec.threshold, 0, 100)
  const optional: number[] = []
  const forced: number[] = []
  const excluded: number[] = []
  for (const value of values) {
    const chance = clampChance(spec.chance[value] ?? 0)
    const role = ballRole(chance, threshold, forcedSet.has(value))
    if (role === "forced") forced.push(value)
    else if (role === "optional") optional.push(value)
    else excluded.push(value)
  }
  return { optional, forced, excluded, draw, threshold }
}

export function shapeBandsFromSpec(spec: PoolSpec): ShapeBands {
  const withDecades = spec.kind === "numbers"
  const fallback = withDecades ? defaultNumberShape() : defaultStarShape()
  const spreadLo = spec.kind === "numbers" ? NUMBER_SPREAD_MIN : STAR_SPREAD_MIN
  const spreadHi = spec.kind === "numbers" ? NUMBER_SPREAD_MAX : STAR_SPREAD_MAX
  const consecLo = spec.kind === "numbers" ? NUMBER_CONSEC_MIN : STAR_CONSEC_MIN
  const consecHi = spec.kind === "numbers" ? NUMBER_CONSEC_MAX : STAR_CONSEC_MAX
  const spread = orderBand(spec.minSpread ?? fallback.minSpread, spec.maxSpread ?? fallback.maxSpread, spreadLo, spreadHi)
  const consec = orderBand(
    spec.minConsecutive ?? fallback.minConsecutive,
    spec.maxConsecutive ?? fallback.maxConsecutive,
    consecLo,
    consecHi
  )
  const decadeMin = Array.from({ length: DECADE_COUNT }, (_, i) =>
    clampInt(spec.decadeMin?.[i] ?? fallback.decadeMin[i], 0, DECADE_MAX_PER)
  )
  const decadeMax = Array.from({ length: DECADE_COUNT }, (_, i) =>
    clampInt(spec.decadeMax?.[i] ?? fallback.decadeMax[i], 0, DECADE_MAX_PER)
  )
  for (let i = 0; i < DECADE_COUNT; i += 1) {
    if (decadeMin[i] > decadeMax[i]) {
      const swap = decadeMin[i]
      decadeMin[i] = decadeMax[i]
      decadeMax[i] = swap
    }
  }
  return {
    minSpread: spread.min,
    maxSpread: spread.max,
    minConsecutive: consec.min,
    maxConsecutive: consec.max,
    decadeMin,
    decadeMax,
  }
}

export function poolShapeRestricted(spec: PoolSpec) {
  return shapeIsRestricted(shapeBandsFromSpec(spec), spec.kind === "numbers")
}

export function poolSlotRestricted(spec: PoolSpec) {
  return slotsRestricted(spec.kind, spec.slotBands)
}

export function specSlotBands(spec: PoolSpec): SlotBand[] {
  return normalizeSlots(spec.kind, spec.slotBands)
}

function impossibleShapeMessage(spec: PoolSpec, bands: ShapeBands): string | null {
  if (spec.kind !== "numbers") return null
  const minNeed = bands.decadeMin.reduce((total, item) => total + item, 0)
  const maxCap = bands.decadeMax.reduce((total, item) => total + item, 0)
  if (minNeed > NUMBER_DRAW) {
    return "Les minima par décennie dépassent 5 boules."
  }
  if (maxCap < NUMBER_DRAW) {
    return "Les maxima par décennie ne permettent pas 5 boules."
  }
  return null
}

function isEven(value: number) {
  return value % 2 === 0 ? 1 : 0
}

function weightOf(chance: number) {
  return clampChance(chance) / 100
}

type Cell = { count: number; mass: number }

function emptyDp(maxK: number, maxSum: number, maxEven: number): Cell[][][] {
  return Array.from({ length: maxK + 1 }, () =>
    Array.from({ length: maxSum + 1 }, () =>
      Array.from({ length: maxEven + 1 }, () => ({ count: 0, mass: 0 }))
    )
  )
}

function addBall(
  dp: Cell[][][],
  value: number,
  weight: number,
  maxK: number,
  maxSum: number,
  maxEven: number
) {
  const even = isEven(value)
  for (let k = maxK; k >= 1; k -= 1) {
    for (let s = maxSum; s >= value; s -= 1) {
      for (let e = maxEven; e >= even; e -= 1) {
        const prev = dp[k - 1][s - value][e - even]
        if (prev.count === 0 && prev.mass === 0) continue
        const cell = dp[k][s][e]
        cell.count += prev.count
        cell.mass += prev.mass * weight
      }
    }
  }
}

function addBallSlotted(
  dp: Cell[][][],
  value: number,
  weight: number,
  maxK: number,
  maxSum: number,
  maxEven: number,
  bands: SlotBand[]
) {
  const even = isEven(value)
  for (let k = maxK; k >= 1; k -= 1) {
    const band = bands[k - 1]
    if (!band || value < band.lo || value > band.hi) continue
    for (let s = maxSum; s >= value; s -= 1) {
      for (let e = maxEven; e >= even; e -= 1) {
        const prev = dp[k - 1][s - value][e - even]
        if (prev.count === 0 && prev.mass === 0) continue
        const cell = dp[k][s][e]
        cell.count += prev.count
        cell.mass += prev.mass * weight
      }
    }
  }
}

function collect(
  dp: Cell[][][],
  k: number,
  minSum: number,
  maxSum: number,
  minEven: number,
  maxEven: number
) {
  let count = 0
  let mass = 0
  let sumAcc = 0
  const bySumMap = new Map<number, number>()
  const byEvenMap = new Map<number, number>()
  if (k < 0) return { count: 0, mass: 0, bySum: [], byEven: [], meanSum: null }
  const sumHi = Math.min(maxSum, dp[k]?.length ? dp[k].length - 1 : maxSum)
  const evenHi = Math.min(maxEven, dp[k]?.[0]?.length ? dp[k][0].length - 1 : maxEven)
  for (let s = Math.max(0, minSum); s <= sumHi; s += 1) {
    for (let e = Math.max(0, minEven); e <= evenHi; e += 1) {
      const cell = dp[k][s][e]
      if (!cell || cell.count === 0) continue
      count += cell.count
      mass += cell.mass
      sumAcc += s * cell.count
      bySumMap.set(s, (bySumMap.get(s) ?? 0) + cell.count)
      byEvenMap.set(e, (byEvenMap.get(e) ?? 0) + cell.count)
    }
  }
  const bySum = [...bySumMap.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([sum, n]) => ({ sum, count: n }))
  const byEven = [...byEvenMap.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([even, n]) => ({
      even,
      odd: k - even,
      count: n,
      label: `${even}p / ${k - even}i`,
    }))
  return {
    count,
    mass,
    bySum,
    byEven,
    meanSum: count > 0 ? sumAcc / count : null,
  }
}

function impossibleMessage(
  classified: ReturnType<typeof classifyBalls>,
  need: number,
  mustSum: number,
  mustEven: number,
  band: { min: number; max: number },
  evenBand: { min: number; max: number }
): string | null {
  const { draw } = classified
  if (classified.forced.length > draw) {
    return `Trop de boules imposées (${classified.forced.length} > ${draw}).`
  }
  if (classified.optional.length + classified.forced.length < draw) {
    return `Bassin trop petit : ${classified.optional.length + classified.forced.length} boule(s) pour ${draw}.`
  }
  if (need > classified.optional.length) {
    return `Pas assez de boules optionnelles pour compléter les ${draw} tirées.`
  }
  const maxEvenPossible =
    mustEven + classified.optional.filter((value) => value % 2 === 0).length
  const minEvenPossible =
    mustEven + Math.max(0, need - classified.optional.filter((value) => value % 2 === 1).length)
  if (maxEvenPossible < evenBand.min || minEvenPossible > evenBand.max) {
    return "Aucune parité pair/impair n’est compatible avec le bassin."
  }
  const optionalSorted = [...classified.optional].sort((a, b) => a - b)
  const minRemain =
    need === 0
      ? 0
      : optionalSorted.slice(0, need).reduce((total, value) => total + value, 0)
  const maxRemain =
    need === 0
      ? 0
      : optionalSorted.slice(-need).reduce((total, value) => total + value, 0)
  if (mustSum + maxRemain < band.min || mustSum + minRemain > band.max) {
    return "Aucune somme n’est compatible avec le bassin et les boules imposées."
  }
  return null
}

function forEachMatch(
  spec: PoolSpec,
  onMatch: (combo: number[], sum: number, even: number, mass: number) => boolean | void
) {
  const { classified, need, remainMinSum, remainMaxSum, remainMinEven, remainMaxEven, forced } =
    shiftTargets(spec)
  const bands = shapeBandsFromSpec(spec)
  const withDecades = spec.kind === "numbers"
  const mustSum = forced.reduce((total, value) => total + value, 0)
  const mustEven = forced.reduce((total, value) => total + isEven(value), 0)
  const forcedMass = forced.reduce(
    (total, value) => total * weightOf(spec.chance[value] ?? 0),
    1
  )
  const optional = classified.optional
  const n = optional.length
  const weights = optional.map((value) => weightOf(spec.chance[value] ?? 0))
  const evens = optional.map(isEven)
  const picked = new Array<number>(need)
  const comboBuf = new Array<number>(classified.draw)

  function emit(sum: number, even: number, mass: number) {
    if (
      sum < remainMinSum ||
      sum > remainMaxSum ||
      even < remainMinEven ||
      even > remainMaxEven ||
      !mergedPassesShape(forced, picked, bands, withDecades)
    ) {
      return false
    }
    let i = 0
    let j = 0
    let k = 0
    while (i < forced.length || j < need) {
      if (j >= need || (i < forced.length && forced[i] <= picked[j])) {
        comboBuf[k] = forced[i]
        i += 1
      } else {
        comboBuf[k] = picked[j]
        j += 1
      }
      k += 1
    }
    if (!comboPassesSlots(comboBuf, spec.kind, spec.slotBands)) return false
    return (
      onMatch(comboBuf, sum + mustSum, even + mustEven, mass * forcedMass) === false
    )
  }

  function rec(depth: number, start: number, sum: number, even: number, mass: number): boolean {
    if (depth === need) return emit(sum, even, mass)
    const left = need - depth
    if (n - start < left) return false
    const bounds = remainingBounds(optional, start, left)
    if (sum + bounds.max < remainMinSum || sum + bounds.min > remainMaxSum) return false
    for (let i = start; i <= n - left; i += 1) {
      picked[depth] = optional[i]
      if (rec(depth + 1, i + 1, sum + optional[i], even + evens[i], mass * weights[i])) {
        return true
      }
    }
    return false
  }

  rec(0, 0, 0, 0, 1)
}

function gatherFromVisit(spec: PoolSpec, impossible: string | null): Omit<PoolResult, "kind" | "draw" | "poolMax" | "universe" | "poolSize" | "optional" | "forced" | "excluded"> {
  let count = 0
  let mass = 0
  let sumAcc = 0
  const bySumMap = new Map<number, number>()
  const byEvenMap = new Map<number, number>()
  const meta = poolMeta(spec.kind)
  forEachMatch(spec, (_combo, sum, even, comboMass) => {
    count += 1
    mass += comboMass
    sumAcc += sum
    bySumMap.set(sum, (bySumMap.get(sum) ?? 0) + 1)
    byEvenMap.set(even, (byEvenMap.get(even) ?? 0) + 1)
  })
  const bySum = [...bySumMap.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([sum, n]) => ({ sum, count: n }))
  const byEven = [...byEvenMap.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([even, n]) => ({
      even,
      odd: meta.draw - even,
      count: n,
      label: `${even}p / ${meta.draw - even}i`,
    }))
  return {
    count,
    mass,
    bySum,
    byEven,
    meanSum: count > 0 ? sumAcc / count : null,
    impossible: count === 0 ? (impossible ?? "Aucune combinaison dans ces bornes.") : null,
  }
}

export function evaluatePool(spec: PoolSpec): PoolResult {
  const meta = poolMeta(spec.kind)
  const classified = classifyBalls(spec)
  const band = orderBand(spec.minSum, spec.maxSum, meta.sumMin, meta.sumMax)
  const evenBand = orderBand(spec.minEven, spec.maxEven, 0, meta.draw)
  const mustSum = classified.forced.reduce((total, value) => total + value, 0)
  const mustEven = classified.forced.reduce((total, value) => total + isEven(value), 0)
  const need = classified.draw - classified.forced.length
  const base = {
    kind: spec.kind,
    draw: meta.draw,
    poolMax: meta.poolMax,
    universe: meta.universe,
    poolSize: classified.optional.length + classified.forced.length,
    optional: classified.optional,
    forced: classified.forced,
    excluded: classified.excluded,
  }

  const shapeBands = shapeBandsFromSpec(spec)
  const impossible =
    impossibleMessage(classified, need, mustSum, mustEven, band, evenBand) ??
    impossibleShapeMessage(spec, shapeBands)
  if (
    need < 0 ||
    classified.optional.length + classified.forced.length < meta.draw ||
    classified.forced.length > meta.draw
  ) {
    return {
      ...base,
      count: 0,
      mass: 0,
      bySum: [],
      byEven: [],
      meanSum: null,
      impossible:
        impossible ??
        `Impossible de tirer ${meta.draw} boule(s) avec ces restrictions.`,
    }
  }

  const remainMinSum = band.min - mustSum
  const remainMaxSum = band.max - mustSum
  const remainMinEven = evenBand.min - mustEven
  const remainMaxEven = evenBand.max - mustEven

  if (need > 0 && (remainMaxSum < 0 || remainMaxEven < 0 || remainMinEven > need)) {
    return {
      ...base,
      count: 0,
      mass: 0,
      bySum: [],
      byEven: [],
      meanSum: null,
      impossible: impossible ?? "Aucune combinaison dans ces bornes.",
    }
  }

  if (need === 0) {
    const ok =
      mustSum >= band.min &&
      mustSum <= band.max &&
      mustEven >= evenBand.min &&
      mustEven <= evenBand.max &&
      comboPassesShape(classified.forced, shapeBands, spec.kind === "numbers") &&
      comboPassesSlots(classified.forced, spec.kind, spec.slotBands)
    const mass = ok
      ? classified.forced.reduce((total, value) => total * weightOf(spec.chance[value] ?? 0), 1)
      : 0
    return {
      ...base,
      count: ok ? 1 : 0,
      mass,
      bySum: ok ? [{ sum: mustSum, count: 1 }] : [],
      byEven: ok
        ? [
            {
              even: mustEven,
              odd: meta.draw - mustEven,
              count: 1,
              label: `${mustEven}p / ${meta.draw - mustEven}i`,
            },
          ]
        : [],
      meanSum: ok ? mustSum : null,
      impossible: ok ? null : impossible,
    }
  }

  if (poolShapeRestricted(spec) || (poolSlotRestricted(spec) && classified.forced.length > 0)) {
    return { ...base, ...gatherFromVisit(spec, impossible) }
  }

  const maxK = need
  const maxSum = Math.max(0, remainMaxSum)
  const maxEven = Math.max(0, Math.min(need, remainMaxEven))
  if (maxSum < 0 || remainMinSum > maxSum || remainMinEven > remainMaxEven) {
    return {
      ...base,
      count: 0,
      mass: 0,
      bySum: [],
      byEven: [],
      meanSum: null,
      impossible: impossible ?? "Aucune combinaison dans ces bornes.",
    }
  }

  const dp = emptyDp(maxK, maxSum, maxEven)
  dp[0][0][0] = { count: 1, mass: 1 }
  const slotted = poolSlotRestricted(spec)
  const slotBands = slotted ? specSlotBands(spec) : null
  for (const value of classified.optional) {
    const weight = weightOf(spec.chance[value] ?? 0)
    if (slotBands) {
      addBallSlotted(dp, value, weight, maxK, maxSum, maxEven, slotBands)
    } else {
      addBall(dp, value, weight, maxK, maxSum, maxEven)
    }
  }
  const gathered = collect(
    dp,
    need,
    remainMinSum,
    remainMaxSum,
    remainMinEven,
    remainMaxEven
  )
  const forcedMass = classified.forced.reduce(
    (total, value) => total * weightOf(spec.chance[value] ?? 0),
    1
  )
  const bySum = gathered.bySum.map((row) => ({
    sum: row.sum + mustSum,
    count: row.count,
  }))
  const byEven = gathered.byEven.map((row) => ({
    even: row.even + mustEven,
    odd: meta.draw - (row.even + mustEven),
    count: row.count,
    label: `${row.even + mustEven}p / ${meta.draw - (row.even + mustEven)}i`,
  }))
  return {
    ...base,
    count: gathered.count,
    mass: gathered.mass * forcedMass,
    bySum,
    byEven,
    meanSum: gathered.meanSum == null ? null : gathered.meanSum + mustSum,
    impossible: gathered.count === 0 ? (impossible ?? "Aucune combinaison dans ces bornes.") : null,
  }
}

export function evaluateGame(numbers: PoolSpec, stars: PoolSpec): GameResult {
  const numberResult = evaluatePool({ ...numbers, kind: "numbers" })
  const starResult = evaluatePool({ ...stars, kind: "stars" })
  const grids = numberResult.count * starResult.count
  const mass = numberResult.mass * starResult.mass
  const fraction = TOTAL_GRIDS > 0 ? grids / TOTAL_GRIDS : 0
  return {
    numbers: numberResult,
    stars: starResult,
    grids,
    mass,
    universe: TOTAL_GRIDS,
    fraction,
    oneIn: grids > 0 ? TOTAL_GRIDS / grids : null,
  }
}

function remainingBounds(optional: number[], start: number, left: number) {
  let min = 0
  let max = 0
  for (let i = 0; i < left; i += 1) {
    min += optional[start + i]
    max += optional[optional.length - left + i]
  }
  return { min, max }
}

function enumerateCombos(
  optional: number[],
  need: number,
  minSum: number,
  maxSum: number,
  minEven: number,
  maxEven: number,
  limit: number
): number[][] {
  const out: number[][] = []
  if (need === 0) {
    if (minSum <= 0 && maxSum >= 0 && minEven <= 0 && maxEven >= 0) out.push([])
    return out
  }
  const picked: number[] = []
  function rec(start: number, sum: number, even: number) {
    if (out.length > limit) return
    const left = need - picked.length
    if (left === 0) {
      if (sum >= minSum && sum <= maxSum && even >= minEven && even <= maxEven) {
        out.push([...picked])
      }
      return
    }
    const remainingBalls = optional.length - start
    if (remainingBalls < left) return
    const bounds = remainingBounds(optional, start, left)
    if (sum + bounds.max < minSum || sum + bounds.min > maxSum) return
    for (let i = start; i <= optional.length - left; i += 1) {
      if (out.length > limit) return
      const value = optional[i]
      picked.push(value)
      rec(i + 1, sum + value, even + isEven(value))
      picked.pop()
    }
  }
  rec(0, 0, 0)
  return out
}

function shiftTargets(spec: PoolSpec) {
  const meta = poolMeta(spec.kind)
  const classified = classifyBalls(spec)
  const band = orderBand(spec.minSum, spec.maxSum, meta.sumMin, meta.sumMax)
  const evenBand = orderBand(spec.minEven, spec.maxEven, 0, meta.draw)
  const mustSum = classified.forced.reduce((total, value) => total + value, 0)
  const mustEven = classified.forced.reduce((total, value) => total + isEven(value), 0)
  return {
    classified,
    need: classified.draw - classified.forced.length,
    remainMinSum: band.min - mustSum,
    remainMaxSum: band.max - mustSum,
    remainMinEven: evenBand.min - mustEven,
    remainMaxEven: evenBand.max - mustEven,
    forced: classified.forced,
  }
}

function finishCombo(forced: number[], rest: number[]) {
  return [...forced, ...rest].sort((a, b) => a - b)
}

export function listPool(spec: PoolSpec, limit = LIST_LIMIT): number[][] {
  const result = evaluatePool(spec)
  if (result.count === 0 || result.count > limit) return []
  const out: number[][] = []
  forEachMatch(spec, (combo) => {
    out.push(combo.slice())
    return out.length < result.count && out.length < limit
  })
  return out
}

function sampleByReservoir(spec: PoolSpec, take: number, seed: number) {
  const rand = mulberry32(seed)
  const sample: number[][] = []
  let seen = 0
  forEachMatch(spec, (combo) => {
    seen += 1
    if (sample.length < take) sample.push(combo.slice())
    else if (rand() < take / seen) {
      sample[Math.floor(rand() * take)] = combo.slice()
    }
  })
  return sample
}

function suffixCounts(
  balls: number[],
  maxK: number,
  maxSum: number,
  maxEven: number,
  slotBands: SlotBand[] | null = null
): Int32Array[] {
  const n = balls.length
  const evenDim = maxEven + 1
  const sumDim = maxSum + 1
  const kDim = maxK + 1
  const strideS = evenDim
  const strideK = sumDim * evenDim
  const size = kDim * strideK
  const layers: Int32Array[] = Array.from({ length: n + 1 }, () => new Int32Array(size))
  layers[n][0] = 1
  for (let i = n - 1; i >= 0; i -= 1) {
    const value = balls[i]
    const even = isEven(value)
    const src = layers[i + 1]
    const dst = layers[i]
    dst.set(src)
    for (let k = 0; k < maxK; k += 1) {
      if (slotBands) {
        const rank = maxK - (k + 1)
        const band = slotBands[rank]
        if (!band || value < band.lo || value > band.hi) continue
      }
      for (let s = 0; s <= maxSum - value; s += 1) {
        for (let e = 0; e <= maxEven - even; e += 1) {
          const ways = src[k * strideK + s * strideS + e]
          if (!ways) continue
          dst[(k + 1) * strideK + (s + value) * strideS + (e + even)] += ways
        }
      }
    }
  }
  return layers
}

function waysInRange(
  layer: Int32Array,
  k: number,
  minSum: number,
  maxSum: number,
  minEven: number,
  maxEven: number,
  sumDim: number,
  evenDim: number
) {
  if (k < 0) return 0
  const strideK = sumDim * evenDim
  let total = 0
  const sLo = Math.max(0, minSum)
  const sHi = Math.min(sumDim - 1, maxSum)
  const eLo = Math.max(0, minEven)
  const eHi = Math.min(evenDim - 1, maxEven)
  for (let s = sLo; s <= sHi; s += 1) {
    for (let e = eLo; e <= eHi; e += 1) {
      total += layer[k * strideK + s * evenDim + e]
    }
  }
  return total
}

export function samplePool(
  spec: PoolSpec,
  n: number,
  seed = 1
): number[][] {
  const result = evaluatePool(spec)
  if (result.count === 0 || n <= 0) return []
  const take = Math.min(n, result.count)
  if (poolShapeRestricted(spec)) return sampleByReservoir(spec, take, seed)
  const { classified, need, remainMinSum, remainMaxSum, remainMinEven, remainMaxEven, forced } =
    shiftTargets(spec)
  if (poolSlotRestricted(spec) && classified.forced.length > 0) {
    return sampleByReservoir(spec, take, seed)
  }
  if (need === 0) {
    return [finishCombo(forced, [])]
  }
  const slotBands =
    poolSlotRestricted(spec) && classified.forced.length === 0 ? specSlotBands(spec) : null
  const maxSum = Math.max(0, remainMaxSum)
  const maxEven = Math.max(0, Math.min(need, remainMaxEven))
  const layers = suffixCounts(classified.optional, need, maxSum, maxEven, slotBands)
  const evenDim = maxEven + 1
  const sumDim = maxSum + 1
  const rand = mulberry32(seed)
  const seen = new Set<string>()
  const out: number[][] = []
  const maxAttempts = Math.max(take * 40, 40)
  for (let attempt = 0; attempt < maxAttempts && out.length < take; attempt += 1) {
    const picked: number[] = []
    let kLeft = need
    let minS = remainMinSum
    let maxS = remainMaxSum
    let minE = remainMinEven
    let maxE = remainMaxEven
    let ok = true
    for (let i = 0; i < classified.optional.length && kLeft > 0; i += 1) {
      const leftBalls = classified.optional.length - i
      if (leftBalls < kLeft) {
        ok = false
        break
      }
      const skip = waysInRange(
        layers[i + 1],
        kLeft,
        minS,
        maxS,
        minE,
        maxE,
        sumDim,
        evenDim
      )
      const value = classified.optional[i]
      const even = isEven(value)
      const band = slotBands?.[need - kLeft]
      const fitsSlot = !band || (value >= band.lo && value <= band.hi)
      const takeWays =
        kLeft > 0 && fitsSlot
          ? waysInRange(
              layers[i + 1],
              kLeft - 1,
              minS - value,
              maxS - value,
              minE - even,
              maxE - even,
              sumDim,
              evenDim
            )
          : 0
      const total = skip + takeWays
      if (total <= 0) {
        ok = false
        break
      }
      const chooseTake = rand() * total < takeWays
      if (chooseTake) {
        picked.push(value)
        kLeft -= 1
        minS -= value
        maxS -= value
        minE -= even
        maxE -= even
      }
    }
    if (!ok || kLeft !== 0) continue
    const combo = finishCombo(forced, picked)
    const key = combo.join(",")
    if (seen.has(key)) continue
    seen.add(key)
    out.push(combo)
  }
  return out
}

export function listGrids(
  numberCombos: number[][],
  starCombos: number[][],
  limit = LIST_LIMIT
): CombinationGrid[] {
  const grids: CombinationGrid[] = []
  for (const numbers of numberCombos) {
    for (const stars of starCombos) {
      if (grids.length >= limit) return grids
      grids.push({ numbers, stars })
    }
  }
  return grids
}

export function formatCount(value: number) {
  return Math.round(value).toLocaleString("fr-FR")
}

export function formatMass(value: number) {
  if (!Number.isFinite(value)) return "—"
  if (value === 0) return "0"
  if (Number.isInteger(value) || Math.abs(value - Math.round(value)) < 1e-9) {
    return Math.round(value).toLocaleString("fr-FR")
  }
  return value.toLocaleString("fr-FR", { maximumFractionDigits: 2 })
}

export function formatOneIn(value: number | null) {
  if (value == null || !Number.isFinite(value) || value <= 0) return "—"
  if (value < 1.05) return "1"
  if (value < 10) return value.toLocaleString("fr-FR", { maximumFractionDigits: 1 })
  return Math.round(value).toLocaleString("fr-FR")
}

export type StoredSpec = {
  numberChance: number[]
  starChance: number[]
  numberThreshold: number
  starThreshold: number
  numberForced: number[]
  starForced: number[]
  numberMinSum: number
  numberMaxSum: number
  numberMinEven: number
  numberMaxEven: number
  numberMinSpread: number
  numberMaxSpread: number
  numberMinConsecutive: number
  numberMaxConsecutive: number
  numberDecadeMin: number[]
  numberDecadeMax: number[]
  starMinSum: number
  starMaxSum: number
  starMinEven: number
  starMaxEven: number
  starMinSpread: number
  starMaxSpread: number
  starMinConsecutive: number
  starMaxConsecutive: number
  numberSlotBands?: SlotBand[]
  starSlotBands?: SlotBand[]
}

export function defaultStoredSpec(): StoredSpec {
  const numberShape = defaultNumberShape()
  const starShape = defaultStarShape()
  return {
    numberChance: NUMBER_VALUES.map(() => DEFAULT_CHANCE),
    starChance: STAR_VALUES.map(() => DEFAULT_CHANCE),
    numberThreshold: DEFAULT_THRESHOLD,
    starThreshold: DEFAULT_THRESHOLD,
    numberForced: [],
    starForced: [],
    numberMinSum: NUMBER_SUM_MIN,
    numberMaxSum: NUMBER_SUM_MAX,
    numberMinEven: 0,
    numberMaxEven: NUMBER_DRAW,
    numberMinSpread: numberShape.minSpread,
    numberMaxSpread: numberShape.maxSpread,
    numberMinConsecutive: numberShape.minConsecutive,
    numberMaxConsecutive: numberShape.maxConsecutive,
    numberDecadeMin: [...numberShape.decadeMin],
    numberDecadeMax: [...numberShape.decadeMax],
    starMinSum: STAR_SUM_MIN,
    starMaxSum: STAR_SUM_MAX,
    starMinEven: 0,
    starMaxEven: STAR_DRAW,
    starMinSpread: starShape.minSpread,
    starMaxSpread: starShape.maxSpread,
    starMinConsecutive: starShape.minConsecutive,
    starMaxConsecutive: starShape.maxConsecutive,
  }
}

function clampForced(values: unknown, poolMax: number) {
  if (!Array.isArray(values)) return []
  const seen = new Set<number>()
  const out: number[] = []
  for (const item of values) {
    const n = Number(item)
    if (!Number.isInteger(n) || n < 1 || n > poolMax) continue
    if (seen.has(n)) continue
    seen.add(n)
    out.push(n)
  }
  return out
}

function clampDecadeRow(raw: unknown, fallback: number[], fill: number) {
  return fallback.map((_, i) => {
    const n = Number(Array.isArray(raw) ? raw[i] : Number.NaN)
    return Number.isFinite(n) ? clampInt(n, 0, DECADE_MAX_PER) : fill
  })
}

export function parseStoredSpec(value: unknown): StoredSpec | null {
  if (value == null || typeof value !== "object" || Array.isArray(value)) return null
  const parsed = value as Partial<StoredSpec>
  const base = defaultStoredSpec()
  const numberChance = Array.isArray(parsed.numberChance)
    ? NUMBER_VALUES.map((_, i) => clampChance(Number(parsed.numberChance?.[i] ?? DEFAULT_CHANCE)))
    : base.numberChance
  const starChance = Array.isArray(parsed.starChance)
    ? STAR_VALUES.map((_, i) => clampChance(Number(parsed.starChance?.[i] ?? DEFAULT_CHANCE)))
    : base.starChance
  return {
    ...base,
    numberChance,
    starChance,
    numberThreshold: clampInt(Number(parsed.numberThreshold ?? base.numberThreshold), 0, 100),
    starThreshold: clampInt(Number(parsed.starThreshold ?? base.starThreshold), 0, 100),
    numberForced: clampForced(parsed.numberForced, NUMBER_POOL),
    starForced: clampForced(parsed.starForced, STAR_POOL),
    numberMinSum: clampInt(Number(parsed.numberMinSum ?? base.numberMinSum), NUMBER_SUM_MIN, NUMBER_SUM_MAX),
    numberMaxSum: clampInt(Number(parsed.numberMaxSum ?? base.numberMaxSum), NUMBER_SUM_MIN, NUMBER_SUM_MAX),
    numberMinEven: clampInt(Number(parsed.numberMinEven ?? 0), 0, NUMBER_DRAW),
    numberMaxEven: clampInt(Number(parsed.numberMaxEven ?? NUMBER_DRAW), 0, NUMBER_DRAW),
    numberMinSpread: clampInt(Number(parsed.numberMinSpread ?? base.numberMinSpread), NUMBER_SPREAD_MIN, NUMBER_SPREAD_MAX),
    numberMaxSpread: clampInt(Number(parsed.numberMaxSpread ?? base.numberMaxSpread), NUMBER_SPREAD_MIN, NUMBER_SPREAD_MAX),
    numberMinConsecutive: clampInt(Number(parsed.numberMinConsecutive ?? base.numberMinConsecutive), 0, NUMBER_CONSEC_MAX),
    numberMaxConsecutive: clampInt(Number(parsed.numberMaxConsecutive ?? base.numberMaxConsecutive), 0, NUMBER_CONSEC_MAX),
    numberDecadeMin: clampDecadeRow(parsed.numberDecadeMin, base.numberDecadeMin, 0),
    numberDecadeMax: clampDecadeRow(parsed.numberDecadeMax, base.numberDecadeMax, DECADE_MAX_PER),
    starMinSum: clampInt(Number(parsed.starMinSum ?? base.starMinSum), STAR_SUM_MIN, STAR_SUM_MAX),
    starMaxSum: clampInt(Number(parsed.starMaxSum ?? base.starMaxSum), STAR_SUM_MIN, STAR_SUM_MAX),
    starMinEven: clampInt(Number(parsed.starMinEven ?? 0), 0, STAR_DRAW),
    starMaxEven: clampInt(Number(parsed.starMaxEven ?? STAR_DRAW), 0, STAR_DRAW),
    starMinSpread: clampInt(Number(parsed.starMinSpread ?? base.starMinSpread), STAR_SPREAD_MIN, STAR_SPREAD_MAX),
    starMaxSpread: clampInt(Number(parsed.starMaxSpread ?? base.starMaxSpread), STAR_SPREAD_MIN, STAR_SPREAD_MAX),
    starMinConsecutive: clampInt(Number(parsed.starMinConsecutive ?? base.starMinConsecutive), 0, STAR_CONSEC_MAX),
    starMaxConsecutive: clampInt(Number(parsed.starMaxConsecutive ?? base.starMaxConsecutive), 0, STAR_CONSEC_MAX),
    numberSlotBands: parseSlotBands("numbers", parsed.numberSlotBands),
    starSlotBands: parseSlotBands("stars", parsed.starSlotBands),
  }
}

export function writeStoredSpec(spec: StoredSpec) {
  if (typeof window === "undefined") return
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(spec))
  } catch {
    /* quota / private mode */
  }
}

export function summarizeStoredSpec(spec: StoredSpec | null | undefined): string[] {
  if (!spec) return []
  const base = defaultStoredSpec()
  const chips: string[] = []
  if (spec.numberMinSum > base.numberMinSum || spec.numberMaxSum < base.numberMaxSum) {
    chips.push(`Σ ${spec.numberMinSum}–${spec.numberMaxSum}`)
  }
  if (spec.numberMinEven > 0 || spec.numberMaxEven < NUMBER_DRAW) {
    chips.push(`${spec.numberMinEven}–${spec.numberMaxEven} paires`)
  }
  if (spec.numberMinSpread > base.numberMinSpread || spec.numberMaxSpread < base.numberMaxSpread) {
    chips.push(`étendue ${spec.numberMinSpread}–${spec.numberMaxSpread}`)
  }
  if (
    spec.numberMinConsecutive > base.numberMinConsecutive ||
    spec.numberMaxConsecutive < base.numberMaxConsecutive
  ) {
    chips.push(`${spec.numberMinConsecutive}–${spec.numberMaxConsecutive} consécutifs`)
  }
  for (let i = 0; i < DECADE_COUNT; i += 1) {
    const min = spec.numberDecadeMin[i] ?? 0
    const max = spec.numberDecadeMax[i] ?? DECADE_MAX_PER
    if (min > 0 || max < DECADE_MAX_PER) {
      chips.push(`${DECADE_LABELS[i]} ${min}–${max}`)
    }
  }
  if (spec.numberForced.length > 0) {
    chips.push(`forcés ${[...spec.numberForced].sort((a, b) => a - b).join(", ")}`)
  }
  const excluded = NUMBER_VALUES.filter((_, i) => (spec.numberChance[i] ?? DEFAULT_CHANCE) <= 0)
  if (excluded.length > 0) {
    const shown = excluded.slice(0, 6)
    chips.push(`hors ${shown.join(", ")}${excluded.length > 6 ? "…" : ""}`)
  }
  if (spec.numberThreshold > DEFAULT_THRESHOLD) {
    chips.push(`seuil ${spec.numberThreshold} %`)
  }
  if (spec.starMinSum > base.starMinSum || spec.starMaxSum < base.starMaxSum) {
    chips.push(`★ Σ ${spec.starMinSum}–${spec.starMaxSum}`)
  }
  if (spec.starMinEven > 0 || spec.starMaxEven < STAR_DRAW) {
    chips.push(`★ ${spec.starMinEven}–${spec.starMaxEven} paires`)
  }
  if (spec.starForced.length > 0) {
    chips.push(`★ forcées ${[...spec.starForced].sort((a, b) => a - b).join(", ")}`)
  }
  if (spec.numberSlotBands && slotsRestricted("numbers", spec.numberSlotBands)) {
    chips.push(
      spec.numberSlotBands.map((band, i) => `n${i + 1} ${band.lo}–${band.hi}`).join(" ")
    )
  }
  if (spec.starSlotBands && slotsRestricted("stars", spec.starSlotBands)) {
    chips.push(
      spec.starSlotBands.map((band, i) => `e${i + 1} ${band.lo}–${band.hi}`).join(" ")
    )
  }
  const starExcluded = STAR_VALUES.filter((_, i) => (spec.starChance[i] ?? DEFAULT_CHANCE) <= 0)
  if (starExcluded.length > 0) {
    chips.push(`★ hors ${starExcluded.join(", ")}`)
  }
  return chips
}

export function chanceArrayToIndexed(kind: PoolKind, values: number[]) {
  const { poolMax } = poolMeta(kind)
  const chance = Array.from({ length: poolMax + 1 }, () => 0)
  for (let i = 0; i < values.length && i < poolMax; i += 1) {
    chance[i + 1] = clampChance(values[i] ?? 0)
  }
  return chance
}

export function chancesFromCounts(counts: Array<{ value: number; count: number }>, poolMax: number) {
  const chance = Array.from({ length: poolMax }, () => 0)
  const peak = Math.max(1, ...counts.map((row) => row.count))
  for (const row of counts) {
    if (row.value < 1 || row.value > poolMax) continue
    chance[row.value - 1] = clampChance((100 * row.count) / peak)
  }
  return chance
}

export function storedToPoolSpecs(stored: StoredSpec): {
  numbers: PoolSpec
  stars: PoolSpec
} {
  return {
    numbers: {
      kind: "numbers",
      chance: chanceArrayToIndexed("numbers", stored.numberChance),
      threshold: stored.numberThreshold,
      forced: stored.numberForced,
      minSum: stored.numberMinSum,
      maxSum: stored.numberMaxSum,
      minEven: stored.numberMinEven,
      maxEven: stored.numberMaxEven,
      minSpread: stored.numberMinSpread,
      maxSpread: stored.numberMaxSpread,
      minConsecutive: stored.numberMinConsecutive,
      maxConsecutive: stored.numberMaxConsecutive,
      decadeMin: stored.numberDecadeMin,
      decadeMax: stored.numberDecadeMax,
      slotBands: stored.numberSlotBands,
    },
    stars: {
      kind: "stars",
      chance: chanceArrayToIndexed("stars", stored.starChance),
      threshold: stored.starThreshold,
      forced: stored.starForced,
      minSum: stored.starMinSum,
      maxSum: stored.starMaxSum,
      minEven: stored.starMinEven,
      maxEven: stored.starMaxEven,
      minSpread: stored.starMinSpread,
      maxSpread: stored.starMaxSpread,
      minConsecutive: stored.starMinConsecutive,
      maxConsecutive: stored.starMaxConsecutive,
      decadeMin: defaultStarShape().decadeMin,
      decadeMax: defaultStarShape().decadeMax,
      slotBands: stored.starSlotBands,
    },
  }
}

export function comboSurvives(values: number[], spec: PoolSpec): boolean {
  const meta = poolMeta(spec.kind)
  if (values.length !== meta.draw) return false
  const classified = classifyBalls(spec)
  const allowed = new Set([...classified.optional, ...classified.forced])
  for (const value of values) {
    if (!allowed.has(value)) return false
  }
  for (const value of classified.forced) {
    if (!values.includes(value)) return false
  }
  const band = orderBand(spec.minSum, spec.maxSum, meta.sumMin, meta.sumMax)
  const evenBand = orderBand(spec.minEven, spec.maxEven, 0, meta.draw)
  const sum = values.reduce((total, value) => total + value, 0)
  const even = values.reduce((total, value) => total + isEven(value), 0)
  if (sum < band.min || sum > band.max || even < evenBand.min || even > evenBand.max) {
    return false
  }
  return (
    comboPassesShape(values, shapeBandsFromSpec(spec), spec.kind === "numbers") &&
    comboPassesSlots(values, spec.kind, spec.slotBands)
  )
}

export function gridSurvives(
  grid: CombinationGrid,
  numbers: PoolSpec,
  stars: PoolSpec
) {
  return comboSurvives(grid.numbers, { ...numbers, kind: "numbers" }) &&
    comboSurvives(grid.stars, { ...stars, kind: "stars" })
}

export function intersectGrids(
  grids: CombinationGrid[],
  numbers: PoolSpec,
  stars: PoolSpec
) {
  const survivors: CombinationGrid[] = []
  const rejected: CombinationGrid[] = []
  for (const grid of grids) {
    if (gridSurvives(grid, numbers, stars)) survivors.push(grid)
    else rejected.push(grid)
  }
  return { total: grids.length, survivors, rejected }
}
