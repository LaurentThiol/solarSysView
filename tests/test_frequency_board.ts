import assert from "node:assert/strict"
import test from "node:test"

import {
  boardDigest,
  boardSummary,
  compareFrequencyRows,
  defaultSortDir,
  formatMeterRatio,
  formatSignedFr,
  meterPhrase,
  meterReading,
  sortFrequencyRows,
} from "../src/lib/frequency-board.ts"

const row = (value: number, count: number, delayDraws: number) => ({
  value,
  count,
  delayDraws,
})

test("the expected tick sits at mid-track until 2×", () => {
  const quiet = meterReading(0, 6.9)
  assert.equal(quiet.valuePct, 0)
  assert.equal(quiet.expectedPct, 50)
  assert.equal(quiet.ratio, 0)
  assert.equal(quiet.over, false)

  const onLaw = meterReading(6.9, 6.9)
  assert.equal(onLaw.valuePct, 50)
  assert.equal(onLaw.expectedPct, 50)
  assert.equal(onLaw.over, false)

  const full = meterReading(13.8, 6.9)
  assert.equal(full.valuePct, 100)
  assert.equal(full.expectedPct, 50)
  assert.equal(full.over, false)

  const hot = meterReading(14, 6.9)
  assert.equal(hot.valuePct, 100)
  assert.ok(hot.expectedPct != null && hot.expectedPct < 50)
  assert.equal(hot.over, true)
})

test("meterReading ignores a missing law and bad numbers", () => {
  const none = meterReading(4, 0)
  assert.equal(none.expectedPct, null)
  assert.equal(none.ratio, null)
  assert.equal(none.over, false)
  assert.equal(meterReading(Number.NaN, 2).valuePct, 0)
  assert.equal(meterReading(-3, 2).valuePct, 0)
  assert.equal(meterPhrase(null), "—")
  assert.equal(meterPhrase(0.84), "sous l’attendu")
  assert.equal(meterPhrase(1), "proche de l’attendu")
  assert.equal(meterPhrase(1.16), "au-dessus de l’attendu")
  assert.equal(formatMeterRatio(0.83), "0,83 ×")
  assert.equal(formatSignedFr(-1.24, 1), "-1,2")
  assert.equal(formatSignedFr(0, 1), "0")
})

test("columns sort, and ties keep the smaller number first", () => {
  const items = [row(12, 4, 3), row(2, 8, 3), row(7, 8, 11), row(4, 1, 0)]
  assert.deepEqual(
    sortFrequencyRows(items, "count", "desc", 5).map((item) => item.value),
    [2, 7, 12, 4]
  )
  assert.deepEqual(
    sortFrequencyRows(items, "delay", "desc", 5).map((item) => item.value),
    [7, 2, 12, 4]
  )
  assert.deepEqual(
    sortFrequencyRows(items, "parity", "asc", 5).map((item) => item.value),
    [2, 4, 12, 7]
  )
  assert.deepEqual(
    sortFrequencyRows(items, "value", "desc", 5).map((item) => item.value),
    [12, 7, 4, 2]
  )
  assert.ok(compareFrequencyRows(row(8, 9, 0), row(3, 1, 0), "delta", "desc", 5) < 0)
  assert.equal(defaultSortDir("value"), "asc")
  assert.equal(defaultSortDir("delay"), "desc")
})

test("board summary counts balls past the law", () => {
  const digest = boardDigest(
    [row(1, 3, 2), row(2, 8, 10), row(3, 12, 4), row(4, 6, 0)],
    5
  )
  assert.equal(digest.above, 3)
  assert.equal(digest.over, 1)
  assert.equal(digest.medianDelay, 3)
  assert.match(boardSummary(digest, 5), /Attendu 5× · 3 au-dessus · 1 au-delà de 2×/)
  assert.equal(boardSummary(boardDigest([], 0), 0), "Pas d’attendu sur une fenêtre vide.")
})
