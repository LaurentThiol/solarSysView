import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

import {
  DEMO_MASK_AXES,
  TWINS_DEMO_STEPS,
  demoQueryDate,
  demoTwinPreview,
  isDemoMask,
  twinsDemoStepOf,
  twinsDemoWantsStart,
} from "../src/lib/twins-demo.ts"
import { FINGERPRINT_AXES } from "../src/lib/fingerprints.ts"

const panelSrc = readFileSync(new URL("../src/components/analysis/twins-panel.tsx", import.meta.url), "utf8")
const labSrc = readFileSync(new URL("../src/components/analysis/analysis-lab.tsx", import.meta.url), "utf8")
const barSrc = readFileSync(new URL("../src/components/analysis/twins-demo.tsx", import.meta.url), "utf8")
const readme = readFileSync(new URL("../README.md", import.meta.url), "utf8")

test("twins demo starts on ?demo=1 / jumeaux and ignores empty or Brain specialistes", () => {
  assert.equal(twinsDemoWantsStart("?demo=1"), true)
  assert.equal(twinsDemoWantsStart("demo=oui"), true)
  assert.equal(twinsDemoWantsStart("?tab=jumeaux&demo=twins"), true)
  assert.equal(twinsDemoWantsStart("?demo=jumeaux"), true)
  assert.equal(twinsDemoWantsStart(""), false)
  assert.equal(twinsDemoWantsStart("?demo=specialistes"), false)
})

test("twins demo has six Suivant/Annuler steps and a three-axis mask", () => {
  assert.equal(TWINS_DEMO_STEPS.length, 6)
  assert.deepEqual(
    TWINS_DEMO_STEPS.map((step) => step.id),
    ["window", "axes", "mask", "heatmap", "twins", "analogs"]
  )
  assert.equal(twinsDemoStepOf("mask").target, "twins-axes")
  assert.ok(DEMO_MASK_AXES.every((axis) => FINGERPRINT_AXES.includes(axis)))
  assert.ok(isDemoMask(["parity", "sum", "spread"]))
  assert.equal(isDemoMask([...FINGERPRINT_AXES]), false)
})

test("demo query is not the last draw when the window has at least three", () => {
  const draws = [
    { date: "2026-01-02", numbers: [1, 2, 3, 4, 5], stars: [1, 2] },
    { date: "2026-01-06", numbers: [6, 7, 8, 9, 10], stars: [3, 4] },
    { date: "2026-01-09", numbers: [11, 12, 13, 14, 15], stars: [5, 6] },
    { date: "2026-01-13", numbers: [16, 17, 18, 19, 20], stars: [7, 8] },
  ]
  assert.equal(demoQueryDate(draws), "2026-01-09")
  const preview = demoTwinPreview(draws)
  assert.equal(preview.query?.date, "2026-01-09")
  assert.ok(preview.neighbors.length >= 1)
  assert.ok(!preview.neighbors.some((row) => row.date === preview.query?.date))
})

test("Jumeaux panel wires the Brain-style tour (bar, popup, actions)", () => {
  assert.match(panelSrc, /TwinsDemoBar/)
  assert.match(panelSrc, /TwinsDemoPopup/)
  assert.match(panelSrc, /twinsDemoWantsStart/)
  assert.match(panelSrc, /Somme · étendue · parité/)
  assert.match(barSrc, /Lancer la démo/)
  assert.match(barSrc, /Suivant \/ Annuler/)
  assert.match(labSrc, /data-demo="twins-window"/)
  assert.match(labSrc, /twinsDemoWantsStart/)
  assert.match(readme, /\/analyse\?tab=jumeaux&demo=1/)
})
