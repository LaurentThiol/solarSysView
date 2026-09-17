import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const windowSrc = readFileSync(
  new URL("../src/lib/chartisme/window.ts", import.meta.url),
  "utf8"
)
const canvasSrc = readFileSync(
  new URL("../src/components/chartisme/curve-canvas.tsx", import.meta.url),
  "utf8"
)
const labSrc = readFileSync(
  new URL("../src/components/chartisme/chartisme-lab.tsx", import.meta.url),
  "utf8"
)

test("context band copy lives next to the window rule", () => {
  assert.match(windowSrc, /export function startsInContext/)
  assert.match(windowSrc, /contexte · \$\{count\} tirage/)
})

test("the canvas splits the curve at the study boundary", () => {
  assert.match(canvasSrc, /contextBandLabel/)
  assert.match(canvasSrc, />\s*étude\s*</)
  assert.match(canvasSrc, /polylinePoints\(values, 0, splitAt/)
  assert.match(canvasSrc, /index < splitAt \? 0\.16 : 0\.45/)
  assert.match(canvasSrc, /dates\[splitAt\]/)
})

test("a straddling figure is badged in the lab", () => {
  assert.match(labSrc, /commence dans le contexte/)
  assert.match(labSrc, /startsInContext/)
})
