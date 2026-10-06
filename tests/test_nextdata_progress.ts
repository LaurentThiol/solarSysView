import assert from "node:assert/strict"
import test from "node:test"

import { summarizeShifts, trainingPercent } from "../src/lib/nextdata/training-progress.ts"

test("the training percent is the share of finished shifts", () => {
  assert.equal(trainingPercent(0), 0)
  assert.equal(trainingPercent(1), 10)
  assert.equal(trainingPercent(10), 100)
  assert.equal(trainingPercent(11), 100)
  assert.equal(trainingPercent(-1), 0)
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
