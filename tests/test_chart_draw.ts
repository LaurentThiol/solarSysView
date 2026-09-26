import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

import {
  compactSketch,
  drawingSummaryLines,
} from "../src/lib/chart-draw/compact"
import { clampHudPosition } from "../src/lib/chart-draw/hud"
import {
  DEFAULT_MAGNET_RADIUS_PX,
  canFreeMoveHandle,
  canFreePlaceArrival,
  cursorReleasesMagnet,
  extremaIndices,
  invertLinear,
  isAltKeyboardEvent,
  shouldPreventAltKeyDown,
  isDemagnetizeModifier,
  modifierReleasesMagnet,
  shouldReleaseAltHold,
  isMagneted,
  magnetKindAt,
  magnetOnCurve,
  magnetOnTouches,
  nearestSample,
  swingTouches,
  nearestSampleByX,
  nearestSketchHandle,
  pixelDistance,
  readTooltipIndex,
  snapIndexToExtrema,
  valueFromPixelY,
} from "../src/lib/chart-draw/magnet"
import { readWindow } from "../src/lib/chart-draw/reading"
import {
  liveToAnchor,
  moveSketchHandle,
  sketchWithMovedHandle,
} from "../src/lib/chart-draw/move"
import {
  anchorsToGeometry,
  buildSketchPoints,
  buildSketchGeometry,
  channelLabel,
  fitTemplateToWindow,
  remapSketch,
  sampleTemplate,
  windowTooShort,
} from "../src/lib/chart-draw/place"
import { FREE_PARALLEL_HINT, placementHint } from "../src/lib/chart-draw/placement-hint"
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

test("rail magnet prefers touch extrema of the requested side", () => {
  const values = [12, 20, 11, 21, 10, 22, 13]
  const touches = swingTouches(values)
  const highs = touches.filter((touch) => touch.type === "H")
  const lows = touches.filter((touch) => touch.type === "L")
  assert.ok(highs.length >= 1)
  assert.ok(lows.length >= 1)
  const samples = values.map((value, index) => ({
    index,
    px: index * 40,
    py: 200 - value * 4,
  }))
  const high = highs[0]
  const nearHigh = samples.find((sample) => sample.index === high.index)
  assert.ok(nearHigh)
  const preferHigh = magnetOnTouches(samples, { x: nearHigh.px, y: nearHigh.py }, touches, "H")
  assert.equal(preferHigh?.kind, "extrema")
  assert.equal(preferHigh?.index, high.index)
  const low = lows[0]
  const nearLow = samples.find((sample) => sample.index === low.index)
  assert.ok(nearLow)
  const preferLow = magnetOnTouches(samples, { x: nearLow.px, y: nearLow.py }, touches, "L")
  assert.equal(preferLow?.index, low.index)
})

test("magnet labels a swing pivot without stealing the neighbouring sample", () => {
  const values = [1, 2, 10, 2, 1, 2, 9, 2, 1]
  const extrema = extremaIndices(values)
  assert.ok(extrema.length > 0)
  const onPeak = snapIndexToExtrema(2, extrema)
  assert.ok(extrema.includes(onPeak.index))
  assert.equal(onPeak.kind, "extrema")
  const neighbor = snapIndexToExtrema(3, extrema)
  assert.equal(neighbor.index, 3)
  assert.equal(neighbor.kind, "sample")
  const far = snapIndexToExtrema(0, [20])
  assert.equal(far.index, 0)
  assert.equal(far.kind, "sample")
})

test("pixel magnet keeps every original sample selectable next to a swing pivot", () => {
  const values = [120, 155, 130, 80, 132, 115, 136, 188]
  const extrema = extremaIndices(values)
  assert.ok(extrema.includes(5), "the valley at 115 is a swing pivot")
  const samples = values.map((value, index) => ({
    index,
    px: index * 50,
    py: 200 - value,
  }))
  const onValley = magnetOnCurve(samples, { x: 250, y: 85 }, extrema)
  assert.equal(onValley?.index, 5)
  assert.equal(onValley?.kind, "extrema")
  const onRightNeighbor = magnetOnCurve(samples, { x: 300, y: 64 }, extrema)
  assert.equal(onRightNeighbor?.index, 6)
  assert.equal(onRightNeighbor?.kind, magnetKindAt(6, extrema))
  assert.notEqual(onRightNeighbor?.index, 5)
  assert.equal(onRightNeighbor?.snapped, true)
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

test("Alt demagnetizes the arrival of any free-draw figure", () => {
  assert.equal(isDemagnetizeModifier({ altKey: true }), true)
  assert.equal(isDemagnetizeModifier({ altKey: false }), false)
  assert.equal(isDemagnetizeModifier({}), false)
  assert.equal(
    isDemagnetizeModifier({
      altKey: false,
      getModifierState: (key) => key === "Alt",
    }),
    true
  )
  assert.equal(
    isDemagnetizeModifier({
      altKey: false,
      getModifierState: () => {
        throw new Error("synthetic")
      },
    }),
    false
  )
  assert.equal(canFreePlaceArrival(true, true), true)
  assert.equal(canFreePlaceArrival(false, true), false)
  assert.equal(canFreePlaceArrival(true, false), false)
  assert.equal(canFreePlaceArrival(false, false), false)
  assert.equal(canFreeMoveHandle("end", true), true)
  assert.equal(canFreeMoveHandle("start", true), false)
  assert.equal(canFreeMoveHandle("mid", true), false)
  assert.equal(canFreeMoveHandle("end", false), false)
  assert.equal(isAltKeyboardEvent({ key: "Alt" }), true)
  assert.equal(isAltKeyboardEvent({ key: "AltGraph" }), true)
  assert.equal(isAltKeyboardEvent({ key: "Dead", code: "AltLeft" }), true)
  assert.equal(isAltKeyboardEvent({ key: "a", code: "KeyA" }), false)
  assert.equal(shouldPreventAltKeyDown("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)"), false)
  assert.equal(shouldPreventAltKeyDown("Mozilla/5.0 (Windows NT 10.0; Win64; x64)"), true)
  assert.equal(shouldPreventAltKeyDown(""), true)
  assert.equal(shouldReleaseAltHold({ pointerDown: true, stillDown: false }), false)
  assert.equal(shouldReleaseAltHold({ pointerDown: false, stillDown: true }), false)
  assert.equal(shouldReleaseAltHold({ pointerDown: false, stillDown: false }), true)
  assert.equal(
    modifierReleasesMagnet({ eventAlt: false, held: false, stickyOff: true, gesture: false }),
    true
  )
  assert.equal(
    modifierReleasesMagnet({ eventAlt: false, held: false, stickyOff: false, gesture: true }),
    true
  )
  assert.equal(
    modifierReleasesMagnet({ eventAlt: false, held: true, stickyOff: false, gesture: false }),
    true
  )
  assert.equal(
    modifierReleasesMagnet({ eventAlt: false, held: false, stickyOff: false, gesture: false }),
    false
  )
})

test("nearest sketch handle stays within the magnet radius", () => {
  const handles = [
    { sketchId: "a", handle: "start" as const, px: 10, py: 10 },
    { sketchId: "a", handle: "mid" as const, px: 50, py: 20 },
    { sketchId: "a", handle: "end" as const, px: 90, py: 40 },
    { sketchId: "b", handle: "end" as const, px: 40, py: 12 },
  ]
  const hitMid = nearestSketchHandle(handles, { x: 51, y: 19 })
  assert.equal(hitMid?.sketchId, "a")
  assert.equal(hitMid?.handle, "mid")
  const hitEnd = nearestSketchHandle(handles, { x: 88, y: 42 })
  assert.equal(hitEnd?.sketchId, "a")
  assert.equal(hitEnd?.handle, "end")
  const hitOther = nearestSketchHandle(handles, { x: 38, y: 10 })
  assert.equal(hitOther?.sketchId, "b")
  assert.equal(hitOther?.handle, "end")
  assert.equal(nearestSketchHandle(handles, { x: 200, y: 200 }), null)
  const isolated = [{ sketchId: "c", handle: "start" as const, px: 0, py: 0 }]
  assert.ok(nearestSketchHandle(isolated, { x: DEFAULT_MAGNET_RADIUS_PX, y: 0 }))
  assert.equal(
    nearestSketchHandle(isolated, { x: DEFAULT_MAGNET_RADIUS_PX + 0.2, y: 0 }),
    null
  )
})

test("off-curve placement keeps the bar under the cursor, not the 2D magnet", () => {
  const samples = [
    { index: 0, px: 0, py: 80 },
    { index: 4, px: 40, py: 10 },
    { index: 9, px: 90, py: 80 },
  ]
  const magnet = nearestSample(samples, { x: 50, y: 12 })
  assert.equal(magnet?.index, 4)
  const byX = nearestSampleByX(samples, 50)
  assert.equal(byX?.index, 4)
  const above = nearestSampleByX(samples, 88)
  assert.equal(above?.index, 9)
  const twoD = nearestSample(samples, { x: 88, y: 12 })
  assert.equal(twoD?.index, 4)
})

test("linear Y invert reads a value above the series and extrapolates", () => {
  const at = (value: number) => 100 - value
  assert.equal(invertLinear(at, 50, 0, 100), 50)
  assert.equal(invertLinear(at, 0, 0, 100), 100)
  assert.equal(invertLinear(at, 120, 0, 100), -20)
  const samples = [
    { index: 0, px: 0, py: 80 },
    { index: 1, px: 10, py: 20 },
  ]
  assert.equal(valueFromPixelY(samples, [10, 40], 80), 10)
  assert.equal(valueFromPixelY(samples, [10, 40], 20), 40)
  assert.equal(valueFromPixelY(samples, [10, 40], 50), 25)
  assert.equal(valueFromPixelY(samples, [10, 40], -10), 55)
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

test("a free third click lays a line parallel to the segment", () => {
  const values = [10, 12, 11, 14, 13, 16, 15, 18, 17, 20, 19, 22]
  const dates = values.map((_, i) => `2026-08-${String(i + 1).padStart(2, "0")}`)
  const geo = buildSketchGeometry({
    figure: FREE_FIGURE,
    values,
    dates,
    from: 1,
    to: 8,
    fromActual: 30,
    toActual: 16,
    via: 4,
    viaActual: 4,
  })
  assert.ok(geo.band)
  const { upper, lower } = geo.band
  assert.equal(upper.length, lower.length)
  assert.ok(upper.length >= 8)
  const rise = (points: { index: number; actual: number }[]) =>
    (points[points.length - 1].actual - points[0].actual) /
    (points[points.length - 1].index - points[0].index)
  assert.ok(Math.abs(rise(upper) - rise(lower)) < 1e-9)
  const onRail = (index: number, actual: number) => {
    const hi = upper.find((point) => point.index === index)?.actual
    const lo = lower.find((point) => point.index === index)?.actual
    assert.ok(hi != null && lo != null)
    assert.ok(Math.abs(hi - actual) < 1e-6 || Math.abs(lo - actual) < 1e-6)
  }
  onRail(1, 30)
  onRail(8, 16)
  onRail(4, 4)
  assert.equal(channelLabel(FREE_FIGURE, geo.band), "Parallèles")
  assert.equal(channelLabel(FREE_FIGURE), "Segment libre")
  const collapsed = buildSketchGeometry({
    figure: FREE_FIGURE,
    values,
    dates,
    from: 1,
    to: 8,
    fromActual: 30,
    toActual: 16,
    via: 4,
    viaActual: 30 + ((16 - 30) * (4 - 1)) / (8 - 1),
  })
  assert.equal(collapsed.band, undefined)
  assert.equal(collapsed.points[0].actual, 30)
  assert.equal(collapsed.points.at(-1)?.actual, 16)

  const sketch: ChartSketch = {
    id: "par-1",
    host: "evolution",
    figure: FREE_FIGURE,
    seriesKey: "sumNumbers",
    seriesLabel: "Somme",
    start: {
      index: 1,
      date: dates[1],
      seriesKey: "sumNumbers",
      actual: 30,
      snapped: true,
      kind: "sample",
    },
    mid: {
      index: 8,
      date: dates[8],
      seriesKey: "sumNumbers",
      actual: 16,
      snapped: true,
      kind: "sample",
    },
    end: {
      index: 4,
      date: dates[4],
      seriesKey: "sumNumbers",
      actual: 4,
      snapped: false,
      kind: "free",
    },
    points: geo.points,
    band: geo.band,
    reading: null,
    createdAt: "2026-08-12T00:00:00.000Z",
  }
  const moved = moveSketchHandle(
    sketch,
    "end",
    liveToAnchor({
      index: 6,
      date: dates[6],
      seriesKey: "sumNumbers",
      actual: 40,
      snapped: false,
      kind: "free",
    }),
    values,
    dates
  )
  assert.ok(moved?.band)
  const movedRise = (points: { index: number; actual: number }[]) =>
    (points[points.length - 1].actual - points[0].actual) /
    (points[points.length - 1].index - points[0].index)
  assert.ok(Math.abs(movedRise(moved.band.upper) - movedRise(moved.band.lower)) < 1e-9)
  const contact = moved.band.upper.find((point) => point.index === 6)?.actual
  const other = moved.band.lower.find((point) => point.index === 6)?.actual
  assert.ok(contact != null && other != null)
  assert.ok(Math.abs(contact - 40) < 1e-6 || Math.abs(other - 40) < 1e-6)
  const kept = anchorsToGeometry({
    figure: FREE_FIGURE,
    values,
    dates,
    start: moved.start,
    mid: moved.mid,
    end: moved.end,
  })
  const keptHi = kept.band?.upper.find((point) => point.index === 1)?.actual
  const keptLo = kept.band?.lower.find((point) => point.index === 1)?.actual
  assert.ok(keptHi != null && keptLo != null)
  assert.ok(Math.abs(keptHi - 30) < 1e-6 || Math.abs(keptLo - 30) < 1e-6)
  const keptHiEnd = kept.band?.upper.find((point) => point.index === 8)?.actual
  const keptLoEnd = kept.band?.lower.find((point) => point.index === 8)?.actual
  assert.ok(keptHiEnd != null && keptLoEnd != null)
  assert.ok(Math.abs(keptHiEnd - 16) < 1e-6 || Math.abs(keptLoEnd - 16) < 1e-6)
  assert.equal(cursorReleasesMagnet({
    movingHandle: null,
    hasStart: true,
    demagnetize: false,
    parallelContact: true,
  }), true)
  assert.equal(cursorReleasesMagnet({
    movingHandle: "end",
    hasStart: true,
    demagnetize: false,
    parallelContact: false,
  }), false)
  const live = {
    index: 6,
    date: dates[6],
    seriesKey: "sumNumbers",
    seriesLabel: "Somme",
    actual: 40,
    snapped: false,
    offCurve: true,
    kind: "free" as const,
    distancePx: 12,
    clientX: 0,
    clientY: 0,
  }
  assert.equal(
    placementHint({
      live,
      startIndex: 1,
      midIndex: 8,
      free: true,
      parallel: true,
    }),
    FREE_PARALLEL_HINT
  )
})

test("a free arrival can sit off the series while the start stays on it", () => {
  const values = [5, 6, 7, 8, 9, 10, 11, 12, 11, 10]
  const dates = values.map((_, i) => `2026-02-${String(i + 1).padStart(2, "0")}`)
  const off = buildSketchPoints({
    figure: FREE_FIGURE,
    values,
    dates,
    from: 1,
    to: 8,
    fromActual: 6,
    toActual: 40,
  })
  assert.equal(off[0].actual, 6)
  assert.equal(off[off.length - 1].actual, 40)
  for (let i = 0; i < off.length; i += 1) {
    const expected = 6 + (40 - 6) * (i / 7)
    assert.ok(Math.abs(off[i].actual - expected) < 1e-9)
  }
  const reversed = buildSketchPoints({
    figure: FREE_FIGURE,
    values,
    dates,
    from: 8,
    to: 1,
    fromActual: 40,
    toActual: 6,
  })
  assert.deepEqual(
    reversed.map((point) => point.actual),
    off.map((point) => point.actual)
  )
  const snappedCanal = buildSketchGeometry({
    figure: "canal",
    values,
    dates,
    from: 0,
    to: values.length - 1,
  })
  assert.ok(snappedCanal.band)
  const lastSnappedUpper = snappedCanal.band?.upper.at(-1)?.actual
  assert.notEqual(lastSnappedUpper, 40)

  const overlay = buildSketchPoints({
    figure: "double_top",
    values,
    dates,
    from: 0,
    to: values.length - 1,
  })
  const snappedOverlay = buildSketchPoints({
    figure: "double_top",
    values,
    dates,
    from: 0,
    to: values.length - 1,
    fromActual: values[0],
    toActual: values[values.length - 1],
  })
  assert.deepEqual(
    snappedOverlay.map((point) => point.actual),
    overlay.map((point) => point.actual)
  )
  const tilted = buildSketchPoints({
    figure: "double_top",
    values,
    dates,
    from: 0,
    to: values.length - 1,
    fromActual: values[0],
    toActual: 40,
  })
  assert.equal(tilted[0].actual, overlay[0].actual)
  assert.equal(tilted[tilted.length - 1].actual, 40)

  const canal = buildSketchGeometry({
    figure: "canal",
    values,
    dates,
    from: 0,
    to: values.length - 1,
    fromActual: values[0],
    toActual: 40,
  })
  assert.ok(canal.band)
  const lastUpper = canal.band?.upper.at(-1)?.actual
  assert.ok(lastUpper != null)
  assert.ok(Math.abs(lastUpper - 40) < 1e-9)
  const lastLower = canal.band?.lower.at(-1)?.actual
  assert.ok(lastLower != null && lastLower < lastUpper)

  const below = buildSketchGeometry({
    figure: "canal",
    values,
    dates,
    from: 0,
    to: values.length - 1,
    fromActual: values[0],
    toActual: -10,
  })
  const lastBelow = below.band?.lower.at(-1)?.actual
  assert.ok(lastBelow != null)
  assert.ok(Math.abs(lastBelow - -10) < 1e-9)
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

test("three-click canal builds parallels through the opposite contact", () => {
  const values = [10, 12, 11, 14, 13, 16, 15, 18, 17, 20, 19, 22]
  const dates = values.map((_, i) => `2026-09-${String(i + 1).padStart(2, "0")}`)
  const geo = buildSketchGeometry({
    figure: "canal",
    values,
    dates,
    from: 1,
    to: 8,
    fromActual: 12,
    toActual: 17,
    via: 4,
    viaActual: 4,
  })
  assert.ok(geo.band)
  assert.equal(geo.band.slopeBias, "up")
  assert.ok((geo.band.height ?? 0) > 0)
  assert.ok(geo.band.target != null)
  const atVia =
    geo.band.lower.find((point) => point.index === 4)?.actual ??
    geo.band.upper.find((point) => point.index === 4)?.actual
  assert.ok(atVia != null)
  assert.ok(Math.abs(atVia - 4) < 1e-6)
  const reading = readWindow(values, dates, 1, 8, geo.band)
  assert.equal(reading?.figure, "canal")
  assert.equal(reading?.label, "Canal haussier")
})

test("capture payload keeps rails, height, slope and target", () => {
  const dates = Array.from({ length: 8 }, (_, i) => `2026-10-${String(i + 1).padStart(2, "0")}`)
  const sketch: ChartSketch = {
    id: "rail-1",
    host: "evolution",
    figure: "canal",
    seriesKey: "sumNumbers",
    seriesLabel: "Somme",
    start: {
      index: 0,
      date: dates[0],
      seriesKey: "sumNumbers",
      actual: 10,
      snapped: true,
      kind: "extrema",
    },
    mid: {
      index: 3,
      date: dates[3],
      seriesKey: "sumNumbers",
      actual: 13,
      snapped: true,
      kind: "extrema",
    },
    end: {
      index: 7,
      date: dates[7],
      seriesKey: "sumNumbers",
      actual: 4,
      snapped: true,
      kind: "extrema",
    },
    points: dates.map((date, index) => ({ index, date, actual: 10 + index })),
    band: {
      upper: dates.map((date, index) => ({ index, date, actual: 20 + index })),
      lower: dates.map((date, index) => ({ index, date, actual: 4 + index })),
      median: dates.map((date, index) => ({ index, date, actual: 12 + index })),
      height: 16,
      slopeBias: "up",
      target: 36,
    },
    showMedian: true,
    reading: { figure: "canal", label: "Canal haussier", confidence: 0.8 },
    createdAt: "2026-10-21T00:00:00.000Z",
  }
  const compact = compactSketch(sketch)
  assert.equal(compact.figureLabel, "Canal haussier")
  assert.equal(compact.mid?.index, 3)
  assert.equal(compact.touches?.length, 3)
  assert.equal(compact.band?.height, 16)
  assert.equal(compact.band?.slopeBias, "up")
  assert.equal(compact.band?.target, 36)
  const lines = drawingSummaryLines([sketch])
  assert.ok(lines[0].includes("pente haussière"))
  assert.ok(lines[0].includes("objectif"))
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

test("evolution chart wires handle pickup and rebuild", () => {
  const chart = readFileSync(new URL("../src/components/draw-chart.tsx", import.meta.url), "utf8")
  const help = readFileSync(
    new URL("../src/components/chart-draw/sketch-toolbar.tsx", import.meta.url),
    "utf8"
  )
  assert.match(chart, /moveSketchHandle/)
  assert.match(chart, /nearestSketchHandle/)
  assert.match(chart, /beginMove/)
  assert.match(chart, /commitMove/)
  assert.match(chart, /handle === "mid"/)
  assert.match(help, /reprendre/)
})

test("moving a free-handle rebuilds the straight segment", () => {
  const values = [5, 6, 7, 8, 9, 10, 11, 12, 11, 10]
  const dates = values.map((_, i) => `2026-02-${String(i + 1).padStart(2, "0")}`)
  const sketch: ChartSketch = {
    id: "move-1",
    host: "evolution",
    figure: FREE_FIGURE,
    seriesKey: "sumNumbers",
    seriesLabel: "Somme",
    start: {
      index: 1,
      date: dates[1],
      seriesKey: "sumNumbers",
      actual: 6,
      snapped: true,
      kind: "sample",
    },
    end: {
      index: 8,
      date: dates[8],
      seriesKey: "sumNumbers",
      actual: 40,
      snapped: false,
      kind: "free",
    },
    points: buildSketchPoints({
      figure: FREE_FIGURE,
      values,
      dates,
      from: 1,
      to: 8,
      fromActual: 6,
      toActual: 40,
    }),
    reading: null,
    createdAt: "2026-02-10T00:00:00.000Z",
  }
  const movedEnd = moveSketchHandle(
    sketch,
    "end",
    liveToAnchor({
      index: 9,
      date: dates[9],
      seriesKey: "n1",
      actual: 22,
      snapped: true,
      kind: "sample",
    }),
    values,
    dates
  )
  assert.ok(movedEnd)
  assert.equal(movedEnd.id, "move-1")
  assert.equal(movedEnd.start.index, 1)
  assert.equal(movedEnd.start.actual, 6)
  assert.equal(movedEnd.end.index, 9)
  assert.equal(movedEnd.end.actual, 22)
  assert.equal(movedEnd.end.seriesKey, "sumNumbers")
  assert.equal(movedEnd.points[0].actual, 6)
  assert.equal(movedEnd.points.at(-1)?.actual, 22)
  const expected = 6 + (22 - 6) * (3 / 8)
  assert.ok(Math.abs(movedEnd.points[3].actual - expected) < 1e-9)

  const movedStart = sketchWithMovedHandle(
    sketch,
    "start",
    {
      index: 0,
      date: dates[0],
      seriesKey: "sumNumbers",
      actual: 5,
      snapped: true,
      kind: "sample",
    },
    values,
    dates
  )
  assert.equal(movedStart.start.index, 0)
  assert.equal(movedStart.end.actual, 40)
  assert.equal(movedStart.points.at(-1)?.actual, 40)

  assert.equal(
    moveSketchHandle(
      sketch,
      "end",
      {
        index: 3,
        date: dates[3],
        seriesKey: "sumNumbers",
        actual: 8,
        snapped: true,
        kind: "sample",
      },
      values,
      dates
    ),
    null
  )
})

test("moving a rail handle rebuilds parallels through the opposite contact", () => {
  const values = [10, 12, 11, 14, 13, 16, 15, 18, 17, 20, 19, 22]
  const dates = values.map((_, i) => `2026-09-${String(i + 1).padStart(2, "0")}`)
  const geo = buildSketchGeometry({
    figure: "canal",
    values,
    dates,
    from: 1,
    to: 8,
    fromActual: 12,
    toActual: 17,
    via: 4,
    viaActual: 4,
  })
  const sketch: ChartSketch = {
    id: "rail-move",
    host: "evolution",
    figure: "canal",
    seriesKey: "sumNumbers",
    seriesLabel: "Somme",
    start: {
      index: 1,
      date: dates[1],
      seriesKey: "sumNumbers",
      actual: 12,
      snapped: true,
      kind: "extrema",
    },
    mid: {
      index: 8,
      date: dates[8],
      seriesKey: "sumNumbers",
      actual: 17,
      snapped: true,
      kind: "extrema",
    },
    end: {
      index: 4,
      date: dates[4],
      seriesKey: "sumNumbers",
      actual: 4,
      snapped: true,
      kind: "extrema",
    },
    points: geo.points,
    band: geo.band,
    reading: null,
    createdAt: "2026-09-18T00:00:00.000Z",
  }
  const movedEnd = moveSketchHandle(
    sketch,
    "end",
    liveToAnchor({
      index: 5,
      date: dates[5],
      seriesKey: "n1",
      actual: 3,
      snapped: true,
      kind: "extrema",
    }),
    values,
    dates
  )
  assert.ok(movedEnd)
  assert.equal(movedEnd.start.index, 1)
  assert.equal(movedEnd.mid?.index, 8)
  assert.equal(movedEnd.end.index, 5)
  assert.equal(movedEnd.end.actual, 3)
  assert.equal(movedEnd.end.seriesKey, "sumNumbers")
  const atVia =
    movedEnd.band?.lower.find((point) => point.index === 5)?.actual ??
    movedEnd.band?.upper.find((point) => point.index === 5)?.actual
  assert.ok(atVia != null)
  assert.ok(Math.abs((atVia ?? 0) - 3) < 1e-6)

  const movedMid = moveSketchHandle(
    sketch,
    "mid",
    {
      index: 9,
      date: dates[9],
      seriesKey: "sumNumbers",
      actual: 20,
      snapped: true,
      kind: "sample",
    },
    values,
    dates
  )
  assert.ok(movedMid)
  assert.equal(movedMid.mid?.index, 9)
  assert.equal(movedMid.end.index, 4)

  assert.equal(
    moveSketchHandle(
      sketch,
      "start",
      {
        index: 7,
        date: dates[7],
        seriesKey: "sumNumbers",
        actual: 18,
        snapped: true,
        kind: "sample",
      },
      values,
      dates
    ),
    null
  )
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

test("detached HUD stays inside the viewport and never follows a cursor", () => {
  const inside = clampHudPosition({
    x: 40,
    y: 80,
    width: 200,
    height: 120,
    viewW: 800,
    viewH: 600,
  })
  assert.deepEqual(inside, { x: 40, y: 80 })
  const overflow = clampHudPosition({
    x: 900,
    y: 700,
    width: 200,
    height: 120,
    viewW: 800,
    viewH: 600,
    pad: 8,
  })
  assert.equal(overflow.x, 800 - 200 - 8)
  assert.equal(overflow.y, 600 - 120 - 8)
  const negative = clampHudPosition({
    x: -40,
    y: -10,
    width: 200,
    height: 120,
    viewW: 800,
    viewH: 600,
    pad: 8,
  })
  assert.deepEqual(negative, { x: 8, y: 8 })
})
