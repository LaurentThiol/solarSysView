import type { BraveNote } from "./brave-filter"
import { parseChampion, type ChampionRecord } from "./champion"
import type { BraveReply, BraveRequest, IaReply, IaRequest, SaveReply } from "./session"

export const CHAMPION_STORE_KEY = "synchro-run-arcade-champion"
/** File des champions que Neon n’a pas confirmés : un tableau, le plus ancien d’abord. */
export const UNSENT_STORE_KEY = "synchro-run-arcade-unsent"
/** Champions gardés dans la file. Au-delà, le plus ancien est abandonné, et l’écran le dit. */
export const UNSENT_KEEP = 20
/** Champions relus dans Neon pour reconnaître un doublon à l’import. */
const KNOWN_LIMIT = 50
/** Une page de la liste « Champions déjà écrits ». */
export const CHAMPION_PAGE_SIZE = 20
/** La liste s’arrête aux cinquante plus récents. */
export const CHAMPION_LIST_CEILING = 50
/** Champions masqués dans ce navigateur. Ils restent dans Neon et dans un export. */
const HIDDEN_STORE_KEY = "synchro-run-arcade-ecartes"
const HIDDEN_EMPTY: string[] = []
const hiddenListeners = new Set<() => void>()
let hiddenCache: string[] | null = null

function invalidateHidden() {
  hiddenCache = null
  for (const listener of hiddenListeners) listener()
}

type ErrorBody = { ok?: boolean; error?: unknown; detail?: unknown; absent?: unknown; retryAfterMs?: unknown }

function errorText(body: ErrorBody | null, status: number) {
  if (body && typeof body.error === "string" && body.error) return body.error
  if (body && typeof body.detail === "string" && body.detail) return body.detail
  return `HTTP ${status}`
}

async function postJson(url: string, payload: unknown, signal?: AbortSignal) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
    cache: "no-store",
    signal,
  })
  const body = (await response.json().catch(() => null)) as (ErrorBody & Record<string, unknown>) | null
  return { response, body }
}

export async function askIa(request: IaRequest, signal: AbortSignal): Promise<IaReply> {
  try {
    const { response, body } = await postJson(
      "/api/run-arcade/think",
      { system: request.system, user: request.user, seed: request.seed, image: request.image },
      signal
    )
    if (response.ok && body?.ok && typeof body.text === "string") {
      return {
        ok: true,
        text: body.text,
        latencyMs: Number(body.latencyMs) || 0,
        model: typeof body.model === "string" ? body.model : null,
        vision: Boolean(body.vision),
      }
    }
    return { ok: false, error: errorText(body, response.status), absent: Boolean(body?.absent) }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "échec", aborted: signal.aborted }
  }
}

export async function askBrave(request: BraveRequest, signal: AbortSignal): Promise<BraveReply> {
  try {
    const { response, body } = await postJson("/api/run-arcade/brave", request, signal)
    if (response.ok && body?.ok && Array.isArray(body.results)) {
      return { ok: true, results: body.results as BraveNote[] }
    }
    const wait = Number(body?.retryAfterMs)
    return {
      ok: false,
      error: errorText(body, response.status),
      absent: Boolean(body?.absent),
      // 429 : Brave demande d’attendre. 503 avec une attente : la route ne lit pas encore les tirages cachés.
      retryAfterMs: response.status === 429 ? wait || 1500 : response.status === 503 && wait > 0 ? wait : undefined,
    }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "échec", aborted: signal.aborted }
  }
}

function writeLocal(key: string, text: string | null) {
  try {
    if (text == null) window.localStorage.removeItem(key)
    else window.localStorage.setItem(key, text)
    return true
  } catch {
    return false
  }
}

function readLocal(): ChampionRecord | null {
  try {
    const raw = window.localStorage.getItem(CHAMPION_STORE_KEY)
    return raw ? parseChampion(JSON.parse(raw)) : null
  } catch {
    return null
  }
}

/**
 * Copie du dernier champion dans ce navigateur : un champion plus ancien, importé d’un fichier, ne prend pas sa place.
 * Faux si le navigateur la refuse (stockage plein, navigation privée).
 */
function storeLocal(record: ChampionRecord) {
  const last = readLocal()
  if (last && last.savedAt > record.savedAt) return true
  return writeLocal(CHAMPION_STORE_KEY, JSON.stringify(record))
}

/** Même champion : même génération, même runner, même date d’écriture. */
export function sameChampion(
  left: Pick<ChampionRecord, "generation" | "runner" | "savedAt">,
  right: Pick<ChampionRecord, "generation" | "runner" | "savedAt">
) {
  return left.generation === right.generation && left.runner === right.runner && left.savedAt === right.savedAt
}

/** Identité d’un champion écarté, dans la clé de ce navigateur. */
export function championHideKey(item: Pick<ChampionRecord, "generation" | "runner" | "savedAt">) {
  return `${item.generation}\u0000${item.runner}\u0000${item.savedAt}`
}

/** Champions écartés de la liste dans ce navigateur. Liste vide si le stockage est illisible. */
export function readHiddenChampions(): string[] {
  try {
    const raw = window.localStorage.getItem(HIDDEN_STORE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter((item): item is string => typeof item === "string" && item.length > 0)
  } catch {
    return []
  }
}

/** Masque un champion dans ce navigateur. Faux si le stockage refuse l’écriture. Rien n’est effacé dans Neon. */
export function hideChampion(item: Pick<ChampionRecord, "generation" | "runner" | "savedAt">) {
  const key = championHideKey(item)
  const keys = readHiddenChampions()
  if (keys.includes(key)) return true
  const wrote = writeLocal(HIDDEN_STORE_KEY, JSON.stringify([...keys, key]))
  if (wrote) invalidateHidden()
  return wrote
}

/** Remet les champions écartés dans la liste de ce navigateur. */
export function restoreHiddenChampions() {
  const wrote = writeLocal(HIDDEN_STORE_KEY, null)
  if (wrote) invalidateHidden()
  return wrote
}

/** La liste des écartés, pour l’écran. Le tableau vide est toujours le même objet. */
export function hiddenChampionsSnapshot() {
  if (typeof window === "undefined") return HIDDEN_EMPTY
  if (hiddenCache) return hiddenCache
  const keys = readHiddenChampions()
  hiddenCache = keys.length === 0 ? HIDDEN_EMPTY : keys
  return hiddenCache
}

export function hiddenChampionsServerSnapshot() {
  return HIDDEN_EMPTY
}

export function subscribeHiddenChampions(listener: () => void) {
  hiddenListeners.add(listener)
  const onStorage = (event: StorageEvent) => {
    if (event.key === HIDDEN_STORE_KEY) {
      hiddenCache = null
      listener()
    }
  }
  window.addEventListener("storage", onStorage)
  return () => {
    hiddenListeners.delete(listener)
    window.removeEventListener("storage", onStorage)
  }
}

function readQueueText() {
  try {
    return window.localStorage.getItem(UNSENT_STORE_KEY)
  } catch {
    return null
  }
}

function parseQueue(raw: string | null): ChampionRecord[] {
  if (!raw) return []
  try {
    const items: unknown = JSON.parse(raw)
    if (!Array.isArray(items)) return []
    return items.flatMap((item) => {
      const record = parseChampion(item)
      return record ? [record] : []
    })
  } catch {
    return []
  }
}

/** Champions que Neon n’a pas confirmés, le plus ancien d’abord. */
export function readUnsent() {
  return parseQueue(readQueueText())
}

export type UnsentState = { items: readonly ChampionRecord[]; sending: boolean }

const NO_UNSENT: UnsentState = { items: [], sending: false }
const unsentListeners = new Set<() => void>()
let unsentView: { raw: string | null; sending: boolean; state: UnsentState } = {
  raw: null,
  sending: false,
  state: NO_UNSENT,
}
/** Écritures en cours vers Neon : pendant ce temps, la file n’est pas à renvoyer. */
let sending = 0

function unsentChanged() {
  for (const listener of unsentListeners) listener()
}

/** Même objet tant que ni le texte gardé ni les envois n’ont changé : useSyncExternalStore l’exige. */
export function unsentState(): UnsentState {
  const raw = readQueueText()
  const busy = sending > 0
  if (raw === unsentView.raw && busy === unsentView.sending) return unsentView.state
  const items = raw === unsentView.raw ? unsentView.state.items : parseQueue(raw)
  const state = { items, sending: busy }
  unsentView = { raw, sending: busy, state }
  return state
}

export function serverUnsentState() {
  return NO_UNSENT
}

export function subscribeUnsent(listener: () => void) {
  unsentListeners.add(listener)
  const onStorage = (event: StorageEvent) => {
    if (event.key === UNSENT_STORE_KEY) listener()
  }
  window.addEventListener("storage", onStorage)
  return () => {
    unsentListeners.delete(listener)
    window.removeEventListener("storage", onStorage)
  }
}

function storeUnsent(items: readonly ChampionRecord[]) {
  const stored = writeLocal(UNSENT_STORE_KEY, items.length > 0 ? JSON.stringify(items) : null)
  if (stored) unsentChanged()
  return stored
}

/** Le champion entre dans la file avant d’être envoyé : une page fermée pendant l’envoi ne le perd pas. */
function enqueue(record: ChampionRecord) {
  const others = readUnsent().filter((item) => !sameChampion(item, record))
  return storeUnsent([...others, record])
}

function dequeue(record: ChampionRecord) {
  const queue = readUnsent()
  const left = queue.filter((item) => !sameChampion(item, record))
  if (left.length !== queue.length) storeUnsent(left)
}

/** Garde les `UNSENT_KEEP` plus récents. Rend le nombre de champions abandonnés. */
function trimUnsent() {
  const queue = readUnsent()
  const dropped = Math.max(0, queue.length - UNSENT_KEEP)
  if (dropped === 0) return 0
  return storeUnsent(queue.slice(dropped)) ? dropped : 0
}

async function whileSending<T>(job: () => Promise<T>): Promise<T> {
  sending += 1
  unsentChanged()
  try {
    return await job()
  } finally {
    sending -= 1
    unsentChanged()
  }
}

type Written = { ok: true; duplicate: boolean } | { ok: false; error: string }

async function postChampion(record: ChampionRecord): Promise<Written> {
  try {
    const { response, body } = await postJson("/api/brain/run-arcade/champion", record)
    if (response.ok && body?.ok) return { ok: true, duplicate: body.duplicate === true }
    return { ok: false, error: errorText(body, response.status) }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Neon injoignable" }
  }
}

function localNote(kept: boolean, dropped: number) {
  if (!kept) return "copie navigateur impossible : ce champion n’est gardé nulle part, exportez-le"
  const note = "copie gardée dans ce navigateur, « Réessayer l’écriture » la renvoie"
  return dropped > 0 ? `${note}. La file garde ${UNSENT_KEEP} champions : le plus ancien est abandonné` : note
}

/** Écrit dans Neon. Le champion reste dans la file du navigateur tant que Neon ne l’a pas confirmé. */
async function writeChampion(record: ChampionRecord): Promise<Written> {
  const copy = storeLocal(record)
  const queued = enqueue(record)
  const sent = await postChampion(record)
  if (sent.ok) {
    dequeue(record)
    return sent
  }
  const dropped = queued ? trimUnsent() : 0
  return { ok: false, error: `${sent.error} · ${localNote(copy && queued, dropped)}` }
}

/** Neon garde le champion et chaque version de ses skills. Le navigateur en garde une copie, tant que Neon ne répond pas. */
export function saveChampion(record: ChampionRecord): Promise<SaveReply> {
  return whileSending(async () => {
    const written = await writeChampion(record)
    return written.ok ? { ok: true as const, source: "Neon" } : written
  })
}

export type RetryResult = { sent: number; left: number; text: string; written: ChampionRecord[] }

function retryText(sent: number, left: number, refused: string | null) {
  const written = sent === 1 ? "1 champion écrit dans Neon" : `${sent} champions écrits dans Neon`
  if (left === 0) return sent > 0 ? `${written}.` : "Aucun champion à renvoyer."
  const waiting = left === 1 ? "1 champion reste non écrit" : `${left} champions restent non écrits`
  return `${sent > 0 ? `${written}. ` : ""}${waiting}${refused ? ` : ${refused}` : ""}.`
}

/** Renvoie la file à Neon, le plus ancien d’abord : le dernier écrit reste le plus récent pour Neon. */
export function retryUnsent(): Promise<RetryResult> {
  return whileSending(async () => {
    const written: ChampionRecord[] = []
    let refused: string | null = null
    for (const record of readUnsent()) {
      const reply = await postChampion(record)
      if (reply.ok) {
        dequeue(record)
        written.push(record)
      } else {
        refused = reply.error
      }
    }
    const left = readUnsent().length
    return { sent: written.length, left, text: retryText(written.length, left, refused), written }
  })
}

async function fetchChampions(options?: { limit?: number; page?: number }): Promise<ChampionRecord[] | null> {
  try {
    const params = new URLSearchParams()
    if (options?.limit != null) params.set("limit", String(options.limit))
    else if (options?.page != null) params.set("page", String(options.page))
    const query = params.toString()
    const url = query ? `/api/brain/run-arcade/champions?${query}` : "/api/brain/run-arcade/champions"
    const response = await fetch(url, { cache: "no-store" })
    if (!response.ok) return null
    const body = (await response.json()) as { items?: unknown }
    if (!Array.isArray(body.items)) return null
    return body.items.flatMap((item) => {
      const record = parseChampion(item)
      return record ? [record] : []
    })
  } catch {
    return null
  }
}

/**
 * Une page de champions déjà écrits, du plus récent au plus ancien.
 * Page 1 : les vingt plus récents. La page 3 s’arrête au plafond de cinquante. Liste vide si Neon ne répond pas.
 */
export async function listChampions(page = 1): Promise<ChampionRecord[]> {
  const safe = Number.isInteger(page) && page > 0 ? page : 1
  return (await fetchChampions({ page: safe })) ?? []
}

export type ImportOutcome = { state: "écrit" | "déjà écrit" | "non écrit"; text: string }

/** Écrit un champion importé, sauf s’il est déjà dans Neon (même génération, même runner, même date d’écriture). */
export function importChampion(record: ChampionRecord): Promise<ImportOutcome> {
  return whileSending(async () => {
    const name = `génération ${record.generation} · ${record.runner}`
    const already: ImportOutcome = { state: "déjà écrit", text: `${name} est déjà dans Neon : rien n’est réécrit.` }
    const known = await fetchChampions({ limit: KNOWN_LIMIT })
    if (known?.some((item) => sameChampion(item, record))) {
      dequeue(record)
      return already
    }
    const written = await writeChampion(record)
    if (!written.ok) return { state: "non écrit", text: `${name} n’est pas écrit dans Neon : ${written.error}.` }
    return written.duplicate ? already : { state: "écrit", text: `${name} est écrit dans Neon.` }
  })
}

/** Dernier champion : le plus récent entre Neon, la copie du navigateur et la file des champions non écrits. */
export async function loadChampion(): Promise<ChampionRecord | null> {
  let remote: ChampionRecord | null = null
  try {
    const response = await fetch("/api/brain/run-arcade/champion", { cache: "no-store" })
    if (response.ok) {
      const body = (await response.json()) as { champion?: unknown }
      remote = parseChampion(body.champion)
    }
  } catch {
    remote = null
  }
  const candidates = [remote, readLocal(), ...readUnsent()].filter((item): item is ChampionRecord => item != null)
  return candidates.reduce<ChampionRecord | null>(
    (best, item) => (best == null || item.savedAt > best.savedAt ? item : best),
    null
  )
}

/** Relit un fichier exporté. Un JSON qui n’est pas un champion est refusé. */
export function readChampionFile(text: string): ChampionRecord | null {
  try {
    return parseChampion(JSON.parse(text))
  } catch {
    return null
  }
}

export function exportChampion(record: ChampionRecord) {
  const blob = new Blob([JSON.stringify(record, null, 2)], { type: "application/json" })
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = `runarcade-generation-${record.generation}-${record.runner}.json`
  link.click()
  URL.revokeObjectURL(url)
}
