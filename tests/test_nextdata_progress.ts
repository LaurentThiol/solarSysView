import assert from "node:assert/strict"
import test from "node:test"

import { bandCoverage, deltaNumbers, summarizeShifts, trainingPercent, visibleTrainingShift } from "../src/lib/nextdata/training-progress.ts"

test("the training percent is the share of finished shifts", () => {
  assert.equal(trainingPercent(0), 0)
  assert.equal(trainingPercent(1), 10)
  assert.equal(trainingPercent(10), 100)
  assert.equal(trainingPercent(11), 100)
  assert.equal(trainingPercent(-1), 0)
})

test("DeltaEvol is the gap versus the previous shift", () => {
  assert.deepEqual(deltaNumbers([[1, 4], [3, null], [3, 1]]), [
    [null, null],
    [2, null],
    [0, null],
  ])
})

test("the running summary is the mean absolute sum error so far", () => {
  const summary = summarizeShifts([
    {
      readings: {
        corpus: { errors: { sum: 10 }, hits_numbers: 1 },
        persistence: { errors: { sum: -4 }, hits_numbers: 0 },
      },
    },
    {
      readings: {
        corpus: { errors: { sum: -2 }, hits_numbers: 2 },
        persistence: { errors: { sum: 6 }, hits_numbers: 1 },
      },
    },
  ])
  assert.equal(summary.corpus.mae_sum, 6)
  assert.equal(summary.corpus.hits_numbers, 1.5)
  assert.equal(summary.corpus.count, 2)
  assert.equal(summary.persistence.mae_sum, 5)
  assert.equal(summary.persistence.count, 2)
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
