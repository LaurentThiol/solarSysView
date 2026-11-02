/**
 * Fenêtre horizontale du dessin.
 * Vingt tirages tiennent dans le cadre : au-delà, le curseur glisse le long de la série.
 * La position 0 est le plus ancien. `null` reste calé sur le bout, là où sont les calques.
 */

export const CURVE_VIEW_SPAN = 20

const PAD_LEFT = 0.35
const PAD_RIGHT = 0.6

export type CurveWindow = {
  x0: number
  x1: number
  /** Vrai quand une partie de la série est hors du cadre. */
  sliding: boolean
  /** Cran du curseur, de 0 à `steps`. */
  start: number
  steps: number
  /** Largeur, en tirages, entre le bord gauche de la série et le bord gauche du bout. */
  travel: number
}

export function curveWindow(xMax: number, start: number | null): CurveWindow {
  const minLeft = -PAD_LEFT
  const fullRight = xMax + PAD_RIGHT
  const full = fullRight - minLeft
  if (!(full > CURVE_VIEW_SPAN + 1)) {
    return { x0: minLeft, x1: fullRight, sliding: false, start: 0, steps: 0, travel: 0 }
  }
  const travel = full - CURVE_VIEW_SPAN
  const steps = Math.max(1, Math.round(travel))
  const raw = start == null ? steps : Math.round(start)
  const parked = Math.min(steps, Math.max(0, raw))
  const x0 = minLeft + (parked / steps) * travel
  return { x0, x1: x0 + CURVE_VIEW_SPAN, sliding: true, start: parked, steps, travel }
}

/** Numéros de tirages visibles, de 1 au dernier point de la série. */
export function windowDraws(x0: number, x1: number, total: number) {
  if (total <= 0) return { first: 0, last: 0, total: 0 }
  const firstIndex = Math.min(total - 1, Math.max(0, Math.ceil(x0 - 1e-9)))
  const lastIndex = Math.min(total - 1, Math.max(firstIndex, Math.floor(x1 + 1e-9)))
  return { first: firstIndex + 1, last: lastIndex + 1, total }
}

/**
 * Glisser le trait. `dx` positif tire vers la droite et découvre les tirages plus anciens.
 * Un déplacement d’une largeur de cadre avance d’environ vingt tirages.
 */
export function slideByPointer(input: {
  start: number
  steps: number
  travel: number
  span: number
  dx: number
  plotPx: number
}) {
  const { start, steps, travel, span, dx, plotPx } = input
  if (plotPx < 1 || steps < 1 || travel <= 0 || span <= 0) return start
  const delta = -(dx / plotPx) * span * (steps / travel)
  return Math.min(steps, Math.max(0, Math.round(start + delta)))
}
