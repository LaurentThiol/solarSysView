import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

import {
  formatRepeatCaption,
  formatRepeatTouch,
  repeatLinks,
  repeatStreaks,
} from "../src/lib/repeat-link.ts"

const keys = ["n1", "n2", "n3", "n4", "n5"] as const

test("a repeated number links the next draw, even when its rank changes", () => {
  const links = repeatLinks(
    [
      { date: "2026-01-02", n1: 4, n2: 12, n3: 19, n4: 28, n5: 41 },
      { date: "2026-01-06", n1: 7, n2: 28, n3: 33, n4: 40, n5: 49 },
      { date: "2026-01-09", n1: 3, n2: 11, n3: 18, n4: 28, n5: 44 },
    ],
    keys
  )
  assert.deepEqual(links, [
    {
      value: 28,
      fromDate: "2026-01-02",
      toDate: "2026-01-06",
      fromKey: "n4",
      toKey: "n2",
    },
    {
      value: 28,
      fromDate: "2026-01-06",
      toDate: "2026-01-09",
      fromKey: "n2",
      toKey: "n4",
    },
  ])
  assert.deepEqual(repeatStreaks(links), [{ value: 28, draws: 3 }])
  assert.match(formatRepeatCaption(links, "numéro"), /2 reprises sur 2 pas/)
  assert.match(formatRepeatCaption(links, "numéro"), /28 tient 3 tirages/)
  assert.match(formatRepeatTouch(links, "2026-01-06", "prev"), /28 \(n4→n2\)/)
  assert.match(formatRepeatTouch(links, "2026-01-06", "next"), /28 \(n2→n4\)/)
  assert.equal(formatRepeatTouch(links, "2026-01-02", "prev"), "")
})

test("a gap cuts the link and the same rank stays named", () => {
  const links = repeatLinks(
    [
      { date: "2026-02-03", n1: 8, n2: 12, n3: 20, n4: 31, n5: 46 },
      { date: "2026-02-06", n1: 1, n2: 9, n3: 15, n4: 22, n5: 37 },
      { date: "2026-02-10", n1: 5, n2: 8, n3: 16, n4: 29, n5: 42 },
    ],
    keys
  )
  assert.equal(links.length, 0)
  assert.match(formatRepeatCaption(links, "numéro"), /Aucun numéro repris/)

  const held = repeatLinks(
    [
      { date: "2026-03-03", n1: 8, n2: 12, n3: 20, n4: 31, n5: 46 },
      { date: "2026-03-06", n1: 2, n2: 8, n3: 14, n4: 27, n5: 39 },
    ],
    keys
  )
  assert.equal(held[0]?.fromKey, "n1")
  assert.equal(held[0]?.toKey, "n2")
})

test("stars link e1 and e2 the same way", () => {
  const links = repeatLinks(
    [
      { date: "2026-04-03", e1: 2, e2: 9 },
      { date: "2026-04-07", e1: 9, e2: 11 },
      { date: "2026-04-10", e1: 1, e2: 6 },
    ],
    ["e1", "e2"] as const
  )
  assert.deepEqual(links, [
    { value: 9, fromDate: "2026-04-03", toDate: "2026-04-07", fromKey: "e2", toKey: "e1" },
  ])
  assert.match(formatRepeatCaption(links, "étoile"), /la même étoile/)
  assert.match(formatRepeatTouch(links, "2026-04-07", "prev"), /9 \(e2→e1\)/)
})

test("Chaque numéro exposes the Lien toggle and draws the dotted layer", () => {
  const chart = readFileSync(new URL("../src/components/draw-chart.tsx", import.meta.url), "utf8")
  assert.match(chart, /repeatLinks/)
  assert.match(chart, /data-repeat-links/)
  assert.match(chart, /data-repeat-link-toggle/)
  assert.match(chart, /formatRepeatCaption/)
  assert.match(chart, /mode === "eachNumber" \|\| mode === "eachStar"/)
  assert.match(chart, /0\.01 4\.5/)
  assert.match(chart, /useState\(false\)/)
})
