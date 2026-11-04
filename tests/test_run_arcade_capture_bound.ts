import assert from "node:assert/strict"
import test from "node:test"

import {
  CAPTURE_DRAW_TIMEOUT_MS,
  releaseCaptureSlot,
  tryCaptureSlot,
  waitBounded,
} from "../src/lib/run-arcade/capture-bound.ts"

test("a capture that never gets its frames is bounded and renders null", async () => {
  assert.equal(CAPTURE_DRAW_TIMEOUT_MS, 4_000)
  const never = new Promise<string>(() => {})
  const started = Date.now()
  assert.equal(await waitBounded(never, 20), null)
  assert.ok(Date.now() - started < 1_000)
  assert.equal(await waitBounded(Promise.resolve("image"), 1_000), "image")
})

test("at most one capture waits at a time", () => {
  assert.equal(tryCaptureSlot(), true)
  assert.equal(tryCaptureSlot(), false, "une seconde capture ne s’empile pas")
  releaseCaptureSlot()
  assert.equal(tryCaptureSlot(), true)
  releaseCaptureSlot()
})
