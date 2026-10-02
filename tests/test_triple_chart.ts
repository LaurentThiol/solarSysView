import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

import {
  formatTripleChartLink,
  tripleLinkKey,
  tripleNumberLinks,
} from "../src/lib/next/triple-chart.ts"

test("triple link joins the three ranks on a shared draw", () => {
  const links = tripleNumberLinks(
    [
      { date: "2026-01-01", n1: 1, n2: 8, n3: 12, n4: 40, n5: 41 },
      { date: "2026-01-04", n1: 3, n2: 9, n3: 14, n4: 28, n5: 41 },
      { date: "2026-01-07", n1: 4, n2: 8, n3: 12, n4: 33, n5: 40 },
    ],
    { a: 40, b: 8, c: 12 }
  )
  assert.equal(tripleLinkKey({ a: 40, b: 12, c: 8 }), "8-12-40")
  assert.deepEqual(links, [
    { date: "2026-01-01", balls: [8, 12, 40], keys: ["n2", "n3", "n4"] },
    { date: "2026-01-07", balls: [8, 12, 40], keys: ["n2", "n3", "n5"] },
  ])
  assert.match(formatTripleChartLink({ a: 40, b: 8, c: 12 }, 2), /Triple 8–12–40 · 2 co-sorties reliées/)
  assert.match(formatTripleChartLink({ a: 8, b: 12, c: 40 }, 0), /aucune co-sortie/)
})

test("a draw missing one ball does not draw a triple link", () => {
  const links = tripleNumberLinks(
    [{ date: "2026-02-01", n1: 8, n2: 9, n3: 10, n4: 11, n5: 12 }],
    { a: 8, b: 9, c: 20 }
  )
  assert.equal(links.length, 0)
  assert.equal(tripleNumberLinks([], { a: 1, b: 1, c: 2 }).length, 0)
  assert.equal(tripleLinkKey({ a: 1, b: 1, c: 2 }), "")
})

test("Next chart highlights the triple chosen in the table", () => {
  const chart = readFileSync(new URL("../src/components/draw-chart.tsx", import.meta.url), "utf8")
  assert.match(chart, /data-triple-links/)
  assert.match(chart, /tripleNumberLinks/)
  assert.match(chart, /formatTripleChartLink/)
  assert.match(chart, /mode === "eachNumber"/)
  assert.match(chart, /keepRank1Choice\(hidden\)/)
  assert.doesNotMatch(chart, /setHidden\(\{\}\)/)
  assert.match(chart, /Les traits verticaux joignent les trois boules/)
})
