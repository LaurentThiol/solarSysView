/**
 * Gabarits idéaux des figures de la table, pour le bloc-croquis.
 *
 * Ce n'est pas le générateur d'entraînement (`synchro/chartisme/synth.py`),
 * qui tire au sort hauteurs, durées et asymétries puis bruite le tout. Ici les
 * paramètres sont figés : on veut le tracé d'école, celui qu'on pose sur le
 * bloc pour demander « où trouve-t-on ça dans l'archive ? ».
 */

import { canonicalFigure } from "./catalog"

const COUNT = 60
const BASE = 100

type Knot = [number, number]

/**
 * Courbe lisse passant par des extrêmes imposés `(instant, niveau)`.
 *
 * L'interpolation en cosinus annule la pente à chaque nœud : chaque nœud est
 * donc bien un extrême local, donc un pivot que les détecteurs verront.
 */
function fromKnots(count: number, knots: Knot[]): number[] {
  const ordered = [...knots].sort((a, b) => a[0] - b[0])
  const out: number[] = []
  for (let i = 0; i < count; i += 1) {
    const t = i / Math.max(1, count - 1)
    let slot = 0
    while (slot < ordered.length - 2 && t > ordered[slot + 1][0]) slot += 1
    const [t0, v0] = ordered[slot]
    const [t1, v1] = ordered[slot + 1]
    const width = t1 - t0
    const frac = width <= 0 ? 0 : Math.min(1, Math.max(0, (t - t0) / width))
    out.push(v0 + (v1 - v0) * (0.5 - 0.5 * Math.cos(Math.PI * frac)))
  }
  return out
}

/** Série qui rebondit entre deux bornes — triangles, biseaux, rectangles. */
function oscillation(
  count: number,
  upper: (t: number) => number,
  lower: (t: number) => number,
  touches: number
): number[] {
  const out: number[] = []
  const legs = Math.max(2, touches)
  for (let i = 0; i < count; i += 1) {
    const t = i / Math.max(1, count - 1)
    const phase = t * legs
    const leg = Math.trunc(phase)
    const frac = phase - leg
    const highFirst = leg % 2 === 0
    const top = upper(t)
    const bottom = lower(t)
    const eased = 0.5 - 0.5 * Math.cos(Math.PI * frac)
    out.push(highFirst ? top - (top - bottom) * eased : bottom + (top - bottom) * eased)
  }
  return out
}

/** Jambe de sortie : c'est elle qui matérialise la cassure. */
function tail(values: number[], direction: number, amount: number, bars: number): number[] {
  const out = [...values]
  const last = out[out.length - 1]
  for (let k = 0; k < bars; k += 1) out.push(last + (direction * amount * (k + 1)) / bars)
  return out
}

function bounded(
  upSlope: number,
  lowSlope: number,
  height: number,
  touches: number,
  breakDir: number
): number[] {
  const top0 = BASE + height / 2
  const bot0 = BASE - height / 2
  const body = oscillation(
    COUNT,
    (t) => top0 + upSlope * t * height,
    (t) => bot0 + lowSlope * t * height,
    touches
  )
  return tail(body, breakDir, height * 1.1, 6)
}

function ete(inverted: boolean): number[] {
  const head = 32
  const shoulder = head * 0.62
  const neck = head * 0.2
  const knots: Knot[] = [
    [0, -neck * 0.6],
    [0.17, shoulder],
    [0.32, neck],
    [0.5, head],
    [0.67, neck],
    [0.82, shoulder],
  ]
  const body = fromKnots(COUNT, inverted ? knots.map(([t, v]) => [t, -v] as Knot) : knots).map(
    (v) => BASE + v
  )
  return tail(body, inverted ? 1 : -1, head, 6)
}

function multiExtreme(peaks: number, inverted: boolean): number[] {
  const height = 30
  const trough = height * 0.45
  const margin = 0.26
  const spacing = (1 - 2 * margin) / Math.max(1, peaks - 1)
  const knots: Knot[] = [[0, trough * -0.2]]
  for (let i = 0; i < peaks; i += 1) {
    const center = margin + spacing * i
    knots.push([center, height])
    if (i < peaks - 1) knots.push([center + spacing / 2, trough])
  }
  const body = fromKnots(COUNT, inverted ? knots.map(([t, v]) => [t, -v] as Knot) : knots).map(
    (v) => BASE + v
  )
  return tail(body, inverted ? 1 : -1, height * 0.9, 6)
}

function diamond(): number[] {
  const height = 40
  const legs = 7
  const apex = 0.5
  const body: number[] = []
  for (let i = 0; i < COUNT; i += 1) {
    const t = i / Math.max(1, COUNT - 1)
    const openness = 1 - Math.abs(t - apex) / Math.max(apex, 1 - apex)
    const amp = (height / 2) * (0.12 + 0.88 * Math.max(0, openness))
    body.push(BASE + amp * Math.sin(t * legs * Math.PI))
  }
  return tail(body, -1, height * 0.8, 6)
}

function flagLike(pennant: boolean): number[] {
  const poleBars = 15
  const restBars = COUNT - poleBars
  const poleLen = 50
  const body: number[] = []
  for (let i = 0; i < poleBars; i += 1) body.push(BASE + (poleLen * (i + 1)) / poleBars)
  const top = body[body.length - 1]
  const amp = poleLen * (pennant ? 0.2 : 0.14)
  const drift = -poleLen * (pennant ? 0.03 : 0.08)
  const legs = 4
  for (let i = 0; i < restBars; i += 1) {
    const t = i / Math.max(1, restBars - 1)
    const decay = pennant ? 1 - 0.55 * t : 1
    body.push(top + drift * t - amp * decay * Math.sin(t * legs * Math.PI))
  }
  return tail(body, 1, poleLen, 6)
}

function cupHandle(): number[] {
  const depth = 32
  const cupBars = 44
  const handleBars = COUNT - cupBars
  const flatness = 4
  const body: number[] = []
  for (let i = 0; i < cupBars; i += 1) {
    const u = (i / Math.max(1, cupBars - 1)) * 2 - 1
    body.push(BASE - depth * (1 - Math.abs(u) ** flatness))
  }
  const lip = body[body.length - 1]
  const pull = depth * 0.25
  for (let i = 0; i < Math.max(3, handleBars); i += 1) {
    const t = i / Math.max(1, handleBars - 1)
    body.push(lip - pull * Math.sin(t * Math.PI))
  }
  return tail(body, 1, depth, 6)
}

/** Une borne linéaire, pour dessiner les rails du gabarit (canal, triangle…). */
function rail(slope: number, height: number, which: "upper" | "lower"): number[] {
  const top0 = BASE + height / 2
  const bot0 = BASE - height / 2
  const origin = which === "upper" ? top0 : bot0
  const out: number[] = []
  for (let i = 0; i < COUNT; i += 1) {
    const t = i / Math.max(1, COUNT - 1)
    out.push(origin + slope * t * height)
  }
  return out
}

const BOUND_GUIDES: Record<string, { up: number; low: number; height: number }> = {
  wedge_rising: { up: 0.7, low: 1.45, height: 30 },
  wedge_falling: { up: -1.45, low: -0.7, height: 30 },
  triangle_sym: { up: -0.68, low: 0.68, height: 34 },
  triangle_asc: { up: 0, low: 0.7, height: 30 },
  triangle_desc: { up: -0.7, low: 0, height: 30 },
  rectangle: { up: 0, low: 0, height: 28 },
  canal: { up: 0.85, low: 0.85, height: 28 },
  broadening_top: { up: 1.25, low: -1.25, height: 18 },
}

const TEMPLATES: Record<string, () => number[]> = {
  ete: () => ete(false),
  ete_inv: () => ete(true),
  double_top: () => multiExtreme(2, false),
  double_bottom: () => multiExtreme(2, true),
  triple_top: () => multiExtreme(3, false),
  triple_bottom: () => multiExtreme(3, true),
  wedge_rising: () => bounded(0.7, 1.45, 30, 5, -1),
  wedge_falling: () => bounded(-1.45, -0.7, 30, 5, 1),
  triangle_sym: () => bounded(-0.68, 0.68, 34, 5, 1),
  triangle_asc: () => bounded(0, 0.7, 30, 5, 1),
  triangle_desc: () => bounded(-0.7, 0, 30, 5, -1),
  rectangle: () => bounded(0, 0, 28, 6, 1),
  canal: () => bounded(0.85, 0.85, 28, 6, 1),
  broadening_top: () => bounded(1.25, -1.25, 18, 6, -1),
  diamond,
  flag: () => flagLike(false),
  pennant: () => flagLike(true),
  cup_handle: cupHandle,
}

export function synthCurve(figure: string): number[] {
  const id = canonicalFigure(figure)
  return TEMPLATES[id]?.() ?? TEMPLATES[figure]?.() ?? []
}

export function templateFigures(): string[] {
  return Object.keys(TEMPLATES)
}

/** Segment libre : une diagonale, pas un gabarit de la table. */
export function sparkValues(figure: string): number[] {
  if (figure === "free") return [0, 1]
  return synthCurve(figure)
}

/** Rails d'école (bornes haute et basse) pour les figures à deux droites. */
export function sparkGuides(figure: string): { upper: number[]; lower: number[] } | null {
  const id = canonicalFigure(figure)
  const spec = BOUND_GUIDES[id]
  if (!spec) return null
  return {
    upper: rail(spec.up, spec.height, "upper"),
    lower: rail(spec.low, spec.height, "lower"),
  }
}

/** Le canal se lit par ses deux rails ; les autres gardent le zigzag d'école. */
export function sparkShowsCurve(figure: string) {
  const id = canonicalFigure(figure)
  return id !== "canal"
}

/** Points SVG d'un gabarit, Y vers le haut. */
export function sparklinePoints(
  values: number[],
  width: number,
  height: number,
  pad = 1,
  bounds?: { min: number; max: number }
): string {
  if (values.length < 2) return ""
  const lo = bounds?.min ?? Math.min(...values)
  const hi = bounds?.max ?? Math.max(...values)
  const span = hi - lo || 1
  const innerW = Math.max(1, width - 2 * pad)
  const innerH = Math.max(1, height - 2 * pad)
  return values
    .map((value, index) => {
      const x = pad + (index / (values.length - 1)) * innerW
      const y = pad + (1 - (value - lo) / span) * innerH
      return `${x.toFixed(2)},${y.toFixed(2)}`
    })
    .join(" ")
}
