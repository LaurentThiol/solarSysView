import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

import { asDrawDate } from "../src/lib/draw-date.ts"
import {
  analogRetrieveHint,
  analogWorkingObjects,
  mergeAnalogPack,
} from "../src/lib/brain/analogs.ts"
import { deepLinkFor } from "../src/lib/brain/deep-links.ts"
import {
  clearPendingAnalogs,
  parsePendingAnalogs,
  queuePendingAnalogs,
  takePendingAnalogs,
} from "../src/lib/brain/pending-analogs.ts"
import { applyTwinsSearch, readTwinsSearch } from "../src/lib/twins-url.ts"
import { twinsDemoWantsStart } from "../src/lib/twins-demo.ts"
import type { CatalogEntry } from "../src/lib/brain/catalog.ts"
import type { WorkingObject } from "../src/lib/brain/types.ts"

const panelSrc = readFileSync(new URL("../src/components/analysis/twins-panel.tsx", import.meta.url), "utf8")
const labSrc = readFileSync(new URL("../src/components/analysis/analysis-lab.tsx", import.meta.url), "utf8")
const brainSrc = readFileSync(new URL("../src/components/brain/brain-lab.tsx", import.meta.url), "utf8")

const store = new Map<string, string>()
Object.defineProperty(globalThis, "sessionStorage", {
  configurable: true,
  value: {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value)
    },
    removeItem: (key: string) => {
      store.delete(key)
    },
  },
})

test("asDrawDate accepts YYYY-MM-DD and rejects impossible or malformed days", () => {
  assert.equal(asDrawDate("2026-08-25"), "2026-08-25")
  assert.equal(asDrawDate(" 2019-03-12 "), "2019-03-12")
  assert.equal(asDrawDate("2026-02-31"), null)
  assert.equal(asDrawDate("26-08-25"), null)
  assert.equal(asDrawDate("not-a-date"), null)
  assert.equal(asDrawDate(""), null)
})

test("twins URL query=2026-08-25 is accepted; invalid query is ignored", () => {
  assert.deepEqual(readTwinsSearch("?tab=jumeaux&query=2026-08-25"), {
    queryDate: "2026-08-25",
    axes: null,
  })
  assert.equal(readTwinsSearch("?query=2026-02-31").queryDate, null)
  assert.equal(readTwinsSearch("?query=hier").queryDate, null)
  assert.deepEqual(readTwinsSearch("?query=2026-08-25&axes=sum,spread,parity").axes, [
    "sum",
    "spread",
    "parity",
  ])
  const withMask = applyTwinsSearch("preset=last_100&demo=1", {
    queryDate: "2026-08-25",
    axes: ["sum", "spread", "parity"],
  })
  assert.match(withMask, /tab=jumeaux/)
  assert.match(withMask, /query=2026-08-25/)
  assert.match(withMask, /axes=sum%2Cspread%2Cparity|axes=sum,spread,parity/)
  assert.match(withMask, /demo=1/)
  const full = applyTwinsSearch("tab=jumeaux&query=2026-08-25&axes=sum", {
    queryDate: "2026-08-25",
    axes: [
      "sum",
      "spread",
      "parity",
      "high_low",
      "consecutive",
      "centroid",
      "n1",
      "n2",
      "n3",
      "n4",
      "n5",
      "g1",
      "g2",
      "g3",
      "g4",
      "star_sum",
      "e1",
      "e2",
    ],
  })
  assert.equal(new URLSearchParams(full).get("axes"), null)
  assert.equal(twinsDemoWantsStart("?query=2026-08-25"), false)
})

const ANALOG_ENTRY: CatalogEntry = {
  id: "analyse/analogs",
  handle: "analogs",
  aliases: ["jumeaux"],
  lab: "analyse",
  family: "jumeaux",
  kind: "analog",
  label: "Jumeaux",
  units: "cosinus · z-score",
  reading: "Ressemblance d’archive.",
  defaults: { variable: "sum" },
}

test("deepLinkFor(@analogs) keeps query= when last.query is present", () => {
  const bare = deepLinkFor({ entry: ANALOG_ENTRY })
  assert.match(bare.href, /tab=jumeaux/)
  assert.doesNotMatch(bare.href, /query=/)
  const linked = deepLinkFor({
    entry: ANALOG_ENTRY,
    queryDate: "2026-08-25",
    axes: "sum, spread, parity",
  })
  assert.match(linked.href, /query=2026-08-25/)
  assert.match(linked.href, /axes=sum%2Cspread%2Cparity|axes=sum,spread,parity/)
})

test("queue/take pending analogs stores query, focus and axes", () => {
  store.clear()
  assert.equal(takePendingAnalogs(), null)
  queuePendingAnalogs({
    queryDate: "2026-08-25",
    focusDate: "2019-03-12",
    axes: ["sum", "spread", "parity"],
  })
  const taken = takePendingAnalogs()
  assert.deepEqual(taken, {
    queryDate: "2026-08-25",
    focusDate: "2019-03-12",
    axes: ["sum", "spread", "parity"],
  })
  assert.equal(takePendingAnalogs(), null)
  assert.equal(parsePendingAnalogs({ queryDate: "2026-02-31", focusDate: "2026-08-25", axes: [] }), null)
  clearPendingAnalogs()
})

test("Jumeaux panel exposes Épingler beside the neighbor overlay", () => {
  assert.match(panelSrc, /Épingler/)
  assert.match(panelSrc, /queuePendingAnalogs/)
  assert.match(panelSrc, /queueBrainPin\("analyse\/analogs"\)/)
  assert.match(panelSrc, /router\.push\("\/brain"\)/)
  assert.match(panelSrc, /data-action="pin-analog"/)
  assert.match(panelSrc, /initialQuery/)
  assert.match(panelSrc, /hors fenêtre/)
  assert.match(panelSrc, /applyTwinsSearch/)
  assert.match(labSrc, /readTwinsSearch/)
  assert.match(labSrc, /initialQuery=\{initialQuery\}/)
})

test("Brain consumes pending analogs, merges the pack, and prefills the focus", () => {
  assert.match(brainSrc, /takePendingAnalogs/)
  assert.match(brainSrc, /setAnalogPack/)
  assert.match(brainSrc, /mergeAnalogPack/)
  assert.match(brainSrc, /lis @analogs#\$\{pending\.focusDate\}/)
  assert.match(brainSrc, /retrieveAnalogs/)
  assert.match(brainSrc, /analogRetrieveHint/)
  const pin: WorkingObject = {
    kind: "pin",
    id: "analyse/analogs",
    handle: "@analogs",
    label: "Jumeaux",
    inPrompt: true,
    summary: "pin",
  }
  const pack = analogWorkingObjects({
    ok: true,
    axes: ["sum", "parity"],
    query: {
      date: "2026-08-25",
      numbers: [1, 2, 3, 4, 5],
      stars: [1, 2],
      params: {
        sum: 15,
        spread: 4,
        parity: 2,
        high_low: 0,
        consecutive: 2,
        centroid: 3,
        n1: 1,
        n2: 2,
        n3: 3,
        n4: 4,
        n5: 5,
        g1: 1,
        g2: 1,
        g3: 1,
        g4: 1,
        star_sum: 3,
        e1: 1,
        e2: 2,
      },
    },
    items: [],
  })
  const merged = mergeAnalogPack([pin], pack)
  assert.equal(merged[0]?.kind, "analog")
  assert.equal(analogRetrieveHint(merged).date, "2026-08-25")
  assert.equal(analogRetrieveHint([pin]).date, undefined)
})
