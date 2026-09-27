import {
  canonicalFigure,
  isChannelFigure,
  isRailFigure,
  labelOf,
  slopeBiasLabel,
} from "../chartisme/catalog"
import {
  constructRails,
  lineAt,
  lineThrough,
  lineThroughSlope,
  projectRailTarget,
  sampleRails,
  slopeBiasOf,
  type Line,
} from "../chartisme/rails"
import { synthCurve } from "../chartisme/sketch-shapes"

import {
  isFreeFigure,
  type ChartSketch,
  type SketchBand,
  type SketchPoint,
} from "./types"

/** En-dessous, le gabarit n'a plus de forme lisible (même seuil que le bloc-croquis). */
export const MIN_SKETCH_BARS = 8

/** Segment libre : deux tirages distincts suffisent. Les gabarits gardent 8 barres. */
export function figureMinBars(figure: string) {
  return isFreeFigure(figure) ? 2 : MIN_SKETCH_BARS
}

export function windowBarCount(from: number, to: number) {
  return Math.abs(to - from) + 1
}

export function windowTooShort(from: number, to: number, min = MIN_SKETCH_BARS) {
  return windowBarCount(from, to) < min
}

export function figureWindowTooShort(figure: string, from: number, to: number) {
  return windowTooShort(from, to, figureMinBars(figure))
}

/**
 * Le premier clic ancre sur la courbe. Le clic suivant fige l’aperçu déjà
 * montré, même si le pointeur est sorti du rayon d’aimant.
 */
export function clickCanPlace(options: {
  hasStart: boolean
  snapped: boolean
  offCurve: boolean
}) {
  if (options.snapped || options.offCurve) return true
  return options.hasStart
}

export function railClickCount(figure: string): 2 | 3 {
  return isRailFigure(figure) ? 3 : 2
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

function isCustomAnchor(index: number, actual: number | undefined, values: number[]) {
  if (actual == null || !Number.isFinite(actual)) return false
  const series = values[index]
  if (!Number.isFinite(series)) return true
  return Math.abs(actual - series) > 1e-6
}

/**
 * Recale un tracé pour qu’il passe par une ancre hors courbe, sans casser
 * la forme déjà calée sur la série : offset linéaire du départ vers l’arrivée.
 */
export function warpSketchToAnchors(
  points: SketchPoint[],
  from: number,
  to: number,
  actuals: { from?: number; to?: number } | undefined,
  values: number[]
): SketchPoint[] {
  if (!points.length || !actuals) return points
  const fromCustom = isCustomAnchor(from, actuals.from, values)
  const toCustom = isCustomAnchor(to, actuals.to, values)
  if (!fromCustom && !toCustom) return points
  const bFrom = points.find((point) => point.index === from)?.actual
  const bTo = points.find((point) => point.index === to)?.actual
  if (bFrom == null || bTo == null) return points
  const wFrom = fromCustom && actuals.from != null ? actuals.from : bFrom
  const wTo = toCustom && actuals.to != null ? actuals.to : bTo
  const span = to - from
  return points.map((point) => {
    const u = span === 0 ? 0 : (point.index - from) / span
    return {
      ...point,
      actual: point.actual + (1 - u) * (wFrom - bFrom) + u * (wTo - bTo),
    }
  })
}

/**
 * Pose le gabarit dans la fenêtre [from, to] : le temps vient des ancres,
 * l'amplitude épouse min/max de la série réelle pour coller au tracé.
 * Une ancre hors courbe incline le gabarit jusqu’au clic, sans le recoller.
 */
export function fitTemplateToWindow(
  template: number[],
  values: number[],
  dates: string[],
  from: number,
  to: number,
  actuals?: { from?: number; to?: number }
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
  return warpSketchToAnchors(points, from, to, actuals, values)
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
  to: number,
  actuals?: { from?: number; to?: number }
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
  let above = Math.max(maxRes, 0) + pad
  let below = Math.min(minRes, 0) - pad
  const clickResiduals: number[] = []
  if (isCustomAnchor(from, actuals?.from, values) && actuals?.from != null) {
    clickResiduals.push(actuals.from - (intercept + slope * (from - i0)))
  }
  if (isCustomAnchor(to, actuals?.to, values) && actuals?.to != null) {
    clickResiduals.push(actuals.to - (intercept + slope * (to - i0)))
  }
  for (const res of clickResiduals) {
    if (res > 0) above = Math.max(above, res)
    if (res < 0) below = Math.min(below, res)
  }
  const points: SketchPoint[] = []
  const upper: SketchPoint[] = []
  const lower: SketchPoint[] = []
  const median: SketchPoint[] = []
  for (let k = 0; k < slice.length; k += 1) {
    const index = i0 + k
    const date = dates[index] ?? ""
    points.push({ index, date, actual: mid[k] })
    upper.push({ index, date, actual: mid[k] + above })
    lower.push({ index, date, actual: mid[k] + below })
    median.push({ index, date, actual: mid[k] })
  }
  const height = Math.abs((upper[0]?.actual ?? 0) - (lower[0]?.actual ?? 0))
  const slopeBias = channelTilt({ upper, lower }) ?? "flat"
  const upperLine: [number, number] = [slope, intercept + above - slope * i0]
  const lowerLine: [number, number] = [slope, intercept + below - slope * i0]
  const target = projectRailTarget(values, upperLine, lowerLine, i1)
  return {
    points,
    band: {
      upper,
      lower,
      median,
      height,
      slopeBias,
      target: target?.value,
    },
  }
}

export function channelTilt(band: SketchBand | undefined): "up" | "down" | "flat" | null {
  if (!band || band.upper.length < 2 || band.lower.length < 2) return null
  const rise = band.upper[band.upper.length - 1].actual - band.upper[0].actual
  const height = Math.abs(band.upper[0].actual - band.lower[0].actual)
  if (Math.abs(rise) < Math.max(0.15 * height, 1e-6)) return "flat"
  return rise > 0 ? "up" : "down"
}

function higherFirst(left: Line, right: Line, at: number): [Line, Line] {
  return lineAt(left, at) >= lineAt(right, at) ? [left, right] : [right, left]
}

/**
 * Segment libre à trois points : la droite A–B, puis la parallèle qui passe par C.
 * Si C est sur A–B, on garde le segment seul.
 */
export function fitFreeParallel(
  values: number[],
  dates: string[],
  from: number,
  to: number,
  via: number,
  actuals: { from: number; to: number; via: number }
): SketchGeometry {
  const segment = () => ({
    points: straightSegment(values, dates, from, to, { from: actuals.from, to: actuals.to }),
  })
  if (![actuals.from, actuals.to, actuals.via].every(Number.isFinite)) return segment()
  const first = lineThrough(
    { index: from, price: actuals.from },
    { index: to, price: actuals.to }
  )
  if (!first) return segment()
  const second = lineThroughSlope({ index: via, price: actuals.via }, first[0])
  const i0 = Math.min(from, to, via)
  const i1 = Math.max(from, to, via)
  if (i0 < 0 || i1 >= dates.length || i1 <= i0) return segment()
  const [upper, lower] = higherFirst(first, second, i0)
  const height = lineAt(upper, i0) - lineAt(lower, i0)
  const scale = Math.max(Math.abs(actuals.from), Math.abs(actuals.to), Math.abs(actuals.via), 1)
  if (!(height > scale * 1e-4)) return segment()
  const samples = sampleRails(upper, lower, dates, i0, i1)
  const points: SketchPoint[] = []
  for (let index = i0; index <= i1; index += 1) {
    points.push({
      index,
      date: dates[index] ?? "",
      actual: lineAt(first, index),
    })
  }
  return {
    points,
    band: {
      upper: samples.upper,
      lower: samples.lower,
      median: samples.median,
      height,
      slopeBias: slopeBiasOf(upper, lower, i0, i1),
    },
  }
}

export function anchorsToGeometry(options: {
  figure: string
  values: number[]
  dates: string[]
  start: { index: number; actual: number }
  end: { index: number; actual: number }
  mid?: { index: number; actual: number } | null
}): SketchGeometry {
  const rails = isRailFigure(options.figure)
  const useMid = options.mid != null && (rails || isFreeFigure(options.figure))
  const far = useMid && options.mid ? options.mid : options.end
  const via = rails || useMid ? options.end : null
  return buildSketchGeometry({
    figure: options.figure,
    values: options.values,
    dates: options.dates,
    from: options.start.index,
    to: far.index,
    fromActual: options.start.actual,
    toActual: far.actual,
    via: via ? via.index : undefined,
    viaActual: via ? via.actual : undefined,
  })
}

/** Aperçu sous le curseur : segment, rails, ou parallèle en attente du troisième clic. */
export function previewGeometry(options: {
  figure: string
  values: number[]
  dates: string[]
  start: { index: number; actual: number }
  mid?: { index: number; actual: number } | null
  live?: { index: number; actual: number } | null
  parallel?: boolean
}): SketchGeometry | null {
  const { figure, values, dates, start, mid, live, parallel } = options
  if (parallel && mid && !live) {
    return buildSketchGeometry({
      figure,
      values,
      dates,
      from: start.index,
      to: mid.index,
      fromActual: start.actual,
      toActual: mid.actual,
    })
  }
  if (!live) return null
  if (mid && (isRailFigure(figure) || parallel)) {
    return anchorsToGeometry({ figure, values, dates, start, mid, end: live })
  }
  return buildSketchGeometry({
    figure,
    values,
    dates,
    from: start.index,
    to: live.index,
    fromActual: start.actual,
    toActual: live.actual,
  })
}

/** Contact de la parallèle : pose du troisième clic, ou reprise de cette ancre. */
export function isParallelContact(options: {
  figure?: string | null
  hasMid: boolean
  parallelOf?: string | null
  movingHandle?: "start" | "mid" | "end" | null
}) {
  if (options.parallelOf && !options.movingHandle) return true
  return (
    options.movingHandle === "end" && isFreeFigure(options.figure ?? "") && options.hasMid
  )
}

export function channelLabel(figure: string, band?: SketchBand): string {
  if (isFreeFigure(figure)) {
    if (band && band.upper.length >= 2 && band.lower.length >= 2) return "Parallèles"
    return "Segment libre"
  }
  if (isChannelFigure(figure)) {
    return slopeBiasLabel(figure, band?.slopeBias ?? channelTilt(band) ?? undefined)
  }
  return labelOf(figure)
}

function railsToGeometry(
  figure: string,
  values: number[],
  built: NonNullable<ReturnType<typeof constructRails>>
): SketchGeometry {
  const target = projectRailTarget(values, built.upper, built.lower, built.last)
  return {
    points: built.samples.mid,
    band: {
      upper: built.samples.upper,
      lower: built.samples.lower,
      median: built.samples.median,
      height: built.height,
      slopeBias: built.slopeBias,
      target: target?.value,
    },
  }
}

export function buildSketchGeometry(options: {
  figure: string
  values: number[]
  dates: string[]
  from: number
  to: number
  fromActual?: number
  toActual?: number
  via?: number
  viaActual?: number
}): SketchGeometry {
  const { figure, values, dates, from, to, fromActual, toActual, via, viaActual } = options
  const actuals =
    fromActual != null || toActual != null ? { from: fromActual, to: toActual } : undefined
  if (isRailFigure(figure)) {
    const third =
      via != null && Number.isFinite(via)
        ? { index: via, actual: viaActual ?? values[via] }
        : undefined
    // 2-clics canal : enveloppe LS (tests + sketches déjà posés). 3e clic : rails.
    if (third || !isChannelFigure(figure)) {
      const built = constructRails({
        figure,
        dates,
        a: { index: from, actual: fromActual ?? values[from] },
        b: { index: to, actual: toActual ?? values[to] },
        c: third,
        values,
      })
      if (built) return railsToGeometry(figure, values, built)
    }
    if (isChannelFigure(figure)) return fitChannelBand(values, dates, from, to, actuals)
  }
  if (isFreeFigure(figure)) {
    if (via != null && Number.isFinite(via)) {
      const parallel = fitFreeParallel(values, dates, from, to, via, {
        from: fromActual ?? values[from],
        to: toActual ?? values[to],
        via: viaActual ?? values[via],
      })
      if (parallel.band) return parallel
    }
    return { points: straightSegment(values, dates, from, to, actuals) }
  }
  const template = synthCurve(figure)
  if (!template.length) return { points: straightSegment(values, dates, from, to, actuals) }
  return { points: fitTemplateToWindow(template, values, dates, from, to, actuals) }
}

export function buildSketchPoints(options: {
  figure: string
  values: number[]
  dates: string[]
  from: number
  to: number
  fromActual?: number
  toActual?: number
  via?: number
  viaActual?: number
}): SketchPoint[] {
  return buildSketchGeometry(options).points
}

export function resolveSketchBand(
  sketch: Pick<ChartSketch, "figure" | "band" | "start" | "end" | "mid">,
  values: number[],
  dates: string[]
): SketchBand | undefined {
  if (sketch.band && sketch.band.upper.length >= 2 && sketch.band.lower.length >= 2) {
    return sketch.band
  }
  const rebuild =
    isRailFigure(sketch.figure) || (isFreeFigure(sketch.figure) && sketch.mid != null)
  if (!rebuild) return undefined
  return anchorsToGeometry({
    figure: sketch.figure,
    values,
    dates,
    start: sketch.start,
    end: sketch.end,
    mid: sketch.mid,
  }).band
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
  const midIndex = sketch.mid ? dates.indexOf(sketch.mid.date) : -1
  const points = remapPoints(sketch.points, dates)
  if (points.length < 2) return null
  const band = sketch.band
    ? {
        ...sketch.band,
        upper: remapPoints(sketch.band.upper, dates),
        lower: remapPoints(sketch.band.lower, dates),
        median: sketch.band.median ? remapPoints(sketch.band.median, dates) : undefined,
      }
    : undefined
  const validBand =
    band && band.upper.length >= 2 && band.lower.length >= 2 ? band : sketch.band
  return {
    ...sketch,
    figure: canonicalFigure(sketch.figure) === "canal" ? "canal" : sketch.figure,
    start: { ...sketch.start, index: startIndex },
    end: { ...sketch.end, index: endIndex },
    mid:
      sketch.mid && midIndex >= 0 ? { ...sketch.mid, index: midIndex } : sketch.mid,
    points,
    band: validBand,
  }
}
