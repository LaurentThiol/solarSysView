import assert from "node:assert/strict"
import test from "node:test"

import {
  ariaTreeLabel,
  ballChanceRow,
  featureLabel,
  formatThreshold,
  leafLine,
  nullHistogram,
  primaryFollowUp,
  readingStale,
  ruleCuts,
  splitText,
} from "../src/lib/brain/decision-tree-view.ts"

test("labels keep retard for a ball and never for a lag", () => {
  assert.equal(featureLabel("sum.step"), "somme · pas")
  assert.equal(featureLabel("sum.last"), "somme · dernière")
  assert.equal(featureLabel("n1.slope"), "n1 · pente")
  assert.equal(featureLabel("ball.delay"), "boule · retard")
  assert.equal(featureLabel("sum.last").includes("retard"), false)
  assert.equal(featureLabel("sum.step").includes("retard"), false)
})

test("thresholds match the drawing and the leaf line", () => {
  const split = { label: "somme · pas", sense: "gt", threshold: 18 }
  assert.equal(formatThreshold(162.5), "162.50")
  assert.equal(splitText(split), "somme · pas > 18.00")
  const rule = {
    node: 4,
    path: [
      split,
      { label: "n1 · dernière", sense: "le", threshold: 12.4, text: "n1 · dernière ≤ 12.40" },
    ],
    class_name: "somme haute",
    train_n: 212,
    train_rate: 0.64,
    holdout_n: 48,
    holdout_rate: 0.58,
    positive: true,
  }
  assert.deepEqual(ruleCuts(rule), ["somme · pas > 18.00", "n1 · dernière ≤ 12.40"])
  assert.equal(leafLine(rule), "apprentissage 64 % · n 212 / contrôle 58 % · n 48")
  assert.match(ariaTreeLabel([rule]), /Feuille 4/)
})

test("stale readings, follow-up and ball chances", () => {
  assert.equal(readingStale({ era: "current", weekday: null, draw_count: 10 }, { era: "current", weekday: "all", drawCount: 13 }).label, "3 tirages depuis")
  assert.equal(readingStale({ era: "current", weekday: "mardi", draw_count: 10 }, { era: "all", weekday: "mardi", drawCount: 10 }).label, "ère différente")
  assert.equal(primaryFollowUp("series", true), "train")
  assert.equal(primaryFollowUp("balls", true), "jeux")
  assert.equal(primaryFollowUp("chartisme", true), "rule")
  assert.equal(primaryFollowUp("shape", false), "retry")
  const chances = ballChanceRow([{ ball: 7, proba: 0.42 }])
  assert.equal(chances.length, 50)
  assert.equal(chances[6], 42)
  assert.equal(chances[0], 100)
  const hist = nullHistogram([0.4, 0.5, 0.6], 0.7, 4)
  assert.equal(hist.bins.reduce((sum, bin) => sum + bin.count, 0), 3)
  assert.equal(hist.realAt, 3)
})
