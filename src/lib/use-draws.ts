"use client"

import { useEffect, useState } from "react"

import { DRAWS, takeLastDraws, type Draw } from "@/lib/draws"

export type DrawSource = "json" | "neon"
export type DrawEra = "current" | "all" | "year"
export type DrawWindow = DrawEra | "last_20" | "last_50"

type DrawPayload = {
  ok?: boolean
  items?: Draw[]
  source?: string
}

const inflight = new Map<string, Promise<DrawPayload | null>>()

function loadDraws(query: string): Promise<DrawPayload | null> {
  const existing = inflight.get(query)
  if (existing) return existing
  const promise = (async () => {
    const response = await fetch(`/api/draws${query}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    })
    if (!response.ok) return null
    return (await response.json()) as DrawPayload
  })().finally(() => {
    inflight.delete(query)
  })
  inflight.set(query, promise)
  return promise
}

function seedDraws(window: DrawWindow, current: Draw[]) {
  const pool = current.length > 0 ? current : DRAWS
  if (window === "last_20") return takeLastDraws(pool, 20)
  if (window === "last_50") return takeLastDraws(pool, 50)
  return pool
}

function queryFor(window: DrawWindow) {
  if (window === "year") return ""
  if (window === "last_20") return "?last=20"
  if (window === "last_50") return "?last=50"
  return `?era=${window}`
}

export function useDraws(window: DrawWindow = "year") {
  const [draws, setDraws] = useState<Draw[]>(() => seedDraws(window, DRAWS))
  const [source, setSource] = useState<DrawSource>("json")
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const payload = await loadDraws(queryFor(window))
        if (cancelled) return
        if (!payload?.ok || !payload.items?.length) {
          setDraws(seedDraws(window, DRAWS))
          setSource("json")
          return
        }
        const items = [...payload.items].sort((a, b) =>
          b.date.localeCompare(a.date)
        )
        setDraws(seedDraws(window, items))
        setSource("neon")
      } catch {
        if (!cancelled) {
          setDraws(seedDraws(window, DRAWS))
          setSource("json")
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [window])

  return { draws, source, loading }
}
