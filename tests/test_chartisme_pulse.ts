import assert from "node:assert/strict"
import test from "node:test"

import { pulseSentence, readingPulse } from "../src/lib/chartisme/pulse"

test("the pulse counts agreement and what moves between windows", () => {
  const pulse = readingPulse(
    [
      { figure: "ete", detector: "geometric", agreed: true },
      { figure: "flag", detector: "motif" },
      { figure: "rectangle", detector: "geometric" },
    ],
    [
      { figure: "ete", detector: "geometric", agreed: true },
      { figure: "canal", detector: "geometric" },
    ]
  )
  assert.equal(pulse.total, 3)
  assert.equal(pulse.agreed, 1)
  assert.equal(pulse.motifOnly, 1)
  assert.equal(pulse.shared, 1)
  assert.equal(pulse.appeared, 2)
  assert.equal(pulse.gone, 1)
  const sentence = pulseSentence(pulse, true)
  assert.match(sentence, /Lecture active : 3 figures/)
  assert.match(sentence, /1 confirmée par le graphe/)
  assert.match(sentence, /1 lue seulement comme motif/)
  assert.match(sentence, /1 figure revient/)
  assert.match(sentence, /2 apparaissent/)
  assert.match(sentence, /1 disparaît/)
})

test("without a curve the three layers are ready and waiting", () => {
  const sentence = pulseSentence(readingPulse([], null), false)
  assert.match(sentence, /trois couches sont prêtes/)
  assert.equal(readingPulse([], null).shared, null)
})
