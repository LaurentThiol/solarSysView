import assert from "node:assert/strict"
import test from "node:test"

import {
  coveringHitIndices,
  cycleHitIndex,
  hitIndicesForLabel,
  hoverHitIndex,
} from "../src/lib/chartisme/banner"

const hits = [
  { from_index: 10, to_index: 40, label: "Tête & épaules" },
  { from_index: 20, to_index: 28, label: "Fanion" },
  { from_index: 60, to_index: 80, label: "Tête & épaules" },
]

test("coveringHitIndices prefers the shortest mark at that sample", () => {
  assert.deepEqual(coveringHitIndices(hits, 5), [])
  assert.deepEqual(coveringHitIndices(hits, 12), [0])
  assert.deepEqual(coveringHitIndices(hits, 24), [1, 0])
  assert.deepEqual(coveringHitIndices(hits, 70), [2])
})

test("hoverHitIndex keeps the selected reading when it still covers", () => {
  assert.equal(hoverHitIndex([], 0), null)
  assert.equal(hoverHitIndex([1, 0], -1), 1)
  assert.equal(hoverHitIndex([1, 0], 0), 0)
})

test("cycleHitIndex walks overlapping or same-label readings", () => {
  assert.equal(cycleHitIndex([], 0), null)
  assert.equal(cycleHitIndex([1, 0], -1), 1)
  assert.equal(cycleHitIndex([1, 0], 1), 0)
  assert.equal(cycleHitIndex([1, 0], 0), 1)
})

test("hitIndicesForLabel lists every reading of a figure", () => {
  assert.deepEqual(hitIndicesForLabel(hits, "Tête & épaules"), [0, 2])
  assert.deepEqual(hitIndicesForLabel(hits, "Fanion"), [1])
  assert.deepEqual(hitIndicesForLabel(hits, "Drapeau"), [])
})
