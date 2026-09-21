import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

import {
  NUMBER_SPREAD_AXIS,
  NUMBER_SUM_AXIS,
  cellsByWeekday,
  domainContains,
  maxReachableSpread,
  padDomain,
  recencyFill,
  recencyUnit,
  sumSpreadCloud,
  sumSpreadDomains,
  sumSpreadEnvelope,
  sumSpreadEnvelopeCorners,
} from "../src/lib/sum-spread.ts"

const panelSrc = readFileSync(
  new URL("../src/components/analysis/stats-panels.tsx", import.meta.url),
  "utf8"
)

function scatterCard(src: string) {
  const start = src.indexOf("function SumSpreadDot")
  assert.ok(start >= 0, "SumSpreadDot")
  return src.slice(start)
}

test("axis constants match the 5/50 universe", () => {
  assert.equal(NUMBER_SUM_AXIS.min, 1 + 2 + 3 + 4 + 5)
  assert.equal(NUMBER_SUM_AXIS.max, 46 + 47 + 48 + 49 + 50)
  assert.equal(NUMBER_SUM_AXIS.mean, 128)
  assert.equal(NUMBER_SPREAD_AXIS.min, 5 - 1)
  assert.equal(NUMBER_SPREAD_AXIS.max, 50 - 1)
})

test("cloud maps abscissa to sum and ordinate to spread", () => {
  const cloud = sumSpreadCloud([
    { date: "2026-08-21", weekday: "mardi", numbers: [1, 2, 3, 4, 5] },
    { date: "2026-08-25", weekday: "vendredi", numbers: [1, 2, 3, 4, 50] },
    { date: "2026-08-28", weekday: "mardi", numbers: [1, 2, 3, 4, 5] },
  ])
  assert.equal(cloud.drawCount, 3)
  assert.equal(cloud.cells.length, 2)
  const compact = cloud.cells.find((cell) => cell.sum === 15)
  const wide = cloud.cells.find((cell) => cell.spread === 49)
  assert.ok(compact)
  assert.equal(compact.spread, 4)
  assert.equal(compact.count, 2)
  assert.deepEqual(compact.dates, ["2026-08-21", "2026-08-28"])
  assert.equal(compact.weekday, "mardi")
  assert.ok(wide)
  assert.equal(wide.sum, 60)
  assert.equal(wide.count, 1)
  assert.equal(cloud.last?.lastDate, "2026-08-28")
  assert.equal(cloud.last?.sum, 15)
  assert.equal(cloud.meanSum, (15 + 60 + 15) / 3)
  assert.equal(cloud.meanSpread, (4 + 49 + 4) / 3)
})

test("mardi and vendredi stay in separate cells at the same coordinates", () => {
  const cloud = sumSpreadCloud([
    { date: "2026-08-21", weekday: "mardi", numbers: [10, 11, 12, 13, 14] },
    { date: "2026-08-25", weekday: "vendredi", numbers: [10, 11, 12, 13, 14] },
  ])
  assert.equal(cloud.cells.length, 2)
  const { mardi, vendredi, other } = cellsByWeekday(cloud.cells)
  assert.equal(mardi.length, 1)
  assert.equal(vendredi.length, 1)
  assert.equal(other.length, 0)
  assert.equal(mardi[0].sum, vendredi[0].sum)
  assert.equal(mardi[0].spread, vendredi[0].spread)
})

test("envelope keeps extreme sums on spread 4 and frees the middle", () => {
  assert.equal(maxReachableSpread(15), 4)
  assert.equal(maxReachableSpread(240), 4)
  assert.equal(maxReachableSpread(128), 49)
  assert.ok(maxReachableSpread(60) >= 49)
  assert.ok(maxReachableSpread(16) >= 4)
  assert.ok(maxReachableSpread(16) < 49)
  assert.deepEqual(sumSpreadEnvelopeCorners(), [15, 60, 195, 240])
  assert.deepEqual(
    sumSpreadEnvelope(),
    [
      { sum: 15, spreadMax: 4 },
      { sum: 60, spreadMax: 49 },
      { sum: 195, spreadMax: 49 },
      { sum: 240, spreadMax: 4 },
    ]
  )
  const clipped = sumSpreadEnvelope([80, 160])
  assert.deepEqual(
    clipped.map((row) => row.sum),
    [80, 160]
  )
  assert.ok(clipped.every((row) => row.spreadMax === 49))
})

test("recency is 0 on the oldest cell and 1 on the newest", () => {
  assert.equal(recencyUnit("2026-08-21", "2026-08-21", "2026-08-28"), 0)
  assert.equal(recencyUnit("2026-08-28", "2026-08-21", "2026-08-28"), 1)
  const mid = recencyUnit("2026-08-25", "2026-08-21", "2026-08-28")
  assert.ok(mid > 0 && mid < 1)
  const cloud = sumSpreadCloud([
    { date: "2026-08-21", weekday: "mardi", numbers: [1, 2, 3, 4, 5] },
    { date: "2026-08-25", weekday: "vendredi", numbers: [1, 2, 3, 4, 50] },
    { date: "2026-08-28", weekday: "mardi", numbers: [10, 11, 12, 13, 14] },
  ])
  const oldest = cloud.cells.find((cell) => cell.lastDate === "2026-08-21")
  const newest = cloud.cells.find((cell) => cell.lastDate === "2026-08-28")
  assert.equal(oldest?.recency, 0)
  assert.equal(newest?.recency, 1)
  assert.equal(cloud.fromDate, "2026-08-21")
  assert.equal(cloud.toDate, "2026-08-28")
  assert.match(recencyFill(0, "mardi"), /color-mix\(in oklab, var\(--chart-2\) 16%, var\(--muted\)\)/)
  assert.match(recencyFill(1, "vendredi"), /color-mix\(in oklab, var\(--chart-4\) 100%, var\(--muted\)\)/)
})

test("universe domains are the theoretical axes; window pads inside them", () => {
  const cloud = sumSpreadCloud([
    { date: "2026-08-21", weekday: "mardi", numbers: [20, 21, 22, 23, 24] },
    { date: "2026-08-25", weekday: "vendredi", numbers: [30, 31, 32, 33, 40] },
  ])
  const universe = sumSpreadDomains(cloud.cells, "universe")
  assert.deepEqual(universe.x, [15, 240])
  assert.deepEqual(universe.y, [4, 49])
  assert.equal(domainContains(universe.x, NUMBER_SUM_AXIS.mean), true)
  const window = sumSpreadDomains(cloud.cells, "window")
  assert.ok(window.x[0] >= 15)
  assert.ok(window.x[1] <= 240)
  assert.ok(window.x[0] < 110 && window.x[1] > 166)
  assert.ok(window.y[0] >= 4 && window.y[1] <= 49)
  assert.deepEqual(padDomain([100], NUMBER_SUM_AXIS, 8)[0] >= 15, true)
})

test("scatter chart pins numeric X=sum and Y=spread", () => {
  const card = scatterCard(panelSrc)
  const x = card.slice(card.indexOf("<XAxis"), card.indexOf("<YAxis"))
  const y = card.slice(card.indexOf("<YAxis"), card.indexOf("<YAxis") + 420)
  assert.match(x, /type="number"/)
  assert.match(x, /dataKey="sum"/)
  assert.match(x, /name="Somme"/)
  assert.match(x, /allowDecimals=\{false\}/)
  assert.match(y, /type="number"/)
  assert.match(y, /dataKey="spread"/)
  assert.match(y, /name="Étendue"/)
  assert.match(y, /allowDecimals=\{false\}/)
  assert.match(card, /sumSpreadDomains/)
  assert.match(card, /sumSpreadEnvelope/)
  assert.match(card, /<ComposedChart/)
  assert.match(card, /dataKey="spreadMax"/)
  assert.match(card, /recencyFill/)
  assert.match(card, /Ancien → récent/)
  assert.match(card, /Abscisse/)
  assert.match(card, /Ordonnée/)
  assert.doesNotMatch(card, /<XAxis dataKey="sum" name="somme"/)
})
