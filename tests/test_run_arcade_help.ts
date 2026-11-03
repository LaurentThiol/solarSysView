import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

import { TIP_MARGIN } from "../src/lib/run-arcade/figure.ts"
import { RUN_ARCADE_HELP } from "../src/lib/run-arcade/help.ts"
import { formatSlice, MINUTES_DEFAULT, MINUTES_MAX, MINUTES_MIN, MINUTES_STEP } from "../src/lib/run-arcade/clock.ts"
import { RACE_DRAWS_MAX, RACE_DRAWS_MIN } from "../src/lib/run-arcade/depart.ts"
import { chanceBalance, EXAM_WINDOW } from "../src/lib/run-arcade/examen.ts"
import { RUNNER_MIN, settleFields } from "../src/lib/run-arcade/fields.ts"
import { FONCTIONNEL_CHAIN } from "../src/lib/run-arcade/fonctionnel.ts"
import { PROMPT_ROWS } from "../src/lib/run-arcade/prompt.ts"
import { MIN_SLICE_MS } from "../src/lib/run-arcade/session.ts"
import type { SkillOrigin } from "../src/lib/run-arcade/skills.ts"
import { EVENING_GAP_DAYS } from "../src/lib/run-arcade/soir.ts"
import {
  formatCents,
  HIT_CENTS,
  RACE_DRAWS_DEFAULT,
  RUNNER_DEFAULT,
  RUNNER_MAX,
  START_CENTS,
  TICKET_CENTS,
} from "../src/lib/run-arcade/thought.ts"

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

/** Les nombres que l’aide écrit en toutes lettres. Un nombre absent d’ici fait échouer le test : il faut y ajouter son mot. */
const WORDS: Record<number, string> = { 4: "quatre", 8: "huit", 12: "douze", 20: "vingt" }

function has(text: string, expected: string) {
  assert.ok(text.includes(expected), `« ${expected} » est absent de « ${text.slice(0, 160)} »`)
}

test("the numbers of the help are drawn from the constants of the code", () => {
  const cents = formatCents
  const purse = RUN_ARCADE_HELP.solde.body
  has(purse, `part avec ${cents(START_CENTS)}`)
  has(purse, `coûte ${cents(TICKET_CENTS)}`)
  assert.equal(purse.split(`rapporte ${cents(HIT_CENTS)}`).length - 1, 2)

  const exam = RUN_ARCADE_HELP.solde.items?.find((item) => item.label === "Examen")?.text ?? ""
  has(exam, `sur les ${EXAM_WINDOW} derniers tirages lisibles`)
  has(exam, `les mêmes ${cents(START_CENTS)}, ${cents(TICKET_CENTS)} et ${cents(HIT_CENTS)}`)
  has(RUN_ARCADE_HELP.depart.items?.find((item) => item.label === "Examen")?.text ?? "", `rejoue les ${EXAM_WINDOW} derniers tirages gratuits`)

  const chance = RUN_ARCADE_HELP.solde.items?.find((item) => item.label === "Hasard")?.text ?? ""
  const mark = chanceBalance(EXAM_WINDOW)
  has(chance, `${cents(mark.cents)} ± ${Math.round(mark.spreadCents / 100)} sur ${EXAM_WINDOW} tours`)
  assert.equal(Math.round(chanceBalance(6).cents), START_CENTS - 6 * TICKET_CENTS + 5 * HIT_CENTS, "5 trouvés pour 6 tours")
  has(chance, "5/6")
  const variance = (chanceBalance(100).spreadCents / HIT_CENTS) ** 2 / 100
  has(chance, `√(${variance.toFixed(4).replace(".", ",")} × N)`)

  has(RUN_ARCADE_HELP.runners.body, `De ${RUNNER_MIN} à ${RUNNER_MAX} coureurs, ${RUNNER_DEFAULT} au départ`)
  has(RUN_ARCADE_HELP.tirages.body, `${RACE_DRAWS_DEFAULT} au départ, de ${RACE_DRAWS_MIN} à ${RACE_DRAWS_MAX}`)
  has(RUN_ARCADE_HELP.minutes.body, `de ${MINUTES_MIN} à ${MINUTES_MAX}, par demi-minute, ${MINUTES_DEFAULT} au départ`)
  assert.equal(MINUTES_STEP, 0.5)
  has(RUN_ARCADE_HELP.horloge.body, `sans descendre sous ${formatSlice(MIN_SLICE_MS)}`)
  has(RUN_ARCADE_HELP.horloge.body, `les tours s’enchaînent, ${formatSlice(MIN_SLICE_MS)} chacun`)

  has(RUN_ARCADE_HELP.services.items?.[0].text ?? "", `les ${WORDS[PROMPT_ROWS]} derniers tirages lisibles`)
  has(RUN_ARCADE_HELP.gestes.items?.[5].text ?? "", `à ${WORDS[EVENING_GAP_DAYS]} jours au plus`)
})

test("the help says what a runner can add per launch, and the three origins the screen writes", () => {
  const body = RUN_ARCADE_HELP.skills.body
  assert.doesNotMatch(body, /Une seule skill nouvelle est gardée par lancement/)
  has(body, "au plus deux par runner et par lancement : une de la variation maison, au lancement, et une de l’IA locale")
  const rule = FONCTIONNEL_CHAIN.find((item) => item.op === "examen")?.rule ?? ""
  assert.doesNotMatch(rule, /une seule skill nouvelle/)
  has(rule, "L’IA ajoute au plus une courbe nouvelle par lancement")

  const origins: Record<SkillOrigin, string> = { maison: "le geste de départ", variation: "variation maison", ia: "modèle local" }
  const origin = RUN_ARCADE_HELP.skills.items?.find((item) => item.label === "Origine")?.text ?? ""
  for (const [word, meaning] of Object.entries(origins)) {
    has(origin, `${word} :`)
    has(origin, meaning)
  }
  assert.match(lab, /\{version\.origin\}/)
})

test("the help says which draw the result shows, how Lancer waits, and that an interruption is not a panne", () => {
  const last = RUN_ARCADE_HELP.resultat.items?.find((item) => item.label === "Dernier tirage")?.text ?? ""
  has(last, "dernier tirage de la course du champion")
  has(last, "Persiste recopie le dernier tirage de l’archive, pas celui-ci")
  assert.equal(/ou le dernier de l’archive/.test(last), false)
  has(RUN_ARCADE_HELP.lancer.body, "reste éteint pendant la lecture de l’archive")
  has(RUN_ARCADE_HELP.lancer.body, "repart du parent de la course en cours")
  has(RUN_ARCADE_HELP.lancer.body, "se corrigent quand on les quitte, ou au lancement")
  has(RUN_ARCADE_HELP.champions.body, "La liste se relit quand un champion vient d’être écrit")
  const board = RUN_ARCADE_HELP.rayons.items?.find((item) => item.label === "Fonctionnel")?.text ?? ""
  has(board, "s’écrit « interrompu » : ce n’est pas une panne")
})

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
  assert.match(thought, /RUNNER_MAX = 18/)
  assert.match(examen, /EXAM_WINDOW = 25/)
  assert.match(prompt, /PROMPT_ROWS = 12/)
  assert.match(soir, /EVENING_GAP_DAYS = 4/)

  assert.match(RUN_ARCADE_HELP.solde.items?.[0].text ?? "", /sans verser/)
  assert.match(RUN_ARCADE_HELP.tirages.body, /n−1 et n/)
  assert.match(RUN_ARCADE_HELP.minutes.items?.[1].text ?? "", /tranche suivante/)
  assert.match(RUN_ARCADE_HELP.courbes.items?.[1].text ?? "", /10, 20, 30, 40 ou 50/)
  assert.match(RUN_ARCADE_HELP.courbes.items?.[3].text ?? "", /1–10/)
  assert.match(RUN_ARCADE_HELP.courbes.items?.[3].text ?? "", /41–50/)
  assert.match(RUN_ARCADE_HELP.services.items?.[0].text ?? "", /douze derniers/)
  assert.match(RUN_ARCADE_HELP.services.items?.[1].text ?? "", /tirage encore caché/)
  assert.match(RUN_ARCADE_HELP.champions.body, /vingt au plus/)
  assert.match(RUN_ARCADE_HELP.journal.body, /huit dernières/)
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
  assert.match(RUN_ARCADE_HELP.gestes.items?.[7].text ?? "", /15, 30 ou 45/)
})

test("runArcade texts say that the drawn circle is the golden circle, for every gesture", () => {
  const circle = /Le cercle dessiné est toujours le cercle d’or, même pour une figure/
  assert.match(RUN_ARCADE_HELP.gestes.items?.[7].text ?? "", circle)
  assert.match(RUN_ARCADE_HELP.dessin.items?.[4].text ?? "", circle)
  assert.match(nav, circle)
  assert.match(copy, circle)
  assert.match(page, circle)
  assert.doesNotMatch(JSON.stringify(RUN_ARCADE_HELP), /trois points/)
  for (const text of [nav, copy, page]) assert.doesNotMatch(text, /Le cercle de la figure passe par trois points/)
})

test("runArcade help follows the suite, the waves, the figure window, the evening and the base gestures", () => {
  const suite = RUN_ARCADE_HELP.gestes.items?.[6].text ?? ""
  assert.match(suite, /bornes de la courbe, ou entre les lignes/)
  assert.match(suite, /« du dernier pas » est refusée/)
  assert.doesNotMatch(suite, /ou dernier pas/)
  const evening = RUN_ARCADE_HELP.gestes.items?.[5].text ?? ""
  assert.doesNotMatch(evening, /harmonique/i)
  const figure = RUN_ARCADE_HELP.gestes.items?.[7].text ?? ""
  assert.match(figure, /au moins autant de tirages que le calibre/)
  assert.match(figure, /Le sinus lit la phase du dernier cran/)
  assert.match(figure, /Sinus, tangente, arcsinus et arccosinus lisent une période/)
  assert.doesNotMatch(figure, /\bcosinus\b/)
  assert.equal(TIP_MARGIN, 0.25)
  assert.match(figure, /dépasser la fenêtre d’un quart de sa hauteur au plus/)
  assert.doesNotMatch(figure, /d’une amplitude/)
  assert.doesNotMatch(figure, /se place entre le plus bas et le plus haut de la fenêtre/)
  const runners = RUN_ARCADE_HELP.runners.body
  assert.match(runners, /De 1 à 18 coureurs, 8 au départ/)
  assert.match(runners, /Chacun commence avec un geste de base différent/)
  assert.doesNotMatch(runners, /Au-delà de 18/)
  assert.match(lab, /max=\{RUNNER_MAX\}/)
  const typed = { count: String(RUNNER_MAX + 1) }
  assert.equal(settleFields([], { count: RUNNER_DEFAULT, draws: 25, minutes: 10, date: "" }, typed).count, RUNNER_MAX)
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
