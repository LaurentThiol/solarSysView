"use client"

import { useEffect, useMemo, useState } from "react"

import { AdminGate } from "@/components/admin-gate"
import { DrawChart } from "@/components/draw-chart"
import { FrequencyCard } from "@/components/frequency-card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select"
import {
  archiveSummary,
  monthOf,
  monthsPresent,
  numberFrequencies,
  starFrequencies,
} from "@/lib/draws"
import { useDraws } from "@/lib/use-draws"

type Era = "year" | "current" | "all"

const ERA_LABELS: Record<Era, string> = {
  year: "Année en cours",
  current: "Formule actuelle (12 ★)",
  all: "Tout l’historique",
}

function EvolutionContent() {
  const [era, setEra] = useState<Era>("year")
  const [month, setMonth] = useState("all")
  const { draws, source, loading } = useDraws(era)
  const monthOptions = useMemo(() => monthsPresent(draws), [draws])

  useEffect(() => {
    if (month !== "all" && !monthOptions.some((item) => item.value === month)) {
      setMonth("all")
    }
  }, [month, monthOptions])

  const filtered = useMemo(() => {
    if (month === "all") return draws
    return draws.filter((draw) => monthOf(draw.date) === month)
  }, [draws, month])

  const hotNumbers = useMemo(() => numberFrequencies(filtered), [filtered])
  const hotStars = useMemo(() => starFrequencies(filtered), [filtered])

  if (loading && draws.length === 0) {
    return <p className="text-sm text-muted-foreground">Chargement des tirages…</p>
  }

  return (
    <div className="flex flex-col gap-6">
      <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
        {archiveSummary(draws)} Source{" "}
        {source === "neon" ? "Neon" : "fichier local"}. Filtre actuel :{" "}
        {filtered.length} tirage{filtered.length > 1 ? "s" : ""}.
      </p>

      <div className="flex flex-col gap-3 sm:flex-row">
        <Select value={era} onValueChange={(value) => setEra(value as Era)}>
          <SelectTrigger className="w-full sm:w-64" aria-label="Période">
            <span className="flex flex-1 text-left">{ERA_LABELS[era]}</span>
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(ERA_LABELS) as Era[]).map((value) => (
              <SelectItem key={value} value={value}>
                {ERA_LABELS[value]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={month} onValueChange={(value) => setMonth(String(value))}>
          <SelectTrigger className="w-full sm:w-52" aria-label="Mois">
            <span className="flex flex-1 text-left">
              {monthOptions.find((item) => item.value === month)?.label ?? "Tous les mois"}
            </span>
          </SelectTrigger>
          <SelectContent>
            {monthOptions.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <DrawChart draws={filtered} />

      <section className="grid gap-4 lg:grid-cols-2">
        <FrequencyCard
          title="Numéros les plus sortis"
          items={hotNumbers}
          empty={filtered.length === 0}
        />
        <FrequencyCard
          title="Étoiles les plus sorties"
          items={hotStars}
          empty={filtered.length === 0}
          star
        />
      </section>
    </div>
  )
}

export function EvolutionPanel() {
  return (
    <AdminGate>
      <EvolutionContent />
    </AdminGate>
  )
}
