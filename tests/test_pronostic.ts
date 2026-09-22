import assert from "node:assert/strict"
import test from "node:test"

import {
  TOTAL_NUMBER_WAYS,
  TOTAL_STAR_WAYS,
  applyProposal,
  cascadeCounts,
  countOrdered,
  countStack,
  defaultStack,
  minIncreasingSum,
  moveLayer,
  pointsFromDraws,
  proposeBand,
  proposeStack,
  pointCovered,
  sampleStd,
  setLayerEnabled,
  theoreticalSlot,
  theoreticalSlots,
  tighten,
  walkForwardCoverage,
} from "../src/lib/pronostic/index.ts"

test("theoretical order-statistic bounds", () => {
  assert.deepEqual(theoreticalSlot("numbers", 0), { lo: 1, hi: 46 })
  assert.deepEqual(theoreticalSlot("numbers", 4), { lo: 5, hi: 50 })
  assert.deepEqual(theoreticalSlot("stars", 0), { lo: 1, hi: 11 })
  assert.deepEqual(theoreticalSlot("stars", 1), { lo: 2, hi: 12 })
})

test("unrestricted count matches the official universe", () => {
  assert.equal(countStack(defaultStack("numbers")), TOTAL_NUMBER_WAYS)
  assert.equal(countStack(defaultStack("stars")), TOTAL_STAR_WAYS)
})

test("smallest number sum is unique", () => {
  const state = defaultStack("numbers")
  state.minSum = 15
  state.maxSum = 15
  const tight = tighten(state).state
  assert.deepEqual(tight.slots, [
    { lo: 1, hi: 1 },
    { lo: 2, hi: 2 },
    { lo: 3, hi: 3 },
    { lo: 4, hi: 4 },
    { lo: 5, hi: 5 },
  ])
  assert.equal(countStack(state), 1)
})

test("sum vs n5 contradiction is diagnosed", () => {
  const state = defaultStack("numbers")
  state.minSum = 15
  state.maxSum = 20
  state.slots[4] = { lo: 40, hi: 50 }
  const result = tighten(state)
  assert.ok(result.diagnostics.length > 0)
  assert.equal(countStack(state), 0)
})

test("all even clips odd values out of slots", () => {
  const state = defaultStack("stars")
  state.minEven = 2
  state.maxEven = 2
  const tight = tighten(state).state
  assert.equal(tight.slots[0].lo % 2, 0)
  assert.equal(tight.slots[1].hi % 2, 0)
  assert.equal(countStack(state), 15)
})

test("ordered count with tight slots matches brute force", () => {
  const slots = [
    { lo: 1, hi: 6 },
    { lo: 3, hi: 9 },
    { lo: 8, hi: 20 },
    { lo: 18, hi: 35 },
    { lo: 30, hi: 50 },
  ]
  let brute = 0
  for (let a = 1; a <= 50; a += 1) {
    for (let b = a + 1; b <= 50; b += 1) {
      for (let c = b + 1; c <= 50; c += 1) {
        for (let d = c + 1; d <= 50; d += 1) {
          for (let e = d + 1; e <= 50; e += 1) {
            const combo = [a, b, c, d, e]
            if (combo.some((value, i) => value < slots[i].lo || value > slots[i].hi)) continue
            brute += 1
          }
        }
      }
    }
  }
  const counted = countOrdered({
    kind: "numbers",
    minSum: 15,
    maxSum: 240,
    minEven: 0,
    maxEven: 5,
    slots,
  })
  assert.equal(counted, brute)
  assert.ok(brute > 0)
  assert.ok(brute < TOTAL_NUMBER_WAYS)
})

test("monotonic min sum of theoretical slots is 15", () => {
  assert.equal(minIncreasingSum(theoreticalSlots("numbers")), 15)
})

test("cascade applies layers in stack order", () => {
  const state = defaultStack("stars")
  state.minSum = 23
  state.maxSum = 23
  const steps = cascadeCounts(state)
  assert.equal(steps[0].id, "universe")
  assert.equal(steps[0].count, 66)
  const afterSum = steps.find((step) => step.id === "sum")
  assert.equal(afterSum?.count, 1)
})

test("disabled layer does not shrink the count", () => {
  let state = defaultStack("stars")
  state.minSum = 23
  state.maxSum = 23
  state = setLayerEnabled(state, "sum", false)
  assert.equal(countStack(state), TOTAL_STAR_WAYS)
})

test("moving a layer changes cascade labels order", () => {
  const moved = moveLayer(defaultStack("numbers"), "slots", -1)
  assert.deepEqual(
    moved.layers.map((layer) => layer.id),
    ["sum", "slots", "parity"]
  )
})

test("minmax ± 0σ envelope is the observed min/max", () => {
  const band = proposeBand([10, 12, 20], { lo: 1, hi: 50 }, { method: "minmax_std", k: 0, percentile: 5 })
  assert.deepEqual(band, { lo: 10, hi: 20 })
})

test("percentile 0 envelope is min/max", () => {
  const band = proposeBand([4, 8, 15, 16], { lo: 1, hi: 50 }, { method: "percentile", k: 1, percentile: 0 })
  assert.equal(band.lo, 4)
  assert.equal(band.hi, 16)
})

test("sample std of a constant is 0", () => {
  assert.equal(sampleStd([3, 3, 3]), 0)
})

test("walk-forward coverage is 1 when the envelope is the full universe", () => {
  const draws = Array.from({ length: 30 }, (_, i) => ({
    date: `2026-01-${String(i + 1).padStart(2, "0")}`,
    numbers: [1 + (i % 5), 8, 15, 22, 40],
    stars: [1, 2],
  }))
  const points = pointsFromDraws("numbers", draws)
  const report = walkForwardCoverage(points, 10, 20, "numbers", {
    method: "minmax_std",
    k: 50,
    percentile: 5,
  })
  assert.ok(report.n > 0)
  assert.equal(report.rate, 1)
  assert.ok(report.meanVolume != null && report.meanVolume > 0)
})

test("proposal covers a point inside its bands", () => {
  const points = pointsFromDraws("stars", [
    { date: "2026-01-01", numbers: [1, 2, 3, 4, 5], stars: [3, 8] },
    { date: "2026-01-02", numbers: [1, 2, 3, 4, 5], stars: [4, 9] },
    { date: "2026-01-03", numbers: [1, 2, 3, 4, 5], stars: [2, 7] },
  ])
  const proposal = proposeStack("stars", points, { method: "minmax_std", k: 0, percentile: 5 })
  assert.ok(pointCovered(points[0], proposal))
  const applied = applyProposal(defaultStack("stars"), proposal)
  assert.equal(applied.minSum, 9)
  assert.equal(applied.maxSum, 13)
})
