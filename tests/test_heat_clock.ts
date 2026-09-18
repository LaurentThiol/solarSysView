import assert from "node:assert/strict"
import test from "node:test"

import {
  clockDegrees,
  clockMarkRatio,
  clockOverheat,
  clockPercent,
  clockRatio,
  clockScale,
  heatClockFace,
  heatClockRim,
} from "../src/lib/heat-clock.ts"

test("clockScale uses 2× expected when known, else the peak", () => {
  assert.equal(clockScale(10, 2), 4)
  assert.equal(clockScale(10, 6.9), 13.8)
  assert.equal(clockScale(10), 10)
  assert.equal(clockScale(10, 0), 10)
  assert.equal(clockScale(0, 0), 0)
})

test("clockOverheat is strictly past a full turn", () => {
  assert.equal(clockOverheat(4, 2), false)
  assert.equal(clockOverheat(4.1, 2), true)
  assert.equal(clockOverheat(5, 2), true)
  assert.equal(clockOverheat(14, 6.9), true)
  assert.equal(clockOverheat(13, 6.9), false)
  assert.equal(clockOverheat(5), false)
  assert.equal(clockOverheat(5, 0), false)
})

test("clockRatio clamps to 0–1 against the scale", () => {
  assert.equal(clockRatio(0, 10), 0)
  assert.equal(clockRatio(5, 10), 0.5)
  assert.equal(clockRatio(10, 10), 1)
  assert.equal(clockRatio(12, 10), 1)
  assert.equal(clockRatio(-2, 10), 0)
  assert.equal(clockRatio(5, 0), 0)
  assert.equal(clockRatio(Number.NaN, 10), 0)
  assert.equal(clockRatio(4, Number.POSITIVE_INFINITY), 0)
})

test("on the 2× scale, expected sits at 6 o’clock", () => {
  const scale = clockScale(20, 2)
  assert.equal(scale, 4)
  assert.equal(clockRatio(2, scale), 0.5)
  assert.equal(clockDegrees(2, scale), 180)
  assert.equal(clockMarkRatio(2, scale), 0.5)
  assert.equal(clockPercent(4, scale), 100)
  assert.equal(clockPercent(1, scale), 25)
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

test("heatClockFace uses a solid well, pie, or hot at the extremes", () => {
  assert.equal(heatClockFace(0, 10), "var(--heat-clock-well)")
  assert.equal(heatClockFace(10, 10), "var(--heat-clock-pie)")
  assert.match(heatClockFace(5, 10), /conic-gradient\(from -90deg/)
  assert.match(heatClockFace(5, 10), /50%/)
  assert.equal(heatClockFace(5, 4, true), "var(--heat-clock-hot)")
  assert.equal(heatClockRim(true), "var(--chart-1)")
  assert.equal(heatClockRim(false), "var(--chart-2)")
})
