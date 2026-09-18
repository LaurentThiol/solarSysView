import { downsampleSeries, roundish } from "../capture/snapshot"
import { isChannelFigure } from "../chartisme/catalog"

import { channelLabel } from "./place"
import { FREE_FIGURE, type ChartSketch, type DraftPlacement, type LiveCursor } from "./types"

function figureLabel(figure: string, band?: ChartSketch["band"]) {
  if (figure === FREE_FIGURE || figure === "free") return "Segment libre"
  return channelLabel(figure, band)
}

function compactAnchor(anchor: ChartSketch["start"]) {
  return {
    date: anchor.date,
    index: anchor.index,
    actual: roundish(anchor.actual),
    snapped: anchor.snapped,
    kind: anchor.kind,
  }
}

function compactRail(points: ChartSketch["points"]) {
  return downsampleSeries(
    points.map((point) => ({
      date: point.date,
      value: roundish(point.actual) ?? point.actual,
    })),
    48
  )
}

export function compactSketch(sketch: ChartSketch) {
  const values = compactRail(sketch.points)
  const height =
    sketch.band && sketch.band.upper.length && sketch.band.lower.length
      ? (sketch.band.upper[0].actual - sketch.band.lower[0].actual)
      : null
  return {
    id: sketch.id,
    host: sketch.host,
    figure: sketch.figure,
    figureLabel: figureLabel(sketch.figure, sketch.band),
    seriesKey: sketch.seriesKey,
    seriesLabel: sketch.seriesLabel,
    start: compactAnchor(sketch.start),
    end: compactAnchor(sketch.end),
    bars: Math.abs(sketch.end.index - sketch.start.index) + 1,
    reading: sketch.reading
      ? {
          figure: sketch.reading.figure,
          label: sketch.reading.label,
          confidence: roundish(sketch.reading.confidence, 3),
        }
      : null,
    createdAt: sketch.createdAt,
    points: values,
    band: sketch.band
      ? {
          upper: compactRail(sketch.band.upper),
          lower: compactRail(sketch.band.lower),
          height: roundish(height),
        }
      : undefined,
  }
}

export function compactLive(live: LiveCursor | null) {
  if (!live) return null
  return {
    date: live.date,
    index: live.index,
    actual: roundish(live.actual),
    snapped: live.snapped,
    kind: live.kind,
    distancePx: roundish(live.distancePx, 1),
    seriesKey: live.seriesKey,
    seriesLabel: live.seriesLabel,
  }
}

export function compactDraft(draft: DraftPlacement | null) {
  if (!draft) return null
  return {
    figure: draft.figure,
    figureLabel: figureLabel(draft.figure),
    seriesKey: draft.seriesKey,
    seriesLabel: draft.seriesLabel,
    start: draft.start ? compactAnchor(draft.start) : null,
  }
}

export function drawingSummaryLines(sketches: ChartSketch[]) {
  const drawings = sketches.map(compactSketch)
  if (!drawings.length) return ["Aucune annotation chartiste posée sur la courbe."]
  const first = drawings[0]
  const canal =
    isChannelFigure(first.figure) && first.band?.height != null
      ? ` · 2 rails parallèles, hauteur ${first.band.height}`
      : ""
  const lines = [
    `${drawings.length} annotation(s) chartiste(s) · ${first.figureLabel} sur ${first.seriesLabel} (${first.start.date} → ${first.end.date})${canal}`,
  ]
  if (first.reading) {
    lines.push(
      `Lecture géométrique de la fenêtre : ${first.reading.label} (${first.reading.confidence ?? "—"})`
    )
  }
  return lines
}

export { figureLabel as sketchFigureLabel }
