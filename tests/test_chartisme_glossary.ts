import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

import { FIGURE_IDS } from "../src/lib/chartisme/catalog.ts"
import { curveSparkSeries } from "../src/lib/chartisme/curve-shapes.ts"
import { BALL_VARIABLES, PLAIN_VARIABLES, STAR_VARIABLES } from "../src/lib/chartisme/curves.ts"
import {
  chartismeGlossary,
  filterChartismeGlossary,
  groupedChartismeGlossary,
} from "../src/lib/chartisme/glossary.ts"
import { templateFigures } from "../src/lib/chartisme/sketch-shapes.ts"

const page = readFileSync(new URL("../src/app/chartisme/page.tsx", import.meta.url), "utf8")

test("chartisme glossary covers every curve kind and every catalog figure", () => {
  const entries = chartismeGlossary()
  const curves = entries.filter((entry) => entry.side === "courbes")
  const figures = entries.filter((entry) => entry.side === "figures")
  const curveIds = [...PLAIN_VARIABLES, ...BALL_VARIABLES, ...STAR_VARIABLES]
  assert.deepEqual(
    curves.map((entry) => entry.id),
    [...curveIds]
  )
  assert.deepEqual(
    figures.map((entry) => entry.id),
    FIGURE_IDS.filter((id) => id !== "none")
  )
  assert.equal(figures.length, 18)
  for (const entry of curves) {
    assert.ok(curveSparkSeries(entry.id).length > 0, entry.id)
    assert.ok(entry.text.length > 40, entry.id)
    assert.equal(entry.signal, undefined)
  }
  for (const entry of figures) {
    assert.ok(templateFigures().includes(entry.id), entry.id)
    assert.ok(entry.text.length > 40, entry.id)
    assert.ok(entry.signal && entry.signal !== "—", entry.id)
    assert.ok(entry.target && entry.target !== "—", entry.id)
  }
  const groups = groupedChartismeGlossary(entries)
  assert.deepEqual(
    groups.map((group) => group.id),
    ["libres", "rangs", "ecarts", "etoiles", "presences", "reversal_down", "reversal_up", "continuation", "range"]
  )
})

test("chartisme glossary search ignores accents and can stay on one side", () => {
  assert.ok(filterChartismeGlossary("tete").some((entry) => entry.id === "ete"))
  assert.ok(filterChartismeGlossary("epaules").some((entry) => entry.id === "ete"))
  assert.ok(filterChartismeGlossary("n1").some((entry) => entry.id === "n1"))
  assert.ok(filterChartismeGlossary("retard").some((entry) => entry.id === "delay"))
  assert.equal(filterChartismeGlossary("zzzz-inconnu").length, 0)
  const figures = filterChartismeGlossary("", "figures")
  assert.equal(figures.length, 18)
  assert.ok(figures.every((entry) => entry.side === "figures"))
  assert.ok(filterChartismeGlossary("canal", "courbes").every((entry) => entry.side === "courbes"))
})

test("chartisme page opens the glossary drawings", () => {
  assert.match(page, /href="\?glossaire=chartisme"/)
  assert.match(page, /Courbes et figures, avec leur dessin/)
})
