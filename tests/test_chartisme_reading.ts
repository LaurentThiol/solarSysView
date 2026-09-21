import assert from "node:assert/strict"
import test from "node:test"

import {
  figureVerdict,
  passesEnsembleBar,
  splitByEnsemble,
  verdictSentence,
  type BaseRateThreshold,
} from "../src/lib/chartisme/base-rate"
import { curveFamilies, curveSpecs } from "../src/lib/chartisme/curves"
import { interpretDetectResponse, opinionSentence } from "../src/lib/chartisme/opinions"
import { nearestOnCurve } from "../src/lib/chartisme/retrieval"
import { hitListCaption, outcomePhrase, visibleHitIndices } from "../src/lib/chartisme/scan"

const row = (partial: Partial<BaseRateThreshold> & { threshold: number | null }): BaseRateThreshold => ({
  length: 60,
  trials: 120,
  target: 0.2,
  achieved: 0.18,
  required: partial.threshold ?? 0.97,
  ...partial,
})

test("figureVerdict reads the motif's own bar", () => {
  const bars = { 60: { double_bottom: row({ threshold: 0.71, achieved: 0.19 }) } }
  const verdict = figureVerdict({ figure: "double_bottom", scale: 60, confidence: 0.42 }, bars, 0.6)
  assert.equal(verdict.mode, "rarity")
  assert.equal(verdict.threshold, 0.71)
  assert.equal(verdict.unseen, false)
  assert.match(verdictSentence(verdict), /Confiance 0\.42/)
  assert.match(verdictSentence(verdict), /Seuil de ce motif 0\.71/)
  assert.match(verdictSentence(verdict), /19 %/)
})

test("an unseen motif is distinctive and an unreachable one stays common", () => {
  const bars = { 60: { triangle_sym: row({ threshold: null, required: 0.99, achieved: 0.4 }) } }
  const unseen = figureVerdict({ figure: "diamond", scale: 60, confidence: 0.3 }, bars, 0.6)
  assert.equal(unseen.unseen, true)
  assert.match(verdictSentence(unseen), /distinctive/)
  const lost = figureVerdict({ figure: "triangle_sym", scale: 60, confidence: 0.9 }, bars, 0.6)
  assert.equal(lost.threshold, null)
  assert.match(verdictSentence(lost), /0\.99/)
})

test("confidence mode poses one number for every figure", () => {
  const verdict = figureVerdict({ figure: "canal", scale: 30, confidence: 0.55 }, null, 0.6)
  assert.equal(verdict.mode, "confidence")
  assert.equal(verdict.threshold, 0.6)
  assert.match(verdictSentence(verdict), /Seuil posé 0\.60/)
})

test("the ensemble bar drops an unreachable scale and keeps the rest", () => {
  const hits = [
    { scale: 30, confidence: 0.8, figure: "a" },
    { scale: 60, confidence: 0.9, figure: "b" },
    { scale: 60, confidence: 0.4, figure: "c" },
  ]
  const split = splitByEnsemble(hits, {
    minConfidence: 0.5,
    byScale: { 30: 0.7, 60: null },
  })
  assert.equal(split.seen.length, 3)
  assert.deepEqual(
    split.kept.map((hit) => hit.figure),
    ["a"]
  )
  assert.equal(passesEnsembleBar({ scale: 120, confidence: 0.5 }, { minConfidence: 0.5, byScale: { 30: 0.7 } }), true)
  assert.equal(passesEnsembleBar({ scale: 120, confidence: 0.4 }, { minConfidence: 0.5, byScale: null }), false)
})

test("outcome phrase carries the draw count", () => {
  assert.equal(outcomePhrase({ status: "reached", bars: 4 }), "objectif atteint en 4 tirages")
  assert.equal(outcomePhrase({ status: "invalidated", bars: 1 }), "invalidée en 1 tirage")
  assert.equal(outcomePhrase({ status: "open", bars: 3 }), "en cours depuis 3 tirages")
  assert.equal(outcomePhrase({ status: "no_breakout", bars: null }), "pas de cassure")
  assert.equal(outcomePhrase(null), "pas de cassure")
})

test("the hit list says when it is cut and keeps the selection beyond the cap", () => {
  assert.equal(hitListCaption(12), null)
  assert.equal(hitListCaption(41), "40 premières sur 41")
  assert.deepEqual(visibleHitIndices(50, 3), Array.from({ length: 40 }, (_, index) => index))
  assert.equal(visibleHitIndices(50, 44).at(-1), 44)
  assert.equal(visibleHitIndices(50, 44).length, 41)
})

test("curve families cover every spec once", () => {
  const families = curveFamilies()
  const ids = families.flatMap((family) =>
    family.specs.map((spec) => (spec.n === null ? spec.variable : `${spec.variable}:${spec.n}`))
  )
  const catalog = curveSpecs().map((spec) => (spec.n === null ? spec.variable : `${spec.variable}:${spec.n}`))
  assert.equal(ids.length, catalog.length)
  assert.equal(new Set(ids).size, ids.length)
  assert.deepEqual(new Set(ids), new Set(catalog))
  assert.ok(families.some((family) => family.id === "ranks" && family.specs.length === 5))
  assert.ok(families.some((family) => family.id === "gaps" && family.specs.length === 4))
  assert.ok(families.some((family) => family.id === "delay" && family.specs.length === 50))
})

test("DTW neighbours skip the window being read", () => {
  const values = Array.from({ length: 80 }, (_, index) => Math.sin(index / 5))
  const neighbours = nearestOnCurve(values, 40, 55, { top: 3 })
  assert.ok(neighbours.length > 0)
  for (const neighbour of neighbours) {
    const overlaps = Math.min(neighbour.to_index, 55) >= Math.max(neighbour.from_index, 40)
    assert.equal(overlaps, false)
    assert.ok(neighbour.similarity > 0)
  }
  assert.deepEqual(nearestOnCurve(values, 0, values.length - 1), [])
})

test("a detect response without networks stays absent", () => {
  assert.equal(interpretDetectResponse(null).status, "absent")
  assert.equal(interpretDetectResponse({ ok: false }).status, "absent")
  assert.equal(interpretDetectResponse({ ok: true, models: { geometric: "canal", models: {} } }).status, "absent")
  const ready = interpretDetectResponse({
    ok: true,
    models: {
      geometric: "canal",
      models: {
        svgformer: {
          detector: "svgformer",
          figure: "canal",
          label: "Canal",
          confidence: 0.81,
          abstained: false,
          candidates: [{ figure: "canal", label: "Canal" }],
        },
        gnn: {
          detector: "gnn",
          figure: null,
          label: null,
          confidence: 0.4,
          abstained: true,
          candidates: [{ figure: "rectangle", label: "Rectangle / range" }],
        },
      },
    },
  })
  assert.equal(ready.status, "ready")
  assert.match(opinionSentence(ready.opinions[0], "canal"), /d'accord avec la géométrie/)
  assert.match(opinionSentence(ready.opinions[1], "canal"), /s'abstient/)
  assert.match(opinionSentence(ready.opinions[0], "ete"), /autre lecture que la géométrie/)
})
