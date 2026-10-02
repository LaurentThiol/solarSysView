import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

import {
  coupleLinkKey,
  coupleNumberLinks,
  formatCoupleChartLink,
} from "../src/lib/next/couple-chart.ts"

test("couple link joins the two ranks on a shared draw", () => {
  const links = coupleNumberLinks(
    [
      { date: "2026-01-01", n1: 1, n2: 2, n3: 8, n4: 12, n5: 40 },
      { date: "2026-01-04", n1: 3, n2: 9, n3: 14, n4: 28, n5: 41 },
      { date: "2026-01-07", n1: 4, n2: 8, n3: 11, n4: 12, n5: 33 },
    ],
    { a: 12, b: 8 }
  )
  assert.equal(coupleLinkKey({ a: 12, b: 8 }), "8-12")
  assert.deepEqual(links, [
    { date: "2026-01-01", low: 8, high: 12, lowKey: "n3", highKey: "n4" },
    { date: "2026-01-07", low: 8, high: 12, lowKey: "n2", highKey: "n4" },
  ])
  assert.match(formatCoupleChartLink({ a: 12, b: 8 }, 2), /Couple 8–12 · 2 co-sorties reliées/)
  assert.match(formatCoupleChartLink({ a: 8, b: 12 }, 0), /aucune co-sortie/)
})

test("a draw missing one ball does not draw a link", () => {
  const links = coupleNumberLinks(
    [{ date: "2026-02-01", n1: 8, n2: 9, n3: 10, n4: 11, n5: 12 }],
    { a: 8, b: 20 }
  )
  assert.equal(links.length, 0)
  assert.equal(coupleNumberLinks([], { a: 1, b: 1 }).length, 0)
})

test("Next chart highlights the couple chosen in the table", () => {
  const lab = readFileSync(new URL("../src/components/next/next-lab.tsx", import.meta.url), "utf8")
  const chart = readFileSync(new URL("../src/components/draw-chart.tsx", import.meta.url), "utf8")
  assert.match(lab, /Évolution dans le temps|DrawChart/)
  assert.match(lab, /id="next-evolution"/)
  assert.match(lab, /couple=\{pinnedCouple\}/)
  assert.match(lab, /coupleTick=\{coupleTick\}/)
  assert.match(lab, /Un clic relie le couple dans Chaque numéro/)
  assert.match(chart, /Chaque numéro/)
  assert.match(chart, /setMode\("eachNumber"\)/)
  assert.match(chart, /keepRank1Choice\(hidden\)/)
  assert.match(chart, /rank1HiddenDefault/)
  assert.doesNotMatch(chart, /setHidden\(\{\}\)/)
  assert.match(chart, /data-couple-links/)
  assert.match(chart, /coupleNumberLinks/)
  assert.match(chart, /mode === "eachNumber"/)
})
