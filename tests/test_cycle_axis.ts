import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

import { cycleChartRows } from "../src/lib/cycles.ts"

const SCREENSHOT = [
  "2026-04-10",
  "2026-04-21",
  "2026-05-01",
  "2026-05-15",
  "2026-05-29",
  "2026-06-12",
  "2026-06-26",
  "2026-07-10",
  "2026-07-21",
  "2026-07-31",
  "2026-08-11",
  "2026-08-21",
  "2026-09-01",
  "2026-09-11",
  "2026-09-25",
]

function dayMonth(iso: string) {
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "2-digit",
  }).format(new Date(`${iso}T12:00:00`))
}

test("cycle chart abscissa keeps each draw date, including the same month-day a year apart", () => {
  const rows = cycleChartRows(
    ["2025-04-10", "2026-04-10", "2026-09-25"],
    { target: [116, 120, 130], lunar: [0.2, 0.4, 0.8] },
  )
  assert.deepEqual(
    rows.map((row) => row.date),
    ["2025-04-10", "2026-04-10", "2026-09-25"],
  )
  assert.equal(new Set(rows.map((row) => row.date)).size, 3)
  assert.equal(rows[0]?.target, 116)
  assert.equal(rows[2]?.lunar, 0.8)
  assert.equal("missing" in rows[1]!, false)
})

test("courbe et horloges shows the screenshot ticks as day/month", () => {
  assert.deepEqual(
    SCREENSHOT.map(dayMonth),
    [
      "10/04",
      "21/04",
      "01/05",
      "15/05",
      "29/05",
      "12/06",
      "26/06",
      "10/07",
      "21/07",
      "31/07",
      "11/08",
      "21/08",
      "01/09",
      "11/09",
      "25/09",
    ],
  )
  const source = readFileSync(new URL("../src/components/cycles/cycle-charts.tsx", import.meta.url), "utf8")
  assert.equal(source.includes("date.slice(5)"), false)
  assert.equal(source.includes("tickFormatter={formatShortDate}"), true)
  assert.equal(source.includes("cycleChartRows"), true)
})
