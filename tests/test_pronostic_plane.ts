import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

import { zFill } from "../src/lib/fingerprints.ts"
import {
  ERROR_AXES,
  historicGame,
  residualCloud,
  residualDomain,
  residualFill,
  residualTicks,
  residualGrid,
  defaultResidualPair,
  swapResidualAxes,
  type AxisReading,
  type ErrorAxisId,
  type HistoricGameRow,
  type ParameterRank,
} from "../src/lib/pronostic/index.ts"

function dateAt(index: number) {
  return new Date(Date.UTC(2023, 0, 1 + index)).toISOString().slice(0, 10)
}

function combo(seed: number) {
  let x = seed
  const numbers: number[] = []
  while (numbers.length < 5) {
    x = (x * 1103515245 + 12345) % 2147483648
    const value = (x % 50) + 1
    if (!numbers.includes(value)) numbers.push(value)
  }
  numbers.sort((a, b) => a - b)
  const stars: number[] = []
  while (stars.length < 2) {
    x = (x * 1103515245 + 12345) % 2147483648
    const value = (x % 12) + 1
    if (!stars.includes(value)) stars.push(value)
  }
  stars.sort((a, b) => a - b)
  return { numbers, stars }
}

function series(count: number, seed = 7) {
  return Array.from({ length: count }, (_, index) => ({
    date: dateAt(index),
    ...combo(seed + index * 17),
  }))
}

function reading(id: ErrorAxisId, z: number | null, enabled = true, actual = 0): AxisReading {
  const spec = ERROR_AXES.find((axis) => axis.id === id)
  assert.ok(spec)
  return {
    id,
    label: spec.label,
    pool: spec.pool,
    layer: spec.layer,
    enabled,
    mean: 0,
    sigma: z == null ? 0 : 1,
    actual,
    delta: actual,
    z,
    required: z == null ? null : 1,
  }
}

function row(partial: {
  date: string
  z?: Partial<Record<ErrorAxisId, number | null>>
  enabled?: Partial<Record<ErrorAxisId, boolean>>
  actual?: Partial<Record<ErrorAxisId, number>>
  hit?: boolean
  binding?: ErrorAxisId | null
  numbers?: number[]
  stars?: number[]
}): HistoricGameRow {
  const axes = ERROR_AXES.map((axis) =>
    reading(
      axis.id,
      partial.z?.[axis.id] === undefined ? 0 : (partial.z?.[axis.id] ?? null),
      partial.enabled?.[axis.id] ?? true,
      partial.actual?.[axis.id] ?? 0
    )
  )
  return {
    date: partial.date,
    numbers: partial.numbers ?? [1, 2, 3, 4, 5],
    stars: partial.stars ?? [1, 2],
    chosenLookback: 20,
    axes,
    requiredMargin: 1,
    binding: partial.binding === undefined ? "sum" : partial.binding,
    hit: partial.hit ?? true,
    numberHit: partial.hit ?? true,
    starHit: partial.hit ?? true,
    grids: 12,
    vector: axes.map((axis) => axis.z),
  }
}

test("residual fill matches the twins z-score mix", () => {
  for (const z of [-4, -2.5, -1, 0, 0.4, 2.5, 9]) {
    assert.equal(residualFill(z), zFill(z))
  }
})

test("default pair is the two most binding axes", () => {
  const ranks: ParameterRank[] = [
    { id: "n5", label: "n5", medianAbsZ: 1, bindingCount: 4, outsideCount: 1 },
    { id: "sum", label: "somme", medianAbsZ: 2, bindingCount: 3, outsideCount: 0 },
    { id: "e1", label: "e1", medianAbsZ: 0.2, bindingCount: 1, outsideCount: 0 },
  ]
  assert.deepEqual(defaultResidualPair(ranks), { x: "n5", y: "sum" })
  assert.equal(defaultResidualPair(ranks.slice(0, 1)), null)
  assert.equal(defaultResidualPair([]), null)
})

test("picking the axis already used on the other side swaps them", () => {
  const pair = { x: "sum" as const, y: "n1" as const }
  assert.deepEqual(swapResidualAxes(pair, "x", "n1"), { x: "n1", y: "sum" })
  assert.deepEqual(swapResidualAxes(pair, "y", "sum"), { x: "n1", y: "sum" })
  assert.deepEqual(swapResidualAxes(pair, "x", "e2"), { x: "e2", y: "n1" })
  assert.deepEqual(swapResidualAxes(pair, "y", "starSum"), { x: "sum", y: "starSum" })
  assert.equal(swapResidualAxes(pair, "x", "sum"), pair)
})

test("cloud coordinates are the axis z-scores and null z is dropped", () => {
  const rows = [
    row({ date: "2024-01-01", z: { sum: 1.5, n1: -0.25 }, actual: { sum: 140, n1: 4 }, hit: true }),
    row({ date: "2024-01-02", z: { sum: null, n1: 2 }, hit: false, binding: "n1" }),
    row({ date: "2024-01-03", z: { sum: 0, n1: 0.5 }, hit: false }),
  ]
  const cloud = residualCloud(rows, "sum", "n1")
  assert.equal(cloud.xLabel, "somme")
  assert.equal(cloud.yLabel, "n1")
  assert.equal(cloud.dropped, 1)
  assert.equal(cloud.points.length, 2)
  assert.equal(cloud.points[0].x, 1.5)
  assert.equal(cloud.points[0].y, -0.25)
  assert.equal(cloud.points[0].xActual, 140)
  assert.equal(cloud.points[0].hit, true)
  assert.equal(cloud.points[0].bindingLabel, "somme")
  assert.equal(cloud.points[1].x, 0)
  assert.equal(cloud.points[1].y, 0.5)
  assert.equal(cloud.points[1].date, "2024-01-03")
})

test("domain stays symmetric and contains the margin and the points", () => {
  assert.deepEqual(residualDomain([0.2, -0.1], 1), [-2, 2])
  assert.deepEqual(residualDomain([4, -3.5], 1), [-6, 6])
  assert.deepEqual(residualDomain([], 0), [-2, 2])
  const ticks = residualTicks(6, 1)
  assert.ok(ticks.includes(0))
  assert.ok(ticks.includes(1) && ticks.includes(-1))
  assert.ok(ticks.every((tick) => tick >= -6 && tick <= 6))
  assert.deepEqual(residualTicks(2, 1), [-2, -1, 0, 1, 2])
})

test("grid is recent-first and keeps enabled axes in ERROR_AXES order", () => {
  const rows = [
    row({
      date: "2024-01-01",
      z: { sum: 0.2, parity: 9, n1: -1 },
      enabled: { parity: false, starParity: false },
      hit: true,
    }),
    row({
      date: "2024-01-02",
      z: { sum: null, n1: 1.25 },
      actual: { sum: 80 },
      enabled: { parity: false, starParity: false },
      hit: false,
    }),
  ]
  const grid = residualGrid(rows)
  assert.equal(grid.rows[0].date, "2024-01-02")
  assert.equal(grid.rows[0].hit, false)
  assert.equal(grid.rows[1].date, "2024-01-01")
  assert.deepEqual(
    grid.axes.map((axis) => axis.id),
    ["sum", "n1", "n2", "n3", "n4", "n5", "starSum", "e1", "e2"]
  )
  assert.equal(grid.rows.length * grid.axes.length, rows.length * 9)
  const sumCell = grid.rows[0].cells[0]
  assert.equal(sumCell.axisId, "sum")
  assert.equal(sumCell.z, null)
  assert.equal(sumCell.actual, 80)
  assert.equal(grid.rows[0].cells.find((cell) => cell.axisId === "n1")?.z, 1.25)
  assert.ok(!grid.axes.some((axis) => axis.id === "parity" || axis.id === "starParity"))
})

test("a scored game projects the same z the forecast stored", () => {
  const game = historicGame(series(24), { lookback: 20, margin: 1 })
  const pair = defaultResidualPair(game.ranks)
  assert.ok(pair)
  const cloud = residualCloud(game.rows, pair.x, pair.y)
  assert.equal(cloud.points.length + cloud.dropped, game.rows.length)
  for (const point of cloud.points) {
    const source = game.rows.find((item) => item.date === point.date)
    assert.ok(source)
    assert.equal(point.x, source.axes.find((axis) => axis.id === pair.x)?.z)
    assert.equal(point.y, source.axes.find((axis) => axis.id === pair.y)?.z)
    assert.equal(point.hit, source.hit)
  }
  const grid = residualGrid(game.rows)
  assert.equal(grid.rows.length, game.rows.length)
  assert.equal(grid.rows[0].date, game.rows[game.rows.length - 1].date)
  assert.deepEqual(
    grid.axes.map((axis) => axis.id),
    ERROR_AXES.map((axis) => axis.id)
  )
  assert.equal(grid.rows[0].cells.length, ERROR_AXES.length)
})

test("historic tab mounts the residual plane between the curves and the ranks", () => {
  const panel = readFileSync(
    new URL("../src/components/pronostic/historic-panel.tsx", import.meta.url),
    "utf8"
  )
  const plane = readFileSync(
    new URL("../src/components/pronostic/historic-plane.tsx", import.meta.url),
    "utf8"
  )
  const curve = panel.indexOf("<TitleHelp help={HELP.curve}>Marge mesurée, prise</TitleHelp>")
  const mount = panel.indexOf("<HistoricPlane")
  const ranks = panel.indexOf("<TitleHelp help={HELP.ranks}>Paramètres qui pèsent</TitleHelp>")
  assert.ok(curve >= 0 && mount > curve && ranks > mount)
  assert.match(panel, /rows=\{game\.rows\}/)
  assert.match(panel, /ranks=\{game\.ranks\}/)
  assert.match(panel, /margin=\{margin\}/)
  assert.match(panel, /Le plan des résidus et la grille lisent le vecteur z/)
  assert.doesNotMatch(panel, /vue 2D ou 3D ultérieure/)
  assert.match(plane, /Plan des résidus/)
  assert.match(plane, /Grille des résidus/)
  assert.match(plane, /Le nuage demande deux axes allumés/)
  assert.match(plane, /Toutes les couches sont éteintes/)
  assert.match(plane, /x1=\{-margin\}/)
  assert.match(plane, /y1=\{-margin\}/)
  assert.match(plane, /x2=\{margin\}/)
  assert.match(plane, /y2=\{margin\}/)
  assert.match(plane, /ReferenceArea/)
  assert.match(plane, /strokeDasharray="4 4"/)
  assert.match(plane, /type="number"/)
  assert.match(plane, /dataKey="x"/)
  assert.match(plane, /dataKey="y"/)
  assert.match(plane, /Abscisse/)
  assert.match(plane, /Ordonnée/)
  assert.doesNotMatch(plane, /PCA|t-SNE/)
})
