import assert from "node:assert/strict"
import test from "node:test"

import {
  cutIndices,
  lttbIndices,
  rdpIndices,
  visvalingamAreas,
} from "../src/lib/chartisme/simplify"

const SERIES = [0, 1, 2, 8, 3, 2, 1, 0, 1, 2, 6, 7, 6, 2, 1, 0, 2, 3]

function flag() {
  const pole = Array.from({ length: 21 }, (_, index) => index * 1.5)
  const pause = Array.from({ length: 27 }, (_, offset) => {
    const index = offset + 21
    return 30 + (index % 4 < 2 ? 2 : -1)
  })
  return [...pole, ...pause]
}

test("elimination keeps the corners and drops a flat step", () => {
  const areas = visvalingamAreas(SERIES)
  assert.equal(areas[0], Number.POSITIVE_INFINITY)
  assert.equal(areas[areas.length - 1], Number.POSITIVE_INFINITY)
  assert.deepEqual(cutIndices(SERIES, areas, 0.04, { variable: true }), [0, 3, 4, 7, 10, 12, 15, 17])
  assert.ok(!cutIndices(SERIES, areas, 0.2, { variable: false }).includes(1))
})

test("variable tolerance keeps a flag inside its pole", () => {
  const values = flag()
  const areas = visvalingamAreas(values)
  const variable = cutIndices(values, areas, 0.04, { variable: true })
  const constant = cutIndices(values, areas, 0.04, { variable: false })
  assert.deepEqual(constant, [0, 20, values.length - 1])
  assert.ok(variable.some((index) => index > 20 && index < values.length - 1))
})

test("rdp and lttb match the python twin", () => {
  assert.deepEqual(rdpIndices(SERIES, 0.08), [0, 2, 3, 4, 7, 9, 11, 13, 15, 17])
  assert.deepEqual(lttbIndices(SERIES, 7), [0, 3, 4, 7, 11, 15, 17])
})
