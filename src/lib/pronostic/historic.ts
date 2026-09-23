import { TOTAL_GRIDS, rankLabel, type PoolKind } from "./bounds.ts"
import { countStack } from "./count.ts"
import {
  applyProposal,
  coversPoint,
  proposeStack,
  type CoverLayers,
  type EnvelopeMethod,
  type LearnConfig,
  type StackProposal,
  type WindowPoint,
} from "./learn.ts"
import { defaultStack, setLayerEnabled, type StackState } from "./state.ts"

/** Tirages rejoués : les plus récents, numéros et étoiles ensemble. */
export const HISTORIC_HORIZON = 100
export const HISTORIC_LOOKBACKS = [20, 50, 100] as const
const MIN_TRAIN = 5
/** Écart (couverture − part d’univers) en dessous duquel on ne désigne pas de largeur. */
export const HISTORIC_EXCESS_GAP = 0.02
/** En dessous, l’écart peut n’être que deux ou trois tirages : pas une largeur à proposer. */
export const HISTORIC_MIN_HITS = 8

export type HistoricLayers = CoverLayers

export const DEFAULT_HISTORIC_LAYERS: HistoricLayers = {
  sum: true,
  parity: true,
  slots: true,
}

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

export type HistoricRow = {
  date: string
  numbers: number[]
  stars: number[]
  numberHit: boolean
  starHit: boolean
  hit: boolean
  grids: number
  numberReasons: string[]
  starReasons: string[]
}

export type HistoricPortrait = {
  n: number
  covered: number
  rate: number
  numberCount: number
  starCount: number
  grids: number
  numbers: StackProposal
  stars: StackProposal
}

export type HistoricReport = {
  width: number
  config: LearnConfig
  n: number
  hits: number
  rate: number
  numberHits: number
  starHits: number
  meanGrids: number | null
  medianGrids: number | null
  meanVolume: number | null
  lift: number | null
  rows: HistoricRow[]
  portrait: HistoricPortrait | null
}

export type WidthPoint = {
  width: number
  n: number
  hits: number
  rate: number
  meanGrids: number | null
  medianGrids: number | null
  meanVolume: number | null
  lift: number | null
  portraitGrids: number | null
  portraitRate: number | null
}

export type HistoricSweep = {
  horizon: number
  available: number
  studied: number
  lookback: number
  method: EnvelopeMethod
  points: WidthPoint[]
  reports: HistoricReport[]
  recommendedIndex: number
  excess: number
  separated: boolean
}

export function widthSteps(method: EnvelopeMethod): number[] {
  if (method === "percentile") return [0, 1, 2, 5, 8, 10, 15, 20, 25]
  return [0, 0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3]
}

export function formatWidth(method: EnvelopeMethod, width: number) {
  if (method === "percentile") {
    if (width <= 0) return "min–max"
    return `P${width}–P${100 - width}`
  }
  const text = width.toLocaleString("fr-FR", { maximumFractionDigits: 2 })
  return `${text} σ`
}

export function learnAtWidth(method: EnvelopeMethod, width: number): LearnConfig {
  if (method === "percentile") return { method, k: 1, percentile: width }
  return { method, k: width, percentile: 5 }
}

export function referenceWidthIndex(method: EnvelopeMethod) {
  const steps = widthSteps(method)
  const target = method === "percentile" ? 5 : 1
  let best = 0
  let gap = Number.POSITIVE_INFINITY
  steps.forEach((step, index) => {
    const distance = Math.abs(step - target)
    if (distance < gap) {
      gap = distance
      best = index
    }
  })
  return best
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

export function constrainedStack(
  kind: PoolKind,
  proposal: StackProposal,
  layers: HistoricLayers
): StackState {
  let state = applyProposal(defaultStack(kind), proposal)
  state = setLayerEnabled(state, "sum", layers.sum)
  state = setLayerEnabled(state, "parity", layers.parity)
  state = setLayerEnabled(state, "slots", layers.slots)
  return state
}

export function stacksForSettings(portrait: HistoricPortrait, layers: HistoricLayers) {
  return {
    numbers: constrainedStack("numbers", portrait.numbers, layers),
    stars: constrainedStack("stars", portrait.stars, layers),
  }
}

function outsideReasons(
  kind: PoolKind,
  point: WindowPoint,
  proposal: StackProposal,
  layers: HistoricLayers
) {
  const reasons: string[] = []
  if (layers.sum && (point.sum < proposal.minSum || point.sum > proposal.maxSum)) reasons.push("somme")
  if (layers.parity && (point.even < proposal.minEven || point.even > proposal.maxEven)) {
    reasons.push("parité")
  }
  if (layers.slots) {
    point.ranks.forEach((value, index) => {
      const band = proposal.slots[index]
      if (!band || value < band.lo || value > band.hi) reasons.push(rankLabel(kind, index))
    })
  }
  return reasons
}

function medianOf(values: number[]) {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 1) return sorted[mid]
  return (sorted[mid - 1] + sorted[mid]) / 2
}

function summarize(hits: number, n: number, grids: number[]) {
  const meanGrids = grids.length > 0 ? grids.reduce((total, value) => total + value, 0) / grids.length : null
  const meanVolume = meanGrids == null || !TOTAL_GRIDS ? null : meanGrids / TOTAL_GRIDS
  const rate = n > 0 ? hits / n : 0
  return {
    n,
    hits,
    rate,
    meanGrids,
    medianGrids: medianOf(grids),
    meanVolume,
    lift: meanVolume != null && meanVolume > 0 ? rate / meanVolume : null,
  }
}

function testIndexes(length: number, horizon: number, lookback: number) {
  const start = Math.max(0, length - Math.max(1, horizon))
  const back = Math.max(MIN_TRAIN, Math.round(lookback) || MIN_TRAIN)
  const indexes: number[] = []
  for (let t = start; t < length; t += 1) {
    const from = Math.max(0, t - back)
    if (t - from < MIN_TRAIN) continue
    indexes.push(t)
  }
  return { indexes, back }
}

export function historicReplay(
  draws: HistoricDraw[],
  horizon: number,
  lookback: number,
  config: LearnConfig,
  layers: HistoricLayers = DEFAULT_HISTORIC_LAYERS,
  cache: Map<string, number> = new Map()
): Omit<HistoricReport, "width" | "config" | "portrait"> {
  const paired = pairDraws(draws)
  const { indexes, back } = testIndexes(paired.length, horizon, lookback)
  const rows: HistoricRow[] = []
  const grids: number[] = []
  let hits = 0
  let numberHits = 0
  let starHits = 0
  for (const t of indexes) {
    const from = Math.max(0, t - back)
    const train = paired.slice(from, t)
    const numbers = proposeStack(
      "numbers",
      train.map((item) => item.numberPoint),
      config
    )
    const stars = proposeStack(
      "stars",
      train.map((item) => item.starPoint),
      config
    )
    const sample = paired[t]
    const numberHit = coversPoint(sample.numberPoint, numbers, layers)
    const starHit = coversPoint(sample.starPoint, stars, layers)
    const numberCount = countCached(cache, constrainedStack("numbers", numbers, layers))
    const starCount = countCached(cache, constrainedStack("stars", stars, layers))
    const gridCount = numberCount * starCount
    if (numberHit) numberHits += 1
    if (starHit) starHits += 1
    if (numberHit && starHit) hits += 1
    grids.push(gridCount)
    rows.push({
      date: sample.date,
      numbers: sample.numbers,
      stars: sample.stars,
      numberHit,
      starHit,
      hit: numberHit && starHit,
      grids: gridCount,
      numberReasons: numberHit ? [] : outsideReasons("numbers", sample.numberPoint, numbers, layers),
      starReasons: starHit ? [] : outsideReasons("stars", sample.starPoint, stars, layers),
    })
  }
  return {
    ...summarize(hits, rows.length, grids),
    numberHits,
    starHits,
    rows,
  }
}

export function historicPortrait(
  draws: HistoricDraw[],
  horizon: number,
  config: LearnConfig,
  layers: HistoricLayers = DEFAULT_HISTORIC_LAYERS,
  cache: Map<string, number> = new Map()
): HistoricPortrait | null {
  const paired = pairDraws(draws).slice(-Math.max(1, horizon))
  if (paired.length === 0) return null
  const numbers = proposeStack(
    "numbers",
    paired.map((item) => item.numberPoint),
    config
  )
  const stars = proposeStack(
    "stars",
    paired.map((item) => item.starPoint),
    config
  )
  let covered = 0
  for (const item of paired) {
    if (coversPoint(item.numberPoint, numbers, layers) && coversPoint(item.starPoint, stars, layers)) {
      covered += 1
    }
  }
  const numberCount = countCached(cache, constrainedStack("numbers", numbers, layers))
  const starCount = countCached(cache, constrainedStack("stars", stars, layers))
  return {
    n: paired.length,
    covered,
    rate: covered / paired.length,
    numberCount,
    starCount,
    grids: numberCount * starCount,
    numbers,
    stars,
  }
}

function toPoint(report: HistoricReport): WidthPoint {
  return {
    width: report.width,
    n: report.n,
    hits: report.hits,
    rate: report.rate,
    meanGrids: report.meanGrids,
    medianGrids: report.medianGrids,
    meanVolume: report.meanVolume,
    lift: report.lift,
    portraitGrids: report.portrait?.grids ?? null,
    portraitRate: report.portrait?.rate ?? null,
  }
}

export function recommendWidth(points: WidthPoint[]) {
  let rawExcess = Number.NEGATIVE_INFINITY
  for (const point of points) {
    if (point.n === 0 || point.meanVolume == null) continue
    rawExcess = Math.max(rawExcess, point.rate - point.meanVolume)
  }
  const excess = Number.isFinite(rawExcess) ? rawExcess : 0
  let index = 0
  let grids = Number.POSITIVE_INFINITY
  let found = false
  points.forEach((point, i) => {
    if (point.n < 30 || point.hits < HISTORIC_MIN_HITS) return
    if (point.meanVolume == null || point.meanGrids == null) return
    const gap = point.rate - point.meanVolume
    if (gap < excess - HISTORIC_EXCESS_GAP) return
    if (!found || point.meanGrids < grids) {
      found = true
      grids = point.meanGrids
      index = i
    }
  })
  return {
    index: found ? index : 0,
    excess,
    separated: found && excess >= HISTORIC_EXCESS_GAP,
  }
}

export function historicSweep(
  draws: HistoricDraw[],
  query: {
    horizon?: number
    lookback: number
    method: EnvelopeMethod
    layers?: HistoricLayers
  }
): HistoricSweep {
  const horizon = Math.max(1, query.horizon ?? HISTORIC_HORIZON)
  const layers = query.layers ?? DEFAULT_HISTORIC_LAYERS
  const paired = pairDraws(draws)
  const steps = widthSteps(query.method)
  const cache = new Map<string, number>()
  const reports: HistoricReport[] = steps.map((width) => {
    const config = learnAtWidth(query.method, width)
    const replay = historicReplay(paired, horizon, query.lookback, config, layers, cache)
    const portrait = historicPortrait(paired, horizon, config, layers, cache)
    return { width, config, ...replay, portrait }
  })
  const points = reports.map(toPoint)
  const advice = recommendWidth(points)
  return {
    horizon,
    available: paired.length,
    studied: Math.min(horizon, paired.length),
    lookback: Math.max(MIN_TRAIN, Math.round(query.lookback) || MIN_TRAIN),
    method: query.method,
    points,
    reports,
    recommendedIndex: advice.index,
    excess: advice.excess,
    separated: advice.separated,
  }
}
