import assert from "node:assert/strict"
import test from "node:test"

import {
  decoratePlay,
  isDrawIso,
  nextPlayDate,
  playsToCsv,
  summarizePlays,
  weekdayFr,
} from "../src/lib/plays"

test("Tuesday and Friday are draw days", () => {
  assert.equal(isDrawIso("2026-09-01"), true)
  assert.equal(isDrawIso("2026-09-04"), true)
  assert.equal(isDrawIso("2026-09-02"), false)
  assert.equal(weekdayFr("2026-09-01"), "mardi")
  assert.equal(weekdayFr("2026-09-04"), "vendredi")
})

test("nextPlayDate stays on Tuesday before cutoff", () => {
  const before = new Date("2026-09-01T18:00:00+02:00")
  assert.equal(nextPlayDate(before), "2026-09-01")
  const after = new Date("2026-09-01T20:45:00+02:00")
  assert.equal(nextPlayDate(after), "2026-09-04")
})

test("decoratePlay scores a settled grid", () => {
  const play = decoratePlay(
    {
      id: 1,
      label: "A",
      numbers: [1, 2, 3, 4, 5],
      stars: [1, 2],
      play_date: "2026-09-01",
      source: "jeux",
      copies: 1,
    },
    { date: "2026-09-01", numbers: [1, 2, 3, 4, 5], stars: [1, 2] }
  )
  assert.equal(play.status, "settled")
  assert.equal(play.result?.rank, 1)
})

test("summarizePlays weights copies and unique grids", () => {
  const pending = decoratePlay(
    {
      id: 1,
      label: "A",
      numbers: [1, 2, 3, 4, 5],
      stars: [1, 2],
      play_date: "2026-09-15",
      source: "manuel",
      copies: 3,
    },
    null
  )
  const win = decoratePlay(
    {
      id: 2,
      label: "A",
      numbers: [1, 2, 3, 4, 5],
      stars: [1, 2],
      play_date: "2026-09-01",
      source: "jeux",
      copies: 2,
    },
    { date: "2026-09-01", numbers: [1, 2, 3, 4, 5], stars: [1, 2] }
  )
  const stats = summarizePlays([pending, win])
  assert.equal(stats.tickets, 5)
  assert.equal(stats.pending, 3)
  assert.equal(stats.wins, 2)
  assert.equal(stats.unique_grids, 1)
  assert.ok(stats.wilson)
  assert.ok(stats.wilson.lo <= (stats.p_win ?? 0))
  assert.ok(stats.binomial)
  assert.equal(stats.binomial.n, 1)
  assert.equal(stats.binomial.wins, 1)
  assert.equal(stats.binomial.tickets, 2)
  assert.ok(stats.p0 > 0.07 && stats.p0 < 0.08)
})

test("CSV export has a header and one row", () => {
  const play = decoratePlay(
    {
      id: 1,
      label: "Test, grille",
      numbers: [1, 2, 3, 4, 5],
      stars: [1, 2],
      play_date: "2026-09-01",
      source: "manuel",
      copies: 1,
    },
    { date: "2026-09-01", numbers: [1, 2, 3, 4, 5], stars: [8, 9] }
  )
  const csv = playsToCsv([play])
  assert.match(csv, /^play_date,/)
  assert.match(csv, /"Test, grille"/)
  assert.match(csv, /Pas de gain/)
  assert.match(csv, /,spec\n/)
})
