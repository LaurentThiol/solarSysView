"use client"

import { useEffect, useState } from "react"

import {
  PREV_CALENDAR_YEAR_PARAM,
  PREV2_CALENDAR_YEAR_PARAM,
  filterCalendarYear,
  newestCalendarYear,
} from "@/lib/analysis-window"
import { DRAWS, takeLastDraws, type Draw } from "@/lib/draws"
import {
  WEEKDAY_API_PARAM,
  filterDrawsByWeekday,
  weekdayApiValue,
  type WeekdayScope,
} from "@/lib/weekday-scope"

export type DrawSource = "json" | "neon"
export type DrawEra = "current" | "all" | "year"
export type DrawWindow = DrawEra | "last_20" | "last_50" | "year_n1" | "year_n2"

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

function offsetCalendarYearDraws(pool: Draw[], offset: number) {
  const reference = newestCalendarYear(DRAWS) ?? newestCalendarYear(pool)
  if (reference == null) return []
  return filterCalendarYear(pool, reference - offset)
}

function seedDraws(window: DrawWindow, current: Draw[], weekday: WeekdayScope = "all") {
  const raw = current.length > 0 ? current : DRAWS
  const pool = filterDrawsByWeekday(raw, weekday)
  if (window === "last_20") return takeLastDraws(pool, 20)
  if (window === "last_50") return takeLastDraws(pool, 50)
  if (window === "year_n1") return offsetCalendarYearDraws(pool, 1)
  if (window === "year_n2") return offsetCalendarYearDraws(pool, 2)
  return pool
}

export function drawsQueryFor(window: DrawWindow, weekday: WeekdayScope = "all") {
  const params = new URLSearchParams()
  if (window === "year_n1") params.set("year", PREV_CALENDAR_YEAR_PARAM)
  else if (window === "year_n2") params.set("year", PREV2_CALENDAR_YEAR_PARAM)
  else if (window === "last_20") params.set("last", "20")
  else if (window === "last_50") params.set("last", "50")
  else if (window !== "year") params.set("era", window)
  const day = weekdayApiValue(weekday)
  if (day) params.set(WEEKDAY_API_PARAM, day)
  const query = params.toString()
  return query ? `?${query}` : ""
}

export function useDraws(window: DrawWindow = "year", weekday: WeekdayScope = "all") {
  const [draws, setDraws] = useState<Draw[]>(() => seedDraws(window, DRAWS, weekday))
  const [source, setSource] = useState<DrawSource>("json")
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const payload = await loadDraws(drawsQueryFor(window, weekday))
        if (cancelled) return
        if (!payload?.ok || !payload.items?.length) {
          setDraws(seedDraws(window, DRAWS, weekday))
          setSource("json")
          return
        }
        const items = [...payload.items].sort((a, b) =>
          b.date.localeCompare(a.date)
        )
        // The API already scoped n-1 or n-2; do not re-filter against the current-year JSON snapshot.
        const scoped = filterDrawsByWeekday(items, weekday)
        const dated = window === "year_n1" || window === "year_n2"
        setDraws(dated ? scoped : seedDraws(window, scoped, weekday))
        setSource("neon")
      } catch {
        if (!cancelled) {
          setDraws(seedDraws(window, DRAWS, weekday))
          setSource("json")
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [window, weekday])

  return { draws, source, loading }
}
