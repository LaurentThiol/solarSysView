import { apiBase } from "@/lib/api-base"

export function freezeDevForStop(): void {
  const root = globalThis.window
  if (!root) return
  root.__synchroFreezeDev?.()
  root.__synchroShowStopped?.()
}

/**
 * Arrête la pile locale sans demander d'abord la route Next.
 * Cette route se compile en dev et allume le badge « Compiling » sur la page
 * encore ouverte ; le process meurt pendant la compilation.
 */
export async function requestLocalStop(
  fetchImpl: typeof fetch = fetch,
  base: string = apiBase()
): Promise<void> {
  freezeDevForStop()
  const root = base.replace(/\/$/, "")
  if (root) {
    try {
      const response = await fetchImpl(`${root}/api/shutdown`, {
        method: "POST",
        cache: "no-store",
        signal: AbortSignal.timeout(2000),
      })
      if (response.ok) return
    } catch {
      // l'API Python est déjà partie, ou elle n'écoute pas
    }
  }
  try {
    await fetchImpl("/api/shutdown", {
      method: "POST",
      cache: "no-store",
      keepalive: true,
    })
  } catch {
    // l'UI peut déjà être en train de s'arrêter
  }
}
