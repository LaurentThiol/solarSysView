import assert from "node:assert/strict"
import test from "node:test"

import { localDay, missingDrawDates } from "../src/lib/nextdata/archive.ts"

test("an archive up to the last draw is not stale", () => {
  assert.deepEqual(missingDrawDates("2026-10-27", "2026-10-28"), [])
  assert.deepEqual(missingDrawDates("2026-10-23", "2026-10-27"), [])
})

test("tonight's draw is not missing yet, last night's is", () => {
  assert.deepEqual(missingDrawDates("2026-10-27", "2026-10-30"), [])
  assert.deepEqual(missingDrawDates("2026-10-27", "2026-10-31"), ["2026-10-30"])
  assert.deepEqual(missingDrawDates("2026-10-23", "2026-10-28"), ["2026-10-27"])
})

test("every Tuesday and Friday after the last draw is listed", () => {
  assert.deepEqual(missingDrawDates("2026-10-02", "2026-10-28"), [
    "2026-10-06",
    "2026-10-09",
    "2026-10-13",
    "2026-10-16",
    "2026-10-20",
    "2026-10-23",
    "2026-10-27",
  ])
})

test("a missing or malformed date reports nothing", () => {
  assert.deepEqual(missingDrawDates(undefined, "2026-10-28"), [])
  assert.deepEqual(missingDrawDates("hier", "2026-10-28"), [])
  assert.deepEqual(missingDrawDates("2026-10-02", "demain"), [])
})

test("the local day is written year-month-day", () => {
  assert.equal(localDay(new Date(2026, 0, 5, 23, 59)), "2026-01-05")
})
