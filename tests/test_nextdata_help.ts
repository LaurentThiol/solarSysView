import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

import { NEXTDATA_HELP, NEXTDATA_TRAINING_HELP } from "../src/lib/nextdata/help.ts"
import { pulseCaption } from "../src/lib/nextdata/pulse.ts"
import { shapeCaption } from "../src/lib/nextdata/shape.ts"

const lab = readFileSync(new URL("../src/components/nextdata/nextdata-lab.tsx", import.meta.url), "utf8")
const training = readFileSync(new URL("../src/components/nextdata/training-lab.tsx", import.meta.url), "utf8")
const meter = readFileSync(new URL("../src/components/nextdata/step-meter.tsx", import.meta.url), "utf8")
const nav = readFileSync(new URL("../src/lib/nav.ts", import.meta.url), "utf8")

test("every nextData help entry is wired and says something", () => {
  for (const key of Object.keys(NEXTDATA_HELP)) {
    assert.match(lab, new RegExp(`NEXTDATA_HELP\\.${key}\\b`), key)
    const help = NEXTDATA_HELP[key as keyof typeof NEXTDATA_HELP]
    assert.ok(help.title.trim().length > 0, key)
    assert.ok(help.body.trim().length > 40, key)
  }
})

test("the two trainings, the focus and the recounted base are explained", () => {
  assert.match(NEXTDATA_HELP.train.body, /interrupteur/)
  assert.match(NEXTDATA_HELP.train.items?.[0].text ?? "", /pèse 3/)
  assert.match(NEXTDATA_HELP.train.items?.[1].text ?? "", /50 ou 100/)
  assert.match(NEXTDATA_HELP.focus.body, /50 ou 100/)
  assert.match(NEXTDATA_HELP.covariates.items?.map((item) => item.label).join(" ") ?? "", /Couples/)
  assert.match(NEXTDATA_HELP.covariates.items?.map((item) => item.label).join(" ") ?? "", /Triples/)
  assert.match(NEXTDATA_HELP.covariates.items?.map((item) => item.label).join(" ") ?? "", /Pulse/)
  assert.match(NEXTDATA_HELP.covariates.body, /Pulse sont connus avant/)
  assert.match(lab, /id: "pulse"/)
  assert.match(training, /id: "pulse"/)
  assert.equal(
    pulseCaption({ lobe: 0.54, mass: 0.21, star_lobe: 0.333, star_mass: 0.08 }),
    "Boules en lobe 54 %, masse 21 % · étoiles 33 %, masse 8 %"
  )
  assert.match(NEXTDATA_HELP.tabBase.body, /1\/50/)
  assert.match(NEXTDATA_HELP.banner.body, /pas une probabilité de gain FDJ/)
  assert.match(NEXTDATA_HELP.moteur.body, /CatBoost/)
  assert.match(NEXTDATA_HELP.bibliotheque.body, /Jeux/)
  assert.match(NEXTDATA_HELP.run.body, /même réglage/)
  assert.match(NEXTDATA_HELP.bandes.body, /conforme/)
  assert.match(nav, /Fenêtre seule/)
})

test("the 95 % margins are explained where they are shown", () => {
  assert.match(NEXTDATA_HELP.apparie.body, /mêmes tirages/)
  assert.match(NEXTDATA_HELP.apparie.body, /Diebold et Mariano/)
  assert.match(NEXTDATA_HELP.apparie.items?.map((item) => item.label).join(" ") ?? "", /Non tranché/)
  assert.match(NEXTDATA_HELP.metriques.items?.map((item) => item.label).join(" ") ?? "", /IC 95 %/)
  assert.match(NEXTDATA_HELP.bandes.items?.[0].text ?? "", /Wilson/)
  assert.match(NEXTDATA_TRAINING_HELP.verdicts.body, /Non tranché/)
  assert.match(NEXTDATA_TRAINING_HELP.rangs.body, /49 à 94 %/)
  assert.match(NEXTDATA_TRAINING_HELP.boules.body, /plage du hasard/)
  assert.match(lab, /Contre la moyenne/)
  assert.match(lab, /IC 95 %/)
  assert.doesNotMatch(training, /sous \$\{below/)
  assert.match(training, /data-versus/)
})

test("nextDataTraining explains the backward shift", () => {
  for (const key of Object.keys(NEXTDATA_TRAINING_HELP)) {
    assert.match(training, new RegExp(`NEXTDATA_TRAINING_HELP\\.${key}\\b`), key)
    assert.ok(NEXTDATA_TRAINING_HELP[key as keyof typeof NEXTDATA_TRAINING_HELP].body.length > 40)
  }
  assert.match(NEXTDATA_TRAINING_HELP.banner.body, /pas une probabilité de gain FDJ/)
  assert.match(NEXTDATA_TRAINING_HELP.banner.body, /pas calculés/)
  assert.match(NEXTDATA_TRAINING_HELP.banner.body, /mêmes arbres, mêmes quantiles/)
  assert.match(NEXTDATA_TRAINING_HELP.decalage.body, /avant le tirage noté/)
  assert.match(NEXTDATA_TRAINING_HELP.banner.body, /temps écoulé/)
  assert.match(NEXTDATA_TRAINING_HELP.banner.body, /pas une estimation du temps restant/)
  assert.match(training, /<StepMeter/)
  assert.match(lab, /<StepMeter/)
  assert.match(meter, /role="progressbar"/)
  assert.match(meter, /train-travel/)
  assert.match(meter, /train-travel-late/)
  assert.match(meter, /formatRunClock/)
  assert.doesNotMatch(training, /shift: lag/)
  assert.match(training, /progress\.ready/)
  assert.match(NEXTDATA_TRAINING_HELP.rangs.body, /Calibrée/)
  assert.match(nav, /nextdatatraining/)
  assert.match(NEXTDATA_TRAINING_HELP.rangs.body, /étendue ★/)
  assert.match(training, /consécutifs ★/)
  assert.match(NEXTDATA_TRAINING_HELP.boules.body, /cerclée/)
  assert.match(NEXTDATA_TRAINING_HELP.boules.body, /prévu moins sorti/)
  assert.match(training, /TrainingCompare/)
  assert.doesNotMatch(training, /shapeCaption/)
  assert.doesNotMatch(training, /forme prévue/)
})

test("étendue and consécutifs follow the evolution page", () => {
  assert.equal(
    shapeCaption([1, 2, 3, 10, 20], [4, 5]),
    "Étendue 19 · consécutifs 2 · étendue ★ 1 · consécutifs ★ 1"
  )
  assert.equal(shapeCaption([10, 12, 14, 16, 20], [1, 3]), "Étendue 10 · consécutifs 0 · étendue ★ 2 · consécutifs ★ 0")
  assert.match(lab, /label: "Étendue ★"/)
  assert.match(lab, /shapeCaption/)
  assert.match(NEXTDATA_HELP.moteur.items?.map((item) => item.label).join(" ") ?? "", /Étendue et consécutifs/)
  assert.match(NEXTDATA_HELP.courbes.body, /page Évolution/)
  assert.match(NEXTDATA_HELP.suivantes.body, /consécutifs/)
})
