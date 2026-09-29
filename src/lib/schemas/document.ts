export type Inline =
  | { kind: "text"; text: string }
  | { kind: "code"; text: string }
  | { kind: "strong"; text: string }
  | { kind: "link"; text: string; href: string }

export type ProseBlock =
  | { kind: "heading"; level: 2 | 3 | 4; inlines: Inline[] }
  | { kind: "paragraph"; inlines: Inline[] }
  | { kind: "list"; items: Inline[][] }
  | { kind: "table"; headers: Inline[][]; rows: Inline[][][] }

export type SchemaBlock = { kind: "prose"; blocks: ProseBlock[] } | { kind: "diagram"; source: string }

export type SchemaMeta = {
  module: string | null
  level: string | null
  revision: string | null
  code: string | null
}

const META_LINE = /^- (Module|Niveau|Révision|Code) : (.*)$/
const INLINE_TOKEN = /(`[^`\n]+`|\*\*[^*\n]+\*\*|\[[^\]\n]+\]\([^)\s]+\))/g

export function schemaHref(id: string) {
  return id ? `/schemas/${id}` : "/schemas"
}

export function schemaIdFromSlug(slug: string[] | undefined): string | null {
  if (!slug || slug.length === 0) return ""
  if (slug.some((part) => part === "" || part === "." || part === ".." || part.includes("\\"))) return null
  return slug.join("/")
}

/** Dossier dans lequel les liens relatifs du fichier sont résolus. */
export function schemaLinkBase(docId: string) {
  if (!docId.includes("/")) return docId
  return docId.slice(0, docId.lastIndexOf("/"))
}

export function resolveSchemaLink(docId: string, href: string): string | null {
  if (/^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith("#") || href.startsWith("/")) return href
  const joined = normalizeRelative(schemaLinkBase(docId), href)
  if (joined == null) return null
  const stripped = joined.replace(/\.md$/, "").replace(/\/README$/, "").replace(/^README$/, "")
  return schemaHref(stripped)
}

function normalizeRelative(base: string, href: string): string | null {
  const parts = (base ? `${base}/${href}` : href).split("/")
  const stack: string[] = []
  for (const part of parts) {
    if (!part || part === ".") continue
    if (part === "..") {
      if (stack.length === 0) return null
      stack.pop()
      continue
    }
    stack.push(part)
  }
  return stack.join("/")
}

export function parseInlines(text: string, docId: string): Inline[] {
  const out: Inline[] = []
  let last = 0
  for (const match of text.matchAll(INLINE_TOKEN)) {
    const index = match.index ?? 0
    if (index > last) out.push({ kind: "text", text: text.slice(last, index) })
    const token = match[0]
    if (token.startsWith("`")) out.push({ kind: "code", text: token.slice(1, -1) })
    else if (token.startsWith("**")) out.push({ kind: "strong", text: token.slice(2, -2) })
    else {
      const link = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(token)
      if (link) {
        out.push({
          kind: "link",
          text: link[1],
          href: resolveSchemaLink(docId, link[2]) ?? link[2],
        })
      }
    }
    last = index + token.length
  }
  if (last < text.length) out.push({ kind: "text", text: text.slice(last) })
  return out.filter((item) => item.kind !== "text" || item.text.length > 0)
}

function parseTable(lines: string[], docId: string): ProseBlock {
  const cells = lines.map((line) =>
    line
      .replace(/^\|/, "")
      .replace(/\|$/, "")
      .split("|")
      .map((cell) => cell.trim())
  )
  const content = cells.filter((row) => !row.every((cell) => /^:?-{3,}:?$/.test(cell)))
  const [headers = [], ...rows] = content
  return {
    kind: "table",
    headers: headers.map((cell) => parseInlines(cell, docId)),
    rows: rows.map((row) => row.map((cell) => parseInlines(cell, docId))),
  }
}

export function parseProse(text: string, docId: string): ProseBlock[] {
  const lines = text.replace(/\r\n/g, "\n").split("\n")
  const blocks: ProseBlock[] = []
  let index = 0
  while (index < lines.length) {
    const line = lines[index] ?? ""
    if (!line.trim()) {
      index += 1
      continue
    }
    if (line.startsWith("|")) {
      const table: string[] = []
      while (index < lines.length && (lines[index] ?? "").startsWith("|")) {
        table.push(lines[index] ?? "")
        index += 1
      }
      blocks.push(parseTable(table, docId))
      continue
    }
    const heading = /^(#{1,4}) (.+)$/.exec(line)
    if (heading) {
      const level = Math.min(4, heading[1].length + 1) as 2 | 3 | 4
      blocks.push({ kind: "heading", level, inlines: parseInlines(heading[2], docId) })
      index += 1
      continue
    }
    if (line.startsWith("- ")) {
      const items: Inline[][] = []
      while (index < lines.length && (lines[index] ?? "").startsWith("- ")) {
        items.push(parseInlines((lines[index] ?? "").slice(2), docId))
        index += 1
      }
      blocks.push({ kind: "list", items })
      continue
    }
    const paragraph: string[] = []
    while (index < lines.length) {
      const current = lines[index] ?? ""
      if (!current.trim() || current.startsWith("|") || current.startsWith("- ") || /^#{1,4} /.test(current)) break
      paragraph.push(current.trim())
      index += 1
    }
    if (paragraph.length > 0) {
      blocks.push({ kind: "paragraph", inlines: parseInlines(paragraph.join(" "), docId) })
    }
  }
  return blocks
}

export function splitSchema(markdown: string, docId: string): { meta: SchemaMeta; blocks: SchemaBlock[] } {
  const { meta, body } = extractMeta(markdown)
  const withoutTitle = body.replace(/^\s*# .+\n+/, "")
  const parts = withoutTitle.split(/```mermaid\n/)
  const blocks: SchemaBlock[] = []
  pushProse(blocks, parts[0] ?? "", docId)
  for (let index = 1; index < parts.length; index += 1) {
    const part = parts[index] ?? ""
    const close = part.indexOf("```")
    const source = (close >= 0 ? part.slice(0, close) : part).trim()
    const rest = close >= 0 ? part.slice(close + 3).replace(/^\n/, "") : ""
    if (source) blocks.push({ kind: "diagram", source })
    pushProse(blocks, rest, docId)
  }
  return { meta, blocks }
}

function pushProse(blocks: SchemaBlock[], text: string, docId: string) {
  const prose = parseProse(text, docId)
  if (prose.length > 0) blocks.push({ kind: "prose", blocks: prose })
}

function extractMeta(markdown: string): { meta: SchemaMeta; body: string } {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n")
  const meta: SchemaMeta = { module: null, level: null, revision: null, code: null }
  let index = 0
  while (index < lines.length && !(lines[index] ?? "").trim()) index += 1
  if ((lines[index] ?? "").startsWith("# ")) index += 1
  while (index < lines.length && !(lines[index] ?? "").trim()) index += 1
  const start = index
  while (index < lines.length) {
    const match = META_LINE.exec(lines[index] ?? "")
    if (!match) break
    const value = match[2].trim()
    if (match[1] === "Module") meta.module = value
    else if (match[1] === "Niveau") meta.level = value
    else if (match[1] === "Révision") meta.revision = value
    else meta.code = value
    index += 1
  }
  if (index > start) lines.splice(start, index - start)
  return { meta, body: lines.join("\n") }
}

export function schemaTitle(markdown: string) {
  const match = /^# (.+)$/m.exec(markdown)
  return match?.[1]?.trim() || "Schéma"
}

export function schemaShortTitle(id: string, title: string) {
  if (id === "") return "Méthode"
  if (!id.includes("/")) return "Index"
  const label = title.replace(/^Pronostic — /, "").trim()
  return label.charAt(0).toUpperCase() + label.slice(1)
}
