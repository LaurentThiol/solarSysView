import { clamp01, type OffsetMode, type ReliefLayout } from "./layout"

/** Valeur initiale du curseur « Écarter les tirages ». */
export const DEFAULT_FUSION = 0.42

/** Pas le long du temps. 0 = serré, 1 = chaque tirage se détache. */
export function profileTimeStep(fusion: number) {
  const f = clamp01(fusion)
  return 0.42 + 1.26 * f
}

/** Écart des origines (hex / or / Hilbert / centroïde). */
export function originSpread(fusion: number) {
  const f = clamp01(fusion)
  return 0.55 + 1.05 * f
}

const COMB_STEP = 0.28

export const RANK_LABELS = ["n1", "n2", "n3", "n4", "n5"] as const
export type RankIndex = 0 | 1 | 2 | 3 | 4

/** Couleurs stables par rang, les mêmes familles que l’onglet Évolution. */
export const RANK_RGB: Array<[number, number, number]> = [
  [91, 142, 239],
  [56, 176, 168],
  [140, 186, 64],
  [232, 176, 52],
  [228, 108, 64],
]

export const STAR_RGB: [number, number, number] = [232, 210, 96]

/** Hauteur monde d’une boule 50, avant le curseur d’exagération. */
export const Y_WORLD = 4.2

export type ProfilePoint = {
  rank: RankIndex
  n: number
  x: number
  y: number
  z: number
}

export type StarPoint = {
  e: 1 | 2
  n: number
  x: number
  y: number
  z: number
}

export type DrawProfile = {
  drawIndex: number
  date: string
  weekday: string
  numbers: number[]
  ranks: number[]
  stars: number[]
  points: ProfilePoint[]
  starPoints: StarPoint[]
  latest: boolean
  recency: number
}

export type ProfileMap = {
  profiles: DrawProfile[]
  connected: boolean
  yWorld: number
  fusion: number
  mode: OffsetMode
}

export function ranksOf(numbers: number[]): number[] {
  const nums = [...numbers].filter((n) => n >= 1 && n <= 50).sort((a, b) => a - b)
  while (nums.length < 5) nums.push(nums[nums.length - 1] ?? 25)
  return nums.slice(0, 5)
}

export function starsOf(stars: number[]): number[] {
  const nums = [...stars].filter((n) => n >= 1 && n <= 12).sort((a, b) => a - b)
  while (nums.length < 2) nums.push(nums[nums.length - 1] ?? 1)
  return nums.slice(0, 2)
}

export function axisConnected(mode: OffsetMode) {
  return mode === "temps" || mode === "superpose"
}

export function valueHeight(n: number, pool = 50) {
  return (n / pool) * Y_WORLD
}

export function buildProfiles(layout: ReliefLayout): ProfileMap {
  const connected = axisConnected(layout.mode)
  const count = layout.anchors.length
  const fusion = clamp01(layout.fusion)
  const rankStep = connected ? 1 : COMB_STEP
  const timeStep = layout.mode === "superpose" ? 0 : profileTimeStep(fusion)
  const spread = connected ? 1 : originSpread(fusion)
  const latest = count ? count - 1 : -1
  const profiles: DrawProfile[] = layout.anchors.map((anchor) => {
    const ranks = ranksOf(anchor.numbers)
    const starVals = starsOf(anchor.stars)
    const recency = count <= 1 ? 1 : anchor.drawIndex / (count - 1)
    const z = connected
      ? layout.mode === "superpose"
        ? 0
        : anchor.drawIndex * timeStep
      : anchor.z * spread
    const ox = connected ? 0 : anchor.x * spread
    const points: ProfilePoint[] = ranks.map((n, rank) => {
      const r = rank as RankIndex
      const x = connected ? r : ox + (r - 2) * rankStep
      return { rank: r, n, x, y: valueHeight(n), z }
    })
    const starPoints: StarPoint[] = starVals.map((n, i) => {
      const e = (i === 0 ? 1 : 2) as 1 | 2
      const x = connected ? 5.15 + i * 0.55 : ox + 2.15 * rankStep + i * rankStep * 0.45
      return { e, n, x, y: valueHeight(n), z }
    })
    return {
      drawIndex: anchor.drawIndex,
      date: anchor.date,
      weekday: anchor.weekday,
      numbers: [...anchor.numbers],
      ranks,
      stars: [...anchor.stars],
      points,
      starPoints,
      latest: anchor.drawIndex === latest,
      recency,
    }
  })
  return { profiles, connected, yWorld: Y_WORLD, fusion, mode: layout.mode }
}

export function profileBounds(map: ProfileMap, stars = false) {
  if (map.profiles.length === 0) {
    return { minX: -2, maxX: 2, minZ: -2, maxZ: 2, maxY: map.yWorld }
  }
  let minX = Infinity
  let maxX = -Infinity
  let minZ = Infinity
  let maxZ = -Infinity
  let maxY = 0.2
  for (const profile of map.profiles) {
    const extra = stars ? profile.starPoints : []
    for (const p of [...profile.points, ...extra]) {
      if (p.x < minX) minX = p.x
      if (p.x > maxX) maxX = p.x
      if (p.z < minZ) minZ = p.z
      if (p.z > maxZ) maxZ = p.z
      if (p.y > maxY) maxY = p.y
    }
  }
  const padX = map.connected ? 0.85 : 0.7
  const padZ = map.connected ? 0.9 : 0.7
  return {
    minX: minX - padX,
    maxX: maxX + padX,
    minZ: minZ - padZ,
    maxZ: maxZ + padZ,
    maxY,
  }
}

/**
 * Cadre de la vue, calé sur le curseur par défaut.
 * Sans ça, fitScale recadre dès qu’on écarte, et l’écart disparaît à l’écran.
 */
export function profileFitBounds(map: ProfileMap, stars = false) {
  const n = map.profiles.length
  if (n === 0) return profileBounds(map, stars)
  if (!map.connected) {
    const actual = originSpread(map.fusion)
    const k = originSpread(DEFAULT_FUSION) / (actual > 1e-9 ? actual : 1)
    const box = profileBounds(map, stars)
    const midX = (box.minX + box.maxX) / 2
    const midZ = (box.minZ + box.maxZ) / 2
    return {
      minX: midX + (box.minX - midX) * k,
      maxX: midX + (box.maxX - midX) * k,
      minZ: midZ + (box.minZ - midZ) * k,
      maxZ: midZ + (box.maxZ - midZ) * k,
      maxY: box.maxY,
    }
  }
  const step = map.mode === "superpose" ? 0 : profileTimeStep(DEFAULT_FUSION)
  const z1 = Math.max(0, n - 1) * step
  const x1 = stars ? 5.7 : 4
  const padX = 0.85
  const padZ = 0.9
  return {
    minX: -padX,
    maxX: x1 + padX,
    minZ: -padZ,
    maxZ: z1 + padZ,
    maxY: map.yWorld,
  }
}

export function profilePaintKey(map: ProfileMap | null, stars = false) {
  if (!map || map.profiles.length === 0) return "empty"
  const first = map.profiles[0].points[0]
  const last = map.profiles[map.profiles.length - 1].points[0]
  const n5 = map.profiles[0].points[4]
  return [
    map.mode,
    map.fusion.toFixed(3),
    map.profiles.length,
    stars ? 1 : 0,
    first?.z.toFixed(4) ?? "0",
    last?.z.toFixed(4) ?? "0",
    n5?.x.toFixed(3) ?? "0",
    last?.n ?? 0,
  ].join("|")
}

export function rgbCssOf(rgb: [number, number, number], alpha = 1) {
  const r = Math.round(rgb[0])
  const g = Math.round(rgb[1])
  const b = Math.round(rgb[2])
  if (alpha >= 1) return `rgb(${r}, ${g}, ${b})`
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

export function distToSegment(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number
) {
  const dx = bx - ax
  const dy = by - ay
  const len = dx * dx + dy * dy
  if (len < 1e-9) return Math.hypot(px - ax, py - ay)
  let t = ((px - ax) * dx + (py - ay) * dy) / len
  if (t < 0) t = 0
  else if (t > 1) t = 1
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy))
}

export type RankTimeLink = {
  rank: RankIndex
  fromIndex: number
  toIndex: number
  ax: number
  ay: number
  az: number
  bx: number
  by: number
  bz: number
}

/** Relie le même rang d’un tirage au suivant (calque Évolution). */
export function rankTimeLinks(map: ProfileMap): RankTimeLink[] {
  const sorted = [...map.profiles].sort((a, b) => a.drawIndex - b.drawIndex)
  const links: RankTimeLink[] = []
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i]
    const b = sorted[i + 1]
    for (let r = 0; r < 5; r++) {
      const pa = a.points[r]
      const pb = b.points[r]
      if (!pa || !pb) continue
      links.push({
        rank: r as RankIndex,
        fromIndex: a.drawIndex,
        toIndex: b.drawIndex,
        ax: pa.x,
        ay: pa.y,
        az: pa.z,
        bx: pb.x,
        by: pb.y,
        bz: pb.z,
      })
    }
  }
  return links
}

export type WorldPt = { x: number; y: number; z: number }

/** Facette entre deux rangs voisins, d’un tirage au suivant. */
export type RankTimePatch = {
  band: RankIndex
  fromIndex: number
  toIndex: number
  a: WorldPt
  b: WorldPt
  c: WorldPt
  d: WorldPt
}

function asWorld(p: ProfilePoint): WorldPt {
  return { x: p.x, y: p.y, z: p.z }
}

/**
 * Peau n1–n2, n2–n3, n3–n4, n4–n5 le long du temps.
 * Ce sont les surfaces fermées par les traits de profil et le calque rangs.
 */
export function rankTimePatches(map: ProfileMap): RankTimePatch[] {
  const sorted = [...map.profiles].sort((a, b) => a.drawIndex - b.drawIndex)
  const patches: RankTimePatch[] = []
  for (let i = 0; i < sorted.length - 1; i++) {
    const from = sorted[i]
    const to = sorted[i + 1]
    for (let r = 0; r < 4; r++) {
      const a = from.points[r]
      const b = from.points[r + 1]
      const c = to.points[r + 1]
      const d = to.points[r]
      if (!a || !b || !c || !d) continue
      patches.push({
        band: r as RankIndex,
        fromIndex: from.drawIndex,
        toIndex: to.drawIndex,
        a: asWorld(a),
        b: asWorld(b),
        c: asWorld(c),
        d: asWorld(d),
      })
    }
  }
  return patches
}

export function mixRgb(
  a: [number, number, number],
  b: [number, number, number],
  t = 0.5
): [number, number, number] {
  const u = clamp01(t)
  return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u]
}

/** Lambert sommaire : les crêtes se lisent sans changer la teinte de rang. */
export function rankTimePatchShade(patch: RankTimePatch) {
  const { a, b, d } = patch
  const ux = d.x - a.x
  const uy = d.y - a.y
  const uz = d.z - a.z
  const vx = b.x - a.x
  const vy = b.y - a.y
  const vz = b.z - a.z
  const nx = uy * vz - uz * vy
  const ny = uz * vx - ux * vz
  const nz = ux * vy - uy * vx
  const n = Math.hypot(nx, ny, nz) || 1
  const lit = Math.max(0, (nx * -0.45 + ny * 1 + nz * 0.32) / n)
  return 0.62 + 0.38 * lit
}

/** Alpha du remplissage : plus dense = plus transparent ; survol = plus opaque. */
export function rankTimePatchAlpha(
  count: number,
  fromIndex: number,
  toIndex: number,
  hoverOwner: number | null
) {
  const hot = hoverOwner === fromIndex || hoverOwner === toIndex
  const rec = count <= 1 ? 1 : (fromIndex + toIndex) / 2 / Math.max(1, count - 1)
  const base = count >= 100 ? 0.07 : count >= 50 ? 0.12 : 0.2
  if (hot) return Math.min(0.4, base * 2.15 + 0.1)
  return base * (0.48 + rec * 0.62)
}

export type QuadPt = { x: number; y: number }

function pointInTriangle(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number
) {
  const v0x = cx - ax
  const v0y = cy - ay
  const v1x = bx - ax
  const v1y = by - ay
  const v2x = px - ax
  const v2y = py - ay
  const dot00 = v0x * v0x + v0y * v0y
  const dot01 = v0x * v1x + v0y * v1y
  const dot02 = v0x * v2x + v0y * v2y
  const dot11 = v1x * v1x + v1y * v1y
  const dot12 = v1x * v2x + v1y * v2y
  const den = dot00 * dot11 - dot01 * dot01
  if (Math.abs(den) < 1e-12) return false
  const u = (dot11 * dot02 - dot01 * dot12) / den
  const v = (dot00 * dot12 - dot01 * dot02) / den
  return u >= -1e-6 && v >= -1e-6 && u + v <= 1 + 1e-6
}

/** Hit-test écran d’une facette projetée (deux triangles). */
export function pointInQuad(px: number, py: number, a: QuadPt, b: QuadPt, c: QuadPt, d: QuadPt) {
  return (
    pointInTriangle(px, py, a.x, a.y, b.x, b.y, c.x, c.y) ||
    pointInTriangle(px, py, a.x, a.y, c.x, c.y, d.x, d.y)
  )
}
