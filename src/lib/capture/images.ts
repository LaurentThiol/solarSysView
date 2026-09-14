import { makeThumbDataUrl } from "@/lib/capture/png"
import type { DiagnosticSnapshot } from "@/lib/capture/snapshot"

const DB_NAME = "synchro-capture"
const STORE = "images"
const VERSION = 1

function canUseIdb() {
  return typeof window !== "undefined" && typeof indexedDB !== "undefined"
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE)
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

export async function putCaptureImage(id: string, dataUrl: string): Promise<void> {
  if (!canUseIdb() || !id || !dataUrl) return
  const db = await openDb()
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite")
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
      tx.objectStore(STORE).put(dataUrl, id)
    })
  } finally {
    db.close()
  }
}

export async function getCaptureImage(id: string): Promise<string | null> {
  if (!canUseIdb() || !id) return null
  const db = await openDb()
  try {
    return await new Promise<string | null>((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly")
      const request = tx.objectStore(STORE).get(id)
      request.onsuccess = () =>
        resolve(typeof request.result === "string" ? request.result : null)
      request.onerror = () => reject(request.error)
    })
  } catch {
    return null
  } finally {
    db.close()
  }
}

export async function pruneCaptureImages(keepIds: string[]): Promise<void> {
  if (!canUseIdb()) return
  const keep = new Set(keepIds)
  const db = await openDb()
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite")
      const store = tx.objectStore(STORE)
      const request = store.openCursor()
      request.onsuccess = () => {
        const cursor = request.result
        if (!cursor) return
        if (!keep.has(String(cursor.key))) cursor.delete()
        cursor.continue()
      }
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  } catch {
    // IndexedDB indisponible : l’historique localStorage reste lisible.
  } finally {
    db.close()
  }
}

export async function withStoredImage(snapshot: DiagnosticSnapshot): Promise<DiagnosticSnapshot> {
  if (snapshot.imageDataUrl) return snapshot
  const image = await getCaptureImage(snapshot.id)
  if (!image) return snapshot
  return { ...snapshot, imageDataUrl: image }
}

export function snapshotVisual(snapshot: DiagnosticSnapshot) {
  return snapshot.imageDataUrl || snapshot.thumbDataUrl || null
}

export function snapshotThumb(snapshot: DiagnosticSnapshot) {
  return snapshot.thumbDataUrl || snapshot.imageDataUrl || null
}

export async function rememberVisual(snapshot: DiagnosticSnapshot): Promise<DiagnosticSnapshot> {
  if (!snapshot.imageDataUrl) return snapshot
  try {
    await putCaptureImage(snapshot.id, snapshot.imageDataUrl)
  } catch {
    // quota IndexedDB : on garde au moins la miniature.
  }
  if (snapshot.thumbDataUrl) return snapshot
  try {
    const thumb = await makeThumbDataUrl(snapshot.imageDataUrl)
    if (thumb) return { ...snapshot, thumbDataUrl: thumb }
  } catch {
    return snapshot
  }
  return snapshot
}
