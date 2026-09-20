"use client"

import { useCallback, useEffect } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"

import {
  applyHelpOverlaySearch,
  asGlossarySection,
  isAddressQuery,
  rememberGlossarySection,
  rewriteLegacyHelpSearch,
  type GlossarySection,
} from "@/lib/help-overlay"

export function useHelpOverlay() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const search = searchParams.toString()
  const glossary = asGlossarySection(searchParams.get("glossaire"))
  const adresse = isAddressQuery(searchParams.get("adresse")) && !glossary

  useEffect(() => {
    const next = rewriteLegacyHelpSearch(search)
    if (next == null || next === search) return
    router.replace(next ? `${pathname}?${next}` : pathname, { scroll: false })
  }, [pathname, router, search])

  useEffect(() => {
    if (glossary) rememberGlossarySection(glossary)
  }, [glossary])

  const replace = useCallback(
    (input: { glossary?: GlossarySection | null; adresse?: boolean | null }) => {
      const next = applyHelpOverlaySearch(search, input)
      if (next === search) return
      router.replace(next ? `${pathname}?${next}` : pathname, { scroll: false })
    },
    [pathname, router, search]
  )

  const setGlossary = useCallback(
    (section: GlossarySection | null) => {
      replace({ glossary: section })
    },
    [replace]
  )

  const setAdresse = useCallback(
    (open: boolean) => {
      replace({ adresse: open })
    },
    [replace]
  )

  const close = useCallback(() => {
    replace({ glossary: null, adresse: false })
  }, [replace])

  return { glossary, adresse, setGlossary, setAdresse, close }
}
