"use client"

import { useEffect, useId, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { MapPinned } from "lucide-react"

import { AddressCatalog } from "@/components/help/address-catalog"
import { StatusPill } from "@/components/status-pill"

function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    target.isContentEditable
  )
}

export function AddressButton() {
  const [open, setOpen] = useState(false)
  const titleId = useId()
  const searchId = useId()
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false)
        return
      }
      if (event.key !== "a" && event.key !== "A") return
      if (event.altKey || event.ctrlKey || event.metaKey) return
      if (isTypingTarget(event.target)) return
      event.preventDefault()
      setOpen((current) => !current)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  useEffect(() => {
    if (!open) return
    panelRef.current?.querySelector<HTMLInputElement>('input[type="search"]')?.focus()
  }, [open])

  return (
    <>
      <StatusPill
        label={
          <span className="inline-flex items-center gap-1.5">
            <MapPinned className="size-3.5" />
            <span className="hidden sm:inline">Adresse</span>
          </span>
        }
        tone={open ? "warn" : "off"}
        dot={false}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label="Adresse"
        title="Annuaire des pages, onglets et API. Raccourci « a »."
        onClick={() => setOpen(true)}
      />
      {open && typeof document !== "undefined"
        ? createPortal(
            <div className="fixed inset-0 z-[70] flex items-end justify-center sm:items-center">
              <button
                type="button"
                className="absolute inset-0 bg-black/40"
                aria-label="Fermer l’annuaire d’adresses"
                onClick={() => setOpen(false)}
              />
              <div
                ref={panelRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                className="relative z-10 max-h-[min(40rem,88vh)] w-full max-w-2xl overflow-auto rounded-t-2xl border border-border bg-card p-4 shadow-2xl sm:rounded-2xl"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 id={titleId} className="text-sm font-semibold tracking-tight">
                      Adresse
                    </h2>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">
                      Pages, onglets (<span className="font-mono">?tab=</span>), fonctions API et
                      raccourcis. La table longue est aussi dans Analyse · Adresse.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    className="rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
                  >
                    Fermer
                  </button>
                </div>
                <div className="mt-3">
                  <AddressCatalog compact searchId={searchId} />
                </div>
              </div>
            </div>,
            document.body
          )
        : null}
    </>
  )
}
