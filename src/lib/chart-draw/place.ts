import { synthCurve } from "../chartisme/sketch-shapes"

import {
  FREE_FIGURE,
  type ChartSketch,
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
  to: number
): SketchPoint[] {
  const i0 = Math.min(from, to)
  const i1 = Math.max(from, to)
  if (i0 < 0 || i1 >= values.length || i1 < i0) return []
  // Même droite quel que soit l’ordre des clics : Y gauche → Y droite.
  const y0 = values[i0]
  const y1 = values[i1]
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

export function buildSketchPoints(options: {
  figure: string
  values: number[]
  dates: string[]
  from: number
  to: number
}): SketchPoint[] {
  const { figure, values, dates, from, to } = options
  if (figure === FREE_FIGURE) return straightSegment(values, dates, from, to)
  const template = synthCurve(figure)
  if (!template.length) return straightSegment(values, dates, from, to)
  return fitTemplateToWindow(template, values, dates, from, to)
}

/** Recale une annotation quand la fenêtre de tirages change, par date. */
export function remapSketch(sketch: ChartSketch, dates: string[]): ChartSketch | null {
  const startIndex = dates.indexOf(sketch.start.date)
  const endIndex = dates.indexOf(sketch.end.date)
  if (startIndex < 0 || endIndex < 0) return null
  const points = sketch.points
    .map((point) => {
      const index = point.date ? dates.indexOf(point.date) : -1
      if (index < 0) return null
      return { ...point, index }
    })
    .filter((point): point is SketchPoint => point != null)
  if (points.length < 2) return null
  return {
    ...sketch,
    start: { ...sketch.start, index: startIndex },
    end: { ...sketch.end, index: endIndex },
    points,
  }
}
