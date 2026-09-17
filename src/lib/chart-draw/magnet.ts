import { swingPivots } from "../chartisme/pivots"

import { type MagnetKind } from "./types"

export const DEFAULT_MAGNET_RADIUS_PX = 28
export const MAGNET_EXTREMA_BARS = 2

export type PixelPoint = { x: number; y: number }

export type PixelSample = {
  index: number
  px: number
  py: number
}

/** Distance écran, ou `null` si l'un des points manque. */
export function pixelDistance(from: PixelPoint | null | undefined, to: PixelPoint | null | undefined) {
  if (!from || !to) return null
  if (![from.x, from.y, to.x, to.y].every(Number.isFinite)) return null
  return Math.hypot(from.x - to.x, from.y - to.y)
}

export function isMagneted(distancePx: number | null, radiusPx = DEFAULT_MAGNET_RADIUS_PX) {
  if (distancePx == null) return true
  return distancePx <= radiusPx
}

/** Indices des pivots de swing : sommets et creux chartistes, pas tous les dents. */
export function extremaIndices(values: number[]): number[] {
  return swingPivots(values).map((pivot) => pivot.index)
}

/**
 * Si un pivot de swing est à moins de `maxBars` du curseur, on l'accroche :
 * une tête d'ETE se pose sur le sommet, pas sur le tirage voisin.
 */
export function snapIndexToExtrema(
  pointerIndex: number,
  extrema: number[],
  maxBars = MAGNET_EXTREMA_BARS
): { index: number; kind: MagnetKind } {
  if (!Number.isFinite(pointerIndex) || extrema.length === 0) {
    return { index: pointerIndex, kind: "sample" }
  }
  let best = pointerIndex
  let bestDist = maxBars + 1
  for (const extra of extrema) {
    const dist = Math.abs(extra - pointerIndex)
    if (dist < bestDist) {
      best = extra
      bestDist = dist
    }
  }
  if (bestDist <= maxBars && best !== pointerIndex) {
    return { index: best, kind: "extrema" }
  }
  if (bestDist === 0) return { index: best, kind: "extrema" }
  return { index: pointerIndex, kind: "sample" }
}

/** Plus proche échantillon en pixels — vrai aimant 2D, pas seulement l'abscisse. */
export function nearestSample(
  samples: PixelSample[],
  pointer: PixelPoint
): { index: number; distance: number } | null {
  if (!samples.length) return null
  let best = samples[0]
  let bestD = Math.hypot(pointer.x - best.px, pointer.y - best.py)
  for (let i = 1; i < samples.length; i += 1) {
    const sample = samples[i]
    const dist = Math.hypot(pointer.x - sample.px, pointer.y - sample.py)
    if (dist < bestD) {
      best = sample
      bestD = dist
    }
  }
  return { index: best.index, distance: bestD }
}

export function readTooltipIndex(raw: unknown): number | null {
  if (typeof raw === "number" && Number.isInteger(raw) && raw >= 0) return raw
  if (typeof raw === "string" && /^\d+$/.test(raw)) return Number(raw)
  return null
}

export type AxisScales = {
  x: ((value: unknown) => number) | null
  y: ((value: unknown) => number) | null
}

/** Recharts passe encore xAxisMap / yAxisMap à `Customized` ; on ne s'y fie pas trop. */
export function extractAxisScales(props: Record<string, unknown>): AxisScales {
  const yMap = props.yAxisMap as Record<string, { scale?: (value: unknown) => number }> | undefined
  const xMap = props.xAxisMap as Record<string, { scale?: (value: unknown) => number }> | undefined
  const y = yMap ? Object.values(yMap)[0]?.scale : undefined
  const x = xMap ? Object.values(xMap)[0]?.scale : undefined
  return { x: typeof x === "function" ? x : null, y: typeof y === "function" ? y : null }
}
