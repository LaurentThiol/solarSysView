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
  "depart",
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
  "resultat",
  "courbes",
  "persiste",
  "dessin",
  "couches",
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

  const phrases = [
    "reste sur place",
    "poursuit le pas",
    "inverse le pas",
    "vise le nombre d’or",
    "rejoint sa moyenne",
    "suit l’autre soir",
    "suit la suite logistique",
    "trace une figure",
  ]
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
  assert.match(RUN_ARCADE_HELP.gestes.items?.[6].text ?? "", /R\/4/)
  assert.match(RUN_ARCADE_HELP.gestes.items?.[6].text ?? "", /3,2/)
  assert.match(RUN_ARCADE_HELP.gestes.items?.[6].text ?? "", /3,8 et 4 sont refusés/)
  assert.match(RUN_ARCADE_HELP.runners.body, /Suite numérique/)
  assert.match(nav, /X\(n\+1\)/)
  assert.match(copy, /X\(n\+1\)/)
  assert.match(page, /X\(n\+1\)/)
  assert.match(RUN_ARCADE_HELP.gestes.items?.[7].text ?? "", /trois points/)
  assert.match(RUN_ARCADE_HELP.gestes.items?.[7].text ?? "", /15, 30 ou 45/)
  assert.match(RUN_ARCADE_HELP.dessin.items?.[4].text ?? "", /trois points/)
  assert.match(nav, /trois points/)
  assert.match(copy, /trois points/)
  assert.match(page, /trois points/)
})

test("runArcade help says the exam window slides, what an empty exam shows, and what chance pays", () => {
  const depart = RUN_ARCADE_HELP.depart.items?.find((item) => item.label === "Examen")
  assert.ok(depart)
  assert.match(depart.text, /Au lancement, l’examen rejoue les 25 derniers tirages gratuits/)
  assert.match(depart.text, /la fenêtre avance d’un tirage par tour/)
  assert.match(depart.text, /« au lancement »/)
  assert.equal(/restent les mêmes pour tous, juste avant la course\. Le tirage suivant/.test(depart.text), false)

  const exam = RUN_ARCADE_HELP.solde.items?.find((item) => item.label === "Examen")
  assert.match(exam?.text ?? "", /25 derniers tirages lisibles/)
  assert.match(exam?.text ?? "", /« au lancement » ou « au tour N »/)
  assert.match(exam?.text ?? "", /« — » et rien n’est gardé/)

  const chance = RUN_ARCADE_HELP.solde.items?.find((item) => item.label === "Hasard")
  assert.match(chance?.text ?? "", /29,17 € ± 8 sur 25 tours/)

  assert.match(RUN_ARCADE_HELP.tirages.body, /« — »/)
  assert.match(RUN_ARCADE_HELP.generation.body, /que l’examen a gardée en rejouant ce tirage/)
  assert.match(RUN_ARCADE_HELP.generation.body, /plage où le parent a été choisi/)
  const version = RUN_ARCADE_HELP.skills.items?.find((item) => item.label === "Examen de la version")
  assert.match(version?.text ?? "", /jusqu’au/)
  assert.match(version?.text ?? "", /visible à son propre examen/)
  assert.match(RUN_ARCADE_HELP.champions.body, /repère du hasard/)
  assert.match(RUN_ARCADE_HELP.fiche.body, /au lancement ou au tour N/)
})

test("the lab writes the exam window and the chance mark, and bounds the race on the track", () => {
  assert.match(lab, /maxRaceDraws\(series\)/)
  assert.equal(/series\.length - 2/.test(lab), false)
  assert.match(lab, /runnerExamLine\(runner\)/)
  assert.match(lab, /runnerExamLine\(focus\)/)
  assert.match(lab, /championExamLine\(item\)/)
  assert.match(lab, /championExamLine\(parent\)/)
  assert.match(lab, /balanceWithChance\(focus\.cents, focus\.turns\)/)
  assert.match(lab, /balanceWithChance\(item\.cents, historyTurns\[position\]\)/)
  assert.match(lab, /sharedSentence\(snapshot\.sharedWithParent/)
  assert.match(lab, /version\.examTo/)
})
