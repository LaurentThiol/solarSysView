import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

import {
  BOUNCE_SERIES,
  DEFAULT_BOUNCE_QUERY,
  findBounces,
  scanBounces,
  type BounceSeriesId,
} from "../src/lib/bouncing.ts"

const RESTITUTION = 0.75

function dampedParabolas(restitution: number, heights: number[], widths: number[]) {
  const values: number[] = []
  let height = heights[0] ?? 0
  for (let bounce = 0; bounce < widths.length; bounce += 1) {
    const width = widths[bounce] ?? 0
    const arch = heights[bounce] ?? height
    for (let step = 0; step < width; step += 1) {
      const u = step / width
      values.push(arch * 4 * u * (1 - u))
    }
    height = arch * restitution * restitution
  }
  values.push(0)
  return values
}

function geometricHeights(restitution: number, first: number, count: number) {
  const ratio = restitution * restitution
  return Array.from({ length: count }, (_, index) => first * ratio ** index)
}

function datesFor(count: number) {
  return Array.from({ length: count }, (_, index) => {
    const day = String((index % 28) + 1).padStart(2, "0")
    const month = String(Math.floor(index / 28) + 1).padStart(2, "0")
    return `2024-${month}-${day}`
  })
}

function sampleSeries(values: number[], series: BounceSeriesId = "n3") {
  return findBounces({ values, dates: datesFor(values.length) }, series)
}

test("a damped bouncing series is found and restitution is recovered", () => {
  const heights = geometricHeights(RESTITUTION, 16, 4)
  const values = dampedParabolas(RESTITUTION, heights, [12, 10, 8, 8])
  const episodes = sampleSeries(values, "n3")
  assert.equal(episodes.length, 1)
  const episode = episodes[0]
  assert.ok(episode)
  assert.equal(episode.series, "n3")
  assert.ok(episode.bounces >= 3)
  assert.ok(Math.abs(episode.restitution - RESTITUTION) <= 0.05)
  assert.ok(episode.r2 >= 0.55)
  assert.ok(episode.derivative >= 0.95)
  assert.ok(episode.velocityAgreement > 0.4)
  assert.ok(episode.heightRatio < 1)
  assert.ok(Number.isFinite(episode.halfLifeDraws) && episode.halfLifeDraws > 0)
  assert.equal(episode.envelope.length, episode.bounces)
  assert.ok(episode.fromDate)
  assert.ok(episode.toDate)
})

function chainedArches(
  shape: (width: number, height: number) => number[],
  widths: number[],
  heights: number[]
) {
  const values: number[] = []
  for (let bounce = 0; bounce < widths.length; bounce += 1) {
    const arch = shape(widths[bounce] ?? 0, heights[bounce] ?? 0)
    if (bounce === 0) values.push(...arch)
    else values.push(...arch.slice(1))
  }
  return values
}

function triangleArch(width: number, height: number) {
  const apex = Math.floor(width / 2)
  return Array.from({ length: width + 1 }, (_, index) => {
    const t = index <= apex ? index / apex : (width - index) / (width - apex)
    return height * t
  })
}

function offsetParabola(width: number, height: number, apex: number) {
  const rise = Math.max(1, apex)
  const fall = Math.max(1, width - apex)
  return Array.from({ length: width + 1 }, (_, index) => {
    const t = index <= apex ? (apex - index) / rise : (index - apex) / fall
    return height * (1 - t * t)
  })
}

test("an off-center parabola keeps a high derivative, a long triangle does not", () => {
  const heights = geometricHeights(RESTITUTION, 16, 4)
  const offset = chainedArches(
    (width, height) => offsetParabola(width, height, Math.max(2, Math.round(width / 4))),
    [12, 10, 8, 8],
    heights
  )
  const shifted = sampleSeries(offset)
  assert.equal(shifted.length, 1)
  assert.ok((shifted[0]?.derivative ?? 0) >= 0.95)

  const triangles = chainedArches(triangleArch, [12, 10, 8, 8], heights)
  assert.equal(sampleSeries(triangles).length, 0)

  const smooth = dampedParabolas(RESTITUTION, heights, [12, 10, 8, 8])
  assert.equal(
    findBounces({ values: smooth, dates: datesFor(smooth.length) }, "n3", {
      minDerivative: 0.9,
    }).length,
    1
  )
  const rounded = smooth.map((value) => Math.round(value))
  const discrete = findBounces({ values: rounded, dates: datesFor(rounded.length) }, "n3")
  assert.equal(discrete.length, 1)
  assert.ok((discrete[0]?.derivative ?? 0) >= 0.6)
})

test("constant amplitude, growing bounces and a flat series are rejected", () => {
  const sine = Array.from({ length: 48 }, (_, index) => 10 + 8 * Math.sin((2 * Math.PI * index) / 8))
  assert.equal(sampleSeries(sine).length, 0)

  const growing = geometricHeights(1 / RESTITUTION, 4, 4)
  assert.equal(sampleSeries(dampedParabolas(1 / RESTITUTION, growing, [8, 8, 10, 12])).length, 0)

  assert.equal(sampleSeries(Array.from({ length: 30 }, () => 5)).length, 0)
})

test("stricter gates reject the same damped series", () => {
  const heights = geometricHeights(RESTITUTION, 16, 4)
  const values = dampedParabolas(RESTITUTION, heights, [12, 10, 8, 8])
  const dates = datesFor(values.length)
  assert.equal(
    findBounces({ values, dates }, "n3", { ...DEFAULT_BOUNCE_QUERY, maxRestitution: 0.6 }).length,
    0
  )
  assert.equal(
    findBounces({ values, dates }, "n3", { ...DEFAULT_BOUNCE_QUERY, minBounces: 5 }).length,
    0
  )
  assert.equal(
    findBounces({ values, dates }, "n3", { ...DEFAULT_BOUNCE_QUERY, minBounces: 4 }).length,
    1
  )
  assert.ok(
    findBounces({ values, dates }, "n3", {
      minR2: 0.4,
      minParabola: 0.5,
      maxRestitution: 0.95,
    }).length >= 1
  )
})

test("the scan covers n1–n5 and both stars", () => {
  const heights = geometricHeights(RESTITUTION, 16, 4)
  const values = dampedParabolas(RESTITUTION, heights, [12, 10, 8, 8])
  const dates = datesFor(values.length)
  const points = values.map((value, index) => {
    const row = { date: dates[index] ?? "2024-01-01" } as {
      date: string
    } & Record<BounceSeriesId, number>
    for (const series of BOUNCE_SERIES) row[series] = value
    return row
  })
  const episodes = scanBounces(points)
  assert.equal(episodes.length, BOUNCE_SERIES.length)
  assert.deepEqual(
    episodes.map((episode) => episode.series).sort(),
    [...BOUNCE_SERIES].sort()
  )
})

test("evolution exposes the bouncing tab", () => {
  const panel = readFileSync(new URL("../src/components/evolution-panel.tsx", import.meta.url), "utf8")
  const page = readFileSync(new URL("../src/app/evolution/page.tsx", import.meta.url), "utf8")
  const view = readFileSync(new URL("../src/components/bouncing-panel.tsx", import.meta.url), "utf8")
  assert.match(panel, /id: "bouncing"/)
  assert.match(panel, /BouncingPanel/)
  assert.match(view, /Aucun amortissement de rebond sur cette fenêtre/)
  assert.match(view, /ariaLabel="Rebonds minimum"/)
  assert.match(view, /ariaLabel="Ajustement des hauteurs"/)
  assert.match(view, /ariaLabel="Forme des arches"/)
  assert.match(view, /ariaLabel="Dérivée des arches"/)
  assert.match(view, /ariaLabel="Amortissement exigé"/)
  assert.match(view, /ariaLabel="Amplitude minimale"/)
  assert.match(view, /type="range"/)
  assert.match(view, /Aucun amortissement avec ces seuils/)
  assert.match(page, /Suspense/)
})
