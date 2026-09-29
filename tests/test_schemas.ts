import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import path from "node:path"
import test from "node:test"

import { ADDRESSES } from "../src/lib/addresses.ts"
import {
  SCHEMA_CANVAS,
  SCHEMA_INK,
  SCHEMA_INK_DARK,
  SCHEMA_PAPER,
  contrastRatio,
  liftDiagramContrast,
  prepareDiagramSource,
} from "../src/lib/schemas/contrast.ts"
import {
  resolveSchemaLink,
  schemaIdFromSlug,
  splitSchema,
} from "../src/lib/schemas/document.ts"
import { findSchemaDoc, loadSchemaCatalog } from "../src/lib/schemas/load.ts"
import { NAV_GROUPS } from "../src/lib/nav.ts"
import { figureFromSource } from "../src/lib/schemas/parse.ts"

const FIXTURE = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 90">
  <text x="120" y="16">Pronostic, contexte</text>
  <text x="80" y="58" fill="#444444" style="font-size: 14px; text-anchor: middle"><tspan dy="0">Lit les tirages</tspan></text>
  <line stroke="#444444" x1="0" y1="0" x2="10" y2="10" />
  <marker id="schema-arrowhead"><path d="M 0 0 L 10 5 L 0 10 z" /></marker>
</svg>`

function pronosticSource(id: string) {
  return readFileSync(path.join(process.cwd(), "docs/schemas/pronostic", `${id}.md`), "utf8")
}

function firstDiagram(markdown: string) {
  const fence = markdown.match(/```mermaid\n([\s\S]*?)```/)
  assert.ok(fence)
  return figureFromSource(0, "figure", fence[1])
}

test("Schémas sits in the Système menu", () => {
  const systeme = NAV_GROUPS.find((group) => group.id === "systeme")
  assert.ok(systeme)
  const item = systeme.items.find((entry) => entry.href === "/schemas")
  assert.equal(item?.label, "Schémas")
  const grilles = NAV_GROUPS.find((group) => group.id === "grilles")
  assert.equal(grilles?.items.some((entry) => entry.href === "/schemas"), false)
})

test("pronostic schema links parse from the markdown", () => {
  const contexte = firstDiagram(pronosticSource("01-contexte"))
  assert.equal(contexte.kind, "c4")
  assert.equal(contexte.links.length, 5)
  assert.equal(contexte.links[0].fromLabel, "Chercheur")
  assert.equal(contexte.links[0].toLabel, "Pronostic")
  assert.match(contexte.links[0].label, /fenêtre/)
  assert.equal(contexte.links[1].technology, "GET /api/draws")
  assert.equal(contexte.links[1].toLabel, "Archive FDJ")
  const atelier = pronosticSource("04-atelier-flux")
  const fences = [...atelier.matchAll(/```mermaid\n([\s\S]*?)```/g)]
  assert.equal(fences.length, 2)
  assert.ok(figureFromSource(0, "flux", fences[0][1]).links.some((link) => link.label.includes("mardi")))
  const comite = firstDiagram(pronosticSource("07-comite-flux"))
  assert.equal(comite.kind, "sequence")
  assert.ok(comite.links.some((link) => link.label.includes("Allume le comité")))
  assert.equal(comite.links[0].toLabel, "Historique")
})

test("c4 source receives high-contrast element and link colors", () => {
  const raw = firstDiagram(pronosticSource("01-contexte")).source
  const prepared = prepareDiagramSource(raw)
  assert.match(prepared, /UpdateElementStyle\(archive, "#E7EEF7", "#121820", "#4C6078"\)/)
  assert.match(prepared, /UpdateElementStyle\(chercheur, "#0B3A72", "#FFFFFF", "#9EC0EE"\)/)
  assert.match(prepared, /UpdateRelStyle\(chercheur, pronostic, "#F7F4EE", "#D7E2F0"\)/)
  assert.match(prepared, /UpdateRelStyle\(pronostic, archive, "#F7F4EE", "#D7E2F0"\)/)
  assert.equal(prepareDiagramSource(prepared), prepared)
  assert.equal(prepareDiagramSource("flowchart LR\n  a --> b"), "flowchart LR\n  a --> b")
})

test("diagram svg drops #444 labels and plates the link text", () => {
  const svg = liftDiagramContrast(FIXTURE)
  assert.doesNotMatch(svg, /#444444/)
  assert.match(svg, /class="schema-title"/)
  assert.match(svg, /fill="#F7F4EE"/)
  assert.match(svg, /data-schema-plate="1"/)
  assert.match(svg, /Lit les tirages/)
  assert.match(svg, /fill="#D7E2F0"/)
  assert.doesNotMatch(svg, /<script/i)
  assert.ok(contrastRatio("#444444", SCHEMA_CANVAS) < 3)
  assert.ok(contrastRatio(SCHEMA_INK, SCHEMA_CANVAS) >= 7)
  assert.ok(contrastRatio(SCHEMA_INK_DARK, SCHEMA_PAPER) >= 7)
  assert.ok(contrastRatio("#FFFFFF", "#0E5CAD") >= 4.5)
  assert.ok(contrastRatio(SCHEMA_INK_DARK, "#D7E8FA") >= 7)
})

test("schema pages are in the address catalog", () => {
  assert.ok(ADDRESSES.some((entry) => entry.href === "/schemas"))
  assert.ok(ADDRESSES.some((entry) => entry.href === "/schemas/pronostic/01-contexte"))
  assert.ok(ADDRESSES.some((entry) => entry.href === "/schemas/pronostic/08-filtres"))
})

test("catalog reads the pronostic schemas in reading order", () => {
  const { docs } = loadSchemaCatalog()
  const ids = docs.map((doc) => doc.id)
  assert.equal(ids[0], "")
  assert.ok(ids.includes("pronostic"))
  const contexte = ids.indexOf("pronostic/01-contexte")
  const filtres = ids.indexOf("pronostic/08-filtres")
  assert.ok(contexte > ids.indexOf("pronostic"))
  assert.ok(filtres > contexte)
  const doc = findSchemaDoc(docs, "pronostic/01-contexte")
  assert.equal(doc?.shortTitle, "Contexte")
  assert.equal(doc?.meta.revision, "1")
  assert.equal(doc?.meta.level, "C4 contexte")
  const diagram = doc?.blocks.find((block) => block.kind === "diagram")
  assert.equal(diagram?.kind, "diagram")
  if (diagram?.kind === "diagram") assert.match(diagram.source, /^C4Context/)
  assert.equal(findSchemaDoc(docs, "absent"), null)
})

test("catalog reads the decisionTree schemas in reading order", () => {
  const { docs } = loadSchemaCatalog()
  const ids = docs.map((doc) => doc.id)
  assert.ok(ids.includes("decision-tree"))
  const contexte = ids.indexOf("decision-tree/01-contexte")
  const sortie = ids.indexOf("decision-tree/07-sortie-flux")
  assert.ok(contexte > ids.indexOf("decision-tree"))
  assert.ok(sortie > contexte)
  assert.ok(ids.indexOf("decision-tree/04-lecture-flux") < ids.indexOf("decision-tree/06-recherche-flux"))
  const doc = findSchemaDoc(docs, "decision-tree/01-contexte")
  assert.equal(doc?.shortTitle, "Contexte")
  assert.equal(doc?.meta.level, "C4 contexte")
  const lecture = findSchemaDoc(docs, "decision-tree/04-lecture-flux")
  assert.equal(lecture?.shortTitle, "Lecture — flux")
  assert.equal(lecture?.meta.revision, "1")
  const diagrams = lecture?.blocks.filter((block) => block.kind === "diagram") ?? []
  assert.equal(diagrams.length, 2)
  assert.equal(findSchemaDoc(docs, "pronostic/01-contexte")?.shortTitle, "Contexte")
})

test("relative schema links stay inside the reader", () => {
  assert.equal(resolveSchemaLink("", "pronostic/README.md"), "/schemas/pronostic")
  assert.equal(resolveSchemaLink("pronostic", "01-contexte.md"), "/schemas/pronostic/01-contexte")
  assert.equal(
    resolveSchemaLink("pronostic/06-historique-flux", "07-comite-flux.md"),
    "/schemas/pronostic/07-comite-flux"
  )
  assert.equal(resolveSchemaLink("pronostic", "https://mermaid.live"), "https://mermaid.live")
  assert.equal(resolveSchemaLink("", "../secret.md"), null)
  assert.equal(schemaIdFromSlug(undefined), "")
  assert.equal(schemaIdFromSlug(["pronostic", "01-contexte"]), "pronostic/01-contexte")
  assert.equal(schemaIdFromSlug(["..", "passwd"]), null)
})

test("mermaid fences stay in place between the prose", () => {
  const { blocks, meta } = splitSchema(
    "# Titre\n\n- Module : `/pronostic`\n- Révision : 2\n\nAvant.\n\n```mermaid\nflowchart LR\n  a --> b\n```\n\nAprès [la suite](02-conteneurs.md).\n",
    "pronostic/01-contexte"
  )
  assert.equal(meta.revision, "2")
  assert.equal(meta.module, "`/pronostic`")
  assert.deepEqual(
    blocks.map((block) => block.kind),
    ["prose", "diagram", "prose"]
  )
  const after = blocks[2]
  assert.equal(after?.kind, "prose")
  if (after?.kind !== "prose") return
  const paragraph = after.blocks.find((block) => block.kind === "paragraph")
  assert.equal(paragraph?.kind, "paragraph")
  if (paragraph?.kind !== "paragraph") return
  const link = paragraph.inlines.find((item) => item.kind === "link")
  assert.equal(link?.kind, "link")
  if (link?.kind === "link") assert.equal(link.href, "/schemas/pronostic/02-conteneurs")
})
