import assert from "node:assert/strict"
import test from "node:test"

import { BRAIN_CATALOG, catalogCollisions, catalogEntry } from "../src/lib/brain/catalog"
import { parseHandle, parseHandlesInText } from "../src/lib/brain/handles"
import { cosine } from "../src/lib/brain/retrieve"
import { objectsEqualPrompt, packWorkingSet } from "../src/lib/brain/working-set"
import { catalogJobs, curveJobs } from "../src/lib/brain/walker"
import { curveSpecs } from "../src/lib/chartisme/curves"
import { labFromPath, labLabel } from "../src/lib/capture/snapshot"
import { suggestionsFor } from "../src/lib/capture/suggestions"
import type { WorkingObject } from "../src/lib/brain/types"

test("handles parse @rsi, @sum.rsi, @delay:7.rsi, @ete alias, citation", () => {
  const rsi = parseHandle("@rsi")
  assert.equal(rsi.error, null)
  assert.equal(rsi.entry?.id, "analyse/rsi")
  assert.equal(rsi.variable, "sum")

  const sum = parseHandle("@sum.rsi")
  assert.equal(sum.error, null)
  assert.equal(sum.entry?.handle, "rsi")
  assert.equal(sum.variable, "sum")

  const delay = parseHandle("@delay:7.rsi")
  assert.equal(delay.error, null)
  assert.equal(delay.entry?.handle, "rsi")
  assert.equal(delay.variable, "delay")
  assert.equal(delay.n, 7)

  const ete = parseHandle("@hs")
  assert.equal(ete.error, null)
  assert.equal(ete.entry?.id, "chartisme/ete")

  const cited = parseHandle("@rsi#1842")
  assert.equal(cited.readingId, 1842)

  const found = parseHandlesInText("voir @fft et @cluster")
  assert.equal(found.length, 2)
  assert.equal(found[0].entry?.id, "harmo/fft")
  assert.equal(found[1].entry?.id, "morpho/cluster")
})

test("@spread is ambiguous until the active lab or a prefix is given", () => {
  const raw = parseHandle("@spread")
  assert.equal(raw.entry, null)
  assert.ok(raw.ambiguous.length > 1)
  assert.match(raw.error || "", /ambigu/)

  const analyse = parseHandle("@spread", { activeLab: "analyse" })
  assert.equal(analyse.entry?.id, "analyse/var/spread")

  const morpho = parseHandle("@morpho.spread")
  assert.equal(morpho.entry?.id, "morpho/spread")
})

test("no two catalog entries share a handle or alias in the same lab", () => {
  assert.deepEqual(catalogCollisions(), [])
  assert.ok(catalogEntry("analyse/rsi"))
  assert.ok(catalogEntry("chartisme/ete"))
})

test("catalog ids are unique (React list keys)", () => {
  const ids = BRAIN_CATALOG.map((entry) => entry.id)
  assert.equal(ids.length, new Set(ids).size)
  assert.equal(ids.filter((id) => id === "morpho/top").length, 1)
})

test("working set ids match the JSON sent in the prompt pack", () => {
  const objects: WorkingObject[] = [
    { kind: "pin", id: "analyse/rsi", handle: "@rsi", label: "RSI", inPrompt: true, summary: "RSI 72" },
    { kind: "memory", id: "mem-1", handle: "@rsi#9", label: "souvenir", inPrompt: true, summary: "note" },
    { kind: "current", id: "running", handle: "@macd", label: "en cours", inPrompt: false, summary: "skip" },
  ]
  const packed = packWorkingSet(objects)
  assert.equal(packed.lab, "brain")
  assert.ok(objectsEqualPrompt(objects, packed))
  const sent = (packed.tech as { objects: Array<{ id: string }> }).objects
  assert.deepEqual(
    sent.map((item) => item.id),
    ["analyse/rsi", "mem-1"]
  )
})

test("walker catalog jobs cover the catalog; curve jobs cover the 142 curves", () => {
  const catalog = catalogJobs()
  assert.ok(catalog.length >= 40)
  assert.ok(catalog.some((job) => job.handle === "@rsi"))
  const curves = curveJobs()
  assert.equal(curves.length, curveSpecs().length)
  assert.equal(curves.length, 142)
})

test("cosine of identical vectors is 1; orthogonal is 0", () => {
  assert.ok(Math.abs(cosine([1, 0], [1, 0]) - 1) < 1e-9)
  assert.equal(cosine([1, 0], [0, 1]), 0)
})

test("Brain is a first-class lab in capture nav", () => {
  assert.equal(labFromPath("/brain"), "brain")
  assert.equal(labLabel("brain"), "Brain")
  assert.ok(suggestionsFor("brain").length >= 2)
})
