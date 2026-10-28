import assert from "node:assert/strict"
import test from "node:test"

import {
  GOLDEN_RATIOS,
  START_CENTS,
  TICKET_CENTS,
  countHits,
  createMinds,
  createRace,
  goldenAim,
  goldenLevel,
  orderGuess,
  playTurn,
  settlePurse,
  think,
  type RankPoint,
  type RunnerMind,
} from "../src/lib/run-arcade/thought.ts"

function point(index: number): RankPoint {
  return {
    date: `2024-06-${String((index % 28) + 1).padStart(2, "0")}`,
    n1: 2 + (index % 5),
    n2: 10 + (index % 4),
    n3: 20 + (index % 6),
    n4: 30 + (index % 5),
    n5: 40 + (index % 7),
    e1: 1 + (index % 5),
    e2: 7 + (index % 5),
  }
}

function series(length: number) {
  return Array.from({ length }, (_, index) => point(index))
}

const mind: RunnerMind = {
  id: "r1",
  name: "R1",
  focus: "n5",
  ratio: 0.618,
  span: "bande",
  motion: "glisse",
  window: 8,
}

test("golden ratios land on five distinct levels", () => {
  const levels = GOLDEN_RATIOS.map((ratio) => goldenLevel(1, 46, ratio))
  assert.equal(new Set(levels.map((level) => level.toFixed(4))).size, 5)
  assert.ok(Math.abs(goldenLevel(0, 10, 0.618) - 6.18) < 1e-9)
  assert.ok(Math.abs(goldenLevel(0, 10, 1.618) - 16.18) < 1e-9)
  assert.ok(Math.abs(goldenAim(0, 10, 1.618) - 6.18) < 1e-9)
  assert.ok(Math.abs(goldenAim(0, 10, 2.618) - 6.18) < 1e-9)
})

test("an ordered guess stays inside the legal bands", () => {
  const guess = orderGuess({ n1: 49, n2: 3, n3: 3, n4: 80, n5: 1, e1: 12, e2: 1 })
  const numbers = [guess.n1, guess.n2, guess.n3, guess.n4, guess.n5]
  const stars = [guess.e1, guess.e2]
  assert.deepEqual(numbers, [...numbers].sort((a, b) => a - b))
  assert.deepEqual(stars, [...stars].sort((a, b) => a - b))
  assert.ok(numbers.every((value, index) => value >= index + 1 && value <= 46 + index))
  assert.ok(guess.e1 >= 1 && guess.e1 <= 11)
  assert.ok(guess.e2 >= 2 && guess.e2 <= 12)
  assert.ok(guess.e1 < guess.e2)
  for (let index = 1; index < numbers.length; index += 1) {
    assert.ok(numbers[index] > numbers[index - 1])
  }
})

test("a thought uses only the revealed past", () => {
  const past = series(8)
  const first = think(mind, past)
  const withFuture = series(9)
  withFuture[8] = { ...withFuture[8], n5: 5, n1: 1 }
  const second = think(mind, withFuture.slice(0, 8))
  assert.deepEqual(first.guess, second.guess)
  const delta = past[7].n5 - past[6].n5
  const slope =
    (first.draw.tangent.y2 - first.draw.tangent.y1) /
    (first.draw.tangent.x2 - first.draw.tangent.x1)
  assert.ok(Math.abs(slope - delta) < 1e-9)
  assert.equal(first.draw.projection.y2, first.guess.n5)
  assert.ok(first.draw.radius.r >= 0.8)
  assert.ok(first.draw.velocity)
  assert.match(first.draw.phrase, /tangente/)
  assert.match(first.draw.phrase, /rayon/)
  assert.match(first.draw.phrase, /projection/)
})

test("the purse pays 2 € per exact rank and stops after twenty misses", () => {
  const guess = think(mind, series(6)).guess
  const actual = { ...series(1)[0], ...guess, n3: guess.n3 === 1 ? 2 : 1 }
  assert.equal(countHits(guess, actual), 6)
  assert.equal(settlePurse(START_CENTS, 6), START_CENTS - TICKET_CENTS + 6 * 200)
  let cents = START_CENTS
  let turns = 0
  while (cents >= TICKET_CENTS) {
    cents = settlePurse(cents, 0)
    turns += 1
  }
  assert.equal(turns, 20)
  assert.equal(cents, 0)
})

test("a turn settles the draw at the cursor and leaves the rest unseen", () => {
  const rows = series(12)
  const race = createRace(4, rows.length, 4)
  assert.equal(race.cursor, 8)
  const played = playTurn(race, rows)
  assert.equal(played.revealed?.date, rows[8].date)
  assert.equal(played.cursor, 9)
  const alone = think(race.runners[0].mind, rows.slice(0, 8))
  assert.deepEqual(played.runners[0].guess, alone.guess)
  assert.equal(played.runners.length, 4)
  assert.ok(played.runners[0].thought)
  assert.equal(createMinds(80).length, 50)
  const golden = think(
    { ...mind, motion: "or", ratio: 1.618, focus: "n3" },
    rows.slice(0, 8)
  )
  assert.ok(golden.guess.n1 < 30)
  assert.ok(golden.guess.n3 > golden.guess.n1)
  assert.ok(golden.guess.n3 < 45)
  assert.ok(golden.guess.n5 > golden.guess.n4)
})
