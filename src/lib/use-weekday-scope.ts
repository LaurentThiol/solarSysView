"use client"

import { useCallback, useEffect, useState } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"

import {
  WEEKDAY_QUERY,
  WEEKDAY_STORAGE_KEY,
  asWeekdayScope,
  type WeekdayScope,
} from "@/lib/weekday-scope"

function readStoredScope(): WeekdayScope | null {
  if (typeof window === "undefined") return null
  try {
    return asWeekdayScope(window.sessionStorage.getItem(WEEKDAY_STORAGE_KEY))
  } catch {
    return null
  }
}

function writeStoredScope(scope: WeekdayScope) {
  try {
    window.sessionStorage.setItem(WEEKDAY_STORAGE_KEY, scope)
  } catch {
    /* sessionStorage peut être bloqué */
  }
}

export function useWeekdayScope(): [WeekdayScope, (scope: WeekdayScope) => void] {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const fromUrl = asWeekdayScope(searchParams.get(WEEKDAY_QUERY))
  const [stored, setStored] = useState<WeekdayScope | null>(null)

  useEffect(() => {
    const saved = readStoredScope()
    setStored(saved)
    const params = new URLSearchParams(window.location.search)
    const urlScope = asWeekdayScope(params.get(WEEKDAY_QUERY))
    if (urlScope) {
      writeStoredScope(urlScope)
      setStored(urlScope)
      return
    }
    if (saved && saved !== "all") {
      params.set(WEEKDAY_QUERY, saved)
      const query = params.toString()
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false })
    }
  }, [pathname, router])

  const scope = fromUrl ?? stored ?? "all"

  const setScope = useCallback(
    (next: WeekdayScope) => {
      writeStoredScope(next)
      setStored(next)
      const params = new URLSearchParams(searchParams.toString())
      if (next === "all") params.delete(WEEKDAY_QUERY)
      else params.set(WEEKDAY_QUERY, next)
      const query = params.toString()
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false })
    },
    [pathname, router, searchParams]
  )

  return [scope, setScope]
}
