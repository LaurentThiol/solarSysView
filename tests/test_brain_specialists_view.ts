import assert from "node:assert/strict"
import test from "node:test"

import {
  beatsChance,
  beatsChanceCount,
  formatForecast,
  formatSkill,
  skillBar,
  skillOf,
  skillWindows,
  targetGlyph,
  verdictKind,
  verdictTone,
} from "../src/lib/brain/specialist-view"

test("skillBar is bipolar around zero and clamps at the display scale", () => {
  const empty = skillBar(null)
  assert.equal(empty.side, "empty")
  assert.equal(empty.widthPct, 0)
  assert.equal(empty.display, "—")

  const zero = skillBar(0)
  assert.equal(zero.side, "zero")
  assert.equal(zero.leftPct, 50)
  assert.equal(zero.widthPct, 0)

  const pos = skillBar(0.15)
  assert.equal(pos.side, "pos")
  assert.equal(pos.leftPct, 50)
  assert.equal(pos.widthPct, 25)
  assert.equal(pos.clamped, false)
  assert.equal(pos.display, "+0.15")

  const edge = skillBar(0.3)
  assert.equal(edge.widthPct, 50)
  assert.equal(edge.leftPct, 50)

  const over = skillBar(0.9)
  assert.equal(over.clamped, true)
  assert.equal(over.widthPct, 50)
  assert.equal(over.leftPct, 50)

  const neg = skillBar(-0.15)
  assert.equal(neg.side, "neg")
  assert.equal(neg.leftPct, 25)
  assert.equal(neg.widthPct, 25)
  assert.equal(neg.display, "−0.15")
})

test("skillOf prefers the window row then skill_20/50/100", () => {
  assert.equal(skillOf({ skill_20: 0.1, windows: { "20": { skill: 0.2 } } }, "20"), 0.2)
  assert.equal(skillOf({ skill_50: -0.04 }, "50"), -0.04)
  assert.equal(skillOf({ skill_100: 0 }, "100"), 0)
  assert.equal(skillOf({}, "20"), null)
  const rows = skillWindows({ skill_20: 0.12, skill_50: 0.08, skill_100: -0.01 })
  assert.equal(rows.length, 3)
  assert.equal(rows[0]?.key, "20")
  assert.equal(rows[0]?.bar.display, "+0.12")
})

test("verdict tones and beats-chance follow the metric labels", () => {
  assert.equal(verdictKind("bat le nul"), "beats")
  assert.equal(verdictKind("moins bon"), "worse")
  assert.equal(verdictKind("à égalité"), "tie")
  assert.equal(verdictKind("insuffisant"), "unknown")
  assert.match(verdictTone("bat le nul").className, /chart-3/)
  assert.match(verdictTone("moins bon").className, /destructive/)
  assert.equal(beatsChance({ verdict: "bat le nul", skill: -1 }), true)
  assert.equal(beatsChance({ verdict: "moins bon", skill: 0.4 }), false)
  assert.equal(beatsChance({ skill: 0.03 }), true)
  assert.equal(beatsChance({ skill: 0.01 }), false)
  assert.equal(
    beatsChanceCount([{ verdict: "bat le nul" }, { verdict: "à égalité" }, { skill: 0.08 }]),
    2
  )
})

test("formatForecast shows value ± σ and an abstain overlay", () => {
  const live = formatForecast({ value: 2, sigma: 0.4, confidence: 0.62, abstain: false })
  assert.equal(live.summary, "2 ± 0.4")
  assert.equal(live.confidencePct, 62)
  assert.equal(live.abstain, false)

  const silent = formatForecast({ value: 3, sigma: 1.1, confidence: 0.2, abstain: true })
  assert.equal(silent.abstain, true)
  assert.match(silent.summary, /s’abstient/)
  assert.equal(silent.valueLabel, "3")

  const empty = formatForecast(null)
  assert.equal(empty.summary, "—")
  assert.equal(empty.confidencePct, null)

  const classes = formatForecast({ value: 1, proba: [0.1, 0.6, 0.3], abstain: false })
  assert.deepEqual(classes.proba, [0.1, 0.6, 0.3])
})

test("formatSkill keeps a signed French minus", () => {
  assert.equal(formatSkill(null), "—")
  assert.equal(formatSkill(0), "0")
  assert.equal(formatSkill(0.1234), "+0.123")
  assert.equal(formatSkill(-0.04), "−0.04")
})

test("targetGlyph maps series names without inventing personas", () => {
  assert.equal(targetGlyph("parity"), "parity")
  assert.equal(targetGlyph("sum"), "sum")
  assert.equal(targetGlyph("spread"), "spread")
  assert.equal(targetGlyph("n3"), "rank")
  assert.equal(targetGlyph("g2"), "gap")
  assert.equal(targetGlyph("e1"), "star")
  assert.equal(targetGlyph("star_sum"), "star")
  assert.equal(targetGlyph("unknown-series"), "default")
})
