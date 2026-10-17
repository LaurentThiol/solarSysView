import { readFileSync, readdirSync } from "node:fs"
import path from "node:path"

import type { JournalEntry, JournalPr } from "@/lib/journal"

export function readJournalFiles(root = process.cwd()): JournalEntry[] {
  const folder = path.join(root, "docs", "journal")
  const entries: JournalEntry[] = []
  const seed = path.join(folder, "seed.json")
  entries.push(...readJournalJson(seed, "seed"))
  const inbox = path.join(folder, "inbox")
  let names: string[] = []
  try {
    names = readdirSync(inbox)
      .filter((name) => name.endsWith(".json"))
      .sort()
  } catch {
    names = []
  }
  for (const name of names) {
    entries.push(...readJournalJson(path.join(inbox, name), "agent"))
  }
  return entries
}

function readJournalJson(file: string, source: JournalEntry["source"]): JournalEntry[] {
  let payload: unknown
  try {
    payload = JSON.parse(readFileSync(file, "utf8"))
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return []
    throw new Error(`${path.basename(file)} : JSON illisible.`)
  }
  const rows = Array.isArray(payload) ? payload : [payload]
  return rows.map((row) => parseFileEntry(row, source, path.basename(file)))
}

function parseFileEntry(raw: unknown, source: JournalEntry["source"], origin: string): JournalEntry {
  if (!raw || typeof raw !== "object") throw new Error(`${origin} : une fiche est un objet.`)
  const record = raw as Record<string, unknown>
  const text = (key: string) => {
    const value = record[key]
    if (typeof value !== "string" || !value.trim()) throw new Error(`${origin} : ${key} manquant.`)
    return value.trim()
  }
  const prs = parsePrs(record.prs, origin)
  const fileSource = record.source
  return {
    slug: text("slug"),
    happened_on: text("happened_on").slice(0, 10),
    area: text("area"),
    title: text("title"),
    body: text("body"),
    pr_number: typeof record.pr_number === "number" ? record.pr_number : null,
    pr_url: typeof record.pr_url === "string" && record.pr_url.trim() ? record.pr_url.trim() : null,
    prs,
    source: fileSource === "seed" || fileSource === "agent" || fileSource === "dev" ? fileSource : source,
  }
}

function parsePrs(value: unknown, origin: string): JournalPr[] {
  if (value == null) return []
  if (!Array.isArray(value)) throw new Error(`${origin} : prs doit être une liste.`)
  return value.map((item, index) => {
    if (!item || typeof item !== "object") throw new Error(`${origin} : point de PR ${index + 1} illisible.`)
    const point = item as Record<string, unknown>
    if (typeof point.number !== "number") throw new Error(`${origin} : point de PR ${index + 1} sans numéro.`)
    if (typeof point.title !== "string" || !point.title.trim()) {
      throw new Error(`${origin} : point de PR ${index + 1} sans titre.`)
    }
    if (typeof point.merged_on !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(point.merged_on)) {
      throw new Error(`${origin} : point de PR sans date.`)
    }
    return {
      number: point.number,
      title: point.title.trim(),
      merged_on: point.merged_on,
      url: typeof point.url === "string" ? point.url.trim() : "",
    }
  })
}
