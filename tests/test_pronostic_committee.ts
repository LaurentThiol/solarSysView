import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

import { bandFromMoments, MARGIN_STEPS } from "../src/lib/pronostic/historic.ts"
import {
  AUTO_MIN_HITS,
  chooseAutoMargin,
  committeeLookback,
  confrontationSentence,
  parseCommitteePayload,
  playedMargins,
  proposalFromAxes,
  scoreCommittee,
  type AutoRow,
  type CommitteeAxis,
  type CommitteePayload,
  type MarginCell,
} from "../src/lib/pronostic/committee.ts"
import { DEFAULT_HISTORIC_LAYERS } from "../src/lib/pronostic/historic.ts"

function cells(hits: Array<[number, number]>): MarginCell[] {
  return MARGIN_STEPS.map((margin) => {
    const found = hits.find(([step]) => step === margin)
    return { margin, hit: Boolean(found), grids: found ? found[1] : 100 }
  })
}

function row(hits: Array<[number, number]>): AutoRow {
  return { cells: cells(hits) }
}

test("played margin ignores the draw being scored", () => {
  const priors = [
    row([[2, 100]]),
    row([[2, 100]]),
    row([
      [1, 10],
      [2, 100],
    ]),
    row([
      [1, 10],
      [2, 100],
    ]),
  ]
  const current = row([
    [1, 1],
    [2, 1],
  ])
  const rows = [...priors, current]
  assert.equal(chooseAutoMargin(priors).margin, 2)
  assert.equal(chooseAutoMargin(rows).margin, 1)
  assert.equal(playedMargins(rows).at(-1), 2)
  assert.equal(AUTO_MIN_HITS, 3)
})

test("fewer than three hits stays at 1 sigma", () => {
  const choice = chooseAutoMargin([row([[3, 1]]), row([[3, 1]])])
  assert.equal(choice.margin, 1)
  assert.equal(choice.fallback, true)
})

test("committee bands match the integer mean plus or minus k sigma", () => {
  const axes = axesOf([1, 2, 3, 4, 5], [1, 2])
  const band = proposalFromAxes(axes, "numbers", 0, "committee")
  const sum = bandFromMoments(15, 0, 0, { lo: 15, hi: 240 })
  assert.deepEqual({ lo: band.minSum, hi: band.maxSum }, sum)
  assert.equal(band.slots[1].lo, 2)
  assert.equal(band.slots[1].hi, 2)
})

test("a point forecast counts one grid and does not need three hits", () => {
  const axes = axesOf([1, 2, 3, 4, 5], [1, 2])
  const payload: CommitteePayload = {
    ok: true,
    lookback: 20,
    scopes: {
      mixte: {
        available: 21,
        rows: [{ date: "2026-02-01", fellBackAll: false, numbers: [1, 2, 3, 4, 5], stars: [1, 2], axes }],
        next: { fellBackAll: true, axes },
      },
      mardi: { available: 0, rows: [], next: null },
      vendredi: { available: 0, rows: [], next: null },
    },
  }
  const scored = scoreCommittee(payload, DEFAULT_HISTORIC_LAYERS)
  assert.equal(scored.scopes.mixte.rows[0].cells[0].hit, true)
  assert.equal(scored.scopes.mixte.rows[0].cells[0].grids, 1)
  assert.equal(scored.scopes.mixte.postHoc.fallback, true)
  assert.equal(scored.scopes.mardi.rows.length, 0)
  const sentence = confrontationSentence(scored, 1)
  assert.match(sentence, /Pas assez de tirages du mardi/)
  assert.match(sentence, /mercredi/)
  assert.match(sentence, /Mardi \+ vendredi mélange/)
})

test("committee lookback collapses auto and 100 onto 20", () => {
  assert.equal(committeeLookback(20), 20)
  assert.equal(committeeLookback(50), 50)
  assert.equal(committeeLookback(100), 20)
  assert.equal(committeeLookback("auto"), 20)
})

test("parser rejects a payload that is not the committee", () => {
  assert.equal(parseCommitteePayload({ ok: false }), null)
  assert.equal(parseCommitteePayload({ ok: true, lookback: 100, scopes: {} }), null)
})

test("historic tab names both automatic rates and the absent python banner", () => {
  const panel = readFileSync(new URL("../src/components/pronostic/historic-panel.tsx", import.meta.url), "utf8")
  const committee = readFileSync(
    new URL("../src/components/pronostic/historic-committee.tsx", import.meta.url),
    "utf8"
  )
  const logic = readFileSync(new URL("../src/lib/pronostic/committee.ts", import.meta.url), "utf8")
  assert.match(panel, /Automatique/)
  assert.match(panel, /Préparer le prochain tirage/)
  assert.match(committee, /Préparer le comité/)
  assert.match(committee, /Choisie après ces tirages/)
  assert.match(committee, /Partie jouée/)
  assert.match(committee, /PYTHON_ABSENT/)
  assert.match(committee, /COMMITTEE_MEAN_BANNER/)
  assert.match(committee, /mixWindowSentence/)
  assert.match(logic, /Python est absent/)
  assert.match(logic, /Le comité reprend la moyenne/)
  assert.match(logic, /mélange les mardis et les vendredis/)
  assert.match(logic, /Mardi \+ vendredi/)
  assert.doesNotMatch(committee, /mercredi seul/)
})

function axesOf(numbers: number[], stars: number[]): CommitteeAxis[] {
  const sum = numbers.reduce((total, value) => total + value, 0)
  const even = numbers.filter((value) => value % 2 === 0).length
  const starSum = stars.reduce((total, value) => total + value, 0)
  const starEven = stars.filter((value) => value % 2 === 0).length
  const values: Array<[CommitteeAxis["id"], number]> = [
    ["sum", sum],
    ["parity", even],
    ["n1", numbers[0]],
    ["n2", numbers[1]],
    ["n3", numbers[2]],
    ["n4", numbers[3]],
    ["n5", numbers[4]],
    ["starSum", starSum],
    ["starParity", starEven],
    ["e1", stars[0]],
    ["e2", stars[1]],
  ]
  return values.map(([id, actual]) => ({
    id,
    mu: actual,
    sigma: 0,
    baselineMu: actual,
    baselineSigma: 0,
    fellBack: false,
    actual,
  }))
}
