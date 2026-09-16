import assert from "node:assert/strict"
import test from "node:test"

import { BRAIN_CATALOG, BRAIN_PACKS, catalogCollisions, catalogEntry } from "../src/lib/brain/catalog"
import { formatHandle, parseHandle, parseHandlesInText } from "../src/lib/brain/handles"
import { BRAIN_SYSTEM_PROMPT } from "../src/lib/brain/prompt"
import { cosine } from "../src/lib/brain/retrieve"
import { objectsEqualPrompt, packWorkingSet } from "../src/lib/brain/working-set"
import { setSpecialistIndex, specialistToEntry } from "../src/lib/brain/specialists"
import { catalogJobs, curveJobs } from "../src/lib/brain/walker"
import { curveSpecs } from "../src/lib/chartisme/curves"
import { INDEPENDENCE_DISCLAIMER, labFromPath, labLabel } from "../src/lib/capture/snapshot"
import { suggestionsFor } from "../src/lib/capture/suggestions"
import { IA_SYSTEM_PROMPT } from "../src/lib/ia/prompt"
import { DEMO_HANDLES, DEMO_LAB_FOR, demoEntries, demoJobs, demoLabsCovered, demoWantsStart } from "../src/lib/brain/demo"
import { lectureFromWorkingSet } from "../src/lib/brain/lecture"
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

test("Brain and IA prompts allow a forecast as an hypothesis, they do not refuse it", () => {
  for (const prompt of [BRAIN_SYSTEM_PROMPT, IA_SYSTEM_PROMPT]) {
    assert.match(prompt, /hypothèse/)
    assert.match(prompt, /pronostic/)
    assert.doesNotMatch(prompt, /refuse/)
    assert.doesNotMatch(prompt, /Tu ne prédis pas/)
  }
  assert.match(INDEPENDENCE_DISCLAIMER, /indépendant/)
  assert.match(INDEPENDENCE_DISCLAIMER, /hypothèse/)
  assert.doesNotMatch(INDEPENDENCE_DISCLAIMER, /Ils ne prédisent pas/)
})

test("@specialist.pere-impair resolves after the specialist index is loaded", () => {
  setSpecialistIndex([
    {
      slug: "pere-impair",
      name: "Père impair",
      handle: "specialist.pere-impair",
      target: "parity",
      task: "classes",
      horizon: "value",
      indicators: ["lag1", "rsi"],
      instructions: "Forecast du nombre de pairs. Pas une grille.",
      skill: 0.02,
      skill_50: 0.02,
    },
  ])
  const parsed = parseHandle("@specialist.pere-impair")
  assert.equal(parsed.error, null)
  assert.equal(parsed.entry?.id, "specialist/pere-impair")
  assert.equal(parsed.entry?.lab, "specialist")
  assert.equal(formatHandle(parsed.entry!), "@specialist.pere-impair")
  setSpecialistIndex([])
})

test("working set pack includes specialist instructions and skill", () => {
  const objects: WorkingObject[] = [
    {
      kind: "pin",
      id: "specialist/pere-impair",
      handle: "@specialist.pere-impair",
      label: "Père impair",
      inPrompt: true,
      summary: "forecast 3 · skill 0.02",
      fiche: {
        id: "specialist/pere-impair",
        handle: "pere-impair",
        lab: "specialist",
        label: "Père impair",
        units: "forecast t+1",
        reading: "Forecast du nombre de pairs. Pas une grille.",
        params: { variable: "parity", n: null, periodX: 14, curveId: null },
        window: { preset: "last_100", from: null, to: null, n: 100, warmup: 52, banner: "100" },
        last: { forecast: 3, sigma: 0.4, skill: 0.02, skill_50: 0.02, instructions: "Pas une grille." },
        flags: [],
        flagged: false,
        summary: "forecast 3",
        disclaimer: "pas une grille",
      },
    },
  ]
  const packed = packWorkingSet(objects)
  const sent = (packed.tech as { objects: Array<{ instructions?: string; last?: { skill?: number } }>; disclaimer?: string }).objects
  assert.equal(sent[0].instructions, "Pas une grille.")
  assert.equal(sent[0].last?.skill, 0.02)
  assert.match(String((packed.tech as { disclaimer?: string }).disclaimer), /forecast de série nommée/i)
})

test("Brain prompt allows specialist forecasts and a grid as a separate hypothesis", () => {
  assert.match(BRAIN_SYSTEM_PROMPT, /@specialist/)
  assert.match(BRAIN_SYSTEM_PROMPT, /forecast/)
  assert.match(BRAIN_SYSTEM_PROMPT, /hypothèse/)
  assert.doesNotMatch(BRAIN_SYSTEM_PROMPT, /Tu ne prédis pas le prochain tirage/)
  assert.doesNotMatch(BRAIN_SYSTEM_PROMPT, /refuse/)
})

test("specialist catalog entries stay out of the static catalog", () => {
  assert.equal(
    BRAIN_CATALOG.filter((entry) => entry.lab === "specialist").length,
    0
  )
  const entry = specialistToEntry({
    slug: "somme-totale",
    name: "Somme totale",
    handle: "specialist.somme-totale",
    target: "sum",
    task: "regression",
    horizon: "value",
    indicators: ["lag1"],
    instructions: "Forecast de la somme. Pas une grille.",
  })
  assert.equal(entry.id, "specialist/somme-totale")
  assert.equal(entry.kind, "specialist")
})

test("demo tour pins one handle per lab and honors ?demo=1", () => {
  assert.equal(BRAIN_PACKS[0]?.id, "tour")
  assert.ok(demoWantsStart("?demo=1"))
  assert.ok(demoWantsStart("demo=oui"))
  assert.equal(demoWantsStart(""), false)
  const entries = demoEntries()
  assert.equal(entries.length, DEMO_HANDLES.length)
  for (const handle of DEMO_HANDLES) {
    const parsed = parseHandle(`@${handle}`, { activeLab: DEMO_LAB_FOR[handle] })
    assert.equal(parsed.error, null, `@${handle} ${parsed.error}`)
    assert.equal(parsed.entry?.lab, DEMO_LAB_FOR[handle])
  }
  const labs = demoLabsCovered(entries)
  for (const lab of ["analyse", "chartisme", "harmo", "morpho", "combinaisons"]) {
    assert.ok(labs.includes(lab), lab)
  }
  assert.equal(demoJobs(entries).length, entries.length)
  const withSpecialist = demoEntries([
    {
      id: "specialist/pere-impair",
      handle: "pere-impair",
      aliases: ["specialist.pere-impair"],
      lab: "specialist",
      family: "specialiste",
      kind: "specialist",
      label: "Père impair",
      units: "",
      reading: "Forecast",
      defaults: {},
    },
  ])
  assert.ok(withSpecialist.some((item) => item.lab === "specialist"))
  assert.equal(withSpecialist.length, DEMO_HANDLES.length + 1)
})

test("table lecture cites handles, flags, and refuses an empty table", () => {
  const empty = lectureFromWorkingSet([])
  assert.match(empty, /Table vide/)
  assert.match(empty, /indépendant/)
  const objects: WorkingObject[] = [
    {
      kind: "pin",
      id: "analyse/rsi",
      handle: "@rsi",
      label: "RSI",
      inPrompt: true,
      summary: "RSI sur Somme · rsi 72",
      fiche: {
        id: "analyse/rsi",
        handle: "rsi",
        lab: "analyse",
        label: "RSI",
        units: "0–100",
        reading: "Oscillateur",
        params: { variable: "sum", n: null, periodX: 14, curveId: null },
        window: { preset: "last_100", from: null, to: null, n: 100, warmup: 52, banner: "100" },
        last: { rsi: 72 },
        flags: ["RSI hors 30–70"],
        flagged: true,
        summary: "RSI sur Somme · rsi 72",
        disclaimer: "",
      },
    },
    {
      kind: "current",
      id: "running",
      handle: "@macd",
      label: "en cours",
      inPrompt: false,
      summary: "hors prompt",
    },
  ]
  const text = lectureFromWorkingSet(objects, { banner: "100 tirages", n: 100, source: "json" })
  assert.match(text, /@rsi/)
  assert.match(text, /à relire/)
  assert.doesNotMatch(text, /hors prompt/)
  assert.match(text, /pas de spécialiste/)
  assert.match(text, /100 tirages/)
})

