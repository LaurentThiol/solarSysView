import assert from "node:assert/strict"
import test from "node:test"

import {
  championRecord,
  childrenOf,
  parseChampion,
  pickChampion,
  proposeNextDraw,
  setAsideCount,
} from "../src/lib/run-arcade/champion.ts"
import { decadeProfile, fitProfileToSum, placeStars, reconcile, sumRange } from "../src/lib/run-arcade/coherence.ts"
import { buildTrack, curveValues, CURVE_KEYS, type CurveValues } from "../src/lib/run-arcade/curves.ts"
import { EXAM_WINDOW, examine, examStart, passesExam, promptPast } from "../src/lib/run-arcade/examen.ts"
import { buildPrompt, parseAction } from "../src/lib/run-arcade/prompt.ts"
import {
  activeVersion,
  addVersion,
  auditCutoffs,
  newSkill,
  parseSkillParams,
  rollBack,
  type SkillParams,
} from "../src/lib/run-arcade/skills.ts"
import {
  GOLDEN_RATIOS,
  START_CENTS,
  TICKET_CENTS,
  countHits,
  createMinds,
  createRace,
  goldenAim,
  goldenLevel,
  newRunner,
  playTurn,
  revealedPast,
  settlePurse,
  think,
  type RankPoint,
  type RunnerMind,
} from "../src/lib/run-arcade/thought.ts"

function dateAt(index: number) {
  const date = new Date(Date.UTC(2025, 0, 3 + index * 3, 12))
  return date.toISOString().slice(0, 10)
}

function point(index: number): RankPoint {
  return {
    date: dateAt(index),
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

const glide: SkillParams = { curve: "*", gesture: "glisse", ratio: 0.618, span: "bande", window: 8, days: null }

function mindWith(params: SkillParams, focus: RunnerMind["focus"] = "n5"): RunnerMind {
  return {
    id: "r1",
    name: "R1",
    focus,
    skills: [newSkill("r1-base", "Base", params, { cutoff: "", origin: "maison", examCents: null })],
  }
}

const mind = mindWith(glide)

test("golden ratios land on five distinct levels", () => {
  const levels = GOLDEN_RATIOS.map((ratio) => goldenLevel(1, 46, ratio))
  assert.equal(new Set(levels.map((level) => level.toFixed(4))).size, 5)
  assert.ok(Math.abs(goldenLevel(0, 10, 0.618) - 6.18) < 1e-9)
  assert.ok(Math.abs(goldenLevel(0, 10, 1.618) - 16.18) < 1e-9)
  assert.ok(Math.abs(goldenAim(0, 10, 1.618) - 6.18) < 1e-9)
  assert.ok(Math.abs(goldenAim(0, 10, 2.618) - 6.18) < 1e-9)
})

test("curves add the two sums and five decade counts", () => {
  const values = curveValues({ date: "2026-01-02", n1: 3, n2: 14, n3: 15, n4: 33, n5: 50, e1: 2, e2: 11 })
  assert.equal(values.sumNumbers, 115)
  assert.equal(values.sumStars, 13)
  assert.deepEqual([values.d0, values.d1, values.d2, values.d3, values.d4], [1, 2, 0, 1, 1])
  assert.equal(CURVE_KEYS[0], "sumNumbers")
  assert.equal(CURVE_KEYS[1], "sumStars")
})

test("the track keeps calendar years n−1 and n", () => {
  const rows: RankPoint[] = [
    { ...point(0), date: "2024-12-31" },
    { ...point(1), date: "2025-01-03" },
    { ...point(2), date: "2026-10-27" },
  ]
  assert.deepEqual(
    buildTrack(rows).map((row) => row.date),
    ["2025-01-03", "2026-10-27"]
  )
})

test("the sum wins over the decade, the decade over the ranks", () => {
  assert.deepEqual(decadeProfile([2.6, 1.2, 0.7, 0.4, 0.1], [1, 1, 1, 1, 1]).reduce((a, b) => a + b, 0), 5)
  const crowded = [5, 0, 0, 0, 0]
  assert.deepEqual(sumRange(crowded), { min: 15, max: 40 })
  const fitted = fitProfileToSum(crowded, 150)
  const range = sumRange(fitted)
  assert.ok(range.min <= 150 && range.max >= 150)
  assert.equal(fitted.reduce((a, b) => a + b, 0), 5)

  for (let seed = 0; seed < 200; seed += 1) {
    const tips = {} as CurveValues
    for (const key of CURVE_KEYS) tips[key] = ((seed * 37 + key.length * 11) % 97) - 20
    tips.sumNumbers = 15 + ((seed * 53) % 226)
    tips.sumStars = 3 + ((seed * 7) % 21)
    const out = reconcile(tips, [1, 1, 1, 1, 1])
    const numbers = out.numbers
    assert.equal(numbers.length, 5)
    assert.deepEqual(numbers, [...numbers].sort((a, b) => a - b))
    assert.equal(new Set(numbers).size, 5)
    assert.ok(numbers.every((value) => value >= 1 && value <= 50))
    assert.equal(numbers.reduce((a, b) => a + b, 0), out.cases.sumNumbers)
    const decades = [out.cases.d0, out.cases.d1, out.cases.d2, out.cases.d3, out.cases.d4]
    assert.equal(decades.reduce((a, b) => a + b, 0), 5)
    const counted = [0, 0, 0, 0, 0]
    for (const value of numbers) counted[Math.min(4, Math.floor((value - 1) / 10))] += 1
    assert.deepEqual(counted, decades)
    assert.ok(out.stars[0] < out.stars[1] && out.stars[1] <= 12 && out.stars[0] >= 1)
    assert.equal(out.stars[0] + out.stars[1], out.cases.sumStars)
  }
  assert.deepEqual(placeStars([4, 9], 13), [4, 9])
  assert.deepEqual(placeStars([4, 9], 3), [1, 2])
})

test("a number or a star pays 2 € wherever its rank", () => {
  const actual: RankPoint = { date: "2026-02-03", n1: 5, n2: 12, n3: 17, n4: 30, n5: 44, e1: 3, e2: 9 }
  assert.equal(countHits({ n1: 12, n2: 17, n3: 20, n4: 30, n5: 49, e1: 9, e2: 11 }, actual), 4)
  assert.equal(countHits({ n1: 3, n2: 8, n3: 20, n4: 31, n5: 49, e1: 1, e2: 2 }, actual), 0)
  assert.equal(countHits({ n1: 1, n2: 2, n3: 4, n4: 6, n5: 7, e1: 3, e2: 4 }, actual), 1)
  assert.equal(settlePurse(START_CENTS, 4), START_CENTS - TICKET_CENTS + 4 * 200)
  let cents = START_CENTS
  let turns = 0
  while (cents >= TICKET_CENTS) {
    cents = settlePurse(cents, 0)
    turns += 1
  }
  assert.equal(turns, 20)
  assert.equal(cents, 0)
})

test("the hidden draw and the draws after it stay out of the thought", () => {
  const rows = series(12)
  const hidden = { date: "2099-01-01", n1: 9, n2: 19, n3: 29, n4: 39, n5: 49, e1: 8, e2: 11 }
  const later = { date: "2099-06-01", n1: 8, n2: 18, n3: 28, n4: 38, n5: 48, e1: 6, e2: 10 }
  rows[8] = hidden
  rows[9] = later
  const race = createRace(12, rows.length, 4)
  assert.equal(race.cursor, 8)
  const past = revealedPast(rows, race.cursor)
  assert.equal(past.length, 8)
  assert.notEqual(past[past.length - 1], rows[7])
  const played = playTurn(race, rows)
  assert.equal(played.seenDate, rows[7].date)
  assert.equal(played.revealed?.date, hidden.date)
  const swapped = rows.map((row) => ({ ...row }))
  swapped[8] = { ...hidden, date: "2099-02-01", n1: 1, n5: 5 }
  swapped[9] = { ...later, n3: 3 }
  const other = playTurn(createRace(12, swapped.length, 4), swapped)
  for (const runner of played.runners) {
    const thought = runner.thought
    assert.ok(thought)
    assert.equal(JSON.stringify(thought).includes("2099"), false)
    assert.equal(thought.seenDate, rows[7].date)
    assert.equal(thought.trail[thought.trail.length - 1].y, curveValues(rows[7])[runner.mind.focus])
    const twin = other.runners.find((item) => item.mind.id === runner.mind.id)
    assert.deepEqual(runner.guess, twin?.guess)
  }
  assert.equal(other.revealed?.date, "2099-02-01")
})

test("the vector is the thought, the projection is the case after the totals", () => {
  const past = series(8)
  const first = think(mind, past)
  const withFuture = series(9)
  withFuture[8] = { ...withFuture[8], n5: 5, n1: 1 }
  assert.deepEqual(think(mind, withFuture.slice(0, 8)).guess, first.guess)
  const delta = past[7].n5 - past[6].n5
  const slope = (first.draw.tangent.y2 - first.draw.tangent.y1) / (first.draw.tangent.x2 - first.draw.tangent.x1)
  assert.ok(Math.abs(slope - delta) < 1e-9)
  assert.equal(first.draw.vector.y2, first.tips.n5)
  assert.equal(first.draw.projection.y, first.cases.n5)
  assert.equal(first.draw.projection.y, first.guess.n5)
  if (Math.abs(first.cases.n5 - first.tips.n5) >= 0.5) assert.ok(first.draw.recall)
  else assert.equal(first.draw.recall, null)
  assert.equal(first.draw.marks.length, 14)
  assert.match(first.draw.phrase, /tangente/)
  assert.match(first.draw.phrase, /rayon/)
  assert.match(first.draw.phrase, /vecteur/)
  assert.match(first.draw.phrase, /projection/)
  const sums = think(mindWith(glide, "sumNumbers"), past)
  assert.equal(sums.draw.focus, "sumNumbers")
  assert.equal(sums.draw.projection.y, sums.cases.sumNumbers)
})

test("a turn settles the draw at the cursor and leaves the rest unseen", () => {
  const rows = series(12)
  const race = createRace(4, rows.length, 4)
  assert.equal(race.cursor, 8)
  const played = playTurn(race, rows)
  assert.equal(played.revealed?.date, rows[8].date)
  assert.equal(played.cursor, 9)
  const alone = think(race.runners[0].mind, rows.slice(0, 8), { hiddenDate: rows[8].date })
  assert.deepEqual(played.runners[0].guess, alone.guess)
  assert.equal(played.runners[0].lastHits, countHits(alone.guess, rows[8]))
  assert.equal(createMinds(80).length, 50)
})

test("the first sixteen runners start from sixteen different gestures", () => {
  const params = createMinds(16).map((runner) => {
    const { curve, gesture, ratio, span, window, days } = runner.skills[0].versions[0]
    return JSON.stringify({ curve, gesture, ratio, span, window, days })
  })
  assert.equal(new Set(params).size, 16)
  const plain = createMinds(16)
    .map((runner) => runner.skills[0].versions[0].gesture)
    .filter((gesture) => gesture === "persiste" || gesture === "glisse" || gesture === "miroir")
  assert.equal(new Set(plain).size, plain.length)
})

test("a version written on or after the hidden draw does not play it", () => {
  const rows = series(30)
  const hiddenDate = rows[20].date
  const base = newSkill("r1-base", "Base", glide, { cutoff: "", origin: "maison", examCents: null })
  const late = addVersion(base, { ...glide, gesture: "miroir" }, { cutoff: hiddenDate, origin: "ia", examCents: null })
  assert.equal(activeVersion(late, hiddenDate)?.version, 1)
  assert.equal(activeVersion(late, rows[21].date)?.version, 2)
  const withLate = { ...mind, skills: [late] }
  const past = rows.slice(0, 20)
  assert.deepEqual(think(withLate, past, { hiddenDate }).guess, think(mind, past, { hiddenDate }).guess)
  assert.equal(auditCutoffs([late], hiddenDate).length, 1)
  assert.equal(rollBack([late], hiddenDate)[0].versions.length, 1)
})

test("the exam replays draws the prompt does not read, and keeps a skill only if it rises", () => {
  const rows = series(60)
  assert.equal(examStart(rows.length), 60 - EXAM_WINDOW)
  const read = promptPast(rows)
  assert.equal(read.length, 60 - EXAM_WINDOW)
  const result = examine(mind, rows)
  assert.ok(result.turns <= EXAM_WINDOW && result.turns > 0)
  assert.equal(result.from, rows[60 - EXAM_WINDOW].date)
  assert.equal(passesExam({ ...result }, result), false)
  assert.equal(passesExam({ ...result, cents: result.cents + 1 }, result), true)
  const prompt = buildPrompt({ mind, past: read, hiddenDate: "2099-01-01", examCents: result.cents, notes: [], drawing: null })
  const blob = JSON.stringify(prompt)
  for (const row of rows.slice(60 - EXAM_WINDOW)) assert.equal(blob.includes(row.date), false)
  assert.ok(blob.includes(read[read.length - 1].date))
})

test("the champion is the race balance, then the exam, then the fewest calls", () => {
  const minds = createMinds(4)
  const runners = minds.map(newRunner)
  runners[0] = { ...runners[0], cents: 4000, examCents: 3000, calls: 9 }
  runners[1] = { ...runners[1], cents: 5200, examCents: 2000, calls: 9 }
  runners[2] = { ...runners[2], cents: 5200, examCents: 2500, calls: 12 }
  runners[3] = { ...runners[3], cents: 5200, examCents: 2500, calls: 4 }
  assert.equal(pickChampion(runners)?.mind.id, "r4")
})

test("a generation is a launch: children inherit the versions written before the hidden draw", () => {
  const base = newSkill("r2-base", "Base", glide, { cutoff: "", origin: "maison", examCents: null })
  const early = addVersion(base, { ...glide, window: 5 }, { cutoff: "2026-05-01", origin: "ia", examCents: 4800 })
  const late = addVersion(early, { ...glide, window: 3 }, { cutoff: "2026-09-01", origin: "ia", examCents: 5100 })
  const winner = { ...newRunner({ id: "r2", name: "R2", focus: "n1", skills: [late] }), cents: 6100 }
  const record = championRecord({
    runner: winner,
    generation: 1,
    raceFrom: "2026-08-01",
    raceTo: "2026-10-27",
    journal: [],
    savedAt: "2026-10-30T09:00:00.000Z",
  })
  const reread = parseChampion(JSON.parse(JSON.stringify(record)))
  assert.ok(reread)
  assert.equal(setAsideCount(reread, "2026-08-04"), 1)
  const children = childrenOf(reread, 3, "2026-08-04")
  assert.equal(children.length, 3)
  for (const child of children) {
    assert.equal(child.skills[0].versions.length, 2)
    assert.equal(child.skills[0].versions[1].window, 5)
  }
  assert.equal(parseChampion({ generation: 0, cents: 1, skills: [] }), null)
})

test("the champion proposes the draw after the last one in the archive", () => {
  const rows = series(12)
  const record = championRecord({
    runner: { ...newRunner(mind), cents: 5400, examCents: 5100 },
    generation: 2,
    raceFrom: rows[8].date,
    raceTo: rows[11].date,
    journal: [],
    savedAt: "2026-10-30T12:00:00.000Z",
  })
  const proposal = proposeNextDraw(record, rows)
  assert.ok(proposal)
  assert.equal(proposal.draw.seenDate, rows[11].date)
  assert.deepEqual(proposal.guess, think(mind, rows, { hiddenDate: "2099-01-01" }).guess)
  assert.equal(JSON.stringify(proposal).includes("2099"), false)
  const late = addVersion(record.skills[0], { ...glide, gesture: "persiste" }, {
    cutoff: "2099-01-01",
    origin: "ia",
    examCents: null,
  })
  const held = proposeNextDraw({ ...record, skills: [late] }, rows)
  assert.deepEqual(held?.guess, proposal.guess)
  const otherCurve = proposeNextDraw(record, rows, "n3")
  assert.equal(otherCurve?.draw.focus, "n3")
  assert.deepEqual(otherCurve?.guess, proposal.guess)
})

test("an IA answer is one JSON action with known fields", () => {
  const skill = parseAction(
    'Voici : {"action":"skill","name":"Somme lente","phrase":"Σn rejoint sa moyenne","curve":"sumNumbers","gesture":"moyenne","ratio":0.6,"span":"bande","window":10,"days":60} merci'
  )
  assert.ok(skill && skill.kind === "skill")
  assert.equal(skill.params.curve, "sumNumbers")
  assert.equal(skill.params.ratio, 0.618)
  assert.equal(skill.params.days, 60)
  const brave = parseAction('{"action":"brave","query":"nombre d’or et séries temporelles"}')
  assert.deepEqual(brave, { kind: "brave", query: "nombre d’or et séries temporelles" })
  assert.equal(parseAction('{"action":"skill","curve":"n9","gesture":"glisse"}'), null)
  assert.equal(parseAction("pas de json"), null)
  assert.equal(parseSkillParams({ curve: "d2", gesture: "or", ratio: 1.6, window: 400 }), null)
  assert.deepEqual(parseSkillParams({ curve: "d2", gesture: "or", ratio: 1.6 }), {
    curve: "d2",
    gesture: "or",
    ratio: 1.618,
    span: "bande",
    window: 8,
    days: null,
  })
})
