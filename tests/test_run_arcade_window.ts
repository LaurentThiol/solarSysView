import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

import { buildPrompt } from "../src/lib/run-arcade/prompt.ts"
import { RUN_ARCADE_HELP } from "../src/lib/run-arcade/help.ts"
import type { RunnerMind } from "../src/lib/run-arcade/thought.ts"
import { CURVE_VIEW_SPAN, curveWindow, slideByPointer, windowDraws } from "../src/lib/run-arcade/window.ts"

const universe = readFileSync(new URL("../src/components/brain/run-arcade-universe.tsx", import.meta.url), "utf8")
const capture = readFileSync(new URL("../src/components/brain/run-arcade-capture.tsx", import.meta.url), "utf8")
const lab = readFileSync(new URL("../src/components/brain/run-arcade-lab.tsx", import.meta.url), "utf8")

test("a short series stays entire, on the same edges as before", () => {
  const view = curveWindow(10, null)
  assert.equal(view.sliding, false)
  assert.equal(view.x0, -0.35)
  assert.equal(view.x1, 10.6)
  assert.equal(view.steps, 0)
  const justOver = curveWindow(20, 0)
  assert.equal(justOver.sliding, false)
})

test("a long series opens on the end, twenty draws wide", () => {
  const end = curveWindow(200, null)
  assert.equal(end.sliding, true)
  assert.equal(end.x1, 200.6)
  assert.equal(end.x0, 200.6 - CURVE_VIEW_SPAN)
  assert.equal(end.start, end.steps)
  const draws = windowDraws(end.x0, end.x1, 200)
  assert.equal(draws.last, 200)
  assert.ok(draws.last - draws.first + 1 <= CURVE_VIEW_SPAN)
  assert.ok(draws.last - draws.first + 1 >= CURVE_VIEW_SPAN - 2)
})

test("the slider reaches the first draws and stays put when a draw is added", () => {
  const begin = curveWindow(200, 0)
  assert.equal(begin.x0, -0.35)
  assert.equal(begin.x1, -0.35 + CURVE_VIEW_SPAN)
  assert.deepEqual(windowDraws(begin.x0, begin.x1, 200), { first: 1, last: 20, total: 200 })
  assert.equal(curveWindow(200, -4).start, 0)
  assert.equal(curveWindow(200, 9999).start, curveWindow(200, null).steps)

  const parked = curveWindow(200, 100)
  const later = curveWindow(201, 100)
  assert.ok(Math.abs(parked.x0 - later.x0) < 0.05)
  assert.equal(curveWindow(201, null).x1, 201.6)
})

test("dragging one frame width moves about twenty draws toward the past", () => {
  const end = curveWindow(200, null)
  const plotPx = 230
  const next = slideByPointer({
    start: end.start,
    steps: end.steps,
    travel: end.travel,
    span: CURVE_VIEW_SPAN,
    dx: plotPx,
    plotPx,
  })
  const moved = curveWindow(200, next)
  assert.ok(moved.start < end.start)
  assert.ok(Math.abs(end.x0 - moved.x0 - CURVE_VIEW_SPAN) < 1.5)
  assert.equal(
    slideByPointer({ start: 4, steps: 10, travel: 10, span: 20, dx: 0, plotPx: 0 }),
    4
  )
})

test("the drawing, the capture and the help expose the slider", () => {
  assert.match(universe, /curveWindow\(/)
  assert.match(universe, /type="range"/)
  assert.match(universe, /clipPath/)
  assert.match(capture, /pan=\{false\}/)
  assert.match(lab, /Curseur : vingt tirages/)
  const curseur = RUN_ARCADE_HELP.dessin.items?.find((item) => item.label === "Curseur")
  assert.ok(curseur)
  assert.match(curseur?.text ?? "", /Vingt tirages/)
  assert.match(curseur?.text ?? "", /Au bout/)
})

test("the image note tells the model it sees the end of the curve", () => {
  const mind = { name: "R1", skills: [] } as RunnerMind
  const base = {
    mind,
    past: [],
    hiddenDate: "2026-01-01",
    examCents: null,
    notes: [],
  }
  const withDrawing = buildPrompt({ ...base, drawing: "Σn · glisse\nÀ recopier : tangente correspond" })
  assert.match(withDrawing.user, /vingt tirages au plus/)
  assert.match(withDrawing.user, /bout de la courbe/)
  const silent = buildPrompt({ ...base, drawing: null })
  assert.equal(silent.user.includes("vingt tirages"), false)
})
