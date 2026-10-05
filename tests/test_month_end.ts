import assert from "node:assert/strict"
import test from "node:test"

import {
  MONTH_END_NOTE,
  calendarMonth,
  monthBoundaries,
  withMonthEndNote,
} from "../src/lib/month-end.ts"

test("calendar month keeps year and month", () => {
  assert.equal(calendarMonth("2026-03-31"), "2026-03")
  assert.equal(calendarMonth("2026-01-02T18:00:00"), "2026-01")
  assert.equal(calendarMonth(""), "")
  assert.equal(calendarMonth("mars"), "")
  assert.equal(calendarMonth("2026-13-01"), "")
})

test("month boundaries sit between the last draw of a month and the next", () => {
  assert.deepEqual(monthBoundaries([]), [])
  assert.deepEqual(monthBoundaries(["2026-03-03"]), [])
  assert.deepEqual(
    monthBoundaries(["2026-03-03", "2026-03-06", "2026-03-10"]),
    []
  )
  assert.deepEqual(
    monthBoundaries([
      "2026-01-30",
      "2026-02-03",
      "2026-02-27",
      "2026-03-03",
      "2026-03-06",
    ]),
    [
      { date: "2026-01-30", next: "2026-02-03", month: "2026-01" },
      { date: "2026-02-27", next: "2026-03-03", month: "2026-02" },
    ]
  )
})

test("a year change and a skipped month are still one boundary", () => {
  assert.deepEqual(monthBoundaries(["2025-12-30", "2026-01-02"]), [
    { date: "2025-12-30", next: "2026-01-02", month: "2025-12" },
  ])
  assert.deepEqual(monthBoundaries(["2026-07-31", "2026-09-01"]), [
    { date: "2026-07-31", next: "2026-09-01", month: "2026-07" },
  ])
  assert.deepEqual(monthBoundaries(["2026-03-31", "pas-une-date", "2026-04-03"]), [])
})

test("the help note is appended once", () => {
  const help = withMonthEndNote({ title: "Courbe", body: "Chaque point est un tirage." })
  assert.match(help.body, /Chaque point est un tirage/)
  assert.match(help.body, new RegExp(MONTH_END_NOTE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")))
  assert.equal(withMonthEndNote(help), help)
})
