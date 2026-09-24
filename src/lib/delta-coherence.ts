/**
 * Cohérence d’un pas : |Σ Δ| / Σ |Δ|.
 * 1 = toute la variation va dans le même sens. 0 = les hausses annulent les baisses.
 */

const NUMBER_KEYS = ["n1", "n2", "n3", "n4", "n5"] as const
const STAR_KEYS = ["e1", "e2"] as const

export function variationCoherence(steps: Array<number | null | undefined>): number | null {
  let net = 0
  let mass = 0
  for (const step of steps) {
    if (typeof step !== "number" || !Number.isFinite(step) || step === 0) continue
    net += step
    mass += Math.abs(step)
  }
  if (mass === 0) return null
  return Math.abs(net) / mass
}

export type CoherenceReading = "same" | "split" | "mixed" | "still"

export function coherenceReading(value: number | null): CoherenceReading {
  if (value == null) return "still"
  if (value >= 0.75) return "same"
  if (value <= 0.35) return "split"
  return "mixed"
}

export function coherenceLabel(reading: CoherenceReading) {
  if (reading === "same") return "même sens"
  if (reading === "split") return "sens contraires"
  if (reading === "mixed") return "partagée"
  return "immobile"
}

type StepPoint = {
  n1: number | null
  n2: number | null
  n3: number | null
  n4: number | null
  n5: number | null
  e1: number | null
  e2: number | null
}

export function numberCoherence(point: StepPoint) {
  return variationCoherence(NUMBER_KEYS.map((key) => point[key]))
}

export function starCoherence(point: StepPoint) {
  return variationCoherence(STAR_KEYS.map((key) => point[key]))
}

function mulberry32(seed: number) {
  let state = seed >>> 0
  return () => {
    state += 0x6d2b79f5
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function sampleSorted(pool: number, draw: number, random: () => number) {
  const bag = Array.from({ length: pool }, (_, index) => index + 1)
  for (let index = 0; index < draw; index += 1) {
    const swap = index + Math.floor(random() * (pool - index))
    const current = bag[index]
    bag[index] = bag[swap]
    bag[swap] = current
  }
  return bag.slice(0, draw).sort((a, b) => a - b)
}

function meanCoherence(samples: number[]) {
  if (samples.length === 0) return 0
  return samples.reduce((sum, value) => sum + value, 0) / samples.length
}

/** Espérance de la cohérence si deux grilles indépendantes sortent de l’urne. */
export function theoreticalCoherence(pool: number, draw: number, trials = 4000, seed = 1) {
  const random = mulberry32(seed + pool * 17 + draw)
  const samples: number[] = []
  for (let trial = 0; trial < trials; trial += 1) {
    const left = sampleSorted(pool, draw, random)
    const right = sampleSorted(pool, draw, random)
    const steps = left.map((value, index) => value - right[index])
    const score = variationCoherence(steps)
    if (score != null) samples.push(score)
  }
  return meanCoherence(samples)
}

let numberTheory: number | null = null
const starTheory = new Map<number, number>()

export function numberCoherenceTheory() {
  if (numberTheory == null) numberTheory = theoreticalCoherence(50, 5)
  return numberTheory
}

export function starCoherenceTheory(pool = 12) {
  const cached = starTheory.get(pool)
  if (cached != null) return cached
  const value = theoreticalCoherence(pool, 2, pool <= 12 ? 2000 : 4000, 3)
  starTheory.set(pool, value)
  return value
}
