"use client"

import { useEffect, useState } from "react"

import { DRAWS, type Draw } from "@/lib/draws"

export type DrawSource = "json" | "neon"

export function useDraws(era: "current" | "all" | "year" = "year") {
  const [draws, setDraws] = useState<Draw[]>(DRAWS)
  const [source, setSource] = useState<DrawSource>("json")
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const query = era === "year" ? "" : `?era=${era}`
        const response = await fetch(`/api/draws${query}`, { cache: "no-store" })
        if (!response.ok) return
        const payload = (await response.json()) as {
          ok?: boolean
          items?: Draw[]
          source?: string
        }
        if (cancelled || !payload.ok || !payload.items?.length) return
        setDraws([...payload.items].sort((a, b) => b.date.localeCompare(a.date)))
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
  }, [era])

  return { draws, source, loading }
}
