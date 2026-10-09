import assert from "node:assert/strict"
import test from "node:test"

import {
  lowestAgainstNext,
  lowestNote,
  lowestSumMae,
  twinOrigin,
  undecidedRunnerUp,
} from "../src/lib/nextdata/retour.ts"
import {
  chanceOdds,
  chanceRange,
  chanceSentence,
  chanceText,
  coverageRange,
  formatCoverage,
  formatGap,
  formatHits,
  formatInterval,
  formatShareInterval,
  hitsWord,
  maeInterval,
  verdictLabel,
  versusText,
  type ChanceHits,
  type PairedGap,
} from "../src/lib/nextdata/uncertainty.ts"

const gap = (value: number, lo: number | null, hi: number | null, verdict: PairedGap["verdict"]): PairedGap => ({
  value,
  lo,
  hi,
  count: lo == null ? 1 : 10,
  p: null,
  verdict,
})

const tenDraws: ChanceHits = { observed: 0.7, expected: 0.5, lo: 0.1, hi: 0.9, p: 0.2224, count: 10 }

test("a MAE carries its 95 % interval, one decimal and a French comma", () => {
  assert.equal(formatInterval({ lo: 17.84, hi: 27.91 }), "17,8 à 27,9")
  assert.equal(formatInterval({ lo: null, hi: 27.91 }), "—")
  assert.equal(formatInterval(undefined), "—")
  assert.equal(maeInterval({ value: 22.6, lo: 17.8, hi: 27.9, count: 10 }), "IC 95 % : 17,8 à 27,9")
  assert.equal(maeInterval({ value: 22.6, lo: null, hi: null, count: 1 }), "")
})

test("a paired verdict says lower, higher or undecided, with its numbers", () => {
  assert.equal(verdictLabel("lower"), "erreur plus basse")
  assert.equal(verdictLabel("higher"), "erreur plus haute")
  assert.equal(verdictLabel("undecided"), "non tranché")
  assert.equal(verdictLabel(null), "—")
  assert.equal(formatGap(gap(-1.24, -4.43, 2.06, "undecided")), "-1,2 ; IC -4,4 à 2,1")
  assert.equal(formatGap(gap(3, null, null, "undecided")), "+3,0 ; un seul tirage")
  assert.equal(versusText(gap(-1.24, -4.43, 2.06, "undecided")), "non tranché (-1,2 ; IC -4,4 à 2,1)")
  assert.equal(versusText(gap(-12, -21.6, -2.4, "lower")), "erreur plus basse (-12,0 ; IC -21,6 à -2,4)")
  assert.equal(versusText(undefined), "—")
})

test("common numbers read against the exact law of chance", () => {
  assert.equal(formatHits(0.5833), "0,58")
  assert.equal(formatHits(null), "—")
  assert.equal(hitsWord(0.5, "numéro", "numéros"), "0,50 numéro")
  assert.equal(hitsWord(2.4, "numéro", "numéros"), "2,40 numéros")
  assert.equal(chanceRange(tenDraws), "0,50 (0,10 à 0,90)")
  assert.equal(chanceRange(null), "—")
  assert.equal(chanceText(tenDraws), "le hasard donne 0,50, entre 0,10 et 0,90 sur 10 tirages")
  assert.equal(chanceOdds(tenDraws), "une grille au hasard fait au moins autant 22 fois sur 100")
  assert.equal(chanceOdds({ ...tenDraws, p: 0.001 }), "une grille au hasard fait au moins autant moins d’une fois sur 100")
  assert.equal(
    chanceSentence({ numbers: tenDraws, stars: { observed: 0.1, expected: 0.3333, lo: 0.1, hi: 0.7, p: 0.98, count: 10 } }),
    "Au hasard, une grille partage en moyenne 0,50 numéro et 0,33 étoile ; sur 10 tirages, sa moyenne tombe entre 0,10 et 0,90 numéro, entre 0,10 et 0,70 étoile, 95 fois sur 100."
  )
  assert.equal(chanceSentence({ numbers: null, stars: null }), "")
})

test("band coverage carries its Wilson interval", () => {
  assert.equal(formatCoverage(8, 10), "8/10 (49 à 94 %)")
  assert.equal(coverageRange(8, 10), "49 à 94 %")
  assert.equal(coverageRange(0, 0), "—")
  assert.equal(formatCoverage(0, 0), "—")
  assert.equal(formatShareInterval(0.4902, 0.9433), "49 à 94 %")
  assert.equal(formatShareInterval(null, 0.9), "—")
})

test("the lowest error says when the runner-up is not beaten", () => {
  const undecided = {
    corpus: { mae: { sum: 20 }, versus: { mean: gap(-1, -4, 2, "undecided") } },
    mean: { mae: { sum: 21 }, versus: { corpus: gap(1, -2, 4, "undecided") } },
    fenetre: { mae: { sum: 23 } },
  }
  const lowest = lowestAgainstNext(undecided)
  assert.equal(lowest?.best, "corpus")
  assert.equal(lowest?.next, "mean")
  assert.equal(undecidedRunnerUp(lowest), "mean")
  assert.equal(lowestNote(lowest), "plus basse erreur, non tranché face à Moyenne")
  assert.equal(lowestSumMae(undecided), "corpus")

  const decided = { ...undecided, corpus: { mae: { sum: 20 }, versus: { mean: gap(-6, -9, -3, "lower") } } }
  assert.equal(lowestNote(lowestAgainstNext(decided)), "plus basse erreur")
  assert.equal(undecidedRunnerUp(lowestAgainstNext(decided)), null)
  assert.equal(lowestNote(lowestAgainstNext({ corpus: { mae: { sum: 20 } } })), "plus basse erreur")
  assert.equal(lowestNote(lowestAgainstNext({ corpus: { mae: { sum: 20 } }, mean: { mae: { sum: 21 } } })), "plus basse erreur")
  assert.equal(lowestAgainstNext({}), null)
  assert.equal(lowestNote(null), "")
})

test("a Persist twin is compared with the reading it comes from", () => {
  assert.equal(twinOrigin("corpus_persist"), "corpus")
  assert.equal(twinOrigin("fenetre_catboost_persist"), "fenetre_catboost")
  assert.equal(twinOrigin("corpus"), null)
  assert.equal(twinOrigin("mean"), null)
  const twins = {
    corpus: { mae: { sum: 22 } },
    corpus_persist: { mae: { sum: 19 } },
    mean: { mae: { sum: 24 } },
  }
  assert.equal(lowestAgainstNext(twins)?.next, "mean")
})
