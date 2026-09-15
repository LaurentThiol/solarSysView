import type { Draw } from "../draws"
import { numberCell, starCell } from "../morpho/board"

import { hilbertOrderFor, hilbertXY } from "./hilbert"

export const RELIEF_SAMPLES = [20, 50, 100, 200] as const
export type ReliefSample = (typeof RELIEF_SAMPLES)[number]

export const OFFSET_MODES = ["or", "hex", "hilbert", "temps", "stat", "superpose"] as const
export type OffsetMode = (typeof OFFSET_MODES)[number]

export const HEIGHT_MODES = ["mixte", "presence", "recence", "valeur"] as const
export type HeightMode = (typeof HEIGHT_MODES)[number]

export const VIEW_STYLES = ["scene", "plan"] as const
export type ViewStyle = (typeof VIEW_STYLES)[number]

export const OFFSET_LABELS: Record<OffsetMode, string> = {
  or: "Angle d'or",
  hex: "Hexagone",
  hilbert: "Hilbert",
  temps: "Temps",
  stat: "Centroïde × étendue",
  superpose: "Superposé n1→n5",
}

export const HEIGHT_LABELS: Record<HeightMode, string> = {
  mixte: "Présence × récence",
  presence: "Présence",
  recence: "Récence",
  valeur: "Valeur de boule",
}

export const STYLE_LABELS: Record<ViewStyle, string> = {
  scene: "Profils 3D",
  plan: "Plan",
}

export const MARKER_STYLES = ["boule", "point"] as const
export type MarkerStyle = (typeof MARKER_STYLES)[number]

export const MARKER_LABELS: Record<MarkerStyle, string> = {
  boule: "Boule",
  point: "Point",
}

/** 100 et 200 tirages : le point reste lisible, la boule bouche le tracé. */
export function recommendedMarker(sample: number): MarkerStyle {
  return sample >= 100 ? "point" : "boule"
}

export function markerRadius(
  style: MarkerStyle,
  count: number,
  recency: number,
  emphasis: boolean
): number {
  if (style === "point") {
    if (emphasis) return count >= 100 ? 2.35 : 2.8
    if (count >= 200) return 1.05
    if (count >= 100) return 1.3
    return 1.7
  }
  if (emphasis) return 5.6
  if (count >= 200) return 2.05 + recency * 0.7
  if (count >= 100) return 2.45 + recency * 1.05
  return 3.2 + recency * 1.6
}

/** Angle d'or de Vogel : 2π / φ². */
export const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5))

export type Peak = {
  x: number
  z: number
  h: number
  n: number
  drawIndex: number
  date: string
}

export type DrawAnchor = {
  x: number
  z: number
  drawIndex: number
  date: string
  weekday: string
  numbers: number[]
  stars: number[]
}

export type LayoutOptions = {
  mode: OffsetMode
  height: HeightMode
  fusion: number
  stars: boolean
}

export type ReliefLayout = {
  mode: OffsetMode
  height: HeightMode
  fusion: number
  spacing: number
  glyphScale: number
  anchors: DrawAnchor[]
  peaks: Peak[]
}

export function clamp01(t: number) {
  if (t <= 0) return 0
  if (t >= 1) return 1
  return t
}

export function numberLocal(n: number): [number, number] {
  const [row, col] = numberCell(n)
  return [col - 4.5, row - 2]
}

export function starLocal(s: number): [number, number] {
  const [row, col] = starCell(s)
  return [(col - 2.5) * 0.9, 3.15 + row * 0.85]
}

function originOf(mode: OffsetMode, index: number, count: number, draw: Draw): [number, number] {
  if (mode === "superpose") return [0, 0]
  if (mode === "temps") return [0, index]
  if (mode === "or") {
    const r = Math.sqrt(index + 0.5)
    const theta = index * GOLDEN_ANGLE
    return [r * Math.cos(theta), r * Math.sin(theta)]
  }
  if (mode === "hex") {
    const cols = Math.max(1, Math.ceil(Math.sqrt(count * 1.15)))
    const row = Math.floor(index / cols)
    const col = index % cols
    return [col + (row % 2) * 0.5, row * (Math.sqrt(3) / 2)]
  }
  if (mode === "hilbert") {
    const order = hilbertOrderFor(count)
    const [x, y] = hilbertXY(order, index)
    return [x, y]
  }
  const nums = [...draw.numbers].sort((a, b) => a - b)
  const mean = nums.reduce((s, v) => s + v, 0) / Math.max(1, nums.length)
  const spread = (nums[nums.length - 1] ?? mean) - (nums[0] ?? mean)
  return [(mean - 25.5) / 8, (spread - 20) / 8]
}

function peakHeight(mode: HeightMode, index: number, count: number, value: number) {
  const recency = count <= 1 ? 1 : index / (count - 1)
  if (mode === "presence") return 1
  if (mode === "recence") return 0.22 + 0.78 * recency
  if (mode === "valeur") return value / 50
  return (0.42 + 0.58 * recency) * (0.55 + 0.45 * (value / 50))
}

function nearestOriginDist(points: Array<[number, number]>) {
  if (points.length < 2) return 1
  let best = Number.POSITIVE_INFINITY
  for (let i = 0; i < points.length; i += 1) {
    const [ax, az] = points[i]
    for (let j = i + 1; j < points.length; j += 1) {
      const dx = ax - points[j][0]
      const dz = az - points[j][1]
      const d = dx * dx + dz * dz
      if (d > 0 && d < best) best = d
    }
  }
  return Number.isFinite(best) ? Math.sqrt(best) : 1
}

/**
 * Taille du glyphe vs écart entre origines.
 * fusion 0 : îlots séparés ; 1 : les voisins se fondent en continents.
 */
export function glyphScaleFor(spacing: number, fusion: number, mode: OffsetMode) {
  const f = clamp01(fusion)
  if (mode === "superpose") return 1
  if (mode === "temps") return Math.max(0.22, 0.48 + 0.28 * f)
  const cover = 0.58 + 0.34 * f
  return (spacing * cover) / 10
}

export function layoutDraws(draws: Draw[], options: LayoutOptions): ReliefLayout {
  const fusion = clamp01(options.fusion)
  const chronological = [...draws].sort((a, b) => a.date.localeCompare(b.date))
  const count = chronological.length
  const rawOrigins = chronological.map((draw, index) => originOf(options.mode, index, count, draw))
  const lattice = nearestOriginDist(rawOrigins)
  const spacing =
    options.mode === "superpose" ? 1 : options.mode === "temps" ? 1.35 + 0.55 * fusion : lattice || 1
  const glyphScale = glyphScaleFor(spacing, fusion, options.mode)
  const anchors: DrawAnchor[] = []
  const peaks: Peak[] = []

  chronological.forEach((draw, index) => {
    const [ox, oz] = rawOrigins[index]
    const wx = ox * (options.mode === "superpose" ? 1 : options.mode === "temps" ? 0 : spacing / (lattice || 1))
    const wz =
      options.mode === "superpose"
        ? 0
        : options.mode === "temps"
          ? index * spacing
          : oz * (spacing / (lattice || 1))
    anchors.push({
      x: wx,
      z: wz,
      drawIndex: index,
      date: draw.date,
      weekday: draw.weekday,
      numbers: [...draw.numbers],
      stars: [...draw.stars],
    })
    const balls = options.stars ? [...draw.numbers, ...draw.stars.map((s) => -s)] : draw.numbers
    for (const raw of balls) {
      const isStar = raw < 0
      const n = isStar ? -raw : raw
      const [lx, lz] = isStar ? starLocal(n) : numberLocal(n)
      const h = peakHeight(options.height, index, count, isStar ? n * (50 / 12) : n)
      const thin = options.mode === "temps" ? 0.22 : 1
      peaks.push({
        x: wx + lx * glyphScale,
        z: wz + lz * glyphScale * thin,
        h: h * (isStar ? 0.55 : 1),
        n: isStar ? 100 + n : n,
        drawIndex: index,
        date: draw.date,
      })
    }
  })

  return {
    mode: options.mode,
    height: options.height,
    fusion,
    spacing,
    glyphScale,
    anchors,
    peaks,
  }
}

export function recommendedOffset(_sample: number): OffsetMode {
  return "temps"
}

export function layoutNote(mode: OffsetMode): string {
  if (mode === "or") {
    return "Angle d’or : chaque tirage reste un peigne n1→n5, posé en spirale. On ne dessine que les cinq boules du jour, pas la grille Morpho 5×10."
  }
  if (mode === "hex") {
    return "Maille hexagonale : un peigne n1→n5 par tirage. Utile pour comparer des profils voisins, toujours sans glyphe 5×10."
  }
  if (mode === "hilbert") {
    return "Courbe de Hilbert : les peignes n1→n5 proches dans le temps restent voisins."
  }
  if (mode === "temps") {
    return "Le temps court en profondeur. Chaque tirage est la ligne de cinq points n1→n5 (plus petite boule → plus grande), la hauteur est la valeur 1–50. Les plus récents sont au premier plan."
  }
  if (mode === "stat") {
    return "Le peigne n1→n5 entier se décale selon le barycentre et l’étendue des cinq boules. Deux tirages de même équilibre se rapprochent."
  }
  return "Tous les profils n1→n5 sur le même axe : le faisceau montre la répétition des formes, pas un histogramme 5×10."
}
