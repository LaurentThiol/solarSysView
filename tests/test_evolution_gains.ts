import assert from "node:assert/strict"
import test from "node:test"

import {
  filterDrawsByWeekday,
  formatCompactCount,
  formatCompactEuro,
  isPrizeRank,
  logDomain,
  logPlotValue,
  massRankKey,
  numbersSum,
  pairedFinite,
  prizeMass,
  reportLengthsFromSteps,
  shareFrPercent,
  weekdayMean,
  winnersOutsideFrance,
} from "../src/lib/gains.ts"

test("winnersOutsideFrance is EU minus FR and never FR plus EU", () => {
  assert.equal(winnersOutsideFrance(10, 80), 70)
  assert.equal(winnersOutsideFrance(10, 8), 0)
  assert.equal(winnersOutsideFrance(null, 80), null)
  assert.equal(shareFrPercent(10, 80), 12.5)
  assert.equal(shareFrPercent(10, 0), null)
  const fr = 10
  const eu = 80
  assert.equal(fr + eu, 90)
  assert.notEqual(fr + eu, eu)
  assert.equal(eu, fr + (winnersOutsideFrance(fr, eu) ?? 0))
})

test("number sum and prize mass stay arithmetic", () => {
  assert.equal(numbersSum([1, 2, 3, 4, 5]), 15)
  assert.equal(numbersSum([8, 27, 42, 44, 46]), 167)
  assert.equal(prizeMass(10, 4.2), 42)
  assert.equal(prizeMass(80, 4.2), 336)
  assert.equal(prizeMass(null, 4.2), null)
  assert.deepEqual(pairedFinite([15, 20, null], [80, 90, 10]), {
    xs: [15, 20],
    ys: [80, 90],
  })
})

test("report length counts consecutive rollovers then resets", () => {
  assert.deepEqual(reportLengthsFromSteps([1, 1, 1, 0, 1, null, 1]), [
    1,
    2,
    3,
    0,
    1,
    null,
    2,
  ])
  assert.deepEqual(reportLengthsFromSteps([0, 0]), [0, 0])
})

test("log scale drops zeros and keeps a positive domain", () => {
  assert.equal(logPlotValue(0), null)
  assert.equal(logPlotValue(4.2), 4.2)
  assert.deepEqual(logDomain([0, 5, 50_000_000]), [2.5, 50_000_000])
  assert.equal(logDomain([0, 0]), null)
})

test("weekday filter and means keep mardi and vendredi apart", () => {
  const rows = [
    { weekday: "mardi", value: 10 },
    { weekday: "vendredi", value: 30 },
    { weekday: "mardi", value: 20 },
  ]
  assert.equal(filterDrawsByWeekday(rows, "mardi").length, 2)
  assert.equal(filterDrawsByWeekday(rows, "vendredi").length, 1)
  assert.equal(filterDrawsByWeekday(rows, "all").length, 3)
  assert.equal(filterDrawsByWeekday(rows, "synthese").length, 3)
  assert.equal(weekdayMean(rows, "mardi"), 15)
  assert.equal(weekdayMean(rows, "vendredi"), 30)
  assert.equal(massRankKey(13), "massR13")
})

test("compact axis labels switch to k and M", () => {
  assert.equal(formatCompactCount(80), "80")
  assert.equal(formatCompactCount(24_000), "24 k")
  assert.match(formatCompactCount(1_300_000), /1,3 M/)
  assert.match(formatCompactEuro(48_175_066), /M€/)
  assert.equal(isPrizeRank(13), true)
  assert.equal(isPrizeRank(0), false)
})
