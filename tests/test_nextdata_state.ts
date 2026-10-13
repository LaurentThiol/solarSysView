import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const lab = readFileSync(new URL("../src/components/nextdata/nextdata-lab.tsx", import.meta.url), "utf8")
const training = readFileSync(new URL("../src/components/nextdata/training-lab.tsx", import.meta.url), "utf8")
const sweep = readFileSync(new URL("../src/components/nextdata/training-sweep.tsx", import.meta.url), "utf8")
const persist = readFileSync(new URL("../src/components/nextdata/persist-panel.tsx", import.meta.url), "utf8")

test("nextData waits for the synchronized archive and invalidates stale runs", () => {
  assert.match(lab, /useDraws\("current"\)/)
  assert.match(lab, /disabled=\{running \|\| drawsLoading/)
  assert.match(lab, /runSettingsRef/)
  assert.match(lab, /setReport\(null\)/)
  assert.match(lab, /Archive synchronisée indisponible/)
})

test("training keeps partial progress visible and locks calculation settings", () => {
  assert.match(training, /useDraws\("current"\)/)
  assert.match(training, /Résultats partiels/)
  assert.match(training, /disabled=\{busy \|\| drawsLoading/)
  assert.match(training, /disabled=\{busy\}/)
  assert.match(persist, /disabled\?: boolean/)
})

test("Mega only publishes and applies a decision after every row is complete", () => {
  assert.match(sweep, /const complete = report\.progress\?\.complete === true/)
  assert.match(sweep, /disabled=\{!complete \|\| aside\}/)
  assert.match(sweep, /complete && row\.holm\?\.retained/)
})
