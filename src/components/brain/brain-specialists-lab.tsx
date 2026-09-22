"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"

import { BrainMascot } from "@/components/brain/brain-mascot"
import { BrainSpecialists } from "@/components/brain/brain-specialists"
import { StatusDot } from "@/components/brain/brain-chrome"
import { useRegisterCapture } from "@/components/capture"
import { Badge } from "@/components/ui/badge"
import type { CatalogEntry } from "@/lib/brain/catalog"
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
      <section className="relative overflow-hidden rounded-3xl border border-primary/30 bg-gradient-to-br from-primary/22 via-chart-5/12 to-card p-5 sm:p-6">
        <div className="pointer-events-none absolute -top-12 -right-6 size-44 rounded-full bg-primary/25 blur-3xl" />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center">
          <BrainMascot mood="idle" size="lg" />
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-medium tracking-[0.18em] text-primary uppercase">Brain</p>
            <p className="mt-1 text-xl font-semibold tracking-tight">Atelier des réseaux</p>
            <p className="mt-1 max-w-xl text-sm leading-6 text-muted-foreground">
              Un réseau, une série nommée (parité, somme…). Prévision t+1, score vs le hasard. Jamais une grille 5+2.
              Un pop-up vous arrête après chaque champ : Suivant ou Annuler. Sans lancer l’entraînement.
            </p>
            <ol className="mt-3 flex flex-wrap gap-2 text-xs">
              <li className="rounded-full border border-primary/35 bg-background/45 px-3 py-1">1. Nommez la question</li>
              <li className="rounded-full border border-primary/35 bg-background/45 px-3 py-1">2. Entraîne</li>
              <li className="rounded-full border border-primary/35 bg-background/45 px-3 py-1">3. Épingle pour Brain</li>
            </ol>
          </div>
          <div className="flex flex-col items-start gap-2 sm:items-end">
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
              Discussion Brain
            </Link>
          </div>
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

      <BrainSpecialists era={era} weekday={weekday} onPin={pinEntry} />
    </div>
  )
}
