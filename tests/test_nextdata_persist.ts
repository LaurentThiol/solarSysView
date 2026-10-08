import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

import { NEXTDATA_HELP, NEXTDATA_TRAINING_HELP } from "../src/lib/nextdata/help.ts"
import {
  formatPoints,
  formatPValue,
  formatRate,
  gridFields,
  pairPersist,
  persistKey,
  signTest,
  swapLabel,
  swapNoise,
  swappedValues,
  tallySwaps,
  type PersistSwap,
} from "../src/lib/nextdata/persist.ts"
import { RETOUR_READINGS, lowestSumMae } from "../src/lib/nextdata/retour.ts"

const lab = readFileSync(new URL("../src/components/nextdata/nextdata-lab.tsx", import.meta.url), "utf8")
const training = readFileSync(new URL("../src/components/nextdata/training-lab.tsx", import.meta.url), "utf8")
const compare = readFileSync(new URL("../src/components/nextdata/training-compare.tsx", import.meta.url), "utf8")

function swap(kind: "number" | "star", from: number, to: number, outcome: PersistSwap["outcome"], lag: 1 | 2 = 1): PersistSwap {
  return { kind, from, to, lag, distance: Math.abs(from - to), outcome }
}

test("the sign test is exact and two-sided", () => {
  assert.equal(signTest(0, 0), null)
  assert.equal(signTest(3, 3), 1)
  assert.ok(Math.abs((signTest(0, 5) ?? 0) - 2 / 32) < 1e-12)
  assert.ok(Math.abs((signTest(9, 1) ?? 0) - 22 / 1024) < 1e-12)
  assert.equal(signTest(1, 9), signTest(9, 1))
  const wide = signTest(600, 400) ?? 1
  assert.ok(wide > 0 && wide < 1e-9)
})

test("chance noise grows with the square root of the swaps", () => {
  assert.equal(swapNoise(0, "number"), 0)
  const one = swapNoise(1, "number")
  assert.ok(Math.abs(one - 1.959964 * Math.sqrt(2 * 0.1 * (45 / 49))) < 1e-9)
  assert.ok(Math.abs(swapNoise(100, "number") - 10 * one) < 1e-9)
  assert.ok(swapNoise(10, "star") > swapNoise(10, "number"))
})

test("a tally counts gains, losses and neutral swaps by kind", () => {
  const tally = tallySwaps(
    [[swap("number", 15, 14, "gain"), swap("star", 3, 2, "loss")], undefined, [swap("number", 24, 25, "neutral", 2)]],
    "number"
  )
  assert.deepEqual(
    { swaps: tally.swaps, gains: tally.gains, losses: tally.losses, neutral: tally.neutral, net: tally.net },
    { swaps: 2, gains: 1, losses: 0, neutral: 1, net: 1 }
  )
  assert.equal(tally.p, 1)
  assert.equal(tallySwaps([[swap("star", 3, 2, "loss")]], "star").losses, 1)
})

test("the same model grid is scored with and without Persist", () => {
  const paired = pairPersist([
    {
      actual: { numbers: [14, 20, 30, 41, 45], stars: [2, 12] },
      raw: { numbers: [7, 15, 24, 31, 44], stars: [3, 8] },
      persist: {
        numbers: [7, 14, 24, 31, 44],
        stars: [2, 8],
        swaps: [swap("number", 15, 14, "gain"), swap("star", 3, 2, "gain")],
      },
    },
    {
      actual: { numbers: [1, 2, 3, 4, 5], stars: [1, 2] },
      raw: { numbers: [1, 2, 3, 4, 6], stars: [1, 3] },
      persist: { numbers: [1, 2, 3, 4, 6], stars: [1, 3], swaps: [] },
    },
    { actual: { numbers: [1, 2, 3, 4, 5], stars: [1, 2] }, raw: { numbers: [1, 2, 3, 4, 5], stars: [1, 2] }, persist: null },
  ])
  assert.ok(paired)
  assert.equal(paired.draws, 2)
  assert.equal(paired.moved, 1)
  assert.equal(paired.numbers.gains, 1)
  assert.equal(paired.stars.gains, 1)
  assert.deepEqual(paired.hits.raw, { numbers: 2, stars: 0.5 })
  assert.deepEqual(paired.hits.persist, { numbers: 2.5, stars: 1 })
  const sum = paired.fields.find((field) => field.key === "sum")
  assert.equal(sum?.raw, (29 + 1) / 2)
  assert.equal(sum?.persist, (30 + 1) / 2)
  assert.equal(sum?.delta, 0.5)
  const n2 = paired.fields.find((field) => field.key === "n2")
  assert.equal(n2?.raw, (5 + 0) / 2)
  assert.equal(n2?.persist, (6 + 0) / 2)
  assert.equal(pairPersist([]), null)
})

test("grid fields follow the sorted ranks and the evolution shape", () => {
  assert.deepEqual(gridFields({ numbers: [31, 7, 14, 44, 24], stars: [8, 2] }), {
    sum: 120,
    n1: 7,
    n2: 14,
    n3: 24,
    n4: 31,
    n5: 44,
    e1: 2,
    e2: 8,
    spread: 37,
    consecutive: 0,
  })
})

test("swaps read as from → to with their draw", () => {
  assert.equal(swapLabel(swap("number", 15, 14, "gain")), "15 → 14 · n−1 · gagné")
  assert.equal(swapLabel(swap("star", 3, 2, undefined, 2)), "★ 3 → 2 · n−2")
  assert.deepEqual([...swappedValues([swap("number", 15, 14, "gain"), swap("star", 3, 2, "loss")], "number")], [14])
  assert.equal(persistKey("corpus_catboost"), "corpus_catboost_persist")
})

test("shares and points are written the French way", () => {
  assert.equal(formatRate(0.09824).replace(/\s/g, " "), "9,8 %")
  assert.equal(formatPoints(-0.003612), "−0,4 pt")
  assert.equal(formatPoints(0.0125), "+1,3 pt")
  assert.equal(formatPoints(null), "—")
  assert.equal(formatPValue(0.0004), "< 0,001")
  assert.equal(formatPValue(0.0625), "0,063")
  assert.equal(formatPValue(0.63), "0,63")
})

test("the retour lists each Persist twin after the model readings", () => {
  const ids = RETOUR_READINGS.map((item) => item.id)
  for (const id of ["corpus", "fenetre", "corpus_catboost", "fenetre_catboost"]) {
    assert.ok(ids.indexOf(persistKey(id) as (typeof ids)[number]) > ids.indexOf("fenetre_catboost"), id)
    assert.ok(ids.indexOf(persistKey(id) as (typeof ids)[number]) < ids.indexOf("persistence"), id)
  }
  assert.equal(lowestSumMae({ corpus: { mae: { sum: 20 } }, corpus_persist: { mae: { sum: 19 } } }), "corpus")
  assert.equal(lowestSumMae({ corpus_persist: { mae: { sum: 19 } } }), null)
})

test("Persist is wired in both pages and its help says what it costs", () => {
  assert.match(lab, /NEXTDATA_HELP\.persist\b/)
  assert.match(lab, /persist: persistSetting/)
  assert.match(training, /persist: persistSetting/)
  assert.match(training, /NEXTDATA_TRAINING_HELP\.persist\b/)
  assert.match(compare, /swappedValues/)
  assert.match(NEXTDATA_HELP.persist.body, /n−1 ou n−2/)
  assert.match(NEXTDATA_HELP.persist.body, /Persistance/)
  assert.match(NEXTDATA_HELP.persistArchive.body, /hasard/)
  assert.match(NEXTDATA_HELP.persistPair.body, /gagné/)
  assert.match(NEXTDATA_TRAINING_HELP.persist.body, /dix décalages/)
})
