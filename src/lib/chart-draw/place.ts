import { canonicalFigure, isChannelFigure, labelOf } from "../chartisme/catalog"
import { synthCurve } from "../chartisme/sketch-shapes"

import {
  FREE_FIGURE,
  type ChartSketch,
  type SketchBand,
  type SketchPoint,
} from "./types"

/** En-dessous, le gabarit n'a plus de forme lisible (même seuil que le bloc-croquis). */
export const MIN_SKETCH_BARS = 8

export function windowBarCount(from: number, to: number) {
  return Math.abs(to - from) + 1
}

export function windowTooShort(from: number, to: number, min = MIN_SKETCH_BARS) {
  return windowBarCount(from, to) < min
}

export function sampleTemplate(template: number[], u: number) {
  if (!template.length) return 0
  if (template.length === 1) return template[0]
  const t = Math.min(1, Math.max(0, u)) * (template.length - 1)
  const lo = Math.floor(t)
  const hi = Math.min(template.length - 1, lo + 1)
  const frac = t - lo
  return template[lo] * (1 - frac) + template[hi] * frac
}

/**
 * Pose le gabarit dans la fenêtre [from, to] : le temps vient des ancres,
 * l'amplitude épouse min/max de la série réelle pour coller au tracé.
 */
export function fitTemplateToWindow(
  template: number[],
  values: number[],
  dates: string[],
  from: number,
  to: number
): SketchPoint[] {
  const i0 = Math.min(from, to)
  const i1 = Math.max(from, to)
  if (i0 < 0 || i1 >= values.length || i1 < i0) return []
  const count = i1 - i0 + 1
  const slice = values.slice(i0, i1 + 1)
  const tMin = Math.min(...template)
  const tMax = Math.max(...template)
  const tSpan = tMax - tMin
  const sMin = Math.min(...slice)
  const sMax = Math.max(...slice)
  const sSpan = sMax - sMin
  const points: SketchPoint[] = []
  for (let k = 0; k < count; k += 1) {
    const u = count === 1 ? 0 : k / (count - 1)
    const tVal = template.length ? sampleTemplate(template, u) : slice[k]
    let actual: number
    if (!template.length) {
      actual = slice[k]
    } else if (tSpan < 1e-12) {
      actual = sMin + sSpan / 2
    } else if (sSpan < 1e-12) {
      const amp = Math.max(1, Math.abs(tMax - tMin) || Math.abs(tMax) * 0.05 || 1)
      actual = sMin + ((tVal - tMin) / tSpan - 0.5) * amp
    } else {
      actual = sMin + ((tVal - tMin) / tSpan) * sSpan
    }
    points.push({
      index: i0 + k,
      date: dates[i0 + k] ?? "",
      actual,
    })
  }
  return points
}

/** Droite entre les deux ancres : le temps vient des tirages, Y interpolé. */
export function straightSegment(
  values: number[],
  dates: string[],
  from: number,
  to: number,
  actuals?: { from?: number; to?: number }
): SketchPoint[] {
  const i0 = Math.min(from, to)
  const i1 = Math.max(from, to)
  if (i0 < 0 || i1 >= values.length || i1 < i0) return []
  const fromActual = actuals?.from ?? values[from]
  const toActual = actuals?.to ?? values[to]
  const yAt = (index: number) => {
    if (index === from && Number.isFinite(fromActual)) return fromActual
    if (index === to && Number.isFinite(toActual)) return toActual
    return values[index]
  }
  const y0 = yAt(i0)
  const y1 = yAt(i1)
  const span = i1 - i0
  const points: SketchPoint[] = []
  for (let i = i0; i <= i1; i += 1) {
    const u = span === 0 ? 0 : (i - i0) / span
    points.push({
      index: i,
      date: dates[i] ?? "",
      actual: y0 + (y1 - y0) * u,
    })
  }
  return points
}

function leastSquares(ys: number[]): { intercept: number; slope: number } {
  const n = ys.length
  if (n <= 0) return { intercept: 0, slope: 0 }
  if (n === 1) return { intercept: ys[0], slope: 0 }
  let sumX = 0
  let sumY = 0
  let sumXY = 0
  let sumXX = 0
  for (let i = 0; i < n; i += 1) {
    const y = ys[i]
    sumX += i
    sumY += y
    sumXY += i * y
    sumXX += i * i
  }
  const denom = n * sumXX - sumX * sumX
  const slope = denom === 0 ? 0 : (n * sumXY - sumX * sumY) / denom
  const intercept = (sumY - slope * sumX) / n
  return { intercept, slope }
}

export type SketchGeometry = {
  points: SketchPoint[]
  band?: SketchBand
}

/**
 * Canal : deux droites parallèles autour de la série.
 *
 * La pente vient d'une régression sur la fenêtre (le corps de la courbe, pas
 * seulement les deux clics). Chaque rail est décalé de la résiduelle max
 * au-dessus / en dessous, plus une petite marge pour rester visiblement
 * autour du tracé.
 */
export function fitChannelBand(
  values: number[],
  dates: string[],
  from: number,
  to: number
): SketchGeometry {
  const i0 = Math.min(from, to)
  const i1 = Math.max(from, to)
  if (i0 < 0 || i1 >= values.length || i1 < i0) return { points: [] }
  const slice = values.slice(i0, i1 + 1)
  const { intercept, slope } = leastSquares(slice)
  let maxRes = 0
  let minRes = 0
  const mid: number[] = []
  for (let k = 0; k < slice.length; k += 1) {
    const fitted = intercept + slope * k
    mid.push(fitted)
    const res = slice[k] - fitted
    if (res > maxRes) maxRes = res
    if (res < minRes) minRes = res
  }
  const span = Math.max(...slice) - Math.min(...slice)
  const pad = Math.max(span * 0.03, Math.abs(slice[0] ?? 0) * 0.008, 0.35)
  const above = Math.max(maxRes, 0) + pad
  const below = Math.min(minRes, 0) - pad
  const points: SketchPoint[] = []
  const upper: SketchPoint[] = []
  const lower: SketchPoint[] = []
  for (let k = 0; k < slice.length; k += 1) {
    const index = i0 + k
    const date = dates[index] ?? ""
    points.push({ index, date, actual: mid[k] })
    upper.push({ index, date, actual: mid[k] + above })
    lower.push({ index, date, actual: mid[k] + below })
  }
  return { points, band: { upper, lower } }
}

export function channelTilt(band: SketchBand | undefined): "up" | "down" | "flat" | null {
  if (!band || band.upper.length < 2 || band.lower.length < 2) return null
  const rise = band.upper[band.upper.length - 1].actual - band.upper[0].actual
  const height = Math.abs(band.upper[0].actual - band.lower[0].actual)
  if (Math.abs(rise) < Math.max(0.15 * height, 1e-6)) return "flat"
  return rise > 0 ? "up" : "down"
}

export function channelLabel(figure: string, band?: SketchBand): string {
  if (figure === FREE_FIGURE || figure === "free") return "Segment libre"
  const base = labelOf(figure)
  if (!isChannelFigure(figure)) return base
  const tilt = channelTilt(band)
  if (tilt === "up") return "Canal haussier"
  if (tilt === "down") return "Canal baissier"
  return base
}

export function buildSketchGeometry(options: {
  figure: string
  values: number[]
  dates: string[]
  from: number
  to: number
  fromActual?: number
  toActual?: number
}): SketchGeometry {
  const { figure, values, dates, from, to, fromActual, toActual } = options
  if (isChannelFigure(figure)) return fitChannelBand(values, dates, from, to)
  const actuals =
    fromActual != null || toActual != null ? { from: fromActual, to: toActual } : undefined
  if (figure === FREE_FIGURE) {
    return { points: straightSegment(values, dates, from, to, actuals) }
  }
  const template = synthCurve(figure)
  if (!template.length) return { points: straightSegment(values, dates, from, to, actuals) }
  return { points: fitTemplateToWindow(template, values, dates, from, to) }
}

export function buildSketchPoints(options: {
  figure: string
  values: number[]
  dates: string[]
  from: number
  to: number
  fromActual?: number
  toActual?: number
}): SketchPoint[] {
  return buildSketchGeometry(options).points
}

export function resolveSketchBand(
  sketch: Pick<ChartSketch, "figure" | "band" | "start" | "end">,
  values: number[],
  dates: string[]
): SketchBand | undefined {
  if (sketch.band && sketch.band.upper.length >= 2 && sketch.band.lower.length >= 2) {
    return sketch.band
  }
  if (!isChannelFigure(sketch.figure)) return undefined
  return fitChannelBand(values, dates, sketch.start.index, sketch.end.index).band
}

function remapPoints(points: SketchPoint[], dates: string[]): SketchPoint[] {
  return points
    .map((point) => {
      const index = point.date ? dates.indexOf(point.date) : -1
      if (index < 0) return null
      return { ...point, index }
    })
    .filter((point): point is SketchPoint => point != null)
}

/** Recale une annotation quand la fenêtre de tirages change, par date. */
export function remapSketch(sketch: ChartSketch, dates: string[]): ChartSketch | null {
  const startIndex = dates.indexOf(sketch.start.date)
  const endIndex = dates.indexOf(sketch.end.date)
  if (startIndex < 0 || endIndex < 0) return null
  const points = remapPoints(sketch.points, dates)
  if (points.length < 2) return null
  const band = sketch.band
    ? {
        upper: remapPoints(sketch.band.upper, dates),
        lower: remapPoints(sketch.band.lower, dates),
      }
    : undefined
  const validBand =
    band && band.upper.length >= 2 && band.lower.length >= 2 ? band : sketch.band
  return {
    ...sketch,
    figure: canonicalFigure(sketch.figure) === "canal" ? "canal" : sketch.figure,
    start: { ...sketch.start, index: startIndex },
    end: { ...sketch.end, index: endIndex },
    points,
    band: validBand,
  }
}
