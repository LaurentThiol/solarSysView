/**
 * Paire de rails chartistes : contacts, classification, hauteur, médiane.
 *
 * Le zigzag d'école reste un gabarit pédagogique. Ici la géométrie affichée
 * passe par les pivots de touche, pas par l'enveloppe des moindres carrés.
 * L'erreur LS ne sert qu'à scorer la confiance.
 */

import {
  canonicalFigure,
  isParallelRailFigure,
  isRailFigure,
  type FigureId,
  type SlopeBias,
} from "./catalog"

export const FLAT_SLOPE = 0.12

/** Pente et ordonnée à l'origine. */
export type Line = [number, number]

export type TouchPoint = {
  index: number
  price: number
}

export type RailSample = {
  index: number
  date: string
  actual: number
}

export type BoundVerdict = {
  figure: FigureId
  expected: "up" | "down" | "any"
}

export type RailPair = {
  upper: Line
  lower: Line
  median: Line
  first: number
  last: number
  height: number
  slopeBias: SlopeBias
  lsError: number
  verdict: BoundVerdict | null
}

const TEMPLATE_SLOPES: Record<string, { up: number; low: number }> = {
  wedge_rising: { up: 0.7, low: 1.45 },
  wedge_falling: { up: -1.45, low: -0.7 },
  triangle_sym: { up: -0.68, low: 0.68 },
  triangle_asc: { up: 0, low: 0.7 },
  triangle_desc: { up: -0.7, low: 0 },
  rectangle: { up: 0, low: 0 },
  canal: { up: 0.85, low: 0.85 },
  broadening_top: { up: 1.25, low: -1.25 },
}

export function lineAt(line: Line, index: number) {
  return line[0] * index + line[1]
}

export function lineThrough(
  a: { index: number; price: number },
  b: { index: number; price: number }
): Line | null {
  const dx = b.index - a.index
  if (Math.abs(dx) < 1e-12) return null
  const slope = (b.price - a.price) / dx
  return [slope, a.price - slope * a.index]
}

export function lineThroughSlope(
  point: { index: number; price: number },
  slope: number
): Line {
  return [slope, point.price - slope * point.index]
}

export function medianLine(upper: Line, lower: Line): Line {
  return [(upper[0] + lower[0]) / 2, (upper[1] + lower[1]) / 2]
}

export function fitLsLine(points: TouchPoint[]): Line | null {
  if (points.length < 2) return null
  const n = points.length
  let sumX = 0
  let sumY = 0
  let sumXY = 0
  let sumXX = 0
  for (const point of points) {
    sumX += point.index
    sumY += point.price
    sumXY += point.index * point.price
    sumXX += point.index * point.index
  }
  const den = n * sumXX - sumX * sumX
  if (Math.abs(den) < 1e-12) return null
  const slope = (n * sumXY - sumX * sumY) / den
  return [slope, (sumY - slope * sumX) / n]
}

export function lineFitError(line: Line, points: TouchPoint[]) {
  if (!points.length) return 0
  let total = 0
  for (const point of points) total += Math.abs(point.price - lineAt(line, point.index))
  return total / points.length
}

/**
 * Rail appuyée sur les contacts : tous les autres pivots du même côté restent
 * du bon côté (ε relatif), et on garde la paire la plus longue avec le plus
 * de touches.
 */
export function fitSupportingLine(
  points: TouchPoint[],
  side: "upper" | "lower",
  eps: number,
  scale: number
): Line | null {
  if (points.length < 2) return null
  const sorted = [...points].sort((a, b) => a.index - b.index)
  const tol = Math.max(eps * scale, 1e-9)
  let best: { line: Line; touches: number; span: number } | null = null
  for (let i = 0; i < sorted.length; i += 1) {
    for (let j = i + 1; j < sorted.length; j += 1) {
      const line = lineThrough(sorted[i], sorted[j])
      if (!line) continue
      let ok = true
      let touches = 0
      for (const point of sorted) {
        const residual = point.price - lineAt(line, point.index)
        if (side === "upper" && residual > tol) {
          ok = false
          break
        }
        if (side === "lower" && residual < -tol) {
          ok = false
          break
        }
        if (Math.abs(residual) <= tol) touches += 1
      }
      if (!ok) continue
      const span = sorted[j].index - sorted[i].index
      if (
        !best ||
        touches > best.touches ||
        (touches === best.touches && span > best.span)
      ) {
        best = { line, touches, span }
      }
    }
  }
  if (best) return best.line
  return lineThrough(sorted[0], sorted[sorted.length - 1])
}

function orderRails(left: Line, right: Line, at: number): [Line, Line] {
  return lineAt(left, at) >= lineAt(right, at) ? [left, right] : [right, left]
}

/** Bornes ajustées → (figure, sens attendu de la cassure). */
export function classifyBounds(
  upper: Line,
  lower: Line,
  first: number,
  last: number
): BoundVerdict | null {
  const width = last - first
  if (width <= 0) return null
  const h0 = lineAt(upper, first) - lineAt(lower, first)
  const h1 = lineAt(upper, last) - lineAt(lower, last)
  if (h0 <= 0) return null
  const flat = (FLAT_SLOPE * h0) / width
  const up = upper[0]
  const low = lower[0]
  const upFlat = Math.abs(up) <= flat
  const lowFlat = Math.abs(low) <= flat
  const ratio = h1 / h0
  if (ratio < 0.75) {
    if (up > flat && low > flat) return { figure: "wedge_rising", expected: "down" }
    if (up < -flat && low < -flat) return { figure: "wedge_falling", expected: "up" }
    if (upFlat && low > flat) return { figure: "triangle_asc", expected: "up" }
    if (lowFlat && up < -flat) return { figure: "triangle_desc", expected: "down" }
    if (up < -flat && low > flat) return { figure: "triangle_sym", expected: "any" }
    return null
  }
  if (ratio > 1.3) {
    if (up > flat && low < -flat) return { figure: "broadening_top", expected: "down" }
    return null
  }
  if (upFlat && lowFlat) return { figure: "rectangle", expected: "any" }
  const parallel =
    Math.abs(up - low) <= Math.max(2 * flat, 0.3 * (Math.abs(up) + Math.abs(low)) / 2)
  if (parallel) return { figure: "canal", expected: "any" }
  return null
}

export function slopeBiasOf(
  upper: Line,
  lower: Line,
  first: number,
  last: number
): SlopeBias {
  const width = Math.max(1, last - first)
  const height = Math.abs(lineAt(upper, first) - lineAt(lower, first))
  const slope = (upper[0] + lower[0]) / 2
  const flat = (FLAT_SLOPE * Math.max(height, 1e-9)) / width
  if (Math.abs(slope) <= flat) return "flat"
  return slope > 0 ? "up" : "down"
}

function asPair(
  upper: Line,
  lower: Line,
  highs: TouchPoint[],
  lows: TouchPoint[],
  lsError: number
): RailPair | null {
  const idx = [...highs, ...lows].map((point) => point.index)
  if (!idx.length) return null
  const first = Math.min(...idx)
  const last = Math.max(...idx)
  const [hi, lo] = orderRails(upper, lower, first)
  let usedUpper = hi
  let usedLower = lo
  let verdict = classifyBounds(usedUpper, usedLower, first, last)
  if (verdict?.figure === "rectangle") {
    const top = Math.max(...highs.map((point) => point.price))
    const bottom = Math.min(...lows.map((point) => point.price))
    if (top <= bottom) return null
    usedUpper = [0, top]
    usedLower = [0, bottom]
    verdict = { figure: "rectangle", expected: "any" }
  }
  const height = lineAt(usedUpper, first) - lineAt(usedLower, first)
  if (height <= 0) return null
  return {
    upper: usedUpper,
    lower: usedLower,
    median: medianLine(usedUpper, usedLower),
    first,
    last,
    height,
    slopeBias: slopeBiasOf(usedUpper, usedLower, first, last),
    lsError,
    verdict,
  }
}

/**
 * Ajuste une paire de rails sur des touches H/L.
 *
 * Géométrie : contacts (rails passantes). Si elles ne classent rien, repli
 * sur les moindres carrés pour ne pas perdre une lecture nette. Le score
 * reste l'erreur LS dans les deux cas.
 */
export function fitRailPair(
  highs: TouchPoint[],
  lows: TouchPoint[],
  options: { eps: number; scale: number }
): RailPair | null {
  if (highs.length < 2 || lows.length < 2) return null
  const lsUpper = fitLsLine(highs)
  const lsLower = fitLsLine(lows)
  const lsError =
    lsUpper && lsLower
      ? (lineFitError(lsUpper, highs) + lineFitError(lsLower, lows)) / options.scale
      : 1
  const contactUpper = fitSupportingLine(highs, "upper", options.eps, options.scale)
  const contactLower = fitSupportingLine(lows, "lower", options.eps, options.scale)
  if (contactUpper && contactLower) {
    const contact = asPair(contactUpper, contactLower, highs, lows, lsError)
    if (contact?.verdict) return contact
  }
  if (lsUpper && lsLower) {
    const ls = asPair(lsUpper, lsLower, highs, lows, lsError)
    if (ls?.verdict) return ls
  }
  return null
}

function templateSlope(figure: string, which: "up" | "low", height: number, width: number) {
  const spec = TEMPLATE_SLOPES[canonicalFigure(figure)]
  const raw = spec ? spec[which] : 0
  return (raw * height) / Math.max(1, width)
}

/** Pente de la seconde borne, contrainte par la figure choisie. */
export function secondRailSlope(
  figure: string,
  first: Line,
  firstIsUpper: boolean,
  width: number,
  height: number
) {
  const id = canonicalFigure(figure)
  if (id === "rectangle") return 0
  if (id === "canal") return first[0]
  if (id === "triangle_sym") return -first[0]
  const rise = Math.max(Math.abs(first[0]), (0.7 * height) / Math.max(1, width))
  if (id === "triangle_asc") return firstIsUpper ? rise : 0
  if (id === "triangle_desc") return firstIsUpper ? 0 : -rise
  const spec = TEMPLATE_SLOPES[id]
  if (!spec) return first[0]
  const other = firstIsUpper ? spec.low : spec.up
  const self = firstIsUpper ? spec.up : spec.low
  if (Math.abs(self) > 1e-9) return first[0] * (other / self)
  return templateSlope(id, firstIsUpper ? "low" : "up", height, width)
}

function firstRailLine(
  figure: string,
  a: { index: number; actual: number },
  b: { index: number; actual: number }
): Line | null {
  if (canonicalFigure(figure) === "rectangle") {
    return [0, a.actual]
  }
  return lineThrough(
    { index: a.index, price: a.actual },
    { index: b.index, price: b.actual }
  )
}

function oppositeExtreme(
  first: Line,
  values: number[],
  firstIndex: number,
  lastIndex: number
): { index: number; actual: number } | null {
  let bestIndex = firstIndex
  let bestAbs = -1
  for (let index = firstIndex; index <= lastIndex; index += 1) {
    const value = values[index]
    if (!Number.isFinite(value)) continue
    const abs = Math.abs(value - lineAt(first, index))
    if (abs >= bestAbs) {
      bestAbs = abs
      bestIndex = index
    }
  }
  if (bestAbs < 0) return null
  return { index: bestIndex, actual: values[bestIndex] }
}

export function sampleRails(
  upper: Line,
  lower: Line,
  dates: string[],
  first: number,
  last: number
): { upper: RailSample[]; lower: RailSample[]; median: RailSample[]; mid: RailSample[] } {
  const i0 = Math.min(first, last)
  const i1 = Math.max(first, last)
  const upperPts: RailSample[] = []
  const lowerPts: RailSample[] = []
  const medianPts: RailSample[] = []
  const mid: RailSample[] = []
  const midline = medianLine(upper, lower)
  for (let index = i0; index <= i1; index += 1) {
    const date = dates[index] ?? ""
    const hi = lineAt(upper, index)
    const lo = lineAt(lower, index)
    upperPts.push({ index, date, actual: hi })
    lowerPts.push({ index, date, actual: lo })
    medianPts.push({ index, date, actual: lineAt(midline, index) })
    mid.push({ index, date, actual: (hi + lo) / 2 })
  }
  return { upper: upperPts, lower: lowerPts, median: medianPts, mid }
}

export type ConstructedRails = {
  upper: Line
  lower: Line
  median: Line
  first: number
  last: number
  height: number
  slopeBias: SlopeBias
  samples: ReturnType<typeof sampleRails>
}

/**
 * Construction à la main : une borne (A–B), puis l'autre par C — parallèle
 * pour le canal / rectangle, contrainte de figure pour triangles et biseaux.
 * Sans C, la seconde borne passe par l'extrême opposé de la fenêtre.
 */
export function constructRails(options: {
  figure: string
  dates: string[]
  a: { index: number; actual: number }
  b: { index: number; actual: number }
  c?: { index: number; actual: number }
  values?: number[]
}): ConstructedRails | null {
  const { figure, dates, a, b, c, values } = options
  if (!isRailFigure(figure)) return null
  const firstLine = firstRailLine(figure, a, b)
  if (!firstLine) return null
  const spanIndexes = [a.index, b.index, ...(c ? [c.index] : [])]
  const first = Math.min(...spanIndexes)
  const last = Math.max(...spanIndexes)
  if (last <= first) return null
  const seedHeight = Math.max(
    Math.abs(a.actual - b.actual),
    c ? Math.abs(a.actual - c.actual) : 0,
    1
  )
  let third = c
  if (!third && values?.length) {
    third = oppositeExtreme(firstLine, values, first, last) ?? undefined
  }
  if (!third) {
    const fallback = lineThroughSlope(
      { index: a.index, price: a.actual - seedHeight },
      firstLine[0]
    )
    third = { index: last, actual: lineAt(fallback, last) }
  }
  const firstIsUpper = lineAt(firstLine, third.index) >= third.actual
  const width = last - first
  let second: Line
  if (isParallelRailFigure(figure) || canonicalFigure(figure) === "canal") {
    const slope = canonicalFigure(figure) === "rectangle" ? 0 : firstLine[0]
    second = lineThroughSlope({ index: third.index, price: third.actual }, slope)
  } else {
    const slope = secondRailSlope(figure, firstLine, firstIsUpper, width, seedHeight)
    second = lineThroughSlope({ index: third.index, price: third.actual }, slope)
  }
  const [upper, lower] = orderRails(firstLine, second, first)
  const height = lineAt(upper, first) - lineAt(lower, first)
  if (height <= 0) return null
  return {
    upper,
    lower,
    median: medianLine(upper, lower),
    first,
    last,
    height,
    slopeBias: slopeBiasOf(upper, lower, first, last),
    samples: sampleRails(upper, lower, dates, first, last),
  }
}

/** Objectif pédagogique : report de la hauteur depuis la cassure, ou la dernière barre. */
export function projectRailTarget(
  values: number[],
  upper: Line,
  lower: Line,
  last: number,
  expected: "up" | "down" | "any" = "any"
): { value: number; direction: "up" | "down"; index: number } | null {
  const height = lineAt(upper, last) - lineAt(lower, last)
  if (height <= 0 || !values.length) return null
  for (let index = last + 1; index < values.length; index += 1) {
    const value = values[index]
    if (value > lineAt(upper, index) && expected !== "down") {
      return { value: value + height, direction: "up", index }
    }
    if (value < lineAt(lower, index) && expected !== "up") {
      return { value: value - height, direction: "down", index }
    }
  }
  const origin = values[Math.min(values.length - 1, Math.max(last, 0))]
  const direction = expected === "down" ? "down" : "up"
  return {
    value: direction === "down" ? origin - height : origin + height,
    direction,
    index: Math.min(values.length - 1, Math.max(last, 0)),
  }
}
