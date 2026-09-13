import type { DiagnosticSnapshot, LabId } from "@/lib/capture/snapshot"
import { IMAGE_MAX_CHARS } from "@/lib/capture/snapshot"
import { isModelId, type IaChatMessage, type IaProviderId } from "@/lib/ia/models"

export type { IaChatMessage, IaProviderId } from "@/lib/ia/models"

export const CAPTURE_PENDING_EVENT = "synchro-capture-pending"
export const IA_PROVIDER_KEY = "synchro-ia-provider"
export const IA_MODEL_KEY = "synchro-ia-model"
const PENDING_KEY = "synchro-capture-pending"
const THREADS_KEY = "synchro-ia-threads"
const MAX_THREADS = 8

export type IaThread = {
  id: string
  updatedAt: string
  title: string
  provider: IaProviderId
  model?: string
  snapshot: DiagnosticSnapshot
  messages: IaChatMessage[]
}

export type PendingCapture = {
  snapshot: DiagnosticSnapshot
  autoSend: boolean
}

function canUseStorage() {
  return typeof window !== "undefined"
}

export function writePending(snapshot: DiagnosticSnapshot, autoSend: boolean) {
  if (!canUseStorage()) return
  const pending: PendingCapture = { snapshot, autoSend }
  try {
    sessionStorage.setItem(PENDING_KEY, JSON.stringify(pending))
  } catch {
    const slim: PendingCapture = {
      autoSend,
      snapshot: { ...snapshot, imageDataUrl: null },
    }
    sessionStorage.setItem(PENDING_KEY, JSON.stringify(slim))
  }
  window.dispatchEvent(new Event(CAPTURE_PENDING_EVENT))
}

export function readPending(): PendingCapture | null {
  if (!canUseStorage()) return null
  const raw = sessionStorage.getItem(PENDING_KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw) as PendingCapture
  } catch {
    return null
  }
}

export function clearPending() {
  if (!canUseStorage()) return
  sessionStorage.removeItem(PENDING_KEY)
}

export function readProvider(): IaProviderId | null {
  if (!canUseStorage()) return null
  const value = window.localStorage.getItem(IA_PROVIDER_KEY)
  return value === "google" || value === "openai" ? value : null
}

export function writeProvider(id: IaProviderId) {
  if (!canUseStorage()) return
  window.localStorage.setItem(IA_PROVIDER_KEY, id)
}

type StoredModels = Partial<Record<IaProviderId, string>>

export function readModels(): StoredModels {
  if (!canUseStorage()) return {}
  const raw = window.localStorage.getItem(IA_MODEL_KEY)
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw) as StoredModels
    if (!parsed || typeof parsed !== "object") return {}
    const out: StoredModels = {}
    if (isModelId(parsed.google)) out.google = parsed.google
    if (isModelId(parsed.openai)) out.openai = parsed.openai
    return out
  } catch {
    return {}
  }
}

export function readModel(provider: IaProviderId): string | null {
  return readModels()[provider] ?? null
}

export function writeModel(provider: IaProviderId, model: string) {
  if (!canUseStorage() || !isModelId(model)) return
  const next = { ...readModels(), [provider]: model }
  window.localStorage.setItem(IA_MODEL_KEY, JSON.stringify(next))
}

function slimSnapshot(snapshot: DiagnosticSnapshot): DiagnosticSnapshot {
  const image = snapshot.imageDataUrl
  if (image && image.length > IMAGE_MAX_CHARS / 3) {
    return { ...snapshot, imageDataUrl: null }
  }
  return snapshot
}

export function readThreads(): IaThread[] {
  if (!canUseStorage()) return []
  const raw = window.localStorage.getItem(THREADS_KEY)
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw) as IaThread[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function writeThreads(threads: IaThread[]) {
  if (!canUseStorage()) return
  const next = threads.slice(0, MAX_THREADS).map((thread) => ({
    ...thread,
    snapshot: slimSnapshot(thread.snapshot),
  }))
  try {
    window.localStorage.setItem(THREADS_KEY, JSON.stringify(next))
  } catch {
    const withoutImages = next.map((thread) => ({
      ...thread,
      snapshot: { ...thread.snapshot, imageDataUrl: null },
    }))
    try {
      window.localStorage.setItem(THREADS_KEY, JSON.stringify(withoutImages))
    } catch {
      window.localStorage.setItem(THREADS_KEY, JSON.stringify(withoutImages.slice(0, 3)))
    }
  }
}

export function upsertThread(thread: IaThread) {
  const others = readThreads().filter((item) => item.id !== thread.id)
  writeThreads([thread, ...others])
}

export function threadTitle(snapshot: DiagnosticSnapshot, question: string) {
  const text = question.trim() || snapshot.summary[0] || snapshot.lab
  return text.length > 72 ? `${text.slice(0, 70)}…` : text
}

export function labOf(snapshot: DiagnosticSnapshot): LabId {
  return snapshot.lab
}
