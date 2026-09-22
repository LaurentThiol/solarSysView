import {
  drawSize,
  poolSize,
  rankLabel,
  sumBounds,
  theoreticalSlot,
  theoreticalSlots,
  type PoolKind,
  type SlotBand,
} from "./bounds.ts"
import { countStack } from "./count.ts"
import { clampStack, defaultStack, type ParityMode, type StackState } from "./state.ts"

export const ENVELOPE_METHODS = ["minmax_std", "mean_std", "percentile"] as const
export type EnvelopeMethod = (typeof ENVELOPE_METHODS)[number]

export const ENVELOPE_METHOD_LABELS: Record<EnvelopeMethod, string> = {
  minmax_std: "min/max ± k·σ",
  mean_std: "moyenne ± k·σ",
  percentile: "percentiles",
}

export type LearnConfig = {
  method: EnvelopeMethod
  /** Multiplicateur d’écart-type (min/max ± kσ ou moyenne ± kσ). */
  k: number
  /** Queue basse en % (5 → P5–P95). */
  percentile: number
}

export const DEFAULT_LEARN: LearnConfig = {
  method: "minmax_std",
  k: 1,
  percentile: 5,
}

export type WindowPoint = {
  date: string
  sum: number
  even: number
  ranks: number[]
}

export type BandProposal = { lo: number; hi: number }

export type StackProposal = {
  minSum: number
  maxSum: number
  minEven: number
  maxEven: number
  slots: SlotBand[]
  parityMode: ParityMode
  observedEvenMode: number | null
}

export type CoverageReport = {
  n: number
  hits: number
  rate: number
  meanVolume: number | null
}

export function defaultLearn(): LearnConfig {
  return { ...DEFAULT_LEARN }
}

export function pointsFromDraws(
  kind: PoolKind,
  draws: Array<{ date: string; numbers: number[]; stars: number[] }>
): WindowPoint[] {
  const draw = drawSize(kind)
  const out: WindowPoint[] = []
  for (const item of draws) {
    const values = [...(kind === "numbers" ? item.numbers : item.stars)].sort((a, b) => a - b)
    if (values.length !== draw) continue
    out.push({
      date: item.date,
      sum: values.reduce((total, value) => total + value, 0),
      even: values.reduce((total, value) => total + (value % 2 === 0 ? 1 : 0), 0),
      ranks: values,
    })
  }
  return out
}

export function meanOf(values: number[]) {
  if (values.length === 0) return 0
  return values.reduce((total, value) => total + value, 0) / values.length
}

export function sampleStd(values: number[]) {
  if (values.length < 2) return 0
  const mu = meanOf(values)
  let acc = 0
  for (const value of values) acc += (value - mu) ** 2
  return Math.sqrt(acc / (values.length - 1))
}

export function percentileAt(sorted: number[], p: number) {
  if (sorted.length === 0) return 0
  const t = Math.min(1, Math.max(0, p))
  const index = t === 1 ? sorted.length - 1 : Math.floor(t * (sorted.length - 1))
  return sorted[index]
}

export function modeOf(values: number[]): number | null {
  if (values.length === 0) return null
  const counts = new Map<number, number>()
  let best = values[0]
  let peak = 0
  for (const value of values) {
    const next = (counts.get(value) ?? 0) + 1
    counts.set(value, next)
    if (next > peak) {
      peak = next
      best = value
    }
  }
  return best
}

export function proposeBand(
  values: number[],
  theoretical: { lo: number; hi: number },
  config: LearnConfig
): BandProposal {
  if (values.length === 0) return { lo: theoretical.lo, hi: theoretical.hi }
  const mn = Math.min(...values)
  const mx = Math.max(...values)
  const mu = meanOf(values)
  const sd = sampleStd(values)
  const k = Number.isFinite(config.k) ? Math.max(0, config.k) : 1
  let lo: number
  let hi: number
  if (config.method === "mean_std") {
    lo = mu - k * sd
    hi = mu + k * sd
  } else if (config.method === "percentile") {
    const p = Math.min(49, Math.max(0, config.percentile)) / 100
    const sorted = [...values].sort((a, b) => a - b)
    lo = percentileAt(sorted, p)
    hi = percentileAt(sorted, 1 - p)
  } else {
    lo = mn - k * sd
    hi = mx + k * sd
  }
  lo = Math.max(theoretical.lo, Math.floor(lo))
  hi = Math.min(theoretical.hi, Math.ceil(hi))
  if (lo > hi) {
    const mid = Math.round((lo + hi) / 2)
    lo = Math.min(theoretical.hi, Math.max(theoretical.lo, mid))
    hi = lo
  }
  return { lo, hi }
}

export function proposeStack(
  kind: PoolKind,
  points: WindowPoint[],
  config: LearnConfig,
  parityMode: ParityMode = "observed"
): StackProposal {
  const sums = sumBounds(kind)
  const draw = drawSize(kind)
  const fallback = theoreticalSlots(kind)
  if (points.length === 0) {
    return {
      minSum: sums.min,
      maxSum: sums.max,
      minEven: 0,
      maxEven: draw,
      slots: fallback,
      parityMode,
      observedEvenMode: null,
    }
  }
  const sumBand = proposeBand(
    points.map((point) => point.sum),
    { lo: sums.min, hi: sums.max },
    config
  )
  const evenBand = proposeBand(
    points.map((point) => point.even),
    { lo: 0, hi: draw },
    config
  )
  const slots = fallback.map((theo, i) =>
    proposeBand(
      points.map((point) => point.ranks[i]).filter((value) => Number.isFinite(value)),
      theo,
      config
    )
  )
  return {
    minSum: sumBand.lo,
    maxSum: sumBand.hi,
    minEven: evenBand.lo,
    maxEven: evenBand.hi,
    slots,
    parityMode,
    observedEvenMode: modeOf(points.map((point) => point.even)),
  }
}

export function applyProposal(state: StackState, proposal: StackProposal): StackState {
  const next = clampStack({
    ...state,
    minSum: proposal.minSum,
    maxSum: proposal.maxSum,
    minEven: proposal.minEven,
    maxEven: proposal.maxEven,
    slots: proposal.slots,
    parityMode: proposal.parityMode,
  })
  return next
}

export function pointCovered(point: WindowPoint, proposal: StackProposal) {
  if (point.sum < proposal.minSum || point.sum > proposal.maxSum) return false
  if (point.even < proposal.minEven || point.even > proposal.maxEven) return false
  if (point.ranks.length !== proposal.slots.length) return false
  return point.ranks.every((value, i) => value >= proposal.slots[i].lo && value <= proposal.slots[i].hi)
}

export function walkForwardCoverage(
  history: WindowPoint[],
  windowStart: number,
  lookback: number,
  kind: PoolKind,
  config: LearnConfig
): CoverageReport {
  const start = Math.min(history.length, Math.max(0, windowStart))
  const back = Math.max(5, Math.round(lookback) || 20)
  let n = 0
  let hits = 0
  let volumeAcc = 0
  let volumeN = 0
  const base = defaultStack(kind)
  for (let t = start; t < history.length; t += 1) {
    const from = Math.max(0, t - back)
    if (t - from < 5) continue
    const train = history.slice(from, t)
    const proposal = proposeStack(kind, train, config)
    n += 1
    if (pointCovered(history[t], proposal)) hits += 1
    const counted = countStack(
      applyProposal(base, proposal)
    )
    volumeAcc += counted / (kind === "numbers" ? 2_118_760 : 66)
    volumeN += 1
  }
  return {
    n,
    hits,
    rate: n > 0 ? hits / n : 0,
    meanVolume: volumeN > 0 ? volumeAcc / volumeN : null,
  }
}

export function proposalSummary(kind: PoolKind, proposal: StackProposal) {
  const slots = proposal.slots
    .map((band, i) => `${rankLabel(kind, i)} ${band.lo}–${band.hi}`)
    .join(" · ")
  return `Σ ${proposal.minSum}–${proposal.maxSum} · ${proposal.minEven}–${proposal.maxEven} pairs · ${slots}`
}

export function theoreticalForRank(kind: PoolKind, index: number) {
  return theoreticalSlot(kind, index)
}

export function poolExtent(_kind: PoolKind) {
  return { lo: 1, hi: poolSize(_kind) }
}
