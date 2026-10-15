import assert from "node:assert/strict"
import test from "node:test"

import {
  NUMBER_MISS_RATE,
  STAR_MISS_RATE,
  ballValues,
  buildProbaBoards,
  observeBand,
  orderBalls,
  type ProbaDraw,
} from "../src/lib/proba-dynamic.ts"
import { chargePhrase } from "../src/lib/proba-dynamic-help.ts"

function close(actual: number, expected: number) {
  assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} ≈ ${expected}`)
}

function draw(
  date: string,
  numbers: number[],
  stars: number[] = [1, 2],
  pool = 12
): ProbaDraw {
  return { date, numbers, stars, star_pool: pool, weekday: "mardi" }
}

test("a miss adds 1/50 or 1/12 and a hit column is zero", () => {
  const numbers = observeBand(
    [],
    [
      draw("2026-01-02", [2, 3, 4, 5, 6]),
      draw("2026-01-06", [1, 2, 3, 4, 5]),
      draw("2026-01-09", [2, 3, 4, 5, 6]),
    ],
    "number"
  )
  const one = numbers[0]
  close(one.series[0], 1 / 50)
  close(one.series[1], 0)
  close(one.series[2], 1 / 50)
  assert.equal(one.delay, 1)
  assert.equal(one.censored, false)

  const stars = observeBand([], [draw("2026-01-02", [1, 2, 3, 4, 5], [2, 3])], "star")
  close(stars[0].series[0], 1 / 12)
  close(stars[1].series[0], 0)
  close(stars[0].rarity, STAR_MISS_RATE ** 1)
  close(numbers[0].rarity, NUMBER_MISS_RATE ** 1)
})

test("memory before the window is kept and an absent ball is censored", () => {
  const history = [
    draw("2026-01-02", [2, 3, 4, 5, 6]),
    draw("2026-01-06", [2, 3, 4, 5, 7]),
  ]
  const work = [
    draw("2026-01-09", [2, 3, 4, 5, 8]),
    draw("2026-01-13", [2, 3, 4, 5, 9]),
  ]
  const one = observeBand(history, work, "number")[0]
  close(one.series[0], 3 / 50)
  close(one.series[1], 4 / 50)
  assert.equal(one.delay, 4)
  assert.equal(one.censored, true)
  close(one.windowFloor, 2 / 50)
  assert.match(chargePhrase({
    kind: "number",
    value: 1,
    date: "2026-01-13",
    charge: one.series[1],
    delay: one.delay,
    rarity: one.rarity,
    censored: true,
    windowFloor: one.windowFloor,
  }), /au moins/)
})

test("draws before the 12-star pool do not charge or reset a star", () => {
  const history = [
    draw("2010-01-01", [1, 2, 3, 4, 5], [3, 4], 9),
    draw("2010-01-05", [1, 2, 3, 4, 5], [1, 2], 9),
    draw("2010-01-08", [1, 2, 3, 4, 5], [5, 6], 9),
    draw("2016-10-04", [1, 2, 3, 4, 5], [2, 3], 12),
  ]
  const work = [draw("2016-10-07", [1, 2, 3, 4, 5], [2, 3], 12)]
  const star = observeBand(history, work, "star")[0]
  assert.equal(star.delay, 2)
  close(star.series[0], 2 / 12)
})

test("decades, units and the counter order both bands", () => {
  const numbers = orderBalls([1, 10, 11, 12, 2, 21, 50], () => 0, "dizaines", "desc")
  assert.deepEqual(numbers, [1, 2, 10, 11, 12, 21, 50])
  assert.deepEqual(
    orderBalls([1, 10, 11, 12, 2, 21, 50], () => 0, "unites", "asc"),
    [1, 11, 21, 2, 12, 10, 50]
  )
  const stars = orderBalls([12, 1, 10, 11, 2], () => 0, "dizaines", "asc")
  assert.deepEqual(stars, [1, 2, 10, 11, 12])
  assert.deepEqual(orderBalls([12, 1, 10, 11, 2], () => 0, "unites", "asc"), [1, 11, 2, 12, 10])

  const delay = (value: number) => (value === 10 ? 1 : 5)
  assert.deepEqual(orderBalls([1, 2, 10], delay, "compteur", "desc"), [1, 2, 10])
  assert.deepEqual(orderBalls([1, 2, 10], delay, "compteur", "asc"), [10, 1, 2])
})

test("the counter sort reads the end of the last 50, not another scale", () => {
  const draws: ProbaDraw[] = [
    draw("2025-01-03", [1, 2, 3, 4, 5], [1, 2]),
    draw("2025-12-30", [7, 8, 9, 10, 11], [3, 4]),
    draw("2026-01-02", [1, 2, 3, 4, 5], [1, 2]),
    draw("2026-01-06", [1, 2, 3, 4, 6], [1, 2]),
    draw("2026-01-09", [1, 2, 3, 4, 8], [1, 2]),
  ]
  const { boards, referenceDelay } = buildProbaBoards(draws)
  assert.equal(boards.length, 6)
  assert.equal(referenceDelay.number[6], 3)
  const previous = boards.find((board) => board.preset === "year_n1")
  assert.equal(previous?.numbers.rows[6].delay, 0)
  const byLast50 = orderBalls(
    ballValues(50),
    (value) => referenceDelay.number[value - 1],
    "compteur",
    "desc"
  )
  assert.ok(byLast50.indexOf(7) < byLast50.indexOf(1))
  const mixed = buildProbaBoards([
    draw("2026-01-02", [1, 2, 3, 4, 5], [1, 2], 11),
    draw("2026-01-06", [1, 2, 3, 4, 5], [1, 2], 12),
  ])
  assert.equal(mixed.boards[0].starsHidden, true)
  assert.match(mixed.boards[0].starNote ?? "", /Rupture/)
  assert.equal(mixed.boards[0].stars, null)
})
