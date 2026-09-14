/** Forme d’une grille 5+2 : décennies, étendue, consécutifs. */

export const DECADE_COUNT = 5
export const DECADE_LABELS = ["1–10", "11–20", "21–30", "31–40", "41–50"] as const
export const DECADE_MAX_PER = 5

export const NUMBER_SPREAD_MIN = 4
export const NUMBER_SPREAD_MAX = 49
export const NUMBER_CONSEC_MIN = 0
export const NUMBER_CONSEC_MAX = 4

export const STAR_SPREAD_MIN = 1
export const STAR_SPREAD_MAX = 11
export const STAR_CONSEC_MIN = 0
export const STAR_CONSEC_MAX = 1

export type ShapeBands = {
  minSpread: number
  maxSpread: number
  minConsecutive: number
  maxConsecutive: number
  decadeMin: number[]
  decadeMax: number[]
}

export function decadeIndex(value: number) {
  if (value < 1) return 0
  return Math.min(DECADE_COUNT - 1, Math.floor((value - 1) / 10))
}

export function decadeCounts(values: number[]) {
  const counts = [0, 0, 0, 0, 0]
  for (const value of values) counts[decadeIndex(value)] += 1
  return counts
}

export function decadeOccupied(counts: number[]) {
  return counts.reduce((total, item) => total + (item > 0 ? 1 : 0), 0)
}

export function decadePeak(counts: number[]) {
  return counts.reduce((peak, item) => Math.max(peak, item), 0)
}

export function spreadOf(values: number[]) {
  if (values.length === 0) return 0
  let min = values[0]
  let max = values[0]
  for (let i = 1; i < values.length; i += 1) {
    const value = values[i]
    if (value < min) min = value
    if (value > max) max = value
  }
  return max - min
}

export function consecutiveCount(values: number[]) {
  const set = new Set(values)
  let count = 0
  for (const value of set) if (set.has(value + 1)) count += 1
  return count
}

export function defaultNumberShape(): ShapeBands {
  return {
    minSpread: NUMBER_SPREAD_MIN,
    maxSpread: NUMBER_SPREAD_MAX,
    minConsecutive: NUMBER_CONSEC_MIN,
    maxConsecutive: NUMBER_CONSEC_MAX,
    decadeMin: [0, 0, 0, 0, 0],
    decadeMax: [DECADE_MAX_PER, DECADE_MAX_PER, DECADE_MAX_PER, DECADE_MAX_PER, DECADE_MAX_PER],
  }
}

export function defaultStarShape(): ShapeBands {
  return {
    minSpread: STAR_SPREAD_MIN,
    maxSpread: STAR_SPREAD_MAX,
    minConsecutive: STAR_CONSEC_MIN,
    maxConsecutive: STAR_CONSEC_MAX,
    decadeMin: [0, 0, 0, 0, 0],
    decadeMax: [DECADE_MAX_PER, DECADE_MAX_PER, DECADE_MAX_PER, DECADE_MAX_PER, DECADE_MAX_PER],
  }
}

export function shapeIsRestricted(bands: ShapeBands, withDecades: boolean) {
  const fallback = withDecades ? defaultNumberShape() : defaultStarShape()
  if (bands.minSpread > fallback.minSpread || bands.maxSpread < fallback.maxSpread) {
    return true
  }
  if (
    bands.minConsecutive > fallback.minConsecutive ||
    bands.maxConsecutive < fallback.maxConsecutive
  ) {
    return true
  }
  if (!withDecades) return false
  for (let i = 0; i < DECADE_COUNT; i += 1) {
    if ((bands.decadeMin[i] ?? 0) > 0 || (bands.decadeMax[i] ?? DECADE_MAX_PER) < DECADE_MAX_PER) {
      return true
    }
  }
  return false
}

/**
 * Deux listes déjà triées (imposées + optionnelles choisies).
 * Pas d’allocation : min/max, consécutifs et décennies en une passe.
 */
export function mergedPassesShape(
  forced: number[],
  picked: number[],
  bands: ShapeBands,
  withDecades: boolean
) {
  let i = 0
  let j = 0
  let prev = Number.NEGATIVE_INFINITY
  let consec = 0
  let min = Number.POSITIVE_INFINITY
  let max = 0
  let count = 0
  const decades = withDecades ? [0, 0, 0, 0, 0] : null
  while (i < forced.length || j < picked.length) {
    let value: number
    if (j >= picked.length || (i < forced.length && forced[i] <= picked[j])) {
      value = forced[i]
      i += 1
    } else {
      value = picked[j]
      j += 1
    }
    count += 1
    if (value < min) min = value
    if (value > max) max = value
    if (value === prev + 1) consec += 1
    prev = value
    if (decades) decades[decadeIndex(value)] += 1
  }
  if (count === 0) return bands.minSpread <= 0 && bands.minConsecutive <= 0
  const spread = max - min
  if (spread < bands.minSpread || spread > bands.maxSpread) return false
  if (consec < bands.minConsecutive || consec > bands.maxConsecutive) return false
  if (decades) {
    for (let d = 0; d < DECADE_COUNT; d += 1) {
      if (decades[d] < (bands.decadeMin[d] ?? 0) || decades[d] > (bands.decadeMax[d] ?? DECADE_MAX_PER)) {
        return false
      }
    }
  }
  return true
}

export function comboPassesShape(
  values: number[],
  bands: ShapeBands,
  withDecades: boolean
) {
  if (values.length === 0) {
    return bands.minSpread <= 0 && bands.minConsecutive <= 0
  }
  const spread = spreadOf(values)
  if (spread < bands.minSpread || spread > bands.maxSpread) return false
  const consec = consecutiveCount(values)
  if (consec < bands.minConsecutive || consec > bands.maxConsecutive) return false
  if (withDecades) {
    const decades = decadeCounts(values)
    for (let i = 0; i < DECADE_COUNT; i += 1) {
      if (decades[i] < (bands.decadeMin[i] ?? 0) || decades[i] > (bands.decadeMax[i] ?? DECADE_MAX_PER)) {
        return false
      }
    }
  }
  return true
}
