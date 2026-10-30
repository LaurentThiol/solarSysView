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

import { NUMBER_KEYS, type CurveValues } from "./curves"

function total(values: readonly number[]) {
  return values.reduce((sum, value) => sum + value, 0)
}

const NUMBER_DRAW = 5

function openHi(index: number) {
  return NUMBER_POOL - (NUMBER_DRAW - 1 - index)
}

function stepBounds(placed: readonly number[], index: number) {
  const lo = index === 0 ? 1 : placed[index - 1] + 1
  const hi = index === placed.length - 1 ? NUMBER_POOL : placed[index + 1] - 1
  return { lo, hi }
}

/**
 * Cinq numéros distincts, triés, dont la somme vaut la cible.
 * Chaque pas réduit le carré de l’écart à la pointe : l’écart de somme se partage,
 * un rang ne va pas jusqu’au bord 10, 20, 30, 40 ou 50 pour absorber tout le reste.
 */
export function placeNumbers(tips: readonly number[], target: number) {
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
    let best = -1
    let bestCost = Number.POSITIVE_INFINITY
    for (let index = 0; index < placed.length; index += 1) {
      const { lo, hi } = stepBounds(placed, index)
      const next = placed[index] + dir
      if (next < lo || next > hi) continue
      const gap = placed[index] - sortedTips[index]
      const cost = dir * (2 * gap + dir)
      if (cost < bestCost - 1e-9) {
        best = index
        bestCost = cost
      }
    }
    if (best < 0) break
    placed[best] += dir
    sum += dir
  }
  return placed
}

/** Deux étoiles ordonnées dont la somme vaut la cible, au plus près des pointes. */
export function placeStars(tips: readonly number[], target: number) {
  const goal = clampInt(target, STAR_SUM_MIN, STAR_SUM_MAX)
  const t1 = Number.isFinite(tips[0]) ? tips[0] : 3
  const t2 = Number.isFinite(tips[1]) ? tips[1] : 8
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
 * Rappel à la somme. n1–n5 restent près de leur pensée : la décennie du rail
 * est celle de ces numéros, elle ne les cale pas sur 10, 20, 30, 40 ou 50.
 * Les étoiles suivent la somme des étoiles.
 */
export function reconcile(tips: CurveValues): Reconciled {
  const sumNumbers = clampInt(tips.sumNumbers, NUMBER_SUM_MIN, NUMBER_SUM_MAX)
  const sumStars = clampInt(tips.sumStars, STAR_SUM_MIN, STAR_SUM_MAX)
  const numbers = placeNumbers(
    NUMBER_KEYS.map((key) => tips[key]),
    sumNumbers
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
