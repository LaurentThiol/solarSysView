import assert from "node:assert/strict"
import test from "node:test"

import {
  coherenceLabel,
  coherenceReading,
  numberCoherence,
  numberCoherenceTheory,
  starCoherence,
  starCoherenceTheory,
  variationCoherence,
} from "../src/lib/delta-coherence.ts"

test("coherence is 1 when every rank moves the same way and 0 when they cancel", () => {
  assert.equal(variationCoherence([2, 4, 1, 3, 5]), 1)
  assert.equal(variationCoherence([-1, -2, -3]), 1)
  assert.equal(variationCoherence([1, -1]), 0)
  assert.equal(variationCoherence([4, -1, -1]), 2 / 6)
  assert.equal(variationCoherence([0, 0, null]), null)
  assert.equal(variationCoherence([5, 0, 0]), 1)
  assert.equal(coherenceReading(1), "same")
  assert.equal(coherenceReading(0), "split")
  assert.equal(coherenceReading(0.5), "mixed")
  assert.equal(coherenceReading(null), "still")
  assert.equal(coherenceLabel("same"), "même sens")
})

test("number and star coherence read the order-statistic steps", () => {
  const point = { n1: 1, n2: 1, n3: -1, n4: -1, n5: 0, e1: 2, e2: -1 }
  assert.equal(numberCoherence(point), 0)
  assert.equal(starCoherence(point), 1 / 3)
})

test("theoretical coherence is a stable value between 0 and 1", () => {
  const numbers = numberCoherenceTheory()
  const stars = starCoherenceTheory(12)
  assert.ok(numbers > 0.2 && numbers < 0.95)
  assert.ok(stars > 0.2 && stars < 0.95)
  assert.equal(numberCoherenceTheory(), numbers)
  assert.equal(starCoherenceTheory(12), stars)
})
