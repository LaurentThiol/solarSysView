import { TOTAL_GRIDS, drawSize, sumBounds, theoreticalSlot, theoreticalSlots, type PoolKind } from "./bounds.ts"
import { applyDeltaLayer, deltaCovers, readDeltaLayer } from "./delta-layer.ts"
import { countStack } from "./count.ts"
import {
  applyProposal,
  coversPoint,
  meanOf,
  proposeStack,
  sampleStd,
  type CoverLayers,
  type LearnConfig,
  type StackProposal,
  type WindowPoint,
} from "./learn.ts"
import { defaultStack, setLayerEnabled, type LayerId, type StackState } from "./state.ts"

/** Tirages notés : les plus récents, numéros et étoiles ensemble. */
export const HISTORIC_HORIZON = 100
export const HISTORIC_LOOKBACKS = [20, 50, 100] as const
export type HistoricLookback = (typeof HISTORIC_LOOKBACKS)[number]
export const HISTORIC_AUTO = "auto" as const
export type HistoricLookbackChoice = HistoricLookback | typeof HISTORIC_AUTO

/** Marge annoncée avant le tirage : moyenne ± k·σ, mêmes pas que les bandes entières. */
export const MARGIN_STEPS = [0, 0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3] as const
export type MarginStep = (typeof MARGIN_STEPS)[number]
export const DEFAULT_MARGIN: MarginStep = 1

const AUTO_PRIOR_WINDOW = 10
const AUTO_MIN_PRIORS = 3
const FALLBACK_LOOKBACK: HistoricLookback = 20

export type HistoricLayers = CoverLayers

export const DEFAULT_HISTORIC_LAYERS: HistoricLayers = {
  sum: true,
  parity: true,
  slots: true,
  pas: false,
}

export const ERROR_AXES = [
  { id: "sum", label: "somme", pool: "numbers", layer: "sum" },
  { id: "parity", label: "pairs", pool: "numbers", layer: "parity" },
  { id: "n1", label: "n1", pool: "numbers", layer: "slots", slot: 0 },
  { id: "n2", label: "n2", pool: "numbers", layer: "slots", slot: 1 },
  { id: "n3", label: "n3", pool: "numbers", layer: "slots", slot: 2 },
  { id: "n4", label: "n4", pool: "numbers", layer: "slots", slot: 3 },
  { id: "n5", label: "n5", pool: "numbers", layer: "slots", slot: 4 },
  { id: "starSum", label: "somme ★", pool: "stars", layer: "sum" },
  { id: "starParity", label: "pairs ★", pool: "stars", layer: "parity" },
  { id: "e1", label: "e1", pool: "stars", layer: "slots", slot: 0 },
  { id: "e2", label: "e2", pool: "stars", layer: "slots", slot: 1 },
] as const

export type ErrorAxisId = (typeof ERROR_AXES)[number]["id"]

type AxisSpec = (typeof ERROR_AXES)[number]

const LOOKBACK_INDEX: Record<HistoricLookback, number> = { 20: 0, 50: 1, 100: 2 }

export type HistoricDraw = {
  date: string
  numbers: number[]
  stars: number[]
}

export type PairedDraw = {
  date: string
  numbers: number[]
  stars: number[]
  numberPoint: WindowPoint
  starPoint: WindowPoint
}

export type AxisReading = {
  id: ErrorAxisId
  label: string
  pool: PoolKind
  layer: LayerId
  enabled: boolean
  mean: number
  sigma: number
  actual: number
  delta: number
  /** (réel − moyenne) / σ. 0 si σ = 0 et la valeur égale la moyenne. null si σ = 0 et elle diffère. */
  z: number | null
  /** Plus petit pas de marge dont la bande entière contient la valeur. null au-delà de 3 σ. */
  required: number | null
}

export type PreparedRow = {
  index: number
  date: string
  numbers: number[]
  stars: number[]
  chosenLookback: HistoricLookback
  axes: AxisReading[]
  requiredMargin: number | null
  binding: ErrorAxisId | null
  /** Résidus z, ordre ERROR_AXES, couches éteintes comprises. */
  vector: Array<number | null>
}

export type HistoricPrepared = {
  horizon: number
  available: number
  inWindow: number
  lookback: HistoricLookbackChoice
  layers: HistoricLayers
  rows: PreparedRow[]
  nextLookback: HistoricLookback | null
  paired: PairedDraw[]
  cache: Map<string, number>
}

export type HistoricGameRow = {
  date: string
  numbers: number[]
  stars: number[]
  chosenLookback: HistoricLookback
  axes: AxisReading[]
  requiredMargin: number | null
  binding: ErrorAxisId | null
  hit: boolean
  numberHit: boolean
  starHit: boolean
  grids: number
  vector: Array<number | null>
}

export type HistoricSummary = {
  n: number
  hits: number
  rate: number
  numberHits: number
  starHits: number
  meanGrids: number | null
  totalGrids: number | null
  gridsPerHit: number | null
  meanVolume: number | null
  /** null s’il n’y a aucun tirage, ou si la médiane est au-delà de 3 σ (voir medianBeyond). */
  medianRequired: number | null
  medianBeyond: boolean
}

export type ParameterRank = {
  id: ErrorAxisId
  label: string
  medianAbsZ: number | null
  bindingCount: number
  outsideCount: number
}

export type CatchPoint = {
  margin: number
  caught: number
  rate: number
}

export type PasReport = {
  windows: number
  openCount: number
  openRate: number
  /** Tirages que les couches de niveau contenaient et que le pas a exclus. */
  excluded: number
  /** Grilles en moins, somme sur les tirages notés, par rapport aux couches de niveau. */
  stakeSaved: number
  meanGrids: number | null
  gridsPerHit: number | null
  baselineMeanGrids: number | null
  baselineGridsPerHit: number | null
}

export type NextForecast = {
  lookback: HistoricLookback
  learn: LearnConfig
  numbers: StackProposal
  stars: StackProposal
  numberState: StackState
  starState: StackState
  grids: number
}

export type HistoricGame = {
  horizon: number
  available: number
  inWindow: number
  lookback: HistoricLookbackChoice
  margin: MarginStep
  layers: HistoricLayers
  rows: HistoricGameRow[]
  summary: HistoricSummary
  ranks: ParameterRank[]
  curve: CatchPoint[]
  next: NextForecast | null
  pas: PasReport | null
}

export function snapMargin(margin: number): MarginStep {
  if (!Number.isFinite(margin)) return DEFAULT_MARGIN
  let best: MarginStep = MARGIN_STEPS[0]
  let gap = Number.POSITIVE_INFINITY
  for (const step of MARGIN_STEPS) {
    const distance = Math.abs(step - margin)
    if (distance < gap) {
      gap = distance
      best = step
    }
  }
  return best
}

export function formatMargin(margin: number) {
  const text = margin.toLocaleString("fr-FR", { maximumFractionDigits: 2 })
  return `${text} σ`
}

export function formatRequired(margin: number | null) {
  if (margin == null) return "hors 3 σ"
  return formatMargin(margin)
}

/** Bande entière moyenne ± k·σ. Même arrondi que proposeBand en méthode mean_std. */
export function bandFromMoments(
  mean: number,
  sigma: number,
  k: number,
  theoretical: { lo: number; hi: number }
) {
  const width = Number.isFinite(k) ? Math.max(0, k) : 1
  let lo = mean - width * sigma
  let hi = mean + width * sigma
  lo = Math.max(theoretical.lo, Math.floor(lo))
  hi = Math.min(theoretical.hi, Math.ceil(hi))
  if (lo > hi) {
    const mid = Math.round((lo + hi) / 2)
    lo = Math.min(theoretical.hi, Math.max(theoretical.lo, mid))
    hi = lo
  }
  return { lo, hi }
}

function pointOf(date: string, values: number[]): WindowPoint {
  return {
    date,
    sum: values.reduce((total, value) => total + value, 0),
    even: values.reduce((total, value) => total + (value % 2 === 0 ? 1 : 0), 0),
    ranks: values,
  }
}

function strictlyIncreasing(values: number[], pool: number) {
  return values.every(
    (value, index) =>
      Number.isInteger(value) && value >= 1 && value <= pool && (index === 0 || value > values[index - 1])
  )
}

export function pairDraws(draws: HistoricDraw[]): PairedDraw[] {
  const paired: PairedDraw[] = []
  for (const item of draws) {
    const numbers = [...item.numbers].sort((a, b) => a - b)
    const stars = [...item.stars].sort((a, b) => a - b)
    if (!strictlyIncreasing(numbers, 50) || numbers.length !== 5) continue
    if (!strictlyIncreasing(stars, 12) || stars.length !== 2) continue
    paired.push({
      date: item.date,
      numbers,
      stars,
      numberPoint: pointOf(item.date, numbers),
      starPoint: pointOf(item.date, stars),
    })
  }
  paired.sort((a, b) => a.date.localeCompare(b.date) || a.numbers.join().localeCompare(b.numbers.join()))
  return paired
}

function stackKey(state: StackState) {
  const layers = state.layers.map((layer) => (layer.enabled ? "1" : "0")).join("")
  const slots = state.slots.map((band) => `${band.lo}:${band.hi}`).join(",")
  return `${state.kind}|${layers}|${state.minSum}:${state.maxSum}|${state.minEven}:${state.maxEven}|${slots}`
}

function countCached(cache: Map<string, number>, state: StackState) {
  const key = stackKey(state)
  const found = cache.get(key)
  if (found != null) return found
  const count = countStack(state)
  cache.set(key, count)
  return count
}

export function constrainedStack(kind: PoolKind, proposal: StackProposal, layers: HistoricLayers): StackState {
  let state = applyProposal(defaultStack(kind), proposal)
  state = setLayerEnabled(state, "sum", layers.sum)
  state = setLayerEnabled(state, "parity", layers.parity)
  state = setLayerEnabled(state, "slots", layers.slots)
  return state
}

function actualOf(draw: PairedDraw, axis: AxisSpec) {
  const point = axis.pool === "numbers" ? draw.numberPoint : draw.starPoint
  if (axis.layer === "sum") return point.sum
  if (axis.layer === "parity") return point.even
  return point.ranks[axis.slot]
}

function theoreticalOf(axis: AxisSpec) {
  if (axis.layer === "sum") {
    const bounds = sumBounds(axis.pool)
    return { lo: bounds.min, hi: bounds.max }
  }
  if (axis.layer === "parity") return { lo: 0, hi: drawSize(axis.pool) }
  return theoreticalSlot(axis.pool, axis.slot)
}

function residual(actual: number, mean: number, sigma: number) {
  if (!(sigma > 0)) return actual === mean ? 0 : null
  return (actual - mean) / sigma
}

function requiredForValue(actual: number, mean: number, sigma: number, theoretical: { lo: number; hi: number }) {
  for (const step of MARGIN_STEPS) {
    const band = bandFromMoments(mean, sigma, step, theoretical)
    if (actual >= band.lo && actual <= band.hi) return step
  }
  return null
}

function readingsAt(paired: PairedDraw[], t: number, lookback: HistoricLookback, layers: HistoricLayers) {
  const from = t - lookback
  return ERROR_AXES.map((axis) => {
    const series: number[] = []
    for (let index = from; index < t; index += 1) series.push(actualOf(paired[index], axis))
    const mean = meanOf(series)
    const sigma = sampleStd(series)
    const actual = actualOf(paired[t], axis)
    return {
      id: axis.id,
      label: axis.label,
      pool: axis.pool,
      layer: axis.layer,
      enabled: layers[axis.layer],
      mean,
      sigma,
      actual,
      delta: actual - mean,
      z: residual(actual, mean, sigma),
      required: requiredForValue(actual, mean, sigma, theoreticalOf(axis)),
    } satisfies AxisReading
  })
}

function jointRequired(axes: AxisReading[]) {
  let max = 0
  let any = false
  for (const axis of axes) {
    if (!axis.enabled) continue
    any = true
    if (axis.required == null) return null
    if (axis.required > max) max = axis.required
  }
  return any ? max : 0
}

function bindingOf(axes: AxisReading[]): ErrorAxisId | null {
  let best: AxisReading | null = null
  for (const axis of axes) {
    if (!axis.enabled) continue
    if (!best) {
      best = axis
      continue
    }
    const requiredGap = rankRequired(axis.required) - rankRequired(best.required)
    if (requiredGap > 0 || (requiredGap === 0 && rankAbs(axis.z) > rankAbs(best.z))) best = axis
  }
  return best?.id ?? null
}

function rankRequired(value: number | null) {
  return value == null ? Number.POSITIVE_INFINITY : value
}

function rankAbs(value: number | null) {
  return value == null ? Number.POSITIVE_INFINITY : Math.abs(value)
}

function medianNumbers(values: number[]) {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 1) return sorted[mid]
  return (sorted[mid - 1] + sorted[mid]) / 2
}

function medianRank(values: Array<number | null>) {
  if (values.length === 0) return null
  const ranks = values.map((value) => rankRequired(value)).sort((a, b) => a - b)
  const mid = Math.floor(ranks.length / 2)
  const picked = ranks.length % 2 === 1 ? ranks[mid] : (ranks[mid - 1] + ranks[mid]) / 2
  return picked
}

function chooseLookback(t: number, table: Array<Array<number | null> | undefined>): HistoricLookback | null {
  let best: HistoricLookback | null = null
  let bestMedian = Number.POSITIVE_INFINITY
  for (const lookback of HISTORIC_LOOKBACKS) {
    const priors: Array<number | null> = []
    for (let s = t - 1; s >= lookback && priors.length < AUTO_PRIOR_WINDOW; s -= 1) {
      const row = table[s]
      if (!row) continue
      priors.push(row[LOOKBACK_INDEX[lookback]])
    }
    if (priors.length < AUTO_MIN_PRIORS) continue
    const median = medianRank(priors)
    if (median == null) continue
    if (best == null || median < bestMedian) {
      best = lookback
      bestMedian = median
    }
  }
  if (best != null) return best
  if (t >= FALLBACK_LOOKBACK) return FALLBACK_LOOKBACK
  return null
}

function isLookback(value: number): value is HistoricLookback {
  return (HISTORIC_LOOKBACKS as readonly number[]).includes(value)
}

export function prepareHistoric(
  draws: HistoricDraw[],
  query: {
    horizon?: number
    lookback: HistoricLookbackChoice
    layers?: HistoricLayers
  }
): HistoricPrepared {
  const horizon = Math.max(1, query.horizon ?? HISTORIC_HORIZON)
  const layers = query.layers ?? DEFAULT_HISTORIC_LAYERS
  const paired = pairDraws(draws)
  const fixed = query.lookback === HISTORIC_AUTO ? null : isLookback(query.lookback) ? query.lookback : FALLBACK_LOOKBACK
  const cache = new Map<string, AxisReading[]>()
  const read = (t: number, lookback: HistoricLookback) => {
    const key = `${t}|${lookback}|${layers.sum ? 1 : 0}${layers.parity ? 1 : 0}${layers.slots ? 1 : 0}`
    const found = cache.get(key)
    if (found) return found
    const axes = readingsAt(paired, t, lookback, layers)
    cache.set(key, axes)
    return axes
  }
  const table: Array<Array<number | null> | undefined> = new Array(paired.length)
  if (query.lookback === HISTORIC_AUTO) {
    for (let t = 0; t < paired.length; t += 1) {
      table[t] = HISTORIC_LOOKBACKS.map((lookback) => (t >= lookback ? jointRequired(read(t, lookback)) : null))
    }
  }
  const start = Math.max(0, paired.length - horizon)
  const rows: PreparedRow[] = []
  for (let t = start; t < paired.length; t += 1) {
    const chosen = fixed ? (t >= fixed ? fixed : null) : chooseLookback(t, table)
    if (chosen == null || t < chosen) continue
    const axes = read(t, chosen)
    rows.push({
      index: t,
      date: paired[t].date,
      numbers: paired[t].numbers,
      stars: paired[t].stars,
      chosenLookback: chosen,
      axes,
      requiredMargin: jointRequired(axes),
      binding: bindingOf(axes),
      vector: axes.map((axis) => axis.z),
    })
  }
  const nextLookback = fixed ?? chooseLookback(paired.length, table)
  return {
    horizon,
    available: paired.length,
    inWindow: paired.length - start,
    lookback: query.lookback === HISTORIC_AUTO ? HISTORIC_AUTO : fixed ?? FALLBACK_LOOKBACK,
    layers,
    rows,
    nextLookback,
    paired,
    cache: new Map(),
  }
}

function learnAt(margin: MarginStep): LearnConfig {
  return { method: "mean_std", k: margin, percentile: 5 }
}

export type HistoricPlayer = {
  /** Une mise. `true` quand la partie est complète. */
  step(): boolean
  result(): HistoricGame | null
}

function pasOn(layers: HistoricLayers) {
  return layers.pas === true
}

function levelMeans(points: WindowPoint[]) {
  if (points.length === 0) return []
  const width = points[0].ranks.length
  return Array.from({ length: width }, (_, index) => meanOf(points.map((point) => point.ranks[index])))
}

/** Bandes de pas à partir des tirages d’avant. Le tirage noté n’est pas dans `points`. */
function deltaProposal(
  kind: PoolKind,
  points: WindowPoint[],
  proposal: StackProposal,
  layers: HistoricLayers,
  k: number
) {
  const baseSlots = layers.slots ? proposal.slots : theoreticalSlots(kind)
  if (!pasOn(layers) || points.length === 0) {
    return { proposal, slots: baseSlots, open: false, impossible: false }
  }
  const reading = readDeltaLayer(kind, points)
  const last = points[points.length - 1].ranks
  const applied = applyDeltaLayer(kind, baseSlots, last, levelMeans(points), reading, k)
  return {
    proposal: { ...proposal, slots: applied.slots },
    slots: applied.slots,
    open: reading.open,
    impossible: applied.impossible,
  }
}

function stackForPlay(
  kind: PoolKind,
  proposal: StackProposal,
  layers: HistoricLayers,
  slots: { lo: number; hi: number }[],
  usePas: boolean,
  impossible = false
) {
  const state = constrainedStack(
    kind,
    { ...proposal, slots },
    { ...layers, slots: layers.slots || usePas }
  )
  if (impossible) {
    state.minSum = 1
    state.maxSum = 0
  }
  return state
}

/** Décompte des mises par tirage, pour laisser le fil du navigateur respirer. */
export function createHistoricPlayer(prepared: HistoricPrepared, margin: number): HistoricPlayer {
  const snapped = snapMargin(margin)
  const config = learnAt(snapped)
  const layers = prepared.layers
  const rows: HistoricGameRow[] = []
  const usePas = pasOn(layers)
  let cursor = 0
  let hits = 0
  let numberHits = 0
  let starHits = 0
  let totalGrids = 0
  let baselineGrids = 0
  let baselineHits = 0
  let openCount = 0
  let excluded = 0
  let done: HistoricGame | null = null

  return {
    step() {
      if (done) return true
      if (cursor < prepared.rows.length) {
        const row = prepared.rows[cursor]
        cursor += 1
        const from = row.index - row.chosenLookback
        const train = prepared.paired.slice(from, row.index)
        const numberPoints = train.map((item) => item.numberPoint)
        const starPoints = train.map((item) => item.starPoint)
        const numbers = proposeStack("numbers", numberPoints, config)
        const stars = proposeStack("stars", starPoints, config)
        const numberDelta = deltaProposal("numbers", numberPoints, numbers, layers, snapped)
        const starDelta = deltaProposal("stars", starPoints, stars, layers, snapped)
        const sample = prepared.paired[row.index]
        const numberLevel = coversPoint(sample.numberPoint, numbers, layers)
        const starLevel = coversPoint(sample.starPoint, stars, layers)
        const numberHit =
          numberLevel &&
          (!usePas || (!numberDelta.impossible && deltaCovers(sample.numberPoint.ranks, numberDelta.slots)))
        const starHit =
          starLevel && (!usePas || (!starDelta.impossible && deltaCovers(sample.starPoint.ranks, starDelta.slots)))
        const playedNumbers = usePas ? numberDelta.proposal : numbers
        const playedStars = usePas ? starDelta.proposal : stars
        const grids =
          countCached(
            prepared.cache,
            stackForPlay(
              "numbers",
              playedNumbers,
              layers,
              usePas ? numberDelta.slots : numbers.slots,
              usePas,
              usePas && numberDelta.impossible
            )
          ) *
          countCached(
            prepared.cache,
            stackForPlay(
              "stars",
              playedStars,
              layers,
              usePas ? starDelta.slots : stars.slots,
              usePas,
              usePas && starDelta.impossible
            )
          )
        if (usePas) {
          const plain =
            countCached(prepared.cache, constrainedStack("numbers", numbers, layers)) *
            countCached(prepared.cache, constrainedStack("stars", stars, layers))
          baselineGrids += plain
          if (numberLevel && starLevel) baselineHits += 1
          if (numberDelta.open || starDelta.open) openCount += 1
          if (numberLevel && starLevel && !(numberHit && starHit)) excluded += 1
        }
        const hit = numberHit && starHit
        if (hit) hits += 1
        if (numberHit) numberHits += 1
        if (starHit) starHits += 1
        totalGrids += grids
        rows.push({
          date: row.date,
          numbers: row.numbers,
          stars: row.stars,
          chosenLookback: row.chosenLookback,
          axes: row.axes,
          requiredMargin: row.requiredMargin,
          binding: row.binding,
          hit,
          numberHit,
          starHit,
          grids,
          vector: row.vector,
        })
        if (cursor < prepared.rows.length) return false
      }
      const n = rows.length
      const meanGrids = n > 0 ? totalGrids / n : null
      const median = medianRank(rows.map((row) => row.requiredMargin))
      const medianBeyond = median != null && !Number.isFinite(median)
      const ranks: ParameterRank[] = ERROR_AXES.filter((axis) => layers[axis.layer]).map((axis) => {
        const abs: number[] = []
        let bindingCount = 0
        let outsideCount = 0
        for (const row of rows) {
          const reading = row.axes.find((item) => item.id === axis.id)
          if (!reading) continue
          if (reading.z != null) abs.push(Math.abs(reading.z))
          if (row.binding === axis.id) bindingCount += 1
          if (reading.required == null || reading.required > snapped) outsideCount += 1
        }
        return {
          id: axis.id,
          label: axis.label,
          medianAbsZ: medianNumbers(abs),
          bindingCount,
          outsideCount,
        }
      })
      ranks.sort(
        (a, b) =>
          b.bindingCount - a.bindingCount ||
          b.outsideCount - a.outsideCount ||
          (b.medianAbsZ ?? -1) - (a.medianAbsZ ?? -1) ||
          a.label.localeCompare(b.label, "fr")
      )
      const curve: CatchPoint[] = MARGIN_STEPS.map((step) => {
        const caught = rows.filter((row) => row.requiredMargin != null && row.requiredMargin <= step).length
        return { margin: step, caught, rate: n > 0 ? caught / n : 0 }
      })
      let next: NextForecast | null = null
      if (prepared.nextLookback != null && prepared.paired.length >= prepared.nextLookback) {
        const train = prepared.paired.slice(-prepared.nextLookback)
        const numberPoints = train.map((item) => item.numberPoint)
        const starPoints = train.map((item) => item.starPoint)
        const numbers = proposeStack("numbers", numberPoints, config)
        const stars = proposeStack("stars", starPoints, config)
        const numberDelta = deltaProposal("numbers", numberPoints, numbers, layers, snapped)
        const starDelta = deltaProposal("stars", starPoints, stars, layers, snapped)
        const playedNumbers = usePas ? numberDelta.proposal : numbers
        const playedStars = usePas ? starDelta.proposal : stars
        const numberState = stackForPlay(
          "numbers",
          playedNumbers,
          layers,
          usePas ? numberDelta.slots : numbers.slots,
          usePas,
          usePas && numberDelta.impossible
        )
        const starState = stackForPlay(
          "stars",
          playedStars,
          layers,
          usePas ? starDelta.slots : stars.slots,
          usePas,
          usePas && starDelta.impossible
        )
        next = {
          lookback: prepared.nextLookback,
          learn: config,
          numbers: playedNumbers,
          stars: playedStars,
          numberState,
          starState,
          grids: countCached(prepared.cache, numberState) * countCached(prepared.cache, starState),
        }
      }
      done = {
        horizon: prepared.horizon,
        available: prepared.available,
        inWindow: prepared.inWindow,
        lookback: prepared.lookback,
        margin: snapped,
        layers,
        rows,
        summary: {
          n,
          hits,
          rate: n > 0 ? hits / n : 0,
          numberHits,
          starHits,
          meanGrids,
          totalGrids: n > 0 ? totalGrids : null,
          gridsPerHit: hits > 0 ? totalGrids / hits : null,
          meanVolume: meanGrids == null || !TOTAL_GRIDS ? null : meanGrids / TOTAL_GRIDS,
          medianRequired: median == null || medianBeyond ? null : median,
          medianBeyond,
        },
        ranks,
        curve,
        next,
        pas: usePas
          ? {
              windows: n,
              openCount,
              openRate: n > 0 ? openCount / n : 0,
              excluded,
              stakeSaved: baselineGrids - totalGrids,
              meanGrids,
              gridsPerHit: hits > 0 ? totalGrids / hits : null,
              baselineMeanGrids: n > 0 ? baselineGrids / n : null,
              baselineGridsPerHit: baselineHits > 0 ? baselineGrids / baselineHits : null,
            }
          : null,
      }
      return true
    },
    result() {
      return done
    },
  }
}

export function playHistoric(prepared: HistoricPrepared, margin: number): HistoricGame {
  const player = createHistoricPlayer(prepared, margin)
  while (!player.step()) {
    /* le fil de test n’a pas à rendre la main */
  }
  const game = player.result()
  if (!game) throw new Error("partie historique incomplète")
  return game
}

export function historicGame(
  draws: HistoricDraw[],
  query: {
    horizon?: number
    lookback: HistoricLookbackChoice
    margin: number
    layers?: HistoricLayers
  }
): HistoricGame {
  return playHistoric(
    prepareHistoric(draws, {
      horizon: query.horizon,
      lookback: query.lookback,
      layers: query.layers,
    }),
    query.margin
  )
}
