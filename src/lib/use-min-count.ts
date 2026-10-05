"use client"

import { useCallback } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"

import {
  DEFAULT_MIN_COUNT,
  minCountFromParam,
  type MinCount,
} from "@/lib/next/min-count"

/** Seuil de compte dans l’URL (`min`). Le départ, 2, n’écrit pas le paramètre. */
export function useMinCount(): [MinCount, (next: MinCount) => void] {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const min = minCountFromParam(searchParams.get("min"))

  const select = useCallback(
    (next: MinCount) => {
      const params = new URLSearchParams(searchParams.toString())
      if (next === DEFAULT_MIN_COUNT) params.delete("min")
      else params.set("min", String(next))
      const query = params.toString()
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false })
    },
    [pathname, router, searchParams]
  )

  return [min, select]
}
