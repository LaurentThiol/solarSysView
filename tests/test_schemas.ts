import assert from "node:assert/strict"
import test from "node:test"

import { NAV_GROUPS } from "../src/lib/nav.ts"
import {
  resolveSchemaLink,
  schemaIdFromSlug,
  splitSchema,
} from "../src/lib/schemas/document.ts"
import { findSchemaDoc, loadSchemaCatalog } from "../src/lib/schemas/load.ts"

test("Schémas sits in the Système menu", () => {
  const systeme = NAV_GROUPS.find((group) => group.id === "systeme")
  assert.ok(systeme)
  const item = systeme.items.find((entry) => entry.href === "/schemas")
  assert.equal(item?.label, "Schémas")
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
