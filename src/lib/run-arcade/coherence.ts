import { clampInt, NUMBER_SUM_MAX, NUMBER_SUM_MIN, STAR_POOL, STAR_SUM_MAX, STAR_SUM_MIN } from "@/lib/pronostic/bounds"

import {
  DECADE_BANDS,
  DECADE_KEYS,
  NUMBER_KEYS,
  type CurveValues,
} from "./curves"

type Band = { lo: number; hi: number }

const DRAWN = 5

function total(values: readonly number[]) {
  return values.reduce((sum, value) => sum + value, 0)
}

/** Cinq comptes entiers de 0 à 5 dont la somme vaut 5, au plus près des pointes. */
export function decadeProfile(tips: readonly number[], fallback: readonly number[]): number[] {
  const clamped = tips.map((value) => (Number.isFinite(value) ? Math.min(DRAWN, Math.max(0, value)) : 0))
  const base = total(clamped) > 0 ? clamped : fallback.map((value) => Math.max(0, value))
  const mass = total(base)
  if (mass <= 0) return [1, 1, 1, 1, 1]
  const scaled = base.map((value) => (value / mass) * DRAWN)
  const counts = scaled.map((value) => Math.floor(value))
  let left = DRAWN - total(counts)
  const order = scaled
    .map((value, index) => ({ index, frac: value - Math.floor(value) }))
    .sort((a, b) => b.frac - a.frac || a.index - b.index)
  for (const { index } of order) {
    if (left <= 0) break
    counts[index] += 1
    left -= 1
  }
  return counts
}

/** Somme la plus basse et la plus haute que ce profil permet. */
export function sumRange(counts: readonly number[]) {
  let min = 0
  let max = 0
  counts.forEach((count, index) => {
    const band = DECADE_BANDS[index]
    min += count * band.lo + (count * (count - 1)) / 2
    max += count * band.hi - (count * (count - 1)) / 2
  })
  return { min, max }
}

/**
 * La somme gagne sur la décennie. Hors de portée, un compte glisse vers la bande voisine,
 * du côté qui rapproche, jusqu’à ce que la somme soit atteignable.
 */
export function fitProfileToSum(counts: readonly number[], target: number) {
  const out = [...counts]
  for (let guard = 0; guard < 64; guard += 1) {
    const { min, max } = sumRange(out)
    if (target > max) {
      const from = out.findIndex((count, index) => count > 0 && index < out.length - 1)
      if (from < 0) break
      out[from] -= 1
      out[from + 1] += 1
      continue
    }
    if (target < min) {
      let from = -1
      for (let index = out.length - 1; index > 0; index -= 1) {
        if (out[index] > 0) {
          from = index
          break
        }
      }
      if (from < 0) break
      out[from] -= 1
      out[from - 1] += 1
      continue
    }
    break
  }
  return out
}

function bandsOf(counts: readonly number[]): Band[] {
  const bands: Band[] = []
  counts.forEach((count, index) => {
    for (let j = 0; j < count; j += 1) bands.push(DECADE_BANDS[index])
  })
  return bands
}

/** Cinq numéros triés, dans les bandes du profil, dont la somme vaut la cible. */
export function placeNumbers(counts: readonly number[], tips: readonly number[], target: number) {
  const bands = bandsOf(counts)
  const sortedTips = [...tips].map((value) => (Number.isFinite(value) ? value : 25)).sort((a, b) => a - b)
  const placed: number[] = []
  let cursor = 0
  counts.forEach((count, index) => {
    const band = DECADE_BANDS[index]
    for (let j = 0; j < count; j += 1) {
      const lo = Math.max(band.lo + j, j > 0 ? placed[cursor - 1] + 1 : band.lo)
      const hi = band.hi - (count - 1 - j)
      placed.push(clampInt(sortedTips[cursor], lo, Math.max(lo, hi)))
      cursor += 1
    }
  })
  let sum = total(placed)
  for (let guard = 0; guard < 2000 && sum !== target; guard += 1) {
    const dir = target > sum ? 1 : -1
    let best = -1
    let bestCost = Number.POSITIVE_INFINITY
    for (let index = 0; index < placed.length; index += 1) {
      const next = placed[index] + dir
      const band = bands[index]
      if (next < band.lo || next > band.hi) continue
      if (index > 0 && next <= placed[index - 1]) continue
      if (index < placed.length - 1 && next >= placed[index + 1]) continue
      const cost = Math.abs(next - sortedTips[index]) - Math.abs(placed[index] - sortedTips[index])
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
 * Rappel aux totales. Ordre : la somme des numéros, puis la décennie, puis n1–n5.
 * Les étoiles suivent la somme des étoiles.
 */
export function reconcile(tips: CurveValues, fallbackDecades: readonly number[]): Reconciled {
  const sumNumbers = clampInt(tips.sumNumbers, NUMBER_SUM_MIN, NUMBER_SUM_MAX)
  const sumStars = clampInt(tips.sumStars, STAR_SUM_MIN, STAR_SUM_MAX)
  const profile = fitProfileToSum(
    decadeProfile(
      DECADE_KEYS.map((key) => tips[key]),
      fallbackDecades
    ),
    sumNumbers
  )
  const numbers = placeNumbers(
    profile,
    NUMBER_KEYS.map((key) => tips[key]),
    sumNumbers
  )
  const stars = placeStars([tips.e1, tips.e2], sumStars)
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
      d0: profile[0],
      d1: profile[1],
      d2: profile[2],
      d3: profile[3],
      d4: profile[4],
    },
  }
}
