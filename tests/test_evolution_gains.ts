import assert from "node:assert/strict"
import test from "node:test"

import {
  formatCompactCount,
  formatCompactEuro,
  isPrizeRank,
  numbersSum,
  pairedFinite,
  prizeMass,
  shareFrPercent,
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

test("compact axis labels switch to k and M", () => {
  assert.equal(formatCompactCount(80), "80")
  assert.equal(formatCompactCount(24_000), "24 k")
  assert.match(formatCompactCount(1_300_000), /1,3 M/)
  assert.match(formatCompactEuro(48_175_066), /M€/)
  assert.equal(isPrizeRank(13), true)
  assert.equal(isPrizeRank(0), false)
})
