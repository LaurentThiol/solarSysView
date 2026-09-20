import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

import {
  ADDRESSES,
  ADDRESS_GROUP_LABELS,
  ADDRESS_KIND_LABELS,
  ANALYSE_ADDRESS_TAB_IDS,
  addressCopyValue,
  addressMatchesLocation,
  filterAddresses,
  groupedAddresses,
} from "../src/lib/addresses.ts"
import { allNavItems } from "../src/lib/nav.ts"
import { foldGlossaryQuery } from "../src/lib/copy.ts"

const labSrc = readFileSync(new URL("../src/components/analysis/analysis-lab.tsx", import.meta.url), "utf8")
const dialogSrc = readFileSync(new URL("../src/components/help/address-dialog.tsx", import.meta.url), "utf8")
const catalogSrc = readFileSync(new URL("../src/components/help/address-catalog.tsx", import.meta.url), "utf8")

test("Analyse no longer exposes an Adresse tab", () => {
  assert.doesNotMatch(labSrc, /ADDRESS_TABS/)
  assert.doesNotMatch(labSrc, /label: "Adresse"/)
  assert.doesNotMatch(labSrc, /id: "adresse"/)
  assert.doesNotMatch(labSrc, /<AddressPanel/)
})

test("header address dialog searches and opens with shortcut a", () => {
  assert.match(dialogSrc, /AddressCatalog/)
  assert.match(dialogSrc, /aria-label="Adresse"/)
  assert.match(dialogSrc, /event\.key !== "a"/)
  assert.match(dialogSrc, /\?adresse=1/)
  assert.doesNotMatch(dialogSrc, /Analyse · Adresse/)
  assert.match(catalogSrc, /filterAddresses/)
  assert.match(catalogSrc, /groupedAddresses/)
  assert.match(catalogSrc, /Rechercher une adresse/)
})

test("catalog covers every nav page plus URL tabs, overlays and APIs", () => {
  const hrefs = new Set(ADDRESSES.map((entry) => entry.href))
  for (const item of allNavItems()) {
    assert.ok(hrefs.has(item.href), `missing page ${item.href}`)
  }
  assert.ok(hrefs.has("/"))
  for (const tab of ANALYSE_ADDRESS_TAB_IDS) {
    assert.ok(hrefs.has(`/analyse?tab=${tab}`), `missing Analyse tab ${tab}`)
    assert.ok(tab !== "proba" && tab !== "memo" && tab !== "adresse", tab)
  }
  assert.ok(hrefs.has("?glossaire=vocab"))
  assert.ok(hrefs.has("?glossaire=proba"))
  assert.ok(hrefs.has("?glossaire=memo"))
  assert.ok(hrefs.has("?adresse=1"))
  assert.ok(hrefs.has("/jeux?tab=histoJeux"))
  assert.ok(hrefs.has("/harmo?tab=tf"))
  assert.ok(hrefs.has("/analyse?tab=jumeaux&demo=1"))
  assert.ok(hrefs.has("/api/health"))
  assert.ok(hrefs.has("/api/analysis/montecarlo"))
  assert.ok(hrefs.has("/api/brain/specialists"))
  const kinds = new Set(ADDRESSES.map((entry) => entry.kind))
  assert.deepEqual([...kinds].sort(), Object.keys(ADDRESS_KIND_LABELS).sort())
  assert.ok(ADDRESSES.some((entry) => entry.id === "raccourci:l"))
})

test("address search ignores accents and can filter by kind", () => {
  assert.equal(foldGlossaryQuery("Analyse"), "analyse")
  const pages = filterAddresses("analyse", "page")
  assert.ok(pages.some((entry) => entry.href === "/analyse"))
  assert.ok(pages.every((entry) => entry.kind === "page"))
  const apis = filterAddresses("montecarlo", "api")
  assert.ok(apis.some((entry) => entry.href === "/api/analysis/montecarlo"))
  const none = filterAddresses("zzzz-inconnu")
  assert.equal(none.length, 0)
  const groups = groupedAddresses(ADDRESSES)
  assert.deepEqual(
    groups.map((group) => group.id),
    Object.keys(ADDRESS_GROUP_LABELS)
  )
  assert.ok(groups.every((group) => group.entries.length > 0))
})

test("copy value and current-location match", () => {
  const health = ADDRESSES.find((entry) => entry.href === "/api/health")
  assert.ok(health)
  assert.equal(addressCopyValue(health), "GET /api/health")
  const jumeaux = ADDRESSES.find((entry) => entry.href === "/analyse?tab=jumeaux")
  assert.ok(jumeaux)
  assert.equal(addressMatchesLocation(jumeaux, "/analyse", "tab=jumeaux"), true)
  assert.equal(addressMatchesLocation(jumeaux, "/analyse", "tab=vue"), false)
  const analyse = ADDRESSES.find((entry) => entry.id === "page:/analyse")
  assert.ok(analyse)
  assert.equal(addressMatchesLocation(analyse, "/analyse", ""), true)
  assert.equal(addressMatchesLocation(analyse, "/analyse", "adresse=1"), true)
  assert.equal(addressMatchesLocation(analyse, "/analyse", "tab=jumeaux"), false)
  const overlay = ADDRESSES.find((entry) => entry.href === "?adresse=1")
  assert.ok(overlay)
  assert.equal(addressMatchesLocation(overlay, "/brain", "adresse=1"), true)
  assert.equal(addressMatchesLocation(overlay, "/brain", ""), false)
  const gloss = ADDRESSES.find((entry) => entry.href === "?glossaire=proba")
  assert.ok(gloss)
  assert.equal(addressMatchesLocation(gloss, "/analyse", "tab=jumeaux&glossaire=proba"), true)
  assert.equal(addressCopyValue({ ...jumeaux, method: undefined }), "/analyse?tab=jumeaux")
})
