import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

import { TOTAL_GRIDS } from "../src/lib/pronostic/bounds.ts"
import {
  countStack,
  formatWidth,
  historicPortrait,
  historicReplay,
  historicSweep,
  learnAtWidth,
  pairDraws,
  recommendWidth,
  stacksForSettings,
  type WidthPoint,
} from "../src/lib/pronostic/index.ts"

function dateAt(index: number) {
  return new Date(Date.UTC(2023, 0, 1 + index)).toISOString().slice(0, 10)
}

function combo(seed: number) {
  let x = seed
  const numbers: number[] = []
  while (numbers.length < 5) {
    x = (x * 1103515245 + 12345) % 2147483648
    const value = (x % 50) + 1
    if (!numbers.includes(value)) numbers.push(value)
  }
  numbers.sort((a, b) => a - b)
  const stars: number[] = []
  while (stars.length < 2) {
    x = (x * 1103515245 + 12345) % 2147483648
    const value = (x % 12) + 1
    if (!stars.includes(value)) stars.push(value)
  }
  stars.sort((a, b) => a - b)
  return { numbers, stars }
}

function series(count: number, seed = 7) {
  return Array.from({ length: count }, (_, index) => ({
    date: dateAt(index),
    ...combo(seed + index * 17),
  }))
}

function point(width: number, rate: number, volume: number, grids: number): WidthPoint {
  return {
    width,
    n: 100,
    hits: Math.round(rate * 100),
    rate,
    meanGrids: grids,
    medianGrids: grids,
    meanVolume: volume,
    lift: volume > 0 ? rate / volume : null,
    portraitGrids: grids,
    portraitRate: 1,
  }
}

test("pairDraws drops incomplete or repeated balls", () => {
  const paired = pairDraws([
    { date: "2024-01-02", numbers: [1, 1, 3, 4, 5], stars: [1, 2] },
    { date: "2024-01-01", numbers: [2, 4, 6, 8, 10], stars: [3, 9] },
  ])
  assert.equal(paired.length, 1)
  assert.equal(paired[0].date, "2024-01-01")
  assert.deepEqual(paired[0].numbers, [2, 4, 6, 8, 10])
})

test("walk-forward does not look at the draw it tests", () => {
  const low = { numbers: [1, 2, 3, 4, 5], stars: [1, 2] }
  const draws = Array.from({ length: 12 }, (_, index) => ({
    date: dateAt(index),
    ...low,
  }))
  draws.push({
    date: dateAt(20),
    numbers: [46, 47, 48, 49, 50],
    stars: [11, 12],
  })
  const report = historicReplay(draws, 1, 20, learnAtWidth("minmax_std", 0))
  assert.equal(report.n, 1)
  assert.equal(report.hits, 0)
  assert.equal(report.rows[0].grids, 1)
  assert.equal(report.rows[0].numberHit, false)
  assert.equal(report.rows[0].starHit, false)
})

test("a draw is kept only when numbers and stars both sit in the bands", () => {
  const draws = Array.from({ length: 10 }, (_, index) => ({
    date: dateAt(index),
    numbers: [1, 2, 3, 4, 5],
    stars: [1, 2],
  }))
  draws.push({
    date: dateAt(20),
    numbers: [1, 2, 3, 4, 5],
    stars: [11, 12],
  })
  const report = historicReplay(draws, 1, 20, learnAtWidth("minmax_std", 0))
  assert.equal(report.numberHits, 1)
  assert.equal(report.starHits, 0)
  assert.equal(report.hits, 0)
  assert.ok(report.rows[0].starReasons.includes("e1"))
  assert.equal(report.rows[0].numberReasons.length, 0)
})

test("switching every layer off keeps the whole 5+2 universe", () => {
  const draws = series(12)
  const report = historicReplay(draws, 1, 20, learnAtWidth("mean_std", 0), {
    sum: false,
    parity: false,
    slots: false,
  })
  assert.equal(report.n, 1)
  assert.equal(report.hits, 1)
  assert.equal(report.rows[0].grids, TOTAL_GRIDS)
})

test("minmax portrait covers the draws that defined it", () => {
  const draws = series(24)
  const portrait = historicPortrait(draws, 10, learnAtWidth("minmax_std", 0))
  assert.ok(portrait)
  assert.equal(portrait.n, 10)
  assert.equal(portrait.covered, 10)
  const stacks = stacksForSettings(portrait, { sum: true, parity: true, slots: true })
  assert.equal(countStack(stacks.numbers) * countStack(stacks.stars), portrait.grids)
})

test("widening k does not shrink the portrait, tightening the percentile does not grow it", () => {
  const draws = series(36)
  const bySigma = historicSweep(draws, { horizon: 12, lookback: 15, method: "minmax_std" })
  for (let i = 1; i < bySigma.points.length; i += 1) {
    const prev = bySigma.points[i - 1].portraitGrids
    const next = bySigma.points[i].portraitGrids
    assert.ok(prev != null && next != null)
    assert.ok(next >= prev, `${formatWidth("minmax_std", bySigma.points[i].width)} ${next} < ${prev}`)
  }
  const byTail = historicSweep(draws, { horizon: 12, lookback: 15, method: "percentile" })
  for (let i = 1; i < byTail.points.length; i += 1) {
    const prev = byTail.points[i - 1].portraitGrids
    const next = byTail.points[i].portraitGrids
    assert.ok(prev != null && next != null)
    assert.ok(next <= prev)
  }
  assert.ok(bySigma.reports.every((report) => report.n === bySigma.reports[0].n))
})

test("suggested width keeps the smaller book among near-best gaps", () => {
  const advice = recommendWidth([
    point(0, 0.1, 0.01, 1_000),
    point(1, 0.5, 0.05, 5_000),
    point(2, 0.52, 0.2, 80_000),
  ])
  assert.equal(advice.index, 1)
  assert.equal(advice.separated, true)

  const tight = recommendWidth([
    point(0, 0.2, 0.1, 100),
    point(1, 0.21, 0.1, 5_000),
  ])
  assert.equal(tight.index, 0)
  assert.equal(tight.separated, true)

  const flat = recommendWidth([point(0, 0.01, 0.009, 100), point(1, 0.5, 0.5, 1_000)])
  assert.equal(flat.separated, false)

  const handful = recommendWidth([{ ...point(0, 0.03, 0.007, 1_000_000), hits: 2, n: 64 }])
  assert.equal(handful.separated, false)
})

test("historic tab is wired into pronostic", () => {
  const lab = readFileSync(new URL("../src/components/pronostic/pronostic-lab.tsx", import.meta.url), "utf8")
  const panel = readFileSync(
    new URL("../src/components/pronostic/historic-panel.tsx", import.meta.url),
    "utf8"
  )
  assert.match(lab, /id: "historic"/)
  assert.match(lab, /<HistoricPanel/)
  assert.match(panel, /Largeur des bandes/)
  assert.match(panel, /Appliquer ces réglages/)
  assert.match(panel, /HISTORIC_HORIZON/)
})
