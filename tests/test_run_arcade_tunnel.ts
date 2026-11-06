import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

import { RUN_ARCADE_HELP } from "../src/lib/run-arcade/help.ts"
import { TUNNEL_MAX_DAYS, TUNNEL_MIN_DAYS, tunnel, type TunnelPoint } from "../src/lib/run-arcade/tunnel.ts"

const thought = readFileSync(new URL("../src/lib/run-arcade/thought.ts", import.meta.url), "utf8")
const universe = readFileSync(new URL("../src/components/brain/run-arcade-universe.tsx", import.meta.url), "utf8")
const lab = readFileSync(new URL("../src/components/brain/run-arcade-lab.tsx", import.meta.url), "utf8")

function on(end: string, age: number, value: number): TunnelPoint {
  const date = new Date(`${end}T12:00:00Z`)
  date.setUTCDate(date.getUTCDate() - age)
  return { date: date.toISOString().slice(0, 10), value }
}

const END = "2026-01-31"

test("dix jours dans une bande : le tunnel existe", () => {
  const read = tunnel([on(END, 10, 4), on(END, 7, 8), on(END, 4, 3), on(END, 0, 5)])
  assert.equal(read.phrase, "tunnel 10 jours, de 3 à 8")
  assert.equal(read.hit?.days, TUNNEL_MIN_DAYS)
  assert.equal(read.hit?.lo, 3)
  assert.equal(read.hit?.hi, 8)
  assert.equal(read.hit?.from, 0)
  assert.equal(read.hit?.to, 3)
})

test("un point sort à 12 jours : le tunnel s’arrête à 11", () => {
  const read = tunnel([
    on(END, 12, 20),
    on(END, 11, 6),
    on(END, 10, 4),
    on(END, 7, 8),
    on(END, 4, 3),
    on(END, 0, 5),
  ])
  assert.equal(read.phrase, "tunnel 11 jours, de 3 à 8")
  assert.equal(read.hit?.days, 11)
  assert.equal(read.hit?.lo, 3)
  assert.equal(read.hit?.hi, 8)
  assert.equal(read.hit?.from, 1)
  assert.equal(read.hit?.to, 5)
})

test("au-delà de 30 jours, on coupe", () => {
  const points: TunnelPoint[] = []
  for (let age = 40; age >= 0; age -= 1) {
    let value = 5
    if (age > 0 && age <= TUNNEL_MIN_DAYS && age % 2 === 0) value = age % 4 === 0 ? 4 : 6
    if (age === 35) value = 20
    points.push(on(END, age, value))
  }
  const read = tunnel(points)
  assert.equal(read.phrase, "tunnel 30 jours, de 4 à 6")
  assert.equal(read.hit?.days, TUNNEL_MAX_DAYS)
  assert.equal(read.hit?.lo, 4)
  assert.equal(read.hit?.hi, 6)
  assert.equal(read.hit?.from, 10)
  assert.equal(read.hit?.to, 40)
})

test("le dernier point hors de la bande courte : pas de tunnel", () => {
  const read = tunnel([on(END, 10, 4), on(END, 7, 8), on(END, 4, 3), on(END, 0, 20)])
  assert.equal(read.phrase, "pas de tunnel")
  assert.equal(read.hit, null)
})

test("l’aide dit que le tunnel se lit entre 10 et 30 jours et ne joue pas le ticket", () => {
  const item = RUN_ARCADE_HELP.dessin.items?.find((entry) => entry.label === "Tunnel")
  assert.ok(item)
  assert.match(item.text, new RegExp(String(TUNNEL_MIN_DAYS)))
  assert.match(item.text, new RegExp(String(TUNNEL_MAX_DAYS)))
  assert.match(item.text, /pas de tunnel/)
  assert.match(item.text, /ne joue pas le ticket/)
  assert.match(RUN_ARCADE_HELP.dessin.body, /ne joue pas le ticket/)
  assert.match(lab, /Tunnel :/)
  assert.match(universe, /runner-tunnel/)
  assert.match(lab, /run-arcade-tunnel|tunnel=/)
  assert.doesNotMatch(thought, /run-arcade\/tunnel|from \"\.\/tunnel\"/)
})
