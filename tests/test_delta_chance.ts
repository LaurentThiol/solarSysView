import assert from "node:assert/strict"
import test from "node:test"

import { orderStepLaw, rankStepLaw } from "../src/lib/delta-chance.ts"

test("order-statistic means follow r(N+1)/(k+1)", () => {
  assert.ok(Math.abs(rankStepLaw("n1").meanLevel - 51 / 6) < 1e-9)
  assert.ok(Math.abs(rankStepLaw("n3").meanLevel - (3 * 51) / 6) < 1e-9)
  assert.ok(Math.abs(rankStepLaw("n5").meanLevel - (5 * 51) / 6) < 1e-9)
  assert.ok(Math.abs(rankStepLaw("e1").meanLevel - 13 / 3) < 1e-9)
  assert.ok(Math.abs(rankStepLaw("e2").meanLevel - (2 * 13) / 3) < 1e-9)
})

test("step laws are symmetric and the middle rank moves more", () => {
  const n1 = rankStepLaw("n1")
  const n5 = rankStepLaw("n5")
  const n3 = rankStepLaw("n3")
  assert.ok(Math.abs(n1.meanAbs - n5.meanAbs) < 1e-9)
  assert.ok(Math.abs(rankStepLaw("e1").meanAbs - rankStepLaw("e2").meanAbs) < 1e-9)
  assert.ok(n3.meanAbs > n1.meanAbs)
  assert.ok(Math.abs(n1.mass(2) - n1.mass(-2)) < 1e-12)
  let total = 0
  for (let step = -50; step <= 50; step += 1) total += n1.mass(step)
  assert.ok(Math.abs(total - 1) < 1e-9)
  assert.ok(n1.absAtLeast(0) > 0.999)
  assert.ok(n1.absAtLeast(0) >= n1.absAtLeast(5))
  assert.ok(n1.absAtLeast(40) < 0.05)
})

test("a tiny pool has a hand-checkable step", () => {
  const law = orderStepLaw(3, 2, 1)
  assert.ok(Math.abs(law.meanLevel - (1 * 4) / 3) < 1e-9)
  assert.ok(law.meanAbs > 0)
  assert.ok(law.mass(0) > 0)
})
