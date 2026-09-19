import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const copySrc = readFileSync(new URL("../src/lib/copy.ts", import.meta.url), "utf8")
const windowSrc = readFileSync(new URL("../src/lib/analysis-window.ts", import.meta.url), "utf8")
const labSearchSrc = readFileSync(new URL("../src/lib/lab-search.ts", import.meta.url), "utf8")
const jeuxSrc = readFileSync(new URL("../src/components/jeux/jeux-lab.tsx", import.meta.url), "utf8")

test("canonical window and era labels", () => {
  assert.match(copySrc, /WINDOW_TERM = "Fenêtre de travail"/)
  assert.match(copySrc, /current: "Formule actuelle \(12 ★\)"/)
  assert.match(copySrc, /all: "Tout l’historique"/)
  assert.match(windowSrc, /year: "Année civile"/)
  assert.match(windowSrc, /year_n1: "Année n-1"/)
  assert.match(windowSrc, /all: "Tout l’historique"/)
  assert.doesNotMatch(windowSrc, /Tout l’historique chargé/)
})

test("journal tab keeps histoJeux as id and Journal as label", () => {
  assert.match(copySrc, /JEUX_JOURNAL_TAB = "histoJeux"/)
  assert.match(copySrc, /JEUX_JOURNAL_LABEL = "Journal"/)
  assert.match(jeuxSrc, /label: JEUX_JOURNAL_LABEL/)
  assert.match(jeuxSrc, /id: JEUX_JOURNAL_TAB/)
})

test("glossary and fausse cassure", () => {
  assert.match(copySrc, /BREAKOUT_FAKE_LABEL = "fausse cassure"/)
  assert.match(copySrc, /term: "Année civile"/)
  assert.match(copySrc, /term: "Année n-1"/)
  assert.match(copySrc, /term: "Fenêtre de travail"/)
  assert.match(copySrc, /term: "Enregistrer"/)
  assert.match(copySrc, /term: "Période X"/)
  assert.match(copySrc, /term: "Warmup"/)
  assert.match(copySrc, /term: "Probabilités officielles"/)
  assert.match(copySrc, /export function filterGlossary/)
  assert.match(copySrc, /export function groupedGlossary/)
  assert.match(labSearchSrc, /export function asOneOf/)
})

test("user-facing copy vouvoie and drops fenêtre d’étude", () => {
  const chartisme = readFileSync(new URL("../src/components/chartisme/chartisme-lab.tsx", import.meta.url), "utf8")
  const specialists = readFileSync(new URL("../src/components/brain/brain-specialists.tsx", import.meta.url), "utf8")
  assert.match(chartisme, /élargissez la fenêtre de travail/)
  assert.doesNotMatch(chartisme, /élargis la/)
  assert.match(specialists, /non\s+enregistré/)
  assert.doesNotMatch(specialists, /sauvé/)
  assert.match(specialists, /specialistFeaturesHelp/)
  assert.match(specialists, /specialistFeatureHelp/)
})
