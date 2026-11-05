import assert from "node:assert/strict"
import test from "node:test"

import { RUN_ARCADE_HELP } from "../src/lib/run-arcade/help.ts"
import { addVersion, newSkill, type SkillParams } from "../src/lib/run-arcade/skills.ts"
import { blendedTip, curveStrokes } from "../src/lib/run-arcade/strokes.ts"
import { type RankPoint, type RunnerMind } from "../src/lib/run-arcade/thought.ts"

function dateAt(index: number) {
  const date = new Date(Date.UTC(2025, 0, 3 + index * 3, 12))
  return date.toISOString().slice(0, 10)
}

function point(index: number): RankPoint {
  return {
    date: dateAt(index),
    n1: 2 + (index % 5),
    n2: 10 + (index % 4),
    n3: 20 + (index % 6),
    n4: 30 + (index % 5),
    n5: 40 + (index % 7),
    e1: 1 + (index % 5),
    e2: 7 + (index % 5),
  }
}

const glide: SkillParams = { curve: "*", gesture: "glisse", ratio: 0.618, span: "bande", window: 8, days: null }

test("the weighted mean leans toward the heavier tip, and a zero weight does not pull", () => {
  const mean = blendedTip([
    { tip: 20, weight: 0, cutoff: "2024-01-01", version: 1, order: 0 },
    { tip: 30, weight: 10, cutoff: "2024-02-01", version: 1, order: 1 },
    { tip: 50, weight: 20, cutoff: "2024-03-01", version: 1, order: 2 },
  ])
  assert.ok(Math.abs(mean - (30 * 10 + 50 * 20) / 30) < 1e-9)
  const alone = blendedTip([
    { tip: 20, weight: 0, cutoff: "2024-01-01", version: 1, order: 0 },
    { tip: 30, weight: 10, cutoff: "2024-02-01", version: 1, order: 1 },
  ])
  assert.equal(alone, 30)
})

test("without a positive weight, the most recent version plays alone", () => {
  const recent = blendedTip([
    { tip: 12, weight: 0, cutoff: "2024-01-01", version: 2, order: 0 },
    { tip: 40, weight: 0, cutoff: "2024-06-01", version: 1, order: 1 },
    { tip: 7, weight: 0, cutoff: "2024-06-01", version: 3, order: 2 },
  ])
  assert.equal(recent, 7)
})

test("a living version keeps a stroke, a dead one does not, and a zero weight stays at 0", () => {
  const past = Array.from({ length: 8 }, (_, index) => point(index))
  const hidden = "2099-01-01"
  const base = newSkill("base", "Geste de base", { ...glide, curve: "n1", gesture: "persiste" }, {
    cutoff: "",
    origin: "maison",
    examCents: null,
  })
  const withYoung = addVersion(base, { ...glide, curve: "n1", gesture: "miroir" }, {
    cutoff: past[past.length - 1].date,
    origin: "ia",
    examCents: null,
  })
  const dead = newSkill("old", "Ancienne", { ...glide, curve: "n1", gesture: "glisse" }, {
    cutoff: past[1].date,
    origin: "ia",
    examCents: null,
  })
  const other = newSkill("side", "Ailleurs", { ...glide, curve: "n2", gesture: "or" }, {
    cutoff: "",
    origin: "maison",
    examCents: null,
  })
  const mind: RunnerMind = {
    id: "r1",
    name: "R1",
    focus: "n1",
    skills: [withYoung, dead, other],
  }
  const strokes = curveStrokes({
    mind,
    past,
    curve: "n1",
    hiddenDate: hidden,
    life: {
      draws: { glisse: 1 },
      measured: { glisse: true },
      dates: past.map((row) => row.date),
    },
  })
  assert.deepEqual(
    strokes.versions.map((item) => item.gesture),
    ["persiste", "miroir"]
  )
  const young = strokes.versions[1]
  assert.equal(young.weight, 0)
  assert.equal(young.label, "0")
  assert.equal(young.name, "Geste de base v2")
  assert.equal(strokes.versions[0].name, "Geste de base v1")
  const pulling = strokes.versions.filter((item) => item.weight > 0)
  if (pulling.length === 0) assert.equal(strokes.thought, young.tip)
  else {
    const mass = pulling.reduce((sum, item) => sum + item.weight, 0)
    const mean = pulling.reduce((sum, item) => sum + item.tip * item.weight, 0) / mass
    assert.ok(Math.abs(strokes.thought - mean) < 1e-9)
  }
  const again = curveStrokes({
    mind,
    past,
    curve: "n1",
    hiddenDate: hidden,
    life: { draws: { glisse: 1 }, measured: { glisse: true }, dates: past.map((row) => row.date) },
  })
  assert.equal(again.thought, strokes.thought)
})

test("the help says one stroke per living version, a strong thought, and dashes that do not weigh", () => {
  const item = RUN_ARCADE_HELP.dessin.items?.find((entry) => entry.label === "Versions")
  const text = `${RUN_ARCADE_HELP.dessin.body} ${item?.text ?? ""}`
  assert.match(text, /version encore en vie/)
  assert.match(text, /trait fort est la pensée/)
  assert.match(text, /pointillés/)
  assert.match(text, /ne pèse pas/)
  assert.match(text, /pointe et le poids/)
})
