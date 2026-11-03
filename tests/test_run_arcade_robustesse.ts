import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

import { JOURNAL_KEEP } from "../src/lib/run-arcade/champion.ts"
import type { ChampionRecord } from "../src/lib/run-arcade/champion.ts"
import type { RankPoint } from "../src/lib/run-arcade/curves.ts"
import { RUN_ARCADE_HELP } from "../src/lib/run-arcade/help.ts"
import { lectureFromText } from "../src/lib/run-arcade/prompt.ts"
import {
  createSession,
  MIN_SLICE_MS,
  type BraveReply,
  type BraveRequest,
  type IaReply,
  type IaRequest,
  type SaveReply,
  type SessionDeps,
} from "../src/lib/run-arcade/session.ts"

const lab = readFileSync(new URL("../src/components/brain/run-arcade-lab.tsx", import.meta.url), "utf8")
const unsent = readFileSync(new URL("../src/components/brain/run-arcade-unsent.tsx", import.meta.url), "utf8")

const flush = () => new Promise((resolve) => setImmediate(resolve))

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

  pendingTimers() {
    return this.timers.length
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
  const save: { reply: SaveReply } = { reply: { ok: true, source: "test" } }
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
      return save.reply
    },
    capture,
    parallel,
  }
  return { clock, ia, brave, saved, save, session: createSession(deps) }
}

const unreadable: IaReply = { ok: true, text: "je réfléchis", latencyMs: 4000, model: "test", vision: false }
const seeing: IaReply = { ...unreadable, vision: true }

function asksBrave(request: IaRequest): IaReply {
  return {
    ok: true,
    text: JSON.stringify({ action: "brave", query: "nombre d’or", lecture: lectureFromText(request.user) }),
    latencyMs: 3000,
    model: "t",
    vision: false,
  }
}
const IMAGE = "data:image/png;base64,qq"

/** Répond à tous les appels ouverts depuis `from`. Rend l’indice du premier appel que cette réponse a fait partir. */
async function answerAll(ia: Waiting<IaRequest, IaReply>[], from: number, reply: IaReply) {
  const next = ia.length
  for (const call of ia.slice(from)) call.resolve(reply)
  await flush()
  return next
}

test("each runner keeps its own journal, so eight runners do not share two hundred lines", async () => {
  const { ia, saved, session } = harness(8)
  session.launch({ count: 8, draws: 4, minutes: 120, series: series(40), champion: null })
  await flush()
  let answered = 0
  for (let round = 0; round < JOURNAL_KEEP + 12; round += 1) answered = await answerAll(ia, answered, unreadable)
  const calls = (id: string) => ia.filter((call) => call.request.runnerId === id).length
  assert.ok(calls("r1") > JOURNAL_KEEP)

  const journal = session.getSnapshot().journal
  for (let index = 1; index <= 8; index += 1) {
    assert.equal(journal.filter((entry) => entry.runner === `r${index}`).length, JOURNAL_KEEP, `r${index}`)
  }
  assert.equal(journal.length, 8 * JOURNAL_KEEP)
  for (let index = 1; index < journal.length; index += 1) assert.ok(journal[index - 1].at <= journal[index].at)

  for (let turn = 0; turn < 6 && session.getSnapshot().phase !== "fin"; turn += 1) session.skip()
  assert.equal(session.getSnapshot().phase, "fin")
  assert.equal(saved.length, 1)
  assert.equal(saved[0].journal.length, JOURNAL_KEEP)
  assert.ok(saved[0].journal.every((entry) => entry.runner === `r${saved[0].runner.slice(1)}`))
  session.dispose()
})

test("a runner that talks a lot loses its own oldest lines first, never those of the others", async () => {
  const { ia, session } = harness(1)
  session.launch({ count: 2, draws: 4, minutes: 120, series: series(40), champion: null })
  await flush()
  const internal = session as unknown as { log(runner: string, kind: string, cutoff: string, detail: string, turn: null): void }
  internal.log("r2", "refus", "", "seule ligne de R2", null)
  for (let line = 0; line < JOURNAL_KEEP + 30; line += 1) internal.log("r1", "refus", "", `ligne ${line}`, null)
  const journal = session.getSnapshot().journal
  assert.equal(journal.filter((entry) => entry.runner === "r1").length, JOURNAL_KEEP)
  assert.equal(journal.filter((entry) => entry.runner === "r2").length, 1)
  assert.equal(journal.find((entry) => entry.runner === "r1")?.detail, "ligne 30")
  assert.equal(ia.length, 1)
  session.launch({ count: 2, draws: 4, minutes: 120, series: series(40), champion: null })
  assert.equal(session.getSnapshot().journal.length, 0)
  session.dispose()
})

test("the second cooldown wakes at its own time, not at the next event", async () => {
  const { clock, ia, session } = harness(3)
  session.launch({ count: 3, draws: 4, minutes: 5, series: series(40), champion: null })
  await flush()
  const calls = (id: string) => ia.filter((call) => call.request.runnerId === id)
  assert.deepEqual(
    ia.map((call) => call.request.runnerId),
    ["r1", "r2", "r3"]
  )
  calls("r1")[0].resolve({ ok: false, error: "boum" })
  await flush()
  await clock.advance(500)
  calls("r2")[0].resolve({ ok: false, error: "boum" })
  await flush()
  await clock.advance(1500)
  assert.equal(calls("r1").length, 2)
  assert.equal(calls("r2").length, 1)
  await clock.advance(499)
  assert.equal(calls("r2").length, 1)
  await clock.advance(1)
  assert.equal(calls("r2").length, 2)
  session.dispose()
  assert.equal(clock.pendingTimers(), 0)
})

test("playing the turn while paused plays it, and the race stays paused", async () => {
  const { clock, ia, session } = harness(1)
  session.launch({ count: 2, draws: 8, minutes: 1, series: series(40), champion: null })
  await flush()
  session.skip()
  const slice = session.getSnapshot().sliceMs
  assert.equal(slice, 7_500)
  await clock.advance(5_000)
  session.pause()
  const paused = session.getSnapshot()
  assert.equal(paused.pausedLeftMs, 2_500)
  const cursor = paused.race?.cursor ?? 0
  const calls = ia.length

  session.skip()
  const stepped = session.getSnapshot()
  assert.equal(stepped.race?.cursor, cursor + 1)
  assert.equal(stepped.pausedLeftMs, slice)
  assert.equal(stepped.phaseEndsAt, null)
  assert.equal(stepped.phase, "course")
  assert.equal(clock.pendingTimers(), 0)

  await clock.advance(120_000)
  assert.equal(session.getSnapshot().race?.cursor, cursor + 1)
  assert.equal(ia.length, calls)
  session.skip()
  assert.equal(session.getSnapshot().race?.cursor, cursor + 2)
  assert.equal(session.getSnapshot().pausedLeftMs, slice)

  session.resume()
  assert.equal(session.getSnapshot().pausedLeftMs, null)
  assert.equal(session.getSnapshot().phaseEndsAt, clock.time + slice)
  await clock.advance(slice)
  assert.equal(session.getSnapshot().race?.cursor, cursor + 3)
  session.dispose()
})

test("passing to the race while paused opens the race, still paused and silent", async () => {
  const { clock, ia, session } = harness(1)
  session.launch({ count: 2, draws: 8, minutes: 1, series: series(40), champion: null })
  await flush()
  assert.equal(ia.length, 1)
  session.pause()
  assert.equal(session.getSnapshot().pausedLeftMs, 60_000)
  session.skip()
  const opened = session.getSnapshot()
  assert.equal(opened.phase, "course")
  assert.equal(opened.pausedLeftMs, 7_500)
  assert.equal(opened.phaseEndsAt, null)
  assert.equal(clock.pendingTimers(), 0)
  ia[0].resolve(unreadable)
  await clock.advance(120_000)
  assert.equal(ia.length, 1)
  assert.equal(session.getSnapshot().race?.cursor, opened.race?.cursor)
  session.resume()
  assert.equal(session.getSnapshot().phaseEndsAt, clock.time + 7_500)
  await flush()
  assert.ok(ia.length >= 2)
  session.dispose()
})

test("playing the last turn while paused ends the race and the pause", async () => {
  const { clock, saved, session } = harness(1)
  session.launch({ count: 2, draws: 4, minutes: 0, series: series(40), champion: null })
  session.pause()
  assert.equal(session.getSnapshot().pausedLeftMs, MIN_SLICE_MS)
  for (let turn = 0; turn < 4; turn += 1) {
    assert.equal(session.getSnapshot().phase, "course")
    session.skip()
  }
  await flush()
  const done = session.getSnapshot()
  assert.equal(done.phase, "fin")
  assert.equal(done.pausedLeftMs, null)
  assert.equal(saved.length, 1)
  assert.equal(clock.pendingTimers(), 0)
  session.dispose()
})

test("playing the turn while paused leaves a waiting Brave retry frozen until Reprendre", async () => {
  const { clock, ia, brave, session } = harness(1)
  session.launch({ count: 1, draws: 4, minutes: 1, series: series(80), champion: null })
  await flush()
  ia[0].resolve(asksBrave(ia[0].request))
  await flush()
  assert.equal(brave.length, 1)
  brave[0].resolve({ ok: false, error: "HTTP 429", retryAfterMs: 1000 })
  await flush()
  session.pause()
  session.skip()
  session.skip()
  assert.equal(session.getSnapshot().pausedLeftMs !== null, true)
  await clock.advance(120_000)
  assert.equal(brave.length, 1)
  session.resume()
  await clock.advance(999)
  assert.equal(brave.length, 1)
  await clock.advance(1)
  assert.equal(brave.length, 2)
  session.dispose()
})

test("a paused session does not probe an absent IA, and probes it when it resumes", async () => {
  const { clock, ia, session } = harness(1)
  session.launch({ count: 2, draws: 4, minutes: 1, series: series(40), champion: null })
  await flush()
  ia[0].resolve({ ok: false, error: "LLM local injoignable", absent: true })
  await flush()
  session.pause()
  assert.equal(clock.pendingTimers(), 0)
  await clock.advance(120_000)
  assert.equal(ia.length, 1)
  assert.equal(session.getSnapshot().ia, "absente")
  session.resume()
  assert.equal(ia.length, 2)
  assert.equal(session.getSnapshot().ia, "inconnu")
  session.dispose()
  assert.equal(clock.pendingTimers(), 0)
})

test("a drawing that cannot be taken is told in the journal, and the call goes without it", async () => {
  let shots = 0
  const { ia, session } = harness(1, async () => {
    shots += 1
    throw new Error("police introuvable")
  })
  session.launch({ count: 1, draws: 4, minutes: 1, series: series(40), champion: null })
  await flush()
  assert.equal(shots, 0)
  ia[0].resolve(seeing)
  await flush()
  assert.equal(shots, 1)
  assert.equal(ia.length, 2)
  assert.equal(ia[1].request.image, null)
  const lines = session.getSnapshot().journal.filter((entry) => entry.detail.startsWith("dessin"))
  assert.equal(lines.length, 1)
  assert.equal(lines[0].kind, "erreur")
  assert.equal(lines[0].detail, "dessin non joint : police introuvable")
  assert.equal(session.getSnapshot().iaVision, true)
  session.dispose()
})

test("a drawing that takes more than four seconds is given up, and the call goes without it", async () => {
  const { clock, ia, session } = harness(1, () => new Promise<string | null>(() => {}))
  session.launch({ count: 1, draws: 4, minutes: 2, series: series(40), champion: null })
  await flush()
  ia[0].resolve(seeing)
  await flush()
  assert.equal(ia.length, 1)
  await clock.advance(3_999)
  assert.equal(ia.length, 1)
  await clock.advance(1)
  assert.equal(ia.length, 2)
  assert.equal(ia[1].request.image, null)
  const line = session.getSnapshot().journal.find((entry) => entry.detail.startsWith("dessin non joint"))
  assert.equal(line?.detail, "dessin non joint : délai de 4 s dépassé")
  session.dispose()
})

test("a drawing that comes back empty is told too, and one that comes back is joined", async () => {
  const shots: (string | null)[] = [null, IMAGE]
  const { ia, session } = harness(1, async () => shots.shift() ?? null)
  session.launch({ count: 1, draws: 4, minutes: 1, series: series(40), champion: null })
  await flush()
  ia[0].resolve(seeing)
  await flush()
  assert.equal(ia[1].request.image, null)
  assert.ok(session.getSnapshot().journal.some((entry) => entry.detail === "dessin non joint : aucune image rendue"))
  ia[1].resolve(seeing)
  await flush()
  assert.equal(ia[2].request.image, IMAGE)
  assert.equal(session.getSnapshot().journal.filter((entry) => entry.detail.startsWith("dessin non joint")).length, 1)
  session.dispose()
})

test("three drawings failing in a row turn the drawing off until the next launch", async () => {
  let shots = 0
  const { ia, session } = harness(1, async () => {
    shots += 1
    return null
  })
  session.launch({ count: 1, draws: 4, minutes: 1, series: series(40), champion: null })
  await flush()
  ia[0].resolve(seeing)
  await flush()
  ia[1].resolve(seeing)
  await flush()
  assert.equal(session.getSnapshot().iaVision, true)
  ia[2].resolve(seeing)
  await flush()
  assert.equal(shots, 3)
  assert.equal(session.getSnapshot().iaVision, false)
  const journal = session.getSnapshot().journal.map((entry) => entry.detail)
  assert.equal(journal.filter((detail) => detail === "dessin non joint : aucune image rendue").length, 3)
  assert.ok(journal.includes("dessin coupé : 3 échecs de suite, les appels partent sans image"))

  const before = ia.length
  ia[before - 1].resolve(seeing)
  await flush()
  assert.equal(session.getSnapshot().iaVision, false)
  assert.equal(shots, 3)
  assert.equal(ia[ia.length - 1].request.image, null)

  session.launch({ count: 1, draws: 4, minutes: 1, series: series(40), champion: null })
  await flush()
  ia[ia.length - 1].resolve(seeing)
  await flush()
  assert.equal(session.getSnapshot().iaVision, true)
  assert.equal(shots, 4)
  session.dispose()
})

test("a drawing that works in between starts the count of failures again", async () => {
  const results: (string | null)[] = [null, null, IMAGE, null, null]
  const { ia, session } = harness(1, async () => results.shift() ?? null)
  session.launch({ count: 1, draws: 4, minutes: 1, series: series(40), champion: null })
  await flush()
  let answered = 0
  for (let step = 0; step < 5; step += 1) {
    answered = await answerAll(ia, answered, seeing)
  }
  assert.equal(session.getSnapshot().iaVision, true)
  assert.equal(session.getSnapshot().journal.filter((entry) => entry.detail.startsWith("dessin non joint")).length, 4)
  await answerAll(ia, answered, seeing)
  assert.equal(session.getSnapshot().iaVision, false)
  session.dispose()
})

test("a call cancelled while its drawing is taken is never sent", async () => {
  let release: (image: string | null) => void = () => {}
  const { ia, session } = harness(1, () => new Promise<string | null>((resolve) => (release = resolve)))
  session.launch({ count: 1, draws: 4, minutes: 1, series: series(40), champion: null })
  await flush()
  ia[0].resolve(seeing)
  await flush()
  assert.equal(ia.length, 1)
  session.skip()
  for (let turn = 0; turn < 4; turn += 1) session.skip()
  await flush()
  assert.equal(session.getSnapshot().phase, "fin")
  release(IMAGE)
  await flush()
  assert.equal(ia.length, 1)
  session.dispose()
})

test("a retry that writes the champion of this race turns the Neon line to written", async () => {
  const { save, session } = harness(1)
  save.reply = { ok: false, error: "Neon non configuré · copie gardée dans ce navigateur" }
  session.launch({ count: 2, draws: 4, minutes: 0, series: series(40), champion: null })
  for (let turn = 0; turn < 4; turn += 1) session.skip()
  await flush()
  const done = session.getSnapshot()
  assert.equal(done.phase, "fin")
  assert.equal(done.save.state, "erreur")
  assert.ok(done.champion)
  const champion = done.champion

  session.confirmSaved({ ...champion, generation: champion.generation + 1 }, "Neon")
  session.confirmSaved({ ...champion, runner: "R99" }, "Neon")
  session.confirmSaved({ ...champion, savedAt: "2020-01-01T00:00:00.000Z" }, "Neon")
  assert.equal(session.getSnapshot().save.state, "erreur")

  session.confirmSaved(champion, "Neon")
  assert.deepEqual(session.getSnapshot().save, { state: "ok", detail: "Neon" })
  session.dispose()
})

test("a champion already written is not written again by a late confirmation", async () => {
  const { session } = harness(1)
  session.launch({ count: 2, draws: 4, minutes: 0, series: series(40), champion: null })
  for (let turn = 0; turn < 4; turn += 1) session.skip()
  await flush()
  const done = session.getSnapshot()
  assert.equal(done.save.state, "ok")
  assert.ok(done.champion)
  session.confirmSaved(done.champion, "autre source")
  assert.deepEqual(session.getSnapshot().save, { state: "ok", detail: "test" })
  session.confirmSaved(done.champion, "Neon")
  session.launch({ count: 2, draws: 4, minutes: 0, series: series(40), champion: null })
  assert.equal(session.getSnapshot().save.state, "—")
  session.dispose()
})

test("the help says what the new behaviours do", () => {
  assert.match(RUN_ARCADE_HELP.tour.body, /En pause, il avance d’un cran sans rendre le temps/)
  assert.match(RUN_ARCADE_HELP.tour.body, /la course reste en pause/)
  assert.match(RUN_ARCADE_HELP.importer.body, /déjà dans Neon/)
  assert.match(RUN_ARCADE_HELP.importer.body, /même génération, même runner, même date d’écriture/)
  const neon = RUN_ARCADE_HELP.services.items?.find((item) => item.label === "Neon")
  assert.match(neon?.text ?? "", /Réessayer l’écriture/)
  assert.match(neon?.text ?? "", /n’est gardé nulle part/)
  assert.match(RUN_ARCADE_HELP.services.body, /sondée de nouveau toutes les 15 s/)
  const local = RUN_ARCADE_HELP.services.items?.find((item) => item.label === "IA locale")
  assert.match(local?.text ?? "", /dessin non joint/)
  assert.match(local?.text ?? "", /4 s/)
  assert.match(local?.text ?? "", /trois échecs de suite/)
})

test("the lab shows the result of an import, and the queue of unwritten champions with its button", () => {
  assert.match(lab, /void importChampion\(record\)/)
  assert.equal(/void saveChampion\(record\)/.test(lab), false)
  assert.match(lab, /data-testid="run-arcade-import-outcome"/)
  assert.match(lab, /<UnsentChampions/)
  assert.match(lab, /session\.confirmSaved\(record, "Neon"\)/)
  assert.match(unsent, /Réessayer l’écriture/)
  assert.match(unsent, /retryUnsent\(\)/)
})
