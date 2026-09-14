import assert from "node:assert/strict"
import test from "node:test"

import {
  CAPTURE_MAX_HEIGHT,
  CHART_PAD,
  intersectViewport,
  preferredCrop,
  rectsIntersect,
  relativeRect,
  unionRect,
} from "../src/lib/capture/crop"

test("intersectViewport maps the on-screen slice into node coordinates", () => {
  const crop = intersectViewport(
    { top: -200, left: 40, right: 1040, bottom: 1800 },
    { width: 1280, height: 800 }
  )
  assert.equal(crop.x, 0)
  assert.equal(crop.y, 200)
  assert.equal(crop.width, 1000)
  assert.equal(crop.height, 800)
})

test("a chart just below the fold is pulled into the capture window", () => {
  const crop = preferredCrop({
    visible: { x: 0, y: 0, width: 1100, height: 720 },
    visuals: [{ x: 24, y: 900, width: 1040, height: 280 }],
    nodeSize: { width: 1100, height: 2200 },
  })
  assert.ok(crop.y <= 900)
  assert.ok(crop.y + crop.height >= 900 + 280)
  assert.ok(crop.height <= CAPTURE_MAX_HEIGHT)
  // Do not keep the whole page title: the curve must dominate the image.
  assert.ok(crop.y >= 700)
})

test("when scrolled onto a curve, the crop stays on that slice, not the page top", () => {
  const crop = preferredCrop({
    visible: { x: 0, y: 1600, width: 1100, height: 700 },
    visuals: [
      { x: 24, y: 400, width: 1040, height: 280 },
      { x: 24, y: 1680, width: 1040, height: 320 },
    ],
    nodeSize: { width: 1100, height: 2600 },
  })
  assert.ok(crop.y >= 1400)
  assert.ok(rectsIntersect(crop, { x: 24, y: 1680, width: 1040, height: 320 }))
  assert.ok(!rectsIntersect(crop, { x: 24, y: 400, width: 1040, height: 280 }))
})

test("if the viewport is only chrome, jump to the first chart", () => {
  const crop = preferredCrop({
    visible: { x: 0, y: 0, width: 1100, height: 700 },
    visuals: [{ x: 40, y: 2100, width: 1000, height: 300 }],
    nodeSize: { width: 1100, height: 2600 },
  })
  assert.ok(crop.y >= 2100 - 88 - CHART_PAD)
  assert.ok(rectsIntersect(crop, { x: 40, y: 2100, width: 1000, height: 300 }))
})

test("adjacent charts stay together in one crop", () => {
  const crop = preferredCrop({
    visible: { x: 0, y: 800, width: 1100, height: 700 },
    visuals: [
      { x: 24, y: 900, width: 1040, height: 280 },
      { x: 24, y: 1220, width: 1040, height: 280 },
    ],
    nodeSize: { width: 1100, height: 2200 },
  })
  assert.ok(rectsIntersect(crop, { x: 24, y: 900, width: 1040, height: 280 }))
  assert.ok(rectsIntersect(crop, { x: 24, y: 1220, width: 1040, height: 280 }))
})

test("unionRect and relativeRect keep chart offsets", () => {
  const chart = relativeRect({ top: 80, left: 20 }, { top: 400, left: 40, width: 900, height: 220 })
  assert.deepEqual(chart, { x: 20, y: 320, width: 900, height: 220 })
  const box = unionRect({ x: 0, y: 0, width: 100, height: 50 }, chart)
  assert.equal(box.x, 0)
  assert.equal(box.width, 920)
  assert.equal(box.height, 540)
})
