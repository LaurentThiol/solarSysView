import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const navSrc = readFileSync(new URL("../src/lib/nav.ts", import.meta.url), "utf8")
const headerSrc = readFileSync(new URL("../src/components/startup-status.tsx", import.meta.url), "utf8")
const toneSrc = readFileSync(new URL("../src/lib/status-tone.ts", import.meta.url), "utf8")

test("five nav families cover every lab", () => {
  assert.match(navSrc, /id: "archive"/)
  assert.match(navSrc, /id: "lecture"/)
  assert.match(navSrc, /id: "grilles"/)
  assert.match(navSrc, /id: "assistants"/)
  assert.match(navSrc, /id: "systeme"/)
  assert.match(navSrc, /href: "\/tirage"/)
  assert.match(navSrc, /href: "\/brain\/specialistes"/)
  assert.match(navSrc, /href: "\/admin"/)
  assert.match(headerSrc, /NAV_GROUPS/)
  assert.match(headerSrc, /HealthCluster/)
  assert.match(headerSrc, /GlossaryButton/)
  assert.match(headerSrc, /QuitButton/)
  assert.match(headerSrc, /aria-label="Familles"/)
  assert.match(headerSrc, /createPortal/)
  assert.match(headerSrc, /site-nav-drawer/)
  assert.match(headerSrc, /current\.label/)
})

test("Brain stays exact-match so Spécialistes is its own item", () => {
  assert.match(navSrc, /if \(href === "\/brain"\) return pathname === "\/brain"/)
  assert.match(headerSrc, /isNavItemActive/)
})

test("health cluster ranks error above warn", () => {
  assert.match(toneSrc, /export function worstStatusTone/)
  assert.match(toneSrc, /err: 5/)
  assert.match(toneSrc, /warn: 4/)
})
