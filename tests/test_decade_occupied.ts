import assert from "node:assert/strict"
import test from "node:test"

import { decadeCounts, decadeOccupied } from "../src/lib/grid-shape.ts"

test("occupied decades count the bands a draw touches, from 1 to 5", () => {
  assert.equal(decadeOccupied(decadeCounts([1, 2, 3, 4, 5])), 1)
  assert.equal(decadeOccupied(decadeCounts([1, 2, 11, 21, 50])), 4)
  assert.equal(decadeOccupied(decadeCounts([1, 11, 21, 31, 41])), 5)
  assert.equal(decadeOccupied(decadeCounts([10, 20, 30, 40, 50])), 5)

  const grids = [
    [1, 2, 3, 4, 5],
    [6, 16, 17, 26, 46],
    [9, 19, 29, 39, 49],
    [10, 11, 12, 13, 50],
    [41, 42, 43, 44, 45],
  ]
  for (const numbers of grids) {
    const counts = decadeCounts(numbers)
    const occupied = decadeOccupied(counts)
    assert.equal(counts.reduce((sum, item) => sum + item, 0), 5)
    assert.ok(occupied >= 1 && occupied <= 5)
    assert.equal(
      occupied,
      counts.filter((item) => item > 0).length
    )
  }
})
