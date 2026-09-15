"use client"

import { useRouter, useSearchParams } from "next/navigation"

import { HelpTip, type HelpCopy } from "@/components/help"
import { HistoJeuxPanel } from "@/components/jeux/histo-jeux-panel"
import { JeuxPanel } from "@/components/jeux/jeux-panel"

const TABS = [
  {
    id: "solutions",
    label: "Solutions",
    help: {
      title: "Solutions",
      body: "Décompte exact des grilles 5+2 qui respectent les restrictions. Ce n’est pas un pronostic.",
    },
  },
  {
    id: "histoJeux",
    label: "histoJeux",
    help: {
      title: "histoJeux",
      body: "Journal Neon des grilles réellement jouées, datées sur un tirage mardi/vendredi. Le rang se calcule après synchro FDJ.",
    },
  },
] as const

export type JeuxTabId = (typeof TABS)[number]["id"]

function isJeuxTab(value: string | null): value is JeuxTabId {
  return value === "solutions" || value === "histoJeux"
}

export function JeuxLab() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const tab: JeuxTabId = isJeuxTab(searchParams.get("tab")) ? searchParams.get("tab")! : "solutions"

  function selectTab(next: JeuxTabId) {
    const params = new URLSearchParams(searchParams.toString())
    if (next === "solutions") params.delete("tab")
    else params.set("tab", next)
    const query = params.toString()
    router.replace(query ? `/jeux?${query}` : "/jeux", { scroll: false })
  }

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <nav className="flex flex-wrap gap-2" aria-label="Jeux">
        {TABS.map((item) => (
          <span key={item.id} className="inline-flex items-center gap-1">
            <button
              type="button"
              onClick={() => selectTab(item.id)}
              className={`rounded-full border px-3 py-1 text-xs ${
                tab === item.id
                  ? "border-primary bg-primary/15 text-foreground"
                  : "border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              {item.label}
            </button>
            <HelpTip {...(item.help as HelpCopy)} />
          </span>
        ))}
      </nav>
      {tab === "solutions" ? <JeuxPanel /> : <HistoJeuxPanel />}
    </div>
  )
}
