import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

import { pointDistance, type BallPoint } from "../src/lib/next/couple.ts"
import { ADDRESSES } from "../src/lib/addresses.ts"
import { NEXT_TRIPLE_FIELD_HELP } from "../src/lib/next/triple-help.ts"
import {
  TRIPLE_EDGE_LIMIT,
  defaultTripleSortDir,
  formatTripleKey,
  othersOf,
  sortTripleLinks,
  tripleSchema,
  triplesTouching,
  type TripleLink,
  type TripleSortDir,
  type TripleSortKey,
} from "../src/lib/next/triple.ts"

function point(schema: { points: BallPoint[] }, ball: number) {
  const found = schema.points.find((item) => item.ball === ball)
  assert.ok(found, `boule ${ball}`)
  return found
}

test("affinity sums observed triple co-draws from newest to oldest", () => {
  const schema = tripleSchema([
    { date: "2026-01-01", numbers: [8, 9, 10, 11, 12] },
    { date: "2026-01-04", numbers: [1, 2, 3, 4, 5] },
    { date: "2026-01-02", numbers: [1, 2, 3, 7, 13] },
    { date: "2026-01-03", numbers: [1, 2, 3, 15, 16] },
  ])
  assert.equal(schema.drawCount, 4)
  assert.deepEqual(
    schema.reading.map((row) => row.date),
    ["2026-01-04", "2026-01-03", "2026-01-02", "2026-01-01"]
  )
  assert.equal(schema.newest, "2026-01-04")
  assert.equal(schema.oldest, "2026-01-01")

  const recent = schema.links.find((link) => link.a === 1 && link.b === 2 && link.c === 3)
  const oldest = schema.links.find((link) => link.a === 8 && link.b === 9 && link.c === 10)
  const newestOnly = schema.links.find((link) => link.a === 1 && link.b === 2 && link.c === 4)
  assert.ok(recent && oldest && newestOnly)
  assert.equal(recent.affinity, 4 + 3 + 2)
  assert.equal(recent.count, 3)
  assert.equal(recent.ago, 0)
  assert.deepEqual(recent.dates, ["2026-01-04", "2026-01-03", "2026-01-02"])
  assert.equal(formatTripleKey(recent), "1-2-3")
  assert.deepEqual(othersOf(recent, 2), [1, 3])
  assert.equal(newestOnly.affinity, 4)
  assert.equal(newestOnly.ago, 0)
  assert.equal(oldest.affinity, 1)
  assert.equal(oldest.ago, 3)
  assert.equal(
    schema.links.find((link) => link.a === 1 && link.b === 2 && link.c === 8),
    undefined
  )
  assert.equal(schema.links[0].a, 1)
  assert.equal(schema.links[0].b, 2)
  assert.equal(schema.links[0].c, 3)
  assert.equal(triplesTouching(schema.links, 1)[0].ago, 0)
})

function tripleLink(
  partial: Pick<TripleLink, "a" | "b" | "c" | "count" | "affinity" | "ago">
): TripleLink {
  return { ...partial, dates: [] }
}

test("triple columns sort each field and keep the weight tie break", () => {
  const links = [
    tripleLink({ a: 2, b: 4, c: 6, count: 2, affinity: 5, ago: 1 }),
    tripleLink({ a: 1, b: 3, c: 5, count: 2, affinity: 9, ago: 0 }),
    tripleLink({ a: 1, b: 2, c: 3, count: 1, affinity: 9, ago: 3 }),
    tripleLink({ a: 8, b: 9, c: 10, count: 4, affinity: 4, ago: 2 }),
  ]
  const order = (key: TripleSortKey, dir: TripleSortDir) =>
    sortTripleLinks(links, key, dir).map((link) => formatTripleKey(link))

  assert.deepEqual(order("weight", "desc"), ["1-3-5", "1-2-3", "2-4-6", "8-9-10"])
  assert.deepEqual(order("weight", "asc"), ["8-9-10", "2-4-6", "1-3-5", "1-2-3"])
  assert.deepEqual(order("count", "desc"), ["8-9-10", "1-3-5", "2-4-6", "1-2-3"])
  assert.deepEqual(order("count", "asc"), ["1-2-3", "1-3-5", "2-4-6", "8-9-10"])
  assert.deepEqual(order("trio", "asc"), ["1-2-3", "1-3-5", "2-4-6", "8-9-10"])
  assert.deepEqual(order("trio", "desc"), ["8-9-10", "2-4-6", "1-3-5", "1-2-3"])
  assert.deepEqual(order("ago", "asc"), ["1-3-5", "2-4-6", "8-9-10", "1-2-3"])
  assert.deepEqual(order("ago", "desc"), ["1-2-3", "8-9-10", "2-4-6", "1-3-5"])
  assert.deepEqual(
    links.map((link) => formatTripleKey(link)),
    ["2-4-6", "1-3-5", "1-2-3", "8-9-10"]
  )
  assert.equal(defaultTripleSortDir("weight"), "desc")
  assert.equal(defaultTripleSortDir("count"), "desc")
  assert.equal(defaultTripleSortDir("trio"), "asc")
  assert.equal(defaultTripleSortDir("ago"), "asc")
  assert.deepEqual(sortTripleLinks([], "trio", "asc"), [])
})

test("duplicate and short draws do not invent a triple", () => {
  const schema = tripleSchema([{ date: "2026-02-01", numbers: [1, 1, 2, 0, 51, 3, 4, 5] }])
  const trio = schema.links.find((link) => link.a === 1 && link.b === 2 && link.c === 3)
  assert.ok(trio)
  assert.equal(trio.count, 1)
  assert.equal(trio.affinity, 1)
  assert.equal(schema.reading[0].numbers.join(","), "1,2,3,4,5")
  assert.equal(point(schema, 1).appearances, 1)
  assert.equal(point(schema, 50).appearances, 0)
  assert.equal(tripleSchema([{ date: "2026-02-02", numbers: [1, 2] }]).links.length, 0)
})

test("empty archive has no triple schema", () => {
  const schema = tripleSchema([])
  assert.equal(schema.drawCount, 0)
  assert.equal(schema.stress, null)
  assert.equal(schema.points.length, 0)
  assert.equal(schema.links.length, 0)
})

test("repeated recent triple sits closer than a single old triple", () => {
  const draws = []
  for (let index = 0; index < 7; index += 1) {
    const day = String(index + 2).padStart(2, "0")
    draws.push({
      date: `2026-03-${day}`,
      numbers: [1, 2, 3, 10 + index, 20 + index],
    })
  }
  draws.push({ date: "2026-03-01", numbers: [4, 5, 6, 7, 8] })
  const schema = tripleSchema(draws)
  const close = pointDistance(point(schema, 1), point(schema, 2))
  const far = pointDistance(point(schema, 4), point(schema, 5))
  const apart = pointDistance(point(schema, 1), point(schema, 4))
  assert.ok(close < far, `proche ${close} vs ancien ${far}`)
  assert.ok(close < apart, `proche ${close} vs jamais ${apart}`)
  assert.ok(schema.stress != null && schema.stress >= 0)
  assert.equal(schema.edges.length, TRIPLE_EDGE_LIMIT)
  assert.equal(schema.edges[0].affinity, schema.links[0].affinity)
  assert.ok(schema.edges.every((edge, index) => index === 0 || edge.affinity <= schema.edges[index - 1].affinity))
})

test("triple module does not import a uniform or lift model", () => {
  const source = readFileSync(new URL("../src/lib/next/triple.ts", import.meta.url), "utf8")
  assert.doesNotMatch(source, /lift|chiSquare|hypergeom|combinator|p_a|proba/i)
})

test("Next has a Triple address beside Couple", () => {
  const tab = ADDRESSES.find((entry) => entry.href === "/next?tab=triple")
  assert.equal(tab?.kind, "onglet")
  assert.equal(tab?.label, "Next · Triple")
  assert.match(tab?.text ?? "", /triplet/)
  assert.match(tab?.text ?? "", /plus récent au plus ancien/)
})

const PANEL_HELP_KEYS = [
  "triples",
  "observed",
  "trio",
  "count",
  "weight",
  "ago",
  "ball",
  "appearances",
  "clear",
] as const

const VIEW_HELP_KEYS = ["volume", "frame", "stress"] as const

test("every Triple field has online help wired in the Triple tab", () => {
  const keys = ["tab", ...PANEL_HELP_KEYS, ...VIEW_HELP_KEYS] as const
  assert.deepEqual(Object.keys(NEXT_TRIPLE_FIELD_HELP).sort(), [...keys].sort())
  for (const key of keys) {
    const help = NEXT_TRIPLE_FIELD_HELP[key]
    assert.ok(help.title.trim().length > 1, key)
    assert.ok(help.body.trim().length > 40, key)
    assert.doesNotMatch(`${help.title}\n${help.body}`, /pronostic|probabilit/i, key)
  }
  assert.match(NEXT_TRIPLE_FIELD_HELP.volume.body, new RegExp(String(TRIPLE_EDGE_LIMIT)))
  assert.match(NEXT_TRIPLE_FIELD_HELP.stress.body, new RegExp(String(TRIPLE_EDGE_LIMIT)))

  const lab = readFileSync(new URL("../src/components/next/next-lab.tsx", import.meta.url), "utf8")
  const view = readFileSync(new URL("../src/components/next/triple-view.tsx", import.meta.url), "utf8")
  assert.match(lab, /NEXT_TRIPLE_FIELD_HELP\.tab\b/)
  assert.match(lab, /id: "triple"/)
  for (const key of PANEL_HELP_KEYS) assert.match(view, new RegExp(`NEXT_TRIPLE_FIELD_HELP\\.${key}\\b`), key)
  for (const key of VIEW_HELP_KEYS) assert.match(view, new RegExp(`NEXT_TRIPLE_FIELD_HELP\\.${key}\\b`), key)
  assert.match(view, /relie le triplet dans Chaque numéro/)
  assert.match(view, /triple=\{pinnedTriple\}/)
  assert.match(view, /tripleTick=\{tick\}/)
})

test("Triplets table headers sort each column", () => {
  const source = readFileSync(new URL("../src/components/next/triple-view.tsx", import.meta.url), "utf8")
  assert.match(source, /sortTripleLinks/)
  assert.match(source, /toggleTripleSort/)
  assert.match(source, /aria-sort/)
  assert.match(source, /data-triple-sort-key/)
  assert.match(source, /data-triple-sort-dir/)
  assert.match(NEXT_TRIPLE_FIELD_HELP.triples.body, /en-tête/)
  assert.match(NEXT_TRIPLE_FIELD_HELP.weight.body, /ordre de départ/)
  assert.match(NEXT_TRIPLE_FIELD_HELP.trio.body, /plus petit numéro/)
  assert.match(NEXT_TRIPLE_FIELD_HELP.count.body, /plus grands comptes/)
  assert.match(NEXT_TRIPLE_FIELD_HELP.ago.body, /plus récentes/)
})
