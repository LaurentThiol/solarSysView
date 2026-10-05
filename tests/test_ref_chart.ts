import assert from "node:assert/strict"
import test from "node:test"

import { calendarAnchor, phaseMeanCurve, trajectorySegments } from "../src/lib/ref-chart.ts"
import type { PlanePoint, TracePoint } from "../src/lib/ref.ts"

function trace(phase: number, sum: number): TracePoint {
  return {
    date: "2024-01-01",
    phase,
    sum,
    star_sum: 0,
    n1: 1,
    n2: 2,
    n3: 3,
    n4: 4,
    n5: 5,
    e1: 1,
    e2: 2,
  }
}

function plane(x: number, y: number): PlanePoint {
  return { ...trace(0, 100), x, y }
}

test("phase mean follows the draw magnitude inside each phase bin", () => {
  const curve = phaseMeanCurve(
    [trace(0.1, 80), trace(0.2, 120), trace(0.9, 40)],
    "sum",
    2
  )
  assert.equal(curve.length, 2)
  assert.equal(curve[0].value, 100)
  assert.equal(curve[1].value, 40)
  assert.ok(curve[0].phase < curve[1].phase)
})

test("trajectory breaks when a phase wraps, and keeps the draw order", () => {
  const segments = trajectorySegments([
    plane(0.7, 0.2),
    plane(0.9, 0.35),
    plane(0.05, 0.4),
    plane(0.15, 0.5),
  ])
  assert.equal(segments.length, 2)
  assert.deepEqual(
    segments[0].map((point) => point.x),
    [0.7, 0.9]
  )
  assert.deepEqual(
    segments[1].map((point) => point.x),
    [0.05, 0.15]
  )
})

const dates = ["2024-06-18", "2024-06-21", "2024-06-25"]

test("calendar anchor sits on a draw that is the solstice day", () => {
  const x = calendarAnchor("2024-06-21", dates, (day) => ({ "2024-06-18": 0, "2024-06-21": 30, "2024-06-25": 70 })[day])
  assert.equal(x, 30)
})

test("calendar anchor interpolates a solstice between two draws", () => {
  const x = calendarAnchor("2024-06-20", dates, (day) => ({ "2024-06-18": 0, "2024-06-21": 30, "2024-06-25": 70 })[day])
  assert.equal(x, 20)
})

test("calendar anchor stays quiet outside the window", () => {
  const xOf = (day: string) => ({ "2024-06-18": 0, "2024-06-21": 30, "2024-06-25": 70 })[day]
  assert.equal(calendarAnchor("2024-06-17", dates, xOf), null)
  assert.equal(calendarAnchor("2024-06-26", dates, xOf), null)
})
