import assert from "node:assert/strict"
import test from "node:test"

import type { ChampionRecord } from "../src/lib/run-arcade/champion.ts"
import { formatDuration, median, raceDurationMs, rotate, servedPerSlice, sliceMs } from "../src/lib/run-arcade/clock.ts"
import type { RankPoint } from "../src/lib/run-arcade/curves.ts"
import { EXAM_WINDOW } from "../src/lib/run-arcade/examen.ts"
import {
  createSession,
  type BraveReply,
  type BraveRequest,
  type IaReply,
  type IaRequest,
  type SessionDeps,
} from "../src/lib/run-arcade/session.ts"
import { addVersion, newSkill } from "../src/lib/run-arcade/skills.ts"

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

class FakeClock {
  time = 0
  private seq = 0
  private timers: { id: number; at: number; fn: () => void }[] = []

  now = () => this.time

  setTimer = (fn: () => void, ms: number) => {
    this.seq += 1
    this.timers.push({ id: this.seq, at: this.time + ms, fn })
    return this.seq
  }

  clearTimer = (handle: unknown) => {
    this.timers = this.timers.filter((timer) => timer.id !== handle)
  }

  async advance(ms: number) {
    const end = this.time + ms
    for (;;) {
      const due = this.timers.filter((timer) => timer.at <= end).sort((a, b) => a.at - b.at || a.id - b.id)[0]
      if (!due) break
      this.timers = this.timers.filter((timer) => timer !== due)
      this.time = due.at
      due.fn()
      await flush()
    }
    this.time = end
    await flush()
  }
}

type Waiting<Q, R> = { request: Q; resolve: (reply: R) => void }

function harness(parallel = 1) {
  const clock = new FakeClock()
  const ia: Waiting<IaRequest, IaReply>[] = []
  const brave: Waiting<BraveRequest, BraveReply>[] = []
  const saved: ChampionRecord[] = []
  const deps: SessionDeps = {
    now: clock.now,
    setTimer: clock.setTimer,
    clearTimer: clock.clearTimer,
    askIa: (request, signal) =>
      new Promise((resolve) => {
        ia.push({ request, resolve })
        signal.addEventListener("abort", () => resolve({ ok: false, error: "coupé", aborted: true }))
      }),
    askBrave: (request, signal) =>
      new Promise((resolve) => {
        brave.push({ request, resolve })
        signal.addEventListener("abort", () => resolve({ ok: false, error: "coupé", aborted: true }))
      }),
    saveChampion: async (record) => {
      saved.push(record)
      return { ok: true, source: "test" }
    },
    parallel,
  }
  return { clock, ia, brave, saved, session: createSession(deps) }
}

const unreadable: IaReply = { ok: true, text: "je réfléchis", latencyMs: 4000, model: "test", vision: false }

function skillReply(curve: string): IaReply {
  return {
    ok: true,
    text: JSON.stringify({ action: "skill", name: "Essai", curve, gesture: "moyenne", window: 5, days: 30 }),
    latencyMs: 6000,
    model: "test",
    vision: false,
  }
}

test("Y = 0 starts the race at reading pace without a call slice", async () => {
  const { ia, session } = harness(1)
  session.launch({ count: 2, draws: 4, minutes: 0, series: series(40), champion: null })
  await flush()
  const snap = session.getSnapshot()
  assert.equal(snap.phase, "course")
  assert.equal(snap.minutes, 0)
  assert.equal(snap.sliceMs, 0)
  assert.equal(ia.length, 0)
  session.dispose()
})

test("the clock shares Y minutes between the race draws and rotates the order", () => {
  assert.equal(sliceMs(10, 25), 24_000)
  assert.equal(sliceMs(0, 25), 0)
  assert.deepEqual(rotate(["r1", "r2", "r3"], 1), ["r2", "r3", "r1"])
  assert.deepEqual(rotate(["r1", "r2", "r3"], 4), ["r2", "r3", "r1"])
  assert.equal(median([3, 1, 2]), 2)
  assert.equal(median([1, 2, 3, 4]), 2.5)
  assert.equal(servedPerSlice(24_000, 6_000), 4)
  assert.equal(raceDurationMs(25, 24_000), 600_000)
  assert.equal(formatDuration(600_000), "10 min")
  assert.equal(formatDuration(24_000), "24 s")
})

test("the avant-course prompt skips the exam window, and each pass starts one runner later", async () => {
  const { ia, session } = harness(1)
  const rows = series(40)
  session.launch({ count: 3, draws: 4, minutes: 1, series: rows, champion: null })
  assert.equal(session.getSnapshot().phase, "avant")
  for (let step = 0; step < 6; step += 1) {
    await flush()
    ia[step].resolve(unreadable)
  }
  await flush()
  assert.deepEqual(
    ia.slice(0, 6).map((call) => call.request.runnerId),
    ["r1", "r2", "r3", "r2", "r3", "r1"]
  )
  const read = 36 - EXAM_WINDOW
  for (const call of ia) {
    assert.ok(call.request.user.includes(rows[read - 1].date))
    for (const row of rows.slice(read)) assert.equal(call.request.user.includes(row.date), false)
  }
  session.dispose()
})

test("a late reply plays at the next turn, after the exam", async () => {
  const { clock, ia, session } = harness(1)
  session.launch({ count: 2, draws: 4, minutes: 1, series: series(40), champion: null })
  await flush()
  assert.equal(ia.length, 1)
  session.skip()
  assert.equal(session.getSnapshot().phase, "course")
  const slice = session.getSnapshot().sliceMs
  assert.equal(slice, 15_000)
  await clock.advance(slice)
  assert.equal(session.getSnapshot().race?.cursor, 37)
  ia[0].resolve(skillReply("sumNumbers"))
  await flush()
  const journal = () => session.getSnapshot().journal
  assert.ok(journal().some((entry) => entry.kind === "ia"))
  assert.equal(
    journal().some((entry) => entry.kind === "skill" || entry.detail.startsWith("examen")),
    false
  )
  await clock.advance(slice)
  const applied = journal().find((entry) => entry.kind === "skill" || entry.detail.startsWith("examen"))
  assert.ok(applied)
  assert.equal(applied.turn, 2)
  assert.ok(applied.cutoff < series(40)[36].date)
  session.dispose()
})

test("a ruined runner stops calling, its skills stay as they were", async () => {
  const { ia, session } = harness(2)
  session.launch({ count: 2, draws: 4, minutes: 1, series: series(40), champion: null })
  await flush()
  assert.deepEqual(
    ia.map((call) => call.request.runnerId),
    ["r1", "r2"]
  )
  const before = session.getSnapshot().race?.runners[0].mind.skills
  const race = session.getSnapshot().race
  assert.ok(race)
  const internal = session as unknown as { set(patch: object): void }
  internal.set({
    race: { ...race, runners: race.runners.map((runner) => (runner.mind.id === "r1" ? { ...runner, alive: false } : runner)) },
  })
  const seen = ia.length
  for (let round = 0; round < 4; round += 1) {
    for (const call of ia.slice(-2)) call.resolve(round === 0 ? skillReply("n3") : unreadable)
    await flush()
  }
  assert.ok(ia.length > seen)
  assert.ok(ia.slice(seen).every((call) => call.request.runnerId === "r2"))
  assert.deepEqual(session.getSnapshot().race?.runners[0].mind.skills, before)
  session.dispose()
})

test("a pause freezes the clock, resume picks up the time left", async () => {
  const { clock, session } = harness(1)
  session.launch({ count: 2, draws: 4, minutes: 1, series: series(40), champion: null })
  await clock.advance(20_000)
  session.pause()
  assert.equal(session.getSnapshot().pausedLeftMs, 40_000)
  await clock.advance(120_000)
  assert.equal(session.getSnapshot().phase, "avant")
  session.resume()
  await clock.advance(39_000)
  assert.equal(session.getSnapshot().phase, "avant")
  await clock.advance(1_000)
  assert.equal(session.getSnapshot().phase, "course")
  session.dispose()
})

test("an absent local IA stops the calls, the race goes on", async () => {
  const { clock, ia, session } = harness(1)
  session.launch({ count: 2, draws: 4, minutes: 1, series: series(40), champion: null })
  await flush()
  ia[0].resolve({ ok: false, error: "LLM local injoignable", absent: true })
  await flush()
  assert.equal(session.getSnapshot().ia, "absente")
  await clock.advance(60_000)
  await clock.advance(15_000)
  assert.equal(ia.length, 1)
  assert.equal(session.getSnapshot().phase, "course")
  assert.equal(session.getSnapshot().race?.cursor, 37)
  session.dispose()
})

test("the race ends on its last draw, saves one champion, and calls nothing more", async () => {
  const { ia, saved, session } = harness(1)
  session.launch({ count: 3, draws: 4, minutes: 1, series: series(40), champion: null })
  await flush()
  session.skip()
  for (let turn = 0; turn < 4; turn += 1) session.skip()
  await flush()
  const snapshot = session.getSnapshot()
  assert.equal(snapshot.phase, "fin")
  assert.equal(saved.length, 1)
  assert.equal(saved[0].generation, 1)
  assert.equal(snapshot.champion?.runner, saved[0].runner)
  assert.equal(snapshot.save.state, "ok")
  const calls = ia.length
  for (const call of ia) call.resolve(unreadable)
  await flush()
  assert.equal(ia.length, calls)
})

test("Brave follows the referee cutoff and waits on a 429", async () => {
  const { clock, ia, brave, session } = harness(1)
  const rows = series(40)
  session.launch({ count: 1, draws: 4, minutes: 1, series: rows, champion: null })
  await flush()
  ia[0].resolve({ ok: true, text: '{"action":"brave","query":"nombre d’or"}', latencyMs: 3000, model: "t", vision: false })
  await flush()
  assert.equal(brave.length, 1)
  assert.deepEqual(brave[0].request, { query: "nombre d’or", from: "2024-01-01", cutoff: rows[36].date })
  brave[0].resolve({ ok: false, error: "HTTP 429", retryAfterMs: 1000 })
  await flush()
  assert.equal(ia.length, 1)
  await clock.advance(1000)
  assert.equal(brave.length, 2)
  brave[1].resolve({ ok: true, results: [{ title: "Suites et φ", url: "https://exemple.fr", snippet: "…" }] })
  await flush()
  assert.equal(ia.length, 2)
  assert.ok(ia[1].request.user.includes("Suites et φ"))
  session.dispose()
})

test("the next generation starts from the champion without its late versions", () => {
  const { session } = harness(1)
  const rows = series(40)
  const hiddenDate = rows[36].date
  const base = newSkill(
    "r1-base",
    "Base",
    { curve: "*", gesture: "glisse", ratio: 0.618, span: "bande", window: 8, days: null },
    { cutoff: "", origin: "maison", examCents: null }
  )
  const late = addVersion(
    base,
    { curve: "*", gesture: "miroir", ratio: 0.618, span: "bande", window: 5, days: null },
    { cutoff: hiddenDate, origin: "ia", examCents: 5200 }
  )
  const champion: ChampionRecord = {
    generation: 3,
    runner: "R1",
    cents: 5600,
    examCents: 5200,
    calls: 7,
    raceFrom: hiddenDate,
    raceTo: rows[39].date,
    skills: [late],
    journal: [],
    savedAt: "2026-10-30T09:00:00.000Z",
  }
  session.launch({ count: 3, draws: 4, minutes: 0, series: rows, champion })
  const snapshot = session.getSnapshot()
  assert.equal(snapshot.generation, 4)
  assert.equal(snapshot.setAside, 1)
  for (const runner of snapshot.race?.runners ?? []) {
    for (const skill of runner.mind.skills) {
      assert.ok(skill.versions.every((version) => version.cutoff < hiddenDate))
    }
    assert.ok(runner.added <= 1)
  }
  session.dispose()
})

test("a house variation is written before the exam window and kept only if the exam rises", () => {
  const { session } = harness(1)
  const rows = series(80)
  const quiet: SessionDeps = {
    now: () => 0,
    setTimer: () => 0,
    clearTimer: () => {},
    askIa: async () => unreadable,
    askBrave: async () => ({ ok: false, error: "absente", absent: true }),
    saveChampion: async () => ({ ok: true, source: "test" }),
  }
  const first = createSession(quiet)
  first.launch({ count: 6, draws: 10, minutes: 0, series: rows, champion: null })
  for (let turn = 0; turn < 12 && first.getSnapshot().phase !== "fin"; turn += 1) first.skip()
  const champion = first.getSnapshot().champion
  assert.ok(champion)
  session.launch({ count: 8, draws: 10, minutes: 0, series: rows, champion })
  const runners = session.getSnapshot().race?.runners ?? []
  const baseline = runners[0].examCents ?? 0
  const readEnd = rows[70 - EXAM_WINDOW - 1].date
  let kept = 0
  for (const runner of runners.slice(1)) {
    for (const skill of runner.mind.skills) {
      for (const version of skill.versions) {
        if (version.origin !== "variation") continue
        kept += 1
        assert.equal(version.cutoff, readEnd)
        assert.ok((runner.examCents ?? 0) > baseline)
      }
    }
  }
  assert.ok(kept > 0)
  first.dispose()
  session.dispose()
})
