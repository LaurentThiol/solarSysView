import type { BrainFiche } from "@/lib/brain/types"

export type BrainNote = {
  id: number | string
  reading_id: number | string
  author: "user" | "brain"
  body: string
  created_at: string
}

export type BrainReading = {
  id: number | string
  catalog_id: string
  handle: string
  lab: string
  params: Record<string, unknown>
  window: Record<string, unknown>
  observed_at: string
  draw_to: string | null
  payload: BrainFiche | Record<string, unknown>
  source: "user" | "agent" | "watchlist"
  thread_id: string | null
  embedding: number[] | null
  embedding_model: string | null
  notes?: BrainNote[]
  local?: boolean
}

const READ_KEY = "synchro-brain-readings"
const WATCH_KEY = "synchro-brain-watchlist"
const WATCH_AT = "synchro-brain-watchlist-at"

function canStore() {
  return typeof window !== "undefined"
}

function readLocal(): BrainReading[] {
  if (!canStore()) return []
  try {
    const raw = localStorage.getItem(READ_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as BrainReading[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function writeLocal(items: BrainReading[]) {
  if (!canStore()) return
  localStorage.setItem(READ_KEY, JSON.stringify(items.slice(0, 400)))
}

export async function listReadings(query?: { handle?: string; lab?: string }): Promise<{
  items: BrainReading[]
  source: "neon" | "local"
}> {
  try {
    const search = new URLSearchParams()
    if (query?.handle) search.set("handle", query.handle)
    if (query?.lab) search.set("lab", query.lab)
    const response = await fetch(`/api/brain/readings?${search}`, { cache: "no-store" })
    if (response.ok) {
      const body = (await response.json()) as { items?: BrainReading[] }
      if (Array.isArray(body.items)) return { items: body.items, source: "neon" }
    }
  } catch {
    /* Neon / API absents */
  }
  let items = readLocal()
  const handleFilter = query?.handle
  const labFilter = query?.lab
  if (handleFilter) {
    items = items.filter((item) => item.handle.replace(/^@/, "") === handleFilter.replace(/^@/, ""))
  }
  if (labFilter) items = items.filter((item) => item.lab === labFilter)
  return { items, source: "local" }
}

export async function saveReading(input: {
  fiche: BrainFiche
  source: BrainReading["source"]
  comment?: string
  threadId?: string | null
}): Promise<BrainReading> {
  const payload = {
    catalog_id: input.fiche.id,
    handle: input.fiche.handle,
    lab: input.fiche.lab,
    params: input.fiche.params,
    window: input.fiche.window,
    draw_to: input.fiche.window.to,
    payload: input.fiche,
    source: input.source,
    thread_id: input.threadId ?? null,
    comment: input.comment ?? null,
  }
  try {
    const response = await fetch("/api/brain/readings", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    })
    if (response.ok) {
      return (await response.json()) as BrainReading
    }
  } catch {
    /* fallback */
  }
  const local: BrainReading = {
    id: `local-${Date.now().toString(36)}`,
    catalog_id: payload.catalog_id,
    handle: payload.handle,
    lab: payload.lab,
    params: payload.params,
    window: payload.window,
    observed_at: new Date().toISOString(),
    draw_to: payload.draw_to,
    payload: input.fiche,
    source: input.source,
    thread_id: payload.thread_id,
    embedding: null,
    embedding_model: null,
    notes: input.comment
      ? [{ id: 1, reading_id: "local", author: "user", body: input.comment, created_at: new Date().toISOString() }]
      : [],
    local: true,
  }
  writeLocal([local, ...readLocal()])
  return local
}

export async function addNote(readingId: number | string, body: string, author: "user" | "brain" = "user") {
  try {
    const response = await fetch(`/api/brain/readings/${readingId}/notes`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ body, author }),
    })
    if (response.ok) return (await response.json()) as BrainNote
  } catch {
    /* local */
  }
  const items = readLocal()
  const next = items.map((item) => {
    if (String(item.id) !== String(readingId)) return item
    const note: BrainNote = {
      id: `n-${Date.now().toString(36)}`,
      reading_id: item.id,
      author,
      body,
      created_at: new Date().toISOString(),
    }
    return { ...item, notes: [...(item.notes ?? []), note] }
  })
  writeLocal(next)
  return next.find((item) => String(item.id) === String(readingId))?.notes?.at(-1) ?? null
}

export function readingsToMarkdown(items: BrainReading[]) {
  const lines = ["# Journal Brain", ""]
  for (const item of items) {
    lines.push(`## ${citationLine(item)}`)
    lines.push(`- ${item.observed_at}${item.draw_to ? ` · jusqu’au ${item.draw_to}` : ""}`)
    lines.push(`- source ${item.source}`)
    const fiche = item.payload as { summary?: string }
    if (fiche && typeof fiche.summary === "string") lines.push(`- ${fiche.summary}`)
    for (const note of item.notes ?? []) {
      lines.push(`- (${note.author}) ${note.body}`)
    }
    lines.push("")
  }
  return lines.join("\n")
}

export function readingsToCsv(items: BrainReading[]) {
  const header = "id,handle,lab,observed_at,draw_to,source,summary"
  const rows = items.map((item) => {
    const summary = String((item.payload as { summary?: string })?.summary ?? "").replace(/"/g, '""')
    return [item.id, item.handle, item.lab, item.observed_at, item.draw_to ?? "", item.source, `"${summary}"`].join(",")
  })
  return [header, ...rows].join("\n")
}

function citationLine(item: BrainReading) {
  return `@${String(item.handle).replace(/^@/, "")}#${item.id}`
}

export function readWatchlist(): string[] {
  if (!canStore()) return []
  try {
    const raw = localStorage.getItem(WATCH_KEY)
    const parsed = JSON.parse(raw || "[]") as string[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function writeWatchlist(ids: string[]) {
  if (!canStore()) return
  localStorage.setItem(WATCH_KEY, JSON.stringify([...new Set(ids)]))
}

export function markWatchlistRun() {
  if (!canStore()) return
  localStorage.setItem(WATCH_AT, new Date().toISOString())
}

export function lastWatchlistRun(): string | null {
  if (!canStore()) return null
  return localStorage.getItem(WATCH_AT)
}

export async function retrieveMemories(text: string, k = 12): Promise<{
  items: Array<BrainReading & { score?: number }>
  ok: boolean
}> {
  try {
    const response = await fetch("/api/brain/retrieve", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text, k, cloud: false }),
    })
    const body = (await response.json().catch(() => null)) as {
      ok?: boolean
      items?: BrainReading[]
    } | null
    if (response.ok && Array.isArray(body?.items)) {
      return { items: body.items, ok: Boolean(body.ok) }
    }
  } catch {
    /* skip RAG if local embed is down */
  }
  return { items: [], ok: false }
}

export const SYNC_ENSURE_EVENT = "synchro:sync-ensure"
