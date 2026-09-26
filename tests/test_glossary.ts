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

test("Analyse no longer hosts Glossaire or Adresse tab groups", () => {
  assert.doesNotMatch(labSrc, /GLOSSARY_TABS/)
  assert.doesNotMatch(labSrc, /ADDRESS_TABS/)
  assert.doesNotMatch(labSrc, /id: "proba"/)
  assert.doesNotMatch(labSrc, /id: "memo"/)
  assert.doesNotMatch(labSrc, /id: "adresse"/)
  assert.doesNotMatch(labSrc, /<ProbaPanel/)
  assert.doesNotMatch(labSrc, /<MemoPanel/)
  assert.doesNotMatch(labSrc, /<AddressPanel/)
  assert.match(labSrc, /label: "Technique"/)
  assert.match(labSrc, /label: "Tirage"/)
})

test("banner glossary is a Vocabulaire / Probabilités / Mémo / Chartisme menu", () => {
  assert.match(dialogSrc, /GLOSSARY_SECTION_LABELS/)
  assert.match(dialogSrc, /id: "vocab"/)
  assert.match(dialogSrc, /id: "proba"/)
  assert.match(dialogSrc, /id: "memo"/)
  assert.match(dialogSrc, /id: "chartisme"/)
  assert.match(dialogSrc, /<ProbaPanel/)
  assert.match(dialogSrc, /<MemoPanel/)
  assert.match(dialogSrc, /<ChartismeGlossary/)
  assert.match(dialogSrc, /filterGlossary/)
  assert.match(dialogSrc, /groupedGlossary/)
  assert.match(dialogSrc, /Rechercher dans le glossaire/)
  assert.match(dialogSrc, /Rechercher une courbe ou une figure/)
  assert.match(dialogSrc, /event\.key !== "l"/)
  assert.doesNotMatch(dialogSrc, /Analyse\s+· Glossaire/)
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

test("Mémo reuses glossary terms and links to overlay sections", () => {
  assert.match(memoSrc, /VOCAB_TERMS/)
  assert.match(memoSrc, /Tendance/)
  assert.match(memoSrc, /Momentum/)
  assert.match(memoSrc, /Volatilité/)
  assert.match(memoSrc, /href="\?glossaire=proba"/)
  assert.match(memoSrc, /href="\?glossaire=vocab"/)
})
