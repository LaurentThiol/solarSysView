import assert from "node:assert/strict"
import test from "node:test"

import { curveValues, type RankPoint } from "../src/lib/run-arcade/curves.ts"
import { buildPrompt } from "../src/lib/run-arcade/prompt.ts"
import { describeSkill, newSkill, parseSkillParams, type SkillParams } from "../src/lib/run-arcade/skills.ts"
import {
  daysBetween,
  eveningToPlay,
  EVENING_GAP_DAYS,
  formatOrder,
  fundamentalPeriod,
  otherEvening,
  phaseDays,
  phaseLink,
  sharedHarmonic,
  soirReading,
  weekdayOf,
  type Evening,
  type SoirPoint,
} from "../src/lib/run-arcade/soir.ts"
import { createMinds, think, type RunnerMind } from "../src/lib/run-arcade/thought.ts"

function draw(date: string, n5: number): RankPoint {
  return { date, n1: 3, n2: 11, n3: 21, n4: 31, n5, e1: 2, e2: 8 }
}

const soir: SkillParams = { curve: "*", gesture: "soir", ratio: 0.618, span: "pas", window: 3, days: null }

function mind(): RunnerMind {
  return {
    id: "r1",
    name: "R1",
    focus: "n5",
    skills: [newSkill("r1-base", "Soir", soir, { cutoff: "", origin: "maison", examCents: null })],
  }
}

test("friday copies the tuesday three days earlier, plus that tuesday’s step", () => {
  assert.equal(weekdayOf("2026-06-05"), "vendredi")
  assert.equal(weekdayOf("2026-06-02"), "mardi")
  const past = [draw("2026-05-26", 40), draw("2026-05-29", 33), draw("2026-06-02", 44)]
  const rows = past.map(curveValues)
  const reading = soirReading(past, rows, "n5", "2026-06-05")
  assert.equal(reading.evening, "vendredi")
  assert.equal(reading.other, "mardi")
  assert.equal(reading.days, 3)
  assert.equal(reading.tip, 48)
  const mixed = 44 + (44 - 33)
  assert.notEqual(reading.tip, mixed)

  const thought = think(mind(), past, { hiddenDate: "2026-06-05" })
  assert.equal(thought.tips.n5, 48)
  assert.equal(thought.draw.vector.y2, 48)
  const phrase = thought.draw.phrase
  assert.match(phrase, /vendredi suit le mardi à 3 jours/)
  assert.equal(thought.draw.lecture.masque, "correspond")
  assert.ok(phrase.indexOf("vendredi suit le mardi") < phrase.indexOf("projection"))
  if (thought.draw.recall) {
    assert.match(phrase, /ramenée par les totales/)
    assert.ok(phrase.indexOf("projection") < phrase.indexOf("ramenée"))
  }
})

test("tuesday copies the friday four days earlier, plus that friday’s step", () => {
  assert.equal(weekdayOf("2026-06-09"), "mardi")
  assert.equal(weekdayOf("2026-06-05"), "vendredi")
  const past = [draw("2026-05-29", 36), draw("2026-06-02", 40), draw("2026-06-05", 42)]
  const reading = soirReading(past, past.map(curveValues), "n5", "2026-06-09")
  assert.equal(reading.evening, "mardi")
  assert.equal(reading.other, "vendredi")
  assert.equal(reading.days, 4)
  assert.equal(reading.tip, 48)
  const thought = think(mind(), past, { hiddenDate: "2026-06-09" })
  assert.match(thought.draw.phrase, /mardi suit le vendredi à 4 jours/)
  assert.equal(thought.draw.vector.y2, 48)
})

test("the day after a tuesday still plays the friday aligned three days from that tuesday", () => {
  const past = [draw("2026-05-26", 40), draw("2026-06-02", 44)]
  const reading = soirReading(past, past.map(curveValues), "n5", "2026-06-03")
  assert.equal(weekdayOf("2026-06-03"), null)
  assert.equal(reading.evening, "vendredi")
  assert.equal(reading.days, 3)
  assert.equal(reading.tip, 48)
})

test("without a counterpart within four days the tip repeats the same evening’s step", () => {
  const past = [
    draw("2026-05-12", 30),
    draw("2026-05-15", 34),
    draw("2026-05-19", 33),
    draw("2026-05-22", 38),
  ]
  const reading = soirReading(past, past.map(curveValues), "n5", "2026-06-05")
  assert.equal(reading.days, null)
  assert.equal(reading.evening, "vendredi")
  assert.equal(reading.tip, 42)
  const thought = think(mind(), past, { hiddenDate: "2026-06-05" })
  assert.match(thought.draw.phrase, /reprend le pas du vendredi/)
  assert.equal(thought.draw.lecture.masque, "ecarte")
})

test("the tip follows the phase, not a closer evening at the wrong lag", () => {
  const past = [
    draw("2026-05-08", 40),
    draw("2026-05-12", 40),
    draw("2026-05-15", 42),
    draw("2026-05-19", 42),
    draw("2026-05-22", 44),
    draw("2026-05-26", 44),
    draw("2026-05-29", 46),
    draw("2026-06-02", 46),
    draw("2026-06-05", 48),
    draw("2026-06-12", 50),
  ]
  const fridays: SoirPoint[] = [
    { date: "2026-05-08", evening: "vendredi", value: 40 },
    { date: "2026-05-15", evening: "vendredi", value: 42 },
    { date: "2026-05-22", evening: "vendredi", value: 44 },
    { date: "2026-05-29", evening: "vendredi", value: 46 },
    { date: "2026-06-05", evening: "vendredi", value: 48 },
  ]
  const tuesdays: SoirPoint[] = [
    { date: "2026-05-12", evening: "mardi", value: 40 },
    { date: "2026-05-19", evening: "mardi", value: 42 },
    { date: "2026-05-26", evening: "mardi", value: 44 },
    { date: "2026-06-02", evening: "mardi", value: 46 },
  ]
  assert.equal(phaseDays(tuesdays, fridays), 4)
  const reading = soirReading(past, past.map(curveValues), "n5", "2026-06-09")
  assert.equal(reading.days, 4)
  assert.equal(reading.tip, 50)
  assert.match(think(mind(), past, { hiddenDate: "2026-06-09" }).draw.phrase, /à 4 jours/)
})

test("a period of two mixed draws is the week, not a fundamental", () => {
  const week = [1, 10, 1, 10, 1, 10, 1, 10, 1, 10]
  assert.equal(fundamentalPeriod(week, false), null)
  assert.equal(fundamentalPeriod(week, true), 2)
  assert.equal(fundamentalPeriod([1, 2, 4, 1, 2, 4, 1, 2, 4, 1, 2, 4], false), 3)
})

test("a harmonic is kept only when both evenings carry it", () => {
  const period = (step: number, length: number) => Array.from({ length }, (_, index) => (index % step) + 1)
  const four = Array.from({ length: 16 }, (_, index) => [10, 20, 15, 30][index % 4])
  const two = period(2, 16)
  const six = Array.from({ length: 24 }, (_, index) => [1, 2, 4, 8, 3, 6][index % 6])
  const five = Array.from({ length: 20 }, (_, index) => [1, 3, 8, 2, 6][index % 5])
  const seven = Array.from({ length: 28 }, (_, index) => [1, 4, 9, 2, 8, 3, 6][index % 7])
  assert.deepEqual(sharedHarmonic(four, four), { period: 4, order: 1 })
  assert.deepEqual(sharedHarmonic(four, two), { period: 2, order: 2 })
  assert.equal(sharedHarmonic(two, six).order, 1 / 3)
  assert.deepEqual(sharedHarmonic(five, Array.from({ length: 12 }, () => 5)), { period: null, order: null })
  assert.deepEqual(sharedHarmonic(seven, five), { period: null, order: null })
  assert.equal(formatOrder(1 / 3), "1/3")
  assert.equal(formatOrder(1 / 2), "1/2")
  assert.equal(formatOrder(2), "2")
})

test("soir is a gesture the runners and the local model can name", () => {
  assert.equal(
    describeSkill(soir),
    "toutes les courbes suit l’autre soir, à 4 jours au plus."
  )
  assert.equal(parseSkillParams({ curve: "n5", gesture: "soir" })?.gesture, "soir")
  const gestures = createMinds(17).map((runner) => runner.skills[0].versions[0].gesture)
  assert.equal(gestures.filter((gesture) => gesture === "soir").length, 1)
  assert.equal(gestures[16], "soir")
  const past = [draw("2026-05-26", 40), draw("2026-06-02", 44)]
  const prompt = buildPrompt({
    mind: mind(),
    past,
    hiddenDate: "2026-06-05",
    examCents: null,
    notes: [],
    drawing: null,
  })
  assert.equal(JSON.stringify(prompt).includes('"soir"') || JSON.stringify(prompt).includes("soir"), true)
})

function lcg(seed: number) {
  let state = seed >>> 0
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    return state / 4294967296
  }
}

function referencePearson(left: readonly number[], right: readonly number[]) {
  const count = Math.min(left.length, right.length)
  if (count < 3) return null
  const meanLeft = left.slice(0, count).reduce((total, value) => total + value, 0) / count
  const meanRight = right.slice(0, count).reduce((total, value) => total + value, 0) / count
  let num = 0
  let leftSq = 0
  let rightSq = 0
  for (let index = 0; index < count; index += 1) {
    const a = left[index] - meanLeft
    const b = right[index] - meanRight
    num += a * b
    leftSq += a * a
    rightSq += b * b
  }
  if (leftSq === 0 || rightSq === 0) return null
  return num / Math.sqrt(leftSq * rightSq)
}

/** Lecture d’origine : chaque vis-à-vis se cherche en parcourant l’autre soir, avec deux `Date.parse` par comparaison. */
function referenceLink(play: readonly SoirPoint[], other: readonly SoirPoint[]) {
  let bestLag: number | null = null
  let best = 0
  let bestR = 0
  for (let lag = 1; lag <= EVENING_GAP_DAYS; lag += 1) {
    const left: number[] = []
    const right: number[] = []
    for (const point of play) {
      const match = other.find((item) => daysBetween(point.date, item.date) === lag)
      if (!match) continue
      left.push(point.value)
      right.push(match.value)
    }
    const score = referencePearson(left, right)
    if (score == null || Math.abs(score) <= best) continue
    best = Math.abs(score)
    bestLag = lag
    bestR = score
  }
  return bestLag == null ? null : { days: bestLag, r: bestR }
}

function referenceReading(
  past: readonly RankPoint[],
  rows: readonly ReturnType<typeof curveValues>[],
  key: "n5",
  hiddenDate: string
) {
  const lastDate = past.reduce((latest, point) => (point.date > latest ? point.date : latest), "")
  const evening = eveningToPlay(lastDate, hiddenDate)
  const other = otherEvening(evening)
  const sides: Record<Evening, SoirPoint[]> = { mardi: [], vendredi: [] }
  const ordered = past
    .map((point, index) => ({ point, value: rows[index][key] }))
    .sort((a, b) => a.point.date.localeCompare(b.point.date))
  for (const item of ordered) {
    const side = weekdayOf(item.point.date)
    if (side) sides[side].push({ date: item.point.date, evening: side, value: item.value })
  }
  const playSeries = sides[evening]
  const otherSeries = sides[other]
  const target = hiddenDate
  let match: SoirPoint | null = null
  let days: number | null = null
  let nearest = EVENING_GAP_DAYS + 1
  for (const point of otherSeries) {
    const gap = Math.abs(daysBetween(target, point.date))
    if (gap <= EVENING_GAP_DAYS && gap < nearest) {
      match = point
      days = gap
      nearest = gap
    }
  }
  const aligned = referenceLink(playSeries, otherSeries)?.days ?? null
  if (aligned != null && match) {
    const phased = otherSeries.find((point) => Math.abs(daysBetween(target, point.date)) === aligned)
    if (phased) {
      match = phased
      days = aligned
    }
  }
  const stepTip = (series: readonly SoirPoint[], index: number) =>
    series[index].value + (series[index].value - (index > 0 ? series[index - 1].value : series[index].value))
  const sameStep = playSeries.length > 0 ? stepTip(playSeries, playSeries.length - 1) : null
  const tip = match ? stepTip(otherSeries, otherSeries.indexOf(match)) : (sameStep ?? rows[rows.length - 1][key])
  return { evening, other: match ? other : evening, days: match ? days : null, tip }
}

test("the day-indexed phase link gives the same lag and r as the search in the other evening", () => {
  const random = lcg(21)
  for (let round = 0; round < 400; round += 1) {
    const stamp = (day: number) => new Date(Date.UTC(2026, 0, 1 + day, 12)).toISOString().slice(0, 10)
    const play: SoirPoint[] = Array.from({ length: 3 + Math.floor(random() * 40) }, () => ({
      date: stamp(Math.floor(random() * 120)),
      evening: "vendredi" as const,
      value: Math.floor(random() * 50),
    }))
    const other: SoirPoint[] = Array.from({ length: 3 + Math.floor(random() * 40) }, () => ({
      date: stamp(Math.floor(random() * 120)),
      evening: "mardi" as const,
      value: Math.floor(random() * 50),
    }))
    assert.deepEqual(phaseLink(play, other), referenceLink(play, other), `tour ${round}`)
    assert.equal(phaseDays(play, other), referenceLink(play, other)?.days ?? null)
  }
  assert.equal(phaseLink([], []), null)
})

test("a reading on random archives equals the one that walks the other evening, and carries no harmonic", () => {
  const random = lcg(5)
  for (let round = 0; round < 120; round += 1) {
    const length = 30 + Math.floor(random() * 90)
    const start = new Date(Date.UTC(2025, 0, 1 + Math.floor(random() * 60), 12))
    const past: RankPoint[] = []
    for (let day = new Date(start); past.length < length; day = new Date(day.getTime() + 86_400_000)) {
      const weekday = day.getUTCDay()
      if ((weekday === 2 || weekday === 5) && random() > 0.08) {
        past.push(draw(day.toISOString().slice(0, 10), 1 + Math.floor(random() * 50)))
      }
    }
    const rows = past.map(curveValues)
    const last = Date.parse(`${past[past.length - 1].date}T12:00:00Z`)
    const gap = (weekdayOf(past[past.length - 1].date) === "mardi" ? 3 : 4) + (random() < 0.2 ? 7 : 0)
    const hiddenDate = new Date(last + gap * 86_400_000).toISOString().slice(0, 10)
    const read = soirReading(past, rows, "n5", hiddenDate)
    assert.deepEqual(read, referenceReading(past, rows, "n5", hiddenDate), `tour ${round}`)
    assert.equal("period" in read || "order" in read, false)
  }
})
