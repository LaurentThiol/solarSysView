import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const labSrc = readFileSync(new URL("../src/components/analysis/analysis-lab.tsx", import.meta.url), "utf8")
const copySrc = readFileSync(new URL("../src/lib/copy.ts", import.meta.url), "utf8")
const panelSrc = readFileSync(new URL("../src/components/analysis/twins-panel.tsx", import.meta.url), "utf8")

test("Analyse exposes the Jumeaux tab at /analyse?tab=jumeaux", () => {
  assert.match(labSrc, /id: "jumeaux"/)
  assert.match(labSrc, /label: "Jumeaux"/)
  assert.match(labSrc, /<TwinsPanel/)
  assert.match(labSrc, /draws=\{work\}/)
  assert.match(labSrc, /twinsFromUrl/)
  assert.match(copySrc, /jumeaux: "Jumeaux"/)
})

test("Jumeaux panel is the fingerprint index, not a Morpho or PCA view", () => {
  assert.match(panelSrc, /Heatmap de l’index/)
  assert.match(panelSrc, /Huit plus proches/)
  assert.match(panelSrc, /formatDeltaChip/)
  assert.match(panelSrc, /buildFingerprintIndex/)
  assert.doesNotMatch(panelSrc, /PCA|t-SNE|CLIP/)
  assert.match(panelSrc, /pas une prédiction/)
  assert.match(panelSrc, /TwinsDemoBar/)
  assert.match(panelSrc, /Épingler/)
  assert.match(panelSrc, /initialQuery/)
})
