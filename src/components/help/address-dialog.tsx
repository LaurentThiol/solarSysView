"use client"

import { Suspense, useEffect, useId, useRef } from "react"
import { createPortal } from "react-dom"
import { MapPinned } from "lucide-react"

import { AddressCatalog } from "@/components/help/address-catalog"
import { StatusPill } from "@/components/status-pill"
import { isTypingTarget } from "@/lib/help-overlay"
import { useHelpOverlay } from "@/lib/use-help-overlay"

function AddressPill({
  open,
  onClick,
}: {
  open: boolean
  onClick: () => void
}) {
  return (
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
      onClick={onClick}
    />
  )
}

function AddressButtonInner() {
  const { adresse, setAdresse, close, mounted } = useHelpOverlay()
  const open = adresse
  const titleId = useId()
  const searchId = useId()
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (open) close()
        return
      }
      if (event.key !== "a" && event.key !== "A") return
      if (event.altKey || event.ctrlKey || event.metaKey) return
      if (isTypingTarget(event.target)) return
      event.preventDefault()
      setAdresse(!open)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [close, open, setAdresse])

  useEffect(() => {
    if (!open) return
    panelRef.current?.querySelector<HTMLInputElement>('input[type="search"]')?.focus()
  }, [open])

  return (
    <>
      <AddressPill open={open} onClick={() => setAdresse(!open)} />
      {open && mounted && typeof document !== "undefined"
        ? createPortal(
            <div className="fixed inset-0 z-[70] flex items-end justify-center sm:items-center">
              <button
                type="button"
                className="absolute inset-0 bg-black/40"
                aria-label="Fermer l’annuaire d’adresses"
                onClick={close}
              />
              <div
                ref={panelRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                className="relative z-10 max-h-[min(42rem,90vh)] w-full max-w-2xl overflow-auto rounded-t-2xl border border-border bg-card p-4 shadow-2xl sm:rounded-2xl"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 id={titleId} className="text-sm font-semibold tracking-tight">
                      Adresse
                    </h2>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">
                      Pages, onglets (<span className="font-mono">?tab=</span>), overlays du
                      bandeau (<span className="font-mono">?glossaire=</span>,{" "}
                      <span className="font-mono">?adresse=1</span>), fonctions API et raccourcis.
                      Un clic ouvre le chemin ; Copier le garde. Les GET se testent dans un nouvel
                      onglet.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={close}
                    className="rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
                  >
                    Fermer
                  </button>
                </div>
                <div className="mt-3">
                  <AddressCatalog searchId={searchId} />
                </div>
              </div>
            </div>,
            document.body
          )
        : null}
    </>
  )
}

export function AddressButton() {
  return (
    <Suspense fallback={<AddressPill open={false} onClick={() => {}} />}>
      <AddressButtonInner />
    </Suspense>
  )
}
