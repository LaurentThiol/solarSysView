import assert from "node:assert/strict"
import test from "node:test"

import type { ChampionRecord } from "../src/lib/run-arcade/champion.ts"
import { formatDuration, median, raceDurationMs, rotate, servedPerSlice, sliceMs } from "../src/lib/run-arcade/clock.ts"
import { buildTrack, type RankPoint } from "../src/lib/run-arcade/curves.ts"
import { sincePast } from "../src/lib/run-arcade/depart.ts"
import { EXAM_WINDOW, promptPast } from "../src/lib/run-arcade/examen.ts"
import { strongestRelation } from "../src/lib/run-arcade/relation.ts"
import { lectureFromText } from "../src/lib/run-arcade/prompt.ts"
import {
  BRAVE_SEARCH_CAP,
  createSession,
  type BraveReply,
  type BraveRequest,
  type IaReply,
  type IaRequest,
  type SessionDeps,
} from "../src/lib/run-arcade/session.ts"
import { addVersion, describeSkill, newSkill } from "../src/lib/run-arcade/skills.ts"
import { fonctionnelBoard } from "../src/lib/run-arcade/fonctionnel.ts"
import { revealedPast, RUNNER_MAX } from "../src/lib/run-arcade/thought.ts"
import { activityLines, braveHeadline, braveResultDetail, chainHiddenDate, thoughtChain, xrayFeed } from "../src/lib/run-arcade/xray.ts"

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

function harness(parallel = 1, capture?: SessionDeps["capture"]) {
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
    capture,
    parallel,
  }
  return { clock, ia, brave, saved, session: createSession(deps) }
}

const unreadable: IaReply = { ok: true, text: "je réfléchis", latencyMs: 4000, model: "test", vision: false }

function skillReply(curve: string, request: IaRequest): Extract<IaReply, { ok: true }> {
  return {
    ok: true,
    text: JSON.stringify({
      action: "skill",
      name: "Essai",
      curve,
      gesture: "moyenne",
      window: 5,
      days: 30,
      lecture: lectureFromText(request.user),
    }),
    latencyMs: 6000,
    model: "test",
    vision: false,
  }
}

function braveReply(request: IaRequest, query: string): IaReply {
  return {
    ok: true,
    text: JSON.stringify({ action: "brave", query, lecture: lectureFromText(request.user) }),
    latencyMs: 3000,
    model: "t",
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
  ia[0].resolve(skillReply("sumNumbers", ia[0].request))
  await flush()
  const journal = () => session.getSnapshot().journal
  assert.ok(journal().some((entry) => entry.kind === "ia"))
  const proposed = journal().find((entry) => entry.kind === "ia")
  assert.match(proposed?.detail ?? "", /appel en texte, sans image/)
  assert.match(proposed?.detail ?? "", /tangente (correspond|s’écarte)/)
  assert.match(proposed?.detail ?? "", /propose :/)
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
    for (const call of ia.slice(-2)) call.resolve(round === 0 ? skillReply("n3", call.request) : unreadable)
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

test("an absent local IA is probed again every 15 s, and the race goes on meanwhile", async () => {
  const { clock, ia, session } = harness(1)
  const absent: IaReply = { ok: false, error: "LLM local injoignable", absent: true }
  session.launch({ count: 2, draws: 4, minutes: 1, series: series(40), champion: null })
  await flush()
  ia[0].resolve(absent)
  await flush()
  assert.equal(session.getSnapshot().ia, "absente")
  await clock.advance(14_000)
  assert.equal(ia.length, 1)
  assert.equal(session.getSnapshot().ia, "absente")
  await clock.advance(1_000)
  assert.equal(ia.length, 2)
  assert.equal(session.getSnapshot().ia, "inconnu")

  ia[1].resolve(absent)
  await flush()
  assert.equal(session.getSnapshot().ia, "absente")
  await clock.advance(14_000)
  assert.equal(ia.length, 2)
  await clock.advance(1_000)
  assert.equal(ia.length, 3)

  ia[2].resolve(unreadable)
  await flush()
  assert.equal(session.getSnapshot().ia, "ok")
  assert.equal(ia.length, 4)
  await clock.advance(30_000)
  assert.equal(session.getSnapshot().phase, "course")
  await clock.advance(15_000)
  assert.equal(session.getSnapshot().race?.cursor, 37)
  session.dispose()
})

test("launch rejects non-finite values before disposing, and inFlight follows pending after an absent reply", async () => {
  const { ia, session } = harness(1)
  session.launch({ count: 1, draws: 4, minutes: 1, series: series(40), champion: null })
  await flush()
  assert.equal(session.getSnapshot().inFlight, 1)
  const before = session.getSnapshot()
  for (const bad of [
    { count: 1, draws: Number.NaN, minutes: 1, series: series(40), champion: null },
    { count: Number.POSITIVE_INFINITY, draws: 4, minutes: 1, series: series(40), champion: null },
    { count: 1, draws: 4, minutes: Number.NaN, series: series(40), champion: null },
    { count: 1, draws: 4, minutes: 1, series: series(40), champion: null, seed: Number.NaN },
  ]) {
    assert.throws(() => session.launch(bad), /nombres finis/)
  }
  assert.equal(session.getSnapshot(), before, "un lancement refusé ne démonte pas la session en cours")
  ia[0].resolve({ ok: false, error: "LLM local injoignable", absent: true })
  await flush()
  assert.equal(session.getSnapshot().ia, "absente")
  assert.equal(session.getSnapshot().inFlight, 0)
  session.dispose()
})

test("a wake armed for the probe does not mask a nearer cooldown when the IA is back", async () => {
  const { clock, ia, session } = harness(2)
  session.launch({ count: 2, draws: 4, minutes: 5, series: series(40), champion: null })
  await flush()
  assert.equal(ia.length, 2)
  ia[0].resolve({ ok: false, error: "LLM local injoignable", absent: true })
  await flush()
  await clock.advance(2_000)
  ia[1].resolve(unreadable)
  await flush()
  assert.equal(session.getSnapshot().ia, "ok")
  assert.equal(ia.length, 4, "les deux runners repartent dès que l’IA répond")
  ia[2].resolve({ ok: false, error: "boom" })
  await flush()
  assert.equal(ia.length, 4)
  await clock.advance(2_000)
  assert.equal(ia.length, 5, "le réveil du cooldown proche part à 2 s, pas à la sonde de 15 s")
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

/** Ce que lit la session à son premier appel : le passé du prompt sans la fenêtre d’examen, et la relation qu’il en tire. */
function openingRead(rows: RankPoint[], draws = 4) {
  const track = buildTrack(rows)
  const readable = revealedPast(track, track.length - draws)
  const learned = promptPast(readable)
  return { readable, relation: strongestRelation(sincePast(learned, learned[0]?.date ?? "")) }
}

test("Brave stops at the first draw of the exam, and waits on a 429", async () => {
  const { clock, ia, brave, session } = harness(1)
  const rows = series(80)
  session.launch({ count: 1, draws: 4, minutes: 1, series: rows, champion: null })
  await flush()
  ia[0].resolve(braveReply(ia[0].request, "nombre d’or"))
  await flush()
  assert.equal(brave.length, 1)
  const { readable, relation } = openingRead(rows)
  assert.ok(relation)
  const firstExamDraw = readable[readable.length - EXAM_WINDOW].date
  // Le prompt ne lit pas l’examen : Brave ne lit rien d’aussi tardif. Le premier tirage de la course ne suffit pas.
  assert.equal(firstExamDraw, rows[51].date)
  assert.notEqual(firstExamDraw, rows[76].date)
  assert.deepEqual(brave[0].request, {
    query: relation.phrase,
    from: "2024-01-01",
    cutoff: firstExamDraw,
    through: rows[79].date,
  })
  assert.equal(brave[0].request.query.includes("nombre d’or"), false)
  brave[0].resolve({ ok: false, error: "HTTP 429", retryAfterMs: 1000 })
  await flush()
  assert.equal(ia.length, 1)
  await clock.advance(1000)
  assert.equal(brave.length, 2)
  assert.deepEqual(brave[1].request, brave[0].request)
  const waiting = session.getSnapshot().xrayBrave
  assert.equal(waiting.length, 1)
  assert.equal(waiting[0].state, "cours")
  assert.equal(waiting[0].query, relation.phrase)
  brave[1].resolve({ ok: true, results: [{ title: "Suites et φ", url: "https://exemple.fr", snippet: "…" }] })
  await flush()
  assert.equal(ia.length, 2)
  assert.ok(ia[1].request.user.includes("Suites et φ"))
  const done = session.getSnapshot().xrayBrave
  assert.equal(done.length, 1)
  assert.equal(done[0].state, "fait")
  assert.equal(done[0].detail, "1 résultat lisible")
  assert.equal(braveHeadline(done[0], "R1"), "R1 · avant-course · 1 résultat lisible")
  const noted = session.getSnapshot().journal.find((entry) => entry.kind === "brave")
  assert.ok(noted?.detail.includes(relation.phrase))
  session.dispose()
})

test("Brave stays quiet when the read series has no relation", async () => {
  const { ia, brave, session } = harness(1)
  const rows = series(30).map((point) => ({ ...point, n1: 4, n2: 10, n3: 20, n4: 30, n5: 40, e1: 1, e2: 2 }))
  session.launch({ count: 1, draws: 4, minutes: 1, series: rows, champion: null })
  await flush()
  session.pause()
  ia[0].resolve(braveReply(ia[0].request, "nombre d’or"))
  await flush()
  assert.equal(brave.length, 0)
  const refusal = session.getSnapshot().journal.find((entry) => entry.kind === "refus")
  assert.match(refusal?.detail ?? "", /aucune relation assez nette/)
  session.dispose()
})

const NOTE = { title: "Suites et φ", url: "https://exemple.fr", snippet: "…" }

/** Une recherche Brave ouverte, puis un « trop de requêtes » : la nouvelle tentative attend 5 secondes. */
async function waitingOn429() {
  const context = harness(1)
  context.session.launch({ count: 1, draws: 4, minutes: 1, series: series(80), champion: null })
  await flush()
  context.ia[0].resolve(braveReply(context.ia[0].request, "x"))
  await flush()
  context.brave[0].resolve({ ok: false, error: "HTTP 429", retryAfterMs: 5000 })
  await flush()
  assert.equal(context.brave.length, 1)
  return context
}

test("a retry after a 429 waits out a pause, and leaves at the resume", async () => {
  const { clock, brave, session } = await waitingOn429()
  session.pause()
  await clock.advance(6000)
  assert.equal(brave.length, 1)
  const held = session.getSnapshot()
  assert.equal(held.xrayBrave[0].state, "cours")
  assert.deepEqual(held.activity.searching.map((entry) => entry.runnerId), ["r1"])
  assert.equal(held.braveError, null)
  assert.equal(held.journal.some((entry) => entry.kind === "erreur"), false)
  assert.equal(held.xraySteps.some((step) => step.op === "recherche" && step.state !== "en cours"), false)
  session.resume()
  await clock.advance(4999)
  assert.equal(brave.length, 1)
  await clock.advance(1)
  assert.equal(brave.length, 2)
  session.dispose()
})

test("a 429 that arrives during a pause starts its wait at the resume", async () => {
  const { clock, ia, brave, session } = harness(1)
  session.launch({ count: 1, draws: 4, minutes: 1, series: series(80), champion: null })
  await flush()
  ia[0].resolve(braveReply(ia[0].request, "x"))
  await flush()
  assert.equal(brave.length, 1)
  session.pause()
  brave[0].resolve({ ok: false, error: "HTTP 429", retryAfterMs: 5000 })
  await flush()
  await clock.advance(60_000)
  assert.equal(brave.length, 1)
  session.resume()
  await clock.advance(4999)
  assert.equal(brave.length, 1)
  await clock.advance(1)
  assert.equal(brave.length, 2)
  session.dispose()
})

test("a retry after a 429 does not leave once the race is over, and it is no panne", async () => {
  const { clock, brave, saved, session } = await waitingOn429()
  session.skip()
  for (let turn = 0; turn < 4; turn += 1) session.skip()
  await flush()
  const over = session.getSnapshot()
  assert.equal(over.phase, "fin")
  assert.equal(saved.length, 1)
  const lines = over.journal.length
  await clock.advance(6000)
  assert.equal(brave.length, 1)
  const after = session.getSnapshot()
  assert.equal(after.journal.length, lines)
  assert.equal(after.journal.some((entry) => entry.kind === "brave" || entry.kind === "erreur"), false)
  assert.deepEqual(after.activity.searching, [])
  assert.equal(after.braveError, null)
  assert.equal(after.brave, "inconnu")
  assert.equal(after.xrayBrave[0].state, "erreur")
  assert.match(after.xrayBrave[0].detail, /nouvelle tentative abandonnée : la course est finie/)
  const last = after.xraySteps.filter((step) => step.op === "recherche").at(-1)
  assert.equal(last?.state, "fait")
  assert.match(last?.result ?? "", /Nouvelle tentative abandonnée : la course est finie/)
  const board = fonctionnelBoard({
    phase: after.phase,
    minutes: after.minutes,
    paused: false,
    ia: after.ia,
    iaError: after.iaError,
    turn: null,
    runnerIds: ["r1"],
    names: { r1: "R1" },
    steps: after.xraySteps.filter((step) => step.op === "recherche"),
  })
  assert.equal(board.rows.some((row) => row.cells.some((cell) => cell.panne)), false)
  session.dispose()
})

test("a retry after a 429 keeps its wait when the avant-course is skipped", async () => {
  const { clock, brave, session } = await waitingOn429()
  await clock.advance(2000)
  session.skip()
  assert.equal(session.getSnapshot().phase, "course")
  await clock.advance(2999)
  assert.equal(brave.length, 1)
  await clock.advance(1)
  assert.equal(brave.length, 2)
  session.dispose()
})

test("a retry after a 429 is dropped when its runner stops", async () => {
  const { clock, brave, session } = await waitingOn429()
  session.skip()
  const race = session.getSnapshot().race
  assert.ok(race)
  const internal = session as unknown as { set(patch: object): void }
  internal.set({ race: { ...race, runners: race.runners.map((runner) => ({ ...runner, cents: 0 })) } })
  session.skip()
  await flush()
  assert.equal(session.getSnapshot().race?.runners[0].alive, false)
  assert.match(session.getSnapshot().xrayBrave[0].detail, /nouvelle tentative abandonnée : ce runner s’est arrêté/)
  await clock.advance(6000)
  assert.equal(brave.length, 1)
  assert.deepEqual(session.getSnapshot().activity.searching, [])
  session.dispose()
})

test("a launch cancels the retry of the generation before", async () => {
  const { clock, brave, session } = await waitingOn429()
  session.launch({ count: 1, draws: 4, minutes: 1, series: series(80), champion: null })
  await flush()
  assert.deepEqual(session.getSnapshot().xrayBrave, [])
  await clock.advance(6000)
  assert.equal(brave.length, 1)
  session.dispose()
})

test("the same search is read once per generation, and each runner reads the notes", async () => {
  const { ia, brave, session } = harness(1)
  session.launch({ count: 2, draws: 4, minutes: 1, series: series(80), champion: null })
  await flush()
  ia[0].resolve(braveReply(ia[0].request, "a"))
  await flush()
  assert.equal(brave.length, 1)
  brave[0].resolve({ ok: true, results: [NOTE] })
  await flush()
  // R2 pose la même question à la même coupure : la réponse vient de la mémoire, sans appel à Brave.
  assert.equal(ia[1].request.runnerId, "r2")
  ia[1].resolve(braveReply(ia[1].request, "b"))
  await flush()
  assert.equal(brave.length, 1)
  const lines = session.getSnapshot().xrayBrave
  assert.equal(lines.length, 2)
  assert.equal(lines[1].state, "fait")
  assert.equal(lines[1].detail, "1 résultat lisible · déjà lue")
  const noted = session.getSnapshot().journal.filter((entry) => entry.kind === "brave")
  assert.equal(noted.length, 2)
  assert.match(noted[1].detail, /déjà lue dans cette génération/)
  assert.equal((session as unknown as { braveSearches: number }).braveSearches, 1)
  // Les deux runners lisent la note à leur appel suivant.
  assert.ok(ia[2].request.user.includes("Suites et φ"))
  ia[2].resolve(unreadable)
  await flush()
  assert.ok(ia[3].request.user.includes("Suites et φ"))
  assert.notEqual(ia[2].request.runnerId, ia[3].request.runnerId)
  // Une nouvelle génération repart sans mémoire.
  session.launch({ count: 2, draws: 4, minutes: 1, series: series(80), champion: null })
  await flush()
  const fresh = ia[ia.length - 1]
  fresh.resolve(braveReply(fresh.request, "c"))
  await flush()
  assert.equal(brave.length, 2)
  session.dispose()
})

test("two runners asking the same search while it is in flight share one Brave call", async () => {
  const { ia, brave, session } = harness(2)
  session.launch({ count: 2, draws: 4, minutes: 1, series: series(80), champion: null })
  await flush()
  assert.deepEqual(
    ia.map((call) => call.request.runnerId),
    ["r1", "r2"]
  )
  ia[0].resolve(braveReply(ia[0].request, "a"))
  await flush()
  assert.equal(brave.length, 1)
  // La première recherche est encore en vol : R2 attend le même résultat, sans second envoi.
  ia[1].resolve(braveReply(ia[1].request, "b"))
  await flush()
  assert.equal(brave.length, 1)
  assert.equal((session as unknown as { braveSearches: number }).braveSearches, 1)
  brave[0].resolve({ ok: true, results: [NOTE] })
  await flush()
  assert.equal(brave.length, 1)
  const lines = session.getSnapshot().xrayBrave
  assert.equal(lines.length, 2)
  assert.deepEqual(
    lines.map((line) => line.detail),
    ["1 résultat lisible", "1 résultat lisible · déjà lue"]
  )
  const noted = session.getSnapshot().journal.filter((entry) => entry.kind === "brave")
  assert.equal(noted.length, 2)
  assert.match(noted[1].detail, /déjà lue dans cette génération/)
  // Les notes sont posées pour les deux runners : leur appel suivant les lit.
  const next = ia.slice(2)
  assert.deepEqual(
    next.map((call) => call.request.runnerId).sort(),
    ["r1", "r2"]
  )
  for (const call of next) assert.ok(call.request.user.includes("Suites et φ"), call.request.runnerId)
  session.dispose()
})

test("a Brave request made during a pause sends nothing before the resume", async () => {
  const { clock, ia, brave, session } = harness(1)
  session.launch({ count: 1, draws: 4, minutes: 1, series: series(80), champion: null })
  await flush()
  session.pause()
  ia[0].resolve(braveReply(ia[0].request, "x"))
  await flush()
  assert.equal(brave.length, 0)
  const held = session.getSnapshot()
  assert.equal(held.xrayBrave.length, 1)
  assert.equal(held.xrayBrave[0].state, "cours")
  assert.deepEqual(held.activity.searching.map((entry) => entry.runnerId), ["r1"])
  await clock.advance(60_000)
  assert.equal(brave.length, 0)
  session.resume()
  await flush()
  assert.equal(brave.length, 1)
  brave[0].resolve({ ok: true, results: [NOTE] })
  await flush()
  assert.equal(session.getSnapshot().xrayBrave[0].state, "fait")
  session.dispose()
})

test("the same search at a later race turn is read from memory, and the notes stay", async () => {
  const { ia, brave, session } = harness(1)
  session.launch({ count: 1, draws: 6, minutes: 1, series: series(80), champion: null })
  await flush()
  ia[0].resolve(braveReply(ia[0].request, "a"))
  await flush()
  brave[0].resolve({ ok: true, results: [NOTE] })
  await flush()
  // Un tour joué fait glisser la fenêtre d’examen, donc la coupure : la mémoire, par requête seule, sert quand même.
  session.skip()
  session.skip()
  ia[ia.length - 1].resolve(unreadable)
  await flush()
  const call = ia[ia.length - 1]
  call.resolve(braveReply(call.request, "b"))
  await flush()
  assert.equal(brave.length, 1)
  const lines = session.getSnapshot().xrayBrave
  assert.equal(lines.length, 2)
  assert.equal(lines[0].turn, null)
  assert.notEqual(lines[1].turn, null)
  assert.equal(lines[1].detail, "1 résultat lisible · déjà lue")
  assert.equal((session as unknown as { braveSearches: number }).braveSearches, 1)
  assert.ok(ia[ia.length - 1].request.user.includes("Suites et φ"))
  session.dispose()
})

test("at the cap of searches a new one is refused without a call or an error, but a known one is still read", async () => {
  const refused = harness(1)
  refused.session.launch({ count: 1, draws: 4, minutes: 1, series: series(80), champion: null })
  const counter = refused.session as unknown as { braveSearches: number }
  counter.braveSearches = BRAVE_SEARCH_CAP
  await flush()
  refused.ia[0].resolve(braveReply(refused.ia[0].request, "a"))
  await flush()
  assert.equal(refused.brave.length, 0)
  const snapshot = refused.session.getSnapshot()
  const refusal = snapshot.journal.find((entry) => entry.kind === "refus")
  assert.match(refusal?.detail ?? "", new RegExp(`plafond de ${BRAVE_SEARCH_CAP} recherches`))
  assert.match(snapshot.xrayBrave[0].detail, /plafond/)
  assert.equal(snapshot.braveError, null)
  assert.equal(snapshot.brave, "inconnu")
  assert.equal(snapshot.xraySteps.find((step) => step.op === "recherche")?.state, "refusé")
  refused.session.dispose()

  const known = harness(1)
  known.session.launch({ count: 2, draws: 4, minutes: 1, series: series(80), champion: null })
  await flush()
  known.ia[0].resolve(braveReply(known.ia[0].request, "a"))
  await flush()
  known.brave[0].resolve({ ok: true, results: [NOTE] })
  await flush()
  ;(known.session as unknown as { braveSearches: number }).braveSearches = BRAVE_SEARCH_CAP
  known.ia[1].resolve(braveReply(known.ia[1].request, "b"))
  await flush()
  assert.equal(known.brave.length, 1)
  assert.equal(known.session.getSnapshot().xrayBrave[1].detail, "1 résultat lisible · déjà lue")
  known.session.dispose()
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
  // Le champion de cette suite cyclique est déjà un glisse : aucune variation ne le dépasse.
  // On repart d’un geste plus faible pour voir une variation gardée.
  const parent = {
    ...champion,
    skills: [
      newSkill(
        "champ-base",
        "Geste de base",
        { curve: "*", gesture: "or", ratio: 0.618, span: "bande", window: 8, days: null },
        { cutoff: "", origin: "maison", examCents: null }
      ),
    ],
  }
  session.launch({ count: 8, draws: 10, minutes: 0, series: rows, champion: parent })
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

test("xray records each house variation before the first turn", () => {
  const { session } = harness(1)
  const rows = series(80)
  const parent: ChampionRecord = {
    generation: 1,
    runner: "R1",
    cents: 5000,
    examCents: null,
    calls: 0,
    raceFrom: null,
    raceTo: null,
    skills: [
      newSkill(
        "champ-base",
        "Geste de base",
        { curve: "*", gesture: "or", ratio: 0.618, span: "bande", window: 8, days: null },
        { cutoff: "", origin: "maison", examCents: null }
      ),
    ],
    journal: [],
    savedAt: "2026-10-30T09:00:00.000Z",
  }
  session.launch({ count: 8, draws: 10, minutes: 0, series: rows, champion: parent })
  const snapshot = session.getSnapshot()
  assert.equal(snapshot.journal.length, 0)
  assert.equal(snapshot.xrayPrep.length, 8)
  assert.equal(snapshot.xrayPrep[0]?.attempts.length, 0)
  assert.match(snapshot.xrayPrep[0]?.detail ?? "", /examen/)
  let kept = 0
  for (const prep of snapshot.xrayPrep.slice(1)) {
    assert.ok(prep.attempts.length >= 1 && prep.attempts.length <= 6)
    const before = prep.attempts[0]?.beforeCents ?? 0
    for (const attempt of prep.attempts) {
      assert.ok(attempt.detail.length > 0)
      assert.equal(attempt.beforeCents, before)
      assert.equal(attempt.kept, attempt.afterCents > before)
    }
    const winner = prep.attempts.filter((attempt) => attempt.kept)
    assert.ok(winner.length <= 1)
    if (winner[0]) {
      kept += 1
      const runner = snapshot.race?.runners.find((item) => item.mind.id === prep.runnerId)
      assert.equal(runner?.examCents, winner[0].afterCents)
      assert.ok(winner[0].afterCents > before)
    }
  }
  assert.ok(kept > 0)
  session.dispose()
})

test("xray leaves a receipt for each played turn and names a runner who cannot pay", () => {
  const { session } = harness(1)
  session.launch({ count: 2, draws: 4, minutes: 0, series: series(40), champion: null })
  const opened = session.getSnapshot()
  const first = opened.race?.runners[0]
  assert.ok(opened.race && first?.thought)
  assert.equal(thoughtChain(first.mind, first.thought, chainHiddenDate(opened.race, opened.track))?.gesture, "persiste")
  session.skip()
  const snap = session.getSnapshot()
  assert.equal(snap.xrayReceipts.length, 2)
  for (const receipt of snap.xrayReceipts) {
    assert.equal(receipt.turn, 1)
    assert.match(receipt.detail, /joue \d+/)
    assert.match(receipt.detail, /★/)
    assert.match(receipt.detail, /trouvé/)
    assert.match(receipt.detail, /− 2,50 €/)
    assert.match(receipt.detail, /= /)
  }
  assert.equal(snap.journal.length, 0)
  const names = Object.fromEntries((snap.race?.runners ?? []).map((runner) => [runner.mind.id, runner.mind.name]))
  const feed = xrayFeed({ prep: snap.xrayPrep, receipts: snap.xrayReceipts, journal: snap.journal, names })
  assert.ok(feed.some((line) => line.text.includes("examen")))
  assert.ok(feed.some((line) => line.text.includes("tour 1")))
  const race = snap.race
  assert.ok(race)
  const internal = session as unknown as { set(patch: object): void }
  internal.set({
    race: {
      ...race,
      runners: race.runners.map((runner) => (runner.mind.id === "r1" ? { ...runner, cents: 100, alive: true } : runner)),
    },
  })
  session.skip()
  const stopped = session.getSnapshot().xrayReceipts.find((item) => item.turn === 2 && item.runnerId === "r1")
  assert.ok(stopped)
  assert.match(stopped.detail, /s’arrête/)
  assert.match(stopped.detail, /2,50 €/)
  assert.equal(stopped.detail.includes("joue"), false)
  const stoppedStep = session.getSnapshot().xraySteps.find((item) => item.turn === 2 && item.runnerId === "r1" && item.op === "jeu")
  assert.equal(stoppedStep?.state, "refusé")
  assert.match(stoppedStep?.result ?? "", /ne paie plus le ticket/)
  session.dispose()
})

test("a pending call appears in the xray activity, then leaves", async () => {
  const { ia, session } = harness(1)
  session.launch({ count: 1, draws: 4, minutes: 1, series: series(40), champion: null })
  await flush()
  assert.deepEqual(session.getSnapshot().activity.calling, ["r1"])
  session.pause()
  ia[0].resolve(unreadable)
  await flush()
  assert.deepEqual(session.getSnapshot().activity.calling, [])
  session.dispose()
})

test("a Brave search appears in the xray activity, then leaves", async () => {
  const { ia, brave, session } = harness(1)
  session.launch({ count: 1, draws: 4, minutes: 1, series: series(80), champion: null })
  await flush()
  ia[0].resolve(braveReply(ia[0].request, "nombre d’or"))
  await flush()
  const live = session.getSnapshot()
  const { relation } = openingRead(series(80))
  assert.ok(relation)
  assert.deepEqual(live.activity.searching, [{ runnerId: "r1", query: relation.phrase }])
  assert.deepEqual(live.activity.calling, [])
  assert.equal(live.xrayBrave.length, 1)
  assert.equal(live.xrayBrave[0].state, "cours")
  assert.equal(live.xrayBrave[0].query, relation.phrase)
  assert.deepEqual(
    activityLines(live.activity, { r1: "R1" }).map((line) => line.text),
    [`R1 cherche : « ${relation.phrase} »`]
  )
  brave[0]?.resolve({ ok: true, results: [] })
  await flush()
  const after = session.getSnapshot()
  assert.deepEqual(after.activity.searching, [])
  assert.equal(after.xrayBrave[0].state, "fait")
  assert.equal(after.xrayBrave[0].detail, braveResultDetail(0))
  session.dispose()
})

test("a failed Brave search keeps the query and the error", async () => {
  const { ia, brave, session } = harness(1)
  session.launch({ count: 1, draws: 4, minutes: 1, series: series(80), champion: null })
  await flush()
  ia[0].resolve(braveReply(ia[0].request, "somme et plus petit rang"))
  await flush()
  const { relation } = openingRead(series(80))
  assert.ok(relation)
  brave[0]?.resolve({ ok: false, error: "Brave : trop de requêtes" })
  await flush()
  const line = session.getSnapshot().xrayBrave[0]
  assert.equal(line.query, relation.phrase)
  assert.equal(line.state, "erreur")
  assert.equal(braveHeadline(line, "R1"), "R1 · avant-course · Brave : trop de requêtes")
  session.dispose()
})

test("a proposal waits in the xray activity until the slice ends", async () => {
  const { clock, ia, session } = harness(1)
  session.launch({ count: 1, draws: 4, minutes: 1, series: series(40), champion: null })
  await flush()
  session.skip()
  const slice = session.getSnapshot().sliceMs
  await clock.advance(slice)
  ia[0].resolve(skillReply("sumNumbers", ia[0].request))
  await flush()
  const pending = session.getSnapshot().activity.pending
  assert.equal(pending.length, 1)
  assert.equal(pending[0]?.runnerId, "r1")
  assert.match(pending[0]?.detail ?? "", /moyenne/)
  await clock.advance(slice)
  assert.equal(session.getSnapshot().activity.pending.length, 0)
  session.dispose()
})

test("a lecture that contradicts the measure is refused with both wordings", async () => {
  const { ia, session } = harness(1)
  session.launch({ count: 1, draws: 4, minutes: 1, series: series(40), champion: null })
  await flush()
  const lecture = lectureFromText(ia[0].request.user)
  assert.ok(lecture)
  const flipped = { ...lecture, tangente: lecture.tangente === "correspond" ? "ecarte" : "correspond" }
  ia[0].resolve({
    ok: true,
    text: JSON.stringify({
      action: "skill",
      name: "Essai",
      curve: "n1",
      gesture: "glisse",
      window: 8,
      days: 0,
      lecture: flipped,
    }),
    latencyMs: 10,
    model: "t",
    vision: true,
  })
  await flush()
  const entry = session.getSnapshot().journal.find((item) => item.detail.includes("lecture refusée"))
  assert.ok(entry)
  assert.match(entry.detail, /appel en texte, sans image/)
  assert.match(entry.detail, /le modèle écrit « tangente /)
  assert.match(entry.detail, /la mesure dit « tangente /)
  assert.equal(session.getSnapshot().iaVision, true)
  session.dispose()
})

test("the next call after a vision model says the drawing went with it", async () => {
  let images = 0
  const { ia, session } = harness(1, async () => {
    images += 1
    return "data:image/png;base64,qq"
  })
  session.launch({ count: 1, draws: 4, minutes: 1, series: series(40), champion: null })
  await flush()
  assert.equal(ia.length, 1)
  assert.equal(images, 0)
  ia[0].resolve({ ...skillReply("n1", ia[0].request), vision: true })
  await flush()
  assert.equal(ia.length, 2)
  assert.equal(images, 1)
  ia[1].resolve({ ...skillReply("n1", ia[1].request), vision: true })
  await flush()
  const lines = session.getSnapshot().journal.filter((entry) => entry.kind === "ia").map((entry) => entry.detail)
  assert.match(lines[0] ?? "", /appel en texte, sans image/)
  assert.match(lines[1] ?? "", /appel avec le dessin/)
  assert.match(lines[1] ?? "", /propose :/)
  session.dispose()
})

test("playing the previewed draw does not count the observation again", async () => {
  const { clock, session } = harness(1)
  session.launch({ count: 1, draws: 4, minutes: 0, series: series(40), champion: null })
  const before = session.getSnapshot().observations.map((item) => ({ ...item }))
  assert.ok(before.length > 0)
  assert.ok(before.every((item) => item.count === 1))
  await clock.advance(700)
  const after = session.getSnapshot().observations
  for (const item of before) {
    const kept = after.find((entry) => entry.phrase === item.phrase)
    assert.equal(kept?.count, 1)
    assert.equal(kept?.createdOn, item.createdOn)
  }
  session.dispose()
})

test("an IA error leaves an appel step", async () => {
  const { ia, session } = harness(1)
  session.launch({ count: 1, draws: 4, minutes: 1, series: series(40), champion: null })
  await flush()
  const opening = session.getSnapshot().xraySteps.filter((item) => item.runnerId === "r1")
  assert.equal(opening.some((item) => item.op === "passage" && item.state === "fait"), true)
  assert.equal(opening.some((item) => item.op === "appel" && item.state === "en cours"), true)
  ia[0].resolve({ ok: false, error: "modèle absent", absent: true })
  await flush()
  const failed = session.getSnapshot().xraySteps.filter((item) => item.op === "appel")
  assert.equal(failed[failed.length - 1]?.state, "erreur")
  assert.equal(failed[failed.length - 1]?.result, "modèle absent")
  assert.equal(failed[failed.length - 1]?.turn, null)
  session.dispose()
})

test("an aborted call leaves an interrupted step", async () => {
  const { ia, session } = harness(1)
  session.launch({ count: 1, draws: 4, minutes: 1, series: series(40), champion: null })
  await flush()
  assert.equal(ia.length, 1)
  session.skip()
  const race = session.getSnapshot().race
  assert.ok(race)
  const internal = session as unknown as { set(patch: object): void }
  internal.set({
    race: {
      ...race,
      runners: race.runners.map((runner) => ({ ...runner, cents: 0, alive: true })),
    },
  })
  session.skip()
  await flush()
  const step = session.getSnapshot().xraySteps.find((item) => item.op === "appel" && item.state === "interrompu")
  assert.ok(step)
  assert.equal(step.runnerId, "r1")
  assert.equal(step.result, "Appel interrompu.")
  session.dispose()
})

test("an exam that does not rise leaves a refused step", async () => {
  const { ia, session } = harness(1)
  session.launch({ count: 1, draws: 4, minutes: 1, series: series(40), champion: null })
  await flush()
  const lecture = lectureFromText(ia[0].request.user)
  ia[0].resolve({
    ok: true,
    text: JSON.stringify({
      action: "skill",
      name: "Essai",
      curve: "*",
      gesture: "persiste",
      ratio: 0.618,
      span: "bande",
      window: 8,
      days: null,
      lecture,
    }),
    latencyMs: 10,
    model: "t",
    vision: false,
  })
  await flush()
  const exam = session.getSnapshot().xraySteps.find((item) => item.op === "examen")
  assert.ok(exam)
  assert.equal(exam.state, "refusé")
  assert.match(exam.result, /pas au-dessus/)
  const wait = session.getSnapshot().xraySteps.find((item) => item.op === "attente")
  assert.equal(wait?.state, "fait")
  session.dispose()
})

test("a short past since the departure skips the call", async () => {
  const { ia, session } = harness(1)
  session.launch({ count: 2, draws: 4, minutes: 1, series: series(40), champion: null })
  await flush()
  const race = session.getSnapshot().race
  assert.ok(race)
  const internal = session as unknown as { set(patch: object): void }
  internal.set({
    race: {
      ...race,
      runners: race.runners.map((runner) => (runner.mind.id === "r2" ? { ...runner, since: "2099-01-01" } : runner)),
    },
  })
  ia[0].resolve(unreadable)
  await flush()
  const skipped = session.getSnapshot().xraySteps.find((item) => item.runnerId === "r2" && item.op === "appel")
  assert.equal(skipped?.state, "sauté")
  assert.match(skipped?.result ?? "", /depuis le départ/)
  session.dispose()
})

test("a played turn records a jeu step and zero minutes skips the calls", () => {
  const { session } = harness(1)
  session.launch({ count: 2, draws: 4, minutes: 0, series: series(40), champion: null })
  assert.equal(session.getSnapshot().xraySteps.length, 0)
  session.skip()
  const snap = session.getSnapshot()
  assert.equal(snap.xraySteps.length, 2)
  for (const step of snap.xraySteps) {
    assert.equal(step.op, "jeu")
    assert.equal(step.state, "fait")
    assert.equal(step.turn, 1)
    assert.match(step.result, /joue \d+/)
  }
  const names = Object.fromEntries((snap.race?.runners ?? []).map((runner) => [runner.mind.id, runner.mind.name]))
  const board = fonctionnelBoard({
    phase: snap.phase,
    minutes: snap.minutes,
    paused: snap.pausedLeftMs != null,
    ia: snap.ia,
    iaError: snap.iaError,
    turn: snap.race ? snap.race.cursor - snap.race.start + 1 : null,
    runnerIds: snap.race?.runners.map((runner) => runner.mind.id) ?? [],
    names,
    steps: snap.xraySteps,
    activity: snap.activity,
  })
  const row = board.rows.find((item) => item.runnerId === "r1")
  assert.equal(row?.cells.find((cell) => cell.op === "appel")?.state, "sauté")
  assert.equal(row?.cells.find((cell) => cell.op === "appel")?.panne, false)
  assert.match(row?.cells.find((cell) => cell.op === "jeu")?.result ?? "", /joue/)
  assert.match(board.course ?? "", /Zéro minute/)
  session.dispose()
})

test("each generation varies the house seed on a fixed archive", () => {
  const { session } = harness(1)
  const rows = series(80)
  const base = newSkill(
    "champ-base",
    "Geste de base",
    { curve: "*", gesture: "or", ratio: 0.618, span: "bande", window: 8, days: null },
    { cutoff: "", origin: "maison", examCents: null }
  )
  const parent: ChampionRecord = {
    generation: 1,
    runner: "R1",
    cents: 5000,
    examCents: null,
    calls: 0,
    raceFrom: null,
    raceTo: null,
    skills: [base],
    journal: [],
    savedAt: "2026-10-30T09:00:00.000Z",
  }
  session.launch({ count: 4, draws: 10, minutes: 0, series: rows, champion: parent })
  const gen2 = session.getSnapshot().xrayPrep.slice(1).map((prep) => prep.attempts.map((a) => a.detail))
  session.launch({ count: 4, draws: 10, minutes: 0, series: rows, champion: { ...parent, generation: 2 } })
  const gen3 = session.getSnapshot().xrayPrep.slice(1).map((prep) => prep.attempts.map((a) => a.detail))
  assert.notDeepEqual(gen2, gen3)
  session.dispose()
})

test("a house variation at launch does not block one new IA skill, and a second new IA skill is refused", async () => {
  const { ia, session } = harness(1)
  const rows = series(80)
  const parent: ChampionRecord = {
    generation: 1,
    runner: "R1",
    cents: 5000,
    examCents: null,
    calls: 0,
    raceFrom: null,
    raceTo: null,
    skills: [
      newSkill(
        "champ-base",
        "Geste de base",
        { curve: "*", gesture: "persiste", ratio: 0.618, span: "bande", window: 8, days: null },
        { cutoff: "", origin: "maison", examCents: null }
      ),
    ],
    journal: [],
    savedAt: "2026-10-30T09:00:00.000Z",
  }
  session.launch({ count: 2, draws: 10, minutes: 1, series: rows, champion: parent })
  await flush()
  const r2Before = session.getSnapshot().race?.runners.find((item) => item.mind.id === "r2")
  assert.equal(r2Before?.added, 1)
  assert.equal(r2Before?.mind.skills.length, 2)

  // Premier appel : R1. On répond illisible pour passer à R2.
  ia[0].resolve(unreadable)
  await flush()
  assert.equal(ia[1]?.request.runnerId, "r2")
  const lecture1 = lectureFromText(ia[1].request.user)
  ia[1].resolve({
    ok: true,
    text: JSON.stringify({
      action: "skill",
      name: "Somme étoiles",
      phrase: "Les étoiles font n’importe quoi",
      curve: "sumStars",
      gesture: "glisse",
      window: 5,
      days: 0,
      lecture: lecture1,
    }),
    latencyMs: 10,
    model: "t",
    vision: false,
  })
  await flush()
  const r2AfterFirst = session.getSnapshot().race?.runners.find((item) => item.mind.id === "r2")
  assert.equal(r2AfterFirst?.added, 2)
  assert.equal(r2AfterFirst?.mind.skills.length, 3)
  const iaSkill = r2AfterFirst?.mind.skills.find((skill) => skill.versions[0].origin === "ia")
  assert.ok(iaSkill)
  const iaVersion = iaSkill.versions[iaSkill.versions.length - 1]
  assert.equal(iaVersion.phrase, describeSkill(iaVersion))
  assert.equal(iaVersion.phrase.includes("n’importe quoi"), false)

  // Tour suivant dans la file d’avant-course : R2 repasse et tente une deuxième courbe nouvelle.
  while (ia[ia.length - 1]?.request.runnerId !== "r2") {
    ia[ia.length - 1].resolve(unreadable)
    await flush()
  }
  const secondCall = ia[ia.length - 1]
  const lecture2 = lectureFromText(secondCall.request.user)
  secondCall.resolve({
    ok: true,
    text: JSON.stringify({
      action: "skill",
      name: "Rang 3",
      curve: "n3",
      gesture: "miroir",
      window: 5,
      days: 0,
      lecture: lecture2,
    }),
    latencyMs: 10,
    model: "t",
    vision: false,
  })
  await flush()
  const refusal = session
    .getSnapshot()
    .journal.find((entry) => entry.runner === "r2" && entry.kind === "refus" && entry.detail.includes("une seule skill nouvelle"))
  assert.ok(refusal)
  assert.equal(session.getSnapshot().race?.runners.find((item) => item.mind.id === "r2")?.added, 2)
  session.dispose()
})

test("a launch never runs more than 18 runners, new or children of a champion", () => {
  const { session } = harness(1)
  const rows = series(40)
  session.launch({ count: 50, draws: 4, minutes: 0, series: rows, champion: null })
  assert.equal(session.getSnapshot().race?.runners.length, RUNNER_MAX)
  assert.equal(RUNNER_MAX, 18)
  session.launch({ count: 7, draws: 4, minutes: 0, series: rows, champion: null })
  assert.equal(session.getSnapshot().race?.runners.length, 7)
  const parent: ChampionRecord = {
    generation: 1,
    runner: "R1",
    cents: 5000,
    examCents: null,
    calls: 0,
    raceFrom: null,
    raceTo: null,
    skills: [
      newSkill(
        "champ-base",
        "Geste de base",
        { curve: "*", gesture: "persiste", ratio: 0.618, span: "bande", window: 8, days: null },
        { cutoff: "", origin: "maison", examCents: null }
      ),
    ],
    journal: [],
    savedAt: "2026-10-30T09:00:00.000Z",
  }
  session.launch({ count: 40, draws: 4, minutes: 0, series: rows, champion: parent })
  const runners = session.getSnapshot().race?.runners ?? []
  assert.equal(runners.length, RUNNER_MAX)
  assert.deepEqual(
    runners.map((runner) => runner.mind.id),
    Array.from({ length: RUNNER_MAX }, (_, index) => `r${index + 1}`)
  )
  session.dispose()
})
