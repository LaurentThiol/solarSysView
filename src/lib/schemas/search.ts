import { foldGlossaryQuery } from "@/lib/copy"
import { figureFromSource } from "@/lib/schemas/parse"

export type SchemaSearchDiagram = {
  label: string | null
  source: string
}

export type SchemaSearchInput = {
  href: string
  card: string
  moduleLabel: string
  diagrams: SchemaSearchDiagram[]
}

export type SchemaLabelRecord = {
  href: string
  card: string
  moduleLabel: string
  diagram: string | null
  snippet: string
}

export type SchemaSearchCard = {
  href: string
  card: string
  snippets: string[]
}

export type SchemaSearchGroup = {
  moduleLabel: string
  cards: SchemaSearchCard[]
}

function remember(seen: Set<string>, snippet: string) {
  const text = snippet.replace(/\s+/g, " ").trim()
  if (!text || seen.has(text)) return null
  seen.add(text)
  return text
}

/** Libellés de nœuds, de liens et titres de cartes, dans l’ordre du catalogue. */
export function collectSchemaLabels(docs: SchemaSearchInput[]): SchemaLabelRecord[] {
  const records: SchemaLabelRecord[] = []
  for (const doc of docs) {
    const seen = new Set<string>()
    const card = remember(seen, doc.card)
    if (card) {
      records.push({
        href: doc.href,
        card: doc.card,
        moduleLabel: doc.moduleLabel,
        diagram: null,
        snippet: card,
      })
    }
    for (const diagram of doc.diagrams) {
      const figure = figureFromSource(0, diagram.label ?? doc.card, diagram.source)
      const pieces = [
        ...figure.nodes.flatMap((node) => [node.label, node.description ?? ""]),
        ...figure.links.flatMap((link) => [link.label, link.technology ?? "", link.fromLabel, link.toLabel]),
      ]
      for (const piece of pieces) {
        const snippet = remember(seen, piece)
        if (!snippet || snippet === doc.card) continue
        records.push({
          href: doc.href,
          card: doc.card,
          moduleLabel: doc.moduleLabel,
          diagram: diagram.label,
          snippet,
        })
      }
    }
  }
  return records
}

/** Une requête vide ne filtre pas. La recherche ignore les accents. */
export function searchSchemaLabels(records: SchemaLabelRecord[], query: string): SchemaSearchGroup[] {
  const needle = foldGlossaryQuery(query).trim()
  if (!needle) return []
  const groups: SchemaSearchGroup[] = []
  const byModule = new Map<string, SchemaSearchGroup>()
  const byCard = new Map<string, SchemaSearchCard>()
  for (const record of records) {
    const haystack = foldGlossaryQuery(`${record.snippet} ${record.card}`)
    const moduleHit = foldGlossaryQuery(record.moduleLabel).includes(needle)
    const textHit = haystack.includes(needle)
    if (!textHit && !moduleHit) continue
    let group = byModule.get(record.moduleLabel)
    if (!group) {
      group = { moduleLabel: record.moduleLabel, cards: [] }
      byModule.set(record.moduleLabel, group)
      groups.push(group)
    }
    let card = byCard.get(record.href)
    if (!card) {
      card = { href: record.href, card: record.card, snippets: [] }
      byCard.set(record.href, card)
      group.cards.push(card)
    }
    if (textHit && record.snippet !== record.card && !card.snippets.includes(record.snippet)) {
      card.snippets.push(record.snippet)
    }
  }
  return groups
}
