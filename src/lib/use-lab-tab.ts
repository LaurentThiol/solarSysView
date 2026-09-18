"use client"

import { useCallback } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"

import { asOneOf } from "@/lib/lab-search"

export function useLabTab<T extends string>(
  ids: readonly T[],
  fallback: T,
  param = "tab"
): [T, (id: T) => void] {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const tab = asOneOf(searchParams.get(param), ids) ?? fallback

  const select = useCallback(
    (id: T) => {
      const params = new URLSearchParams(searchParams.toString())
      if (id === fallback) params.delete(param)
      else params.set(param, id)
      const query = params.toString()
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false })
    },
    [fallback, param, pathname, router, searchParams]
  )

  return [tab, select]
}
