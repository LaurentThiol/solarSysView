import assert from "node:assert/strict"
import test from "node:test"

import { buildTrack, type RankPoint } from "../src/lib/run-arcade/curves.ts"
import { numberCoherenceTheory, starCoherenceTheory } from "../src/lib/delta-coherence.ts"
import {
  layerPoints,
  numberGaps,
  numberPhrase,
  numberStats,
  rankPlaces,
  readFocus,
  readWindow,
  starGap,
  starPhrase,
} from "../src/lib/run-arcade/layers.ts"

function comma(value: number) {
  const rounded = Math.round(value * 100) / 100
  const text = rounded.toFixed(2).replace(/\.00$/, "").replace(/(\.\d)0$/, "$1")
  return text.replace(".", ",")
}

function point(
  date: string,
  n1: number,
  n2: number,
  n3: number,
  n4: number,
  n5: number,
  e1: number,
  e2: number
): RankPoint {
  return { date, n1, n2, n3, n4, n5, e1, e2 }
}

const pair = [
  point("2026-01-06", 8, 20, 30, 38, 48, 1, 4),
  point("2026-01-09", 10, 25, 35, 40, 50, 3, 8),
]

test("gaps are the distances between neighbouring ranks", () => {
  assert.deepEqual(numberGaps(pair[1]), { g1: 15, g2: 10, g3: 5, g4: 10 })
  assert.equal(starGap(pair[1]), 5)
})

test("interior ranks cite a golden place only within five hundredths", () => {
  const places = rankPlaces(pair[1])
  assert.deepEqual(
    places.map((place) => place.golden),
    [0.382, 0.618, null]
  )
  assert.ok(Math.abs(places[0].place - 0.375) < 1e-9)
  assert.ok(Math.abs(places[1].place - 0.625) < 1e-9)
})

test("the phrase names the shared step, the gaps and the golden places", () => {
  const reading = readWindow(pair)
  const focus = readFocus(pair, 1)
  assert.ok(focus)
  assert.equal(focus.motion, "slide")
  assert.equal(focus.starMotion, "slide")
  assert.equal(reading.numberCoherence, 1)
  assert.equal(reading.edges.slide, 1)
  assert.match(numberStats(reading), /Moyennes 13,5, 10, 6,5, 10/)

  const numbers = numberPhrase(reading, focus, true)
  assert.match(numbers, /Sur ces 2 tirages, les rangs vont souvent dans le même sens/)
  assert.match(numbers, new RegExp(`loi de l’urne ${comma(numberCoherenceTheory())}`))
  assert.match(numbers, /Dernier profil : écarts 15, 10, 5, 10/)
  assert.match(numbers, /n2 est à 0,38 de l’étendue, proche de 0,382/)
  assert.match(numbers, /n3 est à 0,63 de l’étendue, proche de 0,618/)
  assert.doesNotMatch(numbers, /n4 est à/)
  assert.match(numbers, /Le pas glisse/)

  const stars = starPhrase(reading, focus, true)
  assert.match(stars, /les étoiles vont souvent dans le même sens/)
  assert.match(stars, new RegExp(`loi de l’urne ${comma(starCoherenceTheory())}`))
  assert.match(stars, /Dernier écart : 5, moyenne 4/)
  assert.match(stars, /Le pas glisse/)

  const earlier = readFocus(pair, 0)
  assert.ok(earlier)
  assert.match(numberPhrase(reading, earlier, false), /Profil du 06\/01 : écarts 12, 10, 8, 10/)
  assert.doesNotMatch(numberPhrase(reading, earlier, false), /Le pas/)
})

test("a race cursor keeps the hidden draw out until the cursor moves past it", () => {
  const series = [
    point("2024-06-04", 1, 11, 21, 31, 41, 1, 2),
    point("2025-06-03", 2, 12, 22, 32, 42, 2, 4),
    point("2026-01-02", 3, 13, 23, 33, 43, 3, 6),
    point("2026-01-06", 4, 14, 24, 34, 44, 4, 8),
    point("2026-01-09", 5, 15, 25, 35, 45, 5, 10),
  ]
  const track = buildTrack(series)
  assert.deepEqual(
    track.map((item) => item.date),
    ["2025-06-03", "2026-01-02", "2026-01-06", "2026-01-09"]
  )

  const hidden = layerPoints({ series, track, running: true, cursor: 3 })
  assert.deepEqual(
    hidden.map((item) => item.date),
    ["2025-06-03", "2026-01-02", "2026-01-06"]
  )
  assert.equal(
    hidden.some((item) => item.date === "2026-01-09"),
    false
  )

  const revealed = layerPoints({ series, track, running: true, cursor: 4 })
  assert.equal(revealed.at(-1)?.date, "2026-01-09")

  const idle = layerPoints({ series, track: [], running: false, cursor: null })
  assert.deepEqual(
    idle.map((item) => item.date),
    track.map((item) => item.date)
  )
})

test("without a cursor, a running race keeps the hidden track out", () => {
  const series = [
    point("2025-06-03", 2, 12, 22, 32, 42, 2, 4),
    point("2026-01-02", 3, 13, 23, 33, 43, 3, 6),
    point("2026-01-06", 4, 14, 24, 34, 44, 4, 8),
    point("2026-01-09", 5, 15, 25, 35, 45, 5, 10),
  ]
  const track = buildTrack(series)
  assert.equal(track.length, 4)
  assert.deepEqual(layerPoints({ series, track, running: true, cursor: null }), [])
  assert.deepEqual(layerPoints({ series, track, running: true, cursor: 0 }), [])
  assert.equal(layerPoints({ series, track, running: true, cursor: 2 }).length, 2)
  assert.equal(layerPoints({ series, track, running: false, cursor: null }).length, track.length)
})
