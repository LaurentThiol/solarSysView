import assert from "node:assert/strict"
import test from "node:test"

import {
  citesLateDate,
  datesIn,
  filterResults,
  freshness,
  guardQuery,
  keepResult,
  starsLeak,
  valuesNear,
  withExclusions,
  type BraveItem,
  type HiddenDraw,
} from "../src/lib/run-arcade/brave-filter.ts"

const cutoff = "2026-08-04"
const hidden: HiddenDraw[] = [{ date: "2026-08-04", numbers: [7, 12, 23, 38, 44], stars: [3, 9] }]

function item(text: string, age = "2025-11-02T08:00:00"): BraveItem {
  return { title: "Méthode", url: "https://exemple.fr/a", description: text, page_age: age }
}

test("dates are read in French and English, with or without the day", () => {
  assert.deepEqual(datesIn("tirage du 4 août 2026, puis 2026-08-07 et 11/08/2026"), [
    "2026-08-07",
    "2026-08-11",
    "2026-08-04",
  ])
  assert.deepEqual(datesIn("draw of August 7, 2026"), ["2026-08-07"])
  assert.equal(citesLateDate("résultats d’août 2026", cutoff), true)
  assert.equal(citesLateDate("résultats de juillet 2026", cutoff), false)
  assert.equal(citesLateDate("le 3 août 2026", cutoff), false)
})

test("a page without a date, or dated from the cutoff on, is removed", () => {
  assert.equal(keepResult({ ...item("φ et suites"), page_age: undefined }, cutoff, hidden), false)
  assert.equal(keepResult(item("φ et suites", "2026-08-04T06:00:00"), cutoff, hidden), false)
  assert.equal(keepResult(item("φ et suites", "2026-08-03T23:00:00"), cutoff, hidden), true)
})

test("the five numbers of a hidden draw are found in any order", () => {
  assert.equal(valuesNear("44 - 07 - 23 - 12 - 38", [7, 12, 23, 38, 44], 80), true)
  assert.equal(keepResult(item("Combinaison : 44 07 23 12 38"), cutoff, hidden), false)
  const spread = `7 ${"x".repeat(60)} 12 ${"x".repeat(60)} 23 ${"x".repeat(60)} 38 ${"x".repeat(60)} 44`
  assert.equal(keepResult(item(spread), cutoff, hidden), true)
  assert.equal(keepResult(item("Fréquences 2025 : 7, 12, 23, 38, 41"), cutoff, hidden), true)
})

test("the two stars count next to a star word, or with three numbers of the draw", () => {
  assert.equal(starsLeak("entre 3 et 9 heures", hidden[0]), false)
  assert.equal(keepResult(item("entre 3 et 9 heures"), cutoff, hidden), true)
  assert.equal(keepResult(item("étoiles : 9 et 3"), cutoff, hidden), false)
  assert.equal(keepResult(item("Lucky stars 3 9"), cutoff, hidden), false)
  assert.equal(keepResult(item("12 38 44 + 3 9"), cutoff, hidden), false)
})

test("kept results come back cleaned, without counting what was removed", () => {
  const notes = filterResults(
    [
      item("Le <strong>nombre d’or</strong> &amp; les suites", "2025-03-01"),
      item("Combinaison : 44 07 23 12 38"),
    ],
    cutoff,
    hidden
  )
  assert.equal(notes.length, 1)
  assert.equal(notes[0].snippet, "Le nombre d’or les suites")
})

test("the query stays before the cutoff and skips results sites", () => {
  assert.equal(freshness("2025-01-01", cutoff), "2025-01-01to2026-08-03")
  assert.equal(guardQuery("résultats du 7 août 2026", cutoff).ok, false)
  assert.equal(guardQuery("euromillions 2027", cutoff).ok, false)
  assert.equal(guardQuery("euromillions 2026 fréquences", cutoff).ok, true)
  assert.equal(guardQuery("   ", cutoff).ok, false)
  const query = withExclusions("nombre d’or")
  assert.match(query, /-site:fdj\.fr/)
  assert.match(query, /-résultat/)
  assert.match(query, /-loto/)
  assert.match(query, /^nombre d’or /)
})
