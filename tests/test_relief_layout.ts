import assert from "node:assert/strict"
import test from "node:test"

import { labFromPath, labLabel } from "../src/lib/capture/snapshot"
import { suggestionsFor } from "../src/lib/capture/suggestions"
import type { Draw } from "../src/lib/draws"
import { hilbertOrderFor, hilbertXY } from "../src/lib/relief/hilbert"
import {
  GOLDEN_ANGLE,
  layoutDraws,
  markerRadius,
  recommendedMarker,
  recommendedOffset,
  type OffsetMode,
} from "../src/lib/relief/layout"
import { heightColor } from "../src/lib/relief/color"
import { rasterizePeaks } from "../src/lib/relief/heightmap"
import {
  autoExaggeration,
  clampCamera,
  DEFAULT_CAMERA,
  ZOOM_MAX,
  fitScale,
  focusPoint,
  homeZoom,
  projectPoint,
  zoomToward,
} from "../src/lib/relief/project"
import { buildStampMap } from "../src/lib/relief/stamps"
import {
  axisConnected,
  buildProfiles,
  profileBounds,
  profileFitBounds,
  profilePaintKey,
  ranksOf,
  rankTimeLinks,
  rankTimePatches,
  rankTimePatchAlpha,
  rankTimePatchShade,
  pointInQuad,
  mixRgb,
} from "../src/lib/relief/profiles"

function draw(i: number): Draw {
  const date = new Date(Date.UTC(2024, 0, 1 + i)).toISOString().slice(0, 10)
  const base = (i * 7) % 46
  return {
    id: i + 1,
    date,
    weekday: i % 2 ? "mardi" : "vendredi",
    numbers: [base + 1, base + 2, base + 3, base + 4, base + 5],
    stars: [1 + (i % 12), 1 + ((i + 3) % 12)],
  }
}

function draws(n: number) {
  return Array.from({ length: n }, (_, i) => draw(i))
}

function minDist(points: Array<{ x: number; z: number }>) {
  let best = Infinity
  for (let i = 0; i < points.length; i += 1) {
    for (let j = i + 1; j < points.length; j += 1) {
      const d = Math.hypot(points[i].x - points[j].x, points[i].z - points[j].z)
      if (d > 1e-9 && d < best) best = d
    }
  }
  return best
}

test("Hilbert covers the square without duplicates", () => {
  const order = 3
  const n = 1 << order
  const seen = new Set<string>()
  for (let d = 0; d < n * n; d += 1) {
    const [x, y] = hilbertXY(order, d)
    assert.ok(x >= 0 && x < n && y >= 0 && y < n)
    seen.add(`${x},${y}`)
  }
  assert.equal(seen.size, n * n)
  assert.equal(hilbertOrderFor(200), 4)
})

test("angle d'or packs 50 origins with a stable minimum distance", () => {
  const layout = layoutDraws(draws(50), {
    mode: "or",
    height: "presence",
    fusion: 0.55,
    stars: false,
  })
  assert.equal(layout.anchors.length, 50)
  assert.equal(layout.peaks.length, 250)
  const d = minDist(layout.anchors)
  assert.ok(d > 0.4, `min dist ${d}`)
  assert.ok(Math.abs(GOLDEN_ANGLE - Math.PI * (3 - Math.sqrt(5))) < 1e-12)
})

test("hex and Hilbert keep consecutive draws as neighbours", () => {
  const hex = layoutDraws(draws(20), { mode: "hex", height: "presence", fusion: 0.5, stars: false })
  const hilbert = layoutDraws(draws(16), {
    mode: "hilbert",
    height: "presence",
    fusion: 0.5,
    stars: false,
  })
  const hexStep = Math.hypot(
    hex.anchors[1].x - hex.anchors[0].x,
    hex.anchors[1].z - hex.anchors[0].z
  )
  const hilbertStep = Math.hypot(
    hilbert.anchors[1].x - hilbert.anchors[0].x,
    hilbert.anchors[1].z - hilbert.anchors[0].z
  )
  assert.ok(hexStep > 0.5)
  assert.ok(hilbertStep > 0.5)
  assert.ok(Math.abs(hexStep - minDist(hex.anchors)) < 1e-6)
})

test("temps advances along z, superpose stacks at the origin", () => {
  const temps = layoutDraws(draws(8), { mode: "temps", height: "presence", fusion: 0.4, stars: false })
  const stack = layoutDraws(draws(8), {
    mode: "superpose",
    height: "presence",
    fusion: 0.4,
    stars: false,
  })
  assert.ok(temps.anchors[7].z > temps.anchors[0].z)
  assert.equal(stack.anchors.every((a) => a.x === 0 && a.z === 0), true)
})

test("fusion enlarges glyphs relative to spacing", () => {
  const low = layoutDraws(draws(30), { mode: "or", height: "mixte", fusion: 0.15, stars: false })
  const high = layoutDraws(draws(30), { mode: "or", height: "mixte", fusion: 0.9, stars: false })
  assert.ok(high.glyphScale > low.glyphScale)
})

test("recommended offset is time for every sample", () => {
  assert.equal(recommendedOffset(20), "temps")
  assert.equal(recommendedOffset(50), "temps")
  assert.equal(recommendedOffset(200), "temps")
})

test("heightmap splat peaks at the ball and colors climb with height", () => {
  const layout = layoutDraws(draws(20), {
    mode: "superpose",
    height: "presence",
    fusion: 0.3,
    stars: false,
  })
  const field = rasterizePeaks(layout.peaks, layout.anchors, 0.3, true)
  assert.ok(field.maxH > 0)
  assert.ok(field.cols >= 36 && field.rows >= 36)
  const low = heightColor(0)
  const high = heightColor(1)
  assert.ok(low[0] + low[1] + low[2] < high[0] + high[1] + high[2])
})

test("auto exaggeration lifts a flat field to a readable fraction of the span", () => {
  const y = autoExaggeration(1, 20, 20, 1)
  assert.ok(y > 5)
  assert.ok(Math.abs(y - 0.36 * 20) < 1e-9)
})

test("camera projects and clamp keeps pitch / zoom in range", () => {
  const a = projectPoint(0, 0, 0, DEFAULT_CAMERA, 200, 200, 40)
  const b = projectPoint(1, 0, 0, DEFAULT_CAMERA, 200, 200, 40)
  assert.ok(Math.hypot(a.x - b.x, a.y - b.y) > 1)
  const cam = clampCamera({ yaw: 12, pitch: 8, zoom: 99 })
  assert.ok(cam.pitch <= 1.22)
  assert.ok(cam.zoom <= ZOOM_MAX)
  assert.equal(cam.panX, 0)
  assert.equal(cam.panY, 0)
})

test("relief is a first-class lab for capture / IA", () => {
  assert.equal(labFromPath("/relief"), "relief")
  assert.equal(labLabel("relief"), "Relief")
  const tips = suggestionsFor("relief")
  assert.ok(tips.some((t) => t.toLowerCase().includes("hauteur") || t.toLowerCase().includes("décalage")))
})

test("stamp map keeps one 5×10 plate per draw with five numbered cells", () => {
  const layout = layoutDraws(draws(20), { mode: "hex", height: "mixte", fusion: 0.4, stars: false })
  const map = buildStampMap(layout)
  assert.equal(map.stamps.length, 20)
  assert.equal(map.aggregated, false)
  for (const stamp of map.stamps) {
    assert.equal(stamp.cells.length, 5)
    const nums = new Set(stamp.cells.map((c) => c.n))
    assert.equal(nums.size, 5)
    for (const n of stamp.numbers) assert.ok(nums.has(n))
  }
  assert.equal(map.stamps.filter((s) => s.latest).length, 1)
})

test("superpose stamp is a single histogram board", () => {
  const layout = layoutDraws(draws(8), {
    mode: "superpose",
    height: "presence",
    fusion: 0.3,
    stars: false,
  })
  const map = buildStampMap(layout)
  assert.equal(map.stamps.length, 1)
  assert.equal(map.aggregated, true)
  assert.ok(map.stamps[0].cells.length >= 5)
  assert.ok(map.maxH >= 1)
})

test("every offset mode lays out 100 draws", () => {
  const modes: OffsetMode[] = ["or", "hex", "hilbert", "temps", "stat", "superpose"]
  for (const mode of modes) {
    const layout = layoutDraws(draws(100), { mode, height: "mixte", fusion: 0.58, stars: true })
    assert.equal(layout.anchors.length, 100, mode)
    assert.equal(layout.peaks.length, 700, mode)
  }
})

test("ranksOf sorts the five balls n1 to n5", () => {
  assert.deepEqual(ranksOf([41, 7, 28, 12, 19]), [7, 12, 19, 28, 41])
})

test("each draw profile is a 5-point n1→n5 line, time advances along z", () => {
  const layout = layoutDraws(draws(8), { mode: "temps", height: "valeur", fusion: 0.4, stars: false })
  const map = buildProfiles(layout)
  assert.equal(map.profiles.length, 8)
  assert.equal(axisConnected("temps"), true)
  assert.equal(map.connected, true)
  for (const profile of map.profiles) {
    assert.equal(profile.points.length, 5)
    assert.deepEqual(
      profile.points.map((p) => p.x),
      [0, 1, 2, 3, 4]
    )
    for (let i = 1; i < 5; i++) {
      assert.ok(profile.ranks[i] >= profile.ranks[i - 1])
      assert.ok(profile.points[i].y >= profile.points[i - 1].y)
    }
  }
  assert.ok(map.profiles[7].points[0].z > map.profiles[0].points[0].z)
  assert.equal(map.profiles.filter((p) => p.latest).length, 1)
})

test("superpose stacks every n1→n5 profile on z = 0", () => {
  const layout = layoutDraws(draws(6), {
    mode: "superpose",
    height: "valeur",
    fusion: 0.3,
    stars: false,
  })
  const map = buildProfiles(layout)
  assert.equal(map.connected, true)
  assert.equal(
    map.profiles.every((p) => p.points.every((pt) => pt.z === 0 && pt.x >= 0 && pt.x <= 4)),
    true
  )
})

test("hex offset keeps a 5-point comb at each draw, not a 5×10 grid", () => {
  const layout = layoutDraws(draws(12), { mode: "hex", height: "valeur", fusion: 0.4, stars: false })
  const map = buildProfiles(layout)
  assert.equal(map.connected, false)
  assert.equal(map.profiles.length, 12)
  for (const profile of map.profiles) {
    assert.equal(profile.points.length, 5)
    const zs = new Set(profile.points.map((p) => p.z))
    assert.equal(zs.size, 1)
  }
})

test("rank-time links join the same order statistic across consecutive draws", () => {
  const layout = layoutDraws(draws(8), { mode: "temps", height: "valeur", fusion: 0.4, stars: false })
  const map = buildProfiles(layout)
  const links = rankTimeLinks(map)
  assert.equal(links.length, 7 * 5)
  const n1 = links.filter((l) => l.rank === 0)
  assert.equal(n1.length, 7)
  for (const link of n1) {
    assert.equal(link.ax, 0)
    assert.equal(link.bx, 0)
    assert.ok(link.bz > link.az)
    assert.equal(link.toIndex, link.fromIndex + 1)
  }
})

test("rank-time patches fill the four bands between consecutive draws", () => {
  const layout = layoutDraws(draws(8), { mode: "temps", height: "valeur", fusion: 0.4, stars: false })
  const map = buildProfiles(layout)
  const patches = rankTimePatches(map)
  assert.equal(patches.length, 7 * 4)
  const first = patches[0]
  assert.equal(first.band, 0)
  assert.equal(first.fromIndex, 0)
  assert.equal(first.toIndex, 1)
  assert.equal(first.a.x, 0)
  assert.equal(first.b.x, 1)
  assert.equal(first.c.x, 1)
  assert.equal(first.d.x, 0)
  assert.ok(first.c.z > first.a.z)
  assert.equal(first.a.y, map.profiles[0].points[0].y)
  assert.equal(first.b.y, map.profiles[0].points[1].y)
  const bands = new Set(patches.map((p) => p.band))
  assert.deepEqual([...bands].sort(), [0, 1, 2, 3])
})

test("hex rank-time patches still follow consecutive draw indices", () => {
  const layout = layoutDraws(draws(12), { mode: "hex", height: "valeur", fusion: 0.4, stars: false })
  const map = buildProfiles(layout)
  const patches = rankTimePatches(map)
  assert.equal(patches.length, 11 * 4)
  for (const patch of patches) {
    assert.equal(patch.toIndex, patch.fromIndex + 1)
  }
})

test("rank-time fill alpha rises on hover and falls on dense samples", () => {
  const quiet = rankTimePatchAlpha(20, 18, 19, null)
  const hot = rankTimePatchAlpha(20, 18, 19, 19)
  const dense = rankTimePatchAlpha(200, 198, 199, null)
  assert.ok(hot > quiet)
  assert.ok(dense < quiet)
  assert.ok(hot <= 0.4)
  assert.ok(quiet > 0.05)
})

test("flat time patch faces the light from above", () => {
  const shade = rankTimePatchShade({
    band: 0,
    fromIndex: 0,
    toIndex: 1,
    a: { x: 0, y: 1, z: 0 },
    b: { x: 1, y: 1, z: 0 },
    c: { x: 1, y: 1, z: 1 },
    d: { x: 0, y: 1, z: 1 },
  })
  assert.ok(shade > 0.85, `shade ${shade}`)
  assert.ok(shade <= 1)
})

test("pointInQuad hits the interior of a screen quad", () => {
  const quad = {
    a: { x: 0, y: 0 },
    b: { x: 10, y: 0 },
    c: { x: 10, y: 8 },
    d: { x: 0, y: 8 },
  }
  assert.equal(pointInQuad(5, 4, quad.a, quad.b, quad.c, quad.d), true)
  assert.equal(pointInQuad(20, 4, quad.a, quad.b, quad.c, quad.d), false)
  const mixed = mixRgb([0, 0, 0], [10, 20, 40], 0.5)
  assert.deepEqual(mixed, [5, 10, 20])
})

function gapZ(map: ReturnType<typeof buildProfiles>) {
  return map.profiles[1].points[0].z - map.profiles[0].points[0].z
}

test("écarter les tirages spreads consecutive profiles along time", () => {
  const packed = buildProfiles(
    layoutDraws(draws(20), { mode: "temps", height: "valeur", fusion: 0, stars: false })
  )
  const spread = buildProfiles(
    layoutDraws(draws(20), { mode: "temps", height: "valeur", fusion: 1, stars: false })
  )
  assert.ok(gapZ(spread) > gapZ(packed) * 2)
  assert.notEqual(profilePaintKey(packed), profilePaintKey(spread))
})

test("écarter stays visible because the camera frame does not follow the gap", () => {
  const packed = buildProfiles(
    layoutDraws(draws(20), { mode: "temps", height: "valeur", fusion: 0, stars: false })
  )
  const spread = buildProfiles(
    layoutDraws(draws(20), { mode: "temps", height: "valeur", fusion: 1, stars: false })
  )
  const fitP = profileFitBounds(packed, false)
  const fitS = profileFitBounds(spread, false)
  assert.ok(Math.abs(fitP.maxZ - fitP.minZ - (fitS.maxZ - fitS.minZ)) < 1e-9)
  const scaleP = fitScale(fitP.minX, fitP.maxX, fitP.minZ, fitP.maxZ, 800, 500)
  const scaleS = fitScale(fitS.minX, fitS.maxX, fitS.minZ, fitS.maxZ, 800, 500)
  assert.ok(Math.abs(scaleP - scaleS) < 1e-9)
  assert.ok(gapZ(spread) * scaleS > gapZ(packed) * scaleP * 2)

  const actualP = profileBounds(packed, false)
  const actualS = profileBounds(spread, false)
  const naiveP = fitScale(actualP.minX, actualP.maxX, actualP.minZ, actualP.maxZ, 800, 500)
  const naiveS = fitScale(actualS.minX, actualS.maxX, actualS.minZ, actualS.maxZ, 800, 500)
  const naiveRatio = (gapZ(spread) * naiveS) / (gapZ(packed) * naiveP)
  assert.ok(naiveRatio < 1.25, `auto-fit on actual bounds still hides the slider (${naiveRatio})`)
})

test("écarter spreads hex combs on the lattice", () => {
  const packed = buildProfiles(
    layoutDraws(draws(20), { mode: "hex", height: "valeur", fusion: 0, stars: false })
  )
  const spread = buildProfiles(
    layoutDraws(draws(20), { mode: "hex", height: "valeur", fusion: 1, stars: false })
  )
  const dist = (map: ReturnType<typeof buildProfiles>) =>
    Math.hypot(
      map.profiles[1].points[2].x - map.profiles[0].points[2].x,
      map.profiles[1].points[2].z - map.profiles[0].points[2].z
    )
  assert.ok(dist(spread) > dist(packed) * 1.4)
})

test("dense samples prefer point markers, balls stay larger", () => {
  assert.equal(recommendedMarker(20), "boule")
  assert.equal(recommendedMarker(50), "boule")
  assert.equal(recommendedMarker(100), "point")
  assert.equal(recommendedMarker(200), "point")
  const ball = markerRadius("boule", 200, 0.5, false)
  const dot = markerRadius("point", 200, 0.5, false)
  assert.ok(dot < 1.5)
  assert.ok(ball > dot * 1.6)
})

test("home zoom and max zoom get closer on 200 draws than on 20", () => {
  assert.equal(homeZoom(20), 1)
  assert.ok(homeZoom(200) > homeZoom(100))
  assert.ok(homeZoom(100) > homeZoom(20))
  assert.ok(ZOOM_MAX >= 12)
  const zoomed = clampCamera({ yaw: 0, pitch: 0.7, zoom: 12 })
  assert.equal(zoomed.zoom, 12)
})

test("fitScale keeps n1→n5 readable on a 200-draw time series", () => {
  const layout = layoutDraws(draws(200), { mode: "temps", height: "valeur", fusion: 0.42, stars: false })
  const map = buildProfiles(layout)
  const box = profileBounds(map, false)
  const spanX = box.maxX - box.minX
  const spanZ = box.maxZ - box.minZ
  const packed = Math.min((0.86 * 1000) / spanX, (0.78 * 500) / spanZ)
  const scale = fitScale(box.minX, box.maxX, box.minZ, box.maxZ, 1000, 500)
  assert.ok(scale > packed * 3, `scale ${scale} vs packed ${packed}`)
  assert.ok(4 * scale > 36, `n1→n5 is only ${4 * scale}px`)
  const compact = layoutDraws(draws(20), { mode: "temps", height: "valeur", fusion: 0.42, stars: false })
  const compactBox = profileBounds(buildProfiles(compact), false)
  const compactPacked = Math.min(
    (0.86 * 1000) / (compactBox.maxX - compactBox.minX),
    (0.78 * 500) / (compactBox.maxZ - compactBox.minZ)
  )
  const compactScale = fitScale(
    compactBox.minX,
    compactBox.maxX,
    compactBox.minZ,
    compactBox.maxZ,
    1000,
    500
  )
  assert.ok(Math.abs(compactScale - compactPacked) < 1e-9)
  const mid = layoutDraws(draws(80), { mode: "temps", height: "valeur", fusion: 0.42, stars: false })
  const midBox = profileBounds(buildProfiles(mid), false)
  const midPacked = Math.min(
    (0.86 * 1000) / (midBox.maxX - midBox.minX),
    (0.78 * 500) / (midBox.maxZ - midBox.minZ)
  )
  const midScale = fitScale(midBox.minX, midBox.maxX, midBox.minZ, midBox.maxZ, 1000, 500)
  assert.ok(midScale > midPacked * 1.8, `80-draw scale ${midScale} vs packed ${midPacked}`)
})

test("focusPoint frames the newest slice when time overflows", () => {
  const look = focusPoint(0, 5.7, 0, 190, 10, 500)
  assert.ok(look.midZ > 95, `midZ ${look.midZ}`)
  assert.ok(look.midZ < 190)
  const whole = focusPoint(0, 5.7, 0, 20, 20, 500)
  assert.ok(Math.abs(whole.midZ - 10) < 1e-6)
})

test("zoomToward keeps the cursor anchored and raises zoom past the old 2.8 cap", () => {
  const cam = zoomToward({ yaw: 0.6, pitch: 0.7, zoom: 1, panX: 0, panY: 0 }, 4, 400, 200, 500, 300)
  assert.ok(cam.zoom > 2.8)
  assert.ok(cam.zoom <= 4 + 1e-9)
  assert.ok(cam.panX !== 0 || cam.panY !== 0)
})
