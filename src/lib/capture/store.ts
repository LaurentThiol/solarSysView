import {
  pruneCaptureImages,
  rememberVisual,
  withStoredImage,
} from "@/lib/capture/images"
import type { DiagnosticSnapshot, LabId } from "@/lib/capture/snapshot"
import { isModelId, type IaProviderId } from "@/lib/ia/models"
import {
  capThreads,
  deleteThreadIn,
  mergeThreadLists,
  pinThreadIn,
  renameThreadIn,
  upsertThreadList,
  type IaThread,
} from "@/lib/ia/threads"

export type { IaChatMessage, IaProviderId } from "@/lib/ia/models"
export type { IaThread } from "@/lib/ia/threads"
export {
  capThreads,
  filterThreads,
  MAX_UNPINNED_THREADS,
  mergeThreadLists,
  normalizeThreadTitle,
  renameThreadIn,
  threadTitle,
} from "@/lib/ia/threads"

export const CAPTURE_PENDING_EVENT = "synchro-capture-pending"
export const IA_PROVIDER_KEY = "synchro-ia-provider"
export const IA_MODEL_KEY = "synchro-ia-model"
export const IA_COMPARE_KEY = "synchro-ia-compare"
const PENDING_KEY = "synchro-capture-pending"
const THREADS_KEY = "synchro-ia-threads"

export type PendingCapture = {
  snapshot: DiagnosticSnapshot
  autoSend: boolean
}

function canUseStorage() {
  return typeof window !== "undefined"
}

export async function writePending(snapshot: DiagnosticSnapshot, autoSend: boolean) {
  if (!canUseStorage()) return
  const packed = await rememberVisual(snapshot)
  const pending: PendingCapture = { snapshot: packed, autoSend }
  try {
    sessionStorage.setItem(PENDING_KEY, JSON.stringify(pending))
  } catch {
    const slim: PendingCapture = {
      autoSend,
      snapshot: { ...packed, imageDataUrl: null },
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

export async function hydratePending(pending: PendingCapture): Promise<PendingCapture> {
  return { ...pending, snapshot: await withStoredImage(pending.snapshot) }
}

export function clearPending() {
  if (!canUseStorage()) return
  sessionStorage.removeItem(PENDING_KEY)
}

export function readProvider(): IaProviderId | null {
  if (!canUseStorage()) return null
  const value = window.localStorage.getItem(IA_PROVIDER_KEY)
  return value === "google" || value === "openai" || value === "local" ? value : null
}

export function writeProvider(id: IaProviderId) {
  if (!canUseStorage()) return
  window.localStorage.setItem(IA_PROVIDER_KEY, id)
}

type StoredModels = Partial<Record<IaProviderId | "last" | "compare", string>>

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
    if (isModelId(parsed.local)) out.local = parsed.local
    if (isModelId(parsed.last)) out.last = parsed.last
    if (isModelId(parsed.compare)) out.compare = parsed.compare
    return out
  } catch {
    return {}
  }
}

export function readModel(provider: IaProviderId): string | null {
  return readModels()[provider] ?? null
}

export function readLastModel(): string | null {
  const stored = readModels()
  if (isModelId(stored.last)) return stored.last
  return stored.google || stored.openai || stored.local || null
}

export function writeModel(provider: IaProviderId, model: string) {
  if (!canUseStorage() || !isModelId(model)) return
  const next = { ...readModels(), [provider]: model, last: model }
  window.localStorage.setItem(IA_MODEL_KEY, JSON.stringify(next))
}

export function readCompareModel(): string | null {
  const stored = readModels().compare
  return isModelId(stored) ? stored : null
}

export function writeCompareModel(model: string) {
  if (!canUseStorage() || !isModelId(model)) return
  const next = { ...readModels(), compare: model }
  window.localStorage.setItem(IA_MODEL_KEY, JSON.stringify(next))
}

export function readCompareOn() {
  if (!canUseStorage()) return false
  return window.localStorage.getItem(IA_COMPARE_KEY) === "1"
}

export function writeCompareOn(on: boolean) {
  if (!canUseStorage()) return
  window.localStorage.setItem(IA_COMPARE_KEY, on ? "1" : "0")
}

function slimSnapshot(snapshot: DiagnosticSnapshot): DiagnosticSnapshot {
  return {
    ...snapshot,
    imageDataUrl: null,
    thumbDataUrl: snapshot.thumbDataUrl ?? null,
  }
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
  const next = capThreads(threads).map((thread) => ({
    ...thread,
    snapshot: slimSnapshot(thread.snapshot),
  }))
  const persist = (payload: IaThread[]) => {
    window.localStorage.setItem(THREADS_KEY, JSON.stringify(payload))
  }
  try {
    persist(next)
  } catch {
    const withoutThumbs = next.map((thread) => ({
      ...thread,
      snapshot: { ...thread.snapshot, imageDataUrl: null, thumbDataUrl: null },
    }))
    try {
      persist(withoutThumbs)
    } catch {
      persist(withoutThumbs.slice(0, 3))
    }
  }
  void pruneCaptureImages(next.map((thread) => thread.id))
}

export async function upsertThread(thread: IaThread) {
  const snapshot = await rememberVisual(thread.snapshot)
  writeThreads(upsertThreadList(readThreads(), { ...thread, snapshot }))
  return snapshot
}

export function renameThread(id: string, title: string) {
  const next = renameThreadIn(readThreads(), id, title)
  if (!next) return null
  writeThreads(next)
  return readThreads()
}

export function deleteThread(id: string) {
  writeThreads(deleteThreadIn(readThreads(), id))
  return readThreads()
}

export function pinThread(id: string, pinned?: boolean) {
  writeThreads(pinThreadIn(readThreads(), id, pinned))
  return readThreads()
}

export function clearThreads() {
  writeThreads([])
}

export async function importThreads(incoming: IaThread[]) {
  for (const thread of incoming) {
    if (thread.snapshot.imageDataUrl) {
      try {
        await rememberVisual(thread.snapshot)
      } catch {
        // quota : le JSON reste importé sans visuel plein
      }
    }
  }
  writeThreads(mergeThreadLists(readThreads(), incoming))
  return readThreads()
}

export function labOf(snapshot: DiagnosticSnapshot): LabId {
  return snapshot.lab
}

export function keepVisual(from: DiagnosticSnapshot, onto: DiagnosticSnapshot): DiagnosticSnapshot {
  return {
    ...onto,
    imageDataUrl: onto.imageDataUrl || from.imageDataUrl,
    thumbDataUrl: onto.thumbDataUrl || from.thumbDataUrl,
  }
}
