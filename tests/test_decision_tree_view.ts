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
import {
  columnExtent,
  columnGroups,
  formatCell,
  tableSummary,
  unitScale,
} from "../src/lib/brain/question-table-view.ts"

test("labels keep retard for a ball and never for a lag", () => {
  assert.equal(featureLabel("sum.step"), "somme · pas")
  assert.equal(featureLabel("sum.last"), "somme · dernière")
  assert.equal(featureLabel("n1.slope"), "n1 · pente")
  assert.equal(featureLabel("e1.last"), "e1 · dernière")
  assert.equal(featureLabel("e2.z20"), "e2 · z20")
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

test("question table groups columns and scales each one", () => {
  const groups = columnGroups([
    { name: "sum.last", label: "somme · dernière", group: "somme", measure: "dernière" },
    { name: "sum.step", label: "somme · pas", group: "somme", measure: "pas" },
    { name: "n1.z20", label: "n1 · z20", group: "n1", measure: "z20" },
  ])
  assert.deepEqual(groups, [
    { label: "somme", span: 2 },
    { label: "n1", span: 1 },
  ])
  const bands = [
    { values: [10, null] },
    { values: [30, 1] },
  ]
  assert.deepEqual(columnExtent(bands, 0), { min: 10, max: 30 })
  assert.equal(unitScale(20, columnExtent(bands, 0)), 0.5)
  assert.equal(unitScale(null, columnExtent(bands, 0)), null)
  assert.equal(unitScale(4, { min: 4, max: 4 }), 0.5)
  assert.equal(formatCell(162.5), "162.50")
  assert.equal(formatCell(0.082), "0.082")
  assert.equal(formatCell(null), "—")
  const summary = tableSummary({
    question: "shape",
    phrase: "la somme du tirage t est haute",
    class_names: ["somme basse", "somme haute"],
    rows: 12,
    columns: 2,
    train_n: 8,
    holdout_n: 4,
    from_date: "2024-01-01",
    to_date: "2024-03-01",
    features: [],
    bands: [],
    cut_band: 1,
    tail: [],
  })
  assert.match(summary, /12 lignes, 2 colonnes/)
  assert.match(summary, /4 dernières lignes/)
})
