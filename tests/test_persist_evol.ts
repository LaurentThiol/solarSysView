import assert from "node:assert/strict"
import test from "node:test"

import {
  numberPersistTheory,
  persistShare,
  sharedStarPool,
  starPersistTheory,
  toPersistSeries,
  type PersistSource,
} from "../src/lib/persist-evol.ts"

function source(
  date: string,
  numbers: number[],
  stars: number[],
  id = Number(date.slice(-2))
): PersistSource {
  return { date, id, weekday: id % 2 === 0 ? "vendredi" : "mardi", numbers, stars }
}

test("the first draw has no step and a repeat is +1", () => {
  const series = toPersistSeries([
    source("2026-01-03", [1, 2, 3, 4, 14], [5, 6], 3),
    source("2026-01-01", [1, 2, 3, 4, 6], [3, 4], 1),
  ])

  assert.equal(series[0].date, "2026-01-01")
  assert.equal(series[0].numbers, null)
  assert.equal(series[0].stars, null)
  assert.equal(series[0].prevDate, null)
  assert.deepEqual(series[0].repeatedNumbers, [])
  assert.deepEqual(series[0].repeatedStars, [])

  assert.equal(series[1].prevDate, "2026-01-01")
  assert.equal(series[1].numbers, 1)
  assert.deepEqual(series[1].repeatedNumbers, [1, 2, 3, 4])
  assert.equal(series[1].stars, 0)
  assert.deepEqual(series[1].repeatedStars, [])
})

test("numbers and stars persist independently", () => {
  const series = toPersistSeries([
    source("2026-01-01", [1, 2, 3, 4, 5], [1, 2]),
    source("2026-01-02", [6, 7, 8, 9, 10], [2, 3]),
    source("2026-01-03", [10, 11, 12, 13, 14], [4, 5]),
  ])

  assert.equal(series[1].numbers, 0)
  assert.equal(series[1].stars, 1)
  assert.deepEqual(series[1].repeatedStars, [2])

  assert.equal(series[2].numbers, 1)
  assert.deepEqual(series[2].repeatedNumbers, [10])
  assert.equal(series[2].stars, 0)
  assert.deepEqual(series[2].repeatedStars, [])
})

test("share and current +1 streak ignore the opening gap", () => {
  const share = persistShare([null, 1, 0, 1, 1])
  assert.deepEqual(share, { hits: 3, total: 4, share: 0.75, streak: 2 })
  assert.equal(persistShare([null, 0, 0])?.streak, 0)
  assert.equal(persistShare([null]), null)
})

test("theory is the chance two independent grids share a ball", () => {
  assert.equal(numberPersistTheory(), 1 - 1221759 / 2118760)
  assert.equal(starPersistTheory(12), 1 - 45 / 66)
  assert.equal(starPersistTheory(11), 1 - 36 / 55)
  assert.equal(starPersistTheory(9), null)
  assert.equal(sharedStarPool([{ star_pool: 12 }, {}]), 12)
  assert.equal(sharedStarPool([{ star_pool: 11 }, { star_pool: 12 }]), null)
  assert.equal(sharedStarPool([]), null)
})
