"use client"

import { Suspense, useEffect, useId, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { BookOpen } from "lucide-react"

import { MemoPanel } from "@/components/analysis/memo-panel"
import { ProbaPanel } from "@/components/analysis/stats-panels"
import { StatusPill } from "@/components/status-pill"
import { PillTabs } from "@/components/ui/pill-tabs"
import { Input } from "@/components/ui/input"
import { filterGlossary, groupedGlossary } from "@/lib/copy"
import {
  GLOSSARY_SECTION_LABELS,
  isTypingTarget,
  lastGlossarySection,
  type GlossarySection,
} from "@/lib/help-overlay"
import { useHelpOverlay } from "@/lib/use-help-overlay"

const GLOSSARY_MENU: { id: GlossarySection; label: string }[] = [
  { id: "vocab", label: GLOSSARY_SECTION_LABELS.vocab },
  { id: "proba", label: GLOSSARY_SECTION_LABELS.proba },
  { id: "memo", label: GLOSSARY_SECTION_LABELS.memo },
]

const SECTION_INTRO: Record<GlossarySection, string> = {
  vocab: "Termes figés pour tout Synchro. L’interface vouvoie.",
  proba: "Référence officielle 5/50 + 2/12 (139 838 160 grilles), indépendante de la fenêtre.",
  memo: "Périodes d’indicateurs groupées comme Technique, plus les biais à ne pas oublier.",
}

function GlossaryPill({
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
          <BookOpen className="size-3.5" />
          <span className="hidden sm:inline">Glossaire</span>
        </span>
      }
      tone={open ? "warn" : "off"}
      dot={false}
      aria-haspopup="dialog"
      aria-expanded={open}
      aria-label="Glossaire"
      title="Vocabulaire, probabilités et mémo. Raccourci « l »."
      onClick={onClick}
    />
  )
}

function GlossaryVocab({ query }: { query: string }) {
  const groups = useMemo(() => groupedGlossary(filterGlossary(query)), [query])
  if (groups.length === 0) {
    return (
      <p className="mt-4 text-xs text-muted-foreground">
        Aucun terme ne correspond à « {query.trim()} ».
      </p>
    )
  }
  return (
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
                <dd className="mt-0.5 text-xs leading-5 text-muted-foreground">{entry.text}</dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
    </div>
  )
}

function GlossaryButtonInner() {
  const { glossary, setGlossary, close } = useHelpOverlay()
  const open = glossary != null
  const section: GlossarySection = glossary ?? "vocab"
  const [query, setQuery] = useState("")
  const titleId = useId()
  const searchId = useId()
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (open) close()
        return
      }
      if (event.key !== "l" && event.key !== "L") return
      if (event.altKey || event.ctrlKey || event.metaKey) return
      if (isTypingTarget(event.target)) return
      event.preventDefault()
      if (open) close()
      else setGlossary(lastGlossarySection())
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [close, open, setGlossary])

  useEffect(() => {
    if (!open) return
    setQuery("")
    const focus =
      section === "vocab"
        ? panelRef.current?.querySelector<HTMLInputElement>('input[type="search"]')
        : panelRef.current
    focus?.focus()
  }, [open, section])

  return (
    <>
      <GlossaryPill
        open={open}
        onClick={() => (open ? close() : setGlossary(lastGlossarySection()))}
      />
      {open && typeof document !== "undefined"
        ? createPortal(
            <div className="fixed inset-0 z-[70] flex items-end justify-center sm:items-center">
              <button
                type="button"
                className="absolute inset-0 bg-black/40"
                aria-label="Fermer le glossaire"
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
                      Glossaire
                    </h2>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">
                      {SECTION_INTRO[section]}
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
                  <PillTabs
                    idPrefix="glossaire"
                    label="Sections du glossaire"
                    value={section}
                    onValueChange={setGlossary}
                    items={GLOSSARY_MENU}
                  />
                </div>
                {section === "vocab" ? (
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
                ) : null}
                {section === "vocab" ? <GlossaryVocab query={query} /> : null}
                {section === "proba" ? (
                  <div className="mt-4">
                    <ProbaPanel />
                  </div>
                ) : null}
                {section === "memo" ? (
                  <div className="mt-4">
                    <MemoPanel />
                  </div>
                ) : null}
              </div>
            </div>,
            document.body
          )
        : null}
    </>
  )
}

export function GlossaryButton() {
  return (
    <Suspense fallback={<GlossaryPill open={false} onClick={() => {}} />}>
      <GlossaryButtonInner />
    </Suspense>
  )
}
