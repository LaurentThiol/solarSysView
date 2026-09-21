import assert from "node:assert/strict"
import test from "node:test"

import {
  WEEKDAY_LINE_COLOR,
  asWeekdayScope,
  filterDrawsByWeekday,
  normalizeDrawWeekday,
  weekdayApiValue,
  weekdayFilterDay,
  weekdayLineDash,
  weekdaySplitFields,
} from "../src/lib/weekday-scope.ts"
import { synthesizeWeekdays, weekdayCounts } from "../src/lib/weekday-synthesis.ts"

test("weekday scope parses jour aliases and ignores mercredi", () => {
  assert.equal(asWeekdayScope("synthèse"), "synthese")
  assert.equal(asWeekdayScope("mardi"), "mardi")
  assert.equal(asWeekdayScope("mercredi"), null)
  assert.equal(normalizeDrawWeekday("VENDREDI"), "vendredi")
  assert.equal(weekdayFilterDay("synthese"), null)
  assert.equal(weekdayApiValue("mardi"), "mardi")
  assert.equal(weekdayApiValue("all"), undefined)
})

test("filterDrawsByWeekday treats synthese like all", () => {
  const rows = [
    { weekday: "mardi", n: 1 },
    { weekday: "vendredi", n: 2 },
    { weekday: "mardi", n: 3 },
  ]
  assert.equal(filterDrawsByWeekday(rows, "mardi").length, 2)
  assert.equal(filterDrawsByWeekday(rows, "vendredi").length, 1)
  assert.equal(filterDrawsByWeekday(rows, "synthese").length, 3)
  assert.equal(
    filterDrawsByWeekday(rows, "mardi").length +
      filterDrawsByWeekday(rows, "vendredi").length,
    filterDrawsByWeekday(rows, "synthese").length
  )
})

test("weekday split keeps mardi and vendredi on their own curve", () => {
  assert.deepEqual(weekdaySplitFields("MARDI", 12), {
    overlayMardi: 12,
    overlayVendredi: null,
  })
  assert.deepEqual(weekdaySplitFields("vendredi", 4), {
    overlayMardi: null,
    overlayVendredi: 4,
  })
  assert.deepEqual(weekdaySplitFields("mardi", null), {
    overlayMardi: null,
    overlayVendredi: null,
  })
  assert.deepEqual(weekdaySplitFields("mercredi", 9), {
    overlayMardi: null,
    overlayVendredi: null,
  })
  assert.notEqual(WEEKDAY_LINE_COLOR.mardi, WEEKDAY_LINE_COLOR.vendredi)
  assert.equal(WEEKDAY_LINE_COLOR.mardi.includes("chart-2"), false)
  assert.equal(WEEKDAY_LINE_COLOR.vendredi.includes("chart-4"), false)
  assert.equal(weekdayLineDash("mardi"), undefined)
  assert.equal(weekdayLineDash("vendredi"), "6 3")
})

test("weekday API value is omitted for Tous and Synthèse", () => {
  assert.equal(weekdayApiValue("mardi"), "mardi")
  assert.equal(weekdayApiValue("vendredi"), "vendredi")
  assert.equal(weekdayApiValue("all"), undefined)
  assert.equal(weekdayApiValue("synthese"), undefined)
})

test("last N after weekday filter keeps only that day", () => {
  const rows = [
    { date: "2026-01-02", weekday: "vendredi" },
    { date: "2026-01-06", weekday: "mardi" },
    { date: "2026-01-09", weekday: "vendredi" },
    { date: "2026-01-13", weekday: "MARDI" },
    { date: "2026-01-16", weekday: "vendredi" },
    { date: "2026-01-20", weekday: "mardi" },
    { date: "2026-01-23", weekday: "vendredi" },
    { date: "2026-01-27", weekday: "mardi" },
  ]
  const mardis = filterDrawsByWeekday(rows, "mardi")
  const last3 = mardis.slice(-3)
  const warmup = mardis.slice(0, -3).slice(-1)
  assert.equal(last3.length, 3)
  assert.deepEqual(
    last3.map((row) => row.date),
    ["2026-01-13", "2026-01-20", "2026-01-27"]
  )
  assert.deepEqual(
    warmup.map((row) => row.date),
    ["2026-01-06"]
  )
  assert.ok(last3.every((row) => normalizeDrawWeekday(row.weekday) === "mardi"))
  assert.ok(warmup.every((row) => normalizeDrawWeekday(row.weekday) === "mardi"))
})

test("synthesizeWeekdays totals are mardi plus vendredi", () => {
  const draws = [
    {
      date: "2026-01-06",
      weekday: "mardi",
      numbers: [1, 2, 3, 4, 5],
      stars: [1, 2],
      prizes: [{ rank: 1, prize: 10 }],
      winners_total_eu: 4,
    },
    {
      date: "2026-01-09",
      weekday: "vendredi",
      numbers: [6, 7, 8, 9, 10],
      stars: [3, 4],
      prizes: [{ rank: 1, prize: 30 }],
      winners_total_eu: 8,
    },
    {
      date: "2026-01-13",
      weekday: "MARDI",
      numbers: [1, 2, 3, 4, 5],
      stars: [1, 2],
      prizes: [{ rank: 1, prize: 20 }],
      winners_total_eu: 6,
    },
  ]
  const report = synthesizeWeekdays(draws)
  const counts = weekdayCounts(draws)
  assert.equal(report.mardi.count, 2)
  assert.equal(report.vendredi.count, 1)
  assert.equal(report.combined.count, 3)
  assert.equal(report.combined.count, report.mardi.count + report.vendredi.count)
  assert.equal(counts.mardi + counts.vendredi, report.combined.count)
  assert.equal(report.mardi.meanSum, 15)
  assert.equal(report.vendredi.meanSum, 40)
  assert.equal(report.combined.meanSum, (15 + 15 + 40) / 3)
  assert.equal(report.mardi.meanJackpot, 15)
  assert.equal(report.vendredi.meanJackpot, 30)
})
