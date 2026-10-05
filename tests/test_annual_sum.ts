import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

import {
  ANNUAL_MONTHS,
  annualBarX,
  annualPants,
  annualYDomain,
  monthEndX,
  monthMeanDeltas,
  THEORETICAL_NUMBER_SUM,
  type AnnualDraw,
} from "../src/lib/annual-sum.ts"

function draw(
  date: string,
  numbers: number[],
  weekday: "mardi" | "vendredi" = "mardi"
): AnnualDraw {
  return { date, numbers, weekday }
}

test("three years stay aligned, including a leap day", () => {
  assert.equal(annualBarX(3, 1), annualBarX(3, 1))
  const march = annualBarX(3, 1)
  assert.ok(march > monthEndX(2))
  assert.ok(march < monthEndX(3))
  const leap = annualBarX(2, 29)
  assert.ok(leap > monthEndX(1))
  assert.ok(leap < monthEndX(2))
  assert.ok(annualBarX(1, 31) < monthEndX(1))
  assert.equal(monthEndX(12), 1)
  assert.equal(ANNUAL_MONTHS.length, 12)
})

test("pants keeps n, n-1 and n-2 and the sum of the five numbers", () => {
  const pants = annualPants(
    [
      draw("2026-01-15", [10, 20, 30, 40, 50], "vendredi"),
      draw("2026-01-30", [1, 2, 3, 4, 5], "mardi"),
      draw("2026-03-01", [8, 9, 10, 11, 12]),
      draw("2025-03-01", [5, 5, 5, 5, 5], "vendredi"),
      draw("2024-02-29", [2, 2, 2, 2, 2]),
      draw("2023-06-01", [9, 9, 9, 9, 9]),
      draw("2026-04-01", [1, 2, 3, 4]),
    ],
    2026
  )

  assert.equal(pants.anchorYear, 2026)
  assert.equal(pants.theoretical, THEORETICAL_NUMBER_SUM)
  assert.deepEqual(
    pants.lanes.map((lane) => lane.role),
    ["n", "n-1", "n-2"]
  )
  assert.deepEqual(
    pants.lanes.map((lane) => lane.year),
    [2026, 2025, 2024]
  )

  const current = pants.lanes[0]
  assert.equal(current.bars.length, 3)
  assert.equal(current.bars[0]?.sum, 150)
  assert.equal(current.bars[1]?.sum, 15)
  assert.equal(current.bars[0]?.weekday, "vendredi")
  assert.equal(current.months[0]?.count, 2)
  assert.equal(current.months[0]?.mean, 82.5)
  assert.equal(current.months[0]?.x, monthEndX(1))
  assert.equal(current.partial, true)
  assert.equal(current.lastDate, "2026-03-01")

  const previous = pants.lanes[1]
  assert.equal(previous.bars[0]?.sum, 25)
  assert.equal(previous.bars[0]?.x, current.bars[2]?.x)
  assert.equal(previous.partial, false)

  const older = pants.lanes[2]
  assert.equal(older.bars[0]?.date, "2024-02-29")
  assert.equal(older.bars[0]?.sum, 10)
  assert.equal(older.partial, false)

  assert.equal(pants.deltas[0]?.[0]?.delta, null)
  assert.equal(pants.deltas[0]?.[2]?.delta, 25)
  assert.equal(pants.deltas[0]?.[2]?.newerCount, 1)
  assert.equal(pants.deltas[0]?.[2]?.olderCount, 1)
  assert.equal(pants.deltas[1]?.[1]?.delta, null)
  assert.ok(pants.yMin <= THEORETICAL_NUMBER_SUM)
  assert.ok(pants.yMax >= 150)
})

test("a closed December is not marked partial, an empty year stays empty", () => {
  const pants = annualPants(
    [draw("2024-12-31", [10, 10, 10, 10, 10]), draw("2024-01-02", [1, 1, 1, 1, 1])],
    2024
  )
  assert.equal(pants.lanes[0]?.partial, false)
  assert.equal(pants.lanes[0]?.bars[0]?.date, "2024-01-02")
  assert.equal(pants.lanes[1]?.bars.length, 0)
  assert.equal(pants.lanes[1]?.partial, false)
  assert.equal(pants.lanes[1]?.months.length, 12)
  assert.equal(pants.lanes[1]?.mean, null)
})

test("duplicate dates keep the last draw, and the scale holds 128", () => {
  const pants = annualPants(
    [
      draw("2025-05-06", [1, 1, 1, 1, 1]),
      draw("2025-05-06", [20, 20, 20, 20, 20]),
    ],
    2025
  )
  assert.equal(pants.lanes[0]?.bars.length, 1)
  assert.equal(pants.lanes[0]?.bars[0]?.sum, 100)
  const tight = annualYDomain([128, 128])
  assert.ok(tight.max - tight.min >= 30)
  assert.ok(tight.min <= 128 && tight.max >= 128)
  assert.deepEqual(annualYDomain([]), { min: 15, max: 240 })
  const wide = annualYDomain([15, 240])
  assert.equal(wide.min, 15)
  assert.equal(wide.max, 240)
  assert.equal(monthMeanDeltas(pants.lanes[0], pants.lanes[1])[4]?.delta, null)
})

test("evolution exposes the annual submenu", () => {
  const panel = readFileSync(new URL("../src/components/evolution-panel.tsx", import.meta.url), "utf8")
  const view = readFileSync(new URL("../src/components/evolution-annual.tsx", import.meta.url), "utf8")
  const page = readFileSync(new URL("../src/app/evolution/page.tsx", import.meta.url), "utf8")
  assert.match(panel, /id: "annuel"/)
  assert.match(panel, /EvolutionAnnual/)
  assert.match(panel, /Annuel · somme des 5 numéros/)
  assert.match(view, /data-annual-pants/)
  assert.match(view, /data-annual-orientation="horizontal"/)
  assert.match(view, /data-annual-head/)
  assert.match(view, /data-month-end/)
  assert.doesNotMatch(view, /l’une sous l’autre/)
  assert.match(view, /THEORETICAL_NUMBER_SUM/)
  assert.match(view, /Survolez une barre/)
  assert.match(page, /Annuel/)
})
