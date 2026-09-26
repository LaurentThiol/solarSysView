import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const fiche = readFileSync(new URL("../src/lib/lexicon/fiche.ts", import.meta.url), "utf8")
const lab = readFileSync(new URL("../src/components/chartisme/chartisme-lab.tsx", import.meta.url), "utf8")
const compare = readFileSync(new URL("../src/components/chartisme/window-compare.tsx", import.meta.url), "utf8")
const page = readFileSync(new URL("../src/components/brain/lexicon-lab.tsx", import.meta.url), "utf8")
const nav = readFileSync(new URL("../src/lib/nav.ts", import.meta.url), "utf8")

test("fiche link keeps the chartisme sentences and opens the dictionary", () => {
  assert.match(fiche, /sense\.\$\{sense\}\.\$\{register\}/)
  assert.match(lab, /senseSentence\(senseRead\.named\)/)
  assert.match(lab, /ficheHref\(senseRead\.named\?\.symbol\)/)
  assert.match(compare, /Fenêtre étudiée · \{senseSentence\(sense\)\}/)
  assert.match(compare, /ficheHref\(sense\?\.symbol\)/)
})

test("dictionary page names the demo and does not claim draws are independent", () => {
  assert.match(page, /Démo — rien n'est enregistré/)
  assert.match(page, /Lire 20\/50\/100/)
  assert.match(page, /suivis/)
  assert.match(page, /Issue du parcours/)
  assert.match(page, /Ce cas dans le cloud/)
  assert.doesNotMatch(page, /indépendant/)
  assert.match(nav, /href: "\/brain\/dictionnaire"/)
  const assistants = nav.slice(nav.indexOf('id: "assistants"'), nav.indexOf('id: "systeme"'))
  assert.ok(assistants.indexOf("/brain/specialistes") < assistants.indexOf("/brain/dictionnaire"))
})

test("the sense sketch is a full-width light curve, not a 64px dark stroke", () => {
  assert.match(page, /sketchForSymbol/)
  assert.match(page, /lex-sketch/)
  assert.match(page, /field-sizing-content min-h-28/)
  assert.match(page, /droite des deux bouts/)
  assert.match(page, /segmentsSentence\(demoSegments\(\)\)/)
  assert.match(page, /symbolOf\(cell\?\.sense/)
  assert.doesNotMatch(page, /h-16 w-40/)
  assert.doesNotMatch(page, /#0f172a/)
})
