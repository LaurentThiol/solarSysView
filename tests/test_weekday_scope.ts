import assert from "node:assert/strict"
import test from "node:test"

import {
  WEEKDAY_LINE_COLOR,
  asWeekdayScope,
  filterDrawsByWeekday,
  normalizeDrawWeekday,
  seriesHasBothWeekdays,
  weekdayApiFromSources,
  weekdayApiValue,
  weekdayFilterDay,
  weekdayLineDash,
  weekdaySplitFields,
} from "../src/lib/weekday-scope.ts"
import { NUMBER_SUM_SD, weekdayDivergence } from "../src/lib/weekday-divergence.ts"
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

test("weekday API follows the chosen day, and Synthèse stays mixed", () => {
  assert.equal(weekdayApiFromSources("mardi", "vendredi"), "mardi")
  assert.equal(weekdayApiFromSources(null, "vendredi"), "vendredi")
  assert.equal(weekdayApiFromSources("synthese", "mardi"), undefined)
  assert.equal(weekdayApiFromSources("all", "mardi"), undefined)
  assert.equal(weekdayApiFromSources(null, "synthese"), undefined)
  assert.equal(weekdayApiFromSources(null, null), undefined)
})

test("both weekdays are required before a day overlay", () => {
  assert.equal(
    seriesHasBothWeekdays([{ weekday: "mardi" }, { weekday: "vendredi" }]),
    true
  )
  assert.equal(seriesHasBothWeekdays([{ weekday: "mardi" }, { weekday: "MARDI" }]), false)
  assert.equal(seriesHasBothWeekdays([{ weekday: "vendredi" }]), false)
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

function divergenceDraw(
  date: string,
  weekday: string,
  numbers: number[],
  starPool?: number
) {
  return {
    date,
    weekday,
    numbers,
    stars: [1, 2],
    star_pool: starPool,
  }
}

test("number sum standard deviation matches the closed form", () => {
  assert.equal(NUMBER_SUM_SD.toFixed(2), "30.92")
})

test("weekday divergence matches a hand-computed Welch contrast", () => {
  const report = weekdayDivergence([
    divergenceDraw("2026-01-06", "mardi", [1]),
    divergenceDraw("2026-01-13", "mardi", [2]),
    divergenceDraw("2026-01-20", "mardi", [3]),
    divergenceDraw("2026-01-09", "vendredi", [3]),
    divergenceDraw("2026-01-16", "vendredi", [4]),
    divergenceDraw("2026-01-23", "vendredi", [5]),
  ])
  const sum = report.axes.find((axis) => axis.id === "sum")
  assert.ok(sum)
  assert.equal(sum.mardi.mean, 2)
  assert.equal(sum.mardi.std, 1)
  assert.equal(sum.mardi.cv, 0.5)
  assert.equal(sum.vendredi.mean, 4)
  assert.equal(sum.vendredi.std, 1)
  assert.equal(sum.delta, -2)
  assert.equal(sum.cohenD, -2)
  assert.ok(Math.abs((sum.welchSe ?? 0) - Math.sqrt(2 / 3)) < 1e-12)
  assert.ok(Math.abs((sum.welchDf ?? 0) - 4) < 1e-12)
  assert.ok(Math.abs((sum.welchT ?? 0) + Math.sqrt(6)) < 1e-12)
  const half = ((sum.ciHigh ?? 0) - (sum.ciLow ?? 0)) / 2
  const critical = half / (sum.welchSe ?? 1)
  assert.ok(Math.abs(critical - 2.7764451051977987) < 1e-6)
})

test("identical weekday series have a zero mean gap", () => {
  const report = weekdayDivergence([
    divergenceDraw("2026-01-06", "mardi", [10]),
    divergenceDraw("2026-01-13", "mardi", [20]),
    divergenceDraw("2026-01-20", "mardi", [30]),
    divergenceDraw("2026-01-09", "vendredi", [10]),
    divergenceDraw("2026-01-16", "vendredi", [20]),
    divergenceDraw("2026-01-23", "vendredi", [30]),
  ])
  const sum = report.axes.find((axis) => axis.id === "sum")
  assert.ok(sum)
  assert.equal(sum.delta, 0)
  assert.equal(sum.cohenD, 0)
  assert.equal(sum.welchT, 0)
  assert.equal(sum.welchP, 1)
})

test("running sum std starts at the eighth draw of the longer evening", () => {
  const draws = []
  for (let i = 0; i < 10; i += 1) {
    draws.push(divergenceDraw(`2026-01-${String(i + 1).padStart(2, "0")}`, "mardi", [i + 1]))
  }
  for (let i = 0; i < 12; i += 1) {
    draws.push(divergenceDraw(`2026-02-${String(i + 1).padStart(2, "0")}`, "vendredi", [i + 2]))
  }
  const report = weekdayDivergence(draws)
  assert.equal(report.runningSumStd.length, 5)
  assert.equal(report.runningSumStd[0]?.k, 8)
  assert.equal(report.runningSumStd.at(-1)?.k, 12)
  assert.equal(report.runningSumStd[0]?.vendredi == null, false)
  assert.equal(report.runningSumStd.at(-1)?.mardi, null)
})

test("star axes drop when the window mixes two star pools", () => {
  const shared = [
    divergenceDraw("2026-01-06", "mardi", [1, 2, 3, 4, 5], 12),
    divergenceDraw("2026-01-13", "mardi", [2, 3, 4, 5, 6], 12),
    divergenceDraw("2026-01-09", "vendredi", [3, 4, 5, 6, 7], 12),
    divergenceDraw("2026-01-16", "vendredi", [4, 5, 6, 7, 8], 12),
  ]
  const onePool = weekdayDivergence(shared)
  assert.equal(onePool.starPoolBreak, false)
  assert.ok(onePool.axes.some((axis) => axis.id === "star_sum"))

  const mixed = weekdayDivergence([
    shared[0],
    shared[1],
    { ...shared[2], star_pool: 11 },
    { ...shared[3], star_pool: 11 },
  ])
  assert.equal(mixed.starPoolBreak, true)
  assert.equal(
    mixed.axes.some((axis) => axis.id === "star_sum" || axis.id === "star_spread"),
    false
  )
})
