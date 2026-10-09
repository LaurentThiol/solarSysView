import assert from "node:assert/strict"
import test from "node:test"

import { BAND_FIELDS, calibrationCaption, formatRunClock, formatShare, progressPercent } from "../src/lib/nextdata/bands.ts"

test("shares are whole percents, a missing one is a dash", () => {
  assert.equal(formatShare(0.6234), "62 %")
  assert.equal(formatShare(1), "100 %")
  assert.equal(formatShare(null), "—")
  assert.equal(formatShare(Number.NaN), "—")
})

test("the progress bar is the share of steps ready", () => {
  assert.equal(progressPercent(null), 0)
  assert.equal(progressPercent({ ready: 0, total: 51, complete: false }), 0)
  assert.equal(progressPercent({ ready: 17, total: 51, complete: false }), 33)
  assert.equal(progressPercent({ ready: 60, total: 51, complete: true }), 100)
})

test("the clock next to the bar is elapsed time, not a remaining estimate", () => {
  assert.equal(formatRunClock(0), "0 s")
  assert.equal(formatRunClock(9.8), "9 s")
  assert.equal(formatRunClock(65), "1 min 05 s")
  assert.equal(formatRunClock(3725), "1 h 02 min")
  assert.equal(formatRunClock(Number.NaN), "0 s")
})

test("the caption says when the bands are calibrated", () => {
  assert.equal(calibrationCaption({ steps: 50, calibrated: true }), "Bandes 10–90 calibrées sur 50 tirages du retour.")
  assert.equal(calibrationCaption({ steps: 3, calibrated: false }), "Bandes 10–90 brutes : le calibrage attend neuf tirages du retour.")
  assert.equal(calibrationCaption(undefined), "")
  assert.deepEqual(
    BAND_FIELDS.map((field) => field.key).filter((key) => key.startsWith("n")),
    ["n1", "n2", "n3", "n4", "n5"]
  )
})
