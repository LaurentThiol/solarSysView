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
import { catalog } from "../src/lib/chartisme/catalog"
import { sparklinePoints, sparkValues, synthCurve, templateFigures } from "../src/lib/chartisme/sketch-shapes"

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
  assert.ok(synthCurve("tunnel_droit").length > 8)
})

test("the chartist table lists tunnel droit among 18 figures with a template", () => {
  const rows = catalog()
  assert.equal(rows.length, 18)
  assert.ok(rows.some((row) => row.figure === "tunnel_droit" && row.label === "Tunnel droit"))
  const templates = templateFigures()
  assert.ok(templates.includes("tunnel_droit"))
  for (const row of rows) {
    assert.ok(templates.includes(row.figure), row.figure)
  }
  const spark = sparklinePoints(sparkValues("tunnel_droit"), 48, 20)
  assert.ok(spark.includes(","))
  const free = sparklinePoints(sparkValues("free"), 48, 20)
  const [start, end] = free.split(" ")
  assert.ok(start && end)
  const [, y0] = start.split(",").map(Number)
  const [, y1] = end.split(",").map(Number)
  assert.ok(y0 > y1)
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
