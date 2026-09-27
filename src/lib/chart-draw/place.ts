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
