import { bestFigure } from "../chartisme/figures"

import { MIN_SKETCH_BARS } from "./place"
import type { SketchReading } from "./types"

export function readWindow(
  values: number[],
  dates: string[],
  from: number,
  to: number
): SketchReading | null {
  const i0 = Math.min(from, to)
  const i1 = Math.max(from, to)
  const slice = values.slice(i0, i1 + 1)
  const dateSlice = dates.slice(i0, i1 + 1)
  if (slice.length < MIN_SKETCH_BARS) return null
  const hit = bestFigure(slice, dateSlice)
  if (!hit) return null
  return {
    figure: hit.figure,
    label: hit.label,
    confidence: hit.confidence,
  }
}
