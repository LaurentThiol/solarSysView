import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

import type { RankPoint } from "../src/lib/run-arcade/curves.ts"
import { fonctionnelBoard, type FonctionnelInput } from "../src/lib/run-arcade/fonctionnel.ts"
import { RUN_ARCADE_HELP } from "../src/lib/run-arcade/help.ts"
import { lectureFromText } from "../src/lib/run-arcade/prompt.ts"
import { createSession, type IaReply, type IaRequest, type SessionDeps } from "../src/lib/run-arcade/session.ts"
import { activityLines, emptyActivity, type XrayStep } from "../src/lib/run-arcade/xray.ts"

function step(partial: Partial<XrayStep> & Pick<XrayStep, "op" | "state" | "result">): XrayStep {
  return {
    at: "2026-11-03T10:00:00.000Z",
    turn: 1,
    runnerId: "r1",
    rule: "",
    ...partial,
  }
}

function boardOf(patch: Partial<FonctionnelInput> & Pick<FonctionnelInput, "steps">) {
  return fonctionnelBoard({
    phase: "course",
    minutes: 1,
    paused: false,
    ia: "ok",
    iaError: null,
    turn: 1,
    runnerIds: ["r1", "r2"],
    names: { r1: "R1", r2: "R2" },
    activity: emptyActivity(),
    ...patch,
  })
}

test("the last issue of an operation wins, and a repeated refusal is counted", () => {
  const board = boardOf({
    steps: [
      step({ op: "appel", state: "refusé", result: "réponse illisible", at: "2026-11-03T10:00:00.000Z" }),
      step({ op: "appel", state: "refusé", result: "encore illisible", at: "2026-11-03T10:00:01.000Z" }),
    ],
  })
  const cell = board.rows[0]?.cells.find((item) => item.op === "appel")
  assert.equal(cell?.state, "refusé")
  assert.equal(cell?.count, 2)
  assert.equal(cell?.panne, true)
  assert.equal(board.headline, "Panne : R1, Appel, encore illisible.")
})

test("a later success clears the panne of that operation", () => {
  const board = boardOf({
    steps: [
      step({ op: "appel", state: "refusé", result: "réponse illisible", at: "2026-11-03T10:00:00.000Z" }),
      step({ op: "appel", state: "fait", result: "propose : suite", at: "2026-11-03T10:00:01.000Z" }),
    ],
  })
  const cell = board.rows[0]?.cells.find((item) => item.op === "appel")
  assert.equal(cell?.state, "fait")
  assert.equal(cell?.panne, false)
  assert.equal(board.headline, "Aucune panne sur ce moment.")
})

test("the earliest panne of the moment is named, then the others are counted", () => {
  const board = boardOf({
    steps: [
      step({
        op: "examen",
        state: "refusé",
        result: "examen 1,00 €, pas au-dessus de 2,00 €",
        at: "2026-11-03T10:00:00.000Z",
      }),
      step({
        runnerId: "r2",
        op: "appel",
        state: "erreur",
        result: "modèle absent",
        at: "2026-11-03T10:00:02.000Z",
      }),
    ],
  })
  assert.equal(board.headline, "Panne : R1, Examen, examen 1,00 €, pas au-dessus de 2,00 €. Et 1 autre.")
})

test("a clean turn keeps the last panne of the race", () => {
  const board = boardOf({
    turn: 2,
    steps: [
      step({
        op: "examen",
        state: "refusé",
        result: "examen 1,00 €, pas au-dessus de 2,00 €",
        turn: 1,
        at: "2026-11-03T10:00:00.000Z",
      }),
      step({
        op: "jeu",
        state: "fait",
        result: "R1 joue 1 2 3 4 5 ★ 1 2",
        turn: 2,
        at: "2026-11-03T10:01:00.000Z",
      }),
    ],
  })
  assert.equal(board.momentLabel, "Tour 2")
  assert.equal(board.headline, "Dernière panne : tour 1, R1, Examen, examen 1,00 €, pas au-dessus de 2,00 €.")
  assert.equal(board.rows[0]?.cells.find((cell) => cell.op === "jeu")?.state, "fait")
  assert.equal(board.rows[0]?.cells.find((cell) => cell.op === "appel")?.state, "—")
})

test("zero minutes marks the call operations skipped and keeps the grid", () => {
  const board = boardOf({
    minutes: 0,
    runnerIds: ["r1", "r2", "r3", "r4", "r5", "r6", "r7", "r8"],
    steps: [step({ op: "jeu", state: "fait", result: "R1 joue 3 12 20 31 44 ★ 2 8 · 1 trouvé" })],
  })
  const row = board.rows[0]
  assert.equal(row?.cells.find((cell) => cell.op === "appel")?.state, "sauté")
  assert.equal(row?.cells.find((cell) => cell.op === "recherche")?.state, "sauté")
  assert.equal(row?.cells.find((cell) => cell.op === "attente")?.state, "sauté")
  assert.equal(row?.cells.find((cell) => cell.op === "examen")?.state, "sauté")
  assert.equal(row?.cells.find((cell) => cell.op === "appel")?.panne, false)
  assert.match(row?.cells.find((cell) => cell.op === "jeu")?.result ?? "", /joue 3 12/)
  assert.equal(board.quiet, 7)
  assert.equal(board.quietLabel, "7 runners sans pas")
  assert.match(board.course ?? "", /Zéro minute/)
  assert.equal(board.headline, "Aucune panne sur ce moment.")
})

test("a recorded skip stays a panne, unlike the zero-minute skip", () => {
  const board = boardOf({
    steps: [step({ op: "appel", state: "sauté", result: "Passé trop court : moins de deux tirages lisibles." })],
  })
  const cell = board.rows[0]?.cells.find((item) => item.op === "appel")
  assert.equal(cell?.state, "sauté")
  assert.equal(cell?.panne, true)
  assert.match(board.headline, /Panne : R1, Appel, Passé trop court/)
})

test("a call cut by the end of the race is written interrompu, and is not a panne", () => {
  const board = boardOf({
    phase: "fin",
    turn: 4,
    steps: [
      step({ op: "appel", state: "interrompu", result: "Appel interrompu.", turn: 4, at: "2026-11-03T10:01:00.000Z" }),
      step({ op: "jeu", state: "fait", result: "R1 joue 1 2 3 4 5 ★ 1 2", turn: 4, at: "2026-11-03T10:01:01.000Z" }),
    ],
  })
  const cell = board.rows[0]?.cells.find((item) => item.op === "appel")
  assert.equal(cell?.state, "interrompu")
  assert.equal(cell?.panne, false)
  assert.equal(cell?.count, 0)
  assert.equal(board.rows[0]?.detail, null)
  assert.equal(board.headline, "Aucune panne sur ce moment.")
})

test("a search opened before the race and cut at its end does not become the last panne", () => {
  const board = boardOf({
    phase: "fin",
    turn: 4,
    steps: [
      step({ op: "recherche", state: "interrompu", result: "Recherche interrompue.", turn: null, at: "2026-11-03T10:00:02.000Z" }),
      step({ op: "jeu", state: "fait", result: "R1 joue 1 2 3 4 5 ★ 1 2", turn: 4, at: "2026-11-03T10:01:00.000Z" }),
    ],
  })
  assert.equal(board.momentLabel, "Tour 4")
  assert.equal(board.headline, "Aucune panne sur ce moment.")
  assert.equal(/Dernière panne/.test(board.headline), false)
})

test("an interruption never hides a real panne: the last real one stays in the headline", () => {
  const board = boardOf({
    phase: "fin",
    turn: 4,
    steps: [
      step({ op: "appel", state: "erreur", result: "modèle absent", turn: 2, at: "2026-11-03T10:00:30.000Z" }),
      step({ op: "recherche", state: "interrompu", result: "Recherche interrompue.", turn: 3, at: "2026-11-03T10:00:40.000Z" }),
      step({ op: "jeu", state: "fait", result: "R1 joue 1 2 3 4 5 ★ 1 2", turn: 4, at: "2026-11-03T10:01:00.000Z" }),
    ],
  })
  assert.equal(board.headline, "Dernière panne : tour 2, R1, Appel, modèle absent.")
  const live = boardOf({
    turn: 4,
    steps: [
      step({ op: "appel", state: "refusé", result: "réponse illisible", turn: 4, at: "2026-11-03T10:01:00.000Z" }),
      step({ op: "recherche", state: "interrompu", result: "Recherche interrompue.", turn: 4, at: "2026-11-03T10:01:01.000Z" }),
    ],
  })
  assert.equal(live.headline, "Panne : R1, Appel, réponse illisible.")
  assert.equal(live.rows[0]?.cells.find((item) => item.op === "recherche")?.state, "interrompu")
})

const flush = () => new Promise((resolve) => setImmediate(resolve))

function series(length: number): RankPoint[] {
  return Array.from({ length }, (_, index) => ({
    date: new Date(Date.UTC(2025, 0, 3 + index * 3, 12)).toISOString().slice(0, 10),
    n1: 2 + (index % 5),
    n2: 10 + (index % 4),
    n3: 20 + (index % 6),
    n4: 30 + (index % 5),
    n5: 40 + (index % 7),
    e1: 1 + (index % 5),
    e2: 7 + (index % 5),
  }))
}

test("a search still open when the race ends is cut, and the board does not call it a panne", async () => {
  const calls: { request: IaRequest; resolve: (reply: IaReply) => void }[] = []
  const searches: string[] = []
  const deps: SessionDeps = {
    now: () => 0,
    setTimer: () => 1,
    clearTimer: () => undefined,
    askIa: (request) => new Promise((resolve) => calls.push({ request, resolve })),
    askBrave: (request, signal) =>
      new Promise((resolve) => {
        searches.push(request.query)
        signal.addEventListener("abort", () => resolve({ ok: false, error: "coupé", aborted: true }))
      }),
    saveChampion: async () => ({ ok: true, source: "test" }),
  }
  const session = createSession(deps)
  session.launch({ count: 1, draws: 4, minutes: 1, series: series(80), champion: null })
  await flush()
  calls[0].resolve({
    ok: true,
    text: JSON.stringify({ action: "brave", query: "", lecture: lectureFromText(calls[0].request.user) }),
    latencyMs: 3000,
    model: "t",
    vision: false,
  })
  await flush()
  assert.equal(searches.length, 1)
  assert.equal(session.getSnapshot().activity.searching.length, 1)

  session.skip()
  for (let turn = 0; turn < 4; turn += 1) session.skip()
  await flush()
  const snapshot = session.getSnapshot()
  assert.equal(snapshot.phase, "fin")
  const cut = snapshot.xraySteps.find((item) => item.op === "recherche" && item.state === "interrompu")
  assert.ok(cut, "la session coupe la recherche à la fin de la course")
  assert.equal(cut.turn, null)

  const race = snapshot.race
  assert.ok(race)
  const board = fonctionnelBoard({
    phase: snapshot.phase,
    minutes: snapshot.minutes,
    paused: false,
    ia: snapshot.ia,
    iaError: snapshot.iaError,
    turn: race.cursor - race.start + 1,
    runnerIds: ["r1"],
    names: { r1: "R1" },
    steps: snapshot.xraySteps,
    activity: snapshot.activity,
  })
  assert.equal(board.headline, "Aucune panne sur ce moment.")
  session.dispose()
})

test("a call still in flight shows up before a step is stored", () => {
  const board = boardOf({
    steps: [],
    activity: { calling: ["r2"], searching: [], pending: [] },
  })
  assert.equal(board.momentLabel, "Tour 1")
  assert.equal(board.rows.length, 1)
  assert.equal(board.rows[0]?.runnerId, "r2")
  assert.equal(board.rows[0]?.cells.find((cell) => cell.op === "appel")?.state, "en cours")
  assert.equal(board.quietLabel, "1 runner sans pas")
})

test("a Brave search opened at an earlier turn keeps its runner in the board", () => {
  const board = boardOf({
    turn: 2,
    steps: [step({ op: "appel", state: "fait", result: "demande une recherche", turn: 1 })],
    activity: {
      calling: [],
      searching: [{ runnerId: "r1", query: "n1 et n2, même sens, même pas" }],
      pending: [],
    },
  })
  assert.equal(board.momentLabel, "Tour 2")
  assert.equal(board.rows.length, 1)
  assert.equal(board.rows[0]?.runnerId, "r1")
  const search = board.rows[0]?.cells.find((cell) => cell.op === "recherche")
  assert.equal(search?.state, "en cours")
  assert.equal(search?.result, "Recherche en cours.")
  assert.equal(search?.panne, false)
  assert.equal(board.quietLabel, "1 runner sans pas")
})

test("the Recherche cell is open for the runner who searches, not for the others", () => {
  const board = boardOf({
    steps: [
      step({ op: "appel", state: "fait", result: "demande une recherche" }),
      step({ runnerId: "r2", op: "appel", state: "fait", result: "propose : suite" }),
    ],
    activity: { calling: [], searching: [{ runnerId: "r1", query: "n1 et n2" }], pending: [] },
  })
  assert.deepEqual(
    board.rows.map((row) => row.runnerId),
    ["r1", "r2"]
  )
  const searchOf = (index: number) => board.rows[index]?.cells.find((cell) => cell.op === "recherche")
  assert.equal(searchOf(0)?.state, "en cours")
  assert.equal(searchOf(1)?.state, "—")
  assert.equal(searchOf(1)?.result, null)
})

test("pause and a missing model are said on the course line", () => {
  const paused = boardOf({ steps: [], paused: true })
  assert.equal(paused.course, "En pause : plus d’appel.")
  const absent = boardOf({ steps: [], ia: "absente", iaError: "modèle absent" })
  assert.equal(absent.course, "IA absente : modèle absent")
})

test("two identical waiting lines keep distinct keys", () => {
  const detail = "Σn rejoint sa moyenne sur 5 tirages."
  const lines = activityLines(
    {
      calling: [],
      searching: [],
      pending: [
        { runnerId: "r4", detail },
        { runnerId: "r4", detail },
      ],
    },
    { r4: "R4" }
  )
  assert.deepEqual(
    lines.map((line) => line.text),
    [
      "R4 en attente : Σn rejoint sa moyenne sur 5 tirages.",
      "R4 en attente : Σn rejoint sa moyenne sur 5 tirages.",
    ]
  )
  assert.equal(new Set(lines.map((line) => line.key)).size, 2)
})

test("the functional window is wired into Rayons X and its help", () => {
  const lab = readFileSync(new URL("../src/components/brain/run-arcade-lab.tsx", import.meta.url), "utf8")
  assert.match(lab, /data-testid="run-arcade-ia-banner"/)
  assert.match(lab, /iaUsedLabel/)
  assert.match(lab, /data-testid="run-arcade-fonctionnel"/)
  assert.match(lab, /FonctionnelTable/)
  assert.match(lab, /<li key=\{line\.key\}>\{line\.text\}<\/li>/)
  const help = RUN_ARCADE_HELP.rayons.items?.find((item) => item.label === "Fonctionnel")
  assert.ok(help)
  assert.match(help.text, /Passage à Jeu/)
  assert.match(help.text, /variation maison reste dans Avant/)
})
