import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

import {
  ANNUAL_MONTHS,
  annualBarX,
  annualMonthMean,
  annualPants,
  annualYDomain,
  formatSenseMoment,
  formatSenseTrack,
  monthEndX,
  monthMeanDeltas,
  sameSenseRate,
  sameSenseSegmentKey,
  sameSenseSegmentKeys,
  sameSenseTrack,
  THEORETICAL_NUMBER_SUM,
  type AnnualDraw,
  type SameSensePoint,
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

test("month mean follows the selected evenings", () => {
  const bars = [
    { month: 1, sum: 100, weekday: "mardi" },
    { month: 1, sum: 140, weekday: "vendredi" },
    { month: 1, sum: 50, weekday: "mardi" },
    { month: 2, sum: 10, weekday: "vendredi" },
  ]
  assert.deepEqual(annualMonthMean(bars, 1), { mean: (100 + 140 + 50) / 3, count: 3 })
  assert.deepEqual(annualMonthMean(bars, 1, ["mardi"]), { mean: 75, count: 2 })
  assert.deepEqual(annualMonthMean(bars, 1, ["vendredi"]), { mean: 140, count: 1 })
  assert.deepEqual(annualMonthMean(bars, 1, ["mardi", "vendredi"]), {
    mean: (100 + 140 + 50) / 3,
    count: 3,
  })
  assert.deepEqual(annualMonthMean(bars, 1, []), { mean: null, count: 0 })
  assert.deepEqual(annualMonthMean(bars, 3, ["mardi"]), { mean: null, count: 0 })
  assert.equal(annualMonthMean(bars, 2, ["mardi"]).count, 0)
})

function sensePoint(
  date: string,
  sum: number,
  weekday: "mardi" | "vendredi"
): SameSensePoint {
  return {
    date,
    sum,
    weekday,
    month: Number(date.slice(5, 7)),
    day: Number(date.slice(8, 10)),
  }
}

test("same-direction segments pair the same evening within three days", () => {
  const newer = [
    sensePoint("2026-01-02", 100, "vendredi"),
    sensePoint("2026-01-06", 130, "mardi"),
  ]
  const olderUp = [
    sensePoint("2025-01-03", 80, "vendredi"),
    sensePoint("2025-01-07", 110, "mardi"),
  ]
  const rising = sameSenseSegmentKeys(newer, olderUp)
  assert.equal(rising.has(sameSenseSegmentKey("2026-01-02", "2026-01-06")), true)
  assert.equal(rising.has(sameSenseSegmentKey("2025-01-03", "2025-01-07")), true)

  const olderDown = [
    sensePoint("2025-01-03", 140, "vendredi"),
    sensePoint("2025-01-07", 90, "mardi"),
  ]
  assert.equal(sameSenseSegmentKeys(newer, olderDown).size, 0)

  const falling = sameSenseSegmentKeys(
    [sensePoint("2026-01-02", 130, "vendredi"), sensePoint("2026-01-06", 100, "mardi")],
    olderDown
  )
  assert.equal(falling.has(sameSenseSegmentKey("2026-01-02", "2026-01-06")), true)
  assert.equal(falling.has(sameSenseSegmentKey("2025-01-03", "2025-01-07")), true)

  const flat = sameSenseSegmentKeys(
    [sensePoint("2026-01-02", 100, "vendredi"), sensePoint("2026-01-06", 100, "mardi")],
    olderUp
  )
  assert.equal(flat.size, 0)
  const olderFlat = sameSenseSegmentKeys(newer, [
    sensePoint("2025-01-03", 80, "vendredi"),
    sensePoint("2025-01-07", 80, "mardi"),
  ])
  assert.equal(olderFlat.size, 0)
})

test("a nearer tuesday does not replace the friday two days away", () => {
  const newer = [
    sensePoint("2026-01-02", 100, "vendredi"),
    sensePoint("2026-01-06", 130, "mardi"),
  ]
  const older = [
    sensePoint("2025-01-03", 200, "mardi"),
    sensePoint("2025-01-04", 110, "vendredi"),
    sensePoint("2025-01-07", 140, "mardi"),
  ]
  const keys = sameSenseSegmentKeys(newer, older)
  assert.equal(keys.has(sameSenseSegmentKey("2026-01-02", "2026-01-06")), true)
  assert.equal(keys.has(sameSenseSegmentKey("2025-01-04", "2025-01-07")), true)
  assert.equal(keys.has(sameSenseSegmentKey("2025-01-03", "2025-01-07")), false)
})

test("an evening beyond three days stays uncolored", () => {
  const newer = [
    sensePoint("2026-01-02", 100, "vendredi"),
    sensePoint("2026-01-06", 140, "mardi"),
  ]
  const older = [
    sensePoint("2025-01-10", 90, "vendredi"),
    sensePoint("2025-01-14", 120, "mardi"),
  ]
  assert.equal(sameSenseSegmentKeys(newer, older).size, 0)
  const missing = sameSenseRate(newer, older)
  assert.equal(missing.compared, 0)
  assert.equal(missing.same, 0)
  assert.equal(missing.rate, null)
})

test("similarity rate is the share of paired segments that move the same way", () => {
  const newer = [
    sensePoint("2026-01-02", 100, "vendredi"),
    sensePoint("2026-01-06", 130, "mardi"),
    sensePoint("2026-01-09", 90, "vendredi"),
  ]
  const older = [
    sensePoint("2025-01-03", 80, "vendredi"),
    sensePoint("2025-01-07", 110, "mardi"),
    sensePoint("2025-01-10", 140, "vendredi"),
  ]
  const mixed = sameSenseRate(newer, older)
  assert.equal(mixed.compared, 2)
  assert.equal(mixed.same, 1)
  assert.equal(mixed.rate, 0.5)
  assert.equal(mixed.keys.has(sameSenseSegmentKey("2026-01-02", "2026-01-06")), true)
  assert.equal(mixed.keys.has(sameSenseSegmentKey("2025-01-03", "2025-01-07")), true)
  assert.equal(mixed.keys.has(sameSenseSegmentKey("2026-01-06", "2026-01-09")), false)
  assert.equal(sameSenseSegmentKeys(newer, older).size, mixed.keys.size)

  const opposite = sameSenseRate(
    [sensePoint("2026-01-02", 130, "vendredi"), sensePoint("2026-01-06", 100, "mardi")],
    [sensePoint("2025-01-03", 80, "vendredi"), sensePoint("2025-01-07", 110, "mardi")]
  )
  assert.equal(opposite.compared, 1)
  assert.equal(opposite.same, 0)
  assert.equal(opposite.rate, 0)
  assert.equal(opposite.keys.size, 0)

  const flat = sameSenseRate(
    [sensePoint("2026-01-02", 100, "vendredi"), sensePoint("2026-01-06", 100, "mardi")],
    [sensePoint("2025-01-03", 80, "vendredi"), sensePoint("2025-01-07", 110, "mardi")]
  )
  assert.equal(flat.compared, 1)
  assert.equal(flat.same, 0)
  assert.equal(flat.rate, 0)

  const short = sameSenseRate([sensePoint("2026-01-02", 100, "vendredi")], older)
  assert.equal(short.compared, 0)
  assert.equal(short.rate, null)
})

function tuesdaySeries(year: number, sums: readonly number[]) {
  const dates = [
    "01-06",
    "01-13",
    "01-20",
    "01-27",
    "02-03",
    "02-10",
    "02-17",
    "02-24",
  ]
  return sums.map((sum, index) => sensePoint(`${year}-${dates[index]}`, sum, "mardi"))
}

test("same-sense track reads delay against the mean gap", () => {
  const newer = tuesdaySeries(2026, [100, 110, 120, 110, 120, 110])
  const older = tuesdaySeries(2025, [50, 60, 50, 60, 70, 80])
  const track = sameSenseTrack(newer, older)
  assert.deepEqual(
    track.steps.map((step) => step.gap),
    [0, 1, 2, 0, 1]
  )
  assert.deepEqual(
    track.steps.map((step) => step.same),
    [true, false, false, true, false]
  )
  assert.equal(track.steps[0]?.x, annualBarX(1, 13))
  assert.equal(track.meanGap, 2)
  assert.equal(track.gap, 1)
  assert.equal(track.reading, "avance")
  assert.equal(track.delta, 1)
  assert.equal(formatSenseTrack(track), "avance 1")
  assert.equal(formatSenseMoment(3, 1), "retard 2")
  assert.equal(formatSenseMoment(2, 2), "égal")

  const rate = sameSenseRate(newer, older)
  assert.equal(track.steps.length, rate.compared)
  assert.equal(track.steps.filter((step) => step.same).length, rate.same)
})

test("same-sense track waits for two hits before naming retard or avance", () => {
  const oneHit = sameSenseTrack(
    tuesdaySeries(2026, [100, 110, 120, 130, 140]),
    tuesdaySeries(2025, [50, 60, 50, 40, 30])
  )
  assert.deepEqual(
    oneHit.steps.map((step) => step.gap),
    [0, 1, 2, 3]
  )
  assert.equal(oneHit.meanGap, null)
  assert.equal(oneHit.reading, null)
  assert.equal(formatSenseTrack(oneHit), "écart 3")

  const late = sameSenseTrack(
    tuesdaySeries(2026, [100, 110, 100, 90, 100, 90, 80]),
    tuesdaySeries(2025, [50, 60, 70, 60, 50, 60, 70])
  )
  assert.deepEqual(
    late.steps.map((step) => step.gap),
    [0, 1, 0, 1, 2, 3]
  )
  assert.equal(late.meanGap, 1)
  assert.equal(late.reading, "retard")
  assert.equal(late.delta, -2)
  assert.equal(formatSenseTrack(late), "retard 2")

  const level = sameSenseTrack(
    tuesdaySeries(2026, [100, 110, 120]),
    tuesdaySeries(2025, [40, 50, 60])
  )
  assert.deepEqual(
    level.steps.map((step) => step.gap),
    [0, 0]
  )
  assert.equal(level.meanGap, 0)
  assert.equal(level.reading, "egal")
  assert.equal(formatSenseTrack(level), "égal")

  const leading = sameSenseTrack(
    tuesdaySeries(2026, [100, 90, 80, 90]),
    tuesdaySeries(2025, [50, 60, 70, 80])
  )
  assert.deepEqual(
    leading.steps.map((step) => step.same),
    [false, false, true]
  )
  assert.equal(leading.meanGap, null)
  assert.equal(leading.gap, 0)
  assert.equal(formatSenseTrack(leading), "écart 0")

  const empty = sameSenseTrack([], [])
  assert.equal(empty.steps.length, 0)
  assert.equal(empty.gap, null)
  assert.equal(formatSenseTrack(empty), "—")

  const far = sameSenseTrack(
    [sensePoint("2026-01-02", 100, "vendredi"), sensePoint("2026-01-06", 140, "mardi")],
    [sensePoint("2025-01-10", 90, "vendredi"), sensePoint("2025-01-14", 120, "mardi")]
  )
  assert.equal(far.steps.length, 0)
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
  assert.match(view, /aria-pressed/)
  assert.match(view, /data-annual-synthese="continu"/)
  assert.match(view, /data-annual-same-sense/)
  assert.match(view, /Même sens/)
  assert.match(view, /data-annual-sense-track/)
  assert.match(view, /data-annual-sense-schema/)
  assert.match(view, /data-annual-sense-headline/)
  assert.match(view, /Suivi/)
  assert.match(view, /Écart moyen/)
  assert.match(view, /Survolez le suivi/)
  assert.match(view, /data-annual-similarity/)
  assert.match(view, /data-annual-similarity-pair=\{pair\.id\}/)
  assert.match(view, /id: "n\/n-1"/)
  assert.match(view, /id: "n-1\/n-2"/)
  assert.match(view, /label: "n\/n−1"/)
  assert.match(view, /label: "n−1\/n−2"/)
  assert.match(view, /trait continu/)
  assert.doesNotMatch(view, /data-annual-synthese-mean/)
  assert.match(view, /Aucun soir sélectionné/)
  assert.match(view, /return \{ mardi: false, vendredi: false, synthese: false \}/)
  assert.match(view, /éteints/)
  assert.match(view, /mardi \+ vendredi/)
  assert.doesNotMatch(view, /filterDrawsByWeekday/)
  assert.match(page, /Annuel/)
  const glossary = readFileSync(new URL("../src/lib/copy.ts", import.meta.url), "utf8")
  assert.match(glossary, /Mardi et vendredi se sélectionnent/)
  assert.match(glossary, /taux de similitude/)
  assert.match(glossary, /n\/n−1/)
  assert.match(glossary, /n−1\/n−2/)
  assert.match(glossary, /écart moyen/)
  assert.match(panel, /Suivi trace le retard/)
})
