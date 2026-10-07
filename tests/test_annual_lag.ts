import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

import {
  annualLagZones,
  clampSuiteLength,
  collapseLagZones,
  DEFAULT_SUITE_LENGTH,
  formatChain,
  formatLagDays,
  lagNullPhrase,
  NULL_PERMUTATIONS,
  pairSuiteIndices,
  pearson,
  SUITE_LENGTHS,
  suiteChain,
  type LagPoint,
  type LagZone,
} from "../src/lib/annual-lag.ts"
import { seriesSigma } from "../src/lib/chartisme/sense.ts"

function point(date: string, sum: number): LagPoint {
  return {
    date,
    sum,
    month: Number(date.slice(5, 7)),
    day: Number(date.slice(8, 10)),
  }
}

function daily(year: number, month: number, day: number, sums: readonly number[]): LagPoint[] {
  return sums.map((sum, index) => {
    const utc = new Date(Date.UTC(year, month - 1, day + index))
    const date = utc.toISOString().slice(0, 10)
    return point(date, sum)
  })
}

function zone(partial: Partial<LagZone> & Pick<LagZone, "startIndex" | "endIndex" | "chainLabel">): LagZone {
  return {
    chain: [],
    tau: null,
    r0: null,
    rTau: null,
    nullPercentile: null,
    kept: false,
    fromDate: "2026-01-01",
    toDate: "2026-01-08",
    fromX: 0,
    toX: 0.1,
    ...partial,
  }
}

test("suite length runs from 6 to 10 and starts at 8", () => {
  assert.deepEqual(SUITE_LENGTHS, [6, 7, 8, 9, 10])
  assert.equal(DEFAULT_SUITE_LENGTH, 8)
  assert.equal(NULL_PERMUTATIONS, 200)
  assert.equal(clampSuiteLength(8), 8)
  assert.equal(clampSuiteLength(6), 6)
  assert.equal(clampSuiteLength(10), 10)
  assert.equal(clampSuiteLength(5), 8)
  assert.equal(clampSuiteLength(11), 8)
})

test("a suite of 8 splits into 2 monte + 3 baisse + 3 monte", () => {
  const sums = [100, 130, 100, 70, 40, 70, 100, 130]
  const runs = suiteChain(sums, 29)
  assert.equal(formatChain(runs), "2 monte + 3 baisse + 3 monte")
  assert.equal(
    runs.reduce((total, run) => total + run.length, 0),
    8
  )
  assert.equal(formatChain(suiteChain([0, 10, 20, 10, 0, 10, 20, 30], 5)), "3 monte + 2 baisse + 3 monte")
  assert.equal(formatChain(suiteChain([0, 5, 10], 5)), "3 stable")
  assert.equal(formatLagDays(11), "+11 j")
  assert.equal(formatLagDays(-11), "−11 j")
})

test("pairing keeps the nearest draw within 3 days", () => {
  const suite = [point("2026-03-10", 10), point("2026-03-17", 20), point("2026-03-24", 30)]
  const older = [
    point("2025-03-12", 1),
    point("2025-03-18", 2),
    point("2025-03-24", 3),
  ]
  assert.deepEqual(pairSuiteIndices(suite, older, 0), [0, 1, 2])
  const far = [point("2025-03-14", 1), point("2025-03-22", 2), point("2025-03-29", 3)]
  assert.equal(pairSuiteIndices(suite, far, 0), null)
  assert.equal(pearson([1, 2, 3], [1, 2, 3]), 1)
  assert.equal(pearson([1, 2, 3], [3, 2, 1]), -1)
  assert.equal(pearson([5, 5, 5], [1, 2, 3]), null)
})

test("the same calendar keeps r(0) and no lag", () => {
  const sums = [100, 130, 100, 70, 40, 70, 100, 130]
  const newer = daily(2026, 6, 2, sums)
  const older = daily(2025, 6, 2, sums)
  const zones = annualLagZones(newer, older, { length: 8, permutations: 30, seed: 2 })
  assert.equal(zones.length, 1)
  assert.equal(zones[0]?.kept, false)
  assert.equal(zones[0]?.tau, null)
  assert.ok(Math.abs((zones[0]?.r0 ?? 0) - 1) < 1e-9)
  assert.equal(lagNullPhrase(zones[0]!), "pas de décalage retenu")
  assert.equal(zones[0]?.chainLabel, "2 monte + 3 baisse + 3 monte")
})

test("a shifted copy keeps the lag when the chain matches", () => {
  const pattern = [100, 250, 100, 20, 20, 20, 100, 250]
  const newerSums = Array(30).fill(100)
  const olderSums = Array(30).fill(100)
  for (let index = 0; index < pattern.length; index += 1) {
    newerSums[12 + index] = pattern[index]
    olderSums[1 + index] = pattern[index]
  }
  const zones = annualLagZones(daily(2026, 4, 1, newerSums), daily(2025, 4, 1, olderSums), {
    length: 8,
    permutations: 40,
    seed: 3,
  })
  const chainLabel = formatChain(suiteChain(pattern, seriesSigma(newerSums)))
  const kept = zones.filter(
    (item) =>
      item.kept &&
      item.tau === -11 &&
      item.chainLabel === chainLabel &&
      item.fromDate <= "2026-04-13" &&
      item.toDate >= "2026-04-20"
  )
  assert.equal(kept.length, 1)
  assert.ok((kept[0]?.rTau ?? 0) > 0.99)
  assert.equal(lagNullPhrase(kept[0]!), "−11 j dépasse le 95e centile du nul")
  assert.ok((kept[0]?.nullPercentile ?? 1) < (kept[0]?.rTau ?? 0))
})

test("a month missing on one side is not compared", () => {
  const sums = [100, 140, 90, 60, 40, 70, 110, 150]
  const zones = annualLagZones(daily(2026, 3, 1, sums), daily(2025, 1, 1, sums), {
    length: 8,
    permutations: 10,
  })
  assert.equal(zones.length, 0)
})

test("length 6 reads a short suite and length 8 ignores it", () => {
  const sums = [10, 80, 20, 90, 15, 70]
  const newer = daily(2026, 5, 4, sums)
  const older = daily(2025, 5, 4, sums)
  assert.equal(annualLagZones(newer, older, { length: 8, permutations: 10 }).length, 0)
  const zones = annualLagZones(newer, older, { length: 6, permutations: 20, seed: 4 })
  assert.equal(zones.length, 1)
  assert.equal(zones[0]?.kept, false)
  assert.equal(zones[0]?.fromDate, "2026-05-04")
})

test("overlapping suites with the same chain and lag collapse", () => {
  const chainLabel = "2 monte + 3 baisse + 3 monte"
  const merged = collapseLagZones([
    zone({
      startIndex: 0,
      endIndex: 7,
      chainLabel,
      kept: true,
      tau: 11,
      r0: 0.2,
      rTau: 0.7,
      fromDate: "2026-01-06",
      toDate: "2026-01-30",
      fromX: 0.1,
      toX: 0.2,
    }),
    zone({
      startIndex: 3,
      endIndex: 10,
      chainLabel,
      kept: true,
      tau: 11,
      r0: 0.1,
      rTau: 0.9,
      fromDate: "2026-01-16",
      toDate: "2026-02-10",
      fromX: 0.15,
      toX: 0.3,
    }),
    zone({
      startIndex: 3,
      endIndex: 10,
      chainLabel,
      kept: true,
      tau: 4,
      r0: 0.1,
      rTau: 0.95,
      fromDate: "2026-01-16",
      toDate: "2026-02-10",
    }),
    zone({
      startIndex: 0,
      endIndex: 7,
      chainLabel: "8 stable",
      kept: false,
      r0: 0.2,
      fromDate: "2026-03-01",
      toDate: "2026-03-20",
    }),
    zone({
      startIndex: 4,
      endIndex: 11,
      chainLabel: "8 stable",
      kept: false,
      r0: 0.4,
      fromDate: "2026-03-10",
      toDate: "2026-03-30",
    }),
  ])
  const kept = merged.filter((item) => item.kept)
  assert.equal(kept.length, 2)
  const eleven = kept.find((item) => item.tau === 11)
  assert.equal(eleven?.fromDate, "2026-01-06")
  assert.equal(eleven?.toDate, "2026-02-10")
  assert.equal(eleven?.rTau, 0.9)
  assert.equal(kept.find((item) => item.tau === 4)?.rTau, 0.95)
  const open = merged.filter((item) => !item.kept)
  assert.equal(open.length, 1)
  assert.equal(open[0]?.r0, 0.4)
  assert.equal(open[0]?.toDate, "2026-03-30")
})

test("the annual chart exposes the lag control", () => {
  const view = readFileSync(new URL("../src/components/evolution-annual.tsx", import.meta.url), "utf8")
  const glossary = readFileSync(new URL("../src/lib/copy.ts", import.meta.url), "utf8")
  const panel = readFileSync(new URL("../src/components/evolution-panel.tsx", import.meta.url), "utf8")
  assert.match(view, /Décalage/)
  assert.match(view, /data-suite-length/)
  assert.match(view, /data-annual-lag/)
  assert.match(view, /pas de décalage retenu/)
  assert.match(view, /95e centile du nul/)
  assert.match(view, /SUITE_LENGTHS/)
  assert.match(view, /picks\.synthese \? synthesePoints\(lane\) : visibleBars\(lane, picks\)/)
  assert.match(view, /data-annual-lag-series/)
  assert.match(view, /data-annual-synthese="continu"/)
  assert.match(view, /data-month-end/)
  assert.match(glossary, /pas une probabilité/)
  assert.match(panel, /Décalage/)
})
