import assert from "node:assert/strict"
import test from "node:test"

import type { RankPoint } from "../src/lib/run-arcade/curves.ts"
import { measuredRelations, strongestRelation } from "../src/lib/run-arcade/relation.ts"

function point(date: string, n1: number, n2: number, n5 = 8): RankPoint {
  return { date, n1, n2, n3: 4, n4: 6, n5, e1: 1, e2: 2 }
}

function day(year: number, month: number, index: number) {
  return new Date(Date.UTC(year, month - 1, 1 + index)).toISOString().slice(0, 10)
}

test("n2 one draw behind n1 is the relation that is kept", () => {
  const n1 = [1, 3, 2, 5, 3, 8, 4, 9]
  const n2 = [2, 1, 3, 2, 5, 3, 8, 4]
  const past = n1.map((value, index) => point(day(2026, 3, index), value, n2[index]))
  const relations = measuredRelations(past)
  assert.equal(
    relations.some((item) => item.phrase === "Σn et n1, même sens, même pas"),
    false
  )
  assert.equal(strongestRelation(past)?.phrase, "n1 et n2, même sens, n2 en retard d’un pas")
})

test("tuesday and friday four days apart name the evening gap", () => {
  const past = [
    point("2026-05-08", 1, 2, 40),
    point("2026-05-12", 1, 2, 40),
    point("2026-05-15", 1, 2, 42),
    point("2026-05-19", 1, 2, 42),
    point("2026-05-22", 1, 2, 44),
    point("2026-05-26", 1, 2, 44),
    point("2026-05-29", 1, 2, 46),
    point("2026-06-02", 1, 2, 46),
  ]
  const evenings = measuredRelations(past).filter((item) => item.phrase.includes("mardi et vendredi"))
  assert.ok(evenings.some((item) => item.phrase === "n5, mardi et vendredi, écart de 4 jours"))
})

test("a copy shifted by eleven days is kept from one year to the next", () => {
  const pattern = [10, 40, 12, 35, 8, 30, 14, 28]
  const newer = Array.from({ length: 30 }, () => 15)
  const older = Array.from({ length: 30 }, () => 15)
  for (let index = 0; index < pattern.length; index += 1) {
    newer[12 + index] = pattern[index]
    older[1 + index] = pattern[index]
  }
  const past = [
    ...older.map((value, index) => point(day(2025, 4, index), value, 3)),
    ...newer.map((value, index) => point(day(2026, 4, index), value, 3)),
  ]
  const years = measuredRelations(past).filter((item) => item.phrase.includes("d’une année sur l’autre"))
  assert.ok(years.some((item) => item.phrase.includes("décalage de 11 jours")))
})

test("a flat series has no relation", () => {
  const past = [0, 1, 2, 3].map((index) => point(day(2026, 1, index), 4, 7))
  assert.equal(strongestRelation(past), null)
})
