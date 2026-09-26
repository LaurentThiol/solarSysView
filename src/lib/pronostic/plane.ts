import { ERROR_AXES, type ErrorAxisId, type HistoricGameRow, type ParameterRank } from "./historic.ts"

/** Même mélange que zFill (Jumeaux) : bleu sous la moyenne, ambre au-dessus. */
export function residualFill(z: number): string {
  const clamped = Math.max(-2.5, Math.min(2.5, z))
  const t = Math.abs(clamped) / 2.5
  const hue = clamped < 0 ? "var(--chart-2)" : "var(--chart-5)"
  return `color-mix(in oklab, ${hue} ${Math.round(t * 72)}%, var(--muted))`
}

export const RESIDUAL_MUTED = "var(--muted)"

export type ResidualPair = {
  x: ErrorAxisId
  y: ErrorAxisId
}

export type ResidualAxis = {
  id: ErrorAxisId
  label: string
}

export type ResidualPoint = {
  date: string
  numbers: number[]
  stars: number[]
  x: number
  y: number
  xActual: number
  yActual: number
  hit: boolean
  binding: ErrorAxisId | null
  bindingLabel: string
  requiredMargin: number | null
  grids: number
}

export type ResidualCloud = {
  xId: ErrorAxisId
  yId: ErrorAxisId
  xLabel: string
  yLabel: string
  points: ResidualPoint[]
  /** Tirages sans z fini sur l’un des deux axes (σ = 0 et valeur différente). */
  dropped: number
}

export type ResidualCell = {
  date: string
  axisId: ErrorAxisId
  label: string
  z: number | null
  actual: number
  shortRange: number
}

export type ResidualGridRow = {
  date: string
  hit: boolean
  numbers: number[]
  stars: number[]
  cells: ResidualCell[]
}

export type ResidualGrid = {
  axes: ResidualAxis[]
  /** Plus récent en premier. */
  rows: ResidualGridRow[]
}

export function enabledResidualAxes(rows: HistoricGameRow[]): ResidualAxis[] {
  const sample = rows[0]
  if (!sample) return []
  const enabled = new Set(sample.axes.filter((axis) => axis.enabled).map((axis) => axis.id))
  return ERROR_AXES.filter((axis) => enabled.has(axis.id)).map((axis) => ({
    id: axis.id,
    label: axis.label,
  }))
}

/** Les deux axes les plus souvent décisifs. null s’il n’y en a pas deux. */
export function defaultResidualPair(ranks: ParameterRank[]): ResidualPair | null {
  if (ranks.length < 2) return null
  if (ranks[0].id === ranks[1].id) return null
  return { x: ranks[0].id, y: ranks[1].id }
}

/** Choisir l’axe déjà pris sur l’autre bord les échange. */
export function swapResidualAxes(current: ResidualPair, side: "x" | "y", next: ErrorAxisId): ResidualPair {
  if (side === "x") {
    if (next === current.x) return current
    if (next === current.y) return { x: current.y, y: current.x }
    return { x: next, y: current.y }
  }
  if (next === current.y) return current
  if (next === current.x) return { x: current.y, y: current.x }
  return { x: current.x, y: next }
}

function axisOf(row: HistoricGameRow, id: ErrorAxisId) {
  return row.axes.find((axis) => axis.id === id) ?? null
}

function labelOf(id: ErrorAxisId) {
  return ERROR_AXES.find((axis) => axis.id === id)?.label ?? id
}

export function residualCloud(rows: HistoricGameRow[], xId: ErrorAxisId, yId: ErrorAxisId): ResidualCloud {
  const points: ResidualPoint[] = []
  let dropped = 0
  for (const row of rows) {
    const x = axisOf(row, xId)
    const y = axisOf(row, yId)
    if (!x || !y || x.z == null || y.z == null) {
      dropped += 1
      continue
    }
    const binding = row.binding ? axisOf(row, row.binding) : null
    points.push({
      date: row.date,
      numbers: row.numbers,
      stars: row.stars,
      x: x.z,
      y: y.z,
      xActual: x.actual,
      yActual: y.actual,
      hit: row.hit,
      binding: row.binding,
      bindingLabel: binding?.label ?? "—",
      requiredMargin: row.requiredMargin,
      grids: row.grids,
    })
  }
  return {
    xId,
    yId,
    xLabel: labelOf(xId),
    yLabel: labelOf(yId),
    points,
    dropped,
  }
}

const NICE_EDGES = [1, 2, 3, 4, 6, 8, 10, 12, 16] as const

function niceEdge(reach: number) {
  const padded = reach <= 0 ? 1 : reach * 1.08
  for (const edge of NICE_EDGES) {
    if (padded <= edge) return edge
  }
  return Math.ceil(padded)
}

/** Domaine symétrique, bornes rondes, qui contient ± la marge et tous les résidus placés. */
export function residualDomain(values: number[], margin: number): [number, number] {
  let reach = Math.abs(margin)
  for (const value of values) {
    if (Number.isFinite(value)) reach = Math.max(reach, Math.abs(value))
  }
  if (!(reach > 0)) reach = 1
  const edge = niceEdge(reach)
  return [-edge, edge]
}

/** Graduations entières ou demi, avec 0 et ± la marge. */
export function residualTicks(edge: number, margin: number): number[] {
  const span = Math.abs(edge)
  const step = span <= 3 ? 1 : 2
  const ticks: number[] = []
  const count = Math.round((span * 2) / step)
  for (let index = 0; index <= count; index += 1) {
    ticks.push(Math.round((-span + index * step) * 1000) / 1000)
  }
  for (const mark of [0, -Math.abs(margin), Math.abs(margin)]) {
    if (!ticks.some((tick) => Math.abs(tick - mark) < 1e-6)) ticks.push(mark)
  }
  ticks.sort((a, b) => a - b)
  return ticks
}

export function residualGrid(rows: HistoricGameRow[]): ResidualGrid {
  const axes = enabledResidualAxes(rows)
  const ordered = [...rows].reverse()
  return {
    axes,
    rows: ordered.map((row) => ({
      date: row.date,
      hit: row.hit,
      numbers: row.numbers,
      stars: row.stars,
      cells: axes.map((axis) => {
        const reading = axisOf(row, axis.id)
        return {
          date: row.date,
          axisId: axis.id,
          label: axis.label,
          z: reading?.z ?? null,
          actual: reading?.actual ?? 0,
          shortRange: reading?.shortRange ?? 0,
        }
      }),
    })),
  }
}
