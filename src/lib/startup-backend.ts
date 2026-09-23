import { HEALTH_TIMEOUT_MS } from "@/lib/api-base"
import { llmFetch } from "@/lib/ia/loopback-fetch"

export type BackendStatus = {
  ok: boolean
  url: string
  error?: string
  health?: {
    ok?: boolean
    alive?: boolean
    neon?: Record<string, unknown>
    draws?: number | null
    latest?: Record<string, unknown> | null
    last_sync?: Record<string, unknown> | null
    stale?: boolean | null
    expected_draw_date?: string | null
  } | null
}

function probeError(error: unknown) {
  const message = error instanceof Error ? error.message : "injoignable"
  if (/aborted due to timeout|\btimeout\b/i.test(message)) return "délai dépassé"
  if (/ECONNREFUSED|ENOTFOUND|EHOSTUNREACH/i.test(message)) return "arrêtée"
  return message
}

/** L’API est vivante dès que /api/alive répond. Neon lent ne la fait pas passer pour arrêtée. */
export async function backendStatus(url: string): Promise<BackendStatus> {
  if (!url) return { ok: false, url: "", error: "API locale non configurée" }
  try {
    const alive = await llmFetch(`${url}/api/alive`, { cache: "no-store" }, 8_000)
    if (!alive.ok) return { ok: false, url, error: `alive HTTP ${alive.status}` }
  } catch (error) {
    return { ok: false, url, error: probeError(error) }
  }
  try {
    const healthRes = await llmFetch(`${url}/api/health`, { cache: "no-store" }, HEALTH_TIMEOUT_MS)
    const health = (await healthRes.json().catch(() => null)) as BackendStatus["health"]
    return { ok: true, url, health }
  } catch (error) {
    return {
      ok: true,
      url,
      health: {
        ok: false,
        alive: true,
        neon: {
          ok: false,
          configured: true,
          error: `Santé Neon : ${probeError(error)}`,
        },
      },
    }
  }
}
