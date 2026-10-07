import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

import { compareGrids, formatDecimal, formatSigned, meanOf, sharedValues } from "../src/lib/nextdata/compare.ts"

const view = readFileSync(new URL("../src/components/nextdata/training-compare.tsx", import.meta.url), "utf8")

test("shared balls stay in the order of the draw", () => {
  assert.deepEqual(sharedValues([18, 22, 32, 41, 48], [8, 9, 18, 43, 45]), [18])
  assert.deepEqual(sharedValues([7, 8, 10, 22, 35], [7, 15, 24, 36, 43]), [7])
  assert.deepEqual(sharedValues([1, 2, 3, 4, 5], []), [])
})

test("a number is not the same ball as a star", () => {
  const row = compareGrids(
    { numbers: [1, 2, 3, 4, 5], stars: [1, 2] },
    { numbers: [6, 7, 8, 9, 10], stars: [1, 3] },
  )
  assert.deepEqual(row.numberHits, [])
  assert.deepEqual(row.starHits, [1])
  assert.equal(row.actual.spread, 4)
  assert.equal(row.actual.starSpread, 1)
  assert.equal(row.forecast?.starSpread, 2)
  assert.equal(row.gap?.starSpread, 1)
})

test("the shape gap is forecast minus draw", () => {
  const row = compareGrids(
    { numbers: [18, 22, 32, 41, 48], stars: [4, 6] },
    { numbers: [8, 9, 18, 43, 45], stars: [1, 9] },
  )
  assert.deepEqual(row.numberHits, [18])
  assert.deepEqual(row.starHits, [])
  assert.equal(row.actual.spread, 30)
  assert.equal(row.actual.consecutive, 0)
  assert.equal(row.actual.starSpread, 2)
  assert.equal(row.forecast?.spread, 37)
  assert.equal(row.forecast?.consecutive, 1)
  assert.equal(row.forecast?.starSpread, 8)
  assert.deepEqual(row.gap, { spread: 7, consecutive: 1, starSpread: 6, starConsecutive: 0 })
})

test("a missing forecast leaves the draw and no hits", () => {
  const row = compareGrids({ numbers: [11, 12, 15, 38, 49], stars: [8, 10] }, null)
  assert.equal(row.forecast, null)
  assert.equal(row.gap, null)
  assert.deepEqual(row.numberHits, [])
  assert.equal(row.actual.spread, 38)
  assert.equal(row.actual.consecutive, 1)
  assert.equal(compareGrids({ numbers: [], stars: [] }, { numbers: [], stars: [1, 2] }).forecast, null)
})

test("signed integers match the rank table, means use a french decimal", () => {
  assert.equal(formatSigned(7), "+7")
  assert.equal(formatSigned(0), "0")
  assert.equal(formatSigned(-2), "-2")
  assert.equal(formatDecimal(0.64), "0,6")
  assert.equal(formatDecimal(2.44, true), "+2,4")
  assert.equal(formatDecimal(-0.16, true), "-0,2")
  assert.equal(formatDecimal(0, true), "0,0")
  assert.equal(meanOf([]), null)
  assert.equal(meanOf([1, 0, 0]), 1 / 3)
})

test("the training table keeps sorti and prévu on their own rows", () => {
  assert.match(view, /<table/)
  assert.match(view, /Sorti/)
  assert.match(view, /Prévu/)
  assert.match(view, /Étendue ★/)
  assert.match(view, /Consécutifs ★/)
  assert.match(view, /data-hit/)
  assert.match(view, /prévu moins sorti/)
  assert.match(view, /Moyenne/)
})
