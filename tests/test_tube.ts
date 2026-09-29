import assert from "node:assert/strict"
import test from "node:test"

import { labFromPath, labLabel } from "../src/lib/capture/snapshot"
import { suggestionsFor } from "../src/lib/capture/suggestions"
import { allNavItems, NAV_GROUPS } from "../src/lib/nav"
import {
  applyGains,
  buildTube,
  DEFAULT_TUBE_OPTIONS,
  intervalScore,
  lunarFraction,
  lunarPhaseLabel,
  lunarVector,
  OPENING_SIGMA,
  RANK_SIGMAS,
  rankCovariance,
  sectionDrivers,
  SUM_MEAN,
  SUM_VARIANCE,
  TUBE_RANKS,
  TUBE_SOURCES,
  tubeDomain,
  tubeFrame,
  tubeNull,
  tubeScore,
  type TubeDraw,
  type TubeGains,
  type TubeOptions,
} from "../src/lib/tube"

const ZERO: TubeGains = { etirement: 0, cisaillement: 0, compression: 0 }
const FULL: TubeGains = { etirement: 1, cisaillement: 1, compression: 1 }

function syntheticDraws(count: number, seed = 7): TubeDraw[] {
  let state = seed
  const next = () => {
    state = (state * 1103515245 + 12345) % 2147483648
    return state / 2147483648
  }
  const draws: TubeDraw[] = []
  const start = Date.UTC(2025, 0, 3)
  for (let i = 0; i < count; i += 1) {
    const picked = new Set<number>()
    while (picked.size < 5) picked.add(1 + Math.floor(next() * 50))
    const date = new Date(start + i * 3.5 * 86_400_000).toISOString().slice(0, 10)
    draws.push({ date, weekday: i % 2 ? "vendredi" : "mardi", numbers: [...picked] })
  }
  return draws
}

function options(overrides: Partial<TubeOptions> = {}): TubeOptions {
  return { ...DEFAULT_TUBE_OPTIONS, ...overrides }
}

test("exact moments of a uniform 5/50 draw", () => {
  assert.equal(SUM_MEAN, 127.5)
  assert.equal(SUM_VARIANCE, 956.25)
  assert.ok(Math.abs(RANK_SIGMAS[0] - 6.748) < 1e-3)
  assert.ok(Math.abs(RANK_SIGMAS[2] - 9.0534) < 1e-3)
  assert.equal(rankCovariance(2, 4), rankCovariance(4, 2))
  let total = 0
  for (let i = 1; i <= 5; i += 1) for (let j = 1; j <= 5; j += 1) total += rankCovariance(i, j)
  assert.ok(Math.abs(total - SUM_VARIANCE) < 1e-9)
  assert.ok(Math.abs(OPENING_SIGMA ** 2 - 127.5) < 1e-9)
})

test("lunar fraction follows synchro/ref/cycles.py", () => {
  const expected: Array<[string, number]> = [
    ["2000-01-06", 0.996693],
    ["2016-09-27", 0.866933],
    ["2024-04-08", 0.990711],
    ["2024-04-23", 0.498659],
    ["2026-09-25", 0.467583],
  ]
  for (const [date, fraction] of expected) {
    assert.ok(Math.abs(lunarFraction(date) - fraction) < 1e-5, `${date} ${lunarFraction(date)}`)
  }
  assert.equal(lunarPhaseLabel(0.5), "Pleine lune")
  assert.equal(lunarPhaseLabel(0.25), "Premier quartier")
  assert.equal(lunarPhaseLabel(0.99), "Nouvelle lune")
  const syzygy = lunarVector(0.5)
  assert.ok(Math.abs(syzygy.tide - 1) < 1e-12)
  const quarter = lunarVector(0.25)
  assert.ok(Math.abs(quarter.tide + 1) < 1e-12)
  assert.ok(Math.abs(quarter.drift - 1) < 1e-12)
})

test("axis is the SMA of the p sums before t", () => {
  const draws = syntheticDraws(40)
  const frame = tubeFrame(draws, options({ period: 10 }))
  assert.equal(frame.sections.length, 30)
  const sums = draws.map((draw) => draw.numbers.reduce((a, b) => a + b, 0))
  const first = frame.sections[0]
  assert.equal(first.index, 10)
  assert.equal(first.sum, sums[10])
  assert.ok(Math.abs(first.center - sums.slice(0, 10).reduce((a, b) => a + b, 0) / 10) < 1e-9)
  assert.equal(first.slope, 0)
  const second = frame.sections[1]
  assert.ok(Math.abs(second.slope - (second.center - first.center)) < 1e-12)
  const z = 1.6449
  assert.ok(Math.abs(first.halfWidth - z * Math.sqrt(SUM_VARIANCE) * Math.sqrt(1.1)) < 1e-9)
})

test("section t never reads draw t when forces are read the day before", () => {
  const draws = syntheticDraws(30)
  const tweaked = draws.map((draw, i) =>
    i === draws.length - 1 ? { ...draw, numbers: [46, 47, 48, 49, 50] } : draw
  )
  const opts = options({ gains: FULL, envelope: "glissante" })
  const a = buildTube(draws, opts).sections.at(-1)!
  const b = buildTube(tweaked, opts).sections.at(-1)!
  assert.notEqual(a.sum, b.sum)
  assert.equal(a.center, b.center)
  assert.equal(a.deformedLower, b.deformedLower)
  assert.equal(a.deformedUpper, b.deformedUpper)
  assert.deepEqual(a.forces, b.forces)

  const sameDay = options({ gains: FULL, timing: "jour" })
  const c = buildTube(draws, sameDay).sections.at(-1)!
  const d = buildTube(tweaked, sameDay).sections.at(-1)!
  assert.notDeepEqual(c.forces, d.forces)
})

test("translation over the five ranks is the sum deviation from its SMA", () => {
  const draws = syntheticDraws(25)
  const period = 5
  const frame = tubeFrame(draws, options({ period, timing: "jour" }))
  const sums = draws.map((draw) => draw.numbers.reduce((a, b) => a + b, 0))
  for (const section of frame.sections) {
    const t = section.index
    const sma = sums.slice(t - period + 1, t + 1).reduce((a, b) => a + b, 0) / period
    const deviations = section.deviations.reduce((a, b) => a + b, 0)
    assert.ok(Math.abs(deviations - (sums[t] - sma)) < 1e-9)
    const reduced = TUBE_RANKS.reduce((acc, rank) => acc + section.translation[rank], 0)
    const scale = Math.sqrt(SUM_VARIANCE) * Math.sqrt(1 - 1 / period)
    assert.ok(Math.abs(reduced * scale - (sums[t] - sma)) < 1e-9)
  }
})

test("each family moves only its own part of the section", () => {
  const frame = tubeFrame(syntheticDraws(60), options())
  for (const section of frame.sections) {
    const drivers = sectionDrivers(section, TUBE_SOURCES)
    assert.ok(Math.abs(drivers.shear) <= 1 && Math.abs(drivers.strain) <= 1)

    const idle = applyGains(section, drivers, ZERO)
    assert.equal(idle.deformedLower, section.lower)
    assert.equal(idle.deformedUpper, section.upper)

    const shear = applyGains(section, drivers, { ...ZERO, cisaillement: 1 })
    assert.equal(shear.widthFactor, 1)
    assert.ok(Math.abs(shear.shift - drivers.shear * section.halfWidth) < 1e-9)
    assert.ok(
      Math.abs(shear.deformedUpper - shear.deformedLower - (section.upper - section.lower)) < 1e-9
    )

    const stretch = applyGains(section, drivers, { ...ZERO, etirement: 1 })
    assert.ok(stretch.shift === 0)
    assert.ok(stretch.widthFactor >= 1 && stretch.widthFactor <= 2)
    if (drivers.strain <= 0) assert.equal(stretch.widthFactor, 1)

    const squeeze = applyGains(section, drivers, { ...ZERO, compression: 1 })
    assert.ok(squeeze.widthFactor <= 1 && squeeze.widthFactor >= 0.5)
    if (drivers.strain >= 0) assert.equal(squeeze.widthFactor, 1)
  }
})

test("sources pick which peripheral vectors push", () => {
  const frame = tubeFrame(syntheticDraws(30), options())
  const section = frame.sections[5]
  assert.deepEqual(sectionDrivers(section, []), { shear: 0, strain: 0 })
  const moon = sectionDrivers(section, ["lune"])
  assert.equal(moon.shear, section.drift)
  assert.equal(moon.strain, section.tide)
  const median = sectionDrivers(section, ["n3"])
  assert.equal(median.strain, 0)
  assert.ok(Math.abs(median.shear - Math.tanh(section.translation.n3)) < 1e-12)
  const both = sectionDrivers(section, ["n3", "lune"])
  assert.ok(Math.abs(both.shear - (median.shear + moon.shear) / 2) < 1e-12)
})

test("interval score charges width and misses", () => {
  assert.equal(intervalScore(100, 150, 120, 0.1), 50)
  assert.equal(intervalScore(100, 150, 95, 0.1), 50 + 20 * 5)
  assert.equal(intervalScore(100, 150, 152, 0.1), 50 + 20 * 2)
})

test("nominal random tube covers about its level", () => {
  const { sections } = buildTube(syntheticDraws(900, 11), options({ gains: ZERO }))
  const score = tubeScore(sections, 0.9)
  assert.ok(score.coverageNominal != null && Math.abs(score.coverageNominal - 0.9) < 0.04)
  assert.equal(score.coverageNominal, score.coverageDeformed)
  assert.equal(score.gain, 0)
})

test("date shuffles are reproducible and neutral without deformation", () => {
  const draws = syntheticDraws(80)
  const frame = tubeFrame(draws, options())
  const a = tubeNull(frame, TUBE_SOURCES, FULL, { rounds: 49, seed: 3 })
  const b = tubeNull(frame, TUBE_SOURCES, FULL, { rounds: 49, seed: 3 })
  assert.deepEqual(a, b)
  assert.ok(a.p != null && a.p > 0 && a.p <= 1)
  const observed = tubeScore(buildTube(draws, options({ gains: FULL })).sections, 0.9).scoreDeformed
  assert.ok(Math.abs((a.observed ?? 0) - (observed ?? 0)) < 1e-9)
  const idle = tubeNull(frame, TUBE_SOURCES, ZERO, { rounds: 19 })
  assert.equal(idle.p, 1)
})

test("domain stays inside the 15–240 sum range", () => {
  const { sections } = buildTube(syntheticDraws(60), options({ gains: FULL, level: 0.95 }))
  const [lo, hi] = tubeDomain(sections)
  assert.ok(lo >= 15 && hi <= 240 && lo < hi)
  assert.deepEqual(tubeDomain([]), [15, 240])
})

test("Tube is a Lecture page with its own capture lab", () => {
  const lecture = NAV_GROUPS.find((group) => group.id === "lecture")
  assert.ok(lecture?.items.some((item) => item.href === "/tube" && item.label === "Tube"))
  assert.equal(allNavItems().filter((item) => item.href === "/tube").length, 1)
  assert.equal(labFromPath("/tube"), "tube")
  assert.equal(labLabel("tube"), "Tube")
  assert.ok(suggestionsFor("tube").some((line) => line.includes("circulaire")))
})
