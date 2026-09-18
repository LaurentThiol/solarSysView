import { swingPivots, type SwingPivot } from "../chartisme/pivots"

import { type MagnetKind } from "./types"

export type TouchKind = "H" | "L"

export const DEFAULT_MAGNET_RADIUS_PX = 28

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

/** Alt / Option : lâcher l’aimant. Pas Ctrl (clic droit macOS, raccourcis navigateur). */
export function isDemagnetizeModifier(event: { altKey?: boolean }): boolean {
  return Boolean(event.altKey)
}

/** Arrivée de n’importe quelle figure : le départ reste un ancrage réel. */
export function canFreePlaceArrival(hasStart: boolean, demagnetize: boolean) {
  return demagnetize && hasStart
}

/** Indices des pivots de swing : sommets et creux chartistes, pas tous les dents. */
export function extremaIndices(values: number[]): number[] {
  return swingPivots(values).map((pivot) => pivot.index)
}

export function swingTouches(values: number[]): Pick<SwingPivot, "index" | "type">[] {
  return swingPivots(values).map((pivot) => ({ index: pivot.index, type: pivot.type }))
}

/**
 * Aimant des figures à rails : les pivots de touche d'abord (H ou L selon
 * la borne), l'échantillon seulement s'il n'y en a pas dans le rayon.
 */
export function magnetOnTouches(
  samples: PixelSample[],
  pointer: PixelPoint,
  touches: Pick<SwingPivot, "index" | "type">[],
  prefer: TouchKind | "any" = "any",
  radiusPx = DEFAULT_MAGNET_RADIUS_PX
): { index: number; distance: number; snapped: boolean; kind: MagnetKind } | null {
  const byIndex = new Map(samples.map((sample) => [sample.index, sample]))
  const preferred = prefer === "any" ? touches : touches.filter((touch) => touch.type === prefer)
  const pools = [preferred, prefer === "any" ? [] : touches]
  for (const pool of pools) {
    const candidates = pool
      .map((touch) => byIndex.get(touch.index))
      .filter((sample): sample is PixelSample => sample != null)
    if (!candidates.length) continue
    const near = nearestSample(candidates, pointer)
    if (near && isMagneted(near.distance, radiusPx)) {
      return {
        index: near.index,
        distance: near.distance,
        snapped: true,
        kind: "extrema",
      }
    }
  }
  return magnetOnCurve(
    samples,
    pointer,
    touches.map((touch) => touch.index),
    radiusPx
  )
}

/** Pivot si ce tirage en est un, sinon simple échantillon. */
export function magnetKindAt(index: number, extrema: number[]): MagnetKind {
  return extrema.includes(index) ? "extrema" : "sample"
}

/**
 * Étiquette un tirage déjà choisi. Le voisin d’un pivot reste ce voisin :
 * l’aimant 2D a déjà pris le plus proche, on n’avale plus les dents de la
 * courbe d’origine (tous les dessins libres : canal, ETE, segment, etc.).
 */
export function snapIndexToExtrema(
  pointerIndex: number,
  extrema: number[]
): { index: number; kind: MagnetKind } {
  if (!Number.isFinite(pointerIndex) || extrema.length === 0) {
    return { index: pointerIndex, kind: "sample" }
  }
  return { index: pointerIndex, kind: magnetKindAt(pointerIndex, extrema) }
}

/**
 * Aimant courbe : le tirage le plus proche en pixels gagne toujours.
 * Un pivot n’est qu’une étiquette, pas un aimant qui avale le voisin.
 */
export function magnetOnCurve(
  samples: PixelSample[],
  pointer: PixelPoint,
  extrema: number[],
  radiusPx = DEFAULT_MAGNET_RADIUS_PX
): { index: number; distance: number; snapped: boolean; kind: MagnetKind } | null {
  const near = nearestSample(samples, pointer)
  if (!near) return null
  const snapped = isMagneted(near.distance, radiusPx)
  return {
    index: near.index,
    distance: near.distance,
    snapped,
    kind: snapped ? magnetKindAt(near.index, extrema) : "free",
  }
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

/** Barre sous le curseur : l’abscisse reste un tirage, même hors courbe. */
export function nearestSampleByX(
  samples: PixelSample[],
  pointerX: number
): { index: number; distanceX: number } | null {
  if (!samples.length || !Number.isFinite(pointerX)) return null
  let best = samples[0]
  let bestD = Math.abs(pointerX - best.px)
  for (let i = 1; i < samples.length; i += 1) {
    const dist = Math.abs(pointerX - samples[i].px)
    if (dist < bestD) {
      best = samples[i]
      bestD = dist
    }
  }
  return { index: best.index, distanceX: bestD }
}

/**
 * Inverse une échelle linéaire : `at(lo)` et `at(hi)` sont les pixels des bornes.
 * Extrapolé si `pixel` sort de l’intervalle (clic au-dessus / en dessous de la série).
 */
export function invertLinear(
  at: (value: number) => number,
  pixel: number,
  lo: number,
  hi: number
): number | null {
  if (![pixel, lo, hi].every(Number.isFinite)) return null
  const yLo = at(lo)
  const yHi = at(hi)
  if (![yLo, yHi].every(Number.isFinite)) return null
  if (Math.abs(yHi - yLo) < 1e-9) return (lo + hi) / 2
  return lo + ((pixel - yLo) / (yHi - yLo)) * (hi - lo)
}

/** Relit Y depuis deux échantillons d’échelle linéaire (pixels du même espace). */
export function valueFromPixelY(
  samples: PixelSample[],
  valuesAtIndex: number[],
  pixelY: number
): number | null {
  if (!samples.length || !Number.isFinite(pixelY)) return null
  let minS = samples[0]
  let maxS = samples[0]
  for (const sample of samples) {
    if (sample.py < minS.py) minS = sample
    if (sample.py > maxS.py) maxS = sample
  }
  const ya = valuesAtIndex[minS.index]
  const yb = valuesAtIndex[maxS.index]
  if (![ya, yb].every(Number.isFinite)) return null
  if (Math.abs(maxS.py - minS.py) < 1e-6) return ya
  return ya + ((pixelY - minS.py) / (maxS.py - minS.py)) * (yb - ya)
}

export function readTooltipIndex(raw: unknown): number | null {
  if (typeof raw === "number" && Number.isInteger(raw) && raw >= 0) return raw
  if (typeof raw === "string" && /^\d+$/.test(raw)) return Number(raw)
  return null
}

export type AxisScales = {
  x: ((value: unknown) => number) | null
  y: ((value: unknown) => number) | null
  invertY?: ((pixel: number) => number) | null
}

/** Recharts passe encore xAxisMap / yAxisMap à `Customized` ; on ne s'y fie pas trop. */
export function extractAxisScales(props: Record<string, unknown>): AxisScales {
  const yMap = props.yAxisMap as Record<string, { scale?: (value: unknown) => number }> | undefined
  const xMap = props.xAxisMap as Record<string, { scale?: (value: unknown) => number }> | undefined
  const y = yMap ? Object.values(yMap)[0]?.scale : undefined
  const x = xMap ? Object.values(xMap)[0]?.scale : undefined
  return { x: typeof x === "function" ? x : null, y: typeof y === "function" ? y : null }
}
