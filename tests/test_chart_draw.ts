import assert from "node:assert/strict"
import test from "node:test"

import {
  compactSketch,
  drawingSummaryLines,
} from "../src/lib/chart-draw/compact"
import {
  DEFAULT_MAGNET_RADIUS_PX,
  extremaIndices,
  isMagneted,
  nearestSample,
  pixelDistance,
  readTooltipIndex,
  snapIndexToExtrema,
} from "../src/lib/chart-draw/magnet"
import {
  buildSketchPoints,
  buildSketchGeometry,
  fitTemplateToWindow,
  remapSketch,
  sampleTemplate,
  windowTooShort,
} from "../src/lib/chart-draw/place"
import {
  FREE_FIGURE,
  isSketchDataKey,
  sketchDataKey,
  type ChartSketch,
} from "../src/lib/chart-draw/types"
import { catalog, canonicalFigure, isChannelFigure } from "../src/lib/chartisme/catalog"
import { curveKind, curveSparkSeries } from "../src/lib/chartisme/curve-shapes"
import {
  sparkGuides,
  sparkShowsCurve,
  sparkSolidGuides,
  sparklinePoints,
  sparkValues,
  synthCurve,
  templateFigures,
} from "../src/lib/chartisme/sketch-shapes"

test("magnet snaps to a nearby swing pivot, not the neighbouring sample", () => {
  const values = [1, 2, 10, 2, 1, 2, 9, 2, 1]
  const extrema = extremaIndices(values)
  assert.ok(extrema.length > 0)
  const snapped = snapIndexToExtrema(3, extrema)
  assert.ok(extrema.includes(snapped.index))
  assert.equal(snapped.kind, "extrema")
  const far = snapIndexToExtrema(0, [20])
  assert.equal(far.index, 0)
  assert.equal(far.kind, "sample")
})

test("pixel magnet picks the nearest sample in 2D", () => {
  const hit = nearestSample(
    [
      { index: 0, px: 0, py: 0 },
      { index: 4, px: 40, py: 10 },
      { index: 9, px: 90, py: 0 },
    ],
    { x: 38, y: 12 }
  )
  assert.equal(hit?.index, 4)
  assert.ok((hit?.distance ?? 99) < 5)
})

test("magnet radius is inclusive, missing pixels count as snapped", () => {
  assert.equal(isMagneted(DEFAULT_MAGNET_RADIUS_PX), true)
  assert.equal(isMagneted(DEFAULT_MAGNET_RADIUS_PX + 0.1), false)
  assert.equal(isMagneted(null), true)
  assert.equal(pixelDistance({ x: 0, y: 0 }, { x: 3, y: 4 }), 5)
})

test("tooltip index accepts Recharts number or numeric string", () => {
  assert.equal(readTooltipIndex(4), 4)
  assert.equal(readTooltipIndex("12"), 12)
  assert.equal(readTooltipIndex("n1"), null)
  assert.equal(readTooltipIndex(-1), null)
})

test("a catalog template is sampled then fitted to the series envelope", () => {
  const template = [0, 2, 0]
  assert.equal(sampleTemplate(template, 0), 0)
  assert.equal(sampleTemplate(template, 0.5), 2)
  assert.equal(sampleTemplate(template, 1), 0)
  const values = [10, 12, 20, 12, 10]
  const dates = values.map((_, i) => `2026-01-0${i + 1}`)
  const points = fitTemplateToWindow(template, values, dates, 0, 4)
  assert.equal(points.length, 5)
  assert.equal(points[0].actual, 10)
  assert.equal(points[2].actual, 20)
  assert.equal(points[4].actual, 10)
  assert.equal(points[2].date, "2026-01-03")
})

test("libre drawing is a straight line between the two anchors", () => {
  const values = [5, 6, 7, 8, 9, 10, 11, 12, 11, 10]
  const dates = values.map((_, i) => `2026-02-${String(i + 1).padStart(2, "0")}`)
  const free = buildSketchPoints({ figure: FREE_FIGURE, values, dates, from: 1, to: 8 })
  assert.equal(free.length, 8)
  assert.equal(free[0].actual, 6)
  assert.equal(free[free.length - 1].actual, 11)
  for (let i = 0; i < free.length; i += 1) {
    const expected = 6 + (11 - 6) * (i / 7)
    assert.ok(Math.abs(free[i].actual - expected) < 1e-9)
  }
  const reversed = buildSketchPoints({ figure: FREE_FIGURE, values, dates, from: 8, to: 1 })
  assert.deepEqual(
    reversed.map((point) => point.actual),
    free.map((point) => point.actual)
  )
  const mids = [free[0].actual, free[3].actual, free[7].actual]
  assert.ok(mids[0] < mids[1] && mids[1] < mids[2])
  const template = synthCurve("double_top")
  assert.ok(template.length > 8)
  const overlay = buildSketchPoints({
    figure: "double_top",
    values,
    dates,
    from: 0,
    to: values.length - 1,
  })
  assert.equal(overlay.length, values.length)
  const peak = Math.max(...overlay.map((point) => point.actual))
  const trough = Math.min(...overlay.map((point) => point.actual))
  assert.equal(peak, Math.max(...values))
  assert.equal(trough, Math.min(...values))
  assert.ok(synthCurve("canal").length > 8)
  assert.ok(synthCurve("tunnel_droit").length > 8)
})

test("the chartist table lists canal among 18 figures with a template", () => {
  const rows = catalog()
  assert.equal(rows.length, 18)
  assert.ok(rows.some((row) => row.figure === "canal" && row.label === "Canal"))
  const templates = templateFigures()
  assert.ok(templates.includes("canal"))
  for (const row of rows) {
    assert.ok(templates.includes(row.figure), row.figure)
  }
  const spark = sparklinePoints(sparkValues("canal"), 48, 20)
  assert.ok(spark.includes(","))
  const free = sparklinePoints(sparkValues("free"), 48, 20)
  const [start, end] = free.split(" ")
  assert.ok(start && end)
  const [, y0] = start.split(",").map(Number)
  const [, y1] = end.split(",").map(Number)
  assert.ok(y0 > y1)
})

test("canal thumbnail is two parallel rails, not a freehand squiggle", () => {
  const guides = sparkGuides("canal")
  assert.ok(guides)
  assert.equal(guides.upper.length, guides.lower.length)
  assert.ok(guides.upper.length > 8)
  const riseU = guides.upper[guides.upper.length - 1] - guides.upper[0]
  const riseL = guides.lower[guides.lower.length - 1] - guides.lower[0]
  assert.ok(Math.abs(riseU - riseL) < 1e-9)
  assert.ok(guides.upper[0] > guides.lower[0])
  assert.equal(sparkSolidGuides("canal"), true)
  assert.equal(sparkSolidGuides("rectangle"), false)
  assert.equal(sparkShowsCurve("canal"), true)
  assert.equal(sparkShowsCurve("rectangle"), true)
  assert.ok(sparkGuides("rectangle"))
  assert.equal(canonicalFigure("tunnel_droit"), "canal")
  assert.equal(isChannelFigure("tunnel_droit"), true)
})

test("placing a canal draws two parallel rails around the actual series", () => {
  const values = [10, 12, 11, 14, 13, 16, 15, 18, 17, 20, 19, 22]
  const dates = values.map((_, i) => `2026-05-${String(i + 1).padStart(2, "0")}`)
  const geo = buildSketchGeometry({
    figure: "canal",
    values,
    dates,
    from: 0,
    to: values.length - 1,
  })
  assert.ok(geo.band)
  const { upper, lower } = geo.band
  assert.equal(upper.length, values.length)
  assert.equal(lower.length, values.length)
  const riseU = upper[upper.length - 1].actual - upper[0].actual
  const riseL = lower[lower.length - 1].actual - lower[0].actual
  assert.ok(Math.abs(riseU - riseL) < 1e-6)
  for (let i = 0; i < values.length; i += 1) {
    assert.ok(values[i] <= upper[i].actual + 1e-9, `upper rail covers sample ${i}`)
    assert.ok(values[i] >= lower[i].actual - 1e-9, `lower rail covers sample ${i}`)
  }
  const midRise = geo.points[geo.points.length - 1].actual - geo.points[0].actual
  const step = (geo.points[1].actual - geo.points[0].actual)
  for (let i = 1; i < geo.points.length; i += 1) {
    assert.ok(Math.abs(geo.points[i].actual - geo.points[0].actual - step * i) < 1e-6)
  }
  assert.ok(midRise > 0)
  const legacy = buildSketchGeometry({
    figure: "tunnel_droit",
    values,
    dates,
    from: 0,
    to: values.length - 1,
  })
  assert.ok(legacy.band)
  assert.equal(legacy.band.upper.length, values.length)
})

test("each curve type has a schematic sparkline", () => {
  const kinds = [
    "sum",
    "spread",
    "parity",
    "high_low",
    "consecutive",
    "centroid",
    "n1",
    "n2",
    "n3",
    "n4",
    "n5",
    "g1",
    "g2",
    "g3",
    "g4",
    "delay",
    "hit",
    "star_sum",
    "e1",
    "e2",
    "star_delay",
    "star_hit",
    "rank1",
    "eachNumber",
    "eachStar",
    "sumBoth",
  ]
  for (const name of kinds) {
    const series = curveSparkSeries(name)
    assert.ok(series.length >= 1, name)
    assert.ok(series[0].length > 8, name)
  }
  assert.equal(curveKind("delay:7"), "delay")
  assert.equal(curveKind("curve:sum"), "sum")
  assert.equal(curveKind("family:hit"), "hit")
  assert.equal(curveKind("sumNumbers"), "sum")
  assert.equal(curveKind("any"), "")
  const delay = curveSparkSeries("delay:12")[0]
  assert.ok(delay.some((value, index) => index > 0 && value < delay[index - 1]))
  assert.deepEqual([...new Set(curveSparkSeries("hit").flat())].sort(), [0, 1])
  assert.deepEqual([...new Set(curveSparkSeries("rank1").flat())].sort(), [0, 1])
  const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length
  assert.ok(mean(curveSparkSeries("n1")[0]) < mean(curveSparkSeries("n5")[0]))
  assert.equal(curveSparkSeries("eachNumber").length, 5)
  assert.equal(curveSparkSeries("sumBoth").length, 2)
  assert.ok(sparklinePoints(curveSparkSeries("delay")[0], 48, 20).includes(","))
  const box = { min: 1, max: 50 }
  const yOf = (kind: string) => {
    const points = sparklinePoints(curveSparkSeries(kind)[0], 48, 20, 1.5, box)
    return Number(points.split(" ")[0].split(",")[1])
  }
  assert.ok(yOf("n1") > yOf("n5"), "n1 sits lower than n5 in the school box")
})

test("a window shorter than 8 bars is rejected", () => {
  assert.equal(windowTooShort(0, 6), true)
  assert.equal(windowTooShort(0, 7), false)
})

test("remap keeps a sketch whose dates still exist after a longer window", () => {
  const sketch: ChartSketch = {
    id: "a",
    host: "evolution",
    figure: "ete",
    seriesKey: "sumNumbers",
    seriesLabel: "Somme",
    start: {
      index: 0,
      date: "2026-03-02",
      seriesKey: "sumNumbers",
      actual: 100,
      snapped: true,
      kind: "sample",
    },
    end: {
      index: 2,
      date: "2026-03-06",
      seriesKey: "sumNumbers",
      actual: 110,
      snapped: true,
      kind: "extrema",
    },
    points: [
      { index: 0, date: "2026-03-02", actual: 100 },
      { index: 1, date: "2026-03-04", actual: 105 },
      { index: 2, date: "2026-03-06", actual: 110 },
    ],
    reading: null,
    createdAt: "2026-03-07T00:00:00.000Z",
  }
  const remapped = remapSketch(sketch, [
    "2026-02-28",
    "2026-03-02",
    "2026-03-04",
    "2026-03-06",
    "2026-03-08",
  ])
  assert.ok(remapped)
  assert.equal(remapped.start.index, 1)
  assert.equal(remapped.end.index, 3)
  assert.equal(remapped.points[1].index, 2)
  assert.equal(remapSketch(sketch, ["2026-01-01"]), null)
})

test("capture payload keeps figure, anchors and geometric reading", () => {
  const sketch: ChartSketch = {
    id: "cap-1",
    host: "evolution",
    figure: "double_bottom",
    seriesKey: "sumNumbers",
    seriesLabel: "Somme",
    start: {
      index: 0,
      date: "2026-04-01",
      seriesKey: "sumNumbers",
      actual: 90,
      snapped: true,
      kind: "extrema",
    },
    end: {
      index: 9,
      date: "2026-04-20",
      seriesKey: "sumNumbers",
      actual: 95,
      snapped: true,
      kind: "sample",
    },
    points: Array.from({ length: 10 }, (_, i) => ({
      index: i,
      date: `2026-04-${String(i + 1).padStart(2, "0")}`,
      actual: 90 + i,
    })),
    reading: { figure: "double_bottom", label: "Double creux", confidence: 0.72 },
    createdAt: "2026-04-21T00:00:00.000Z",
  }
  const compact = compactSketch(sketch)
  assert.equal(compact.figureLabel, "Double creux")
  assert.equal(compact.bars, 10)
  assert.equal(compact.reading?.confidence, 0.72)
  assert.equal(isSketchDataKey(sketchDataKey(sketch.id)), true)
  assert.equal(isSketchDataKey("sumNumbers"), false)
  const lines = drawingSummaryLines([sketch])
  assert.ok(lines[0].includes("Double creux"))
  assert.ok(lines[0].includes("2026-04-01"))
  assert.ok(lines.some((line) => line.includes("Lecture géométrique")))
})
