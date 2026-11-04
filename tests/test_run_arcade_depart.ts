import assert from "node:assert/strict"
import test from "node:test"

import { championRecord, parseChampion, replayLastGrid } from "../src/lib/run-arcade/champion.ts"
import type { RankPoint } from "../src/lib/run-arcade/curves.ts"
import {
  assignDeparts,
  departDates,
  departSentence,
  droppedBefore,
  sincePast,
  snapDepart,
} from "../src/lib/run-arcade/depart.ts"
import { EXAM_WINDOW, examStart, examine } from "../src/lib/run-arcade/examen.ts"
import { PROMPT_ROWS, buildPrompt } from "../src/lib/run-arcade/prompt.ts"
import {
  createSession,
  type BraveReply,
  type BraveRequest,
  type IaReply,
  type IaRequest,
  type SessionDeps,
} from "../src/lib/run-arcade/session.ts"
import { newSkill } from "../src/lib/run-arcade/skills.ts"
import { createMinds, createRace, newRunner, playTurn, revealedPast, think } from "../src/lib/run-arcade/thought.ts"

function dateAt(index: number) {
  return new Date(Date.UTC(2025, 0, 3 + index * 3, 12)).toISOString().slice(0, 10)
}

function series(length: number): RankPoint[] {
  return Array.from({ length }, (_, index) => ({
    date: dateAt(index),
    n1: 2 + (index % 5),
    n2: 10 + (index % 4),
    n3: 20 + (index % 6),
    n4: 30 + (index % 5),
    n5: 40 + (index % 7),
    e1: 1 + (index % 5),
    e2: 7 + (index % 5),
  }))
}

const flush = () => new Promise((resolve) => setImmediate(resolve))

function harness() {
  const ia: { request: IaRequest; resolve: (reply: IaReply) => void }[] = []
  const deps: SessionDeps = {
    now: () => 0,
    setTimer: () => 1,
    clearTimer: () => undefined,
    askIa: (request, signal) =>
      new Promise((resolve) => {
        ia.push({ request, resolve })
        signal.addEventListener("abort", () => resolve({ ok: false, error: "coupé", aborted: true }))
      }),
    askBrave: (_request: BraveRequest, signal) =>
      new Promise((resolve) => {
        signal.addEventListener("abort", () => resolve({ ok: false, error: "coupé", aborted: true } satisfies BraveReply))
      }),
    saveChampion: async () => ({ ok: true, source: "test" }),
  }
  return { ia, session: createSession(deps) }
}

test("a day without a draw snaps to the next draw, and an exam date snaps back", () => {
  const free = series(76)
  const last = examStart(free.length) - 2
  assert.equal(departDates(free).at(-1), free[last].date)
  assert.equal(snapDepart(free, "2025-01-04"), free[1].date)
  assert.equal(snapDepart(free, free[3].date), free[3].date)
  assert.equal(snapDepart(free, "1999-01-01"), free[0].date)
  assert.equal(snapDepart(free, free[60].date), free[last].date)
  assert.equal(snapDepart(free, "2099-01-01"), free[last].date)
  assert.ok(free[60].date > free[last].date)
  assert.equal(droppedBefore(free, free[0].date), 0)
  assert.equal(droppedBefore(free, free[last].date), last)
})

test("the call shows at most the twelve latest draws of the allowed past", () => {
  const past = series(40)
  const mind = createMinds(1)[0]
  const prompt = buildPrompt({
    mind,
    past,
    hiddenDate: "2099-01-01",
    examCents: null,
    notes: [],
    drawing: null,
    since: past[0].date,
    dropped: 0,
  })
  const [header, lines] = prompt.user.split("Derniers tirages lus")
  const shown = past.slice(-PROMPT_ROWS)
  for (const row of shown) assert.equal(lines.includes(row.date), true)
  for (const row of past.slice(0, past.length - PROMPT_ROWS)) assert.equal(lines.includes(row.date), false)
  assert.match(header, new RegExp(past[0].date))
  assert.match(header, /40 tirages lus/)
  assert.match(header, /0 tirage écarté/)
})

test("random starts stay the same for a seed and differ between runners", () => {
  const free = series(76)
  const first = assignDeparts(free, 8, { mode: "aleatoire" }, 42)
  const again = assignDeparts(free, 8, { mode: "aleatoire" }, 42)
  assert.deepEqual(again, first)
  assert.equal(new Set(first).size, 8)
  for (const date of first) assert.ok(departDates(free).includes(date))
  assert.notDeepEqual(assignDeparts(free, 8, { mode: "aleatoire" }, 7), first)
  const fixed = assignDeparts(free, 5, { mode: "fixe", date: "2025-01-04" }, 1)
  assert.deepEqual(fixed, Array.from({ length: 5 }, () => free[1].date))
})

test("the prompt keeps the twelve latest allowed draws and names the start", async () => {
  const rows = series(80)
  const since = rows[45].date
  const { ia, session } = harness()
  session.launch({
    count: 1,
    draws: 4,
    minutes: 1,
    series: rows,
    champion: null,
    depart: { mode: "fixe", date: since },
  })
  await flush()
  const call = ia[0]
  assert.ok(call)
  const user = call.request.user
  assert.match(user, new RegExp(departSentence(since, 6, 45).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")))
  for (let index = 45; index <= 50; index += 1) assert.equal(user.includes(rows[index].date), true)
  for (const row of rows.slice(0, 45)) assert.equal(user.includes(row.date), false)
  for (const row of rows.slice(51)) assert.equal(user.includes(row.date), false)
  const runner = session.getSnapshot().race?.runners[0]
  assert.equal(runner?.since, since)
  assert.match(session.getSnapshot().xrayPrep[0]?.detail ?? "", new RegExp(`départ ${since}`))
  assert.match(session.getSnapshot().xrayPrep[0]?.detail ?? "", /45 écartés/)
  session.dispose()
})

test("a launch without a date starts every runner on the first draw", () => {
  const rows = series(40)
  const { session } = harness()
  session.launch({ count: 3, draws: 4, minutes: 0, series: rows, champion: null })
  const runners = session.getSnapshot().race?.runners ?? []
  assert.equal(runners.length, 3)
  for (const runner of runners) assert.equal(runner.since, rows[0].date)
  session.dispose()
})

test("the race thought ignores draws before the start, and the exam window stays put", () => {
  const rows = series(40)
  for (let index = 0; index < 12; index += 1) {
    rows[index] = { ...rows[index], n1: 1, n2: 2, n3: 3, n4: 4, n5: 5 }
  }
  const minds = createMinds(1)
  const params = {
    curve: "*" as const,
    gesture: "moyenne" as const,
    ratio: 0.618 as const,
    span: "bande" as const,
    window: 60,
    days: null,
  }
  minds[0] = {
    ...minds[0],
    skills: [newSkill("r1-base", "Base", params, { cutoff: "", origin: "maison", examCents: null })],
  }
  const race = createRace(minds, rows.length, 4)
  const since = rows[12].date
  race.runners[0] = { ...race.runners[0], since }
  const hidden = rows[race.cursor].date
  const full = think(minds[0], revealedPast(rows, race.cursor), { hiddenDate: hidden })
  const cut = think(minds[0], sincePast(revealedPast(rows, race.cursor), since), { hiddenDate: hidden })
  assert.equal(full.draw.trail.length, race.cursor)
  assert.equal(cut.draw.trail.length, race.cursor - 12)
  assert.notEqual(full.tips.sumNumbers, cut.tips.sumNumbers)
  const played = playTurn(race, rows).runners[0]
  assert.equal(played.thought?.trail.length, cut.draw.trail.length)
  assert.equal(played.thought?.thoughtValue, cut.draw.thoughtValue)

  const wide = examine(minds[0], rows)
  const clipped = examine(minds[0], rows, EXAM_WINDOW, since)
  assert.equal(clipped.from, wide.from)
  assert.equal(clipped.to, wide.to)
  assert.equal(clipped.turns, wide.turns)
})

test("the exported champion keeps its start as depart, not as since", () => {
  const mind = createMinds(1)[0]
  const runner = { ...newRunner(mind), since: "2025-04-04", cents: 5400, turns: 7 }
  const record = championRecord({
    runner,
    generation: 1,
    raceFrom: "2025-06-01",
    raceTo: "2025-08-01",
    journal: [],
    savedAt: "2025-08-02T00:00:00.000Z",
  })
  assert.equal("since" in record, false)
  assert.equal(record.depart, "2025-04-04")
  assert.equal(record.raceTurns, 7)
  const reread = parseChampion(JSON.parse(JSON.stringify(record)))
  assert.equal(reread?.depart, "2025-04-04")
  assert.equal(reread?.raceTurns, 7)
})

test("replaying the champion with a late start and a long average returns the grid it played", () => {
  const rows = series(40)
  for (let index = 0; index < 12; index += 1) {
    rows[index] = { ...rows[index], n1: 1, n2: 2, n3: 3, n4: 4, n5: 5 }
  }
  const params = {
    curve: "*" as const,
    gesture: "moyenne" as const,
    ratio: 0.618 as const,
    span: "bande" as const,
    window: 60,
    days: null,
  }
  const mind = {
    ...createMinds(1)[0],
    skills: [newSkill("r1-base", "Base", params, { cutoff: "", origin: "maison", examCents: null })],
  }
  const since = rows[12].date
  const runner = { ...newRunner(mind), since, cents: 5400, turns: 4 }
  const record = championRecord({
    runner,
    generation: 1,
    raceFrom: rows[36].date,
    raceTo: rows[39].date,
    journal: [],
    savedAt: "2025-08-02T00:00:00.000Z",
  })
  const reread = parseChampion(JSON.parse(JSON.stringify(record)))
  assert.ok(reread)
  const replay = replayLastGrid(reread, rows)
  assert.ok(replay)
  const played = think(mind, sincePast(revealedPast(rows, 39), since), { hiddenDate: rows[39].date })
  assert.deepEqual(replay.thought.guess, played.guess)
  assert.equal(replay.thought.draw.trail.length, 39 - 12)
  const full = think(mind, revealedPast(rows, 39), { hiddenDate: rows[39].date })
  assert.notEqual(full.draw.trail.length, replay.thought.draw.trail.length)
})
