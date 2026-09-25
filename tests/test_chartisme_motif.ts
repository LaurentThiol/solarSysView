import assert from "node:assert/strict"
import test from "node:test"

import { detectFigures } from "../src/lib/chartisme/figures"
import {
  horizontalVisibility,
  readFigures,
  sameMotif,
} from "../src/lib/chartisme/motif"

function piecewise(points: Array<[number, number]>) {
  const values: number[] = []
  for (let slot = 0; slot < points.length - 1; slot += 1) {
    const [start, y0] = points[slot]
    const [stop, y1] = points[slot + 1]
    for (let index = start; index < stop; index += 1) {
      values.push(y0 + ((y1 - y0) * (index - start)) / (stop - start))
    }
  }
  values.push(points[points.length - 1][1])
  return values
}

const ete = () =>
  piecewise([
    [0, 10],
    [5, 6],
    [12, 16],
    [18, 6],
    [24, 10],
    [30, 4],
    [40, 3],
  ])

test("the head blocks horizontal sight, a double top does not", () => {
  const blocked = horizontalVisibility([2, 5, 2])
  assert.ok(!blocked.some(([left, right]) => left === 0 && right === 2))
  const seen = horizontalVisibility([2, 1, 2])
  assert.ok(seen.some(([left, right]) => left === 0 && right === 2))
})

test("a synthetic head and shoulders is stable", () => {
  const hits = readFigures(ete())
  const found = hits.find((hit) => hit.figure === "ete")
  assert.ok(found)
  assert.equal(found?.persistence, 1)
  const roles = new Set(found?.pivots.map((pivot) => pivot.role))
  assert.ok(roles.has("head") && roles.has("left_shoulder") && roles.has("right_shoulder"))
})

test("a rectangle survives two tolerances and noise does not", () => {
  const rectangle = Array.from({ length: 41 }, (_, index) => ((Math.floor(index / 8) % 2 === 0) ? 10 : 4))
  const hits = readFigures(rectangle)
  const found = hits.find((hit) => hit.figure === "rectangle")
  assert.ok(found)
  assert.ok((found?.persistence ?? 0) >= 2 / 3 - 1e-9)

  let seed = 1
  const noise = [0]
  for (let step = 0; step < 80; step += 1) {
    seed = (seed * 16807) % 2147483647
    noise.push(noise[noise.length - 1] + (seed / 2147483647) * 2 - 1)
  }
  assert.equal(readFigures(noise).length, 0)
})

test("agreement confirms the geometric drawing", () => {
  const values = ete()
  const alone = detectFigures(values, null, null, { motifs: false })
  const both = detectFigures(values)
  const geo = alone.find((hit) => hit.figure === "ete")
  const agreed = both.find((hit) => hit.figure === "ete")
  assert.ok(geo && agreed)
  assert.equal(agreed?.detector, "geometric")
  assert.equal(agreed?.agreed, true)
  assert.deepEqual(
    agreed?.pivots.map((pivot) => pivot.index),
    geo?.pivots.map((pivot) => pivot.index)
  )
})

test("same motif allows a few bars of shift", () => {
  const left = {
    figure: "ete" as const,
    pivots: [
      { role: "head" as const, index: 10, date: null, value: 1 },
      { role: "top" as const, index: 4, date: null, value: 1 },
    ],
  }
  const right = {
    ...left,
    pivots: [
      { role: "head" as const, index: 12, date: null, value: 1 },
      { role: "top" as const, index: 4, date: null, value: 1 },
    ],
  }
  assert.equal(
    sameMotif(left as never, right as never),
    true
  )
})
