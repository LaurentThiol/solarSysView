import assert from "node:assert/strict"
import test from "node:test"

import { pearson } from "../src/lib/annual-lag.ts"
import { buildTrack, curveValues, type RankPoint } from "../src/lib/run-arcade/curves.ts"
import { promptPast } from "../src/lib/run-arcade/examen.ts"
import {
  fisherZ,
  measuredRelations,
  RELATION_ALPHA,
  RELATION_MIN_PAIRS,
  relationBar,
  strongestRelation,
} from "../src/lib/run-arcade/relation.ts"

/** Générateur à graine fixe : les archives de hasard de ces tests ne changent pas d’une exécution à l’autre. */
function generator(seed: number) {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let mixed = state
    mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1)
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61)
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296
  }
}

function pick(random: () => number, count: number, max: number) {
  const bag = Array.from({ length: max }, (_, index) => index + 1)
  for (let index = 0; index < count; index += 1) {
    const other = index + Math.floor(random() * (bag.length - index))
    ;[bag[index], bag[other]] = [bag[other], bag[index]]
  }
  return bag.slice(0, count).sort((left, right) => left - right)
}

/** Les mardis et vendredis qui suivent `from`, `from` compris. */
function drawDates(count: number, from = "2025-01-03") {
  const dates: string[] = []
  const cursor = new Date(`${from}T12:00:00Z`)
  for (let index = 0; index < count; index += 1) {
    dates.push(cursor.toISOString().slice(0, 10))
    cursor.setUTCDate(cursor.getUTCDate() + (cursor.getUTCDay() === 5 ? 4 : 3))
  }
  return dates
}

/** Cinq numéros sur 50 et deux étoiles sur 12, tirés au hasard : aucune relation à y trouver. */
function randomArchive(length: number, seed: number): RankPoint[] {
  const random = generator(seed)
  return drawDates(length).map((date) => {
    const numbers = pick(random, 5, 50)
    const stars = pick(random, 2, 12)
    return { date, n1: numbers[0], n2: numbers[1], n3: numbers[2], n4: numbers[3], n5: numbers[4], e1: stars[0], e2: stars[1] }
  })
}

/** Un tirage dont seuls n1, n2 et n5 bougent : les autres courbes sont plates, donc sans corrélation. */
function point(date: string, n1: number, n2 = 2, n5 = 8): RankPoint {
  return { date, n1, n2, n3: 4, n4: 6, n5, e1: 1, e2: 2 }
}

function levels(random: () => number, count: number) {
  return Array.from({ length: count }, () => 1 + Math.floor(random() * 50))
}

test("the bar rises with the number of measures, and z compares series of different lengths", () => {
  assert.equal(RELATION_ALPHA, 0.01)
  assert.ok(Math.abs(relationBar(1) - 2.5758) < 0.001)
  assert.ok(Math.abs(relationBar(600) - 4.3054) < 0.005)
  assert.ok(relationBar(1000) > relationBar(600))
  assert.ok(relationBar(600) > relationBar(100))
  assert.ok(Math.abs(fisherZ(0.5, 103) - Math.atanh(0.5) * 10) < 1e-9)
  assert.equal(fisherZ(-0.5, 103), fisherZ(0.5, 103))
  // Un r plus faible sur plus de tirages l’emporte sur un r plus fort sur trois fois moins.
  assert.ok(fisherZ(0.45, 139) > fisherZ(0.7, 36))
  assert.ok(Number.isFinite(fisherZ(1, 50)))
})

test("n2 one draw behind n1 is the relation that is kept, ranked by z", () => {
  const random = generator(5)
  const dates = drawDates(60)
  const n1 = levels(random, 60)
  const past = dates.map((date, index) => point(date, n1[index], index === 0 ? 3 : n1[index - 1]))
  const relations = measuredRelations(past)
  assert.equal(
    relations.some((item) => item.phrase === "Σn et n1, même sens, même pas"),
    false
  )
  assert.equal(strongestRelation(past)?.phrase, "n1 et n2, même sens, n2 en retard d’un pas")
  assert.equal(strongestRelation(past)?.n, 59)
  for (let index = 1; index < relations.length; index += 1) {
    assert.ok(relations[index - 1].score >= relations[index].score)
  }
})

test("tuesday and friday four days apart name the evening gap", () => {
  const random = generator(9)
  const dates = drawDates(80, "2026-01-02")
  const values: number[] = []
  dates.forEach((date, index) => {
    const friday = new Date(`${date}T12:00:00Z`).getUTCDay() === 5
    values.push(friday || index === 0 ? 1 + Math.floor(random() * 50) : values[index - 1])
  })
  const past = dates.map((date, index) => point(date, 1, 2, values[index]))
  const evenings = measuredRelations(past).filter((item) => item.phrase.includes("mardi et vendredi"))
  assert.ok(evenings.some((item) => item.phrase === "n5, mardi et vendredi, écart de 4 jours"))
  assert.equal(
    evenings.some((item) => item.phrase.includes("écart de 3 jours")),
    false
  )
})

test("a copy shifted by about eleven days is kept from one year to the next", () => {
  const random = generator(11)
  const last = drawDates(104, "2025-01-03").filter((date) => date < "2026-01-01")
  const next = drawDates(60, "2026-01-02")
  const before = levels(random, last.length)
  // Trois tirages plus loin dans l’année d’avant : onze jours quand on part d’un vendredi.
  const after = next.map((_, index) => before[index + 3] ?? 25)
  const past = [...last.map((date, index) => point(date, before[index])), ...next.map((date, index) => point(date, after[index]))]
  const years = measuredRelations(past).filter((item) => item.phrase.includes("d’une année sur l’autre"))
  const best = years.find((item) => item.phrase.startsWith("n1, "))
  assert.ok(best)
  assert.match(best.phrase, /même sens, décalage de \d+ jours$/)
  assert.ok(Math.abs(Number(/de (\d+) jours/.exec(best.phrase)?.[1]) - 11) <= 3)
  assert.ok(best.r > 0.99)
})

test("two curves drawn from the same balls make no relation at the same draw", () => {
  const archive = randomArchive(200, 3)
  const columns = (key: "n1" | "n2" | "d0" | "d4" | "sumNumbers" | "e1" | "e2") =>
    archive.map((item) => curveValues(item)[key])
  // Le lien est réel dans les chiffres : il vient du tri des boules, pas du jeu.
  assert.ok(Math.abs(pearson(columns("n1"), columns("d0")) ?? 0) > 0.6)
  assert.ok(Math.abs(pearson(columns("n1"), columns("n2")) ?? 0) > 0.5)
  assert.ok(Math.abs(pearson(columns("sumNumbers"), columns("d4")) ?? 0) > 0.6)
  assert.ok(Math.abs(pearson(columns("e1"), columns("e2")) ?? 0) > 0.4)
  assert.deepEqual(
    measuredRelations(archive).filter((item) => item.phrase.endsWith("même pas")),
    []
  )
})

test("a real link at the same draw gives no phantom delay", () => {
  const archive = randomArchive(140, 7).map((item) => {
    const sum = item.n1 + item.n2 + item.n3 + item.n4 + item.n5
    const e1 = Math.min(11, Math.max(1, Math.round(sum / 21)))
    return { ...item, e1, e2: e1 + 1 }
  })
  const relations = measuredRelations(archive)
  assert.equal(relations[0]?.phrase, "Σn et e1, même sens, même pas")
  assert.ok(relations.length > 3)
  // Les pas d’une série tirée au hasard se lient au pas d’avant : comparés, ils inventaient des retards.
  assert.deepEqual(
    relations.filter((item) => item.phrase.includes("en retard")),
    []
  )
})

test("a flat series, or a series too short to measure, has no relation", () => {
  const flat = drawDates(40).map((date) => point(date, 4, 7))
  assert.equal(strongestRelation(flat), null)
  const short = drawDates(RELATION_MIN_PAIRS - 2).map((date, index) => point(date, 1 + (index % 7), 1 + ((index + 6) % 7)))
  assert.equal(strongestRelation(short), null)
  assert.equal(strongestRelation([]), null)
})

test("fifty random archives: fewer than 5 % find a relation", () => {
  let found = 0
  for (let seed = 1; seed <= 50; seed += 1) {
    const track = buildTrack(randomArchive(190, seed))
    // Le passé que lit le prompt : sans les 25 tirages de course ni les 25 de l’examen.
    const past = promptPast(track.slice(0, track.length - 25))
    assert.equal(past.length, 140)
    if (strongestRelation(past)) found += 1
  }
  assert.ok(found / 50 < 0.05, `${found} archives sur 50`)
})
