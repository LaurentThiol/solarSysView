"use client"

import { useLayoutEffect, useState, type ReactNode } from "react"
import { createPortal } from "react-dom"

export const SITE_HEADER_SLOT_ID = "site-header-slot"

/** Rend un enfant dans la rangée sous le bandeau sticky. */
export function SiteHeaderSlot({ children }: { children: ReactNode }) {
  const [slot, setSlot] = useState<HTMLElement | null>(null)
  useLayoutEffect(() => {
    setSlot(document.getElementById(SITE_HEADER_SLOT_ID))
  }, [])
  if (!slot) return null
  return createPortal(children, slot)
}
