"use client"

import { useEffect, useMemo, useRef } from "react"

import { DEFAULT_WARMUP, resolveWindow } from "@/lib/analysis-window"
import { windowMetaFrom } from "@/lib/brain/resolve"
import { SYNC_ENSURE_EVENT } from "@/lib/brain/journal"
import { runWatchlist } from "@/lib/brain/watchlist"
import { fetchHarmo } from "@/lib/harmo"
import { readStoredProposals } from "@/lib/combinations"
import { useDraws } from "@/lib/use-draws"

/** Après `/api/sync/ensure` : chiffres de la watchlist, sans LLM. */
export function WatchlistSync() {
  const { draws, source } = useDraws("current")
  const archive = useMemo(
    () => [...draws].sort((a, b) => a.date.localeCompare(b.date)),
    [draws]
  )
  const running = useRef(false)

  useEffect(() => {
    const onSync = () => {
      if (running.current || !archive.length) return
      const resolved = resolveWindow(archive, { preset: "last_100", warmup: DEFAULT_WARMUP })
      const proposals = readStoredProposals()
      running.current = true
      void runWatchlist({
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
        source,
        grid: proposals[0] ?? null,
        fetchHarmo: (path, params) => fetchHarmo(path, params),
      }).finally(() => {
        running.current = false
      })
    }
    window.addEventListener(SYNC_ENSURE_EVENT, onSync)
    return () => window.removeEventListener(SYNC_ENSURE_EVENT, onSync)
  }, [archive, source])

  return null
}
