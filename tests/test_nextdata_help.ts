import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

import { NEXTDATA_HELP, NEXTDATA_TRAINING_HELP } from "../src/lib/nextdata/help.ts"

const lab = readFileSync(new URL("../src/components/nextdata/nextdata-lab.tsx", import.meta.url), "utf8")
const training = readFileSync(new URL("../src/components/nextdata/training-lab.tsx", import.meta.url), "utf8")
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
  assert.match(NEXTDATA_HELP.tabBase.body, /1\/50/)
  assert.match(NEXTDATA_HELP.banner.body, /pas une probabilité de gain FDJ/)
  assert.match(NEXTDATA_HELP.moteur.body, /CatBoost/)
  assert.match(NEXTDATA_HELP.bibliotheque.body, /Jeux/)
  assert.match(nav, /Fenêtre seule/)
})

test("nextDataTraining explains the backward shift", () => {
  for (const key of Object.keys(NEXTDATA_TRAINING_HELP)) {
    assert.match(training, new RegExp(`NEXTDATA_TRAINING_HELP\\.${key}\\b`), key)
    assert.ok(NEXTDATA_TRAINING_HELP[key as keyof typeof NEXTDATA_TRAINING_HELP].body.length > 40)
  }
  assert.match(NEXTDATA_TRAINING_HELP.banner.body, /pas une probabilité de gain FDJ/)
  assert.match(NEXTDATA_TRAINING_HELP.banner.body, /10 %/)
  assert.match(NEXTDATA_TRAINING_HELP.decalage.body, /avant le tirage noté/)
  assert.match(training, /role="progressbar"/)
  assert.match(training, /shift: lag/)
  assert.match(nav, /nextdatatraining/)
})
