"use client"

import { useMemo, useState } from "react"

import { CurveThumb } from "@/components/chartisme/curve-thumb"
import { FigureThumb } from "@/components/chartisme/figure-thumb"
import { PillTabs } from "@/components/ui/pill-tabs"
import {
  filterChartismeGlossary,
  groupedChartismeGlossary,
  type ChartismeGlossarySide,
} from "@/lib/chartisme/glossary"

const SIDES: { id: "all" | ChartismeGlossarySide; label: string }[] = [
  { id: "all", label: "Toutes" },
  { id: "courbes", label: "Courbes" },
  { id: "figures", label: "Figures" },
]

export function ChartismeGlossary({ query }: { query: string }) {
  const [side, setSide] = useState<(typeof SIDES)[number]["id"]>("all")
  const groups = useMemo(
    () => groupedChartismeGlossary(filterChartismeGlossary(query, side)),
    [query, side]
  )

  return (
    <div className="mt-4">
      <PillTabs
        idPrefix="glossaire-chartisme"
        label="Courbes ou figures"
        mode="chips"
        value={side}
        onValueChange={setSide}
        items={SIDES}
      />
      {groups.length === 0 ? (
        <p className="mt-4 text-xs text-muted-foreground">
          {query.trim()
            ? `Aucune courbe ni figure ne correspond à « ${query.trim()} ».`
            : "Aucune entrée dans cette sélection."}
        </p>
      ) : (
        <div className="mt-4 flex flex-col gap-5">
          {groups.map((group) => (
            <section key={group.id} aria-label={group.label}>
              <h3 className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                {group.label}
              </h3>
              <div className="mt-2 grid gap-3 sm:grid-cols-2">
                {group.entries.map((entry) => (
                  <article
                    key={entry.id}
                    className="flex flex-col rounded-xl border border-border bg-muted/20 p-3"
                  >
                    <h4 className="text-sm font-medium text-foreground">{entry.label}</h4>
                    <div className="mt-2">
                      {entry.side === "figures" ? (
                        <FigureThumb figure={entry.id} plate label={entry.label} />
                      ) : (
                        <CurveThumb kind={entry.id} plate label={entry.label} />
                      )}
                    </div>
                    <p className="mt-2 text-xs leading-5 text-muted-foreground">{entry.text}</p>
                    {entry.signal ? (
                      <p className="mt-1.5 text-[11px] leading-4 text-muted-foreground">
                        Signal : {entry.signal}
                        {entry.target && entry.target !== "—" ? ` · Objectif : ${entry.target}` : ""}
                      </p>
                    ) : null}
                  </article>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}
