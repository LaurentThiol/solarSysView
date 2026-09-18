import assert from "node:assert/strict"
import test from "node:test"

import {
  DEFAULT_TWIN_K,
  FINGERPRINT_AXES,
  buildFingerprintIndex,
  cosine,
  formatDeltaChip,
  isFingerprintAxis,
  paramDeltas,
  parseFingerprintAxes,
  roundDelta,
  zScore,
  type FingerprintDraw,
} from "../src/lib/fingerprints.ts"

const SAMPLE: FingerprintDraw[] = [
  { date: "2026-08-21", numbers: [1, 2, 3, 4, 5], stars: [1, 2] },
  { date: "2026-08-25", numbers: [1, 6, 7, 8, 9], stars: [1, 3] },
  { date: "2026-08-28", numbers: [1, 10, 11, 12, 13], stars: [4, 5] },
]

test("fingerprint axes exclude delay and hit", () => {
  assert.ok(!FINGERPRINT_AXES.includes("delay" as (typeof FINGERPRINT_AXES)[number]))
  assert.equal(isFingerprintAxis("delay"), false)
  assert.equal(isFingerprintAxis("hit"), false)
  assert.equal(isFingerprintAxis("star_delay"), false)
  assert.equal(isFingerprintAxis("sum"), true)
  assert.deepEqual(parseFingerprintAxes(["sum", "parity", "sum", "delay"]), ["sum", "parity"])
  assert.deepEqual(parseFingerprintAxes([]), [...FINGERPRINT_AXES])
  assert.equal(DEFAULT_TWIN_K, 8)
})

test("cosine of identical vectors is 1; orthogonal is 0", () => {
  assert.ok(Math.abs(cosine([1, 0, 0], [1, 0, 0]) - 1) < 1e-9)
  assert.equal(cosine([1, 0], [0, 1]), 0)
  assert.equal(cosine([], [1]), 0)
  assert.equal(cosine([0, 0], [0, 0]), 0)
})

test("z-score is 0 when sigma is 0", () => {
  assert.equal(zScore(12, 12, 0), 0)
  assert.equal(zScore(14, 12, 2), 1)
})

test("deltas are neighbor minus query in Analyse units", () => {
  const query = buildFingerprintIndex(SAMPLE, { queryDate: "2026-08-21" }).query
  const other = buildFingerprintIndex(SAMPLE, { queryDate: "2026-08-28" }).query
  assert.ok(query && other)
  const delta = paramDeltas(query.params, other.params, ["sum", "parity", "spread"])
  assert.equal(delta.sum, 32)
  assert.equal(delta.parity, 0)
  assert.equal(delta.spread, 8)
  assert.equal(roundDelta("centroid", 0.20004), 0.2)
  assert.equal(formatDeltaChip("sum", -2), "sum −2")
  assert.equal(formatDeltaChip("parity", 0), "parity 0")
})

test("masking axes changes the neighbor ranking", () => {
  const extra: FingerprintDraw[] = [
    { date: "2026-01-01", numbers: [1, 2, 3, 4, 5], stars: [1, 2] },
    { date: "2026-01-02", numbers: [1, 2, 3, 4, 6], stars: [1, 2] },
    { date: "2026-01-03", numbers: [1, 2, 3, 4, 5], stars: [8, 9] },
  ]
  const numbers = buildFingerprintIndex(extra, {
    queryDate: "2026-01-01",
    axes: ["sum", "parity", "spread"],
    k: 2,
  })
  const stars = buildFingerprintIndex(extra, {
    queryDate: "2026-01-01",
    axes: ["star_sum", "e1", "e2"],
    k: 2,
  })
  assert.equal(numbers.query?.params.sum, 15)
  assert.equal(numbers.neighbors[0]?.date, "2026-01-03")
  assert.equal(numbers.neighbors[0]?.score, 1)
  assert.equal(stars.neighbors[0]?.date, "2026-01-02")
  assert.equal(stars.neighbors[0]?.score, 1)
  assert.notEqual(numbers.neighbors[0]?.date, stars.neighbors[0]?.date)
})

test("self is excluded and default query is the last draw", () => {
  const index = buildFingerprintIndex(SAMPLE)
  assert.equal(index.query?.date, "2026-08-28")
  assert.ok(index.neighbors.every((row) => row.date !== index.query?.date))
  assert.ok(index.neighbors.every((row) => row.score <= 1))
  assert.equal(index.rows.length, 3)
  assert.equal(index.rows[0]?.z.length, FINGERPRINT_AXES.length)
})
