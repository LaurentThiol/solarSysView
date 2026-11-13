import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

import { reconcile } from "../src/lib/run-arcade/coherence.ts"
import { CURVE_KEYS, curveValues, DECADE_KEYS, RANK_KEYS, type RankPoint } from "../src/lib/run-arcade/curves.ts"
import { chanceBalance } from "../src/lib/run-arcade/examen.ts"
import { RUN_ARCADE_HELP } from "../src/lib/run-arcade/help.ts"
import { createSession, type SessionDeps } from "../src/lib/run-arcade/session.ts"
import { newSkill, type SkillParams } from "../src/lib/run-arcade/skills.ts"
import {
  blendTips,
  countHits,
  gapSinceBirth,
  revealedPast,
  settlePurse,
  START_CENTS,
  think,
  TICKET_CENTS,
  tipFor,
  type RunnerMind,
} from "../src/lib/run-arcade/thought.ts"

function dateAt(index: number) {
  return new Date(Date.UTC(2025, 0, 3 + index * 3, 12)).toISOString().slice(0, 10)
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

function series(length: number) {
  return Array.from({ length }, (_, index) => point(index))
}

const glide: SkillParams = { curve: "n1", gesture: "glisse", ratio: 0.618, span: "bande", window: 8, days: null }
const stay: SkillParams = { curve: "n1", gesture: "persiste", ratio: 0.618, span: "bande", window: 8, days: null }

test("blendTips ignores a zero or negative gap and leans toward the heavier tip", () => {
  const mean = blendTips([
    { tip: 30, weight: 10, cutoff: "2024-02-01", version: 1, order: 0 },
    { tip: 50, weight: 20, cutoff: "2024-03-01", version: 1, order: 1 },
  ])
  const expected = (30 * 10 + 50 * 20) / 30
  assert.ok(Math.abs(mean - expected) < 1e-9)
  assert.ok(mean > (30 + 50) / 2)
  assert.ok(mean < 50)

  const withZero = blendTips([
    { tip: 20, weight: 0, cutoff: "2024-01-01", version: 1, order: 0 },
    { tip: 30, weight: 10, cutoff: "2024-02-01", version: 1, order: 1 },
    { tip: 50, weight: 20, cutoff: "2024-03-01", version: 1, order: 2 },
  ])
  assert.ok(Math.abs(withZero - expected) < 1e-9)

  const withNegative = blendTips([
    { tip: 8, weight: -40, cutoff: "2024-01-01", version: 1, order: 0 },
    { tip: 30, weight: 10, cutoff: "2024-02-01", version: 1, order: 1 },
    { tip: 50, weight: 20, cutoff: "2024-03-01", version: 1, order: 2 },
  ])
  assert.ok(Math.abs(withNegative - expected) < 1e-9)
})

test("without a positive weight, blendTips keeps the most recent tip", () => {
  const recent = blendTips([
    { tip: 12, weight: 0, cutoff: "2024-01-01", version: 2, order: 0 },
    { tip: 40, weight: 0, cutoff: "2024-06-01", version: 1, order: 1 },
    { tip: 7, weight: -3, cutoff: "2024-06-01", version: 3, order: 2 },
  ])
  assert.equal(recent, 7)
})

test("the weight is the purse minus chance on the draws since birth", () => {
  const past = series(10)
  const skill = newSkill("seul", "Seul", stay, { cutoff: past[1].date, origin: "ia", examCents: null })
  const version = skill.versions[0]
  const gap = gapSinceBirth(version, past)
  const mind: RunnerMind = { id: "r1", name: "R1", focus: "n1", skills: [skill] }
  let cents = START_CENTS
  let turns = 0
  for (let index = 0; index < past.length; index += 1) {
    const hidden = past[index]
    if (version.cutoff && hidden.date <= version.cutoff) continue
    if (cents < TICKET_CENTS) break
    const seen = past.slice(0, index)
    if (seen.length < 2) continue
    const thought = think(mind, seen, { hiddenDate: hidden.date, plain: true })
    cents = settlePurse(cents, countHits(thought.guess, hidden))
    turns += 1
  }
  const expected = turns > 0 ? Math.round(cents - chanceBalance(turns).cents) : 0
  assert.equal(gap, expected)
  assert.equal(gapSinceBirth(version, past), gap)
})

function later(a: { cutoff: string; version: number; order: number }, b: { cutoff: string; version: number; order: number }) {
  if (a.cutoff !== b.cutoff) return a.cutoff > b.cutoff
  if (a.version !== b.version) return a.version > b.version
  return a.order > b.order
}

test("a blended rank takes one form, the sums run once, and plain stays single", () => {
  const past = series(18)
  const hidden = "2099-01-01"
  const early = newSkill("early", "Tôt", stay, { cutoff: past[2].date, origin: "ia", examCents: null })
  const late = newSkill("late", "Tard", glide, { cutoff: past[5].date, origin: "ia", examCents: null })
  const mind: RunnerMind = { id: "r1", name: "R1", focus: "n1", skills: [early, late] }
  const off = think(mind, past, { hiddenDate: hidden })
  const on = think(mind, past, { hiddenDate: hidden, blend: true })
  const rows = past.map(curveValues)
  const ranked = [early, late].map((skill, order) => {
    const version = skill.versions[0]
    const gap = gapSinceBirth(version, past)
    return {
      tip: tipFor(version, past, rows, "n1", hidden),
      weight: gap > 0 ? gap : 0,
      cutoff: version.cutoff,
      version: version.version,
      order,
    }
  })
  const positive = ranked.filter((row) => row.weight > 0 && Number.isFinite(row.tip))
  const shape = positive.length
    ? positive.reduce((best, row) => (row.weight > best.weight || (row.weight === best.weight && later(row, best)) ? row : best))
    : ranked.reduce((best, row) => (later(row, best) ? row : best))
  assert.ok(Math.abs(on.tips.n1 - shape.tip) < 1e-9)
  assert.equal(on.draw.thoughtValue, on.tips.n1)
  assert.equal(on.draw.vector.y2, on.tips.n1)
  assert.equal(on.draw.projection.y, on.cases.n1)
  if (positive.length >= 2 && positive[0].tip !== positive[1].tip) {
    const mean = blendTips(ranked)
    assert.ok(Math.abs(on.tips.n1 - mean) > 1e-6)
  }
  assert.deepEqual(on.cases, reconcile(on.tips).cases)
  assert.equal(on.guess.n1 + on.guess.n2 + on.guess.n3 + on.guess.n4 + on.guess.n5, on.cases.sumNumbers)
  assert.deepEqual(
    think(mind, past, { hiddenDate: hidden, plain: true, blend: true }).tips,
    think(mind, past, { hiddenDate: hidden, plain: true }).tips
  )
  assert.equal(off.draw.masks.some((mask) => mask.drives), true)
})

test("blend averages the two sums and keeps the heavier form, then projects", () => {
  const grid = { n1: 5, n2: 15, n3: 25, n4: 35, n5: 45, e1: 3, e2: 8 }
  const past = Array.from({ length: 16 }, (_, index) => ({ date: dateAt(index), ...grid }))
  past[15] = { date: dateAt(15), n1: 6, n2: 16, n3: 26, n4: 36, n5: 47, e1: 4, e2: 10 }
  const hidden = "2099-01-01"
  const early = newSkill("early", "Tôt", { ...stay, curve: "*" }, { cutoff: past[1].date, origin: "ia", examCents: null })
  const late = newSkill("late", "Tard", { ...glide, curve: "*" }, { cutoff: past[12].date, origin: "ia", examCents: null })
  const mind: RunnerMind = { id: "r1", name: "R1", focus: "n1", skills: [early, late] }
  const on = think(mind, past, { hiddenDate: hidden, blend: true })
  const rows = past.map(curveValues)
  const versions = [early, late].map((skill, order) => {
    const version = skill.versions[0]
    const gap = gapSinceBirth(version, past)
    return { version, weight: gap > 0 ? gap : 0, cutoff: version.cutoff, versionNumber: version.version, order }
  })
  assert.ok(versions[0].weight > 0)
  assert.ok(versions[1].weight > 0)
  assert.notEqual(versions[0].weight, versions[1].weight)
  const heavier = versions.reduce((best, row) => (row.weight > best.weight ? row : best))
  for (const key of ["sumNumbers", "sumStars"] as const) {
    const mean = blendTips(
      versions.map((row) => ({
        tip: tipFor(row.version, past, rows, key, hidden),
        weight: row.weight,
        cutoff: row.cutoff,
        version: row.versionNumber,
        order: row.order,
      }))
    )
    assert.ok(Math.abs(on.tips[key] - mean) < 1e-9, key)
    assert.ok(Math.abs(mean - tipFor(heavier.version, past, rows, key, hidden)) > 1e-6, key)
  }
  for (const key of [...RANK_KEYS, ...DECADE_KEYS]) {
    const shaped = tipFor(heavier.version, past, rows, key, hidden)
    assert.ok(Math.abs(on.tips[key] - shaped) < 1e-9, key)
  }
  for (const key of RANK_KEYS) {
    const mean = blendTips(
      versions.map((row) => ({
        tip: tipFor(row.version, past, rows, key, hidden),
        weight: row.weight,
        cutoff: row.cutoff,
        version: row.versionNumber,
        order: row.order,
      }))
    )
    assert.ok(Math.abs(on.tips[key] - mean) > 1e-6, key)
  }
  assert.deepEqual(on.cases, reconcile(on.tips).cases)
  assert.equal(on.guess.n1 + on.guess.n2 + on.guess.n3 + on.guess.n4 + on.guess.n5, on.cases.sumNumbers)
  assert.equal(on.guess.e1 + on.guess.e2, on.cases.sumStars)
  assert.ok(on.guess.n1 < on.guess.n2 && on.guess.n2 < on.guess.n3 && on.guess.n3 < on.guess.n4 && on.guess.n4 < on.guess.n5)
  assert.ok([on.guess.n1, on.guess.n2, on.guess.n3, on.guess.n4, on.guess.n5].every((value) => value >= 1 && value <= 50))
  assert.ok(on.guess.e1 >= 1 && on.guess.e2 <= 12 && on.guess.e1 < on.guess.e2)
  assert.equal(on.draw.vector.y2, on.tips.n1)
  assert.equal(on.draw.thoughtValue, on.tips.n1)
  assert.equal(on.draw.projection.y, on.cases.n1)
  const sums = think(mind, past, { hiddenDate: hidden, blend: true, focus: "sumNumbers" })
  assert.deepEqual(sums.guess, on.guess)
  assert.equal(sums.draw.vector.y2, sums.tips.sumNumbers)
  assert.equal(sums.draw.projection.y, sums.cases.sumNumbers)
  assert.equal(sums.draw.thoughtValue, sums.tips.sumNumbers)
})

test("without a positive weight, the latest version sets the sums and the form", () => {
  const past = series(8)
  const hidden = "2099-01-01"
  const older = newSkill("old", "Ancienne", { ...stay, curve: "*" }, {
    cutoff: "2025-06-01",
    origin: "ia",
    examCents: null,
  })
  const newer = newSkill("new", "Récente", { ...glide, curve: "*" }, {
    cutoff: "2025-08-01",
    origin: "ia",
    examCents: null,
  })
  const mind: RunnerMind = { id: "r1", name: "R1", focus: "n3", skills: [older, newer] }
  assert.equal(gapSinceBirth(older.versions[0], past), 0)
  assert.equal(gapSinceBirth(newer.versions[0], past), 0)
  const on = think(mind, past, { hiddenDate: hidden, blend: true })
  const rows = past.map(curveValues)
  const version = newer.versions[0]
  for (const key of CURVE_KEYS) {
    assert.ok(Math.abs(on.tips[key] - tipFor(version, past, rows, key, hidden)) < 1e-9, key)
  }
  const alone = think({ ...mind, skills: [newer] }, past, { hiddenDate: hidden, plain: true })
  assert.deepEqual(on.guess, alone.guess)
  assert.deepEqual(on.cases, reconcile(on.tips).cases)
})

test("persiste on the last draw plays that same grid", () => {
  const last = { date: dateAt(5), n1: 5, n2: 15, n3: 25, n4: 35, n5: 45, e1: 3, e2: 8 }
  const past = [point(0), point(1), point(2), point(3), last]
  const params: SkillParams = { curve: "*", gesture: "persiste", ratio: 0.618, span: "bande", window: 8, days: null }
  const mind: RunnerMind = {
    id: "r1",
    name: "R1",
    focus: "n1",
    skills: [newSkill("p", "Persiste", params, { cutoff: "", origin: "maison", examCents: null })],
  }
  const thought = think(mind, past)
  assert.deepEqual(
    [thought.guess.n1, thought.guess.n2, thought.guess.n3, thought.guess.n4, thought.guess.n5],
    [last.n1, last.n2, last.n3, last.n4, last.n5]
  )
  assert.deepEqual([thought.guess.e1, thought.guess.e2], [last.e1, last.e2])
  assert.equal(thought.tips.n1, last.n1)
  assert.equal(thought.draw.vector.y2, thought.tips.n1)
  assert.equal(thought.cases.sumNumbers, last.n1 + last.n2 + last.n3 + last.n4 + last.n5)
  assert.equal(thought.cases.sumStars, last.e1 + last.e2)
})

test("launch stores the blend choice and the button starts off, frozen like Rayons X", () => {
  const deps: SessionDeps = {
    now: () => 0,
    setTimer: () => 1,
    clearTimer: () => undefined,
    askIa: async () => ({ ok: false, error: "absente", absent: true }),
    askBrave: async () => ({ ok: false, error: "absente", absent: true }),
    saveChampion: async () => ({ ok: true, source: "test" }),
  }
  const rows = series(12)
  const session = createSession(deps)
  session.launch({ count: 1, draws: 4, minutes: 10, series: rows, champion: null, blend: true })
  const race = session.getSnapshot().race
  assert.equal(race?.blend, true)
  assert.equal(session.getSnapshot().phase, "avant")
  if (race) {
    const runner = race.runners[0]
    const past = revealedPast(rows, race.cursor)
    const expected = think(runner.mind, past, { hiddenDate: rows[race.cursor].date, blend: true })
    assert.equal(runner.thought?.thoughtValue, expected.draw.thoughtValue)
  }
  session.launch({ count: 1, draws: 4, minutes: 10, series: rows, champion: null })
  assert.equal(session.getSnapshot().race?.blend, false)

  const lab = readFileSync(new URL("../src/components/brain/run-arcade-lab.tsx", import.meta.url), "utf8")
  assert.match(lab, /const \[blend, setBlend\] = useState\(false\)/)
  assert.match(lab, /data-testid="run-arcade-blend"/)
  assert.match(lab, /aria-pressed=\{blend\}/)
  assert.match(lab, /disabled=\{running\}/)
  assert.match(lab, /La phrase suit les champs/)
  assert.match(lab, /thoughtValue/)
  const help = RUN_ARCADE_HELP.melanger.body
  assert.match(help, /Éteint, une seule version pose la grille/)
  assert.match(help, /les pointes se moyennent/)
  assert.match(help, /figé pendant l’avant-course et la course/)
  assert.match(help, /La moyenne porte sur les deux sommes, la forme vient d’une version, et la projection pose la grille/)
  assert.match(RUN_ARCADE_HELP.courbes.items?.[0].text ?? "", /Elles passent en premier/)
  assert.match(RUN_ARCADE_HELP.skills.items?.find((item) => item.label === "Concours")?.text ?? "", /Mélanger/)
})
