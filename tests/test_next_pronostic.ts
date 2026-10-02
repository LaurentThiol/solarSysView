import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

import { ADDRESSES } from "../src/lib/addresses.ts"
import { DECADE_LABELS } from "../src/lib/grid-shape.ts"
import { PRONOSTIC_NEXT_HELP } from "../src/lib/next/pronostic-help.ts"
import {
  NUMBER_UNIVERSE,
  TRIPLE_COUNT,
  buildReverseModel,
  canonicalizeFilters,
  describeFilters,
  emptyFilters,
  formatChance,
  scoreGrid,
  slotBounds,
  solvePronostic,
  tripleIndex,
  type PronosticFilters,
} from "../src/lib/next/pronostic.ts"

function filters(partial: Partial<PronosticFilters> = {}): PronosticFilters {
  return { ...emptyFilters(), ...partial }
}

test("triple index covers each 3-subset once", () => {
  assert.equal(tripleIndex(1, 2, 3), 0)
  assert.equal(tripleIndex(48, 49, 50), TRIPLE_COUNT - 1)
  const seen = new Set<number>()
  for (let a = 1; a <= 50; a += 1) {
    for (let b = a + 1; b <= 50; b += 1) {
      for (let c = b + 1; c <= 50; c += 1) seen.add(tripleIndex(a, b, c))
    }
  }
  assert.equal(seen.size, TRIPLE_COUNT)
  assert.equal(Math.min(...seen), 0)
  assert.equal(Math.max(...seen), TRIPLE_COUNT - 1)
})

test("a full-span slider is OFF and a tightened one is named", () => {
  assert.deepEqual(describeFilters(emptyFilters()), [])
  assert.deepEqual(
    describeFilters({
      ...emptyFilters(),
      sum: { min: 15, max: 240 },
      even: { min: 0, max: 5 },
      decades: DECADE_LABELS.map(() => ({ min: 0, max: 5 })),
      slots: [0, 1, 2, 3, 4].map((index) => slotBounds(index)),
    }),
    []
  )
  assert.deepEqual(canonicalizeFilters(filters({ sum: { min: 120, max: 100 } })).sum, {
    min: 100,
    max: 120,
  })
  assert.deepEqual(describeFilters(filters({ sum: { min: 100, max: 140 } })), ["Total 100–140"])
  assert.deepEqual(describeFilters(filters({ even: { min: 3, max: 3 } })), ["3 pairs · 2 impairs"])
  assert.deepEqual(describeFilters(filters({ even: { min: 2, max: 4 } })), ["2–4 pairs · 1–3 impairs"])
  const decades = [null, { min: 1, max: 2 }, null, null, null]
  assert.deepEqual(describeFilters(filters({ decades })), ["11–20 : 1–2"])
  assert.deepEqual(describeFilters(filters({ slots: [{ min: 5, max: 8 }, null, null, null, null] })), [
    "n1 5–8",
  ])
})

test("unrestricted field counts the 5/50 universe and keeps equal chances", () => {
  const model = buildReverseModel([])
  assert.equal(model.uniform, true)
  assert.equal(model.horizons.filter((item) => item.blended).length, 0)
  const result = solvePronostic(emptyFilters(), model)
  assert.equal(result.count, NUMBER_UNIVERSE)
  assert.equal(result.listed[0]?.numbers.join("-"), "1-2-3-4-5")
  assert.equal(result.listed.length, 30)
  assert.ok(Math.abs((result.listed[0]?.chance ?? 0) * NUMBER_UNIVERSE - 1) < 1e-6)
  assert.ok(Math.abs((result.listed[0]?.lift ?? 0) - 1) < 1e-9)
  assert.ok(Math.abs(result.marginal.reduce((sum, value) => sum + value, 0) - 5) < 1e-6)
  assert.ok(Math.abs((result.marginal[1] ?? 0) - 0.1) < 1e-6)
})

test("pair, decade and rank sliders cut the universe", () => {
  const model = buildReverseModel([])
  assert.equal(solvePronostic(filters({ sum: { min: 15, max: 15 } }), model).count, 1)
  assert.equal(solvePronostic(filters({ sum: { min: 17, max: 17 } }), model).count, 2)
  assert.equal(solvePronostic(filters({ sum: { min: 240, max: 240 } }), model).count, 1)
  assert.equal(solvePronostic(filters({ even: { min: 5, max: 5 } }), model).count, 53130)
  assert.equal(solvePronostic(filters({ even: { min: 0, max: 0 } }), model).count, 53130)
  assert.equal(
    solvePronostic(filters({ decades: [{ min: 5, max: 5 }, null, null, null, null] }), model).count,
    252
  )
  const exact = solvePronostic(
    filters({
      slots: [
        { min: 1, max: 1 },
        { min: 2, max: 2 },
        { min: 3, max: 3 },
        { min: 4, max: 4 },
        { min: 5, max: 5 },
      ],
    }),
    model
  )
  assert.equal(exact.count, 1)
  assert.equal(exact.listed[0]?.numbers.join("-"), "1-2-3-4-5")
  assert.equal(
    solvePronostic(
      filters({
        slots: [{ min: 40, max: 46 }, null, null, null, { min: 5, max: 20 }],
      }),
      model
    ).count,
    0
  )
})

test("reverse weights raise the newest grid, its couples and its triples", () => {
  const model = buildReverseModel([
    { date: "2026-01-01", numbers: [6, 7, 8, 9, 10] },
    { date: "2026-01-02", numbers: [1, 2, 3, 4, 5] },
  ])
  const horizon = model.horizons[0]
  assert.equal(horizon?.drawCount, 2)
  assert.equal(horizon?.blended, true)
  assert.equal(horizon?.newest, "2026-01-02")
  assert.equal(horizon?.oldest, "2026-01-01")
  assert.ok(Math.abs((horizon?.meanSum ?? 0) - (2 * 15 + 40) / 3) < 1e-9)
  assert.equal(model.horizons.filter((item) => item.blended).length, 1)
  assert.equal(model.horizons[1]?.blended, false)
  assert.equal(model.horizons[1]?.drawCount, 2)

  const hot = scoreGrid(model, [1, 2, 3, 4, 5])
  const cold = scoreGrid(model, [6, 7, 8, 9, 10])
  assert.ok(hot && cold)
  assert.ok(hot.score > cold.score)
  assert.ok(hot.ball > cold.ball)
  assert.ok(hot.couple > cold.couple)
  assert.ok(hot.triple > cold.triple)
  assert.ok(model.pairLog[1 * 51 + 2] > model.pairLog[6 * 51 + 7])
  assert.ok(model.tripleLog[tripleIndex(1, 2, 3)] > model.tripleLog[tripleIndex(6, 7, 8)])
  assert.ok(Number.isFinite(scoreGrid(model, [46, 47, 48, 49, 50])?.score))
  assert.equal(scoreGrid(model, [1, 2, 3, 4]), null)
})

test("chances sum to one and follow the most recent grid", () => {
  const model = buildReverseModel([
    { date: "2026-01-01", numbers: [10, 20, 30, 40, 50] },
    { date: "2026-02-01", numbers: [1, 2, 3, 5, 6] },
  ])
  const result = solvePronostic(filters({ sum: { min: 17, max: 17 } }), model, 10)
  assert.equal(result.count, 2)
  assert.deepEqual(
    result.listed.map((item) => item.numbers.join("-")),
    ["1-2-3-5-6", "1-2-3-4-7"]
  )
  const mass = result.listed.reduce((sum, item) => sum + item.chance, 0)
  assert.ok(Math.abs(mass - 1) < 1e-9)
  assert.ok((result.listed[0]?.chance ?? 0) > (result.listed[1]?.chance ?? 0))
  assert.ok(Math.abs(result.marginal.reduce((sum, value) => sum + value, 0) - 5) < 1e-6)
  assert.ok((result.marginal[1] ?? 0) > 0.99)
  const top = solvePronostic(filters({ sum: { min: 17, max: 17 } }), model, 1)
  assert.equal(top.listed.length, 1)
  assert.equal(top.listed[0]?.numbers.join("-"), "1-2-3-5-6")
  assert.ok(top.chanceMassListed < 1)
})

test("identical short horizons are blended once", () => {
  const draws = Array.from({ length: 25 }, (_, index) => ({
    date: `2026-01-${String(index + 1).padStart(2, "0")}`,
    numbers: [1, 2, 3, 4, 5 + (index % 3)] as number[],
  }))
  const model = buildReverseModel(draws)
  const blended = model.horizons.filter((item) => item.blended).map((item) => item.horizon)
  assert.deepEqual(blended, [20, 50])
  assert.equal(model.horizons.find((item) => item.horizon === 100)?.drawCount, 25)
  assert.equal(model.horizons.find((item) => item.horizon === 100)?.blended, false)
  assert.equal(model.horizons.find((item) => item.horizon === 200)?.blended, false)
  assert.equal(model.uniform, false)
})

test("small chances read as one in N", () => {
  assert.equal(formatChance(0), "0 %")
  assert.match(formatChance(0.125), /12[,.]50\s?%/)
  assert.equal(formatChance(1 / NUMBER_UNIVERSE), `1 sur ${NUMBER_UNIVERSE.toLocaleString("fr-FR")}`)
})

test("pronosticNext is a Next submenu with its own help", () => {
  const lab = readFileSync(new URL("../src/components/next/next-lab.tsx", import.meta.url), "utf8")
  const panel = readFileSync(new URL("../src/components/next/pronostic-next.tsx", import.meta.url), "utf8")
  const page = readFileSync(new URL("../src/app/next/page.tsx", import.meta.url), "utf8")
  assert.match(lab, /id: "pronosticNext"/)
  assert.match(lab, /label: "pronosticNext"/)
  assert.match(lab, /tab="pronosticNext"/)
  assert.match(panel, /data-pronostic-next/)
  assert.match(panel, /data-field="sum"/)
  assert.match(panel, /data-field="even"/)
  assert.match(panel, /data-field="decades"/)
  assert.match(panel, /data-field="slots"/)
  assert.match(panel, /OFF/)
  assert.match(panel, /20, 50, 100 et 200/)
  for (const key of Object.keys(PRONOSTIC_NEXT_HELP)) {
    assert.match(lab + panel, new RegExp(`PRONOSTIC_NEXT_HELP\\.${key}\\b`), key)
    const help = PRONOSTIC_NEXT_HELP[key as keyof typeof PRONOSTIC_NEXT_HELP]
    assert.ok(help.body.trim().length > 40, key)
  }
  assert.match(page, /pronosticNext/)
  const tab = ADDRESSES.find((entry) => entry.href === "/next?tab=pronosticNext")
  assert.equal(tab?.kind, "onglet")
  assert.equal(tab?.label, "Next · pronosticNext")
  assert.match(tab?.text ?? "", /OFF/)
  assert.match(tab?.text ?? "", /triples/)
})
