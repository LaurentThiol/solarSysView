import { decadeCounts } from "@/lib/grid-shape"
import {
  clampInt,
  NUMBER_POOL,
  NUMBER_SUM_MAX,
  NUMBER_SUM_MIN,
  STAR_POOL,
  STAR_SUM_MAX,
  STAR_SUM_MIN,
} from "@/lib/pronostic/bounds"

import { DECADE_KEYS, NUMBER_KEYS, type CurveValues } from "./curves"

function total(values: readonly number[]) {
  return values.reduce((sum, value) => sum + value, 0)
}

const NUMBER_DRAW = 5
const DECADE_CENTERS = [5.5, 15.5, 25.5, 35.5, 45.5] as const
const DECADE_SIGMA = 6.5
const DECADE_WEIGHT = 18

function openHi(index: number) {
  return NUMBER_POOL - (NUMBER_DRAW - 1 - index)
}

function stepBounds(placed: readonly number[], index: number) {
  const lo = index === 0 ? 1 : placed[index - 1] + 1
  const hi = index === placed.length - 1 ? NUMBER_POOL : placed[index + 1] - 1
  return { lo, hi }
}

function softDecadeWeights(value: number) {
  const raw = DECADE_CENTERS.map((center) =>
    Math.exp(-((value - center) ** 2) / (2 * DECADE_SIGMA * DECADE_SIGMA))
  )
  const sum = total(raw)
  return sum > 0 ? raw.map((item) => item / sum) : [0.2, 0.2, 0.2, 0.2, 0.2]
}

function softDecadeCounts(placed: readonly number[]) {
  const counts = [0, 0, 0, 0, 0]
  for (const value of placed) {
    const weights = softDecadeWeights(value)
    for (let index = 0; index < DECADE_CENTERS.length; index += 1) {
      counts[index] += weights[index]
    }
  }
  return counts
}

function decadeProfile(decadeTips?: readonly number[]) {
  if (!decadeTips || decadeTips.length < DECADE_CENTERS.length) return null
  const clamped = Array.from({ length: DECADE_CENTERS.length }, (_, index) => {
    const value = decadeTips[index]
    return Number.isFinite(value) ? Math.min(NUMBER_DRAW, Math.max(0, value)) : 1
  })
  const mean = total(clamped) / DECADE_CENTERS.length
  const variance =
    clamped.reduce((sum, value) => sum + (value - mean) ** 2, 0) / DECADE_CENTERS.length
  if (variance < 1e-6) return null
  const mass = total(clamped)
  return mass > 0 ? clamped.map((value) => (value / mass) * NUMBER_DRAW) : null
}

function placementEnergy(
  placed: readonly number[],
  sortedTips: readonly number[],
  profile: readonly number[] | null
) {
  let energy = 0
  for (let index = 0; index < NUMBER_DRAW; index += 1) {
    const gap = placed[index] - sortedTips[index]
    energy += gap * gap
  }
  if (profile) {
    const counts = softDecadeCounts(placed)
    for (let index = 0; index < DECADE_CENTERS.length; index += 1) {
      const diff = counts[index] - profile[index]
      energy += DECADE_WEIGHT * diff * diff
    }
  }
  return energy
}

/**
 * Cinq numéros distincts, triés, dont la somme vaut la cible.
 * Chaque pas réduit le carré de l’écart à la pointe et un terme doux de décennie :
 * l’écart de somme se partage, un rang ne va pas jusqu’au bord 10, 20, 30, 40 ou 50
 * pour absorber tout le reste.
 */
export function placeNumbers(
  tips: readonly number[],
  target: number,
  decadeTips?: readonly number[]
) {
  const profile = decadeProfile(decadeTips)
  const sortedTips = Array.from({ length: NUMBER_DRAW }, (_, index) => {
    const value = tips[index]
    return Number.isFinite(value) ? value : 25
  }).sort((a, b) => a - b)
  const placed: number[] = []
  for (let index = 0; index < NUMBER_DRAW; index += 1) {
    const lo = placed.length === 0 ? 1 : placed[placed.length - 1] + 1
    const hi = Math.max(lo, openHi(index))
    placed.push(clampInt(sortedTips[index], lo, hi))
  }
  const goal = clampInt(target, NUMBER_SUM_MIN, NUMBER_SUM_MAX)
  let sum = total(placed)
  for (let guard = 0; guard < 2000 && sum !== goal; guard += 1) {
    const dir = goal > sum ? 1 : -1
    const baseEnergy = placementEnergy(placed, sortedTips, profile)
    let best = -1
    let bestCost = Number.POSITIVE_INFINITY
    for (let index = 0; index < placed.length; index += 1) {
      const { lo, hi } = stepBounds(placed, index)
      const next = placed[index] + dir
      if (next < lo || next > hi) continue
      placed[index] = next
      const cost = placementEnergy(placed, sortedTips, profile) - baseEnergy
      placed[index] -= dir
      if (cost < bestCost - 1e-9) {
        best = index
        bestCost = cost
      }
    }
    if (best < 0) break
    placed[best] += dir
    sum += dir
  }
  if (profile) {
    for (let guard = 0; guard < 200; guard += 1) {
      const baseEnergy = placementEnergy(placed, sortedTips, profile)
      let bestUp = -1
      let bestDown = -1
      let bestDelta = 0
      for (let up = 0; up < NUMBER_DRAW; up += 1) {
        for (let down = 0; down < NUMBER_DRAW; down += 1) {
          if (up === down) continue
          placed[up] += 1
          placed[down] -= 1
          const valid =
            placed[0] >= 1 &&
            placed[NUMBER_DRAW - 1] <= NUMBER_POOL &&
            placed[0] < placed[1] &&
            placed[1] < placed[2] &&
            placed[2] < placed[3] &&
            placed[3] < placed[4]
          if (valid) {
            const delta = placementEnergy(placed, sortedTips, profile) - baseEnergy
            if (delta < bestDelta - 1e-9) {
              bestDelta = delta
              bestUp = up
              bestDown = down
            }
          }
          placed[up] -= 1
          placed[down] += 1
        }
      }
      if (bestUp < 0) break
      placed[bestUp] += 1
      placed[bestDown] -= 1
    }
  }
  return placed
}

/**
 * Deux étoiles ordonnées dont la somme vaut la cible, au plus près des pointes.
 * Les pointes se trient d’abord, comme pour les numéros : la plus basse va à e1, la plus haute à e2.
 */
export function placeStars(tips: readonly number[], target: number) {
  const goal = clampInt(target, STAR_SUM_MIN, STAR_SUM_MAX)
  const first = Number.isFinite(tips[0]) ? tips[0] : 3
  const second = Number.isFinite(tips[1]) ? tips[1] : 8
  const [t1, t2] = first <= second ? [first, second] : [second, first]
  let best: [number, number] = [1, 2]
  let bestCost = Number.POSITIVE_INFINITY
  for (let a = 1; a < STAR_POOL; a += 1) {
    const b = goal - a
    if (b <= a || b > STAR_POOL) continue
    const cost = Math.abs(a - t1) + Math.abs(b - t2)
    if (cost < bestCost) {
      best = [a, b]
      bestCost = cost
    }
  }
  return best
}

export type Reconciled = {
  cases: CurveValues
  numbers: number[]
  stars: number[]
}

/**
 * Rappel à la somme. n1–n5 restent près de leur pensée et suivent la répartition
 * de décennies visée par d0–d4, sans se caler sur 10, 20, 30, 40 ou 50.
 * Les étoiles suivent la somme des étoiles.
 */
export function reconcile(tips: CurveValues): Reconciled {
  const sumNumbers = clampInt(tips.sumNumbers, NUMBER_SUM_MIN, NUMBER_SUM_MAX)
  const sumStars = clampInt(tips.sumStars, STAR_SUM_MIN, STAR_SUM_MAX)
  const numbers = placeNumbers(
    NUMBER_KEYS.map((key) => tips[key]),
    sumNumbers,
    DECADE_KEYS.map((key) => tips[key])
  )
  const stars = placeStars([tips.e1, tips.e2], sumStars)
  const decades = decadeCounts(numbers)
  return {
    numbers,
    stars,
    cases: {
      sumNumbers,
      sumStars,
      n1: numbers[0],
      n2: numbers[1],
      n3: numbers[2],
      n4: numbers[3],
      n5: numbers[4],
      e1: stars[0],
      e2: stars[1],
      d0: decades[0],
      d1: decades[1],
      d2: decades[2],
      d3: decades[3],
      d4: decades[4],
    },
  }
}
