import assert from "node:assert/strict"
import test from "node:test"

import {
  deltaDomain,
  deltaHistogram,
  deltaOverlayBands,
  edgeMotion,
  previousLevel,
  shuffleMeanAbs,
  summarizeDelta,
  summarizeEdgeMotion,
  toDeltaSeries,
  type DeltaPoint,
} from "../src/lib/delta-evol.ts"
import { overlayPeriodFor } from "../src/lib/draw-overlays.ts"
import type { DeltaSource } from "../src/lib/delta-evol.ts"

function point(
  id: number,
  numbers: [number, number, number, number, number],
  stars: [number, number]
): DeltaSource {
  const [n1, n2, n3, n4, n5] = numbers
  const [e1, e2] = stars
  return {
    date: `2026-01-${String(id).padStart(2, "0")}`,
    weekday: id % 2 === 0 ? "vendredi" : "mardi",
    id,
    n1,
    n2,
    n3,
    n4,
    n5,
    sumNumbers: n1 + n2 + n3 + n4 + n5,
    e1,
    e2,
    sumStars: e1 + e2,
  }
}

test("delta is n minus n-1 and the first draw has no step", () => {
  const deltas: DeltaPoint[] = toDeltaSeries([
    point(1, [1, 2, 3, 4, 5], [1, 2]),
    point(2, [3, 6, 8, 10, 12], [2, 5]),
    point(3, [2, 4, 7, 9, 11], [1, 4]),
  ])

  assert.equal(deltas[0].n1, null)
  assert.equal(deltas[0].sumNumbers, null)
  assert.equal(deltas[0].sumStars, null)
  assert.equal(deltas[0].prevDate, null)

  assert.equal(deltas[1].n1, 2)
  assert.equal(deltas[1].n5, 7)
  assert.equal(deltas[1].e1, 1)
  assert.equal(deltas[1].e2, 3)
  assert.equal(deltas[1].sumNumbers, 24)
  assert.equal(deltas[1].sumStars, 4)
  assert.equal(previousLevel(deltas[1], "n1"), 1)
  assert.equal(deltas[1].level_n1, 3)

  assert.equal(deltas[2].n1, -1)
  assert.equal(deltas[2].sumNumbers, -6)
  assert.equal(deltas[2].sumStars, -2)
  assert.equal(previousLevel(deltas[2], "sumStars"), 7)
})

test("delta summary keeps sign, absolute step and streak", () => {
  const stats = summarizeDelta([null, 2, 4, -1])
  assert.ok(stats)
  assert.equal(stats.last, -1)
  assert.equal(stats.min, -1)
  assert.equal(stats.max, 4)
  assert.equal(stats.meanAbs, 7 / 3)
  assert.deepEqual(stats.streak, { sign: -1, length: 1 })
  assert.equal(summarizeDelta([null]), null)
})

test("Bollinger on deltas skips the first gap and stays aligned", () => {
  const values = [null, 1, 2, 3, 4, 5]
  assert.equal(overlayPeriodFor(values.length - 1), 0)
  const bands = deltaOverlayBands([null, 1, 1, 1, 1, 10], 5)
  assert.equal(bands[0].sma, null)
  assert.equal(bands[4].sma, null)
  assert.equal(bands[5].sma, (1 + 1 + 1 + 1 + 10) / 5)
  assert.ok(bands[5].upper != null && bands[5].lower != null)
  assert.ok((bands[5].upper ?? 0) > (bands[5].sma ?? 0))
})

test("n1 and n5 share a sign when the grid slides", () => {
  assert.equal(edgeMotion(2, 3), "slide")
  assert.equal(edgeMotion(-4, -1), "slide")
  assert.equal(edgeMotion(-2, 5), "stretch")
  assert.equal(edgeMotion(3, -4), "squeeze")
  assert.equal(edgeMotion(0, 4), "still")
  assert.equal(edgeMotion(null, 4), null)
  const summary = summarizeEdgeMotion([
    { n1: 1, n5: 2 },
    { n1: -3, n5: 4 },
    { n1: 2, n5: -1 },
    { n1: null, n5: null },
  ])
  assert.equal(summary.slide, 1)
  assert.equal(summary.stretch, 1)
  assert.equal(summary.squeeze, 1)
  assert.equal(summary.last, "squeeze")
  assert.equal(summary.lastSlide, 0)
})

test("histogram marks the last step and keeps empty bins", () => {
  const bins = deltaHistogram([null, -2, 0, 4], 1, 4)
  assert.deepEqual(
    bins.map((bin) => [bin.bin, bin.count, bin.holdsLast]),
    [
      [-2, 1, false],
      [-1, 0, false],
      [0, 1, false],
      [1, 0, false],
      [2, 0, false],
      [3, 0, false],
      [4, 1, true],
    ]
  )
  const wide = deltaHistogram([12, -3], 10, 12)
  assert.equal(wide[0].label, "-10 – -1")
  assert.equal(wide.at(-1)?.holdsLast, true)
})

test("a smooth series is calmer than a shuffle of the same values", () => {
  const smooth = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]
  const calm = shuffleMeanAbs(smooth, { seed: 7, trials: 80 })
  assert.ok(calm)
  assert.equal(calm.observed, 1)
  assert.ok(calm.shuffleMean > calm.observed)
  assert.equal(calm.trials, 80)
  const jumpy = shuffleMeanAbs([1, 12, 1, 12, 1, 12, 1, 12, 1, 12], { seed: 7, trials: 80 })
  assert.ok(jumpy)
  assert.ok(jumpy.observed > jumpy.shuffleMean)
  assert.equal(shuffleMeanAbs([4]), null)
})

test("delta domain always contains zero", () => {
  assert.deepEqual(deltaDomain([]), [-1, 1])
  const [lo, hi] = deltaDomain([4, 8])
  assert.ok(lo < 0)
  assert.ok(hi > 8)
  const flat = deltaDomain([0, 0])
  assert.ok(flat[0] < 0 && flat[1] > 0)
})
