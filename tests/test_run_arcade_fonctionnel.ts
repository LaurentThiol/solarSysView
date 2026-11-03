import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

import { fonctionnelBoard, type FonctionnelInput } from "../src/lib/run-arcade/fonctionnel.ts"
import { RUN_ARCADE_HELP } from "../src/lib/run-arcade/help.ts"
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
  assert.match(lab, /data-testid="run-arcade-fonctionnel"/)
  assert.match(lab, /FonctionnelTable/)
  assert.match(lab, /<li key=\{line\.key\}>\{line\.text\}<\/li>/)
  const help = RUN_ARCADE_HELP.rayons.items?.find((item) => item.label === "Fonctionnel")
  assert.ok(help)
  assert.match(help.text, /Passage à Jeu/)
  assert.match(help.text, /variation maison reste dans Avant/)
})
