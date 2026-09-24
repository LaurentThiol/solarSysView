import assert from "node:assert/strict"
import test from "node:test"

import { theoreticalSlot, theoreticalSlots } from "../src/lib/pronostic/bounds.ts"
import { countStack } from "../src/lib/pronostic/count.ts"
import { defaultStack, setLayerEnabled } from "../src/lib/pronostic/state.ts"
import {
  applyDeltaLayer,
  readDeltaLayer,
} from "../src/lib/pronostic/delta-layer.ts"
import {
  ERROR_AXES,
  historicGame,
  playHistoric,
  prepareHistoric,
} from "../src/lib/pronostic/index.ts"
import type { WindowPoint } from "../src/lib/pronostic/learn.ts"

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

function pointsOf(draws: Array<{ date: string; numbers: number[] }>): WindowPoint[] {
  return draws.map((draw) => ({
    date: draw.date,
    sum: draw.numbers.reduce((total, value) => total + value, 0),
    even: draw.numbers.filter((value) => value % 2 === 0).length,
    ranks: [...draw.numbers],
  }))
}

const LAYERS = { sum: true, parity: true, slots: true, pas: false }
const LOW = { numbers: [1, 2, 3, 4, 5], stars: [1, 2] }
const HIGH = { numbers: [46, 47, 48, 49, 50], stars: [11, 12] }

test("independent redraws leave the gate closed and the grid count unchanged", () => {
  const draws = series(40, 11)
  const reading = readDeltaLayer("numbers", pointsOf(draws))
  assert.equal(reading.open, false)
  assert.ok(reading.ranks.every((rank) => rank.gate === "closed"))
  assert.equal(reading.edge, "closed")
  const plain = historicGame(draws, { lookback: 20, margin: 1, layers: LAYERS })
  const stepped = historicGame(draws, { lookback: 20, margin: 1, layers: { ...LAYERS, pas: true } })
  assert.equal(stepped.rows.length, plain.rows.length)
  assert.ok(stepped.rows.every((row, index) => row.grids === plain.rows[index].grids))
  assert.equal(stepped.pas?.openCount, 0)
  assert.equal(stepped.pas?.stakeSaved, 0)
})

test("a stuck series opens the gate, tightens the intersection, and still covers the same grid", () => {
  const grid = { numbers: [10, 20, 30, 40, 48], stars: [3, 9] }
  const draws = Array.from({ length: 30 }, (_, index) => ({
    date: dateAt(index),
    numbers: [...grid.numbers],
    stars: [...grid.stars],
  }))
  const train = pointsOf(draws.slice(0, 20))
  const reading = readDeltaLayer("numbers", train)
  assert.equal(reading.open, true)
  assert.ok(reading.ranks.every((rank) => rank.gate === "persist"))
  const last = train[train.length - 1].ranks
  const wide = theoreticalSlots("numbers")
  const applied = applyDeltaLayer("numbers", wide, last, last, reading, 1)
  assert.ok(applied.slots.every((band, index) => band.hi - band.lo < wide[index].hi - wide[index].lo))
  let state = defaultStack("numbers")
  state = setLayerEnabled(state, "sum", false)
  state = setLayerEnabled(state, "parity", false)
  state.slots = applied.slots
  const open = countStack(defaultStack("numbers"))
  assert.ok(countStack(state) < open)
  const game = historicGame(draws, { lookback: 20, margin: 1, layers: { ...LAYERS, pas: true } })
  assert.ok(game.rows.length > 0)
  assert.ok(game.rows.every((row) => row.hit))
  assert.ok((game.pas?.openCount ?? 0) > 0)
})

test("a jumping series excludes the last level and stays inside theoretical bounds", () => {
  const draws = Array.from({ length: 24 }, (_, index) => ({
    date: dateAt(index),
    ...(index % 2 === 0 ? LOW : HIGH),
  }))
  const train = pointsOf(draws.slice(0, 20))
  const reading = readDeltaLayer("numbers", train)
  assert.ok(reading.ranks.some((rank) => rank.gate === "repel"))
  const last = train[train.length - 1].ranks
  const means = [0, 1, 2, 3, 4].map((index) => {
    const values = train.map((point) => point.ranks[index])
    return values.reduce((sum, value) => sum + value, 0) / values.length
  })
  const applied = applyDeltaLayer("numbers", theoreticalSlots("numbers"), last, means, reading, 1)
  applied.slots.forEach((band, index) => {
    const theo = theoreticalSlot("numbers", index)
    assert.ok(band.lo >= theo.lo && band.hi <= theo.hi)
    assert.ok(band.lo <= band.hi)
    const rank = reading.ranks[index]
    if (rank?.gate === "repel") assert.ok(last[index] < band.lo || last[index] > band.hi)
  })
})

test("coherence near the chance law does not move the edges; a shared slide moves both", () => {
  const draws = series(24, 3)
  const quiet = readDeltaLayer("numbers", pointsOf(draws))
  assert.equal(quiet.edge, "closed")
  const quietApplied = applyDeltaLayer(
    "numbers",
    theoreticalSlots("numbers"),
    draws[draws.length - 1].numbers,
    [8, 16, 25, 34, 42],
    quiet,
    1
  )
  assert.deepEqual(quietApplied.slots[0], theoreticalSlots("numbers")[0])
  assert.deepEqual(quietApplied.slots[4], theoreticalSlots("numbers")[4])

  const rising = Array.from({ length: 16 }, (_, index) => ({
    date: dateAt(index),
    numbers: [6 + index, 14 + index, 22 + index, 30 + index, 38 + index],
    stars: [1, 2],
  }))
  const loud = readDeltaLayer("numbers", pointsOf(rising))
  assert.equal(loud.edge, "slide")
  assert.equal(loud.edgeSign, 1)
  const last = rising[rising.length - 1].numbers
  const applied = applyDeltaLayer("numbers", theoreticalSlots("numbers"), last, [12, 20, 28, 36, 44], loud, 1)
  assert.ok(applied.slots[0].lo > theoreticalSlots("numbers")[0].lo)
  assert.ok(applied.slots[4].lo > theoreticalSlots("numbers")[4].lo)
})

test("the step layer does not change the joint margin or the residual vector", () => {
  const draws = series(36, 9)
  const preparedOff = prepareHistoric(draws, { lookback: 20, layers: LAYERS })
  const preparedOn = prepareHistoric(draws, { lookback: 20, layers: { ...LAYERS, pas: true } })
  const off = playHistoric(preparedOff, 1)
  const on = playHistoric(preparedOn, 1)
  assert.equal(on.rows.length, off.rows.length)
  for (let index = 0; index < on.rows.length; index += 1) {
    assert.equal(on.rows[index].requiredMargin, off.rows[index].requiredMargin)
    assert.equal(on.rows[index].vector.length, ERROR_AXES.length)
    assert.deepEqual(on.rows[index].vector, off.rows[index].vector)
    assert.equal(on.rows[index].binding, off.rows[index].binding)
  }
})
