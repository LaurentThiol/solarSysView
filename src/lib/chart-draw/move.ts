import { isRailFigure } from "../chartisme/catalog"

import { buildSketchGeometry, windowTooShort } from "./place"
import type { ChartAnchor, ChartSketch, SketchHandle, SketchReading } from "./types"

export function anchorsAfterMove(
  sketch: Pick<ChartSketch, "start" | "mid" | "end" | "seriesKey">,
  handle: SketchHandle,
  next: ChartAnchor
) {
  const start = handle === "start" ? next : sketch.start
  const mid = handle === "mid" ? next : sketch.mid
  const end = handle === "end" ? next : sketch.end
  return {
    start: { ...start, seriesKey: sketch.seriesKey },
    mid: mid ? { ...mid, seriesKey: sketch.seriesKey } : undefined,
    end: { ...end, seriesKey: sketch.seriesKey },
  }
}

export function sketchSpan(
  start: Pick<ChartAnchor, "index">,
  end: Pick<ChartAnchor, "index">,
  mid?: Pick<ChartAnchor, "index"> | null
) {
  const indexes = [start.index, end.index]
  if (mid) indexes.push(mid.index)
  return { left: Math.min(...indexes), right: Math.max(...indexes) }
}

function geometryOptions(
  sketch: Pick<ChartSketch, "figure">,
  start: ChartAnchor,
  end: ChartAnchor,
  mid: ChartAnchor | undefined,
  values: number[],
  dates: string[]
) {
  const rails = isRailFigure(sketch.figure)
  return {
    figure: sketch.figure,
    values,
    dates,
    from: start.index,
    to: rails && mid ? mid.index : end.index,
    fromActual: start.actual,
    toActual: rails && mid ? mid.actual : end.actual,
    via: rails ? end.index : undefined,
    viaActual: rails ? end.actual : undefined,
  }
}

/** Recalcule le gabarit après le déplacement d’une ancre (même trop court). */
export function sketchWithMovedHandle(
  sketch: ChartSketch,
  handle: SketchHandle,
  next: ChartAnchor,
  values: number[],
  dates: string[],
  reading?: SketchReading | null
): ChartSketch {
  const { start, mid, end } = anchorsAfterMove(sketch, handle, next)
  const geo = buildSketchGeometry(geometryOptions(sketch, start, end, mid, values, dates))
  return {
    ...sketch,
    start,
    mid,
    end,
    points: geo.points,
    band: geo.band,
    reading: reading === undefined ? sketch.reading : reading,
  }
}

/** Comme `sketchWithMovedHandle`, mais refuse une fenêtre trop courte. */
export function moveSketchHandle(
  sketch: ChartSketch,
  handle: SketchHandle,
  next: ChartAnchor,
  values: number[],
  dates: string[],
  reading?: SketchReading | null
): ChartSketch | null {
  const { start, mid, end } = anchorsAfterMove(sketch, handle, next)
  const { left, right } = sketchSpan(start, end, mid)
  if (windowTooShort(left, right)) return null
  const moved = sketchWithMovedHandle(sketch, handle, next, values, dates, reading)
  if (moved.points.length < 2) return null
  return moved
}

export function liveToAnchor(
  live: Pick<ChartAnchor, "index" | "date" | "seriesKey" | "actual" | "snapped" | "kind">
): ChartAnchor {
  return {
    index: live.index,
    date: live.date,
    seriesKey: live.seriesKey,
    actual: live.actual,
    snapped: live.snapped,
    kind: live.kind,
  }
}
