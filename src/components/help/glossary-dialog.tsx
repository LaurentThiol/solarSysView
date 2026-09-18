"use client"

import { useEffect, useId, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { BookOpen } from "lucide-react"

import { StatusPill } from "@/components/status-pill"
import { GLOSSARY } from "@/lib/copy"

export function GlossaryButton() {
  const [open, setOpen] = useState(false)
  const titleId = useId()
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open])

  useEffect(() => {
    if (!open) return
    panelRef.current?.querySelector("button")?.focus()
  }, [open])

  return (
    <>
      <StatusPill
        label={
          <span className="inline-flex items-center gap-1.5">
            <BookOpen className="size-3.5" />
            <span className="hidden sm:inline">Glossaire</span>
          </span>
        }
        tone={open ? "warn" : "off"}
        dot={false}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label="Glossaire"
        title="Vocabulaire Synchro"
        onClick={() => setOpen(true)}
      />
      {open && typeof document !== "undefined"
        ? createPortal(
            <div className="fixed inset-0 z-[70] flex items-end justify-center sm:items-center">
              <button
                type="button"
                className="absolute inset-0 bg-black/40"
                aria-label="Fermer le glossaire"
                onClick={() => setOpen(false)}
              />
              <div
                ref={panelRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                className="relative z-10 max-h-[min(32rem,85vh)] w-full max-w-lg overflow-auto rounded-t-2xl border border-border bg-card p-4 shadow-2xl sm:rounded-2xl"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 id={titleId} className="text-sm font-semibold tracking-tight">
                      Glossaire
                    </h2>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">
                      Termes figés pour tout Synchro. L’interface vouvoie.
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
                <dl className="mt-4 flex flex-col gap-3">
                  {GLOSSARY.map((entry) => (
                    <div key={entry.term}>
                      <dt className="text-xs font-medium text-foreground">{entry.term}</dt>
                      <dd className="mt-0.5 text-xs leading-5 text-muted-foreground">{entry.text}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            </div>,
            document.body
          )
        : null}
    </>
  )
}
