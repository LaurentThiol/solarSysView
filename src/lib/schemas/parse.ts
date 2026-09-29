/** Cartes Mermaid de Pronostic, lues depuis docs/schemas/pronostic. */

export const SCHEMA_DOCS = [
  {
    id: "01-contexte",
    label: "Contexte",
    text: "Chercheur, archive FDJ, spécialistes, Jeux et capture. Qui parle à Pronostic.",
  },
  {
    id: "02-conteneurs",
    label: "Conteneurs",
    text: "Navigateur, proxy Next, API Python et Neon. Où le calcul et l’archive vivent.",
  },
  {
    id: "03-atelier-composants",
    label: "Atelier, composants",
    text: "Piles, proposeur, resserrage et décompte de l’atelier.",
  },
  {
    id: "04-atelier-flux",
    label: "Atelier, flux",
    text: "Fenêtre, couches, pas, liste ou échantillon.",
  },
  {
    id: "05-historique-composants",
    label: "Historique, composants",
    text: "Notation, plan et comité de l’historique.",
  },
  {
    id: "06-historique-flux",
    label: "Historique, flux",
    text: "Marge, choisi avant, mise et prochain tirage.",
  },
  {
    id: "07-comite-flux",
    label: "Comité, flux",
    text: "Onze têtes, porte, global et trois séries.",
  },
  {
    id: "08-filtres",
    label: "Filtres",
    text: "Où chaque filtre coupe, et ce qu’il laisse passer.",
  },
] as const

export type SchemaDocId = (typeof SCHEMA_DOCS)[number]["id"]

export type SchemaNodeKind = "person" | "system" | "container" | "component" | "external" | "boundary" | "step"

export type SchemaNode = {
  alias: string
  kind: SchemaNodeKind
  label: string
  description: string | null
}

export type SchemaLink = {
  from: string
  to: string
  fromLabel: string
  toLabel: string
  label: string
  technology: string | null
}

export type SchemaKind = "c4" | "flowchart" | "sequence" | "other"

export type SchemaFigure = {
  index: number
  title: string
  source: string
  kind: SchemaKind
  nodes: SchemaNode[]
  links: SchemaLink[]
}

export type SchemaDoc = {
  id: string
  title: string
  module: string | null
  level: string | null
  revision: string | null
  code: string[]
  figures: SchemaFigure[]
  prose: string
}

const C4_CALLS: { keyword: string; kind: SchemaNodeKind }[] = [
  { keyword: "Enterprise_Boundary", kind: "boundary" },
  { keyword: "System_Boundary", kind: "boundary" },
  { keyword: "Container_Boundary", kind: "boundary" },
  { keyword: "Boundary", kind: "boundary" },
  { keyword: "Person_Ext", kind: "external" },
  { keyword: "SystemQueue_Ext", kind: "external" },
  { keyword: "SystemDb_Ext", kind: "external" },
  { keyword: "System_Ext", kind: "external" },
  { keyword: "SystemQueue", kind: "system" },
  { keyword: "SystemDb", kind: "system" },
  { keyword: "System", kind: "system" },
  { keyword: "Person", kind: "person" },
  { keyword: "ContainerQueue_Ext", kind: "external" },
  { keyword: "ContainerDb_Ext", kind: "external" },
  { keyword: "Container_Ext", kind: "external" },
  { keyword: "ContainerQueue", kind: "container" },
  { keyword: "ContainerDb", kind: "container" },
  { keyword: "Container", kind: "container" },
  { keyword: "ComponentQueue_Ext", kind: "external" },
  { keyword: "ComponentDb_Ext", kind: "external" },
  { keyword: "Component_Ext", kind: "external" },
  { keyword: "ComponentQueue", kind: "component" },
  { keyword: "ComponentDb", kind: "component" },
  { keyword: "Component", kind: "component" },
]

const REL_KEYWORDS = ["Rel_Neighbor", "Rel_Back", "Rel_U", "Rel_D", "Rel_L", "Rel_R", "BiRel", "Rel"]

export function plainSchemaText(text: string) {
  return text
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
}

export function diagramKind(source: string): SchemaKind {
  const line =
    source
      .split("\n")
      .map((item) => item.trim())
      .find((item) => item && !item.startsWith("%%")) ?? ""
  if (/^C4/.test(line)) return "c4"
  if (/^(flowchart|graph)\b/.test(line)) return "flowchart"
  if (/^sequenceDiagram\b/.test(line)) return "sequence"
  return "other"
}

function quoted(source: string, from: number) {
  if (source[from] !== '"') return null
  let value = ""
  for (let i = from + 1; i < source.length; i++) {
    const char = source[i]
    if (char === "\\") {
      value += source[i + 1] ?? ""
      i += 1
      continue
    }
    if (char === '"') return { value, next: i + 1 }
    value += char
  }
  return null
}

function readQuotedArgs(line: string, cursor: number, limit: number) {
  const args: string[] = []
  while (args.length < limit) {
    while (line[cursor] === " " || line[cursor] === ",") cursor += 1
    const arg = quoted(line, cursor)
    if (!arg) break
    args.push(arg.value)
    cursor = arg.next
  }
  return args
}

function callAt(line: string, keyword: string) {
  const start = line.trimStart()
  if (!start.startsWith(`${keyword}(`)) return null
  const offset = line.length - start.length + keyword.length + 1
  const alias = line.slice(offset).match(/^\s*([A-Za-z_][\w]*)\s*,/)
  if (!alias) return null
  return { alias: alias[1], args: readQuotedArgs(line, offset + alias[0].length, 3) }
}

function relAt(line: string, keyword: string) {
  const start = line.trimStart()
  if (!start.startsWith(`${keyword}(`)) return null
  const head = start.slice(keyword.length + 1).match(/^\s*([A-Za-z_][\w]*)\s*,\s*([A-Za-z_][\w]*)\s*,/)
  if (!head) return null
  const cursor = line.length - start.length + keyword.length + 1 + head[0].length
  const args = readQuotedArgs(line, cursor, 2)
  return {
    from: head[1],
    to: head[2],
    label: plainSchemaText(args[0] ?? ""),
    technology: args[1] ? plainSchemaText(args[1]) : null,
  }
}

export function parseC4(source: string): { nodes: SchemaNode[]; links: SchemaLink[] } {
  const nodes: SchemaNode[] = []
  const rawLinks: { from: string; to: string; label: string; technology: string | null }[] = []
  for (const line of source.split("\n")) {
    const relKeyword = REL_KEYWORDS.find((keyword) => line.trimStart().startsWith(`${keyword}(`))
    if (relKeyword) {
      const rel = relAt(line, relKeyword)
      if (rel) rawLinks.push(rel)
      continue
    }
    for (const entry of C4_CALLS) {
      const call = callAt(line, entry.keyword)
      if (!call) continue
      const description =
        entry.kind === "container" || entry.kind === "component"
          ? call.args[2]
          : entry.kind === "external"
            ? (call.args[2] ?? call.args[1])
            : call.args[1]
      nodes.push({
        alias: call.alias,
        kind: entry.kind,
        label: plainSchemaText(call.args[0] ?? call.alias),
        description: description ? plainSchemaText(description) : null,
      })
      break
    }
  }
  const byAlias = new Map(nodes.map((node) => [node.alias, node.label]))
  const links = rawLinks.map((link) => ({
    from: link.from,
    to: link.to,
    fromLabel: byAlias.get(link.from) ?? link.from,
    toLabel: byAlias.get(link.to) ?? link.to,
    label: link.label,
    technology: link.technology,
  }))
  return { nodes, links }
}

function parseFlow(source: string): { nodes: SchemaNode[]; links: SchemaLink[] } {
  const labels = new Map<string, string>()
  const nodeRe =
    /([A-Za-z_][\w]*)\s*(?:\[\s*"([^"]*)"\s*\]|\{\s*"([^"]*)"\s*\}|\(\s*"([^"]*)"\s*\)|\[\(\s*"([^"]*)"\s*\)\]|\(\(\s*"([^"]*)"\s*\)\))/g
  for (const match of source.matchAll(nodeRe)) {
    const label = match.slice(2).find((item) => item != null)
    if (label) labels.set(match[1], plainSchemaText(label))
  }
  const nodes: SchemaNode[] = [...labels.entries()].map(([alias, label]) => ({
    alias,
    kind: "step",
    label,
    description: null,
  }))
  const links: SchemaLink[] = []
  const edgeRe = /([A-Za-z_][\w]*)\s+-->(?:\|([^|]*)\|)?\s*([A-Za-z_][\w]*)/g
  for (const match of source.matchAll(edgeRe)) {
    const label = match[2] ? plainSchemaText(match[2]) : ""
    links.push({
      from: match[1],
      to: match[3],
      fromLabel: labels.get(match[1]) ?? match[1],
      toLabel: labels.get(match[3]) ?? match[3],
      label,
      technology: null,
    })
  }
  return { nodes, links }
}

function parseSequence(source: string): { nodes: SchemaNode[]; links: SchemaLink[] } {
  const labels = new Map<string, string>()
  const links: SchemaLink[] = []
  for (const raw of source.split("\n")) {
    const line = raw.trim()
    const actor = line.match(/^(?:actor|participant)\s+([A-Za-z_][\w]*)(?:\s+as\s+(.+))?$/)
    if (actor) {
      labels.set(actor[1], plainSchemaText(actor[2] ?? actor[1]))
      continue
    }
    const message = line.match(/^([A-Za-z_][\w]*)\s*-{1,2}>{1,2}\s*([A-Za-z_][\w]*)\s*:\s*(.+)$/)
    if (!message) continue
    links.push({
      from: message[1],
      to: message[2],
      fromLabel: message[1],
      toLabel: message[2],
      label: plainSchemaText(message[3]),
      technology: null,
    })
  }
  for (const link of links) {
    if (!labels.has(link.from)) labels.set(link.from, link.from)
    if (!labels.has(link.to)) labels.set(link.to, link.to)
    link.fromLabel = labels.get(link.from) ?? link.from
    link.toLabel = labels.get(link.to) ?? link.to
  }
  const nodes: SchemaNode[] = [...labels.entries()].map(([alias, label]) => ({
    alias,
    kind: "step",
    label,
    description: null,
  }))
  return { nodes, links }
}

export function figureFromSource(index: number, title: string, source: string): SchemaFigure {
  const kind = diagramKind(source)
  const parsed = kind === "c4" ? parseC4(source) : kind === "flowchart" ? parseFlow(source) : kind === "sequence" ? parseSequence(source) : { nodes: [], links: [] }
  return { index, title, source: source.trim(), kind, nodes: parsed.nodes, links: parsed.links }
}

function bullet(markdown: string, name: string) {
  return markdown.match(new RegExp(`^- ${name}\\s*:\\s*(.+)$`, "m"))?.[1]?.trim() ?? null
}

export function parseSchemaMarkdown(id: string, markdown: string): SchemaDoc {
  const title = markdown.match(/^#\s+(.+)$/m)?.[1]?.trim() ?? id
  const codeLine = bullet(markdown, "Code")
  const code = codeLine ? [...codeLine.matchAll(/`([^`]+)`/g)].map((match) => match[1]) : []
  const fences = [...markdown.matchAll(/```mermaid\n([\s\S]*?)```/g)]
  const figures = fences.map((fence, index) => {
    const source = fence[1].trim()
    const mermaidTitle = source.match(/^title\s+(.+)$/m)?.[1]?.trim() ?? null
    const prevEnd = index === 0 ? 0 : (fences[index - 1].index ?? 0) + fences[index - 1][0].length
    const before = markdown.slice(prevEnd, fence.index ?? 0)
    const heading = [...before.matchAll(/^##\s+(.+)$/gm)].at(-1)?.[1]?.trim() ?? null
    const figureTitle = mermaidTitle ?? (index > 0 && heading ? heading : index === 0 ? title : `Schéma ${index + 1}`)
    return figureFromSource(index, figureTitle, source)
  })
  const prose = markdown
    .replace(/^#\s+.+\n+/, "")
    .replace(/^- (?:Module|Niveau|Révision|Code)\s*:.*\n/gm, "")
    .replace(/```mermaid[\s\S]*?```/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
  return {
    id,
    title,
    module: bullet(markdown, "Module"),
    level: bullet(markdown, "Niveau"),
    revision: bullet(markdown, "Révision"),
    code,
    figures,
    prose,
  }
}
