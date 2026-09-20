import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const panelSrc = readFileSync(
  new URL("../src/components/analysis/stats-panels.tsx", import.meta.url),
  "utf8"
)

function pairLiftCard(src: string) {
  const start = src.indexOf("Paires à plus fort lift (fenêtre)")
  const end = src.indexOf("Backtest « 5 plus chauds » vs hasard")
  assert.ok(start >= 0, "pair-lift card title")
  assert.ok(end > start, "backtest card follows pair-lift")
  return src.slice(start, end)
}

test("pair-lift card lists pairs in a ranked table, not a colliding two-column flex grid", () => {
  const card = pairLiftCard(panelSrc)
  assert.match(card, /<table/)
  assert.match(card, />Paire</)
  assert.match(card, />Fois</)
  assert.match(card, />Lift</)
  assert.match(card, /\{row\.a\} · \{row\.b\}/)
  assert.match(card, /\{row\.count\}×/)
  assert.match(card, /formatStat\(row\.lift\)/)
  assert.match(card, /whitespace-nowrap/)
  assert.doesNotMatch(card, /sm:grid-cols-2/)
  assert.doesNotMatch(card, /justify-between/)
  assert.doesNotMatch(card, /lift \{formatStat/)
})
