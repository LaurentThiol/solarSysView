import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

import { raceChrome, type RaceChromeInput } from "../src/lib/run-arcade/chrome.ts"

function input(patch: Partial<RaceChromeInput> = {}): RaceChromeInput {
  return {
    phase: "idle",
    paused: false,
    error: null,
    canLaunch: true,
    generation: 0,
    race: null,
    minutes: 10,
    remainingMs: null,
    ...patch,
  }
}

const course = { cursor: 14, start: 10, end: 35 }

test("at rest, Lancer is the gold button and the others are off", () => {
  const chrome = raceChrome(input())
  assert.deepEqual(chrome.launch, { label: "Lancer", variant: "default", disabled: false })
  assert.deepEqual(chrome.pause, { label: "Pause", variant: "outline", disabled: true })
  assert.deepEqual(chrome.step, { label: "Jouer le tour", variant: "outline", disabled: true })
  assert.equal(chrome.band, null)
  assert.match(chrome.lead ?? "", /Choisissez le nombre de runners/)
  assert.match(chrome.lead ?? "", /Rayons X/)
})

test("a short archive keeps Lancer off", () => {
  const chrome = raceChrome(input({ canLaunch: false }))
  assert.deepEqual(chrome.launch, { label: "Lancer", variant: "outline", disabled: true })
})

test("during the race, Pause is gold and Relancer stays available", () => {
  const chrome = raceChrome(
    input({ phase: "course", generation: 4, race: course, remainingMs: 20_000 })
  )
  assert.deepEqual(chrome.launch, { label: "Relancer", variant: "secondary", disabled: false })
  assert.deepEqual(chrome.pause, { label: "Pause", variant: "default", disabled: false })
  assert.deepEqual(chrome.step, { label: "Jouer le tour", variant: "secondary", disabled: false })
  assert.equal(chrome.lead, null)
  assert.equal(chrome.band?.badge, "En course")
  assert.equal(chrome.band?.generation, 4)
  assert.equal(chrome.band?.tour, "tour 5 / 25")
  assert.equal(chrome.band?.remaining, "20 s")
  assert.equal(chrome.band?.fraction, 0.2)
  assert.equal(chrome.band?.barNow, 5)
  assert.equal(chrome.band?.barMax, 25)
  assert.equal(chrome.band?.barLabel, "Tour de course")
})

test("a paused race freezes the slice and makes Reprendre the gold button", () => {
  const chrome = raceChrome(
    input({ phase: "course", paused: true, generation: 4, race: course, remainingMs: 20_000 })
  )
  assert.deepEqual(chrome.launch, { label: "Relancer", variant: "secondary", disabled: false })
  assert.deepEqual(chrome.pause, { label: "Reprendre", variant: "default", disabled: false })
  assert.deepEqual(chrome.step, { label: "Jouer le tour", variant: "secondary", disabled: false })
  assert.equal(chrome.band?.badge, "En pause")
  assert.equal(chrome.band?.tour, "tour 5 / 25")
  assert.equal(chrome.band?.remaining, "20 s")
  assert.equal(chrome.band?.fraction, 0.2)
})

test("without a clock, the race bar still counts tours", () => {
  const chrome = raceChrome(
    input({ phase: "course", minutes: 0, generation: 1, race: course, remainingMs: null })
  )
  assert.equal(chrome.band?.remaining, null)
  assert.equal(chrome.band?.tour, "tour 5 / 25")
  assert.equal(chrome.band?.fraction, 0.2)
})

test("a cursor past the end does not fill the bar past the last tour", () => {
  const chrome = raceChrome(
    input({ phase: "course", race: { cursor: 40, start: 10, end: 35 }, minutes: 0 })
  )
  assert.equal(chrome.band?.tour, "tour 25 / 25")
  assert.equal(chrome.band?.fraction, 1)
  assert.equal(chrome.band?.barNow, 25)
})

test("avant-course fills the bar with elapsed time and has no tour number", () => {
  const chrome = raceChrome(
    input({ phase: "avant", generation: 2, minutes: 10, remainingMs: 300_000, race: course })
  )
  assert.deepEqual(chrome.pause, { label: "Pause", variant: "default", disabled: false })
  assert.deepEqual(chrome.step, { label: "Passer à la course", variant: "secondary", disabled: false })
  assert.equal(chrome.band?.badge, "Avant-course")
  assert.equal(chrome.band?.tour, null)
  assert.equal(chrome.band?.remaining, "5 min")
  assert.equal(chrome.band?.fraction, 0.5)
  assert.equal(chrome.band?.barNow, 300_000)
  assert.equal(chrome.band?.barMax, 600_000)
  assert.equal(chrome.band?.barLabel, "Avant-course")
})

test("a paused warm-up keeps the skip and freezes the remaining time", () => {
  const chrome = raceChrome(
    input({ phase: "avant", paused: true, minutes: 10, remainingMs: 120_000, race: course })
  )
  assert.deepEqual(chrome.pause, { label: "Reprendre", variant: "default", disabled: false })
  assert.deepEqual(chrome.step, { label: "Passer à la course", variant: "secondary", disabled: false })
  assert.equal(chrome.band?.badge, "En pause")
  assert.equal(chrome.band?.remaining, "2 min")
  assert.equal(chrome.band?.fraction, 0.8)
})

test("avant-course waits for a known remaining time before drawing the bar", () => {
  const chrome = raceChrome(input({ phase: "avant", remainingMs: null, minutes: 10 }))
  assert.equal(chrome.band?.remaining, "—")
  assert.equal(chrome.band?.fraction, null)
  assert.equal(chrome.band?.barNow, null)
})

test("a finished generation brings Lancer back and drops the bar", () => {
  const chrome = raceChrome(input({ phase: "fin", generation: 4, race: course, canLaunch: true }))
  assert.deepEqual(chrome.launch, { label: "Lancer", variant: "default", disabled: false })
  assert.deepEqual(chrome.pause, { label: "Pause", variant: "outline", disabled: true })
  assert.deepEqual(chrome.step, { label: "Jouer le tour", variant: "outline", disabled: true })
  assert.equal(chrome.band?.badge, "Finie")
  assert.equal(chrome.band?.generation, 4)
  assert.equal(chrome.band?.fraction, null)
  assert.equal(chrome.lead, null)
})

test("an error replaces the band and leaves the race controls in place", () => {
  const chrome = raceChrome(
    input({ phase: "course", error: "IA locale arrêtée", race: course, remainingMs: 20_000 })
  )
  assert.equal(chrome.lead, "IA locale arrêtée")
  assert.equal(chrome.band, null)
  assert.equal(chrome.pause.variant, "default")
  assert.equal(chrome.pause.disabled, false)
  assert.equal(chrome.launch.label, "Relancer")
})

test("the lab paints the chrome decisions", () => {
  const lab = readFileSync(new URL("../src/components/brain/run-arcade-lab.tsx", import.meta.url), "utf8")
  assert.match(lab, /raceChrome\(/)
  assert.match(lab, /chrome\.launch\.variant/)
  assert.match(lab, /chrome\.pause\.label/)
  assert.match(lab, /chrome\.step\.label/)
  assert.match(lab, /chrome\.band\.badge/)
  assert.match(lab, /role="progressbar"/)
})
