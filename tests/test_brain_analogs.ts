import assert from "node:assert/strict"
import test from "node:test"

import {
  analogAxesFromObjects,
  analogWorkingObjects,
  wantsAnalogs,
} from "../src/lib/brain/analogs"
import { buildFingerprintIndex } from "../src/lib/fingerprints"
import type { WorkingObject } from "../src/lib/brain/types"
import { lectureFromWorkingSet } from "../src/lib/brain/lecture"
import { BRAIN_SYSTEM_PROMPT } from "../src/lib/brain/prompt"

const DRAWS = [
  { date: "2026-01-01", numbers: [1, 2, 3, 4, 5], stars: [1, 2] },
  { date: "2026-01-02", numbers: [1, 2, 3, 4, 6], stars: [1, 2] },
  { date: "2026-01-03", numbers: [1, 2, 3, 4, 5], stars: [8, 9] },
]

function pin(handle: string, variable: "sum" | "parity" | null = "sum"): WorkingObject {
  return {
    kind: "pin",
    id: `analyse/${handle}`,
    handle: `@${handle}`,
    label: handle,
    inPrompt: true,
    summary: handle,
    fiche: {
      id: `analyse/${handle}`,
      handle,
      lab: "analyse",
      label: handle,
      units: "",
      reading: "",
      params: { variable, n: null, periodX: 14, curveId: null },
      window: { preset: "last_100", from: null, to: null, n: 3, warmup: 0, banner: "3" },
      last: {},
      flags: [],
      flagged: false,
      summary: handle,
      disclaimer: "",
    },
  }
}

test("analogs inject only when asked or when a variable handle is pinned", () => {
  assert.equal(wantsAnalogs([pin("rsi")], "Que dit @rsi ?"), false)
  assert.equal(wantsAnalogs([pin("sum")], "Que dit @sum ?"), true)
  assert.equal(wantsAnalogs([pin("rsi")], "vois @analogs"), true)
  assert.deepEqual(analogAxesFromObjects([pin("sum"), pin("parity", "parity")]), ["sum", "parity"])
  assert.equal(analogAxesFromObjects([pin("analogs")]).length > 2, true)
})

test("analog working objects carry params and deltas for the LLM", () => {
  const index = buildFingerprintIndex(DRAWS, { queryDate: "2026-01-01", axes: ["sum", "parity"], k: 2 })
  const objects = analogWorkingObjects({
    ok: true,
    axes: index.axes,
    query: index.query
      ? { date: index.query.date, numbers: index.query.numbers, stars: index.query.stars, params: index.query.params }
      : null,
    items: index.neighbors,
  })
  assert.ok(objects.some((item) => item.handle === "@analogs"))
  assert.ok(objects.some((item) => item.handle === "@analogs#2026-01-03"))
  assert.equal(objects[0]?.kind, "analog")
  const lecture = lectureFromWorkingSet(objects)
  assert.match(lecture, /Jumeaux/)
  assert.match(lecture, /@analogs#2026-01-03/)
  assert.match(BRAIN_SYSTEM_PROMPT, /@analogs/)
})
