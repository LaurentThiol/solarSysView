import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

import { TOTAL_GRIDS } from "../src/lib/pronostic/bounds.ts"
import { meanOf, proposeBand, sampleStd } from "../src/lib/pronostic/learn.ts"
import {
  ERROR_AXES,
  MARGIN_STEPS,
  bandFromMoments,
  historicGame,
  pairDraws,
  playHistoric,
  prepareHistoric,
  type AxisReading,
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

const LOW = { numbers: [1, 2, 3, 4, 5], stars: [1, 2] }
const HIGH = { numbers: [46, 47, 48, 49, 50], stars: [11, 12] }

function repeats(count: number, grid: { numbers: number[]; stars: number[] }, start = 0) {
  return Array.from({ length: count }, (_, index) => ({
    date: dateAt(start + index),
    numbers: [...grid.numbers],
    stars: [...grid.stars],
  }))
}

function axis(row: { axes: AxisReading[] }, id: AxisReading["id"]) {
  const found = row.axes.find((item) => item.id === id)
  assert.ok(found)
  return found
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

test("bandFromMoments matches proposeBand mean_std, including a band outside the pool", () => {
  const samples = [3, 8, 8, 9, 40]
  const theoretical = { lo: 1, hi: 50 }
  for (const k of MARGIN_STEPS) {
    const band = bandFromMoments(meanOf(samples), sampleStd(samples), k, theoretical)
    const proposed = proposeBand(samples, theoretical, { method: "mean_std", k, percentile: 5 })
    assert.deepEqual(band, proposed)
  }
  const outside = bandFromMoments(100, 0, 0, theoretical)
  const proposed = proposeBand([100, 100], theoretical, { method: "mean_std", k: 0, percentile: 9 })
  assert.deepEqual(outside, proposed)
  assert.deepEqual(outside, { lo: 50, hi: 50 })
})

test("integer band can contain a draw whose raw z-score is larger than the margin", () => {
  const mean = 10.6
  const sigma = 2
  const actual = 8
  const z = Math.abs((actual - mean) / sigma)
  assert.ok(z > 1)
  const band = bandFromMoments(mean, sigma, 1, { lo: 1, hi: 50 })
  assert.ok(actual >= band.lo && actual <= band.hi)
  const tighter = bandFromMoments(mean, sigma, 0.75, { lo: 1, hi: 50 })
  assert.ok(actual < tighter.lo || actual > tighter.hi)
})

test("a scored draw is forecast from the draws before it", () => {
  const draws = [...repeats(20, LOW), { date: dateAt(20), ...HIGH }]
  const game = historicGame(draws, { horizon: 1, lookback: 20, margin: 0 })
  assert.equal(game.summary.n, 1)
  assert.equal(game.summary.hits, 0)
  assert.equal(game.rows[0].grids, 1)
  assert.equal(game.rows[0].numberHit, false)
  assert.equal(game.rows[0].starHit, false)
  assert.equal(axis(game.rows[0], "sum").mean, 15)
  assert.equal(axis(game.rows[0], "sum").sigma, 0)
  assert.equal(axis(game.rows[0], "sum").z, null)
  assert.equal(game.rows[0].requiredMargin, null)
  const wide = playHistoric(prepareHistoric(draws, { horizon: 1, lookback: 20 }), 3)
  assert.equal(wide.summary.hits, 0)
  assert.equal(wide.rows[0].grids, 1)
})

test("a draw is inside the margin only when numbers and stars both are", () => {
  const draws = [
    ...repeats(20, LOW),
    { date: dateAt(20), numbers: [1, 2, 3, 4, 5], stars: [11, 12] },
  ]
  const game = historicGame(draws, { horizon: 1, lookback: 20, margin: 0 })
  assert.equal(game.summary.numberHits, 1)
  assert.equal(game.summary.starHits, 0)
  assert.equal(game.summary.hits, 0)
  assert.equal(game.rows[0].binding, "starSum")
  assert.equal(axis(game.rows[0], "n1").required, 0)
})

test("switching every layer off keeps the whole 5+2 universe", () => {
  const game = historicGame(series(21), {
    horizon: 1,
    lookback: 20,
    margin: 0,
    layers: { sum: false, parity: false, slots: false },
  })
  assert.equal(game.summary.n, 1)
  assert.equal(game.summary.hits, 1)
  assert.equal(game.rows[0].grids, TOTAL_GRIDS)
  assert.equal(game.rows[0].requiredMargin, 0)
  assert.equal(game.rows[0].vector.length, ERROR_AXES.length)
})

test("lookback is a full prior window", () => {
  const draws = series(25)
  const short = historicGame(draws, { lookback: 20, margin: 1 })
  assert.equal(short.summary.n, 5)
  assert.equal(historicGame(draws, { lookback: 50, margin: 1 }).summary.n, 0)
  assert.equal(historicGame(draws, { lookback: 100, margin: 1 }).summary.n, 0)
  assert.equal(short.next?.lookback, 20)
  assert.equal(historicGame(draws, { lookback: 50, margin: 1 }).next, null)
})

test("the announced margin hits exactly the draws whose measured error is at most that margin", () => {
  const draws = series(28)
  const prepared = prepareHistoric(draws, { horizon: 8, lookback: 20 })
  let previousHits = -1
  let previousGrids: number[] = []
  for (const margin of MARGIN_STEPS) {
    const game = playHistoric(prepared, margin)
    assert.equal(game.margin, margin)
    assert.equal(
      game.summary.hits,
      game.rows.filter((row) => row.requiredMargin != null && row.requiredMargin <= margin).length
    )
    assert.equal(game.curve.find((point) => point.margin === margin)?.caught, game.summary.hits)
    assert.ok(game.summary.hits >= previousHits)
    game.rows.forEach((row, index) => {
      if (previousGrids.length > 0) assert.ok(row.grids >= previousGrids[index])
      assert.equal(row.hit, row.requiredMargin != null && row.requiredMargin <= margin)
      assert.equal(row.vector.length, 11)
    })
    previousHits = game.summary.hits
    previousGrids = game.rows.map((row) => row.grids)
  }
  for (let index = 1; index < MARGIN_STEPS.length; index += 1) {
    const game = playHistoric(prepared, MARGIN_STEPS[index])
    const prev = game.curve[index - 1]
    const next = game.curve[index]
    assert.ok(next.caught >= prev.caught)
  }
})

test("auto lookback is chosen from earlier errors and ignores the draw being scored", () => {
  const draws = [
    ...repeats(40, LOW),
    ...repeats(30, HIGH, 40),
    { date: dateAt(70), ...LOW },
  ]
  const at20 = prepareHistoric(draws, { lookback: 20 }).rows.filter((row) => row.index >= 60 && row.index < 70)
  const at50 = prepareHistoric(draws, { lookback: 50 }).rows.filter((row) => row.index >= 60 && row.index < 70)
  assert.equal(at20.length, 10)
  assert.equal(at50.length, 10)
  assert.ok(at20.every((row) => row.requiredMargin === 0))
  assert.ok(at50.every((row) => row.requiredMargin == null || row.requiredMargin > 0))
  const prepared = prepareHistoric(draws, { horizon: 1, lookback: "auto" })
  assert.equal(prepared.rows.length, 1)
  assert.equal(prepared.rows[0].chosenLookback, 20)
  assert.equal(axis(prepared.rows[0], "sum").mean, 240)
  assert.equal(axis(prepared.rows[0], "sum").sigma, 0)
  const game = playHistoric(prepared, 3)
  assert.equal(game.summary.hits, 0)
  assert.equal(game.next?.lookback, 20)
})

test("when past windows tie, auto keeps the shorter one and falls back to 20", () => {
  const draws = repeats(70, LOW)
  const prepared = prepareHistoric(draws, { lookback: "auto" })
  assert.ok(prepared.rows.length > 0)
  assert.ok(prepared.rows.every((row) => row.chosenLookback === 20))
  const early = prepared.rows.filter((row) => row.index < 23)
  assert.ok(early.length >= 3)
  assert.ok(early.every((row) => row.chosenLookback === 20))
})

test("the next forecast is the last window at the announced margin", () => {
  const draws = [...repeats(20, HIGH), ...repeats(20, LOW, 20)]
  const game = historicGame(draws, { lookback: 20, margin: 0 })
  assert.ok(game.next)
  assert.equal(game.next.numbers.minSum, 15)
  assert.equal(game.next.numbers.maxSum, 15)
  assert.deepEqual(
    game.next.numbers.slots.map((band) => band.lo),
    [1, 2, 3, 4, 5]
  )
  assert.deepEqual(
    game.next.numbers.slots.map((band) => band.hi),
    [1, 2, 3, 4, 5]
  )
  assert.equal(game.next.grids, 1)
  assert.equal(game.next.learn.method, "mean_std")
  assert.equal(game.next.learn.k, 0)
})

test("the 2026 archive cannot score a 100-draw window", () => {
  const archive = JSON.parse(
    readFileSync(new URL("../src/data/euromillions-2026.json", import.meta.url), "utf8")
  ) as Array<{ date: string; numbers: number[]; stars: number[] }>
  const paired = pairDraws(archive)
  assert.ok(paired.length < 100)
  const wide = prepareHistoric(archive, { lookback: 100 })
  assert.equal(wide.rows.length, 0)
  const narrow = prepareHistoric(archive, { lookback: 20 })
  assert.equal(narrow.rows.length, paired.length - 20)
  assert.ok(narrow.rows.every((row) => row.vector.length === ERROR_AXES.length))
})

test("historic tab scores an announced margin and prepares the next draw", () => {
  const lab = readFileSync(new URL("../src/components/pronostic/pronostic-lab.tsx", import.meta.url), "utf8")
  const panel = readFileSync(
    new URL("../src/components/pronostic/historic-panel.tsx", import.meta.url),
    "utf8"
  )
  assert.match(lab, /id: "historic"/)
  assert.match(lab, /<HistoricPanel/)
  assert.match(lab, /Ce tirage n’entre pas dans le calcul/)
  assert.match(panel, /HISTORIC_HORIZON/)
  assert.match(panel, /Marge d’erreur/)
  assert.match(panel, /Choisi avant/)
  assert.match(panel, /Préparer le prochain tirage/)
  assert.match(panel, /Paramètres qui pèsent/)
  assert.doesNotMatch(panel, /Largeur des bandes/)
  assert.doesNotMatch(panel, /Appliquer ces réglages/)
  assert.doesNotMatch(panel, /largeur suggérée/i)
})
