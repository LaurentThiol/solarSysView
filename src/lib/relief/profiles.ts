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
