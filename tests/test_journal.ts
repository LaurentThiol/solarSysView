import assert from "node:assert/strict"
import test from "node:test"

import { NAV_GROUPS } from "../src/lib/nav.ts"
import {
  filterJournal,
  timelinePoints,
  type JournalEntry,
} from "../src/lib/journal.ts"

test("Journal is the last item of Système", () => {
  const systeme = NAV_GROUPS.find((group) => group.id === "systeme")
  assert.ok(systeme)
  const last = systeme.items[systeme.items.length - 1]
  assert.equal(last.href, "/journal")
  assert.equal(last.label, "Journal")
})

function entry(partial: Partial<JournalEntry> & Pick<JournalEntry, "slug" | "area" | "title">): JournalEntry {
  return {
    happened_on: "2026-10-16",
    body: "Texte de fiche.",
    pr_number: null,
    pr_url: null,
    prs: [],
    source: "seed",
    ...partial,
  }
}

const sample: JournalEntry[] = [
  entry({
    slug: "evolution",
    area: "Évolution",
    title: "Annuel",
    body: "Segments verts quand n et n−1 vont dans le même sens.",
    prs: [
      { number: 311, title: "segments verts", merged_on: "2026-10-17", url: "https://example.test/311" },
      { number: 312, title: "taux de similitude", merged_on: "2026-10-17", url: "https://example.test/312" },
    ],
  }),
  entry({
    slug: "nextdata",
    area: "nextData",
    title: "Pulse",
    body: "Le Pulse reste celui de chaque numéro.",
    happened_on: "2026-10-17",
    prs: [{ number: 310, title: "Pulse par numéro", merged_on: "2026-10-17", url: "https://example.test/310" }],
  }),
]

test("search and zone filter combine", () => {
  assert.equal(filterJournal(sample, "", "Toutes").length, 2)
  assert.equal(filterJournal(sample, "similitude", "Toutes").length, 1)
  assert.equal(filterJournal(sample, "312", "Toutes")[0]?.slug, "evolution")
  assert.equal(filterJournal(sample, "evolution", "Toutes")[0]?.slug, "evolution")
  assert.equal(filterJournal(sample, "312", "nextData").length, 0)
  assert.equal(filterJournal(sample, "", "nextData").length, 1)
  assert.equal(filterJournal(sample, "", "Toutes").length, filterJournal(sample, "   ", "Toutes").length)
})

test("same-day PR points stay apart", () => {
  const points = timelinePoints(sample, ["Évolution", "nextData"])
  const sameDay = points.filter((point) => point.mergedOn === "2026-10-17" && point.lane === "Évolution")
  assert.equal(sameDay.length, 2)
  assert.notEqual(sameDay[0].x, sameDay[1].x)
  assert.equal(sameDay[0].y, sameDay[1].y)
  assert.equal(points.find((point) => point.number === 310)?.y, 1)
})
