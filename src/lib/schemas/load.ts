import fs from "node:fs"
import path from "node:path"

import {
  schemaHref,
  schemaShortTitle,
  schemaTitle,
  splitSchema,
  type SchemaBlock,
  type SchemaMeta,
} from "./document.ts"

export type SchemaDoc = {
  id: string
  href: string
  moduleId: string
  title: string
  shortTitle: string
  sourcePath: string
  meta: SchemaMeta
  blocks: SchemaBlock[]
}

const ROOT = path.join(process.cwd(), "docs", "schemas")

function walk(dir: string, prefix = ""): string[] {
  const found: string[] = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name
    const absolute = path.join(dir, entry.name)
    if (entry.isDirectory()) found.push(...walk(absolute, relative))
    else if (entry.name.endsWith(".md")) found.push(relative)
  }
  return found
}

function docId(relative: string) {
  const without = relative.replace(/\.md$/, "")
  if (without === "README") return ""
  if (without.endsWith("/README")) return without.slice(0, -"/README".length)
  return without
}

function sortKey(id: string) {
  if (id === "") return "0"
  if (!id.includes("/")) return `1/${id}/0`
  const slash = id.lastIndexOf("/")
  return `1/${id.slice(0, slash)}/1/${id.slice(slash + 1)}`
}

export function loadSchemaCatalog(): { docs: SchemaDoc[] } {
  const docs = walk(ROOT).map((relative) => {
    const id = docId(relative)
    const markdown = fs.readFileSync(path.join(ROOT, relative), "utf8")
    const title = schemaTitle(markdown)
    const { meta, blocks } = splitSchema(markdown, id)
    const moduleId = id.includes("/") ? id.slice(0, id.indexOf("/")) : id
    return {
      id,
      href: schemaHref(id),
      moduleId,
      title,
      shortTitle: schemaShortTitle(id, title),
      sourcePath: `docs/schemas/${relative}`,
      meta,
      blocks,
    }
  })
  docs.sort((a, b) => sortKey(a.id).localeCompare(sortKey(b.id)))
  return { docs }
}

export function findSchemaDoc(docs: SchemaDoc[], id: string | null) {
  if (id == null) return null
  return docs.find((doc) => doc.id === id) ?? null
}
