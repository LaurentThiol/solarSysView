"use client"

import { useEffect, useRef } from "react"

import { DEFAULT_WARMUP, resolveWindow } from "@/lib/analysis-window"
import { windowMetaFrom } from "@/lib/brain/resolve"
import { SYNC_ENSURE_EVENT } from "@/lib/brain/journal"
import { runWatchlist } from "@/lib/brain/watchlist"
import { fetchHarmo } from "@/lib/harmo"
import { readStoredProposals } from "@/lib/combinations"
import type { Draw } from "@/lib/draws"

/** Après `/api/sync/ensure` : chiffres de la watchlist, sans LLM.
 *
 * Ne pas précharger `?era=current` (≈ 2000 tirages) sur chaque page : ça
 * saturait le pool Neon en même temps que Tirage / Évolution / /api/health.
 */
export function WatchlistSync() {
  const running = useRef(false)

  useEffect(() => {
    const onSync = () => {
      if (running.current) return
      running.current = true
      void (async () => {
        try {
          const response = await fetch("/api/draws?era=current", {
            cache: "no-store",
            signal: AbortSignal.timeout(15_000),
          })
          if (!response.ok) return
          const payload = (await response.json()) as {
            ok?: boolean
            items?: Draw[]
            source?: string
          }
          const items = payload.items ?? []
          if (!payload.ok || items.length === 0) return
          const archive = [...items].sort((a, b) => a.date.localeCompare(b.date))
          const resolved = resolveWindow(archive, {
            preset: "last_100",
            warmup: DEFAULT_WARMUP,
          })
          const proposals = readStoredProposals()
          await runWatchlist({
            archive,
            work: resolved.work,
            withWarmup: resolved.withWarmup,
            warmupCount: resolved.warmupCount,
            variable: "sum",
            ball: 7,
            star: 1,
            curveId: "sum",
            periodX: 14,
            window: windowMetaFrom(resolved),
            era: "current",
            source: payload.source === "neon" ? "neon" : "json",
            grid: proposals[0] ?? null,
            fetchHarmo: (path, params) => fetchHarmo(path, params),
          })
        } catch {
          // watchlist best-effort après synchro
        } finally {
          running.current = false
        }
      })()
    }
    window.addEventListener(SYNC_ENSURE_EVENT, onSync)
    return () => window.removeEventListener(SYNC_ENSURE_EVENT, onSync)
  }, [])

  return null
}
