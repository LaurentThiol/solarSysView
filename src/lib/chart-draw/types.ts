/** Annotations chartistes posées à la main, en espace données (pas en pixels). */

export const CHART_DRAW_HOSTS = [
  "evolution",
  "shape",
  "parity",
  "analyse",
  "chartisme",
] as const

export type ChartDrawHost = (typeof CHART_DRAW_HOSTS)[number]

/** Segment réel entre deux ancres, sans gabarit de la table. */
export const FREE_FIGURE = "free"

export type MagnetKind = "sample" | "extrema" | "free"

/** Ancre déjà posée qu’on peut reprendre : départ, second point de borne, ou arrivée. */
export type SketchHandle = "start" | "mid" | "end"

export type ChartAnchor = {
  index: number
  date: string
  seriesKey: string
  actual: number
  snapped: boolean
  kind: MagnetKind
}

export type SketchPoint = {
  index: number
  date: string
  actual: number
}

/** Deux rails autour de la série — canal, rectangle, triangle, biseau. */
export type SketchBand = {
  upper: SketchPoint[]
  lower: SketchPoint[]
  median?: SketchPoint[]
  height?: number
  slopeBias?: "up" | "down" | "flat"
  target?: number
}

export type SketchReading = {
  figure: string
  label: string
  confidence: number
}

export type ChartSketch = {
  id: string
  host: ChartDrawHost
  figure: string
  seriesKey: string
  seriesLabel: string
  start: ChartAnchor
  /** Second point of the first rail (3-click figures). */
  mid?: ChartAnchor
  end: ChartAnchor
  points: SketchPoint[]
  band?: SketchBand
  showMedian?: boolean
  reading: SketchReading | null
  createdAt: string
}

export type LiveCursor = {
  index: number
  date: string
  seriesKey: string
  seriesLabel: string
  actual: number
  snapped: boolean
  /** Arrivée posée hors courbe (Alt / Option). */
  offCurve: boolean
  kind: MagnetKind
  distancePx: number | null
  clientX: number
  clientY: number
}

export type DraftPlacement = {
  figure: string
  seriesKey: string
  seriesLabel: string
  start: ChartAnchor | null
  mid: ChartAnchor | null
}

export type EvolutionChartMeta = {
  mode: string
  modeLabel: string
  scale: string | null
  showSma: boolean
  showBb: boolean
  smaPeriod: number
  visibleKeys: string[]
}

export const SKETCH_KEY_PREFIX = "drawSketch_"
export const DRAFT_KEY = "drawDraft"

export function sketchDataKey(id: string) {
  return `${SKETCH_KEY_PREFIX}${id}`
}

export function sketchBandKey(
  id: string,
  rail: "upper" | "lower" | "base" | "span" | "median"
) {
  return `${SKETCH_KEY_PREFIX}${id}_${rail}`
}

export function draftBandKey(rail: "upper" | "lower" | "base" | "span" | "median") {
  return `${DRAFT_KEY}_${rail}`
}

export function isSketchDataKey(key: string) {
  return key === DRAFT_KEY || key.startsWith(SKETCH_KEY_PREFIX)
}

export function newSketchId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID()
  return `sk-${Date.now().toString(36)}-${Math.random().toString(16).slice(2)}`
}
