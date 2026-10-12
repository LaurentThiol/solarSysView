import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

import { PULSE_HELP } from "../src/lib/pulse-help.ts"
import { WEEKDAY_SCOPE_OPTIONS } from "../src/lib/weekday-scope.ts"

const lab = readFileSync(new URL("../src/components/pulse/pulse-lab.tsx", import.meta.url), "utf8")
const pulse = readFileSync(new URL("../src/lib/pulse.ts", import.meta.url), "utf8")
const windows = readFileSync(new URL("../src/lib/analysis-window.ts", import.meta.url), "utf8")

const KEYS = [
  "reglages",
  "jour",
  "generateurs",
  "echantillons",
  "lancer",
  "avertissement",
  "concordance",
  "synthese",
  "fiche",
  "groupes",
  "boules",
  "etoiles",
  "fenetres",
  "numero",
  "generateur",
  "periode",
  "rayon",
  "p",
  "liens",
  "tranches",
  "onde",
  "rotation",
  "phases",
  "sorties",
] as const

test("every Pulse field has online help wired in the lab", () => {
  assert.deepEqual(Object.keys(PULSE_HELP).sort(), [...KEYS].sort())
  for (const key of KEYS) {
    const help = PULSE_HELP[key]
    assert.ok(help.title.trim().length > 1, key)
    assert.ok(help.body.trim().length > 40, key)
    assert.doesNotMatch(`${help.title}\n${help.body}`, /hertz/i, key)
    const items = "items" in help ? help.items : []
    for (const item of items) {
      assert.ok(item.label.trim().length > 0, key)
      assert.ok(item.text.trim().length > 12, `${key}:${item.label}`)
      assert.doesNotMatch(`${item.label}\n${item.text}`, /hertz/i, `${key}:${item.label}`)
    }
    assert.match(lab, new RegExp(`PULSE_HELP\\.${key}\\b`), key)
  }
})

test("Pulse help names the controls and the reading rules", () => {
  assert.deepEqual(
    PULSE_HELP.jour.items?.map((item) => item.label),
    WEEKDAY_SCOPE_OPTIONS.map((item) => item.label)
  )
  assert.deepEqual(
    PULSE_HELP.generateurs.items?.map((item) => item.label),
    ["Cycle simple", "Double cycle", "Rotation de paire", "Rotation de triplet"]
  )
  for (const label of PULSE_HELP.generateurs.items?.map((item) => item.label) ?? []) {
    assert.match(pulse, new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")))
  }
  const presetLabels = [
    "20 derniers tirages",
    "50 derniers tirages",
    "100 derniers tirages",
    "200 derniers tirages",
    "Année civile",
    "Année n-1",
    "Année n-2",
  ]
  assert.deepEqual(
    PULSE_HELP.echantillons.items?.map((item) => item.label),
    presetLabels
  )
  for (const label of presetLabels) {
    assert.match(windows, new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")))
  }

  assert.match(PULSE_HELP.generateurs.items?.[0].text ?? "", /fondamentale/)
  assert.match(PULSE_HELP.generateurs.items?.[0].text ?? "", /85 %/)
  assert.match(PULSE_HELP.generateurs.body, /Décocher Cycle simple ne l’ôte pas/)
  assert.match(PULSE_HELP.generateurs.items?.[1].text ?? "", /16 mélanges/)
  assert.match(PULSE_HELP.generateurs.items?.[1].text ?? "", /5 points/)
  assert.match(PULSE_HELP.generateurs.items?.[2].text ?? "", /0,40 à 0,60/)
  assert.match(PULSE_HELP.generateurs.items?.[3].text ?? "", /tiers de tour/)
  assert.match(PULSE_HELP.generateurs.items?.[3].text ?? "", /0,08/)
  assert.match(PULSE_HELP.echantillons.body, /0,15 tour/)
  assert.match(PULSE_HELP.echantillons.body, /blocs de 40/)
  assert.match(PULSE_HELP.lancer.body, /pas le tirage suivant/)
  assert.match(PULSE_HELP.avertissement.body, /indépendants/)
  assert.match(PULSE_HELP.avertissement.body, /0,1 cycle par tirage/)
  assert.match(PULSE_HELP.concordance.body, /plus longue/)
  assert.match(PULSE_HELP.p.body, /exp\(−n R²\)/)
  assert.match(PULSE_HELP.p.body, /la plus grande/)
  assert.match(PULSE_HELP.groupes.body, /24/)
  assert.match(PULSE_HELP.onde.items?.map((item) => item.label).join(" ") ?? "", /Sortie/)
  assert.match(PULSE_HELP.onde.items?.map((item) => item.label).join(" ") ?? "", /Onde/)
  assert.match(PULSE_HELP.fenetres.body, /warmup/)
  assert.match(lab, /b\.draws - a\.draws/)
  assert.match(lab, /<HelpTip/)
  assert.match(lab, /<TitleHelp/)
  assert.match(lab, /<HelpWrap/)
})
