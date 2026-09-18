import { classifyBounds, lineThrough, slopeBiasOf } from "../chartisme/rails"
import { slopeBiasLabel } from "../chartisme/catalog"
import { bestFigure } from "../chartisme/figures"

import { MIN_SKETCH_BARS } from "./place"
import type { SketchBand, SketchReading } from "./types"

function lineFromRail(points: { index: number; actual: number }[]) {
  if (points.length < 2) return null
  const first = points[0]
  const last = points[points.length - 1]
  return lineThrough(
    { index: first.index, price: first.actual },
    { index: last.index, price: last.actual }
  )
}

/** Lecture post-pose : d’abord les rails posés, sinon le zigzag étiré. */
export function readWindow(
  values: number[],
  dates: string[],
  from: number,
  to: number,
  band?: SketchBand | null
): SketchReading | null {
  const i0 = Math.min(from, to)
  const i1 = Math.max(from, to)
  if (i1 - i0 + 1 < MIN_SKETCH_BARS) return null
  if (band && band.upper.length >= 2 && band.lower.length >= 2) {
    const upper = lineFromRail(band.upper)
    const lower = lineFromRail(band.lower)
    if (upper && lower) {
      const first = band.upper[0].index
      const last = band.upper[band.upper.length - 1].index
      const verdict = classifyBounds(upper, lower, first, last)
      if (verdict) {
        const bias = band.slopeBias ?? slopeBiasOf(upper, lower, first, last)
        return {
          figure: verdict.figure,
          label: slopeBiasLabel(verdict.figure, bias),
          confidence: 0.8,
        }
      }
    }
  }
  const slice = values.slice(i0, i1 + 1)
  const dateSlice = dates.slice(i0, i1 + 1)
  const hit = bestFigure(slice, dateSlice)
  if (!hit) return null
  return {
    figure: hit.figure,
    label: hit.label,
    confidence: hit.confidence,
  }
}
