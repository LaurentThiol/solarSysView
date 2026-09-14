import { N_ROWS, numberCell } from "../morpho/board"

import type { HeightMode, Peak, ReliefLayout } from "./layout"

export type StampCell = {
  n: number
  col: number
  row: number
  x: number
  z: number
  h: number
  t: number
  star: boolean
}

export type Stamp = {
  drawIndex: number
  date: string
  weekday: string
  numbers: number[]
  stars: number[]
  x: number
  z: number
  latest: boolean
  cells: StampCell[]
}

export type StampMap = {
  stamps: Stamp[]
  cell: number
  maxH: number
  aggregated: boolean
}

export function stampTint(mode: HeightMode, drawIndex: number, count: number, value: number) {
  const recency = count <= 1 ? 1 : drawIndex / (count - 1)
  if (mode === "presence") return 0.52
  if (mode === "valeur") return value / 50
  if (mode === "recence") return recency
  return 0.12 + 0.88 * recency
}

export function buildStampMap(layout: ReliefLayout): StampMap {
  const cell = Math.max(0.08, layout.glyphScale)
  if (layout.mode === "superpose") return aggregateStamp(layout, cell)
  const count = layout.anchors.length
  const latest = count ? count - 1 : -1
  const byDraw = new Map<number, Peak[]>()
  for (const peak of layout.peaks) {
    const list = byDraw.get(peak.drawIndex)
    if (list) list.push(peak)
    else byDraw.set(peak.drawIndex, [peak])
  }
  let maxH = 0.001
  const stamps: Stamp[] = layout.anchors.map((anchor) => {
    const peaks = byDraw.get(anchor.drawIndex) ?? []
    const cells: StampCell[] = peaks.map((peak) => {
      const star = peak.n > 50
      const n = star ? peak.n - 100 : peak.n
      const [row, col] = star ? [N_ROWS + Math.floor((n - 1) / 6), (n - 1) % 6] : numberCell(n)
      if (peak.h > maxH) maxH = peak.h
      return {
        n,
        col,
        row,
        x: peak.x,
        z: peak.z,
        h: peak.h,
        t: stampTint(layout.height, anchor.drawIndex, count, n),
        star,
      }
    })
    return {
      drawIndex: anchor.drawIndex,
      date: anchor.date,
      weekday: anchor.weekday,
      numbers: anchor.numbers,
      stars: anchor.stars,
      x: anchor.x,
      z: anchor.z,
      latest: anchor.drawIndex === latest,
      cells,
    }
  })
  return { stamps, cell, maxH, aggregated: false }
}

function aggregateStamp(layout: ReliefLayout, cell: number): StampMap {
  const counts = new Float64Array(50)
  for (const peak of layout.peaks) {
    if (peak.n < 1 || peak.n > 50) continue
    counts[peak.n - 1] += 1
  }
  let maxH = 1
  for (let i = 0; i < 50; i += 1) if (counts[i] > maxH) maxH = counts[i]
  const cells: StampCell[] = []
  for (let n = 1; n <= 50; n += 1) {
    const h = counts[n - 1]
    if (h <= 0) continue
    const [row, col] = numberCell(n)
    cells.push({
      n,
      col,
      row,
      x: (col - 4.5) * cell,
      z: (row - 2) * cell,
      h,
      t: h / maxH,
      star: false,
    })
  }
  const last = layout.anchors[layout.anchors.length - 1]
  return {
    cell,
    maxH,
    aggregated: true,
    stamps: [
      {
        drawIndex: last?.drawIndex ?? 0,
        date: last?.date ?? "",
        weekday: last?.weekday ?? "",
        numbers: last?.numbers ?? [],
        stars: last?.stars ?? [],
        x: 0,
        z: 0,
        latest: true,
        cells,
      },
    ],
  }
}

export function stampBounds(map: StampMap) {
  const hx = 5.2 * map.cell
  const hz = 3.2 * map.cell
  if (map.stamps.length === 0) return { minX: -2, maxX: 2, minZ: -2, maxZ: 2 }
  let minX = Infinity
  let maxX = -Infinity
  let minZ = Infinity
  let maxZ = -Infinity
  for (const stamp of map.stamps) {
    if (stamp.x - hx < minX) minX = stamp.x - hx
    if (stamp.x + hx > maxX) maxX = stamp.x + hx
    if (stamp.z - hz < minZ) minZ = stamp.z - hz
    if (stamp.z + hz > maxZ) maxZ = stamp.z + hz
  }
  return { minX, maxX, minZ, maxZ }
}

export function plateCorners(stamp: Stamp, cell: number) {
  const hx = 5 * cell
  const hz = 2.5 * cell
  return {
    minX: stamp.x - hx,
    maxX: stamp.x + hx,
    minZ: stamp.z - hz,
    maxZ: stamp.z + hz,
  }
}

export function filledCount(stamp: Stamp) {
  return stamp.cells.filter((c) => !c.star).length
}
