"use client"

import { useEffect, useId, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { BookOpen } from "lucide-react"

import { StatusPill } from "@/components/status-pill"
import { Input } from "@/components/ui/input"
import { filterGlossary, groupedGlossary } from "@/lib/copy"

export function GlossaryButton() {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const titleId = useId()
  const searchId = useId()
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
    setQuery("")
    panelRef.current?.querySelector<HTMLInputElement>('input[type="search"]')?.focus()
  }, [open])

  const groups = useMemo(() => groupedGlossary(filterGlossary(query)), [query])

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
                className="relative z-10 max-h-[min(36rem,85vh)] w-full max-w-xl overflow-auto rounded-t-2xl border border-border bg-card p-4 shadow-2xl sm:rounded-2xl"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 id={titleId} className="text-sm font-semibold tracking-tight">
                      Glossaire
                    </h2>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">
                      Termes figés pour tout Synchro. L’interface vouvoie. Les tables
                      longues (rangs officiels, périodes d’indicateurs) sont dans Analyse
                      · Glossaire.
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
                <label className="mt-3 block text-xs text-muted-foreground" htmlFor={searchId}>
                  Rechercher
                  <Input
                    id={searchId}
                    type="search"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Fenêtre, warmup, rang…"
                    aria-label="Rechercher dans le glossaire"
                    className="mt-1"
                  />
                </label>
                {groups.length === 0 ? (
                  <p className="mt-4 text-xs text-muted-foreground">
                    Aucun terme ne correspond à « {query.trim()} ».
                  </p>
                ) : (
                  <div className="mt-4 flex flex-col gap-4">
                    {groups.map((group) => (
                      <section key={group.id} aria-label={group.label}>
                        <h3 className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                          {group.label}
                        </h3>
                        <dl className="mt-2 flex flex-col gap-3">
                          {group.entries.map((entry) => (
                            <div key={entry.term}>
                              <dt className="text-xs font-medium text-foreground">{entry.term}</dt>
                              <dd className="mt-0.5 text-xs leading-5 text-muted-foreground">
                                {entry.text}
                              </dd>
                            </div>
                          ))}
                        </dl>
                      </section>
                    ))}
                  </div>
                )}
              </div>
            </div>,
            document.body
          )
        : null}
    </>
  )
}
