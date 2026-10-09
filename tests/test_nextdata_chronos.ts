import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

import { CHRONOS_WINDOW, chronosBanner, chronosShare } from "../src/lib/nextdata/chronos.ts"
import { chronosPart } from "../src/lib/nextdata/rank-path.ts"

const lab = readFileSync(new URL("../src/components/nextdata/nextdata-lab.tsx", import.meta.url), "utf8")
const training = readFileSync(new URL("../src/components/nextdata/training-lab.tsx", import.meta.url), "utf8")
const backtest = readFileSync(new URL("../synchro/nextdata/backtest.py", import.meta.url), "utf8")

test("the banner says why Chronos did not answer", () => {
  assert.equal(chronosBanner({ requested: false, used: false }), null)
  assert.equal(chronosBanner({ requested: true, used: true }), null)
  assert.equal(chronosBanner({ requested: true, used: false }), "Chronos n’a pas répondu. LightGBM et CatBoost restent seuls.")
  assert.equal(
    chronosBanner({ requested: true, used: false, error: "Chronos n’est pas installé : ./launch install-nextdata." }),
    "Chronos n’est pas installé : ./launch install-nextdata. LightGBM et CatBoost restent seuls."
  )
  assert.match(lab, /chronosBanner\(report\.chronos\)/)
  assert.match(training, /chronosBanner\(report\.chronos\)/)
  assert.match(lab, /!status\.chronos_error/)
})

test("the share of Chronos says when ten earlier draws are missing", () => {
  assert.equal(chronosShare({ available: false }), null)
  assert.equal(chronosShare({ available: true, weight: 0.5, window: 3 }), "Chronos 50 %, faute de 10 tirages d’avant")
  assert.equal(chronosShare({ available: true, weight: 0.52, window: 10 }), "Chronos 48 % de la somme")
  assert.match(backtest, new RegExp(`^CHRONOS_WINDOW = ${CHRONOS_WINDOW}$`, "m"))
})

test("the rank figure shows what Chronos brings to the level of n1", () => {
  const row = {
    rank: "n1",
    chain: 8,
    level: 7,
    delta: 6,
    weights: { chain: 0, level: 0.6, delta: 0.4 },
    blend: 6.6,
    clipped: 6.6,
    grid: 7,
  }
  assert.equal(chronosPart(row, String), null)
  assert.equal(chronosPart({ ...row, chronos: { value: 5.5, share: 0.48 } }, String), "dont Chronos 5.5 · 48 %")
})
