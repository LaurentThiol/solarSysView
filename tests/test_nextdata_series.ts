import assert from "node:assert/strict"
import test from "node:test"

import { lowestSumMae } from "../src/lib/nextdata/retour.ts"
import { seriesRows } from "../src/lib/nextdata/series.ts"

const rows = [
  { label: "a", kind: "history", sum: 100, sum_corpus: 120 },
  { label: "b", kind: "history", sum: 150, sum_corpus: 125 },
  { label: "c", kind: "forecast", sum_corpus: 128, sum_corpus_lo: 100, sum_corpus_hi: 155 },
]

test("the forecast band starts from the last draw", () => {
  const levels = seriesRows(rows, "sum", "corpus", false)
  assert.equal(levels[1].sum_corpus_lo, 150)
  assert.equal(levels[1].sum_corpus_hi, 150)
  assert.equal(levels[2].sum_corpus_lo, 100)
  assert.equal(levels[2].sum_corpus_hi, 155)
  assert.equal(rows[1].sum_corpus_lo, undefined)
})

test("DeltaEvol reads the band against the last draw, not in levels", () => {
  const deltas = seriesRows(rows, "sum", "corpus", true)
  assert.equal(deltas[0].sum, null)
  assert.equal(deltas[1].sum, 50)
  assert.equal(deltas[2].sum_corpus, 3)
  assert.equal(deltas[2].sum_corpus_lo, -50)
  assert.equal(deltas[2].sum_corpus_hi, 5)
  assert.equal(deltas[1].sum_corpus_lo, 50)
  assert.equal(deltas[2].sum, null)
})

test("a null value is a gap, not a zero", () => {
  const deltas = seriesRows(
    [
      { label: "a", kind: "history", sum: null },
      { label: "b", kind: "history", sum: 120 },
    ],
    "sum",
    "corpus",
    true
  )
  assert.equal(deltas[1].sum, null)
})

test("the lowest sum error counts CatBoost and the baselines", () => {
  const metrics = {
    corpus: { mae: { sum: 20.94 } },
    fenetre: { mae: { sum: 22.24 } },
    corpus_catboost: { mae: { sum: 20.48 } },
    fenetre_catboost: { mae: { sum: 22.54 } },
    persistence: { mae: { sum: 29.72 } },
    mean: { mae: { sum: 20.04 } },
  }
  assert.equal(lowestSumMae(metrics), "mean")
  assert.equal(lowestSumMae({ ...metrics, mean: { mae: { sum: 20.94 } } }), "corpus_catboost")
  assert.equal(lowestSumMae({ corpus: { mae: { sum: 21 } }, fenetre: { mae: { sum: null } } }), "corpus")
  assert.equal(lowestSumMae({}), null)
})
