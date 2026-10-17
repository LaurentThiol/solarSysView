import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

import { profileGrid, type CombinationGrid } from "../src/lib/combinations.ts"
import type { FrequencyItem } from "../src/lib/frequency-rank.ts"

function item(value: number, delayDraws: number, count: number): FrequencyItem {
  return { value, count, lastSeen: null, delayDraws }
}

function grid(numbers: number[], stars: number[]): CombinationGrid {
  return { numbers, stars }
}

const draws = [{ date: "2026-01-02", numbers: [20, 21, 22, 23, 24], stars: [5, 6] }]

test("two grids with the same delay mean keep each ball", () => {
  const numbers = [
    item(7, 40, 3),
    item(8, 0, 12),
    item(9, 0, 11),
    item(10, 0, 9),
    item(11, 0, 8),
    item(1, 8, 4),
    item(2, 8, 5),
    item(3, 8, 6),
    item(4, 8, 7),
    item(5, 8, 2),
  ]
  const stars = [item(1, 0, 4), item(2, 16, 1), item(3, 8, 3), item(4, 8, 9)]
  const spread = profileGrid(grid([7, 8, 9, 10, 11], [1, 2]), draws, numbers, stars)
  const flat = profileGrid(grid([1, 2, 3, 4, 5], [3, 4]), draws, numbers, stars)

  assert.equal(spread.numberDelayMean, 8)
  assert.equal(flat.numberDelayMean, 8)
  assert.deepEqual(
    spread.numberReads.map((read) => read.n),
    [7, 8, 9, 10, 11]
  )
  assert.deepEqual(spread.numberReads, [
    { n: 7, delay: 40, count: 3 },
    { n: 8, delay: 0, count: 12 },
    { n: 9, delay: 0, count: 11 },
    { n: 10, delay: 0, count: 9 },
    { n: 11, delay: 0, count: 8 },
  ])
  assert.deepEqual(
    flat.numberReads.map((read) => [read.n, read.delay, read.count]),
    [
      [1, 8, 4],
      [2, 8, 5],
      [3, 8, 6],
      [4, 8, 7],
      [5, 8, 2],
    ]
  )
  assert.notDeepEqual(spread.numberReads, flat.numberReads)

  assert.equal(spread.starDelayMean, 8)
  assert.equal(flat.starDelayMean, 8)
  assert.deepEqual(spread.starReads, [
    { n: 1, delay: 0, count: 4 },
    { n: 2, delay: 16, count: 1 },
  ])
  assert.deepEqual(flat.starReads, [
    { n: 3, delay: 8, count: 3 },
    { n: 4, delay: 8, count: 9 },
  ])
  assert.equal(spread.starCountMean, 2.5)
  assert.equal(flat.starCountMean, 6)
})

test("the profile card lists each ball and keeps the mean as a caption", () => {
  const panel = readFileSync(
    new URL("../src/components/combinaisons/combinaisons-panel.tsx", import.meta.url),
    "utf8"
  )
  assert.match(panel, /profile\.numberReads/)
  assert.match(panel, /profile\.starReads/)
  assert.match(panel, /retard \{formatStat\(read\.delay/)
  assert.match(panel, /Moyenne des retards/)
  assert.match(panel, /profile\.starCountMean/)
  assert.doesNotMatch(panel, /label="Retard n°"/)
  assert.doesNotMatch(panel, /label="Retard ★"/)
})
