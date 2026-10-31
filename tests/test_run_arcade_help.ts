import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

import { RUN_ARCADE_HELP } from "../src/lib/run-arcade/help.ts"

const lab = readFileSync(new URL("../src/components/brain/run-arcade-lab.tsx", import.meta.url), "utf8")
const nav = readFileSync(new URL("../src/lib/nav.ts", import.meta.url), "utf8")
const copy = readFileSync(new URL("../src/lib/copy.ts", import.meta.url), "utf8")
const page = readFileSync(new URL("../src/app/brain/run-arcade/page.tsx", import.meta.url), "utf8")
const skills = readFileSync(new URL("../src/lib/run-arcade/skills.ts", import.meta.url), "utf8")
const thought = readFileSync(new URL("../src/lib/run-arcade/thought.ts", import.meta.url), "utf8")
const examen = readFileSync(new URL("../src/lib/run-arcade/examen.ts", import.meta.url), "utf8")
const prompt = readFileSync(new URL("../src/lib/run-arcade/prompt.ts", import.meta.url), "utf8")
const soir = readFileSync(new URL("../src/lib/run-arcade/soir.ts", import.meta.url), "utf8")

const KEYS = [
  "runners",
  "tirages",
  "minutes",
  "rayons",
  "lancer",
  "pause",
  "tour",
  "exporter",
  "importer",
  "statut",
  "archive",
  "horloge",
  "services",
  "generation",
  "champions",
  "suivant",
  "courbes",
  "persiste",
  "dessin",
  "gestes",
  "solde",
  "arbitre",
  "passe",
  "fiche",
  "skills",
  "journal",
] as const

test("every runArcade control has online help wired in the lab", () => {
  assert.deepEqual(Object.keys(RUN_ARCADE_HELP).sort(), [...KEYS].sort())
  for (const key of KEYS) {
    const help = RUN_ARCADE_HELP[key]
    assert.ok(help.title.trim().length > 1, key)
    assert.ok(help.body.trim().length > 40, key)
    for (const item of help.items ?? []) {
      assert.ok(item.label.trim().length > 0, key)
      assert.ok(item.text.trim().length > 12, `${key}:${item.label}`)
    }
    assert.match(lab, new RegExp(`RUN_ARCADE_HELP\\.${key}\\b`), key)
  }
  assert.match(lab, /<HelpTip/)
  assert.match(lab, /<LabelHelp/)
  assert.match(lab, /<HelpWrap/)
  assert.match(lab, /<TitleHelp/)
})

test("runArcade help names the purse, the exam, the evenings and the curves", () => {
  assert.match(thought, /START_CENTS = 5000/)
  assert.match(thought, /TICKET_CENTS = 250/)
  assert.match(thought, /HIT_CENTS = 200/)
  assert.match(thought, /RACE_DRAWS_DEFAULT = 25/)
  assert.match(thought, /RUNNER_DEFAULT = 8/)
  assert.match(thought, /RUNNER_MAX = 50/)
  assert.match(examen, /EXAM_WINDOW = 25/)
  assert.match(prompt, /PROMPT_ROWS = 12/)
  assert.match(soir, /EVENING_GAP_DAYS = 4/)
  assert.match(lab, /MINUTES_DEFAULT = 10/)
  assert.match(lab, /MINUTES_MAX = 120/)

  assert.match(RUN_ARCADE_HELP.solde.body, /50,00 €/)
  assert.match(RUN_ARCADE_HELP.solde.body, /2,50 €/)
  assert.match(RUN_ARCADE_HELP.solde.body, /2,00 €/)
  assert.match(RUN_ARCADE_HELP.solde.items?.[1].text ?? "", /25 derniers/)
  assert.match(RUN_ARCADE_HELP.solde.items?.[0].text ?? "", /sans verser/)
  assert.match(RUN_ARCADE_HELP.tirages.body, /25 au départ/)
  assert.match(RUN_ARCADE_HELP.tirages.body, /n−1 et n/)
  assert.match(RUN_ARCADE_HELP.minutes.body, /10 au départ/)
  assert.match(RUN_ARCADE_HELP.minutes.items?.[1].text ?? "", /tranche suivante/)
  assert.match(RUN_ARCADE_HELP.runners.body, /8 au départ/)
  assert.match(RUN_ARCADE_HELP.courbes.items?.[1].text ?? "", /10, 20, 30, 40 ou 50/)
  assert.match(RUN_ARCADE_HELP.courbes.items?.[3].text ?? "", /1–10/)
  assert.match(RUN_ARCADE_HELP.courbes.items?.[3].text ?? "", /41–50/)
  assert.match(RUN_ARCADE_HELP.services.items?.[0].text ?? "", /douze derniers/)
  assert.match(RUN_ARCADE_HELP.services.items?.[1].text ?? "", /tirage encore caché/)
  assert.match(RUN_ARCADE_HELP.champions.body, /vingt au plus/)
  assert.match(RUN_ARCADE_HELP.journal.body, /huit dernières/)
  assert.match(RUN_ARCADE_HELP.skills.body, /Une seule skill nouvelle/)
  assert.match(RUN_ARCADE_HELP.gestes.items?.[5].text ?? "", /quatre jours au plus/)
  assert.match(RUN_ARCADE_HELP.gestes.items?.[5].text ?? "", /mardi/)
  assert.match(RUN_ARCADE_HELP.gestes.items?.[5].text ?? "", /vendredi/)

  const phrases = ["reste sur place", "poursuit le pas", "inverse le pas", "vise le nombre d’or", "rejoint sa moyenne", "suit l’autre soir"]
  assert.deepEqual(
    RUN_ARCADE_HELP.gestes.items?.map((item) => item.label.toLowerCase()),
    phrases
  )
  for (const phrase of phrases) {
    assert.match(skills, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")))
  }

  assert.match(nav, /Une skill n’est gardée que si l’examen monte/)
  assert.match(nav, /à quatre jours au plus/)
  assert.match(copy, /solde d’examen monte/)
  assert.match(copy, /50,00 €/)
  assert.match(page, /Une skill n’est gardée que si l’examen monte/)
  assert.match(page, /à quatre jours au plus/)
})
