import assert from "node:assert/strict"
import test from "node:test"

import { sma } from "../src/lib/analysis"
import {
  bandExcursions,
  isOverlayDataKey,
  mapBandPoint,
  overlayBands,
  overlayField,
  overlayPeriodFor,
  overlayRecord,
  readOverlay,
} from "../src/lib/draw-overlays"

test("overlay period follows the Évolution SMA rule", () => {
  assert.equal(overlayPeriodFor(0), 0)
  assert.equal(overlayPeriodFor(9), 0)
  assert.equal(overlayPeriodFor(10), 5)
  assert.equal(overlayPeriodFor(39), 5)
  assert.equal(overlayPeriodFor(40), 10)
})

test("overlay field names are stable for Recharts dataKeys", () => {
  assert.equal(overlayField("n1", "sma"), "sma_n1")
  assert.equal(overlayField("relNumbers", "bbUpper"), "bbUpper_relNumbers")
  assert.equal(isOverlayDataKey("n1"), false)
  assert.equal(isOverlayDataKey("sma_n1"), true)
  assert.equal(isOverlayDataKey("pctB_n3"), true)
  assert.equal(isOverlayDataKey("smaNumbers"), false)
})

test("Bollinger middle is the SMA and percentB is 0 at the lower band", () => {
  const values = [1, 2, 3, 4, 5]
  const bands = overlayBands(values, 3, 2)
  const middle = sma(values, 3)
  assert.deepEqual(
    bands.map((band) => band.sma),
    middle
  )
  assert.equal(bands[0].sma, null)
  assert.equal(bands[1].upper, null)
  const ready = bands[2]
  assert.ok(ready.upper != null && ready.lower != null && ready.sma != null)
  assert.ok(ready.upper > ready.sma)
  assert.ok(ready.lower < ready.sma)
  const atLower = overlayBands([ready.lower, 2, 3, 4, 5], 1, 2)
  assert.equal(atLower[0].percentB, 0.5)
  const span = ready.upper - ready.lower
  const expectedPct = (values[2] - ready.lower) / span
  assert.ok(Math.abs((ready.percentB ?? NaN) - expectedPct) < 1e-12)
})

test("percentB is 0 at lower and 1 at upper of a known window", () => {
  const values = [10, 12, 14]
  const bands = overlayBands(values, 3, 2)
  const last = bands[2]
  assert.ok(last.lower != null && last.upper != null)
  const atLower = (last.lower - last.lower) / (last.upper - last.lower)
  const atUpper = (last.upper - last.lower) / (last.upper - last.lower)
  assert.equal(atLower, 0)
  assert.equal(atUpper, 1)
  const reconstructedLower =
    last.lower + 0 * (last.upper - last.lower)
  const reconstructedUpper =
    last.lower + 1 * (last.upper - last.lower)
  assert.equal(reconstructedLower, last.lower)
  assert.equal(reconstructedUpper, last.upper)
})

test("band excursions count points strictly outside the supplied bands", () => {
  const values = [1, 5, 10]
  const bands = [
    { sma: 5, upper: 8, lower: 2, percentB: 0 },
    { sma: 5, upper: 8, lower: 2, percentB: 0.5 },
    { sma: 5, upper: 8, lower: 2, percentB: 1 },
  ]
  assert.deepEqual(bandExcursions(values, bands), { outside: 2, ready: 3 })
  assert.deepEqual(bandExcursions(values, overlayBands(values, 0)), {
    outside: 0,
    ready: 0,
  })
})

test("overlay records expose chart and absolute fields", () => {
  const abs = overlayBands([2, 4, 6, 8], 3)[2]
  const chart = mapBandPoint(abs, (value) => value * 10)
  const record = overlayRecord("n1", chart, abs)
  assert.equal(record.sma_n1, chart.sma)
  assert.equal(record.smaAbs_n1, abs.sma)
  assert.equal(record.pctB_n1, abs.percentB)
  assert.ok(record.bbSpan_n1 != null)
  assert.equal(
    record.bbSpan_n1,
    (chart.upper as number) - (chart.lower as number)
  )
  assert.equal(mapBandPoint(abs, (value) => value).percentB, abs.percentB)
  assert.equal(readOverlay(record, "n1", "sma"), chart.sma)
  assert.equal(readOverlay(record, "n1", "smaAbs"), abs.sma)
  assert.equal(readOverlay({}, "n1", "sma"), null)
})
