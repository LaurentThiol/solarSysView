import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

import {
  NUMBER_MISS_RATE,
  NUMBER_POOL,
  PROBA_FLOOR_MAX,
  PROBA_FLOOR_OFF,
  STAR_MISS_RATE,
  STAR_POOL,
  ballValues,
  buildProbaBoards,
  nextPinnedBall,
  observeBand,
  orderBalls,
  parseProbaSort,
  probaFloorDelay,
  type ProbaDraw,
} from "../src/lib/proba-dynamic.ts"
import { chargePhrase, mapPhrase } from "../src/lib/proba-dynamic-help.ts"
import {
  buildCounterMap,
  buildProbaMap,
  parseMapKind,
  parseMapPlacement,
  parseMapScale,
} from "../src/lib/proba-map.ts"

function close(actual: number, expected: number) {
  assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} ≈ ${expected}`)
}

function draw(
  date: string,
  numbers: number[],
  stars: number[] = [1, 2],
  pool = 12
): ProbaDraw {
  return { date, numbers, stars, star_pool: pool, weekday: "mardi" }
}

test("a miss adds 1/50 or 1/12 and a hit column is zero", () => {
  const numbers = observeBand(
    [],
    [
      draw("2026-01-02", [2, 3, 4, 5, 6]),
      draw("2026-01-06", [1, 2, 3, 4, 5]),
      draw("2026-01-09", [2, 3, 4, 5, 6]),
    ],
    "number"
  )
  const one = numbers[0]
  close(one.series[0], 1 / 50)
  close(one.series[1], 0)
  close(one.series[2], 1 / 50)
  assert.equal(one.delay, 1)
  assert.equal(one.censored, false)

  const stars = observeBand([], [draw("2026-01-02", [1, 2, 3, 4, 5], [2, 3])], "star")
  close(stars[0].series[0], 1 / 12)
  close(stars[1].series[0], 0)
  close(stars[0].rarity, STAR_MISS_RATE ** 1)
  close(numbers[0].rarity, NUMBER_MISS_RATE ** 1)
})

test("memory before the window is kept and an absent ball is censored", () => {
  const history = [
    draw("2026-01-02", [2, 3, 4, 5, 6]),
    draw("2026-01-06", [2, 3, 4, 5, 7]),
  ]
  const work = [
    draw("2026-01-09", [2, 3, 4, 5, 8]),
    draw("2026-01-13", [2, 3, 4, 5, 9]),
  ]
  const one = observeBand(history, work, "number")[0]
  close(one.series[0], 3 / 50)
  close(one.series[1], 4 / 50)
  assert.equal(one.delay, 4)
  assert.equal(one.censored, true)
  close(one.windowFloor, 2 / 50)
  assert.match(chargePhrase({
    kind: "number",
    value: 1,
    date: "2026-01-13",
    charge: one.series[1],
    delay: one.delay,
    rarity: one.rarity,
    censored: true,
    windowFloor: one.windowFloor,
  }), /au moins/)
})

test("draws before the 12-star pool do not charge or reset a star", () => {
  const history = [
    draw("2010-01-01", [1, 2, 3, 4, 5], [3, 4], 9),
    draw("2010-01-05", [1, 2, 3, 4, 5], [1, 2], 9),
    draw("2010-01-08", [1, 2, 3, 4, 5], [5, 6], 9),
    draw("2016-10-04", [1, 2, 3, 4, 5], [2, 3], 12),
  ]
  const work = [draw("2016-10-07", [1, 2, 3, 4, 5], [2, 3], 12)]
  const star = observeBand(history, work, "star")[0]
  assert.equal(star.delay, 2)
  close(star.series[0], 2 / 12)
})

test("decades, units and the counter order both bands", () => {
  const numbers = orderBalls([1, 10, 11, 12, 2, 21, 50], () => 0, "dizaines", "desc")
  assert.deepEqual(numbers, [1, 2, 10, 11, 12, 21, 50])
  assert.deepEqual(
    orderBalls([1, 10, 11, 12, 2, 21, 50], () => 0, "unites", "asc"),
    [1, 11, 21, 2, 12, 10, 50]
  )
  const stars = orderBalls([12, 1, 10, 11, 2], () => 0, "dizaines", "asc")
  assert.deepEqual(stars, [1, 2, 10, 11, 12])
  assert.deepEqual(orderBalls([12, 1, 10, 11, 2], () => 0, "unites", "asc"), [1, 11, 2, 12, 10])

  const delay = (value: number) => (value === 10 ? 1 : 5)
  assert.deepEqual(orderBalls([1, 2, 10], delay, "compteur", "desc"), [1, 2, 10])
  assert.deepEqual(orderBalls([1, 2, 10], delay, "compteur", "asc"), [10, 1, 2])
})

test("the counter sort reads the end of the last 50, not another scale", () => {
  const draws: ProbaDraw[] = [
    draw("2025-01-03", [1, 2, 3, 4, 5], [1, 2]),
    draw("2025-12-30", [7, 8, 9, 10, 11], [3, 4]),
    draw("2026-01-02", [1, 2, 3, 4, 5], [1, 2]),
    draw("2026-01-06", [1, 2, 3, 4, 6], [1, 2]),
    draw("2026-01-09", [1, 2, 3, 4, 8], [1, 2]),
  ]
  const { boards, referenceDelay } = buildProbaBoards(draws)
  assert.equal(boards.length, 6)
  assert.equal(referenceDelay.number[6], 3)
  const previous = boards.find((board) => board.preset === "year_n1")
  assert.equal(previous?.numbers.rows[6].delay, 0)
  const byLast50 = orderBalls(
    ballValues(50),
    (value) => referenceDelay.number[value - 1],
    "compteur",
    "desc"
  )
  assert.ok(byLast50.indexOf(7) < byLast50.indexOf(1))
  const mixed = buildProbaBoards([
    draw("2026-01-02", [1, 2, 3, 4, 5], [1, 2], 11),
    draw("2026-01-06", [1, 2, 3, 4, 5], [1, 2], 12),
  ])
  assert.equal(mixed.boards[0].starsHidden, true)
  assert.match(mixed.boards[0].starNote ?? "", /Rupture/)
  assert.equal(mixed.boards[0].stars, null)
})

test("the map seeds slots by charge and breaks ties by ball number", () => {
  const columns = buildCounterMap([
    { value: 3, series: [0.5, 0] },
    { value: 1, series: [0.5, 0] },
    { value: 2, series: [0.1, 0] },
  ])
  assert.deepEqual(
    columns[0].map((cell) => cell.ball),
    [2, 1, 3]
  )
  assert.equal(columns[0][0].cost, 0)
  assert.deepEqual(columns[0][0].neighbors, [])
  assert.equal(parseProbaSort("map"), "map")
  assert.deepEqual(orderBalls([3, 1, 2], () => 9, "map", "desc"), [1, 2, 3])
})

test("each column places every counter once, nearest the adjacent past values", () => {
  const columns = buildCounterMap([
    { value: 1, series: [0, 10, 1] },
    { value: 2, series: [1, 1.1, 5] },
    { value: 3, series: [2, 0, 1.1] },
  ])
  const next = columns[1]
  assert.deepEqual(
    next.map((cell) => cell.ball),
    [3, 2, 1]
  )
  close(next[0].cost, 1)
  assert.deepEqual(next[0].neighbors, [0, 1])
  close(next[1].cost, 2.1)
  assert.deepEqual(next[1].neighbors, [0, 1, 2])
  close(next[2].cost, Math.abs(10 - 1) + Math.abs(10 - 2))
  assert.deepEqual(next[2].neighbors, [1, 2])
  assert.deepEqual(
    next.map((cell) => cell.ball).sort((a, b) => a - b),
    [1, 2, 3]
  )
  // La troisième colonne lit les voisines du tirage juste avant : [0, 1.1, 10].
  assert.deepEqual(
    columns[2].map((cell) => cell.ball),
    [1, 3, 2]
  )
})

test("an equal cost keeps the smaller ball number", () => {
  const columns = buildCounterMap([
    { value: 2, series: [1, 1] },
    { value: 1, series: [0, 1] },
    { value: 3, series: [2, 5] },
  ])
  assert.deepEqual(
    columns[0].map((cell) => cell.ball),
    [1, 2, 3]
  )
  assert.equal(columns[1][1].ball, 1)
  close(columns[1][1].cost, 2)
  assert.match(
    mapPhrase({
      kind: "number",
      ball: 1,
      date: "2026-01-06",
      slot: 1,
      slots: 3,
      charge: 1,
      cost: 2,
      neighbors: [0, 1, 2],
    }),
    /voisines/
  )
  assert.match(
    mapPhrase({
      kind: "number",
      ball: 1,
      date: "2026-01-02",
      slot: 0,
      slots: 3,
      charge: 0,
      cost: 0,
      neighbors: [],
    }),
    /premier tirage/
  )
})

test("sum puts a lip before zero, mean and raw rank the counters", () => {
  const rows = [
    { value: 1, series: [0, 0] },
    { value: 2, series: [0, 0.02] },
    { value: 3, series: [0, 0.2] },
    { value: 4, series: [1, 1] },
  ]
  const charges = (placement: "somme" | "moyenne" | "brut") =>
    buildCounterMap(rows, placement)[1].map((cell) => cell.charge)
  assert.deepEqual(charges("somme"), [0.02, 0, 0.2, 1])
  assert.deepEqual(charges("moyenne"), [0, 0.02, 0.2, 1])
  const raw = buildCounterMap(rows, "brut")
  assert.deepEqual(
    raw[1].map((cell) => cell.charge),
    [0, 0.02, 0.2, 1]
  )
  assert.equal(raw[1][0].cost, 0)
  assert.deepEqual(raw[1][0].neighbors, [])
  assert.equal(raw[1][3].ball, 4)
  assert.match(
    mapPhrase({
      kind: "number",
      ball: 1,
      date: "2026-01-06",
      slot: 0,
      slots: 4,
      charge: 0,
      cost: 0,
      neighbors: [],
      placement: "brut",
    }),
    /sans voisines/
  )
  assert.match(
    mapPhrase({
      kind: "number",
      ball: 2,
      date: "2026-01-06",
      slot: 1,
      slots: 4,
      charge: 0.02,
      cost: 0.02,
      neighbors: [0, 0, 0.2],
      placement: "moyenne",
    }),
    /écart moyen/
  )
  assert.equal(parseMapPlacement("moyenne"), "moyenne")
  assert.equal(parseMapPlacement("brut"), "brut")
  assert.equal(parseMapPlacement("ailleurs"), "somme")
  assert.equal(parseMapPlacement(null), "somme")
  assert.equal(buildProbaMap([draw("2026-01-02", [1, 2, 3, 4, 5])], "tout", "number", "brut").placement, "brut")
  assert.equal(buildProbaMap([draw("2026-01-02", [1, 2, 3, 4, 5])], "tout", "number").placement, "somme")
})

test("map columns follow draw order and ignore calendar gaps", () => {
  const map = buildProbaMap(
    [
      draw("2024-06-01", [1, 2, 3, 4, 5]),
      draw("2020-01-01", [1, 2, 3, 4, 6]),
    ],
    "tout",
    "number"
  )
  assert.deepEqual(map.dates, ["2020-01-01", "2024-06-01"])
  assert.equal(map.columns.length, map.dates.length)
  assert.equal(map.columns[0].length, 50)
  assert.equal(map.pool, 50)

  const year = buildProbaMap(
    [
      draw("2025-12-30", [1, 2, 3, 4, 5]),
      draw("2026-01-02", [1, 2, 3, 4, 6]),
      draw("2026-01-06", [1, 2, 3, 4, 7]),
    ],
    "year",
    "number"
  )
  assert.deepEqual(year.dates, ["2026-01-02", "2026-01-06"])
  assert.equal(year.columns.length, 2)

  const stars = buildProbaMap([draw("2026-01-02", [1, 2, 3, 4, 5], [1, 2])], "tout", "star")
  assert.equal(stars.columns[0].length, 12)
  close(stars.expected, 5 / 12)

  const mixed = buildProbaMap(
    [
      draw("2026-01-02", [1, 2, 3, 4, 5], [1, 2], 11),
      draw("2026-01-06", [1, 2, 3, 4, 5], [1, 2], 12),
    ],
    "tout",
    "star"
  )
  assert.equal(mixed.starsHidden, true)
  assert.equal(mixed.columns.length, 0)
  assert.match(mixed.starNote ?? "", /Rupture|pool/)

  assert.equal(parseMapScale("last_50"), "last_50")
  assert.equal(parseMapScale("ailleurs"), "tout")
  assert.equal(parseMapKind("etoiles"), "star")
  assert.equal(parseMapKind(null), "number")
})

test("the floor cursor erases the plane at the right end and the ball cursor loops", () => {
  assert.equal(probaFloorDelay(0), 0)
  assert.equal(probaFloorDelay(9), 9)
  assert.equal(probaFloorDelay(PROBA_FLOOR_MAX), PROBA_FLOOR_MAX)
  assert.equal(probaFloorDelay(PROBA_FLOOR_OFF), null)
  assert.equal(probaFloorDelay(Number.NaN), null)
  assert.equal(nextPinnedBall(1, NUMBER_POOL), 2)
  assert.equal(nextPinnedBall(NUMBER_POOL, NUMBER_POOL), 1)
  assert.equal(nextPinnedBall(STAR_POOL, STAR_POOL), 1)
  assert.equal(nextPinnedBall(0, STAR_POOL), 1)

  const page = readFileSync(new URL("../src/app/probadynamic/page.tsx", import.meta.url), "utf8")
  assert.doesNotMatch(page, /Lecture d/)
  assert.doesNotMatch(page, /note=/)

  const lab = readFileSync(
    new URL("../src/components/proba-dynamic/proba-dynamic-lab.tsx", import.meta.url),
    "utf8"
  )
  assert.match(lab, /Défilement automatique/)
  assert.match(lab, /nextPinnedBall/)
  assert.match(lab, /aria-pressed=\{autoScroll\}/)

  const map = readFileSync(
    new URL("../src/components/proba-dynamic/counter-map.tsx", import.meta.url),
    "utf8"
  )
  assert.match(map, /shownFloor != null/)
  assert.match(map, /PROBA_FLOOR_OFF/)
  assert.match(map, /effacé/)
})

test("the lab shows a yellow calculation light and a green settled light", () => {
  const lab = readFileSync(
    new URL("../src/components/proba-dynamic/proba-dynamic-lab.tsx", import.meta.url),
    "utf8"
  )
  assert.match(lab, /Calcul/)
  assert.match(lab, /À jour/)
  assert.match(lab, /animate-ping/)
  assert.match(lab, /bg-warn/)
  assert.match(lab, /bg-ok/)
  assert.match(lab, /aria-live="polite"/)
  assert.match(lab, /aria-busy=\{thinking\}/)
  assert.match(lab, /if \(next === weekday\) return/)
  assert.match(lab, /window\.setTimeout/)
  assert.doesNotMatch(lab, /useMemo\(\(\) => buildProbaBoards/)
})
