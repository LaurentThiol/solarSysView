import assert from "node:assert/strict"
import test from "node:test"

import { reliefHasSum } from "../src/lib/nextdata/relief.ts"

test("the panel opens on a stage-1 sum without TimesFM", () => {
  assert.equal(reliefHasSum([{ sommes: { corpus: { sum: 120, star_sum: 8 } }, timesfm: null }]), true)
  assert.equal(reliefHasSum([{ sommes: {}, timesfm: { lo: { sum: 90 }, hi: { sum: 140 } } }]), false)
  assert.equal(reliefHasSum([]), false)
})
