import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

import {
  classicalMds,
  COUPLE_EDGE_LIMIT,
  coupleRankWeight,
  coupleSchema,
  defaultCoupleSortDir,
  formatCoupleAgo,
  linksTouching,
  NEXT_WINDOW_PRESETS,
  pointDistance,
  sortCoupleLinks,
  type BallPoint,
  type CoupleLink,
  type CoupleSortDir,
  type CoupleSortKey,
} from "../src/lib/next/couple.ts"
import { NEXT_FIELD_HELP } from "../src/lib/next/help.ts"
import { ADDRESSES } from "../src/lib/addresses.ts"
import { WEEKDAY_SCOPE_OPTIONS } from "../src/lib/weekday-scope.ts"
import { labFromPath, labLabel } from "../src/lib/capture/snapshot.ts"
import { NAV_GROUPS } from "../src/lib/nav.ts"

function point(schema: { points: BallPoint[] }, ball: number) {
  const found = schema.points.find((item) => item.ball === ball)
  assert.ok(found, `boule ${ball}`)
  return found
}

test("classical MDS keeps a unit distance on two points", () => {
  const { coords, stress } = classicalMds(
    [
      [0, 1],
      [1, 0],
    ],
    3
  )
  const gap = Math.hypot(
    coords[0][0] - coords[1][0],
    coords[0][1] - coords[1][1],
    coords[0][2] - coords[1][2]
  )
  assert.ok(Math.abs(gap - 1) < 1e-6, String(gap))
  assert.ok(stress < 1e-6)
})

test("rank weight reads newest first", () => {
  assert.equal(coupleRankWeight(0, 20), 20)
  assert.equal(coupleRankWeight(19, 20), 1)
  assert.equal(coupleRankWeight(20, 20), 0)
  assert.equal(formatCoupleAgo(0), "il y a 0 tirage")
  assert.equal(formatCoupleAgo(1), "il y a 1 tirage")
  assert.equal(formatCoupleAgo(4), "il y a 4 tirages")
})

test("affinity sums observed co-draws from newest to oldest", () => {
  const schema = coupleSchema([
    { date: "2026-01-01", numbers: [8, 9, 10, 11, 12] },
    { date: "2026-01-04", numbers: [1, 2, 3, 4, 5] },
    { date: "2026-01-02", numbers: [1, 2, 6, 7, 13] },
    { date: "2026-01-03", numbers: [1, 2, 14, 15, 16] },
  ])
  assert.equal(schema.drawCount, 4)
  assert.deepEqual(
    schema.reading.map((row) => row.date),
    ["2026-01-04", "2026-01-03", "2026-01-02", "2026-01-01"]
  )
  assert.equal(schema.newest, "2026-01-04")
  assert.equal(schema.oldest, "2026-01-01")

  const recent = schema.links.find((link) => link.a === 1 && link.b === 2)
  const oldest = schema.links.find((link) => link.a === 8 && link.b === 9)
  const newestOnly = schema.links.find((link) => link.a === 3 && link.b === 4)
  assert.ok(recent && oldest && newestOnly)
  assert.equal(recent.affinity, 4 + 3 + 2)
  assert.equal(recent.count, 3)
  assert.equal(recent.ago, 0)
  assert.deepEqual(recent.dates, ["2026-01-04", "2026-01-03", "2026-01-02"])
  assert.equal(newestOnly.affinity, 4)
  assert.equal(newestOnly.ago, 0)
  assert.equal(oldest.affinity, 1)
  assert.equal(oldest.ago, 3)
  assert.equal(schema.links.find((link) => link.a === 1 && link.b === 8), undefined)
  assert.equal(schema.links[0].a, 1)
  assert.equal(schema.links[0].b, 2)
})

function coupleLink(
  partial: Pick<CoupleLink, "a" | "b" | "count" | "affinity" | "ago">
): CoupleLink {
  return { ...partial, dates: [] }
}

test("couple columns sort each field and keep the weight tie break", () => {
  const links = [
    coupleLink({ a: 2, b: 4, count: 2, affinity: 5, ago: 1 }),
    coupleLink({ a: 1, b: 3, count: 2, affinity: 9, ago: 0 }),
    coupleLink({ a: 1, b: 2, count: 1, affinity: 9, ago: 3 }),
    coupleLink({ a: 8, b: 9, count: 4, affinity: 4, ago: 2 }),
  ]
  const order = (key: CoupleSortKey, dir: CoupleSortDir) =>
    sortCoupleLinks(links, key, dir).map((link) => `${link.a}-${link.b}`)

  assert.deepEqual(order("weight", "desc"), ["1-3", "1-2", "2-4", "8-9"])
  assert.deepEqual(order("weight", "asc"), ["8-9", "2-4", "1-3", "1-2"])
  assert.deepEqual(order("count", "desc"), ["8-9", "1-3", "2-4", "1-2"])
  assert.deepEqual(order("count", "asc"), ["1-2", "1-3", "2-4", "8-9"])
  assert.deepEqual(order("pair", "asc"), ["1-2", "1-3", "2-4", "8-9"])
  assert.deepEqual(order("pair", "desc"), ["8-9", "2-4", "1-3", "1-2"])
  assert.deepEqual(order("ago", "asc"), ["1-3", "2-4", "8-9", "1-2"])
  assert.deepEqual(order("ago", "desc"), ["1-2", "8-9", "2-4", "1-3"])
  assert.deepEqual(
    links.map((link) => `${link.a}-${link.b}`),
    ["2-4", "1-3", "1-2", "8-9"]
  )
  assert.equal(defaultCoupleSortDir("weight"), "desc")
  assert.equal(defaultCoupleSortDir("count"), "desc")
  assert.equal(defaultCoupleSortDir("pair"), "asc")
  assert.equal(defaultCoupleSortDir("ago"), "asc")
  assert.deepEqual(sortCoupleLinks([], "pair", "asc"), [])
})

test("duplicate and out-of-range numbers count once", () => {
  const schema = coupleSchema([{ date: "2026-02-01", numbers: [1, 1, 2, 0, 51, 3, 4, 5] }])
  const pair = schema.links.find((link) => link.a === 1 && link.b === 2)
  assert.ok(pair)
  assert.equal(pair.count, 1)
  assert.equal(pair.affinity, 1)
  assert.equal(schema.reading[0].numbers.join(","), "1,2,3,4,5")
  assert.equal(point(schema, 1).appearances, 1)
  assert.equal(point(schema, 50).appearances, 0)
})

test("empty archive has no schema", () => {
  const schema = coupleSchema([])
  assert.equal(schema.drawCount, 0)
  assert.equal(schema.stress, null)
  assert.equal(schema.points.length, 0)
  assert.equal(schema.links.length, 0)
})

test("repeated recent couple sits closer than a single old couple", () => {
  const draws = []
  for (let index = 0; index < 7; index += 1) {
    const day = String(index + 2).padStart(2, "0")
    draws.push({
      date: `2026-03-${day}`,
      numbers: [1, 2, 10 + index, 20 + index, 30 + index],
    })
  }
  draws.push({ date: "2026-03-01", numbers: [3, 4, 5, 6, 7] })
  const schema = coupleSchema(draws)
  const close = pointDistance(point(schema, 1), point(schema, 2))
  const far = pointDistance(point(schema, 3), point(schema, 4))
  const apart = pointDistance(point(schema, 1), point(schema, 3))
  assert.ok(close < far, `proche ${close} vs ancien ${far}`)
  assert.ok(close < apart, `proche ${close} vs jamais ${apart}`)
  assert.ok(schema.stress != null && schema.stress >= 0)
  assert.equal(schema.edges.length, 40)
  assert.equal(schema.edges[0].affinity, schema.links[0].affinity)
  assert.ok(schema.edges.every((edge, index) => index === 0 || edge.affinity <= schema.edges[index - 1].affinity))
})

test("equal dates keep input order as the reading order", () => {
  const schema = coupleSchema([
    { date: "2026-04-01", numbers: [1, 2, 3, 4, 5] },
    { date: "2026-04-01", numbers: [6, 7, 8, 9, 10] },
  ])
  assert.deepEqual(schema.reading[0].numbers, [1, 2, 3, 4, 5])
  assert.equal(linksTouching(schema.links, 1)[0].ago, 0)
  assert.equal(linksTouching(schema.links, 6)[0].ago, 1)
})

test("couple module does not import a uniform or lift model", () => {
  const source = readFileSync(new URL("../src/lib/next/couple.ts", import.meta.url), "utf8")
  assert.doesNotMatch(source, /lift|chiSquare|hypergeom|combinator|p_a|proba/i)
})

test("Next sits in Lecture with a Couple address", () => {
  const lecture = NAV_GROUPS.find((group) => group.id === "lecture")
  const item = lecture?.items.find((entry) => entry.href === "/next")
  assert.equal(item?.label, "Next")
  assert.match(item?.help.body ?? "", /tirages réalisés/)
  assert.match(lecture?.help.body ?? "", /proximité des boules/)
  const page = ADDRESSES.find((entry) => entry.id === "page:/next")
  assert.equal(page?.group, "lecture")
  assert.match(page?.text ?? "", /co-sorties/)
  const tab = ADDRESSES.find((entry) => entry.href === "/next?tab=couple")
  assert.equal(tab?.kind, "onglet")
  assert.match(tab?.text ?? "", /plus récent au plus ancien/)
  assert.equal(labFromPath("/next"), "next")
  assert.equal(labLabel("next"), "Next")
})

const LAB_HELP_KEYS = [
  "tab",
  "jour",
  "space",
  "summary",
  "reading",
  "absent",
  "couples",
  "observed",
  "pair",
  "count",
  "weight",
  "ago",
  "ball",
  "appearances",
  "clear",
] as const

const VIEW_HELP_KEYS = ["volume", "frame", "stress"] as const

test("every Next field has online help wired in the Couple tab", () => {
  const keys = [...LAB_HELP_KEYS, ...VIEW_HELP_KEYS]
  assert.deepEqual(Object.keys(NEXT_FIELD_HELP).sort(), [...keys].sort())
  for (const key of keys) {
    const help = NEXT_FIELD_HELP[key]
    assert.ok(help.title.trim().length > 1, key)
    assert.ok(help.body.trim().length > 40, key)
    assert.doesNotMatch(`${help.title}\n${help.body}`, /pronostic|probabilit/i, key)
    const items = "items" in help ? help.items : []
    for (const item of items) {
      assert.ok(item.label.trim().length > 0, key)
      assert.ok(item.text.trim().length > 12, `${key}:${item.label}`)
    }
  }
  assert.deepEqual(
    NEXT_FIELD_HELP.jour.items?.map((item) => item.label),
    WEEKDAY_SCOPE_OPTIONS.map((item) => item.label)
  )
  assert.equal(NEXT_FIELD_HELP.space.items?.length, NEXT_WINDOW_PRESETS.length)
  assert.match(NEXT_FIELD_HELP.volume.body, new RegExp(String(COUPLE_EDGE_LIMIT)))
  assert.match(NEXT_FIELD_HELP.stress.body, new RegExp(String(COUPLE_EDGE_LIMIT)))

  const lab = readFileSync(new URL("../src/components/next/next-lab.tsx", import.meta.url), "utf8")
  const view = readFileSync(new URL("../src/components/next/couple-view.tsx", import.meta.url), "utf8")
  for (const key of LAB_HELP_KEYS) assert.match(lab, new RegExp(`NEXT_FIELD_HELP\\.${key}\\b`), key)
  for (const key of VIEW_HELP_KEYS) assert.match(view, new RegExp(`NEXT_FIELD_HELP\\.${key}\\b`), key)
})

test("Couples table headers sort each column", () => {
  const source = readFileSync(new URL("../src/components/next/next-lab.tsx", import.meta.url), "utf8")
  assert.match(source, /sortCoupleLinks/)
  assert.match(source, /toggleCoupleSort/)
  assert.match(source, /aria-sort/)
  assert.match(source, /data-couple-sort-key/)
  assert.match(source, /data-couple-sort-dir/)
  assert.match(NEXT_FIELD_HELP.couples.body, /en-tête/)
  assert.match(NEXT_FIELD_HELP.weight.body, /ordre de départ/)
  assert.match(NEXT_FIELD_HELP.pair.body, /plus petit numéro/)
  assert.match(NEXT_FIELD_HELP.count.body, /plus grands comptes/)
  assert.match(NEXT_FIELD_HELP.ago.body, /plus récentes/)
})

test("Couple shows a reverse indicator for the reading order", () => {
  const source = readFileSync(new URL("../src/components/next/next-lab.tsx", import.meta.url), "utf8")
  assert.match(source, /data-next-reverse/)
  assert.match(source, />reverse</)
  assert.match(source, /Lecture du plus récent vers le plus ancien/)
  assert.match(source, /role="status"/)
})
