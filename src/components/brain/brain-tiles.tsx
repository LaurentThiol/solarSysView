"use client"

import { Sparkles } from "lucide-react"

import { LAB_TONE } from "@/components/brain/brain-chrome"
import { SpecialistGlyph } from "@/components/brain/specialist-card"
import { CurveThumb } from "@/components/chartisme/curve-thumb"
import { FigureThumb } from "@/components/chartisme/figure-thumb"
import { catalogByHandle, type CatalogEntry, type NamedPack } from "@/lib/brain/catalog"
import { targetGlyph } from "@/lib/brain/specialist-view"
import { cn } from "@/lib/utils"

export function CatalogThumb({ entry, className }: { entry: CatalogEntry; className?: string }) {
  if (entry.kind === "figure") return <FigureThumb figure={entry.handle} className={className} />
  if (entry.kind === "variable") return <CurveThumb kind={entry.handle} className={className} />
  if (entry.kind === "specialist") {
    return (
      <SpecialistGlyph
        kind={targetGlyph(entry.defaults.variable ?? entry.handle)}
        className={cn("size-8 text-primary", className)}
      />
    )
  }
  return (
    <span
      className={cn(
        "inline-flex size-8 shrink-0 items-center justify-center rounded-lg border text-[10px] font-semibold uppercase",
        LAB_TONE[entry.lab],
        className
      )}
      aria-hidden
    >
      {entry.label.slice(0, 2)}
    </span>
  )
}

export function packEntries(handles: string[]): CatalogEntry[] {
  const seen = new Set<string>()
  const entries: CatalogEntry[] = []
  for (const handle of handles) {
    const entry = catalogByHandle(handle)[0]
    if (!entry || seen.has(entry.id)) continue
    seen.add(entry.id)
    entries.push(entry)
  }
  return entries
}

export function PackTile({ pack, onPin }: { pack: NamedPack; onPin: () => void }) {
  const entries = packEntries(pack.handles)
  return (
    <button
      type="button"
      className="rounded-2xl border border-primary/25 bg-primary/8 px-2.5 py-2 text-left hover:border-primary/50 hover:bg-primary/14"
      onClick={onPin}
    >
      <span className="flex items-center gap-1.5 text-xs font-medium">
        <Sparkles className="size-3.5 text-primary" />
        Kit {pack.label}
      </span>
      <span className="mt-1.5 flex flex-wrap items-center gap-1">
        {entries.map((entry) => (
          <span key={entry.id} className="inline-flex rounded-md bg-background/80 p-0.5 ring-1 ring-border">
            <CatalogThumb entry={entry} />
          </span>
        ))}
      </span>
    </button>
  )
}
