import type { BraveNote } from "./brave-filter"
import { parseChampion, type ChampionRecord } from "./champion"
import type { BraveReply, BraveRequest, IaReply, IaRequest, SaveReply } from "./session"

export const CHAMPION_STORE_KEY = "synchro-run-arcade-champion"

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
    return {
      ok: false,
      error: errorText(body, response.status),
      absent: Boolean(body?.absent),
      retryAfterMs: response.status === 429 ? Number(body?.retryAfterMs) || 1500 : undefined,
    }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "échec", aborted: signal.aborted }
  }
}

function storeLocal(record: ChampionRecord) {
  try {
    window.localStorage.setItem(CHAMPION_STORE_KEY, JSON.stringify(record))
  } catch {
    /* stockage plein ou refusé : Neon reste la trace */
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

/** Neon garde le champion et chaque version de ses skills. Le navigateur en garde une copie. */
export async function saveChampion(record: ChampionRecord): Promise<SaveReply> {
  storeLocal(record)
  try {
    const { response, body } = await postJson("/api/brain/run-arcade/champion", record)
    if (response.ok && body?.ok) return { ok: true, source: "Neon" }
    return { ok: false, error: `${errorText(body, response.status)} · copie gardée dans ce navigateur` }
  } catch (error) {
    return {
      ok: false,
      error: `${error instanceof Error ? error.message : "Neon injoignable"} · copie gardée dans ce navigateur`,
    }
  }
}

/** Dernier champion : celui de Neon, ou la copie du navigateur si elle est plus récente. */
export async function loadChampion(): Promise<ChampionRecord | null> {
  const local = readLocal()
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
  if (!remote) return local
  if (!local) return remote
  return local.savedAt > remote.savedAt ? local : remote
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
