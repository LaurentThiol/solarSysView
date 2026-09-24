import assert from "node:assert/strict"
import test from "node:test"

import {
  deltaDomain,
  deltaOverlayBands,
  previousLevel,
  summarizeDelta,
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

test("delta domain always contains zero", () => {
  assert.deepEqual(deltaDomain([]), [-1, 1])
  const [lo, hi] = deltaDomain([4, 8])
  assert.ok(lo < 0)
  assert.ok(hi > 8)
  const flat = deltaDomain([0, 0])
  assert.ok(flat[0] < 0 && flat[1] > 0)
})
