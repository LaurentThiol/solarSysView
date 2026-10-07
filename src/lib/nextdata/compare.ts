/** Grille prévue contre grille sortie : communs, étendue, consécutifs. */

import { gridShape, type GridShape } from "@/lib/nextdata/shape"

export type ComparedGrid = {
  numbers: number[]
  stars: number[]
}

export type GridCompare = {
  actual: GridShape
  forecast: GridShape | null
  gap: GridShape | null
  numberHits: number[]
  starHits: number[]
}

export const SHAPE_KEYS = ["spread", "consecutive", "starSpread", "starConsecutive"] as const

export type ShapeKey = (typeof SHAPE_KEYS)[number]

/** Valeurs de `left` qui sont aussi dans `right`, dans l’ordre de `left`. */
export function sharedValues(left: number[], right: number[]) {
  const pool = new Set(right)
  const seen = new Set<number>()
  const found: number[] = []
  for (const value of left) {
    if (!pool.has(value) || seen.has(value)) continue
    seen.add(value)
    found.push(value)
  }
  return found
}

export function compareGrids(actual: ComparedGrid, forecast: ComparedGrid | null): GridCompare {
  const actualShape = gridShape(actual.numbers, actual.stars)
  if (!forecast || forecast.numbers.length === 0) {
    return { actual: actualShape, forecast: null, gap: null, numberHits: [], starHits: [] }
  }
  const forecastShape = gridShape(forecast.numbers, forecast.stars)
  return {
    actual: actualShape,
    forecast: forecastShape,
    gap: {
      spread: forecastShape.spread - actualShape.spread,
      consecutive: forecastShape.consecutive - actualShape.consecutive,
      starSpread: forecastShape.starSpread - actualShape.starSpread,
      starConsecutive: forecastShape.starConsecutive - actualShape.starConsecutive,
    },
    numberHits: sharedValues(actual.numbers, forecast.numbers),
    starHits: sharedValues(actual.stars, forecast.stars),
  }
}

export function meanOf(values: number[]) {
  if (values.length === 0) return null
  return values.reduce((total, value) => total + value, 0) / values.length
}

/** Entier signé, même écriture que le tableau des rangs. */
export function formatSigned(value: number) {
  if (!Number.isFinite(value)) return "—"
  if (value > 0) return `+${value}`
  return String(value)
}

/** Une décimale, virgule française. Le signe n’apparaît que si `signed` est vrai. */
export function formatDecimal(value: number, signed = false) {
  if (!Number.isFinite(value)) return "—"
  const rounded = Math.round(value * 10) / 10
  const body = Math.abs(rounded).toFixed(1).replace(".", ",")
  if (rounded > 0) return signed ? `+${body}` : body
  if (rounded < 0) return `-${body}`
  return "0,0"
}
