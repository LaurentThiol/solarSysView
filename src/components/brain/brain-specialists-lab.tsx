"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"

import { BrainMascot } from "@/components/brain/brain-mascot"
import { BrainSpecialists } from "@/components/brain/brain-specialists"
import { StatusDot } from "@/components/brain/brain-chrome"
import { useRegisterCapture } from "@/components/capture"
import { Badge } from "@/components/ui/badge"
import type { CatalogEntry } from "@/lib/brain/catalog"
import { beatsChanceCount } from "@/lib/brain/specialist-view"
import { specialistIndex, type SpecialistRecord } from "@/lib/brain/specialists"
import { INDEPENDENCE_DISCLAIMER } from "@/lib/capture/snapshot"
import { ERA_LABELS } from "@/lib/copy"
import { WeekdayScopeControl } from "@/components/weekday-scope-control"
import { WeekdaySynthesisCard } from "@/components/weekday-synthesis-card"
import { useDraws } from "@/lib/use-draws"
import { useWeekdayScope } from "@/lib/use-weekday-scope"

export function BrainSpecialistsLab() {
  const [era, setEra] = useState<"current" | "all">("current")
  const [weekday, setWeekday] = useWeekdayScope()
  const { draws, source, loading } = useDraws(era, weekday)
  const [pins, setPins] = useState<CatalogEntry[]>([])
  const [records, setRecords] = useState<SpecialistRecord[]>(() => specialistIndex())
  const beating = beatsChanceCount(records)

  useRegisterCapture(() => ({
    lab: "brain",
    tab: "specialists",
    summary: [
      "Spécialistes Brain",
      `${pins.length} fiche${pins.length > 1 ? "s" : ""} épinglée${pins.length > 1 ? "s" : ""}`,
    ],
    tech: {
      era,
      handles: pins.map((entry) => `@specialist.${entry.handle}`),
    },
    archive: { n: draws.length, source },
  }))

  const pinEntry = (entry: CatalogEntry) => {
    setPins((prev) => (prev.some((item) => item.id === entry.id) ? prev : [...prev, entry]))
  }

  const count = useMemo(() => draws.length, [draws])

  useEffect(() => {
    if (typeof window === "undefined") return
    if (!window.location.hash.toLowerCase().includes("special")) return
    document.getElementById("specialistes")?.scrollIntoView({ behavior: "smooth", block: "start" })
  }, [])

  return (
    <div className="flex min-w-0 flex-col gap-5">
      <section className="flex flex-wrap items-center gap-3 rounded-2xl border border-primary/30 bg-card/50 px-3 py-2">
        <BrainMascot mood="idle" size="sm" />
        <div className="min-w-0">
          <p className="text-sm font-semibold tracking-tight">Atelier des réseaux</p>
          <p className="text-[11px] text-muted-foreground">
            {records.length
              ? `${records.length} réseau${records.length > 1 ? "x" : ""} · ${
                  beating
                    ? `${beating} ${beating > 1 ? "battent" : "bat"} le nul`
                    : "aucun ne bat le nul"
                }`
              : "Aucun réseau enregistré"}
          </p>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <StatusDot
            ok={!loading && count > 0}
            label={loading ? "tirages…" : `${count} tirages · ${source}`}
            hint="L’entraînement lit l’ère formule côté API, bornée au même jour si Mardi ou Vendredi est choisi. La démo n’écrit rien toute seule."
          />
          <WeekdayScopeControl value={weekday} onChange={setWeekday} compact />
          <label className="flex items-center gap-1 text-xs">
            Archive
            <select
              className="rounded-md border border-border bg-background px-2 py-1"
              value={era}
              onChange={(event) => setEra(event.target.value as "current" | "all")}
            >
              <option value="current">{ERA_LABELS.current}</option>
              <option value="all">{ERA_LABELS.all}</option>
            </select>
          </label>
          <Link
            href="/brain"
            className="inline-flex h-7 items-center rounded-lg border border-border bg-background px-2.5 text-[0.8rem] hover:bg-muted"
          >
            Discussion
          </Link>
        </div>
      </section>

      <p className="rounded-xl border border-primary/20 bg-primary/8 px-3 py-2 text-xs leading-5 text-muted-foreground">
        {INDEPENDENCE_DISCLAIMER}
      </p>
      {weekday === "synthese" ? <WeekdaySynthesisCard draws={draws} /> : null}

      {pins.length ? (
        <p className="flex flex-wrap items-center gap-2 text-xs">
          <span className="text-muted-foreground">Sur la table de Brain :</span>
          {pins.map((entry) => (
            <Badge key={entry.id} variant="outline">
              @{entry.aliases.find((alias) => alias.startsWith("specialist.")) ?? `specialist.${entry.handle}`}
            </Badge>
          ))}
          <Link className="text-primary underline-offset-2 hover:underline" href="/brain">
            ouvrir la discussion
          </Link>
        </p>
      ) : null}

      <BrainSpecialists era={era} weekday={weekday} onPin={pinEntry} onIndex={setRecords} />
    </div>
  )
}
