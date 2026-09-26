import assert from "node:assert/strict"
import test from "node:test"

import { scanCurve } from "../src/lib/chartisme/scan"
import { nameShortSense, senseSentence } from "../src/lib/chartisme/sense"
import { SHORT_CYCLE_MAX, SHORT_CYCLE_MIN, localRange } from "../src/lib/short-cycle"

test("local range matches the python twin", () => {
  const values = [1, 3, 2, 8, 5]
  assert.equal(SHORT_CYCLE_MIN, 4)
  assert.equal(SHORT_CYCLE_MAX, 8)
  assert.equal(localRange(values, 4, 4), 6)
  assert.equal(localRange(values, 4, 8), 7)
})

test("scale 8 records an arch and scale 30 records no figure", () => {
  const height = 12
  const values = Array.from({ length: 40 }, () => 10)
  for (let step = 0; step < 7; step += 1) values[16 + step] = 10 + step * 2
  for (let index = 23; index < values.length; index += 1) values[index] = 10 + height
  const dates = values.map((_, index) => `2024-01-${String(index + 1).padStart(2, "0")}`)
  const activity = values.map((value, index) => (index === 0 ? 0 : Math.abs(value - values[index - 1])))
  const curve = { id: "sum", variable: "sum", values, dates, activity }
  const arches = scanCurve(curve, { scales: [8], minConfidence: 0 })
  const figures = scanCurve(curve, { scales: [30], minConfidence: 0 })
  const wave = arches.find((hit) => hit.to_index - hit.from_index === 6)
  assert.ok(wave)
  assert.equal(wave.figure, "arche" as typeof wave.figure)
  assert.equal(wave.scale, 8)
  assert.equal((wave as { range?: number }).range, height)
  assert.equal((wave as { activity_period?: number }).activity_period, 8)
  assert.deepEqual(figures, [])
})

test("short sense uses extent", () => {
  const values = [0, 1, 3, 2, 1, 0]
  const named = nameShortSense(values, 4)
  assert.ok(named)
  assert.equal(named.band, "court")
  assert.equal(named.extent, named.sigma)
  assert.equal(named.reference, 4)
  assert.match(senseSentence(named), /étendue/)
  assert.equal(nameShortSense(values.slice(0, 3), 4), null)
})
