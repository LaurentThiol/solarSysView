import assert from "node:assert/strict"
import test from "node:test"

import { bandCoverage, deltaNumbers, visibleTrainingShift } from "../src/lib/nextdata/training-progress.ts"

test("DeltaEvol is the gap versus the previous shift", () => {
  assert.deepEqual(deltaNumbers([[1, 4], [3, null], [3, 1]]), [
    [null, null],
    [2, null],
    [0, null],
  ])
})

test("the rank figure follows the latest measured shift unless one is pinned", () => {
  const shifts = [{ x: 1 }, { x: 2 }, { x: 3 }]
  assert.equal(visibleTrainingShift([], null), null)
  assert.equal(visibleTrainingShift(shifts, null)?.x, 3)
  assert.equal(visibleTrainingShift(shifts.slice(0, 1), null)?.x, 1)
  assert.equal(visibleTrainingShift(shifts, 1)?.x, 1)
  assert.equal(visibleTrainingShift(shifts, 9)?.x, 3)
})

test("the band column counts the draws inside, where the reading has a band", () => {
  const shifts = [
    { readings: { corpus: { errors: { sum: 3 }, in_band: { n1: true, sum: false } }, persistence: { errors: { sum: 1 }, in_band: { n1: null } } } },
    { readings: { corpus: { errors: { sum: -2 }, in_band: { n1: true, sum: true } } } },
    { readings: { corpus: { errors: { sum: 5 }, in_band: { n1: false, sum: null } } } },
  ]
  assert.deepEqual(bandCoverage(shifts, "corpus", "n1"), { inside: 2, total: 3 })
  assert.deepEqual(bandCoverage(shifts, "corpus", "sum"), { inside: 1, total: 2 })
  assert.deepEqual(bandCoverage(shifts, "persistence", "n1"), { inside: 0, total: 0 })
})

test("raw and calibrated bands are counted apart", () => {
  const shifts = [
    { readings: { corpus: { calibrated: true, in_band: { n5: true }, in_band_raw: { n5: false } } } },
    { readings: { corpus: { calibrated: true, in_band: { n5: true }, in_band_raw: { n5: true } } } },
    { readings: { corpus: { calibrated: false, in_band: { n5: false }, in_band_raw: { n5: false } } } },
  ]
  assert.deepEqual(bandCoverage(shifts, "corpus", "n5", "raw"), { inside: 1, total: 3 })
  assert.deepEqual(bandCoverage(shifts, "corpus", "n5", "calibrated"), { inside: 2, total: 2 })
})
