import assert from "node:assert/strict"
import test from "node:test"

import {
  expectedNumberDelay,
  expectedStarDelay,
  hottest,
  overdue,
  type FrequencyItem,
} from "../src/lib/frequency-rank.ts"

function item(
  value: number,
  count: number,
  delayDraws: number
): FrequencyItem {
  return { value, count, lastSeen: null, delayDraws }
}

test("hottest ranks by count descending and drops average balls", () => {
  const ranked = hottest(
    [item(8, 3, 4), item(1, 6, 2), item(7, 6, 0), item(3, 2, 9), item(4, 5, 1)],
    10,
    { minCount: 2 }
  )
  assert.deepEqual(
    ranked.map((row) => row.value),
    [7, 1, 4, 8]
  )
  for (let i = 1; i < ranked.length; i += 1) {
    assert.ok(ranked[i].count <= ranked[i - 1].count)
  }
})

test("overdue ranks by delay descending and drops a hot on-time star", () => {
  const ranked = overdue(
    [
      item(4, 6, 3),
      item(2, 3, 10),
      item(8, 2, 9),
      item(9, 4, 5),
      item(3, 1, 4),
    ],
    6,
    { minDelay: 6 }
  )
  assert.deepEqual(
    ranked.map((row) => [row.value, row.delayDraws]),
    [
      [2, 10],
      [8, 9],
    ]
  )
  assert.equal(
    ranked.some((row) => row.value === 4),
    false
  )
  for (let i = 1; i < ranked.length; i += 1) {
    assert.ok(ranked[i].delayDraws <= ranked[i - 1].delayDraws)
  }
})

test("expected delays are the geometric waits 10 and 6", () => {
  assert.equal(expectedNumberDelay(), 10)
  assert.equal(expectedStarDelay(), 6)
})
