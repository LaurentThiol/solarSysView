import { asDrawDate } from "../draw-date.ts"

export type PendingAnalogs = {
  queryDate: string
  focusDate: string
  axes: string[]
}

export const PENDING_ANALOGS_KEY = "synchro.brain.pending-analogs"

function storage(): Storage | null {
  try {
    const store = (globalThis as { sessionStorage?: Storage }).sessionStorage
    return store ?? null
  } catch {
    return null
  }
}

export function parsePendingAnalogs(raw: unknown): PendingAnalogs | null {
  if (!raw || typeof raw !== "object") return null
  const value = raw as Partial<PendingAnalogs>
  const queryDate = asDrawDate(typeof value.queryDate === "string" ? value.queryDate : null)
  const focusDate = asDrawDate(typeof value.focusDate === "string" ? value.focusDate : null)
  if (!queryDate || !focusDate) return null
  const axes = Array.isArray(value.axes)
    ? value.axes.filter((item): item is string => typeof item === "string" && Boolean(item.trim()))
    : []
  return { queryDate, focusDate, axes }
}

export function readPendingAnalogs(): PendingAnalogs | null {
  const store = storage()
  if (!store) return null
  try {
    const raw = store.getItem(PENDING_ANALOGS_KEY)
    return raw ? parsePendingAnalogs(JSON.parse(raw) as unknown) : null
  } catch {
    return null
  }
}

export function queuePendingAnalogs(payload: PendingAnalogs) {
  const store = storage()
  const parsed = parsePendingAnalogs(payload)
  if (!store || !parsed) return
  store.setItem(PENDING_ANALOGS_KEY, JSON.stringify(parsed))
}

export function takePendingAnalogs(): PendingAnalogs | null {
  const pending = readPendingAnalogs()
  const store = storage()
  if (store) store.removeItem(PENDING_ANALOGS_KEY)
  return pending
}

export function clearPendingAnalogs() {
  storage()?.removeItem(PENDING_ANALOGS_KEY)
}
