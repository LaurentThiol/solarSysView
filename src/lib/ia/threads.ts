import { formatCapturedAt, labLabel, type DiagnosticSnapshot } from "../capture/snapshot"
import { providerLabel, type IaChatMessage, type IaProviderId } from "./models"
import { groupIaTurns } from "./turns"

export const MAX_UNPINNED_THREADS = 8
export const THREADS_EXPORT_KIND = "synchro-ia-threads"
export const THREADS_EXPORT_VERSION = 1

export type IaThread = {
  id: string
  updatedAt: string
  title: string
  titleLocked?: boolean
  pinned?: boolean
  provider: IaProviderId
  model?: string
  snapshot: DiagnosticSnapshot
  messages: IaChatMessage[]
}

export type IaThreadsExport = {
  kind: typeof THREADS_EXPORT_KIND
  version: number
  exportedAt: string
  threads: IaThread[]
}

export function capThreads(threads: IaThread[], maxUnpinned = MAX_UNPINNED_THREADS): IaThread[] {
  const pinned = threads.filter((item) => item.pinned)
  const rest = threads.filter((item) => !item.pinned)
  return [...pinned, ...rest.slice(0, maxUnpinned)]
}

export function normalizeThreadTitle(title: string) {
  const text = title.trim().replace(/\s+/g, " ")
  if (!text) return ""
  return text.length > 72 ? `${text.slice(0, 70)}…` : text
}

export function threadTitle(snapshot: DiagnosticSnapshot, question: string) {
  return normalizeThreadTitle(question) || snapshot.summary[0] || snapshot.lab
}

export function mergeThreadRecord(prev: IaThread | undefined, incoming: IaThread): IaThread {
  const titleLocked = Boolean(incoming.titleLocked || prev?.titleLocked)
  return {
    ...incoming,
    title: titleLocked ? (incoming.titleLocked ? incoming.title : prev?.title || incoming.title) : incoming.title,
    titleLocked: titleLocked || undefined,
    pinned: incoming.pinned ?? prev?.pinned,
  }
}

export function upsertThreadList(threads: IaThread[], thread: IaThread): IaThread[] {
  const prev = threads.find((item) => item.id === thread.id)
  const merged = mergeThreadRecord(prev, thread)
  const others = threads.filter((item) => item.id !== thread.id)
  return capThreads([merged, ...others])
}

export function renameThreadIn(threads: IaThread[], id: string, title: string): IaThread[] | null {
  const nextTitle = normalizeThreadTitle(title)
  if (!nextTitle) return null
  if (!threads.some((item) => item.id === id)) return null
  return threads.map((item) =>
    item.id === id ? { ...item, title: nextTitle, titleLocked: true } : item
  )
}

export function deleteThreadIn(threads: IaThread[], id: string): IaThread[] {
  return threads.filter((item) => item.id !== id)
}

export function pinThreadIn(threads: IaThread[], id: string, pinned?: boolean): IaThread[] {
  const current = threads.find((item) => item.id === id)
  if (!current) return threads
  const nextPinned = pinned ?? !current.pinned
  const next = threads.map((item) =>
    item.id === id ? { ...item, pinned: nextPinned || undefined } : item
  )
  const item = next.find((thread) => thread.id === id)
  if (!item) return capThreads(next)
  const others = next.filter((thread) => thread.id !== id)
  return capThreads(nextPinned ? [item, ...others] : [...others, item])
}

export function filterThreads(threads: IaThread[], query: string): IaThread[] {
  const needle = query.trim().toLowerCase()
  if (!needle) return threads
  return threads.filter((thread) => {
    const haystack = [
      thread.title,
      thread.model,
      thread.provider,
      thread.snapshot.lab,
      thread.snapshot.tab,
      thread.snapshot.question,
      ...thread.messages.map((message) => message.content.slice(0, 240)),
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase()
    return haystack.includes(needle)
  })
}

export function mergeThreadLists(current: IaThread[], incoming: IaThread[]): IaThread[] {
  const byId = new Map(current.map((item) => [item.id, item]))
  for (const thread of incoming) {
    const prev = byId.get(thread.id)
    if (!prev) {
      byId.set(thread.id, thread)
      continue
    }
    const incomingNewer = (thread.updatedAt || "") >= (prev.updatedAt || "")
    const newer = incomingNewer ? thread : prev
    const older = incomingNewer ? prev : thread
    byId.set(thread.id, mergeThreadRecord(older, newer))
  }
  return capThreads(
    [...byId.values()].sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""))
  )
}

function isProvider(value: unknown): value is IaProviderId {
  return value === "google" || value === "openai"
}

function isMessage(value: unknown): value is IaChatMessage {
  if (!value || typeof value !== "object") return false
  const item = value as IaChatMessage
  return (item.role === "user" || item.role === "assistant") && typeof item.content === "string"
}

function isSnapshot(value: unknown): value is DiagnosticSnapshot {
  if (!value || typeof value !== "object") return false
  const snapshot = value as DiagnosticSnapshot
  return typeof snapshot.id === "string" && snapshot.id.length > 0
}

export function isIaThread(value: unknown): value is IaThread {
  if (!value || typeof value !== "object") return false
  const thread = value as IaThread
  return (
    typeof thread.id === "string" &&
    thread.id.length > 0 &&
    typeof thread.title === "string" &&
    isProvider(thread.provider) &&
    Array.isArray(thread.messages) &&
    thread.messages.every(isMessage) &&
    isSnapshot(thread.snapshot)
  )
}

export function parseThreadsExport(raw: unknown): IaThread[] {
  if (Array.isArray(raw)) return raw.filter(isIaThread)
  if (!raw || typeof raw !== "object") return []
  const record = raw as Record<string, unknown>
  if (Array.isArray(record.threads)) return record.threads.filter(isIaThread)
  if (isIaThread(raw)) return [raw]
  return []
}

export function stripThreadImages(thread: IaThread, keepThumb = true): IaThread {
  return {
    ...thread,
    snapshot: {
      ...thread.snapshot,
      imageDataUrl: null,
      thumbDataUrl: keepThumb ? thread.snapshot.thumbDataUrl ?? null : null,
    },
  }
}

export function threadsExportPayload(
  threads: IaThread[],
  options: { includeImages?: boolean; exportedAt?: string } = {}
): IaThreadsExport {
  return {
    kind: THREADS_EXPORT_KIND,
    version: THREADS_EXPORT_VERSION,
    exportedAt: options.exportedAt ?? new Date().toISOString(),
    threads: threads.map((thread) =>
      options.includeImages ? thread : stripThreadImages(thread)
    ),
  }
}

export function threadFileSlug(title: string, id: string) {
  const slug =
    title
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-$/g, "")
      .slice(0, 40) || "fil"
  const suffix = id.replace(/^cap-/, "").slice(-8)
  return `synchro-ia-${slug}-${suffix}`
}

function speakerOf(message: IaChatMessage) {
  if (message.role === "user") return "Toi"
  const model = message.model ? ` · ${message.model}` : ""
  return `${providerLabel(message.provider ?? "google")}${model}`
}

export function threadToMarkdown(thread: IaThread) {
  const snapshot = thread.snapshot
  const lab = `${labLabel(snapshot.lab)}${snapshot.tab ? ` · ${snapshot.tab}` : ""}`
  const lines = [
    `# ${thread.title}`,
    "",
    `- Laboratoire : ${lab}`,
    `- Capturé : ${formatCapturedAt(snapshot.capturedAt)}`,
    `- Mis à jour : ${formatCapturedAt(thread.updatedAt)}`,
    `- Modèle : ${providerLabel(thread.provider)}${thread.model ? ` · ${thread.model}` : ""}`,
  ]
  if (thread.pinned) lines.push("- Épinglé")
  if (snapshot.question && snapshot.question !== thread.title) {
    lines.push(`- Question : ${snapshot.question}`)
  }
  lines.push("")
  if (snapshot.summary.length) {
    lines.push("## Contexte", "")
    for (const item of snapshot.summary) lines.push(`- ${item}`)
    lines.push("")
  }
  lines.push("## Conversation", "")
  const turns = groupIaTurns(thread.messages)
  if (!turns.length) {
    lines.push("_Pas encore de réponse._", "")
  }
  for (const turn of turns) {
    if (turn.kind === "user") {
      lines.push(`### Toi`, "", turn.message.content.trim() || "—", "")
      continue
    }
    if (turn.kind === "compare") {
      lines.push("### Comparaison", "")
      lines.push(`**A · ${speakerOf(turn.a)}**`, "", turn.a.content.trim() || "—", "")
      if (turn.b) {
        lines.push(`**B · ${speakerOf(turn.b)}**`, "", turn.b.content.trim() || "—", "")
      }
      continue
    }
    lines.push(`### ${speakerOf(turn.message)}`, "", turn.message.content.trim() || "—", "")
  }
  lines.push("---", "", snapshot.disclaimer)
  lines.push("")
  lines.push("*Export Synchro · lecture IA. Les tirages sont indépendants.*")
  return `${lines.join("\n")}\n`
}
