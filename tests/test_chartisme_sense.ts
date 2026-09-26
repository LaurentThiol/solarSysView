import assert from "node:assert/strict"
import test from "node:test"

import { MIN_WINDOW } from "../src/lib/chartisme/scan"
import {
  MIN_SENSE_LENGTH,
  nameSense,
  registerOf,
  senseSentence,
  senseShiftSentence,
  seriesSigma,
  type CurveSense,
} from "../src/lib/chartisme/sense"

function bump() {
  const values = Array.from({ length: MIN_SENSE_LENGTH }, () => 0)
  values[8] = 4
  return values
}

test("the floor matches the shortest readable window", () => {
  assert.equal(MIN_SENSE_LENGTH, MIN_WINDOW)
})

test("a clean rise and a clean fall are tight", () => {
  const rise = nameSense(Array.from({ length: 20 }, (_, index) => index), 8)
  assert.equal(rise?.symbol, "monte:05")
  assert.equal(rise?.sigma, 0)
  const fall = nameSense(Array.from({ length: 20 }, (_, index) => 19 - index), 8)
  assert.equal(fall?.symbol, "baisse:05")
})

test("a flat line stays stable and tight", () => {
  const named = nameSense(Array.from({ length: 20 }, () => 4), 3)
  assert.equal(named?.symbol, "stable:05")
  assert.equal(named?.delta, 0)
})

test("registers are exclusive bands of the habit", () => {
  const values = bump()
  const sigma = seriesSigma(values)
  assert.ok(sigma > 0)
  assert.equal(nameSense(values, sigma / 0.25)?.register, "05")
  assert.equal(nameSense(values, sigma / 0.75)?.register, "1")
  assert.equal(nameSense(values, sigma / 2)?.register, "sup")
  assert.equal(nameSense(values, sigma / 0.25)?.sense, "stable")
})

test("register edges include the bound", () => {
  assert.equal(registerOf(0.5), "05")
  assert.equal(registerOf(0.5 + 1e-9), "1")
  assert.equal(registerOf(1), "1")
  assert.equal(registerOf(1.01), "sup")
  assert.equal(registerOf(Number.POSITIVE_INFINITY), "sup")
})

test("a move inside the cloud is stable", () => {
  const values = Array.from({ length: MIN_SENSE_LENGTH }, () => 0)
  values[values.length - 1] = 1
  values[8] = 30
  const named = nameSense(values, 1)
  assert.ok(named)
  assert.equal(named?.sense, "stable")
  assert.equal(named?.register, "sup")
  assert.ok(Math.abs(named?.delta ?? 0) <= (named?.sigma ?? 0))
})

test("short or unscaled windows abstain", () => {
  assert.equal(nameSense(Array.from({ length: MIN_SENSE_LENGTH - 1 }, () => 1), 1), null)
  assert.equal(nameSense(Array.from({ length: 20 }, (_, index) => index), null), null)
  assert.equal(nameSense(Array.from({ length: 20 }, (_, index) => index), -1), null)
  assert.equal(nameSense(Array.from({ length: 20 }, (_, index) => index), Number.NaN), null)
})

test("a flat history names a noisy window as wild", () => {
  const still = nameSense(Array.from({ length: 16 }, () => 2), 0)
  assert.equal(still?.symbol, "stable:05")
  assert.equal(still?.ratio, 0)
  const clean = nameSense(Array.from({ length: 16 }, (_, index) => index), 0)
  assert.equal(clean?.symbol, "monte:05")
  const noisy = Array.from({ length: 16 }, (_, index) => index)
  noisy[8] += 5
  const named = nameSense(noisy, 0)
  assert.equal(named?.symbol, "monte:sup")
  assert.equal(named?.ratio, null)
})

test("the sentence leads with the symbol", () => {
  const named = nameSense(Array.from({ length: 20 }, (_, index) => index), 8)
  assert.equal(
    senseSentence(named),
    "monte:05 — la fenêtre monte, et le nuage autour de la droite tient dans la moitié de l'écart-type habituel."
  )
  assert.equal(senseSentence(null), "Fenêtre trop courte pour nommer le sens.")
})

test("the shift sentence compares two windows in chronological order", () => {
  const rise = nameSense(Array.from({ length: 20 }, (_, index) => index), 8)
  const fall = nameSense(Array.from({ length: 20 }, (_, index) => 19 - index), 8)
  assert.ok(rise && fall)
  assert.equal(senseShiftSentence(rise, fall, true), "Le sens change : baisse:05, puis monte:05.")
  assert.equal(senseShiftSentence(rise, rise, true), "Le sens tient : les deux fenêtres sont monte:05.")
  assert.equal(senseShiftSentence(rise, fall, false), "Pas de fenêtre antérieure de même longueur.")
  assert.equal(
    senseShiftSentence(null, null, true),
    "Les deux fenêtres sont trop courtes pour comparer le sens."
  )
  assert.equal(
    senseShiftSentence(rise, null, true),
    "L'une des deux fenêtres est trop courte pour comparer le sens."
  )
  const looser = { ...(rise as CurveSense), register: "1" as const, symbol: "monte:1" }
  assert.equal(
    senseShiftSentence(looser, rise, true),
    "Le sens tient (monte), le registre passe de 05 à 1."
  )
})
