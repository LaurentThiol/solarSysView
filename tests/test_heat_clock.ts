import assert from "node:assert/strict"
import test from "node:test"

import {
  clockDegrees,
  clockMarkRatio,
  clockPercent,
  clockRatio,
  heatClockFace,
  heatClockRim,
} from "../src/lib/heat-clock.ts"

test("clockRatio clamps to 0–1 against the grid peak", () => {
  assert.equal(clockRatio(0, 10), 0)
  assert.equal(clockRatio(5, 10), 0.5)
  assert.equal(clockRatio(10, 10), 1)
  assert.equal(clockRatio(12, 10), 1)
  assert.equal(clockRatio(-2, 10), 0)
  assert.equal(clockRatio(5, 0), 0)
  assert.equal(clockRatio(Number.NaN, 10), 0)
  assert.equal(clockRatio(4, Number.POSITIVE_INFINITY), 0)
})

test("clockPercent and clockDegrees start at 12 o’clock", () => {
  assert.equal(clockPercent(1, 3), 33)
  assert.equal(clockPercent(1, 4), 25)
  assert.equal(clockPercent(0, 8), 0)
  assert.equal(clockDegrees(1, 4), 90)
  assert.equal(clockDegrees(3, 4), 270)
})

test("clockMarkRatio hides ticks that would sit on 12 o’clock", () => {
  assert.equal(clockMarkRatio(2, 8), 0.25)
  assert.equal(clockMarkRatio(0, 8), null)
  assert.equal(clockMarkRatio(8, 8), null)
  assert.equal(clockMarkRatio(12, 8), null)
  assert.equal(clockMarkRatio(2, 0), null)
})

test("heatClockFace uses a solid well or pie at the extremes", () => {
  assert.equal(heatClockFace(0, 10), "var(--heat-clock-well)")
  assert.equal(heatClockFace(10, 10), "var(--heat-clock-pie)")
  assert.match(heatClockFace(5, 10), /conic-gradient\(from -90deg/)
  assert.match(heatClockFace(5, 10), /50%/)
  assert.equal(heatClockRim(true), "var(--chart-1)")
  assert.equal(heatClockRim(false), "var(--chart-2)")
})
