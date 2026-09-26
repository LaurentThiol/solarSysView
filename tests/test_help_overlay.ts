import assert from "node:assert/strict"
import test from "node:test"

import {
  applyHelpOverlaySearch,
  asGlossarySection,
  isAddressQuery,
  lastGlossarySection,
  legacyAnalyseHelpTab,
  readHelpOverlay,
  rememberGlossarySection,
  rewriteLegacyHelpSearch,
} from "../src/lib/help-overlay.ts"

test("glossary section and address flags parse aliases", () => {
  assert.equal(asGlossarySection("vocab"), "vocab")
  assert.equal(asGlossarySection("Vocabulaire"), "vocab")
  assert.equal(asGlossarySection("proba"), "proba")
  assert.equal(asGlossarySection("MEMO"), "memo")
  assert.equal(asGlossarySection("chartisme"), "chartisme")
  assert.equal(asGlossarySection("Courbes"), "chartisme")
  assert.equal(asGlossarySection("figures"), "chartisme")
  assert.equal(asGlossarySection("inconnu"), null)
  assert.equal(isAddressQuery("1"), true)
  assert.equal(isAddressQuery("oui"), true)
  assert.equal(isAddressQuery("0"), false)
})

test("legacy Analyse tabs rewrite to banner overlays", () => {
  assert.deepEqual(legacyAnalyseHelpTab("proba"), { glossary: "proba", adresse: false })
  assert.deepEqual(legacyAnalyseHelpTab("memo"), { glossary: "memo", adresse: false })
  assert.deepEqual(legacyAnalyseHelpTab("adresse"), { glossary: null, adresse: true })
  assert.equal(legacyAnalyseHelpTab("jumeaux"), null)
  assert.equal(rewriteLegacyHelpSearch("tab=jumeaux"), null)
  assert.equal(rewriteLegacyHelpSearch("tab=proba&variable=sum"), "variable=sum&glossaire=proba")
  assert.equal(rewriteLegacyHelpSearch("tab=adresse"), "adresse=1")
  assert.equal(rewriteLegacyHelpSearch("tab=memo&query=2026-08-25"), "query=2026-08-25&glossaire=memo")
})

test("help overlay search is mutually exclusive and preserves other params", () => {
  assert.equal(applyHelpOverlaySearch("tab=jumeaux", { glossary: "vocab" }), "tab=jumeaux&glossaire=vocab")
  assert.equal(applyHelpOverlaySearch("glossaire=vocab", { glossary: "memo" }), "glossaire=memo")
  assert.equal(applyHelpOverlaySearch("glossaire=memo", { adresse: true }), "adresse=1")
  assert.equal(applyHelpOverlaySearch("adresse=1", { glossary: "proba" }), "glossaire=proba")
  assert.equal(applyHelpOverlaySearch("tab=jumeaux&adresse=1", { adresse: false }), "tab=jumeaux")
  assert.deepEqual(readHelpOverlay("tab=proba"), { glossary: "proba", adresse: false })
  assert.deepEqual(readHelpOverlay("glossaire=memo&adresse=1"), { glossary: "memo", adresse: false })
  assert.deepEqual(readHelpOverlay("adresse=oui"), { glossary: null, adresse: true })
})

test("last glossary section remembers the menu choice", () => {
  const store: Record<string, string> = {}
  const memory = {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => {
      store[key] = value
    },
  }
  Object.defineProperty(globalThis, "sessionStorage", { configurable: true, value: memory })
  rememberGlossarySection("memo")
  assert.equal(lastGlossarySection(), "memo")
})
