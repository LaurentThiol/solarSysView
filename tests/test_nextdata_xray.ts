import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

import { headEcart, shownXray, trainingXray, type Xray } from "../src/lib/nextdata/xray.ts"

function trace(detail: string): Xray {
  return { controles: [{ id: "cadre.focus", ok: false, detail }] } as Xray
}

test("the panel stays hidden until the switch is on, and the head follows the pinned shift", () => {
  const early = trace("Le focus réel est 20, le bouton demande 50.")
  const late = trace("Bande croisée : sum.")
  assert.equal(shownXray(false, early), null)
  assert.equal(shownXray(true, null), null)
  assert.equal(shownXray(true, early), early)

  const shifts = [
    { x: 1, readings: { corpus: { xray: early } } },
    { x: 2, readings: { corpus: { xray: late } } },
  ]
  assert.equal(headEcart(trainingXray(shifts, null, "corpus")), "Bande croisée : sum.")
  assert.equal(headEcart(trainingXray(shifts, 1, "corpus")), "Le focus réel est 20, le bouton demande 50.")
  assert.equal(trainingXray(shifts, 1, "mean"), null)

  const lab = readFileSync(new URL("../src/components/nextdata/nextdata-lab.tsx", import.meta.url), "utf8")
  const training = readFileSync(new URL("../src/components/nextdata/training-lab.tsx", import.meta.url), "utf8")
  assert.match(lab, /aria-pressed=\{xray\}/)
  assert.match(lab, /\{xray \? <XrayPanel/)
  assert.match(training, /aria-pressed=\{xray\}/)
  assert.match(training, /\{xray \? <XrayPanel/)
  assert.match(training, /trainingXray\(/)
})
