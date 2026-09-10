"use client"

import { useEffect, useState } from "react"

import { DRAWS, takeLastDraws, type Draw } from "@/lib/draws"

export type DrawSource = "json" | "neon"
export type DrawEra = "current" | "all" | "year"
export type DrawWindow = DrawEra | "last_20" | "last_50"

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
        const response = await fetch(`/api/draws${queryFor(window)}`, {
          cache: "no-store",
        })
        if (!response.ok) return
        const payload = (await response.json()) as {
          ok?: boolean
          items?: Draw[]
          source?: string
        }
        if (cancelled || !payload.ok || !payload.items?.length) return
        const items = [...payload.items].sort((a, b) =>
          b.date.localeCompare(a.date)
        )
        setDraws(seedDraws(window, items))
        setSource("neon")
      } catch {
        // JSON local
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
