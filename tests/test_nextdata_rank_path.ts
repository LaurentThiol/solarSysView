import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

import { rankPathLabels, type Arbitration } from "../src/lib/nextdata/rank-path.ts"

const view = readFileSync(new URL("../src/components/nextdata/rank-path.tsx", import.meta.url), "utf8")
const lab = readFileSync(new URL("../src/components/nextdata/nextdata-lab.tsx", import.meta.url), "utf8")
const training = readFileSync(new URL("../src/components/nextdata/training-lab.tsx", import.meta.url), "utf8")

function row(rank: string) {
  return {
    rank,
    chain: 8,
    level: 9,
    delta: 7,
    weights: { chain: 0.4, level: 0.4, delta: 0.2 },
    blend: 8.2,
    clipped: 8.2,
    grid: 8,
  }
}

function gap(name: string) {
  return { name, blend: 6, lo: 1, hi: 12, clipped: 6, hit: name === "g1" }
}

const trace: Arbitration = {
  numbers: ["n1", "n2", "n3", "n4", "n5"].map(row),
  gaps: ["g1", "g2", "g3", "g4"].map(gap),
  stars: ["e1", "e2"].map(row),
  star_gap: gap("e_gap"),
  sum_target: 110,
  sum_grid: 108,
  star_sum_target: 8,
  star_sum_grid: 7,
}

test("the figure lists n1 to n5, e1, e2 and the gaps", () => {
  assert.deepEqual(rankPathLabels(trace), {
    ranks: ["n1", "n2", "n3", "n4", "n5", "e1", "e2"],
    gaps: ["g1", "g2", "g3", "g4", "e_gap"],
  })
  assert.match(view, /rank\.rank/)
  assert.match(view, /gap\.name/)
  assert.match(view, /Trois lectures/)
  assert.match(view, /Écarts/)
  assert.match(view, /Mélange tenu/)
  assert.match(view, /Grille/)
  assert.match(view, /bord/)
  assert.match(lab, /<RankPath/)
  assert.match(lab, /NEXTDATA_HELP\.chemin/)
  assert.match(training, /<RankPath/)
  assert.match(training, /shift\.x === 1/)
})
