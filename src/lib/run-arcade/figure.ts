/**
 * Formes d’une skill. Chaque cran est jugé dans son carré.
 * La pointe du dernier cran est remise entre le bas et le haut de la fenêtre.
 */

export const FORMES = [
  "triangle",
  "cercle",
  "polygone",
  "pythagore",
  "sin",
  "cos",
  "tan",
  "arcsin",
  "arccos",
  "arctan",
] as const

export type Forme = (typeof FORMES)[number]

export const POLYGON_SIDES = [4, 5, 6, 8] as const
export const WAVE_PERIODS = [4, 6, 8, 12] as const
export const ARCTAN_TURNS = [15, 30, 45] as const

const EPS = 1e-9

export function usesFigureN(forme: Forme) {
  return forme !== "triangle" && forme !== "cercle" && forme !== "pythagore"
}

export function defaultFigureN(forme: Forme): number | null {
  if (forme === "polygone") return 4
  if (forme === "arctan") return 30
  if (forme === "sin" || forme === "cos" || forme === "tan" || forme === "arcsin" || forme === "arccos") return 8
  return null
}

export function figureNAllowed(forme: Forme, n: number) {
  if (!usesFigureN(forme)) return true
  if (forme === "polygone") return (POLYGON_SIDES as readonly number[]).includes(n)
  if (forme === "arctan") return (ARCTAN_TURNS as readonly number[]).includes(n)
  return (WAVE_PERIODS as readonly number[]).includes(n)
}

export function figureLength(forme: Forme, n: number | null) {
  if (forme === "triangle" || forme === "cercle" || forme === "pythagore" || forme === "arctan") return 3
  return n ?? defaultFigureN(forme) ?? 8
}

type UnitPoint = { x: number; y: number }
type Built = { kind: "shape"; y: number } | { kind: "glide" } | { kind: "stay" }

export type FigureRead = {
  tip: number
  scored: number
  matched: number
  correspond: boolean
  length: number
}

function rayY(origin: UnitPoint, angle: number, xNext: number) {
  const cos = Math.cos(angle)
  if (cos <= EPS) return null
  const t = (xNext - origin.x) / cos
  if (t <= 0) return null
  return origin.y + t * Math.sin(angle)
}

function nearer(ys: number[]) {
  if (ys.length === 0) return null
  return ys.reduce((best, y) => (Math.abs(y - 0.5) < Math.abs(best - 0.5) ? y : best))
}

function stepX(points: readonly UnitPoint[]) {
  const last = points[points.length - 1]
  const prev = points[points.length - 2]
  return last.x - prev.x
}

function triangleY(points: readonly UnitPoint[]) {
  const prev = points[points.length - 2]
  const last = points[points.length - 1]
  const alpha = Math.atan2(last.y - prev.y, last.x - prev.x)
  const xNext = last.x + stepX(points)
  const ys = [alpha + Math.PI / 3, alpha - Math.PI / 3]
    .map((angle) => rayY(last, angle, xNext))
    .filter((y): y is number => y != null)
  return nearer(ys)
}

function circleY(points: readonly UnitPoint[]) {
  if (points.length < 3) return null
  const a = points[points.length - 3]
  const b = points[points.length - 2]
  const c = points[points.length - 1]
  const d = 2 * (a.x * (b.y - c.y) + b.x * (c.y - a.y) + c.x * (a.y - b.y))
  if (Math.abs(d) <= EPS) return null
  const a2 = a.x * a.x + a.y * a.y
  const b2 = b.x * b.x + b.y * b.y
  const c2 = c.x * c.x + c.y * c.y
  const cx = (a2 * (b.y - c.y) + b2 * (c.y - a.y) + c2 * (a.y - b.y)) / d
  const cy = (a2 * (c.x - b.x) + b2 * (a.x - c.x) + c2 * (b.x - a.x)) / d
  const r2 = (c.x - cx) ** 2 + (c.y - cy) ** 2
  const xNext = c.x + (c.x - b.x)
  const disc = r2 - (xNext - cx) ** 2
  if (disc < -1e-8) return null
  const root = Math.sqrt(Math.max(0, disc))
  const high = cy + root
  const low = cy - root
  if (root <= 1e-8) return high
  const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x)
  const orient = cross >= 0 ? 1 : -1
  const from = Math.atan2(c.y - cy, c.x - cx)
  const forward = (y: number) => {
    let delta = orient * (Math.atan2(y - cy, xNext - cx) - from)
    delta %= 2 * Math.PI
    if (delta < 0) delta += 2 * Math.PI
    return delta <= EPS ? 2 * Math.PI : delta
  }
  return forward(high) <= forward(low) ? high : low
}

function polygonY(points: readonly UnitPoint[], sides: number) {
  const last = points[points.length - 1]
  const prev = points[points.length - 2]
  const before = points.length >= 3 ? points[points.length - 3] : null
  const alpha = Math.atan2(last.y - prev.y, last.x - prev.x)
  const xNext = last.x + stepX(points)
  const exterior = (2 * Math.PI) / sides
  const cross = before
    ? (prev.x - before.x) * (last.y - prev.y) - (prev.y - before.y) * (last.x - prev.x)
    : 0
  if (Math.abs(cross) <= EPS) {
    return nearer(
      [exterior, -exterior].map((turn) => rayY(last, alpha + turn, xNext)).filter((y): y is number => y != null)
    )
  }
  return rayY(last, alpha + Math.sign(cross) * exterior, xNext)
}

function pythagorasY(points: readonly UnitPoint[]) {
  const first = points[0]
  const last = points[points.length - 1]
  const mid = points[Math.floor((points.length - 1) / 2)]
  const dx = last.x - first.x
  if (Math.abs(dx) <= EPS) return last.y
  const yAt = (x: number) => first.y + ((x - first.x) / dx) * (last.y - first.y)
  const xNext = last.x + stepX(points)
  return yAt(xNext) + (mid.y - yAt(mid.x))
}

function waveY(points: readonly UnitPoint[], forme: Forme, period: number) {
  const cycle = points.length / period
  const phase = 2 * Math.PI * (cycle - Math.floor(cycle))
  const wave = forme === "cos" ? Math.cos(phase) : Math.sin(phase)
  return 0.5 + 0.5 * wave
}

function inverseY(points: readonly UnitPoint[], forme: Forme, period: number) {
  const last = points[points.length - 1].y
  const u = Math.min(1, Math.max(-1, 2 * (last - 0.5)))
  const step = (2 * Math.PI) / period
  if (forme === "arcsin") return 0.5 + 0.5 * Math.sin(Math.asin(u) + step)
  return 0.5 + 0.5 * Math.cos(Math.acos(u) + step)
}

function tangentY(points: readonly UnitPoint[]) {
  const first = points[0]
  const last = points[points.length - 1]
  const dx = last.x - first.x
  if (Math.abs(dx) <= EPS) return last.y
  return last.y + ((last.y - first.y) / dx) * stepX(points)
}

function arctanY(points: readonly UnitPoint[], degrees: number) {
  const last = points[points.length - 1]
  const prev = points[points.length - 2]
  const before = points.length >= 3 ? points[points.length - 3] : null
  const alpha = Math.atan2(last.y - prev.y, last.x - prev.x)
  const change = before ? last.y - 2 * prev.y + before.y : 1
  const sign = Math.abs(change) <= EPS ? 1 : Math.sign(change)
  const limit = (80 * Math.PI) / 180
  const beta = Math.min(limit, Math.max(-limit, alpha + sign * degrees * (Math.PI / 180)))
  return last.y + Math.tan(beta) * stepX(points)
}

function figureStep(points: readonly UnitPoint[], forme: Forme, n: number | null): Built {
  if (points.length < 2) return { kind: "stay" }
  const period = n ?? points.length
  let y: number | null = null
  if (forme === "triangle") y = triangleY(points)
  else if (forme === "cercle") y = circleY(points)
  else if (forme === "polygone") y = polygonY(points, n ?? 4)
  else if (forme === "pythagore") y = pythagorasY(points)
  else if (forme === "sin" || forme === "cos") y = waveY(points, forme, period)
  else if (forme === "arcsin" || forme === "arccos") y = inverseY(points, forme, period)
  else if (forme === "tan") y = tangentY(points)
  else y = arctanY(points, n ?? 30)
  return y == null || !Number.isFinite(y) ? { kind: "glide" } : { kind: "shape", y }
}

function buildCran(cran: readonly number[], forme: Forme, n: number | null): Built {
  const lo = Math.min(...cran)
  const hi = Math.max(...cran)
  if (!(hi - lo > EPS)) return { kind: "stay" }
  const steps = cran.length - 1
  const points = cran.map((value, index) => ({ x: index / steps, y: (value - lo) / (hi - lo) }))
  return figureStep(points, forme, n)
}

function place(built: Built, cran: readonly number[], maskLo: number, maskHi: number, role: "score" | "tip") {
  const last = cran[cran.length - 1]
  if (built.kind === "stay") return last
  if (built.kind === "glide") {
    const prev = cran.length > 1 ? cran[cran.length - 2] : last
    return last + (last - prev)
  }
  const lo = role === "tip" ? maskLo : Math.min(...cran)
  const hi = role === "tip" ? maskHi : Math.max(...cran)
  return lo + built.y * (hi - lo)
}

/** Fait glisser le calibre dans la fenêtre. La pensée est le dernier cran. */
export function readFigure(values: readonly number[], forme: Forme, n: number | null): FigureRead {
  const resolved = usesFigureN(forme) ? (n ?? defaultFigureN(forme)) : null
  const length = figureLength(forme, resolved)
  const last = values.length ? values[values.length - 1] : 0
  if (values.length < length) return { tip: last, scored: 0, matched: 0, correspond: false, length }
  const maskLo = Math.min(...values)
  const maskHi = Math.max(...values)
  let matched = 0
  let scored = 0
  let tip = last
  for (let start = 0; start + length <= values.length; start += 1) {
    const cran = values.slice(start, start + length)
    const built = buildCran(cran, forme, resolved)
    if (start + length < values.length) {
      scored += 1
      const pred = place(built, cran, maskLo, maskHi, "score")
      const height = Math.max(...cran) - Math.min(...cran)
      const tol = Math.max(0.5, height / 4)
      if (Math.abs(pred - values[start + length]) <= tol + 1e-9) matched += 1
    } else {
      tip = place(built, cran, maskLo, maskHi, "tip")
      if (forme === "arctan" && maskHi - maskLo > EPS) {
        const span = maskHi - maskLo
        tip = Math.min(maskHi + span, Math.max(maskLo - span, tip))
      }
    }
  }
  return { tip, scored, matched, correspond: scored >= 2 && matched * 2 >= scored, length }
}
