import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

import {
  GLOSSARY,
  GLOSSARY_GROUP_LABELS,
  filterGlossary,
  foldGlossaryQuery,
  groupedGlossary,
} from "../src/lib/copy.ts"

const labSrc = readFileSync(new URL("../src/components/analysis/analysis-lab.tsx", import.meta.url), "utf8")
const dialogSrc = readFileSync(new URL("../src/components/help/glossary-dialog.tsx", import.meta.url), "utf8")
const memoSrc = readFileSync(new URL("../src/components/analysis/memo-panel.tsx", import.meta.url), "utf8")

test("Analyse groups Probabilités and Mémo under Glossaire", () => {
  const drawBlock = labSrc.slice(labSrc.indexOf("const DRAW_TABS"), labSrc.indexOf("const GLOSSARY_TABS"))
  const glossBlock = labSrc.slice(
    labSrc.indexOf("const GLOSSARY_TABS"),
    labSrc.indexOf("const MEASURE_BAR_HELP")
  )
  assert.match(labSrc, /label: "Glossaire"/)
  assert.doesNotMatch(drawBlock, /id: "proba"/)
  assert.doesNotMatch(drawBlock, /id: "memo"/)
  assert.match(glossBlock, /id: "proba"/)
  assert.match(glossBlock, /id: "memo"/)
  assert.match(labSrc, /\.\.\.GLOSSARY_TABS/)
})

test("global glossary is grouped and searchable without accents", () => {
  assert.equal(foldGlossaryQuery("Fenêtre"), "fenetre")
  const hits = filterGlossary("fenetre")
  assert.ok(hits.some((entry) => entry.term === "Fenêtre de travail"))
  const groups = groupedGlossary(GLOSSARY)
  assert.deepEqual(
    groups.map((group) => group.id),
    Object.keys(GLOSSARY_GROUP_LABELS)
  )
  assert.ok(groups.every((group) => group.entries.length > 0))
  assert.equal(filterGlossary("zzzz-inconnu").length, 0)
})

test("glossary dialog searches and points to Analyse · Glossaire", () => {
  assert.match(dialogSrc, /filterGlossary/)
  assert.match(dialogSrc, /groupedGlossary/)
  assert.match(dialogSrc, /Rechercher dans le glossaire/)
  assert.match(dialogSrc, /Analyse\s+· Glossaire/)
})

test("Mémo reuses glossary terms and groups indicators like Technique", () => {
  assert.match(memoSrc, /VOCAB_TERMS/)
  assert.match(memoSrc, /Tendance/)
  assert.match(memoSrc, /Momentum/)
  assert.match(memoSrc, /Volatilité/)
  assert.match(memoSrc, /href="\/analyse\?tab=proba"/)
})
