import { rankStepLaw, type OrderRankKey } from "../delta-chance.ts"
import {
  numberCoherence,
  numberCoherenceTheory,
  starCoherence,
  starCoherenceTheory,
  variationCoherence,
} from "../delta-coherence.ts"
import { shuffleMeanAbs, shuffleSeed, summarizeEdgeMotion } from "../delta-evol.ts"
import { drawSize, theoreticalSlot, theoreticalSlots, type PoolKind, type SlotBand } from "./bounds.ts"
import { meanOf, sampleStd, type WindowPoint } from "./learn.ts"
import { cloneStack, layerEnabled, setLayerEnabled, type StackState } from "./state.ts"

/** En dessous, le mélange et la loi ne se départagent pas. */
const MIN_POINTS = 8
/** |Δ| observé hors de ± cette part de la loi théorique : écart net. */
const THEORY_RATIO = 0.75
/** Cohérence moyenne au-delà de la théorie, et du seuil « même sens » / « contraires ». */
const COHERENCE_GAP = 0.15
const SAME_FLOOR = 0.75
const SPLIT_CEILING = 0.35
const SHUFFLE_TRIALS = 80

const NUMBER_KEYS = ["n1", "n2", "n3", "n4", "n5"] as const
const STAR_KEYS = ["e1", "e2"] as const

export type DeltaGate = "closed" | "persist" | "repel"
export type EdgeGate = "closed" | "slide" | "split"

export type DeltaRankReading = {
  key: OrderRankKey
  gate: DeltaGate
  mean: number
  sigma: number
  meanAbs: number
  theoryAbs: number
  shuffleLow: number
  shuffleHigh: number
}

export type DeltaLayerReading = {
  open: boolean
  ranks: DeltaRankReading[]
  edge: EdgeGate
  /** +1 les bords montent ensemble, −1 ils descendent, 0 pas de sens commun. */
  edgeSign: -1 | 0 | 1
}

export type DeltaApplyResult = {
  slots: SlotBand[]
  open: boolean
  edgeMoved: boolean
  /** L’intersection avec le pas est vide : aucune grille ne reste. */
  impossible: boolean
}

function rankKeys(kind: PoolKind): readonly OrderRankKey[] {
  return kind === "numbers" ? NUMBER_KEYS : STAR_KEYS
}

function deltasOf(levels: number[]) {
  const deltas: number[] = []
  for (let index = 1; index < levels.length; index += 1) {
    deltas.push(levels[index] - levels[index - 1])
  }
  return deltas
}

function gateOf(meanAbs: number, theoryAbs: number, low: number, high: number): DeltaGate {
  const clear = Math.abs(meanAbs - theoryAbs) >= Math.max(1, THEORY_RATIO * theoryAbs)
  const margin = Math.max(0.5, (high - low) * 0.25, theoryAbs * 0.1)
  const outside = meanAbs < low - margin || meanAbs > high + margin
  if (!outside && !clear) return "closed"
  if (meanAbs < theoryAbs) return "persist"
  if (meanAbs > theoryAbs) return "repel"
  return "closed"
}

function edgeOf(kind: PoolKind, points: WindowPoint[]): { edge: EdgeGate; edgeSign: -1 | 0 | 1 } {
  const scores: number[] = []
  const edgeSteps: Array<{ n1: number | null; n5: number | null }> = []
  for (let index = 1; index < points.length; index += 1) {
    const prev = points[index - 1].ranks
    const curr = points[index].ranks
    const steps = curr.map((value, slot) => value - prev[slot])
    const score = kind === "numbers"
      ? numberCoherence({
          n1: steps[0] ?? null,
          n2: steps[1] ?? null,
          n3: steps[2] ?? null,
          n4: steps[3] ?? null,
          n5: steps[4] ?? null,
          e1: null,
          e2: null,
        })
      : starCoherence({
          n1: null,
          n2: null,
          n3: null,
          n4: null,
          n5: null,
          e1: steps[0] ?? null,
          e2: steps[1] ?? null,
        })
    if (score != null) scores.push(score)
    if (kind === "numbers") edgeSteps.push({ n1: steps[0] ?? null, n5: steps[4] ?? null })
    else edgeSteps.push({ n1: steps[0] ?? null, n5: steps[1] ?? null })
  }
  if (scores.length === 0) return { edge: "closed", edgeSign: 0 }
  const average = meanOf(scores)
  const theory = kind === "numbers" ? numberCoherenceTheory() : starCoherenceTheory()
  let edge: EdgeGate = "closed"
  if (average >= theory + COHERENCE_GAP && average >= SAME_FLOOR) edge = "slide"
  else if (average <= theory - COHERENCE_GAP && average <= SPLIT_CEILING) edge = "split"
  const motion = summarizeEdgeMotion(edgeSteps)
  let edgeSign: -1 | 0 | 1 = motion.lastSlide
  if (edgeSign === 0) {
    const net = variationCoherence(edgeSteps.flatMap((step) => [step.n1, step.n5]))
    const signed = edgeSteps.reduce((sum, step) => sum + (step.n1 ?? 0) + (step.n5 ?? 0), 0)
    if (net != null && signed !== 0) edgeSign = signed > 0 ? 1 : -1
  }
  return { edge, edgeSign }
}

/** Porte par rang, puis cohérence des bords, sur la fenêtre antérieure seule. */
export function readDeltaLayer(
  kind: PoolKind,
  points: WindowPoint[],
  options: { trials?: number } = {}
): DeltaLayerReading {
  const keys = rankKeys(kind)
  const trials = options.trials ?? SHUFFLE_TRIALS
  const ranks: DeltaRankReading[] = keys.map((key, index) => {
    const levels = points.map((point) => point.ranks[index]).filter((value) => Number.isFinite(value))
    const closed: DeltaRankReading = {
      key,
      gate: "closed",
      mean: 0,
      sigma: 0,
      meanAbs: 0,
      theoryAbs: rankStepLaw(key).meanAbs,
      shuffleLow: 0,
      shuffleHigh: 0,
    }
    if (levels.length < MIN_POINTS) return closed
    const steps = deltasOf(levels)
    const shuffle = shuffleMeanAbs(levels, { trials, seed: shuffleSeed(key, levels.length) })
    if (!shuffle) return closed
    const theoryAbs = rankStepLaw(key).meanAbs
    return {
      key,
      gate: gateOf(shuffle.observed, theoryAbs, shuffle.low, shuffle.high),
      mean: meanOf(steps),
      sigma: sampleStd(steps),
      meanAbs: shuffle.observed,
      theoryAbs,
      shuffleLow: shuffle.low,
      shuffleHigh: shuffle.high,
    }
  })
  const edge = points.length >= MIN_POINTS ? edgeOf(kind, points) : { edge: "closed" as const, edgeSign: 0 as const }
  const open = ranks.some((rank) => rank.gate !== "closed") || edge.edge !== "closed"
  return { open, ranks, edge: edge.edge, edgeSign: edge.edgeSign }
}

function clipBand(kind: PoolKind, index: number, lo: number, hi: number): SlotBand {
  const theo = theoreticalSlot(kind, index)
  const a = Math.min(theo.hi, Math.max(theo.lo, Math.floor(lo)))
  const b = Math.min(theo.hi, Math.max(theo.lo, Math.ceil(hi)))
  return { lo: a, hi: b }
}

function moveEdge(
  kind: PoolKind,
  slots: SlotBand[],
  last: number[],
  edge: EdgeGate,
  edgeSign: -1 | 0 | 1
): { slots: SlotBand[]; moved: boolean } {
  if (edge === "closed" || edgeSign === 0 || last.length < 2) return { slots, moved: false }
  const next = slots.map((band) => ({ ...band }))
  const left = 0
  const right = drawSize(kind) - 1
  const before = next.map((band) => ({ ...band }))
  if (edge === "slide" && edgeSign > 0) {
    next[left] = clipBand(kind, left, Math.max(next[left].lo, last[left]), next[left].hi)
    next[right] = clipBand(kind, right, Math.max(next[right].lo, last[right]), next[right].hi)
  } else if (edge === "slide" && edgeSign < 0) {
    next[left] = clipBand(kind, left, next[left].lo, Math.min(next[left].hi, last[left]))
    next[right] = clipBand(kind, right, next[right].lo, Math.min(next[right].hi, last[right]))
  } else if (edge === "split" && edgeSign > 0) {
    next[left] = clipBand(kind, left, next[left].lo, Math.min(next[left].hi, last[left]))
    next[right] = clipBand(kind, right, Math.max(next[right].lo, last[right]), next[right].hi)
  } else {
    next[left] = clipBand(kind, left, Math.max(next[left].lo, last[left]), next[left].hi)
    next[right] = clipBand(kind, right, next[right].lo, Math.min(next[right].hi, last[right]))
  }
  for (let index = 0; index < next.length; index += 1) {
    if (next[index].lo > next[index].hi) next[index] = before[index]
  }
  const moved = next.some((band, index) => band.lo !== before[index].lo || band.hi !== before[index].hi)
  return { slots: next, moved }
}

/**
 * Intersecte les espaces déjà proposés.
 * Persistance : dernier niveau + moyenne du pas ± k·σ.
 * Anti-persistance : le centre reste la moyenne des niveaux, le dernier niveau sort du voisinage.
 */
export function applyDeltaLayer(
  kind: PoolKind,
  slots: SlotBand[],
  last: number[],
  levelMeans: number[],
  reading: DeltaLayerReading,
  k: number
): DeltaApplyResult {
  const width = Number.isFinite(k) ? Math.max(0, k) : 1
  const base = theoreticalSlots(kind)
  let open = false
  let impossible = false
  const next = base.map((theo, index) => {
    const current = slots[index] ?? theo
    const rank = reading.ranks[index]
    const level = last[index]
    if (!rank || rank.gate === "closed" || !Number.isFinite(level)) return { ...current }
    open = true
    if (rank.gate === "persist") {
      const lo = Math.floor(level + rank.mean - width * rank.sigma)
      const hi = Math.ceil(level + rank.mean + width * rank.sigma)
      const band = clipBand(kind, index, Math.max(current.lo, lo), Math.min(current.hi, hi))
      if (band.lo > band.hi) {
        impossible = true
        return { ...current }
      }
      return band
    }
    const mu = levelMeans[index]
    if (!Number.isFinite(mu) || level === mu) return { ...current }
    if (level < mu) {
      const floor = Math.min(Math.floor(mu), level + 1)
      const lo = Math.max(current.lo, floor)
      if (lo > current.hi) return { ...current }
      return clipBand(kind, index, lo, current.hi)
    }
    const ceiling = Math.max(Math.ceil(mu), level - 1)
    const hi = Math.min(current.hi, ceiling)
    if (current.lo > hi) return { ...current }
    return clipBand(kind, index, current.lo, hi)
  })
  const edge = moveEdge(kind, next, last, reading.edge, reading.edgeSign)
  return {
    slots: edge.slots,
    open: open || edge.moved,
    edgeMoved: edge.moved,
    impossible,
  }
}

/** Copie comptable. Les curseurs d’espaces de l’atelier restent sur `state`. */
export function stackWithPas(state: StackState, points: WindowPoint[], k: number): { state: StackState; open: boolean } {
  if (points.length === 0) return { state, open: false }
  const reading = readDeltaLayer(state.kind, points)
  if (!reading.open) return { state, open: false }
  const base = layerEnabled(state, "slots") ? state.slots : theoreticalSlots(state.kind)
  const last = points[points.length - 1].ranks
  const means = base.map((_, index) => meanOf(points.map((point) => point.ranks[index] ?? 0)))
  const applied = applyDeltaLayer(state.kind, base, last, means, reading, k)
  let next = cloneStack(state)
  next.slots = applied.slots
  if (!layerEnabled(state, "slots")) next = setLayerEnabled(next, "slots", true)
  if (applied.impossible) {
    next.minSum = 1
    next.maxSum = 0
  }
  return { state: next, open: true }
}

export function deltaCovers(ranks: number[], slots: SlotBand[]) {
  if (ranks.length !== slots.length) return false
  return ranks.every((value, index) => value >= slots[index].lo && value <= slots[index].hi)
}
