import assert from "node:assert/strict"
import test from "node:test"

import {
  classifyBounds,
  constructRails,
  fitRailPair,
  fitSupportingLine,
  lineAt,
  projectRailTarget,
  slopeBiasOf,
} from "../src/lib/chartisme/rails"
import { isRailFigure, slopeBiasLabel } from "../src/lib/chartisme/catalog"
import {
  describeCondition,
  matchCondition,
  normalizeCondition,
  stateFromHit,
} from "../src/lib/chartisme/rules"

test("supporting rails rest on contacts, not an LS average", () => {
  const highs = [
    { index: 0, price: 20 },
    { index: 4, price: 21 },
    { index: 8, price: 19.4 },
  ]
  const line = fitSupportingLine(highs, "upper", 0.05, 10)
  assert.ok(line)
  for (const point of highs) {
    assert.ok(point.price - lineAt(line, point.index) <= 0.5 + 1e-9)
  }
})

test("parallel tilted contacts classify as canal, not rectangle", () => {
  const highs = [
    { index: 0, price: 30 },
    { index: 5, price: 35 },
    { index: 10, price: 40 },
  ]
  const lows = [
    { index: 2, price: 10 },
    { index: 7, price: 15 },
    { index: 12, price: 20 },
  ]
  const pair = fitRailPair(highs, lows, { eps: 0.05, scale: 30 })
  assert.ok(pair)
  assert.equal(pair.verdict?.figure, "canal")
  assert.equal(pair.slopeBias, "up")
  assert.ok(pair.height > 10)
  const mid0 = lineAt(pair.median, pair.first)
  assert.ok(mid0 < lineAt(pair.upper, pair.first))
  assert.ok(mid0 > lineAt(pair.lower, pair.first))
})

test("flat envelope horizontals classify as rectangle", () => {
  const highs = [
    { index: 1, price: 20 },
    { index: 5, price: 20.2 },
    { index: 9, price: 19.9 },
  ]
  const lows = [
    { index: 3, price: 8 },
    { index: 7, price: 8.1 },
    { index: 11, price: 7.9 },
  ]
  const pair = fitRailPair(highs, lows, { eps: 0.05, scale: 20 })
  assert.ok(pair)
  assert.equal(pair.verdict?.figure, "rectangle")
  assert.equal(pair.slopeBias, "flat")
  assert.equal(pair.upper[0], 0)
  assert.equal(pair.lower[0], 0)
})

test("3-click canal is two parallels through the third point", () => {
  const dates = Array.from({ length: 12 }, (_, i) => `2026-06-${String(i + 1).padStart(2, "0")}`)
  const built = constructRails({
    figure: "canal",
    dates,
    a: { index: 1, actual: 10 },
    b: { index: 8, actual: 17 },
    c: { index: 4, actual: 4 },
  })
  assert.ok(built)
  assert.ok(Math.abs(built.upper[0] - built.lower[0]) < 1e-9)
  assert.ok(Math.abs(lineAt(built.lower, 4) - 4) < 1e-9 || Math.abs(lineAt(built.upper, 4) - 4) < 1e-9)
  assert.equal(built.slopeBias, "up")
  assert.equal(built.samples.upper.length, 8)
})

test("rectangle construction forces two horizontals", () => {
  const dates = Array.from({ length: 10 }, (_, i) => `2026-07-${String(i + 1).padStart(2, "0")}`)
  const built = constructRails({
    figure: "rectangle",
    dates,
    a: { index: 0, actual: 18 },
    b: { index: 6, actual: 22 },
    c: { index: 3, actual: 7 },
  })
  assert.ok(built)
  assert.equal(built.upper[0], 0)
  assert.equal(built.lower[0], 0)
  assert.ok(Math.abs(built.upper[1] - 18) < 1e-9)
  assert.ok(Math.abs(built.lower[1] - 7) < 1e-9)
})

test("triangle construction shows diverging or converging rails, not a zigzag", () => {
  const dates = Array.from({ length: 16 }, (_, i) => `2026-08-${String(i + 1).padStart(2, "0")}`)
  const built = constructRails({
    figure: "triangle_sym",
    dates,
    a: { index: 1, actual: 20 },
    b: { index: 12, actual: 12 },
    c: { index: 2, actual: 6 },
  })
  assert.ok(built)
  const open = lineAt(built.upper, built.first) - lineAt(built.lower, built.first)
  const close = lineAt(built.upper, built.last) - lineAt(built.lower, built.last)
  assert.ok(close < open)
})

test("slope badge does not invent a second canal class", () => {
  assert.equal(isRailFigure("canal"), true)
  assert.equal(isRailFigure("tunnel_droit"), true)
  assert.equal(slopeBiasLabel("canal", "up"), "Canal haussier")
  assert.equal(slopeBiasLabel("canal", "down"), "Canal baissier")
  assert.equal(slopeBiasLabel("canal", "flat"), "Canal")
  assert.equal(slopeBiasLabel("rectangle", "up"), "Rectangle / range")
  const verdict = classifyBounds([0.8, 10], [0.8, 0], 0, 10)
  assert.equal(verdict?.figure, "canal")
  assert.equal(slopeBiasOf([0.8, 10], [0.8, 0], 0, 10), "up")
})

test("channel slope filter is not the breakout direction", () => {
  const state = stateFromHit({
    figure: "canal",
    label: "Canal",
    kind: "continuation",
    signal: "Cassure d'une des bornes du canal",
    confidence: 0.8,
    from_index: 0,
    to_index: 10,
    from: "2026-01-01",
    to: "2026-01-11",
    pivots: [],
    guides: [],
    breakout: {
      index: 11,
      date: "2026-01-12",
      value: 30,
      level: 20,
      direction: "down",
      activity_ratio: 1.4,
      volume_ok: true,
      holds: true,
      confirmed: true,
      fake: false,
    },
    target: { value: 10, basis: "Hauteur du canal reportée" },
    detector: "geometric",
    slopeBias: "up",
  })
  assert.equal(matchCondition(normalizeCondition({ channel_slope: "up" }), state), true)
  assert.equal(matchCondition(normalizeCondition({ channel_slope: "down" }), state), false)
  assert.equal(
    matchCondition(normalizeCondition({ direction: "down", channel_slope: "up" }), state),
    true
  )
  assert.match(describeCondition(normalizeCondition({ channel_slope: "up" })), /pente du canal haussière/)
})

test("projected target reports the rail height from the last bar", () => {
  const values = [10, 11, 12, 13, 14, 15, 16, 17, 18, 30]
  const target = projectRailTarget(values, [0, 20], [0, 10], 7, "any")
  assert.ok(target)
  assert.equal(target.direction, "up")
  assert.ok(target.value > 20)
})
