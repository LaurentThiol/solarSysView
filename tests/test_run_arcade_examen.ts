import assert from "node:assert/strict"
import test from "node:test"

import {
  championRaceTurns,
  championRecord,
  childrenOf,
  drawsInRange,
  parseChampion,
  setAsideCount,
  sharedWithParent,
  type ChampionRecord,
} from "../src/lib/run-arcade/champion.ts"
import { readChampionFile } from "../src/lib/run-arcade/client.ts"
import { buildTrack, type RankPoint } from "../src/lib/run-arcade/curves.ts"
import { maxRaceDraws } from "../src/lib/run-arcade/depart.ts"
import {
  balanceWithChance,
  chanceBalance,
  chanceLabel,
  championExamLine,
  EXAM_WINDOW,
  examine,
  examLine,
  passesExam,
  runnerExamLine,
  sharedSentence,
} from "../src/lib/run-arcade/examen.ts"
import { RUN_ARCADE_HELP } from "../src/lib/run-arcade/help.ts"
import { buildPrompt, lectureFromText } from "../src/lib/run-arcade/prompt.ts"
import {
  createSession,
  type IaReply,
  type IaRequest,
  type SessionDeps,
} from "../src/lib/run-arcade/session.ts"
import { activeVersion, addVersion, auditCutoffs, newSkill, rollBack } from "../src/lib/run-arcade/skills.ts"
import { createMinds, newRunner, revealedPast, type RunnerLive } from "../src/lib/run-arcade/thought.ts"

const flush = () => new Promise((resolve) => setImmediate(resolve))

function dateAt(index: number) {
  return new Date(Date.UTC(2025, 0, 3 + index * 3, 12)).toISOString().slice(0, 10)
}

/** Une suite régulière : une skill peut y avoir de l’avance. */
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

/** Des tirages sans régularité : aucune skill n’y a d’avantage, seul le hasard fait les soldes. */
function noisy(length: number, seed = 7): RankPoint[] {
  let x = seed
  const next = (max: number) => {
    x = (Math.imul(x, 1664525) + 1013904223) >>> 0
    return 1 + (x % max)
  }
  const pick = (count: number, max: number) => {
    const bag = new Set<number>()
    while (bag.size < count) bag.add(next(max))
    return [...bag].sort((a, b) => a - b)
  }
  return Array.from({ length }, (_, index) => {
    const [n1, n2, n3, n4, n5] = pick(5, 50)
    const [e1, e2] = pick(2, 12)
    return { date: dateAt(index), n1, n2, n3, n4, n5, e1, e2 }
  })
}

/** Des tirages de 2022 : dans l’archive, hors de la piste des années n−1 et n. */
function olderYears(length: number): RankPoint[] {
  return series(length).map((point, index) => ({
    ...point,
    date: new Date(Date.UTC(2022, 0, 4 + index * 3, 12)).toISOString().slice(0, 10),
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

type Waiting = { request: IaRequest; resolve: (reply: IaReply) => void; signal: AbortSignal }

function harness() {
  const clock = new FakeClock()
  const ia: Waiting[] = []
  const saved: ChampionRecord[] = []
  const deps: SessionDeps = {
    now: clock.now,
    setTimer: clock.setTimer,
    clearTimer: clock.clearTimer,
    askIa: (request, signal) =>
      new Promise((resolve) => {
        ia.push({ request, resolve, signal })
        signal.addEventListener("abort", () => resolve({ ok: false, error: "coupé", aborted: true }))
      }),
    askBrave: async () => ({ ok: false, error: "absente", absent: true }),
    saveChampion: async (record) => {
      saved.push(record)
      return { ok: true, source: "test" }
    },
    parallel: 1,
  }
  return { clock, ia, saved, session: createSession(deps) }
}

const unreadable: IaReply = { ok: true, text: "je réfléchis", latencyMs: 4000, model: "test", vision: false }

function skillReply(request: IaRequest, extra: Record<string, unknown>): IaReply {
  return {
    ok: true,
    text: JSON.stringify({
      action: "skill",
      name: "Essai",
      curve: "*",
      gesture: "moyenne",
      window: 5,
      days: 0,
      lecture: lectureFromText(request.user),
      ...extra,
    }),
    latencyMs: 6000,
    model: "test",
    vision: false,
  }
}

function parentRecord(overrides: Partial<ChampionRecord> = {}): ChampionRecord {
  return {
    generation: 1,
    runner: "R1",
    cents: 4350,
    examCents: 4750,
    calls: 3,
    raceFrom: null,
    raceTo: null,
    skills: [
      newSkill(
        "r1-base",
        "Geste de base",
        { curve: "*", gesture: "moyenne", ratio: 0.618, span: "bande", window: 5, days: null },
        { cutoff: "", origin: "maison", examCents: null }
      ),
    ],
    journal: [],
    savedAt: "2026-10-30T09:00:00.000Z",
    ...overrides,
  }
}

const RACE = 10
const GLISSE = { gesture: "glisse", window: 5 }
/** Même geste que le départ de R1 (persiste) : l’examen ne monte pas, la proposition est refusée. */
const PERSISTE = { gesture: "persiste", window: 8 }

/**
 * Une course de RACE tirages avec un seul runner, R1 (persiste). Le modèle répond à la tranche `at`
 * (la 5e : tour 5) ; la réponse est examinée à la fin de cette tranche. Les runners vus à chaque
 * tranche permettent de lire le solde d’examen avant et après.
 */
async function raceWithProposal(rows: RankPoint[], proposal: Record<string, unknown>, at = 4) {
  const track = buildTrack(rows)
  const { clock, ia, saved, session } = harness()
  session.launch({ count: 1, draws: RACE, minutes: 1, series: rows, champion: null })
  await flush()
  session.skip()
  await flush()
  const seen: RunnerLive[] = []
  for (let slice = 0; slice <= at; slice += 1) {
    const mine = [...ia].reverse().find((call) => !call.signal.aborted && call.request.runnerId === "r1")
    if (mine) mine.resolve(slice === at ? skillReply(mine.request, proposal) : unreadable)
    await flush()
    await clock.advance(session.getSnapshot().sliceMs)
    seen.push(session.getSnapshot().race!.runners[0])
  }
  return { track, start: track.length - RACE, session, saved, ia, seen }
}

async function finish(session: ReturnType<typeof harness>["session"]) {
  for (let step = 0; step < RACE + 2 && session.getSnapshot().phase !== "fin"; step += 1) session.skip()
  await flush()
}

test("a version whose exam read the hidden draw stays aside, while its cutoff alone would let it play", () => {
  const base = newSkill(
    "r1-base",
    "Base",
    { curve: "*", gesture: "glisse", ratio: 0.618, span: "bande", window: 8, days: null },
    { cutoff: "", origin: "maison", examCents: null }
  )
  const params = { curve: "*" as const, gesture: "miroir" as const, ratio: 0.618 as const, span: "bande" as const, window: 5, days: null }
  const kept = addVersion(base, params, { cutoff: "2026-05-01", origin: "ia", examCents: 5200, examTo: "2026-06-10" })
  assert.equal(kept.versions[1].examTo, "2026-06-10")
  assert.equal(kept.versions[0].examTo, undefined)
  assert.equal("examTo" in kept.versions[0], false)

  assert.equal(auditCutoffs([kept], "2026-06-03").length, 1)
  assert.equal(auditCutoffs([kept], "2026-06-03")[0].examTo, "2026-06-10")
  assert.deepEqual(rollBack([kept], "2026-06-03")[0].versions.map((version) => version.version), [1])
  assert.equal(auditCutoffs([kept], "2026-06-10").length, 1)
  assert.equal(auditCutoffs([kept], "2026-06-11").length, 0)
  assert.deepEqual(rollBack([kept], "2026-06-11")[0].versions.map((version) => version.version), [1, 2])

  const legacy = addVersion(base, params, { cutoff: "2026-05-01", origin: "ia", examCents: 5200 })
  assert.equal(auditCutoffs([legacy], "2026-06-03").length, 0)

  // La version doit rester visible à son propre examen : seul `cutoff` décide de ce qu’elle joue.
  assert.equal(activeVersion(kept, "2026-06-03")?.version, 2)
  assert.equal(activeVersion(kept, "2026-05-01")?.version, 1)
})

test("a version kept at turn 5 is counted aside at the next launch on the same archive", async () => {
  const rows = series(60)
  const { track, start, session, saved, seen } = await raceWithProposal(rows, GLISSE)
  const kept = session.getSnapshot().journal.find((entry) => entry.kind === "skill")
  assert.equal(kept?.turn, 5)
  await finish(session)
  const hiddenDate = track[start].date
  const champion = saved[0]
  const version = champion.skills[0].versions.find((item) => item.origin === "ia")
  assert.ok(version)
  assert.ok(version.cutoff < hiddenDate, "le prompt n’avait lu que des tirages gratuits")
  assert.equal(version.examTo, track[start + 3].date, "l’examen du tour 5 a rejoué quatre tirages de course")
  assert.ok(version.examTo && version.examTo >= hiddenDate)
  assert.equal(setAsideCount(champion, hiddenDate), 1)
  assert.deepEqual(childrenOf(champion, 1, hiddenDate)[0].skills[0].versions.map((item) => item.version), [1])

  const old = parseChampion(JSON.parse(JSON.stringify(champion), (key, value) => (key === "examTo" ? undefined : value)))
  assert.ok(old)
  assert.equal(setAsideCount(old, hiddenDate), 0, "sans examTo, la version revenait sans être comptée")

  assert.equal(seen[2].examAt, null)
  session.launch({ count: 2, draws: RACE, minutes: 0, series: rows, champion })
  assert.equal(session.getSnapshot().setAside, 1)
  for (const runner of session.getSnapshot().race?.runners ?? []) {
    assert.ok(runner.mind.skills.every((skill) => skill.versions.every((item) => item.origin !== "ia")))
  }
  session.dispose()
})

test("a house variation kept at launch is counted aside when the race grows from 25 to 35 draws", () => {
  const rows = series(140)
  const track = buildTrack(rows)
  const { session } = harness()
  session.launch({ count: 8, draws: 25, minutes: 0, series: rows, champion: parentRecord({ skills: [weakParent()] }) })
  const runners = session.getSnapshot().race?.runners ?? []
  const keeper = runners.find((runner) =>
    runner.mind.skills.some((skill) => skill.versions.some((version) => version.origin === "variation"))
  )
  assert.ok(keeper, "une variation maison est gardée par l’examen")
  const start = track.length - 25
  const version = keeper.mind.skills.flatMap((skill) => skill.versions).find((item) => item.origin === "variation")
  assert.ok(version)
  assert.equal(version.examTo, track[start - 1].date, "l’examen du lancement a rejoué jusqu’au dernier tirage gratuit")
  assert.ok(version.cutoff < track[start - 10].date)

  const record = championRecord({
    runner: keeper,
    generation: 2,
    raceFrom: track[start].date,
    raceTo: track[track.length - 1].date,
    journal: [],
    savedAt: "2026-11-03T09:00:00.000Z",
  })
  assert.equal(setAsideCount(record, track[track.length - 25].date), 0, "même course : rien n’est caché de l’examen")
  assert.equal(setAsideCount(record, track[track.length - 35].date), 1, "course plus longue : l’examen avait vu ce tirage")
  const children = childrenOf(record, 1, track[track.length - 35].date)
  assert.ok(children[0].skills.every((skill) => skill.versions.every((item) => item.origin !== "variation")))

  const bare = JSON.parse(JSON.stringify(record), (key, value) => (key === "examTo" ? undefined : value))
  assert.equal(setAsideCount(parseChampion(bare) as ChampionRecord, track[track.length - 35].date), 0)

  session.launch({ count: 2, draws: 35, minutes: 0, series: rows, champion: record })
  assert.equal(session.getSnapshot().setAside, 1)
  session.dispose()
})

function weakParent() {
  return newSkill(
    "champ-base",
    "Geste de base",
    { curve: "*", gesture: "or", ratio: 0.618, span: "bande", window: 8, days: null },
    { cutoff: "", origin: "maison", examCents: null }
  )
}

test("the exam of an empty window has no balance, and nothing can pass it", () => {
  const rows = series(40)
  const mind = createMinds(1)[0]
  const none = examine(mind, rows.slice(0, 2))
  assert.equal(none.turns, 0)
  assert.equal(none.cents, null)
  assert.equal(none.from, null)
  assert.equal(none.to, null)
  assert.equal(passesExam({ ...none, cents: 9000 }, none), false)
  assert.equal(passesExam(none, { ...none, cents: 100 }), false)

  const played = examine(mind, rows)
  assert.equal(played.turns, EXAM_WINDOW)
  assert.equal(played.from, rows[40 - EXAM_WINDOW].date)
  assert.equal(played.to, rows[39].date)
  assert.equal(passesExam({ ...played, cents: (played.cents ?? 0) + 1 }, played), true)
  assert.equal(passesExam(played, played), false)

  assert.equal(examLine({ cents: none.cents, turns: none.turns, from: none.from, to: none.to, atTurn: null }), "examen — · aucun tirage rejoué")
  assert.equal(examLine({ cents: null }), "examen —")
})

test("a track of 30 draws: 25 draws leave a short exam, 120 are brought back to 28 and leave none", () => {
  const archive = [...olderYears(100), ...series(30)]
  assert.equal(buildTrack(archive).length, 30)
  assert.equal(maxRaceDraws(archive), 28, "la piste compte, pas l’archive entière")
  assert.equal(maxRaceDraws(series(300)), 120)
  assert.equal(maxRaceDraws(series(6)), 4)

  const { session } = harness()
  session.launch({ count: 3, draws: 25, minutes: 0, series: archive, champion: null })
  let race = session.getSnapshot().race
  assert.equal(race?.end, 30)
  assert.equal(race?.start, 5)
  for (const runner of race?.runners ?? []) {
    assert.equal(runner.examTurns, 3)
    assert.equal(typeof runner.examCents, "number")
    assert.match(runnerExamLine(runner), /^examen \d+,\d\d € \(hasard 47,50 € ± 3\) · 3 tours du \d\d\/\d\d au \d\d\/\d\d · au lancement$/)
  }

  const parent = parentRecord({ skills: [weakParent()] })
  session.launch({ count: 3, draws: 120, minutes: 0, series: archive, champion: parent })
  const snapshot = session.getSnapshot()
  race = snapshot.race
  assert.equal(race?.end, 30)
  assert.equal(race?.start, 2, "la demande de 120 est ramenée à 28 tirages de course")
  for (const runner of race?.runners ?? []) {
    assert.equal(runner.examCents, null)
    assert.equal(runner.examTurns, 0)
    assert.equal(runnerExamLine(runner), "examen — · aucun tirage rejoué")
    assert.ok(runner.mind.skills.every((skill) => skill.versions.every((version) => version.origin !== "variation")))
  }
  assert.ok(snapshot.xrayPrep.every((prep) => prep.attempts.length === 0))
  assert.match(snapshot.xrayPrep[0].detail, /examen — · aucun tirage rejoué/)
  session.dispose()
})

test("the exam says when it was played: at launch, then at the turn where the runner was examined again", async () => {
  const rows = series(60)
  const { track, start, session, ia, seen } = await raceWithProposal(rows, GLISSE)
  const launched = seen[0]
  assert.equal(launched.examAt, null)
  assert.equal(launched.examTurns, EXAM_WINDOW)
  assert.equal(launched.examTo, track[start - 1].date)
  assert.equal(launched.examFrom, track[start - EXAM_WINDOW].date)
  assert.match(runnerExamLine(launched), /au lancement/)
  assert.match(ia[0].request.user, /Solde d’examen au lancement : \d+,\d\d € \(25 tours\)\./)

  assert.equal(seen[3].examAt, null)
  assert.equal(seen[3].examCents, launched.examCents)
  assert.equal(seen[3].examTo, track[start - 1].date)

  const after = seen[4]
  assert.equal(after.examAt, 5)
  assert.equal(after.examTurns, EXAM_WINDOW)
  assert.equal(after.examTo, track[start + 3].date, "la fenêtre a glissé de quatre tirages")
  assert.equal(after.examFrom, track[start + 4 - EXAM_WINDOW].date)
  assert.equal(after.examCents, examine(after.mind, revealedPast(track, start + 4)).cents)
  assert.match(runnerExamLine(after), /au tour 5$/)
  session.dispose()
})

test("a refused proposal also plays the exam again on the window of the moment", async () => {
  const { track, start, session, seen } = await raceWithProposal(series(60), PERSISTE)
  assert.ok(session.getSnapshot().journal.some((entry) => entry.kind === "refus" && /pas au-dessus/.test(entry.detail)))
  assert.equal(seen[4].examAt, 5)
  assert.equal(seen[4].examTo, track[start + 3].date)
  assert.equal(seen[3].examAt, null)
  session.dispose()
})

test("the champion ends on the last draw played when every runner is ruined before the end", async () => {
  const rows = noisy(160, 21)
  const { saved, session } = harness()
  session.launch({ count: 4, draws: 120, minutes: 0, series: rows, champion: null })
  for (let step = 0; step < 130 && session.getSnapshot().phase !== "fin"; step += 1) session.skip()
  await flush()
  const { race, track } = session.getSnapshot()
  assert.ok(race)
  assert.ok(race.cursor < race.end, "la course s’arrête avant son dernier tirage")
  assert.ok(race.runners.every((runner) => !runner.alive))
  assert.equal(saved[0].raceTo, track[race.cursor - 1].date)
  assert.notEqual(saved[0].raceTo, track[race.end - 1].date)
  assert.equal(saved[0].raceFrom, track[race.start].date)
  session.dispose()
})

test("a race that goes to its end keeps the last draw of the track as raceTo", async () => {
  const rows = series(40)
  const { saved, session } = harness()
  session.launch({ count: 2, draws: 4, minutes: 0, series: rows, champion: null })
  for (let step = 0; step < 6 && session.getSnapshot().phase !== "fin"; step += 1) session.skip()
  await flush()
  assert.equal(saved[0].raceTo, rows[39].date)
  assert.equal(saved[0].raceFrom, rows[36].date)
  session.dispose()
})

async function firstSeeds(generation: number, options: { seed?: number } = {}) {
  const rows = noisy(80)
  const { ia, session } = harness()
  session.launch({ count: 3, draws: 10, minutes: 1, series: rows, champion: parentRecord({ generation }), ...options })
  const seeds: number[] = []
  for (let step = 0; step < 6; step += 1) {
    await flush()
    seeds.push(ia[step].request.seed)
    ia[step].resolve(unreadable)
  }
  session.dispose()
  return seeds
}

function randomDeparts(generation: number, options: { seed?: number } = {}) {
  const { session } = harness()
  session.launch({
    count: 6,
    draws: 25,
    minutes: 0,
    series: noisy(120),
    champion: parentRecord({ generation }),
    depart: { mode: "aleatoire" },
    ...options,
  })
  const sinces = session.getSnapshot().race?.runners.map((runner) => runner.since) ?? []
  session.dispose()
  return sinces
}

test("two generations on the same archive get other IA seeds, and the same generation keeps its seeds", async () => {
  const second = await firstSeeds(1)
  const third = await firstSeeds(2)
  assert.equal(second.length, 6)
  for (const [index, seed] of second.entries()) assert.notEqual(seed, third[index])
  assert.deepEqual(await firstSeeds(1), second)
  assert.deepEqual(await firstSeeds(2), third)

  const replay = await firstSeeds(1, { seed: 12345 })
  assert.deepEqual(await firstSeeds(1, { seed: 12345 }), replay, "options.seed rejoue exactement")
  assert.notDeepEqual(replay, second)
})

test("two generations on the same archive get other random departs, the same generation keeps them", () => {
  const second = randomDeparts(1)
  const third = randomDeparts(2)
  assert.equal(second.length, 6)
  assert.notDeepEqual(second, third)
  assert.deepEqual(randomDeparts(1), second)
  assert.deepEqual(randomDeparts(1, { seed: 99 }), randomDeparts(1, { seed: 99 }))
})

test("the chance marker is what a random grid pays: 29,17 € ± 8 over 25 turns", () => {
  const mark = chanceBalance(25)
  assert.equal(Math.round(mark.cents), 2917)
  assert.equal(Math.round(mark.spreadCents), 816)
  assert.equal(chanceLabel(25), "hasard 29,17 € ± 8")
  assert.equal(chanceBalance(0).cents, 5000)
  assert.equal(chanceBalance(0).spreadCents, 0)
  assert.equal(balanceWithChance(4350, 25), "43,50 € (hasard 29,17 € ± 8)")
  assert.equal(balanceWithChance(4350, 0), "43,50 €")
  assert.equal(balanceWithChance(4350, null), "43,50 €")

  // Un ticket : 5 numéros sur 50 pour 5 tirés, 2 étoiles sur 12 pour 2 tirées, deux tirages indépendants.
  const choose = (n: number, k: number) => {
    let out = 1
    for (let i = 1; i <= k; i += 1) out = (out * (n - k + i)) / i
    return out
  }
  const pmf = (pool: number, marked: number, drawn: number) =>
    Array.from({ length: Math.min(marked, drawn) + 1 }, (_, k) => (choose(marked, k) * choose(pool - marked, drawn - k)) / choose(pool, drawn))
  const numbers = pmf(50, 5, 5)
  const stars = pmf(12, 2, 2)
  const total: number[] = Array.from({ length: numbers.length + stars.length - 1 }, () => 0)
  numbers.forEach((a, i) => stars.forEach((b, j) => (total[i + j] += a * b)))
  const mean = total.reduce((sum, p, k) => sum + p * k, 0)
  const variance = total.reduce((sum, p, k) => sum + p * (k - mean) ** 2, 0)
  assert.ok(Math.abs(mean - 5 / 6) < 1e-12)
  const one = chanceBalance(1)
  assert.ok(Math.abs(one.cents - (5000 - 250 + 200 * mean)) < 1e-9)
  assert.ok(Math.abs(one.spreadCents - 200 * Math.sqrt(variance)) < 1e-9)
  assert.ok(Math.abs(chanceBalance(100).spreadCents - 2 * chanceBalance(25).spreadCents) < 1e-9)

  // Les nombres de l’aide viennent du code.
  const help = RUN_ARCADE_HELP.solde.items?.find((item) => item.label === "Hasard")
  assert.ok(help?.text.includes(`${chanceLabel(25).replace("hasard ", "")} sur 25 tours`))
  assert.ok(help?.text.includes(variance.toFixed(4).replace(".", ",")))
})

test("the exam line writes the window, the turns and the moment next to the balance", () => {
  const launch = { cents: 2750, turns: 25, from: "2025-09-05", to: "2025-11-28", atTurn: null }
  assert.equal(examLine(launch), "examen 27,50 € (hasard 29,17 € ± 8) · 25 tours du 05/09 au 28/11 · au lancement")
  assert.equal(examLine({ ...launch, atTurn: 5 }), "examen 27,50 € (hasard 29,17 € ± 8) · 25 tours du 05/09 au 28/11 · au tour 5")
  assert.equal(
    examLine({ cents: 2750, turns: 25, from: "2025-09-05", to: "2025-11-28" }),
    "examen 27,50 € (hasard 29,17 € ± 8) · 25 tours du 05/09 au 28/11"
  )
  assert.equal(examLine({ cents: 2750, turns: 1, from: "2025-09-05", to: "2025-09-05" }), "examen 27,50 € (hasard 49,17 € ± 2) · 1 tour le 05/09")
  assert.equal(examLine({ cents: 4750 }), "examen 47,50 €")
  assert.equal(championExamLine({ examCents: 4750 }), "examen 47,50 €")
  assert.equal(championExamLine({ examCents: null }), "examen —")
  assert.equal(
    championExamLine({ examCents: 4750, examTurns: 25, examFrom: "2025-09-05", examTo: "2025-11-28" }),
    "examen 47,50 € (hasard 29,17 € ± 8) · 25 tours du 05/09 au 28/11"
  )
  const runner = { ...newRunner(createMinds(1)[0]), examCents: 2750, examTurns: 25, examFrom: "2025-09-05", examTo: "2025-11-28" }
  assert.equal(runnerExamLine(runner), examLine(launch))
})

test("the prompt says when the exam balance was measured, and stays silent on the window dates", () => {
  const mind = createMinds(1)[0]
  const past = series(30)
  const base = { mind, past, hiddenDate: "2099-01-01", notes: [], drawing: null }
  const launch = buildPrompt({ ...base, examCents: 2750, exam: { turns: 25, at: null } })
  assert.match(launch.user, /Solde d’examen au lancement : 27,50 € \(25 tours\)\./)
  const later = buildPrompt({ ...base, examCents: 3150, exam: { turns: 25, at: 5 } })
  assert.match(later.user, /Solde d’examen au tour 5 : 31,50 € \(25 tours\)\./)
  assert.match(buildPrompt({ ...base, examCents: 2750 }).user, /Solde d’examen : 27,50 €\./)
  assert.match(buildPrompt({ ...base, examCents: null }).user, /Solde d’examen : inconnu\./)
  assert.equal(launch.user.includes("actuel"), false)
  assert.match(launch.system, /Pendant la course, cette fenêtre avance d’un tirage par tour/)
  assert.equal(launch.user.includes("2025-09-05"), false)
})

test("the champion keeps its exam window, and each version its examTo, through export and import", () => {
  const rows = series(60)
  const examTo = rows[40].date
  const base = newSkill(
    "r2-base",
    "Base",
    { curve: "*", gesture: "glisse", ratio: 0.618, span: "bande", window: 8, days: null },
    { cutoff: "", origin: "maison", examCents: null }
  )
  const skill = addVersion(
    base,
    { curve: "*", gesture: "miroir", ratio: 0.618, span: "bande", window: 5, days: null },
    { cutoff: rows[20].date, origin: "ia", examCents: 5200, examTo }
  )
  const runner: RunnerLive = {
    ...newRunner({ id: "r2", name: "R2", focus: "n1", skills: [skill] }),
    cents: 4350,
    examCents: 4750,
    examFrom: rows[16].date,
    examTo,
    examTurns: 25,
  }
  const record = championRecord({
    runner,
    generation: 4,
    raceFrom: rows[41].date,
    raceTo: rows[50].date,
    journal: [],
    savedAt: "2026-11-03T09:00:00.000Z",
  })
  assert.equal(record.examFrom, rows[16].date)
  assert.equal(record.examTo, examTo)
  assert.equal(record.examTurns, 25)
  assert.equal(record.skills[0].versions[1].examTo, examTo)

  assert.deepEqual(parseChampion(JSON.parse(JSON.stringify(record))), record)
  assert.deepEqual(readChampionFile(JSON.stringify(record, null, 2)), record)

  const legacy = JSON.parse(JSON.stringify(record), (key, value) =>
    key === "examFrom" || key === "examTo" || key === "examTurns" ? undefined : value
  ) as ChampionRecord
  const reread = parseChampion(legacy)
  assert.ok(reread)
  assert.equal(reread.examFrom, null)
  assert.equal(reread.examTo, null)
  assert.equal(reread.examTurns, null)
  assert.equal("examTo" in reread.skills[0].versions[1], false)
  assert.equal(championExamLine(reread), "examen 47,50 €")
  assert.equal(setAsideCount(reread, rows[30].date), 0)

  const dirty = JSON.parse(JSON.stringify(record)) as Record<string, unknown>
  dirty.examFrom = "n’importe quoi"
  dirty.examTurns = -3
  ;((dirty.skills as { versions: Record<string, unknown>[] }[])[0].versions[1] as Record<string, unknown>).examTo = "demain"
  const cleaned = parseChampion(dirty)
  assert.ok(cleaned)
  assert.equal(cleaned.examFrom, null)
  assert.equal(cleaned.examTurns, null)
  assert.equal("examTo" in cleaned.skills[0].versions[1], false)
})

test("unreadable race dates and version cutoffs are read back as empty, never as dates", () => {
  const dirty = JSON.parse(
    JSON.stringify(parentRecord({ raceFrom: "demain", raceTo: "2025-13-40", savedAt: "hier" }))
  ) as Record<string, unknown>
  dirty.depart = "demain"
  ;((dirty.skills as { versions: Record<string, unknown>[] }[])[0].versions[0] as Record<string, unknown>).cutoff =
    "2025-13-40"
  const cleaned = parseChampion(dirty)
  assert.ok(cleaned)
  assert.equal(cleaned.raceFrom, null)
  assert.equal(cleaned.raceTo, null)
  assert.equal(cleaned.depart, null)
  assert.equal(cleaned.savedAt, "")
  assert.equal(cleaned.skills[0].versions[0].cutoff, "")

  const tomorrow = parseChampion(JSON.parse(JSON.stringify(parentRecord({ raceTo: "demain" }))))
  assert.equal(tomorrow?.raceTo, null)
  const impossible = parseChampion(JSON.parse(JSON.stringify(parentRecord({ raceTo: "2025-13-40" }))))
  assert.equal(impossible?.raceTo, null)
})

test("a malformed journal refuses the champion at reading, instead of entering the Neon queue", () => {
  const base = JSON.parse(JSON.stringify(parentRecord())) as Record<string, unknown>
  assert.equal(parseChampion({ ...base, journal: ["pas un objet", 42] }), null)
  assert.equal(parseChampion({ ...base, journal: [{ runner: "r1", kind: "ia", cutoff: "", detail: "x" }] }), null)
  assert.equal(
    parseChampion({ ...base, journal: [{ runner: "r1", kind: "inconnu", cutoff: "", turn: 1, detail: "x" }] }),
    null
  )
  assert.equal(parseChampion({ ...base, journal: "pas une liste" }), null)
  const entry = { at: "2026-10-30T09:00:00.000Z", runner: "r1", kind: "ia", cutoff: "", turn: null, detail: "lu" }
  const kept = parseChampion({ ...base, journal: [entry] })
  assert.deepEqual(kept?.journal, [entry])
})

test("the chance mark of a written champion uses its own turns, on both sides of the lab", () => {
  const rows = series(40)
  const track = buildTrack(rows)
  // Course de 25 tirages (15 → 39), champion arrêté après 12 tours : le repère est celui de 12 tours.
  const stopped = parentRecord({ raceFrom: track[15].date, raceTo: track[39].date, raceTurns: 12 })
  assert.equal(drawsInRange(track, stopped.raceFrom, stopped.raceTo), 25)
  assert.equal(championRaceTurns(stopped, track), 12)
  assert.equal(balanceWithChance(stopped.cents, championRaceTurns(stopped, track)), "43,50 € (hasard 40,00 € ± 6)")
  // Champion ancien, sans `raceTurns` : repli sur les tirages de la plage.
  const legacy = parentRecord({ raceFrom: track[15].date, raceTo: track[39].date })
  assert.equal(championRaceTurns(legacy, track), 25)
  const reread = parseChampion(JSON.parse(JSON.stringify(stopped)))
  assert.equal(reread?.raceTurns, 12)
  assert.equal(championRaceTurns(reread as ChampionRecord, track), 12)
})

test("the course shares draws with the range where its parent was chosen", async () => {
  const rows = series(60)
  const track = buildTrack(rows)
  const start = track.length - RACE
  const range = { raceFrom: track[start].date, raceTo: track[track.length - 1].date }
  assert.equal(drawsInRange(track, range.raceFrom, range.raceTo), RACE)
  assert.equal(drawsInRange(track, null, range.raceTo), 0)
  assert.equal(sharedWithParent(track, start, track.length, range), RACE)
  assert.equal(sharedWithParent(track, start, track.length, { raceFrom: track[start + 5].date, raceTo: range.raceTo }), 5)
  assert.equal(sharedWithParent(track, start, track.length, { raceFrom: track[0].date, raceTo: track[start - 1].date }), 0)
  assert.equal(sharedWithParent(track, start, track.length, { raceFrom: null, raceTo: null }), null)
  assert.equal(sharedWithParent(track, start, track.length, null), null)

  const { session } = harness()
  session.launch({ count: 1, draws: RACE, minutes: 0, series: rows, champion: null })
  assert.equal(session.getSnapshot().sharedWithParent, null)
  session.launch({ count: 1, draws: RACE, minutes: 0, series: rows, champion: parentRecord(range) })
  assert.equal(session.getSnapshot().sharedWithParent, RACE)
  session.launch({ count: 1, draws: RACE, minutes: 0, series: rows, champion: parentRecord({ ...range, raceFrom: track[start + 6].date }) })
  assert.equal(session.getSnapshot().sharedWithParent, 4)
  session.launch({ count: 1, draws: RACE, minutes: 0, series: rows, champion: parentRecord({ raceFrom: track[0].date, raceTo: track[start - 1].date }) })
  assert.equal(session.getSnapshot().sharedWithParent, 0)
  session.dispose()

  assert.equal(
    sharedSentence(18, 25, { raceFrom: "2025-08-07", raceTo: "2025-10-30" }),
    "Sur 25 tirages de course, 18 sont dans la plage du parent (07/08 – 30/10) : ils ont servi à le choisir."
  )
  assert.equal(
    sharedSentence(1, 25, { raceFrom: "2025-08-07", raceTo: "2025-10-30" }),
    "Sur 25 tirages de course, 1 est dans la plage du parent (07/08 – 30/10) : il a servi à le choisir."
  )
  assert.equal(
    sharedSentence(0, 25, { raceFrom: "2025-08-07", raceTo: "2025-10-30" }),
    "Aucun des 25 tirages de course n’est dans la plage du parent (07/08 – 30/10)."
  )
})
