"use client"

import Link from "next/link"
import { Pin } from "lucide-react"

import { SpecialistGlyph } from "@/components/brain/specialist-card"
import { Button } from "@/components/ui/button"
import type { CatalogEntry } from "@/lib/brain/catalog"
import { formatForecast, formatSkill, skillOf, targetGlyph } from "@/lib/brain/specialist-view"
import { formatSpecialistHandle, specialistToEntry, type SpecialistRecord } from "@/lib/brain/specialists"
import { cn } from "@/lib/utils"

export function SpecialistRibbon({
  records,
  pinnedIds,
  onPin,
}: {
  records: SpecialistRecord[]
  pinnedIds: string[]
  onPin: (entry: CatalogEntry) => void
}) {
  return (
    <section id="specialistes" className="scroll-mt-24 rounded-2xl border border-primary/25 bg-card/40 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm font-medium">Réseaux enregistrés</p>
        <span className="text-[11px] text-muted-foreground">
          {records.length ? `${records.length} sur le disque` : "Aucun réseau pour l’instant"}
        </span>
        <Link
          href="/brain/specialistes"
          className="ml-auto inline-flex h-7 items-center rounded-lg border border-border bg-background px-2.5 text-[0.8rem] hover:bg-muted"
        >
          Ouvrir l’atelier
        </Link>
      </div>
      {records.length === 0 ? (
        <p className="mt-2 rounded-xl border border-dashed border-border px-3 py-3 text-xs leading-5 text-muted-foreground">
          L’atelier entraîne un réseau par série nommée. Épinglez-le ensuite pour que Brain le lise.
        </p>
      ) : (
        <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
          {records.map((record) => {
            const entry = specialistToEntry(record)
            const view = formatForecast(record.last_forecast ?? record.forecast)
            const pinned = pinnedIds.includes(entry.id)
            return (
              <article
                key={record.slug}
                className={cn(
                  "flex w-44 shrink-0 flex-col gap-1.5 rounded-xl border px-2.5 py-2",
                  pinned ? "border-primary/45 bg-primary/10" : "border-border/70 bg-background/40"
                )}
              >
                <div className="flex items-center gap-2">
                  <SpecialistGlyph kind={targetGlyph(record.target)} className="size-8 text-primary" />
                  <div className="min-w-0">
                    <p className="truncate text-xs font-medium">{record.name || record.slug}</p>
                    <p className="truncate font-mono text-[10px] text-primary">
                      {formatSpecialistHandle(record.slug || record.handle)}
                    </p>
                  </div>
                </div>
                <p className="font-mono text-xl leading-none">
                  {view.abstain ? "s’abstient" : view.valueLabel}
                </p>
                <p className="text-[10px] text-muted-foreground">
                  {view.sigmaLabel || "—"} · 50 {formatSkill(skillOf(record, "50"))}
                </p>
                <Button size="xs" variant="outline" className="mt-auto w-fit" onClick={() => onPin(entry)}>
                  <Pin />
                  Épingler
                </Button>
              </article>
            )
          })}
        </div>
      )}
    </section>
  )
}
