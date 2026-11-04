import assert from "node:assert/strict"
import test from "node:test"

import {
  championRecord,
  childrenOf,
  parseChampion,
  pickChampion,
  proposeNextDraw,
  replayLastGrid,
  setAsideCount,
} from "../src/lib/run-arcade/champion.ts"
import { placeNumbers, placeStars, reconcile } from "../src/lib/run-arcade/coherence.ts"
import { buildTrack, curveMeta, curveValues, CURVE_KEYS, type CurveValues } from "../src/lib/run-arcade/curves.ts"
import { EXAM_WINDOW, examine, examStart, passesExam, promptPast } from "../src/lib/run-arcade/examen.ts"
import {
  ARCTAN_TURNS,
  figureLength,
  FORMES,
  POLYGON_SIDES,
  readFigure,
  TIP_MARGIN,
  usesFigureN,
  WAVE_PERIODS,
} from "../src/lib/run-arcade/figure.ts"
import { BRAVE_EXAMPLE, buildPrompt, lectureFromText, lectureRefusal, parseAction, SKILL_EXAMPLE } from "../src/lib/run-arcade/prompt.ts"
import {
  activeVersion,
  addVersion,
  auditCutoffs,
  describeSkill,
  houseVariation,
  LOGISTIC_R,
  newSkill,
  parseSkillParams,
  parseStoredSkillParams,
  rollBack,
  type SkillParams,
} from "../src/lib/run-arcade/skills.ts"
import {
  GOLDEN_RATIOS,
  RUNNER_MAX,
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

test("golden ratios land on five distinct levels and five distinct aims", () => {
  const levels = GOLDEN_RATIOS.map((ratio) => goldenLevel(1, 46, ratio))
  assert.equal(new Set(levels.map((level) => level.toFixed(4))).size, 5)
  const aims = GOLDEN_RATIOS.map((ratio) => goldenAim(1, 46, ratio))
  assert.equal(new Set(aims.map((aim) => aim.toFixed(4))).size, 5)
  assert.ok(Math.abs(goldenLevel(0, 10, 0.618) - 6.18) < 1e-9)
  assert.ok(Math.abs(goldenLevel(0, 10, 1.618) - 16.18) < 1e-9)
  assert.ok(Math.abs(goldenAim(0, 10, 0.382) - 3.82) < 1e-9)
  assert.ok(Math.abs(goldenAim(0, 10, 0.618) - 6.18) < 1e-9)
  assert.ok(Math.abs(goldenAim(0, 10, 1.272) - 2.72) < 1e-9)
  assert.ok(Math.abs(goldenAim(0, 10, 1.618) - 7.64) < 1e-9)
  assert.ok(Math.abs(goldenAim(0, 10, 2.618) - 8.54) < 1e-9)
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
  assert.deepEqual(reconcile(flat).numbers, [11, 20, 30, 35, 44])

  const shared = { ...flat, n1: 35.6, n2: 35.6, n3: 35.6, n4: 35.6, n5: 35.6 }
  assert.deepEqual(reconcile(shared).numbers, [26, 27, 28, 29, 30])

  const lowDecades = { ...flat, d0: 4, d1: 1, d2: 1, d3: 1, d4: 0 }
  const highDecades = { ...flat, d0: 0, d1: 1, d2: 1, d3: 1, d4: 4 }
  assert.notDeepEqual(reconcile(lowDecades).numbers, reconcile(flat).numbers)
  assert.notDeepEqual(reconcile(highDecades).numbers, reconcile(flat).numbers)
  assert.notDeepEqual(reconcile(lowDecades).numbers, reconcile(highDecades).numbers)
  assert.equal(
    reconcile(lowDecades).numbers.reduce((a, b) => a + b, 0),
    140
  )
  assert.equal(
    reconcile(highDecades).numbers.reduce((a, b) => a + b, 0),
    140
  )
  assert.ok(reconcile(lowDecades).numbers[0] < reconcile(flat).numbers[0])
  assert.ok(reconcile(highDecades).numbers[3] > reconcile(flat).numbers[3])

  const past = series(8)
  const withDecadeSkill = {
    ...mind,
    skills: [
      ...mind.skills,
      newSkill(
        "r1-d0",
        "Décennie basse",
        { curve: "d0", gesture: "or", ratio: 2.618, span: "bande", window: 8, days: null },
        { cutoff: "", origin: "ia", examCents: null }
      ),
    ],
  }
  assert.notDeepEqual(think(withDecadeSkill, past).guess, think(mind, past).guess)
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
  assert.equal(createMinds(80).length, RUNNER_MAX)
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
  assert.ok(result.cents != null)
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

test("the champion tie-break compares the gap to chance, not the raw exam balance", () => {
  const minds = createMinds(3)
  const runners = minds.map(newRunner)
  // 46,00 € en 3 tours est sous le hasard de 3 tours (47,50 €) ; 43,00 € en 25 tours est loin au-dessus du sien (29,17 €).
  runners[0] = { ...runners[0], cents: 5200, examCents: 4600, examTurns: 3, calls: 0 }
  runners[1] = { ...runners[1], cents: 5200, examCents: 4300, examTurns: 25, calls: 9 }
  runners[2] = { ...runners[2], cents: 5200, examCents: null, examTurns: 0, calls: 0 }
  assert.equal(pickChampion(runners)?.mind.id, "r2")
  assert.equal(pickChampion([runners[2], runners[0]])?.mind.id, "r1", "un examen vide reste derrière un examen joué")
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

test("replaying the last race draw returns the grid think played and the countHits total", () => {
  const rows = series(12)
  const record = championRecord({
    runner: { ...newRunner(mind), cents: 5400, examCents: 5100 },
    generation: 2,
    raceFrom: rows[8].date,
    raceTo: rows[11].date,
    journal: [],
    savedAt: "2026-10-30T12:00:00.000Z",
  })
  const mindOf = {
    id: "champion",
    name: record.runner,
    focus: "sumNumbers" as const,
    skills: record.skills,
  }
  const replay = replayLastGrid(record, rows)
  assert.ok(replay)
  const played = think(mindOf, rows.slice(0, 11), { hiddenDate: rows[11].date, focus: "sumNumbers" })
  assert.equal(replay.draw.date, rows[11].date)
  assert.deepEqual(replay.thought.guess, played.guess)
  assert.equal(replay.hits, countHits(played.guess, rows[11]))

  const earlier = replayLastGrid({ ...record, raceTo: rows[9].date }, rows)
  assert.ok(earlier)
  const mid = think(mindOf, rows.slice(0, 9), { hiddenDate: rows[9].date, focus: "sumNumbers" })
  assert.equal(earlier.draw.date, rows[9].date)
  assert.deepEqual(earlier.thought.guess, mid.guess)
  assert.equal(earlier.hits, countHits(mid.guess, rows[9]))

  const open = replayLastGrid({ ...record, raceTo: null }, rows)
  assert.equal(open?.draw.date, rows[11].date)
  assert.deepEqual(open?.thought.guess, played.guess)
  assert.equal(open?.hits, countHits(played.guess, rows[11]))
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
    '{"action":"skill","name":"x","phrase":"y","curve":"sumNumbers|n1|*","gesture":"moyenne|glisse","ratio":"0.382|0.618","span":"bande|lignes","window":"3|5|10 ou 2 à 60","days":"null ou 30|60"}'
  )
  assert.ok(copied && copied.kind === "skill")
  if (copied && copied.kind === "skill") {
    assert.equal(copied.params.curve, "sumNumbers")
    assert.equal(copied.params.gesture, "moyenne")
    assert.equal(copied.params.ratio, 0.618)
    assert.equal(copied.params.span, "bande")
    assert.equal(copied.params.window, 3)
    assert.equal(copied.params.days, 30)
  }
  assert.equal(
    parseSkillParams({ curve: "n1", gesture: "or|glisse", ratio: "0.382|0.618", span: "lignes|pas" })?.ratio,
    0.382
  )
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

test("a measured écart is kept, and correspond copied in its place is still refused", () => {
  const draw = think(
    mindWith({ curve: "n1", gesture: "glisse", ratio: 0.618, span: "pas", window: 6, days: null }, "n1"),
    withN1([1, 1, 1, 1, 2, 8])
  ).draw
  assert.equal(draw.lecture.tangente, "ecarte")

  const prompt = buildPrompt({
    mind,
    past: series(4),
    hiddenDate: "2099-01-01",
    examCents: null,
    notes: [],
    drawing: drawingText(draw),
  })
  assert.match(prompt.system, /Recopie-la dans lecture/)
  const skillLine = prompt.system.split("\n").find((line) => line.startsWith("Skill : "))
  const braveLine = prompt.system.split("\n").find((line) => line.startsWith("Recherche : "))
  assert.ok(skillLine)
  assert.ok(braveLine)
  const skill = JSON.parse(skillLine.slice("Skill : ".length)) as { lecture: typeof draw.lecture }
  const brave = JSON.parse(braveLine.slice("Recherche : ".length)) as { lecture: typeof draw.lecture }
  assert.deepEqual(skill.lecture, draw.lecture)
  assert.deepEqual(brave.lecture, draw.lecture)
  assert.equal(skill.lecture.tangente, "ecarte")

  const faithful = JSON.stringify({ ...SKILL_EXAMPLE, lecture: draw.lecture })
  assert.equal(lectureRefusal(faithful, draw.lecture), null)
  assert.equal(parseAction(faithful, draw.lecture)?.kind, "skill")

  const copied = JSON.stringify({ ...SKILL_EXAMPLE, lecture: { ...draw.lecture, tangente: "correspond" } })
  assert.equal(parseAction(copied, draw.lecture), null)
  assert.equal(
    lectureRefusal(copied, draw.lecture),
    "le modèle écrit « tangente correspond », la mesure dit « tangente s’écarte »"
  )
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
  const race = previewTurn(createRace(1, rows.length, 4), rows)
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
  const fromPersiste: SkillParams = { curve: "*", gesture: "persiste", ratio: 0.618, span: "bande", window: 8, days: null }
  const suites = Array.from({ length: 4000 }, (_, step) => houseVariation(fromPersiste, step)).filter(
    (item) => item.gesture === "suite"
  )
  assert.ok(suites.length > 100)
  assert.ok(suites.every((item) => item.suite === "logistique" && (LOGISTIC_R as readonly number[]).includes(item.r ?? 0)))
  assert.deepEqual([...new Set(suites.map((item) => item.span))].sort(), ["bande", "lignes"])
  assert.equal(new Set(suites.map((item) => item.r)).size, LOGISTIC_R.length)

  assert.equal(parseSkillParams({ curve: "sumNumbers", gesture: "suite", span: "pas" }), null)
  assert.equal(parseSkillParams({ curve: "sumNumbers", gesture: "suite", span: "lignes" })?.span, "lignes")
  assert.equal(parseSkillParams({ curve: "sumNumbers", gesture: "suite" })?.span, "bande")
  assert.equal(parseSkillParams({ curve: "sumNumbers", gesture: "or", span: "pas" })?.span, "pas")

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

test("a geometric figure slides a short caliber and keeps the old gestures", () => {
  const triangle = readFigure([0, 10, 10], "triangle", null)
  const down = 1 - Math.tan(Math.PI / 3) * 0.5
  assert.ok(Math.abs(triangle.tip - down * 10) < 1e-9)
  assert.equal(triangle.correspond, false)

  assert.equal(readFigure([0, 5, 10], "cercle", null, Infinity).tip, 15)
  assert.equal(readFigure([0, 10, 0], "cercle", null, Infinity).tip, -10)
  assert.equal(readFigure([0, 5, 10], "cercle", null).tip, 12.5)
  assert.equal(readFigure([0, 10, 0], "cercle", null).tip, -2.5)

  const yPentagon = 1 - Math.tan((72 * Math.PI) / 180) * 0.25
  assert.ok(Math.abs(readFigure([0, 0, 0, 10, 10], "polygone", 5).tip - yPentagon * 10) < 1e-9)

  assert.equal(readFigure([0, 10, 0], "pythagore", null).tip, 10)
  assert.equal(readFigure([0, 5, 10], "pythagore", null, Infinity).tip, 15)
  assert.equal(readFigure([0, 5, 10], "pythagore", null).tip, 12.5)
  assert.equal(readFigure([7, 7, 7], "pythagore", null).tip, 7)

  const sinusoid = (phase: number) =>
    Array.from({ length: 8 }, (_, index) => 100 + 50 * Math.sin((2 * Math.PI * index) / 8 + phase))
  for (const phase of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
    const first = 100 + 50 * Math.sin(phase)
    assert.ok(Math.abs(readFigure(sinusoid(phase), "sin", 8).tip - first) < 1e-9)
  }
  const rising = [10, 50, 90, 130, 170, 130, 90, 50]
  const falling = [170, 130, 90, 50, 10, 50, 90, 130]
  assert.ok(Math.abs(readFigure(rising, "sin", 8).tip - 10) < 1e-9)
  assert.ok(Math.abs(readFigure(falling, "sin", 8).tip - 170) < 1e-9)

  const level = [0, 10, 5, 5, 5, 5, 5, 5]
  const up = 0.5 + Math.SQRT2 / 4
  const downWave = 0.5 - Math.SQRT2 / 4
  assert.ok(Math.abs(readFigure(level, "arcsin", 8).tip - up * 10) < 1e-9)
  assert.ok(Math.abs(readFigure(level, "arccos", 8).tip - downWave * 10) < 1e-9)
  assert.ok(readFigure(level, "arcsin", 8).tip > 5)
  assert.ok(readFigure(level, "arccos", 8).tip < 5)

  const chord = readFigure([0, 2, 4, 6, 8, 10], "tan", 4)
  assert.equal(chord.correspond, true)
  assert.ok(Math.abs(readFigure([0, 2, 4, 6, 8, 10], "tan", 4, Infinity).tip - 40 / 3) < 1e-9)
  assert.equal(chord.tip, 12.5)
  assert.equal(readFigure([0, 2, 4, 6, 8], "tan", 4).correspond, false)

  const alpha = Math.atan2(-1, 0.5)
  const beta = alpha + Math.PI / 3
  const scaled = readFigure([0, 30, 10, 20, 10], "triangle", null)
  assert.ok(Math.abs(scaled.tip - Math.tan(beta) * 0.5 * 30) < 1e-9)
  assert.ok(Math.abs(scaled.tip - (10 + Math.tan(beta) * 0.5 * 10)) > 1)

  const steep = (80 * Math.PI) / 180
  assert.ok(Math.abs(readFigure([0, 0, 100], "arctan", 45, Infinity).tip - 100 * (1 + Math.tan(steep) * 0.5)) < 1e-9)
  assert.equal(readFigure([0, 0, 100], "arctan", 45).tip, 125)
  assert.ok(Math.abs(readFigure([10, 0, 0], "arctan", 30).tip - 5 / Math.sqrt(3)) < 1e-9)
  assert.equal(readFigure([1, 2], "triangle", null).tip, 2)

  assert.equal(parseSkillParams({ curve: "*", gesture: "figure", forme: "polygone", n: 7 }), null)
  assert.equal(parseSkillParams({ curve: "*", gesture: "figure", forme: "sin", n: 5 }), null)
  assert.equal(parseSkillParams({ curve: "*", gesture: "figure", forme: "arctan", n: 20 }), null)
  assert.equal(parseSkillParams({ curve: "*", gesture: "figure", forme: "nope" }), null)
  const plain = parseSkillParams({ curve: "n1", gesture: "figure" })
  assert.equal(plain?.forme, "triangle")
  assert.equal(plain?.n, null)
  assert.equal(parseSkillParams({ curve: "n1", gesture: "figure", forme: "sin" })?.n, 8)
  assert.equal(parseSkillParams({ curve: "n1", gesture: "figure", forme: "polygone" })?.n, 4)
  assert.equal(parseSkillParams({ curve: "n1", gesture: "figure", forme: "arctan" })?.n, 30)
  assert.equal(parseSkillParams({ curve: "n1", gesture: "figure", forme: "triangle", n: 7 })?.n, null)
  assert.equal(parseSkillParams({ curve: "d2", gesture: "or", ratio: 1.6, forme: "sin", n: 8 })?.forme, undefined)
  assert.equal(
    describeSkill({ curve: "sumNumbers", gesture: "figure", forme: "triangle", ratio: 0.618, span: "bande", window: 8, days: null }),
    "Σn trace un triangle, calibre 3, sur 8 tirages."
  )

  const runner = createMinds(18)[17].skills[0]
  assert.equal(runner.name, "Figure")
  assert.equal(runner.versions[0].gesture, "figure")
  assert.equal(runner.versions[0].forme, "triangle")
  assert.equal(createMinds(8)[7].skills[0].versions[0].gesture, "suite")
  assert.equal(createMinds(17)[16].skills[0].versions[0].gesture, "soir")

  const drawn = think(
    mindWith(
      { curve: "n1", gesture: "figure", forme: "triangle", ratio: 0.618, span: "bande", window: 8, days: null },
      "n1"
    ),
    withN1([0, 0, 0, 0, 0, 0, 10, 10])
  ).draw
  assert.match(drawn.observation, /n1 · figure · triangle · calibre 3 · 8 tirages/)
  assert.match(drawn.phrase, /trace un triangle, calibre 3/)
  assert.equal(drawn.phrase.includes("rayon"), false)
  assert.ok(Math.abs(drawn.thoughtValue - down * 10) < 1e-6)
})

function lcg(seed: number) {
  let state = seed >>> 0
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    return state / 4294967296
  }
}

function sample(random: () => number, pool: number, count: number) {
  const bag = Array.from({ length: pool }, (_, index) => index + 1)
  const out: number[] = []
  while (out.length < count) out.push(bag.splice(Math.floor(random() * bag.length), 1)[0])
  return out.sort((a, b) => a - b)
}

/** Tirages au hasard dans l’urne, un mardi puis un vendredi, comme l’archive. */
function urn(count: number, seed: number): RankPoint[] {
  const random = lcg(seed)
  const out: RankPoint[] = []
  let day = new Date(Date.UTC(2025, 0, 3, 12))
  while (out.length < count) {
    if (day.getUTCDay() === 2 || day.getUTCDay() === 5) {
      const n = sample(random, 50, 5)
      const e = sample(random, 12, 2)
      out.push({
        date: day.toISOString().slice(0, 10),
        n1: n[0],
        n2: n[1],
        n3: n[2],
        n4: n[3],
        n5: n[4],
        e1: e[0],
        e2: e[1],
      })
    }
    day = new Date(day.getTime() + 86_400_000)
  }
  return out
}

type FigureCase = { forme: (typeof FORMES)[number]; n: number | null }

const FIGURE_CASES: FigureCase[] = FORMES.flatMap((forme): FigureCase[] => {
  if (forme === "polygone") return POLYGON_SIDES.map((n) => ({ forme, n }))
  if (forme === "arctan") return ARCTAN_TURNS.map((n) => ({ forme, n }))
  if (usesFigureN(forme)) return WAVE_PERIODS.map((n) => ({ forme, n }))
  return [{ forme, n: null }]
})

const fromMoyenne: SkillParams = { curve: "*", gesture: "moyenne", ratio: 0.618, span: "bande", window: 5, days: null }
const fromPersiste: SkillParams = { curve: "*", gesture: "persiste", ratio: 0.618, span: "bande", window: 8, days: null }

test("a house variation draws each setting on its own hash", () => {
  for (const base of [fromMoyenne, fromPersiste]) {
    const variations = Array.from({ length: 20000 }, (_, step) => houseVariation(base, step))
    const ors = variations.filter((item) => item.gesture === "or")
    assert.deepEqual(
      [...new Set(ors.map((item) => item.ratio))].sort((a, b) => a - b),
      [...GOLDEN_RATIOS]
    )
    const suites = variations.filter((item) => item.gesture === "suite")
    assert.equal(new Set(suites.map((item) => item.curve)).size, CURVE_KEYS.length)
    const figures = variations.filter((item) => item.gesture === "figure")
    assert.equal(new Set(figures.map((item) => item.curve)).size, CURVE_KEYS.length)
    assert.equal(new Set(figures.map((item) => item.forme)).size, FORMES.length)
    assert.ok(variations.every((item) => item.gesture !== base.gesture))
    assert.ok(new Set(variations.map((item) => JSON.stringify(item))).size > 6000)
  }
  const first = houseVariation(fromMoyenne, 12)
  assert.deepEqual(houseVariation(fromMoyenne, 12), first)
  assert.deepEqual(houseVariation(fromMoyenne, -12), first)
  assert.ok(Number.isFinite(houseVariation(fromMoyenne, Number.NaN).curve.length))
})

test("a house variation or an IA proposal never gives a figure a window shorter than its calibre plus two", () => {
  for (let step = 0; step < 6000; step += 1) {
    const item = houseVariation(fromMoyenne, step)
    if (item.gesture === "figure") {
      assert.ok(item.window >= figureLength(item.forme!, item.n ?? null) + 2, `${step} ${item.forme} ${item.n} : ${item.window}`)
    }
  }
  const wave = parseSkillParams({ curve: "*", gesture: "figure", forme: "sin", n: 12, window: 3 })
  assert.equal(wave?.window, 14)
  assert.equal(parseSkillParams({ curve: "*", gesture: "figure", forme: "polygone", n: 8, window: 20 })?.window, 20)
  assert.equal(parseSkillParams({ curve: "*", gesture: "figure", forme: "triangle", window: 2 })?.window, 5)
  assert.equal(parseSkillParams({ curve: "*", gesture: "figure", forme: "sin", n: 12 })?.window, 14)
  assert.equal(parseSkillParams({ curve: "*", gesture: "figure", forme: "arctan", n: 45, window: 5 })?.window, 5)
  assert.equal(parseSkillParams({ curve: "*", gesture: "or", window: 3 })?.window, 3)

  for (const { forme, n } of FIGURE_CASES) {
    const read = parseSkillParams({ curve: "*", gesture: "figure", forme, n, days: 7 })
    assert.ok(read?.days != null)
    const calibre = figureLength(forme, n)
    for (const start of [2, 5]) {
      const dates = urn(60, 1).map((row) => row.date)
      const last = dates.findLastIndex((date) => new Date(`${date}T12:00:00Z`).getUTCDay() === start)
      const limit = new Date(`${dates[last]}T12:00:00Z`)
      limit.setUTCDate(limit.getUTCDate() - (read?.days ?? 0))
      const inside = dates.slice(0, last + 1).filter((date) => date > limit.toISOString().slice(0, 10))
      assert.ok(inside.length >= calibre, `${forme} ${n} jours ${read?.days} : ${inside.length} < ${calibre}`)
    }
  }
  assert.equal(parseSkillParams({ curve: "*", gesture: "figure", forme: "sin", n: 4, days: 90 })?.days, 90)
  assert.equal(parseSkillParams({ curve: "*", gesture: "moyenne", days: 7 })?.days, 7)
})

test("every figure tip stays within a quarter of the height of its window, and the thought stays in its band", () => {
  const random = lcg(11)
  for (const { forme, n } of FIGURE_CASES) {
    for (let round = 0; round < 120; round += 1) {
      const values = Array.from({ length: 16 }, () => 10 + Math.floor(random() * 30))
      const lo = Math.min(...values)
      const hi = Math.max(...values)
      const reach = TIP_MARGIN * (hi - lo)
      const tip = readFigure(values, forme, n).tip
      assert.ok(tip >= lo - reach - 1e-9 && tip <= hi + reach + 1e-9, `${forme} ${n} : ${tip}`)
    }
  }
  const meta = curveMeta("sumNumbers")
  const rows = urn(80, 3)
  for (const { forme, n } of FIGURE_CASES) {
    const length = figureLength(forme, n)
    const params: SkillParams = {
      curve: "*",
      gesture: "figure",
      forme,
      n,
      ratio: 0.618,
      span: "bande",
      window: Math.max(16, length),
      days: null,
    }
    for (let end = 20; end < rows.length; end += 5) {
      const thought = think(mindWith(params, "sumNumbers"), rows.slice(0, end), { hiddenDate: rows[end].date })
      const draw = thought.draw
      assert.ok(thought.tips.sumNumbers >= meta.lo && thought.tips.sumNumbers <= meta.hi, `${forme} ${n}`)
      assert.ok(draw.yMax - draw.yMin < 4 * (meta.hi - meta.lo), `${forme} ${n} fin ${end} : ${draw.yMax - draw.yMin}`)
      assert.equal(draw.vector.y2, thought.tips.sumNumbers)
    }
  }
})

test("the tip clip only pulls a figure back towards its window, on the side the figure points to", () => {
  const random = lcg(23)
  let clipped = 0
  let total = 0
  for (const { forme, n } of FIGURE_CASES) {
    for (let round = 0; round < 150; round += 1) {
      const size = figureLength(forme, n) + Math.floor(random() * 12)
      const values = Array.from({ length: size }, () => 15 + Math.floor(random() * 226))
      const lo = Math.min(...values)
      const hi = Math.max(...values)
      const last = values[values.length - 1]
      const reach = TIP_MARGIN * (hi - lo)
      const free = readFigure(values, forme, n, Infinity)
      const read = readFigure(values, forme, n)
      assert.equal(read.tip, Math.min(hi + reach, Math.max(lo - reach, free.tip)), `${forme} ${n}`)
      assert.equal(Math.sign(read.tip - last), Math.sign(free.tip - last), `${forme} ${n}`)
      assert.deepEqual({ ...read, tip: 0 }, { ...free, tip: 0 }, `${forme} ${n}`)
      total += 1
      if (read.tip !== free.tip) clipped += 1
    }
  }
  assert.ok(clipped > 0 && clipped < total, `${clipped} pointes écrêtées sur ${total}`)
})

test("the drawn thought of a figure points the way the figure points", () => {
  const rows = urn(60, 7)
  const sums = rows.map((row) => curveValues(row).sumNumbers)
  for (const { forme, n } of FIGURE_CASES) {
    const window = Math.max(10, figureLength(forme, n))
    const params: SkillParams = {
      curve: "sumNumbers",
      gesture: "figure",
      forme,
      n,
      ratio: 0.618,
      span: "bande",
      window,
      days: null,
    }
    for (let end = 20; end < rows.length; end += 4) {
      const draw = think(mindWith(params, "sumNumbers"), rows.slice(0, end), { hiddenDate: rows[end].date }).draw
      const values = sums.slice(0, end).slice(-window)
      const last = values[values.length - 1]
      const free = readFigure(values, forme, n, Infinity).tip
      assert.equal(draw.vector.y1, last)
      assert.equal(Math.sign(draw.vector.y2 - draw.vector.y1), Math.sign(free - last), `${forme} ${n} fin ${end}`)
    }
  }
})

test("an arctan figure plays Σn on an edge of the band in fewer than 5 % of the turns", () => {
  const meta = curveMeta("sumNumbers")
  const archives = [1, 2, 3, 4, 5, 6].map((seed) => urn(210, seed))
  for (const [n, window] of [
    [15, 3],
    [30, 5],
    [45, 10],
    [30, 16],
  ] as const) {
    const params: SkillParams = {
      curve: "sumNumbers",
      gesture: "figure",
      forme: "arctan",
      n,
      ratio: 0.618,
      span: "bande",
      window,
      days: null,
    }
    let edge = 0
    let turns = 0
    for (const rows of archives) {
      for (let end = 12; end < rows.length; end += 1) {
        const played = think(mindWith(params, "sumNumbers"), rows.slice(0, end), { hiddenDate: rows[end].date })
        turns += 1
        if (played.cases.sumNumbers <= meta.lo || played.cases.sumNumbers >= meta.hi) edge += 1
      }
    }
    assert.ok(edge / turns < 0.05, `arc tangente ${n}°, ${window} tirages : ${edge} grilles de bord sur ${turns}`)
  }
})

test("the sin figure reads the phase of the last cran", () => {
  const sinusoid = (phase: number, period: number) =>
    Array.from({ length: period + 4 }, (_, index) => 100 + 50 * Math.sin((2 * Math.PI * index) / period + phase))
  for (const period of WAVE_PERIODS) {
    const tips = [0, 1, 2, 3, 4, 5].map((step) => {
      const values = sinusoid((step * Math.PI) / 3, period)
      const cran = values.slice(-period)
      return { tip: readFigure(values, "sin", period).tip, cran }
    })
    for (const { tip, cran } of tips) {
      assert.ok(tip >= Math.min(...cran) - 50 && tip <= Math.max(...cran) + 50)
    }
    assert.ok(new Set(tips.map((item) => item.tip.toFixed(3))).size > 1)
  }
  assert.ok(Number.isFinite(readFigure([0, 1, 0, 1, 0, 1, 0, 1], "sin", 8).tip))
  assert.ok(Number.isFinite(readFigure([5, 5, 5, 5, 5, 5, 5, 5], "sin", 8).tip))
})

test("there are nine figure shapes, and no cosine: an old cos is read as sin, a new one is refused", () => {
  assert.equal(FORMES.length, 9)
  assert.equal((FORMES as readonly string[]).includes("cos"), false)
  assert.equal(parseSkillParams({ curve: "*", gesture: "figure", forme: "cos", n: 8 }), null)
  assert.equal(parseSkillParams({ curve: "*", gesture: "figure", forme: "sin|cos", n: 8 })?.forme, "sin")
  const forms = new Set<string>()
  for (let step = 0; step < 6000; step += 1) {
    const item = houseVariation(fromMoyenne, step)
    if (item.gesture === "figure") forms.add(String(item.forme))
  }
  assert.equal(forms.size, 9)
  assert.equal(forms.has("cos"), false)
  const prompt = buildPrompt({ mind, past: series(4), hiddenDate: "2099-01-01", examCents: null, notes: [], drawing: null })
  assert.match(prompt.system, /forme : triangle, cercle, polygone, pythagore, sin, tan, arcsin, arccos, arctan\./)
  assert.doesNotMatch(prompt.system, /\bcos\b/)
})

test("the five golden levels of the drawing keep their height whatever the chosen ratio", () => {
  const rows = urn(40, 5)
  const past = rows.slice(0, 30)
  for (const span of ["bande", "lignes", "pas"] as const) {
    const levels = GOLDEN_RATIOS.map((ratio) => {
      const params: SkillParams = { curve: "*", gesture: "or", ratio, span, window: 8, days: null }
      return think(mindWith(params, "n3"), past, { hiddenDate: rows[30].date }).draw.golden
    })
    for (const drawn of levels) assert.equal(drawn.length, 5)
    const heights = (drawn: (typeof levels)[number]) => drawn.map((item) => [item.ratio, item.y])
    for (const drawn of levels) assert.deepEqual(heights(drawn), heights(levels[0]))
    levels.forEach((drawn, index) => {
      assert.deepEqual(
        drawn.filter((item) => item.chosen).map((item) => item.ratio),
        [GOLDEN_RATIOS[index]]
      )
    })
    const [first] = levels
    const spanLo = Math.min(...first.map((item) => item.y))
    assert.ok(Math.abs(spanLo - first.find((item) => item.ratio === 1.272)!.y) < 1e-9)
    assert.equal(new Set(first.map((item) => item.y.toFixed(4))).size, 5)
  }
})

test("the stars are sorted before they are placed, like the numbers", () => {
  assert.deepEqual(placeStars([9, 3], 12), placeStars([3, 9], 12))
  assert.deepEqual(placeStars([9, 3], 12), [3, 9])
  const random = lcg(4)
  for (let round = 0; round < 300; round += 1) {
    const tips = [Math.floor(random() * 16) - 2, Math.floor(random() * 16) - 2]
    const target = 3 + Math.floor(random() * 21)
    assert.deepEqual(placeStars(tips, target), placeStars([tips[1], tips[0]], target))
  }
  const missing = placeStars([Number.NaN, Number.POSITIVE_INFINITY], 13)
  assert.ok(missing[0] < missing[1] && missing[0] + missing[1] === 13)
})

test("parseSkillParams reads text and numbers the same way, refuses a minus sign, and reads a ratio only for or", () => {
  const read = (record: Record<string, unknown>, gesture = "or") =>
    parseSkillParams({ curve: "n1", gesture, ...record })
  assert.equal(read({ window: "-5" }), null)
  assert.equal(read({ window: "−5" }), null)
  assert.equal(read({ window: -5 }), null)
  assert.equal(read({ days: "-30" }, "moyenne"), null)
  assert.equal(read({ days: -30 }, "moyenne"), null)
  assert.equal(read({ window: "8.5" })?.window, 9)
  assert.equal(read({ window: "8,5" })?.window, 9)
  assert.equal(read({ window: 8.5 })?.window, 9)
  assert.equal(read({ window: "8.4" })?.window, 8)
  assert.equal(read({ days: "30.6" }, "moyenne")?.days, 31)
  assert.equal(read({ days: 30.6 }, "moyenne")?.days, 31)
  assert.equal(read({ window: " 12 tirages" })?.window, 12)

  assert.equal(read({ window: "" })?.window, 8)
  assert.equal(read({ window: "  " })?.window, 8)
  assert.equal(read({ days: "" })?.days, null)
  assert.equal(read({ ratio: "" })?.ratio, 0.618)
  assert.equal(read({ span: "" })?.span, "bande")
  assert.equal(read({ n: "" }, "figure")?.n, null)
  assert.equal(read({ forme: "" }, "figure")?.forme, "triangle")
  assert.equal(read({ suite: "", r: "" }, "suite")?.r, 2)

  assert.equal(read({ ratio: 0.5 }), null)
  assert.equal(read({ ratio: "1,272" })?.ratio, 1.272)
  assert.equal(read({ ratio: 0.667 })?.ratio, 0.618)
  for (const gesture of ["persiste", "glisse", "miroir", "moyenne", "soir", "suite", "figure"]) {
    assert.equal(read({ ratio: 0.5 }, gesture)?.ratio, 0.618, gesture)
    assert.equal(read({ ratio: 1.618 }, gesture)?.ratio, 0.618, gesture)
    assert.equal(read({ ratio: "n’importe quoi" }, gesture)?.ratio, 0.618, gesture)
  }
})

test("the runners are capped at 18, one different gesture each, by createMinds and by the children", () => {
  assert.equal(RUNNER_MAX, 18)
  assert.equal(createMinds(RUNNER_MAX + 1).length, RUNNER_MAX)
  assert.equal(createMinds(50).length, RUNNER_MAX)
  assert.equal(createMinds(RUNNER_MAX).length, RUNNER_MAX)
  assert.equal(createMinds(0).length, 1)

  const rows = urn(70, 9)
  const ends = [30, 41, 52, 63]
  const minds = createMinds(RUNNER_MAX)
  const starts = minds.map((runner) => runner.skills[0].versions[0])
  const params = starts.map(({ gesture, ratio, span, window, days, r, forme, n }) =>
    JSON.stringify({ gesture, ratio, span, window, days, r, forme, n })
  )
  assert.equal(new Set(params).size, RUNNER_MAX)
  const grids = minds.map((runner) =>
    ends.map((end) => JSON.stringify(think(runner, rows.slice(0, end), { hiddenDate: rows[end].date }).guess)).join("|")
  )
  assert.equal(new Set(grids).size, RUNNER_MAX)

  const record = championRecord({
    runner: { ...newRunner(minds[0]), cents: 5400, examCents: 5100 },
    generation: 2,
    raceFrom: rows[40].date,
    raceTo: rows[60].date,
    journal: [],
    savedAt: "2026-10-30T12:00:00.000Z",
  })
  assert.equal(childrenOf(record, 50, rows[50].date).length, RUNNER_MAX)
  assert.equal(childrenOf(record, RUNNER_MAX + 1, rows[50].date).length, RUNNER_MAX)
  assert.equal(childrenOf(record, 5, rows[50].date).length, 5)
  assert.equal(childrenOf(record, 0, rows[50].date).length, 1)
})

test("a champion written before the new rules is read as it played", () => {
  const stored = (version: Record<string, unknown>) =>
    parseChampion({
      generation: 3,
      runner: "R2",
      cents: 5200,
      skills: [
        {
          id: "r2-base",
          name: "Base",
          versions: [{ version: 1, parent: null, cutoff: "", origin: "variation", phrase: "", examCents: null, ...version }],
        },
      ],
    })?.skills[0].versions[0]
  const suite = stored({ curve: "n3", gesture: "suite", suite: "logistique", r: 2.8, ratio: 0.618, span: "pas", window: 8, days: null })
  assert.equal(suite?.span, "pas")
  assert.equal(suite?.r, 2.8)
  assert.equal(parseSkillParams({ curve: "n3", gesture: "suite", suite: "logistique", r: 2.8, span: "pas" }), null)
  const figure = stored({ curve: "e1", gesture: "figure", forme: "sin", n: 12, ratio: 0.618, span: "bande", window: 3, days: 20 })
  assert.equal(figure?.window, 3)
  assert.equal(figure?.days, 20)
  assert.equal(parseSkillParams({ curve: "e1", gesture: "figure", forme: "sin", n: 12, window: 3, days: 20 })?.window, 14)
  const cosine = stored({ curve: "e1", gesture: "figure", forme: "cos", n: 12, ratio: 0.618, span: "bande", window: 12, days: null })
  assert.equal(cosine?.forme, "sin")
  assert.equal(cosine?.n, 12)
  assert.equal(cosine?.window, 12)
  const plain = stored({ curve: "*", gesture: "persiste", ratio: 1.272, span: "lignes", window: 8, days: null })
  assert.equal(plain?.ratio, 1.272)
  assert.equal(parseSkillParams({ curve: "*", gesture: "persiste", ratio: 1.272, span: "lignes" })?.ratio, 0.618)
  assert.equal(stored({ curve: "n9", gesture: "persiste" }), undefined)
})

test("a proposed figure rises to calibre plus two, so masque can correspond on a perfect sine", () => {
  const parsed = parseSkillParams({ curve: "n1", gesture: "figure", forme: "sin", n: 12, window: 12 })
  assert.ok(parsed)
  assert.equal(parsed.window, 14)
  const values = Array.from({ length: 16 }, (_, index) =>
    Math.round((25 + 20 * Math.sin((2 * Math.PI * index) / 12)) * 10) / 10
  )
  const thought = think(mindWith(parsed, "n1"), withN1(values))
  assert.equal(thought.draw.lecture.masque, "correspond")
  assert.equal(readFigure(values.slice(-14), "sin", 12).correspond, true)
  // Une version stockée garde la fenêtre telle qu’elle a joué.
  assert.equal(parseStoredSkillParams({ curve: "n1", gesture: "figure", forme: "sin", n: 12, window: 12 })?.window, 12)
  assert.equal(parseStoredSkillParams({ curve: "n1", gesture: "figure", forme: "sin", n: 12, window: 3 })?.window, 3)
})

test("days is refused outside moyenne and figure in a proposal, and kept in a stored version", () => {
  assert.equal(parseSkillParams({ curve: "n1", gesture: "or", window: 3, days: 90 }), null)
  assert.equal(parseSkillParams({ curve: "n1", gesture: "suite", days: 90 }), null)
  assert.equal(parseSkillParams({ curve: "n1", gesture: "persiste", days: 90 }), null)
  assert.equal(parseSkillParams({ curve: "n1", gesture: "moyenne", days: 90 })?.days, 90)
  assert.equal(parseSkillParams({ curve: "n1", gesture: "figure", forme: "sin", n: 12, days: 90 })?.days, 90)
  assert.equal(parseStoredSkillParams({ curve: "n1", gesture: "or", window: 3, days: 90 })?.days, 90)
  assert.equal(parseStoredSkillParams({ curve: "n1", gesture: "suite", days: 90 })?.days, 90)
  const prompt = buildPrompt({ mind, past: series(4), hiddenDate: "2099-01-01", examCents: null, notes: [], drawing: null })
  assert.match(prompt.system, /days ne vaut que pour moyenne et figure/)
  assert.match(prompt.system, /calibre plus deux/)
})

test("a stored version out of bounds is clamped, and its champion stays readable", () => {
  const champion = parseChampion({
    generation: 3,
    runner: "R2",
    cents: 5200,
    skills: [
      {
        id: "r2-base",
        name: "Base",
        versions: [
          {
            version: 1,
            parent: null,
            cutoff: "",
            origin: "variation",
            phrase: "",
            examCents: null,
            curve: "n1",
            gesture: "or",
            ratio: 0.5,
            span: "bande",
            window: 100,
            days: null,
          },
          {
            version: 2,
            parent: 1,
            cutoff: "",
            origin: "variation",
            phrase: "",
            examCents: null,
            curve: "e1",
            gesture: "figure",
            forme: "sin",
            n: 5,
            ratio: 0.618,
            span: "bande",
            window: 100,
            days: null,
          },
        ],
      },
    ],
  })
  assert.ok(champion)
  const [golden, figure] = champion.skills[0].versions
  assert.equal(golden.ratio, 0.382)
  assert.equal(golden.window, 60)
  assert.equal(figure.n, 8)
  assert.equal(figure.window, 60)
  assert.equal(parseStoredSkillParams({ curve: "n9", gesture: "or" }), null)
  assert.equal(parseStoredSkillParams({ curve: "n1", gesture: "nope" }), null)
})

test("flat decade tips push toward one per decade, unlike no thought and unlike a skewed thought", () => {
  const tips = [12.4, 21.8, 31.2, 35.6, 44.1]
  const flat = placeNumbers(tips, 140, [1, 1, 1, 1, 1])
  const none = placeNumbers(tips, 140, undefined)
  const skewed = placeNumbers(tips, 140, [4, 1, 1, 1, 0])
  assert.deepEqual(flat, [11, 20, 30, 35, 44])
  assert.deepEqual(none, [11, 21, 30, 35, 43])
  assert.notDeepEqual(flat, none)
  assert.notDeepEqual(flat, skewed)
  assert.deepEqual(placeNumbers(tips, 140, []), none)
})

test("a stored figure longer than its window says so in the phrase and stays in place", () => {
  const params: SkillParams = {
    curve: "n1",
    gesture: "figure",
    forme: "sin",
    n: 12,
    ratio: 0.618,
    span: "bande",
    window: 3,
    days: null,
  }
  const thought = think(mindWith(params, "n1"), withN1([10, 20, 30, 40]))
  assert.match(thought.draw.phrase, /figure non lue, reste sur place/)
  assert.equal(thought.tips.n1, 40)
})
