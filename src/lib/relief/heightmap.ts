import { contourInterval } from "./color"
import type { DrawAnchor, HeightMode, Peak } from "./layout"
import { autoExaggeration } from "./project"

export type HeightField = {
  cols: number
  rows: number
  originX: number
  originZ: number
  cell: number
  heights: Float64Array
  owner: Int16Array
  maxH: number
  anchors: DrawAnchor[]
}

export type TerrainVertex = {
  x: number
  y: number
  z: number
}

export type TerrainQuad = {
  a: TerrainVertex
  b: TerrainVertex
  c: TerrainVertex
  d: TerrainVertex
  h: number
  t: number
  owner: number
}

const LIGHT = normalize3(-0.45, 1, 0.32)

function normalize3(x: number, y: number, z: number): [number, number, number] {
  const n = Math.hypot(x, y, z) || 1
  return [x / n, y / n, z / n]
}

export function boundsOf(peaks: Peak[], pad = 0.85) {
  if (peaks.length === 0) {
    return { minX: -1, maxX: 1, minZ: -1, maxZ: 1 }
  }
  let minX = Infinity
  let maxX = -Infinity
  let minZ = Infinity
  let maxZ = -Infinity
  for (const peak of peaks) {
    if (peak.x < minX) minX = peak.x
    if (peak.x > maxX) maxX = peak.x
    if (peak.z < minZ) minZ = peak.z
    if (peak.z > maxZ) maxZ = peak.z
  }
  if (maxX - minX < 1) {
    minX -= 0.8
    maxX += 0.8
  }
  if (maxZ - minZ < 1) {
    minZ -= 0.8
    maxZ += 0.8
  }
  return {
    minX: minX - pad,
    maxX: maxX + pad,
    minZ: minZ - pad,
    maxZ: maxZ + pad,
  }
}

export function gridResolution(count: number) {
  if (count <= 20) return 72
  if (count <= 50) return 88
  if (count <= 100) return 100
  return 108
}

export function splatSigma(cell: number, fusion: number, superpose: boolean) {
  const f = Math.max(0, Math.min(1, fusion))
  return cell * (superpose ? 0.65 + 0.85 * f : 1.05 + 1.85 * f)
}

export function rasterizePeaks(
  peaks: Peak[],
  anchors: DrawAnchor[],
  fusion: number,
  superpose: boolean
): HeightField {
  const box = boundsOf(peaks)
  const spanX = box.maxX - box.minX
  const spanZ = box.maxZ - box.minZ
  const res = gridResolution(anchors.length)
  const cols = spanX >= spanZ ? res : Math.max(36, Math.round(res * (spanX / spanZ)))
  const rows = spanZ >= spanX ? res : Math.max(36, Math.round(res * (spanZ / spanX)))
  const cell = Math.max(spanX / Math.max(1, cols - 1), spanZ / Math.max(1, rows - 1))
  const heights = new Float64Array(cols * rows)
  const owner = new Int16Array(cols * rows)
  owner.fill(-1)
  const sigma = splatSigma(cell, fusion, superpose)
  const radius = sigma * 3.2
  const twoSig = 2 * sigma * sigma || 1

  for (const peak of peaks) {
    const c0 = Math.max(0, Math.floor((peak.x - radius - box.minX) / cell))
    const c1 = Math.min(cols - 1, Math.ceil((peak.x + radius - box.minX) / cell))
    const r0 = Math.max(0, Math.floor((peak.z - radius - box.minZ) / cell))
    const r1 = Math.min(rows - 1, Math.ceil((peak.z + radius - box.minZ) / cell))
    for (let r = r0; r <= r1; r += 1) {
      const z = box.minZ + r * cell
      const dz = z - peak.z
      for (let c = c0; c <= c1; c += 1) {
        const x = box.minX + c * cell
        const dx = x - peak.x
        const w = Math.exp(-(dx * dx + dz * dz) / twoSig)
        if (w < 0.012) continue
        const i = r * cols + c
        const add = peak.h * w
        if (owner[i] < 0 || add >= heights[i]) owner[i] = peak.drawIndex
        heights[i] += add
      }
    }
  }

  let maxH = 0
  for (let i = 0; i < heights.length; i += 1) if (heights[i] > maxH) maxH = heights[i]
  return {
    cols,
    rows,
    originX: box.minX,
    originZ: box.minZ,
    cell,
    heights,
    owner,
    maxH,
    anchors,
  }
}

function sample(field: HeightField, c: number, r: number) {
  if (c < 0 || r < 0 || c >= field.cols || r >= field.rows) return 0
  return field.heights[r * field.cols + c]
}

function ownerAt(field: HeightField, c: number, r: number) {
  if (c < 0 || r < 0 || c >= field.cols || r >= field.rows) return -1
  return field.owner[r * field.cols + c]
}

function vertex(field: HeightField, c: number, r: number, yScale: number): TerrainVertex {
  return {
    x: field.originX + c * field.cell,
    y: sample(field, c, r) * yScale,
    z: field.originZ + r * field.cell,
  }
}

export function quadNormal(q: TerrainQuad): [number, number, number] {
  const ux = q.b.x - q.a.x
  const uy = q.b.y - q.a.y
  const uz = q.b.z - q.a.z
  const vx = q.d.x - q.a.x
  const vy = q.d.y - q.a.y
  const vz = q.d.z - q.a.z
  return normalize3(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx)
}

export function lambert(normal: [number, number, number]) {
  const d = Math.max(0, normal[0] * LIGHT[0] + normal[1] * LIGHT[1] + normal[2] * LIGHT[2])
  return 0.32 + 0.68 * d
}

export function fieldQuads(field: HeightField, yScale: number): TerrainQuad[] {
  const quads: TerrainQuad[] = []
  const maxH = field.maxH || 1
  for (let r = 0; r < field.rows - 1; r += 1) {
    for (let c = 0; c < field.cols - 1; c += 1) {
      const h00 = sample(field, c, r)
      const h10 = sample(field, c + 1, r)
      const h11 = sample(field, c + 1, r + 1)
      const h01 = sample(field, c, r + 1)
      const h = (h00 + h10 + h11 + h01) / 4
      if (h <= maxH * 0.008) continue
      quads.push({
        a: vertex(field, c, r, yScale),
        b: vertex(field, c + 1, r, yScale),
        c: vertex(field, c + 1, r + 1, yScale),
        d: vertex(field, c, r + 1, yScale),
        h,
        t: h / maxH,
        owner: ownerAt(field, c, r),
      })
    }
  }
  return quads
}

export type CrestPoint = {
  x: number
  y: number
  z: number
  h: number
  n: number
  drawIndex: number
  date: string
}

export function crestStrips(
  anchors: DrawAnchor[],
  heightMode: HeightMode,
  yScale: number,
  connected: boolean
): TerrainQuad[] {
  if (anchors.length === 0) return []
  const count = anchors.length
  const recency = (index: number) => (count <= 1 ? 1 : index / (count - 1))
  const hOf = (index: number, value: number) => {
    const r = recency(index)
    if (heightMode === "presence") return 1
    if (heightMode === "recence") return 0.22 + 0.78 * r
    if (heightMode === "valeur") return value / 50
    return (0.42 + 0.58 * r) * (0.55 + 0.45 * (value / 50))
  }
  const quads: TerrainQuad[] = []
  const rows: CrestPoint[][] = anchors.map((anchor) => {
    const nums = [...anchor.numbers].sort((a, b) => a - b)
    while (nums.length < 5) nums.push(nums[nums.length - 1] ?? 25)
    return nums.slice(0, 5).map((n, rank) => {
      const h = hOf(anchor.drawIndex, n)
      return {
        x: connected ? rank - 2 : anchor.x + (rank - 2) * 0.42,
        y: connected ? n / 50 : h,
        z: connected ? anchor.drawIndex * 0.72 : anchor.z,
        h: connected ? n : h * 50,
        n,
        drawIndex: anchor.drawIndex,
        date: anchor.date,
      }
    })
  })

  const maxH = connected ? 50 : Math.max(1, ...rows.flat().map((p) => p.h))
  const xs = rows.flat().map((p) => p.x)
  const zs = rows.flat().map((p) => p.z)
  const spanX = Math.max(...xs) - Math.min(...xs)
  const spanZ = Math.max(...zs) - Math.min(...zs)
  const yMul = autoExaggeration(connected ? 1 : Math.max(...rows.flat().map((p) => p.y), 0.01), spanX, spanZ, yScale)
  for (const row of rows) {
    for (const p of row) p.y *= yMul
  }
  const half = connected ? 0 : 0.18

  if (connected) {
    for (let i = 0; i < rows.length - 1; i += 1) {
      const a = rows[i]
      const b = rows[i + 1]
      for (let k = 0; k < 4; k += 1) {
        const h = (a[k].h + a[k + 1].h + b[k].h + b[k + 1].h) / 4
        quads.push({
          a: { x: a[k].x, y: a[k].y, z: a[k].z },
          b: { x: a[k + 1].x, y: a[k + 1].y, z: a[k + 1].z },
          c: { x: b[k + 1].x, y: b[k + 1].y, z: b[k + 1].z },
          d: { x: b[k].x, y: b[k].y, z: b[k].z },
          h,
          t: h / maxH,
          owner: a[k].drawIndex,
        })
      }
    }
    return quads
  }

  for (const row of rows) {
    for (let k = 0; k < 4; k += 1) {
      const p = row[k]
      const q = row[k + 1]
      const h = (p.h + q.h) / 2
      quads.push({
        a: { x: p.x, y: p.y, z: p.z - half },
        b: { x: q.x, y: q.y, z: q.z - half },
        c: { x: q.x, y: q.y, z: q.z + half },
        d: { x: p.x, y: p.y, z: p.z + half },
        h,
        t: h / maxH,
        owner: p.drawIndex,
      })
    }
  }
  return quads
}

export function contourEdges(field: HeightField, yScale: number) {
  const interval = contourInterval(field.maxH)
  const edges: Array<[TerrainVertex, TerrainVertex]> = []
  if (interval <= 0) return edges
  const crosses = (h0: number, h1: number) => {
    const a = Math.floor(h0 / interval)
    const b = Math.floor(h1 / interval)
    return a !== b
  }
  for (let r = 0; r < field.rows; r += 1) {
    for (let c = 0; c < field.cols - 1; c += 1) {
      const h0 = sample(field, c, r)
      const h1 = sample(field, c + 1, r)
      if (h0 <= 0 && h1 <= 0) continue
      if (crosses(h0, h1)) edges.push([vertex(field, c, r, yScale), vertex(field, c + 1, r, yScale)])
    }
  }
  for (let r = 0; r < field.rows - 1; r += 1) {
    for (let c = 0; c < field.cols; c += 1) {
      const h0 = sample(field, c, r)
      const h1 = sample(field, c, r + 1)
      if (h0 <= 0 && h1 <= 0) continue
      if (crosses(h0, h1)) edges.push([vertex(field, c, r, yScale), vertex(field, c, r + 1, yScale)])
    }
  }
  return edges
}

export type PickHit = {
  owner: number
  sx: number
  sy: number
}
