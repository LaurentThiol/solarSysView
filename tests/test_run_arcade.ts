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
import { placeStars, reconcile } from "../src/lib/run-arcade/coherence.ts"
import { buildTrack, curveValues, CURVE_KEYS, type CurveValues } from "../src/lib/run-arcade/curves.ts"
import { EXAM_WINDOW, examine, examStart, passesExam, promptPast } from "../src/lib/run-arcade/examen.ts"
import { BRAVE_EXAMPLE, buildPrompt, lectureFromText, lectureRefusal, parseAction, SKILL_EXAMPLE } from "../src/lib/run-arcade/prompt.ts"
import {
  activeVersion,
  addVersion,
  auditCutoffs,
  describeSkill,
  houseVariation,
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
  drawingText,
  formatObservationDate,
  goldenAim,
  goldenLevel,
  newRunner,
  noteObservation,
  noteRace,
  observationReport,
  playTurn,
  previewTurn,
  revealedPast,
  settlePurse,
  think,
  tipFor,
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

test("the sum wins, and the ranks stay near the thoughts instead of the decade edges", () => {
  for (let seed = 0; seed < 200; seed += 1) {
    const tips = {} as CurveValues
    for (const key of CURVE_KEYS) tips[key] = ((seed * 37 + key.length * 11) % 97) - 20
    tips.sumNumbers = 15 + ((seed * 53) % 226)
    tips.sumStars = 3 + ((seed * 7) % 21)
    const out = reconcile(tips)
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

test("n1 to n5 are not pinned to 10, 20, 30, 40 or 50", () => {
  const flat = {} as CurveValues
  for (const key of CURVE_KEYS) flat[key] = 1
  flat.sumNumbers = 140
  flat.sumStars = 15
  flat.n1 = 12.4
  flat.n2 = 21.8
  flat.n3 = 31.2
  flat.n4 = 35.6
  flat.n5 = 44.1
  assert.deepEqual(reconcile(flat).numbers, [11, 21, 30, 35, 43])

  const shared = { ...flat, n1: 35.6, n2: 35.6, n3: 35.6, n4: 35.6, n5: 35.6 }
  assert.deepEqual(reconcile(shared).numbers, [26, 27, 28, 29, 30])
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

test("lignes reads each rank on its own window, not the whole grid", () => {
  const past = series(8)
  const params: SkillParams = { curve: "*", gesture: "or", ratio: 0.382, span: "lignes", window: 8, days: null }
  const thought = think(mindWith(params, "n1"), past)
  assert.ok(thought.tips.n1 < 10)
  assert.ok(thought.tips.n5 > 30)
  assert.ok(thought.guess.n1 < 15)
  assert.ok(thought.guess.n5 > 30)
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
  assert.deepEqual(brave, { kind: "brave" })
  assert.equal(parseAction('{"action":"brave"}')?.kind, "brave")
  assert.equal(parseAction('{"action":"skill","curve":"n9","gesture":"glisse"}'), null)
  assert.equal(parseAction("pas de json"), null)
  const copied = parseAction(
    '{"action":"skill","name":"x","phrase":"y","curve":"sumNumbers|n1|*","gesture":"persiste|glisse","ratio":"0.382|0.618","span":"bande|lignes","window":"3|5|10 ou 2 à 60","days":"null ou 30|60"}'
  )
  assert.ok(copied && copied.kind === "skill")
  if (copied && copied.kind === "skill") {
    assert.equal(copied.params.curve, "sumNumbers")
    assert.equal(copied.params.gesture, "persiste")
    assert.equal(copied.params.ratio, 0.382)
    assert.equal(copied.params.span, "bande")
    assert.equal(copied.params.window, 3)
    assert.equal(copied.params.days, 30)
  }
  assert.equal(parseAction(JSON.stringify(SKILL_EXAMPLE))?.kind, "skill")
  assert.equal(parseAction(JSON.stringify(BRAVE_EXAMPLE))?.kind, "brave")
  const sample = buildPrompt({
    mind,
    past: series(4),
    hiddenDate: "2099-01-01",
    examCents: null,
    notes: [],
    drawing: null,
  })
  assert.ok(sample.system.includes(JSON.stringify(SKILL_EXAMPLE)))
  assert.equal(sample.system.includes("|"), false)
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

function withN1(values: number[]) {
  return values.map((n1, index) => ({ ...point(index), n1 }))
}

test("the drawn trail is the whole revealed series, and the mask is the skill window", () => {
  const past = series(12)
  const draw = think(mindWith({ ...glide, curve: "n5", window: 3 }, "n5"), past).draw
  assert.equal(draw.trail.length, past.length)
  assert.equal(draw.trail[0].x, 0)
  assert.equal(draw.trail[draw.trail.length - 1].x, past.length - 1)
  assert.equal(draw.trail[draw.trail.length - 1].y, curveValues(past[11]).n5)
  assert.equal(draw.masks.length, 1)
  assert.equal(draw.masks[0].x2 - draw.masks[0].x1 + 1, 3)
  assert.equal(draw.masks[0].drives, true)
  assert.match(draw.observation, /n5 · glisse · 3 tirages · tangente (correspond|s’écarte), masque (correspond|s’écarte), cercle (correspond|s’écarte), pas (correspond|s’écarte), vecteur (correspond|s’écarte)/)
  assert.match(draw.phrase, /Lecture : tangente/)
  assert.equal(draw.lecture.vecteur, draw.recall ? "ecarte" : "correspond")
})

test("a day window, another curve and a late version stay out of the mask", () => {
  const past = series(12)
  const hiddenDate = "2099-01-01"
  const days = think(
    mindWith({ ...glide, curve: "n1", gesture: "persiste", window: 8, days: 10 }, "n1"),
    past,
    { hiddenDate }
  ).draw
  const from = new Date(`${past[11].date}T12:00:00Z`)
  from.setUTCDate(from.getUTCDate() - 10)
  const limit = from.toISOString().slice(0, 10)
  const expected = past.filter((row) => row.date > limit).length
  assert.equal(days.masks[0].x2 - days.masks[0].x1 + 1, expected)
  assert.match(days.observation, /10 jours/)

  const elsewhere = think(mindWith({ ...glide, curve: "n2" }, "n1"), past, { hiddenDate }).draw
  assert.equal(elsewhere.masks.length, 0)

  const early = newSkill("early", "Tôt", { ...glide, curve: "n1" }, { cutoff: past[2].date, origin: "maison", examCents: null })
  const late = addVersion(early, { ...glide, curve: "n1", gesture: "miroir" }, { cutoff: hiddenDate, origin: "ia", examCents: null })
  const kept = think({ ...mind, focus: "n1", skills: [late] }, past, { hiddenDate }).draw
  assert.equal(kept.masks.length, 1)
  assert.equal(kept.masks[0].gesture, "glisse")
  const onlyLate = newSkill("late", "Tard", { ...glide, curve: "n1", gesture: "miroir" }, { cutoff: hiddenDate, origin: "ia", examCents: null })
  assert.equal(think({ ...mind, focus: "n1", skills: [onlyLate] }, past, { hiddenDate }).draw.masks.length, 0)
})

test("the dedicated skill drives the mask, the wildcard stays lighter", () => {
  const past = series(12)
  const wild = newSkill("wild", "Geste de base", glide, { cutoff: "", origin: "maison", examCents: null })
  const slow = newSkill(
    "slow",
    "n1 lente",
    { curve: "n1", gesture: "persiste", ratio: 0.618, span: "bande", window: 8, days: 6 },
    { cutoff: "", origin: "maison", examCents: null }
  )
  const other = newSkill(
    "other",
    "n5 seule",
    { ...glide, curve: "n5" },
    { cutoff: "", origin: "maison", examCents: null }
  )
  const masks = think({ ...mind, focus: "n1", skills: [wild, slow, other] }, past).draw.masks
  assert.equal(masks.length, 2)
  assert.equal(masks.find((mask) => mask.id === "slow")?.drives, true)
  assert.equal(masks.find((mask) => mask.id === "wild")?.drives, false)
  assert.equal(masks.find((mask) => mask.id === "slow")!.x2 - masks.find((mask) => mask.id === "slow")!.x1 + 1, 2)
  assert.equal(masks.find((mask) => mask.id === "wild")!.x2 - masks.find((mask) => mask.id === "wild")!.x1 + 1, 8)
})

test("the five words follow the mask, and a contradicted JSON is refused", () => {
  const flat = think(
    mindWith({ curve: "n1", gesture: "persiste", ratio: 0.618, span: "pas", window: 6, days: null }, "n1"),
    withN1([8, 8, 8, 8, 8, 8])
  ).draw
  assert.equal(flat.lecture.tangente, "correspond")
  assert.equal(flat.lecture.masque, "correspond")
  assert.equal(flat.lecture.cercle, "ecarte")
  assert.equal(flat.lecture.pas, "correspond")

  const glideDraw = think(
    mindWith({ curve: "n1", gesture: "glisse", ratio: 0.618, span: "pas", window: 6, days: null }, "n1"),
    withN1([1, 1, 1, 1, 2, 8])
  ).draw
  assert.equal(glideDraw.lecture.tangente, "ecarte")
  assert.equal(glideDraw.lecture.masque, glideDraw.lecture.tangente)

  const mean = think(
    mindWith({ curve: "n1", gesture: "moyenne", ratio: 0.618, span: "pas", window: 4, days: null }, "n1"),
    withN1([1, 8, 2, 7])
  ).draw
  assert.equal(mean.lecture.masque, "correspond")
  assert.equal(mean.lecture.tangente, "ecarte")

  const mirror = think(
    mindWith({ curve: "n1", gesture: "miroir", ratio: 0.618, span: "pas", window: 3, days: null }, "n1"),
    withN1([4, 8, 4])
  ).draw
  assert.equal(mirror.lecture.masque, "correspond")
  assert.equal(
    think(
      mindWith({ curve: "n1", gesture: "miroir", ratio: 0.618, span: "pas", window: 3, days: null }, "n1"),
      withN1([4, 8])
    ).draw.lecture.masque,
    "ecarte"
  )
  assert.equal(
    think(
      mindWith({ curve: "n1", gesture: "miroir", ratio: 0.618, span: "pas", window: 3, days: null }, "n1"),
      withN1([4, 8])
    ).draw.lecture.pas,
    "ecarte"
  )
  assert.equal(
    think(
      mindWith({ curve: "n1", gesture: "glisse", ratio: 0.618, span: "pas", window: 3, days: null }, "n1"),
      withN1([2, 4, 6])
    ).draw.lecture.pas,
    "correspond"
  )
  assert.equal(
    think(
      mindWith({ curve: "n1", gesture: "glisse", ratio: 0.618, span: "pas", window: 3, days: null }, "n1"),
      withN1([2, 6, 3])
    ).draw.lecture.pas,
    "ecarte"
  )

  const copied = lectureFromText(drawingText(flat))
  assert.deepEqual(copied, flat.lecture)
  const bad = { ...flat.lecture, tangente: "ecarte" as const }
  const body = JSON.stringify({ ...SKILL_EXAMPLE, lecture: bad })
  assert.equal(parseAction(body, flat.lecture), null)
  assert.equal(
    lectureRefusal(body, flat.lecture),
    "le modèle écrit « tangente s’écarte », la mesure dit « tangente correspond »"
  )
  assert.equal(parseAction(JSON.stringify({ ...SKILL_EXAMPLE, lecture: flat.lecture }), flat.lecture)?.kind, "skill")
  assert.equal(JSON.stringify(flat).includes("2099"), false)
})

test("an observation is dated on first sight and counted on the next draw, not twice on the same one", () => {
  assert.equal(formatObservationDate("2026-03-12"), "12 mars 2026")
  assert.equal(formatObservationDate("2026-03-01"), "1er mars 2026")
  const phrase = "n1 · glisse · 8 tirages · tangente correspond, masque correspond, cercle s’écarte, pas correspond, vecteur correspond"
  const flipped = phrase.replace("cercle s’écarte", "cercle correspond")
  let noted = noteObservation([], new Set(), {
    runnerId: "r1",
    hiddenDate: "2026-03-13",
    phrase,
    createdOn: "2026-03-10",
  })
  assert.equal(noted.observations.length, 1)
  assert.equal(noted.observations[0].count, 1)
  assert.equal(observationReport(noted.observations[0]), "Observation du 10 mars 2026, vue 1 fois.")
  noted = noteObservation(noted.observations, noted.seen, {
    runnerId: "r3",
    hiddenDate: "2026-03-13",
    phrase,
    createdOn: "2026-03-12",
  })
  assert.equal(noted.observations[0].count, 2)
  assert.equal(noted.observations[0].createdOn, "2026-03-10")
  noted = noteObservation(noted.observations, noted.seen, {
    runnerId: "r1",
    hiddenDate: "2026-03-13",
    phrase,
    createdOn: "2026-03-10",
  })
  assert.equal(noted.observations[0].count, 2)
  noted = noteObservation(noted.observations, noted.seen, {
    runnerId: "r1",
    hiddenDate: "2026-03-17",
    phrase,
    createdOn: "2026-03-13",
  })
  assert.equal(noted.observations[0].count, 3)
  assert.equal(noted.observations[0].createdOn, "2026-03-10")
  assert.equal(observationReport(noted.observations[0]), "Observation du 10 mars 2026, vue 3 fois.")
  noted = noteObservation(noted.observations, noted.seen, {
    runnerId: "r1",
    hiddenDate: "2026-03-17",
    phrase: flipped,
    createdOn: "2026-03-13",
  })
  assert.equal(noted.observations.length, 2)
  assert.equal(noted.observations[1].count, 1)
  assert.equal(noted.observations[1].createdOn, "2026-03-13")

  const rows = series(12)
  let race = previewTurn(createRace(1, rows.length, 4), rows)
  const hidden = rows[race.cursor].date
  let raceNotes = noteRace([], new Set(), race, hidden)
  const counts = raceNotes.observations.reduce((total, item) => total + item.count, 0)
  raceNotes = noteRace(raceNotes.observations, raceNotes.seen, race, hidden)
  assert.equal(raceNotes.observations.reduce((total, item) => total + item.count, 0), counts)
  const played = playTurn(race, rows)
  raceNotes = noteRace(raceNotes.observations, raceNotes.seen, played, played.revealed?.date ?? hidden)
  assert.equal(raceNotes.observations.reduce((total, item) => total + item.count, 0), counts)
})

const suite: SkillParams = {
  curve: "sumNumbers",
  gesture: "suite",
  suite: "logistique",
  r: 2,
  ratio: 0.618,
  span: "bande",
  window: 8,
  days: null,
}

test("the logistic step stays in the band, and a strong R is refused", () => {
  const lo = 15
  const hi = 240
  const width = hi - lo
  const middle = lo + width / 2
  const at = (r: SkillParams["r"], values: number[]) =>
    tipFor(
      { ...suite, r },
      [],
      values.map((sumNumbers) => ({ ...curveValues(point(0)), sumNumbers })),
      "sumNumbers"
    )
  assert.ok(Math.abs(at(2, [middle, middle]) - middle) < 1e-9)
  assert.ok(Math.abs(at(2.8, [middle]) - (lo + 0.7 * width)) < 1e-9)
  assert.ok(at(1, [middle, hi, lo]) <= lo + 0.25 * width + 1e-9)
  assert.ok(Math.abs(at(1, [300]) - lo) < 1e-9)
  assert.ok(Math.abs(at(1, [0]) - lo) < 1e-9)

  assert.equal(parseSkillParams({ curve: "sumNumbers", gesture: "suite", r: 3.5 }), null)
  assert.equal(parseSkillParams({ curve: "sumNumbers", gesture: "suite", r: 3.8 }), null)
  assert.equal(parseSkillParams({ curve: "sumNumbers", gesture: "suite", r: 4 }), null)
  assert.equal(parseSkillParams({ curve: "sumNumbers", gesture: "suite" })?.r, 2)
  assert.equal(parseSkillParams({ curve: "sumNumbers", gesture: "suite", r: "1,5" })?.r, 1.5)
  assert.equal(parseSkillParams({ curve: "sumNumbers", gesture: "suite", r: 3.2 })?.suite, "logistique")
  const old = parseSkillParams({ curve: "d2", gesture: "or", ratio: 1.6 })
  assert.equal(old?.gesture, "or")
  assert.equal(old?.r, undefined)
  assert.equal(parseSkillParams({ curve: "d2", gesture: "persiste", r: 4 })?.gesture, "persiste")

  const starter = createMinds(8)[7].skills[0]
  assert.equal(starter.name, "Suite numérique")
  assert.equal(starter.versions[0].gesture, "suite")
  assert.equal(starter.versions[0].r, 2)
  assert.equal(starter.versions[0].curve, "*")
  assert.equal(createMinds(8)[6].skills[0].name, "Geste de base")
  assert.notEqual(createMinds(8)[6].skills[0].versions[0].gesture, "suite")
  assert.equal(
    describeSkill(starter.versions[0]),
    "toutes les courbes suit la suite logistique, R 2, de la bande, sur 8 tirages."
  )
  const varied = houseVariation(
    { curve: "*", gesture: "persiste", ratio: 0.618, span: "bande", window: 8, days: null },
    6
  )
  assert.equal(varied.gesture, "suite")
  assert.equal(varied.suite, "logistique")
  assert.equal(varied.r, 1.5)
  assert.notEqual(
    houseVariation({ curve: "*", gesture: "persiste", ratio: 0.618, span: "bande", window: 8, days: null }, 5).gesture,
    "suite"
  )

  const calm = think(mindWith({ ...suite, curve: "n1", window: 4 }, "n1"), withN1([23, 23, 23, 23]))
  assert.equal(calm.draw.lecture.masque, "correspond")
  assert.match(calm.draw.observation, /n1 · suite · R 2 · 4 tirages/)
  assert.match(calm.draw.phrase, /suit la suite logistique, R 2/)
  assert.ok(calm.draw.tangent)
  assert.ok(calm.draw.vector)

  const wild = think(mindWith({ ...suite, curve: "n1", r: 1, window: 4 }, "n1"), withN1([1, 46, 1, 46]))
  assert.equal(wild.draw.lecture.masque, "ecarte")

  const legacy = parseChampion({
    generation: 1,
    runner: "R1",
    cents: 5000,
    skills: [
      {
        id: "r1-base",
        name: "Geste de base",
        versions: [
          {
            curve: "*",
            gesture: "persiste",
            ratio: 0.618,
            span: "bande",
            window: 8,
            days: null,
            version: 1,
            parent: null,
            cutoff: "",
            origin: "maison",
            phrase: "reste",
            examCents: null,
          },
        ],
      },
    ],
  })
  assert.equal(legacy?.skills[0].versions[0].gesture, "persiste")
  assert.equal(legacy?.skills[0].versions[0].r, undefined)
})
