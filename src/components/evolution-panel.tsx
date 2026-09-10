"use client"

import { useMemo, useState } from "react"

import { HelpTip, LabelHelp } from "@/components/help"
import { AdminGate } from "@/components/admin-gate"
import { DrawChart } from "@/components/draw-chart"
import { EvolutionDraws } from "@/components/evolution-draws"
import { EvolutionHeat } from "@/components/evolution-heat"
import { FrequencyCard } from "@/components/frequency-card"
import { Card, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select"
import {
  DRAWS,
  archiveSummary,
  expectedNumberHits,
  expectedStarHits,
  hottest,
  mergeDraws,
  monthOf,
  monthsPresent,
  numberCoverage,
  numberFrequencyTable,
  overdue,
  starFrequencyTable,
  summarizeValues,
  takeLastDraws,
  toDrawSeries,
} from "@/lib/draws"
import { useDraws, type DrawWindow } from "@/lib/use-draws"
import { cn } from "@/lib/utils"

const PERIODS: { id: DrawWindow; label: string }[] = [
  { id: "last_20", label: "20 tirages" },
  { id: "last_50", label: "50 tirages" },
  { id: "year", label: "Année en cours" },
  { id: "current", label: "Formule actuelle" },
  { id: "all", label: "Tout l’historique" },
]

function isLastWindow(period: DrawWindow) {
  return period === "last_20" || period === "last_50"
}

function formatStat(value: number, digits = 1) {
  return value.toLocaleString("fr-FR", { maximumFractionDigits: digits })
}

function EvolutionContent() {
  const [period, setPeriod] = useState<DrawWindow>("last_20")
  const [month, setMonth] = useState("all")
  const { draws, source, loading } = useDraws(period)
  const lastWindow = isLastWindow(period)
  const archive = useMemo(() => mergeDraws(draws, DRAWS), [draws])
  const monthOptions = useMemo(() => monthsPresent(archive), [archive])
  const activeMonth = useMemo(() => {
    if (lastWindow) return "all"
    if (month !== "all" && !monthOptions.some((item) => item.value === month)) {
      return "all"
    }
    return month
  }, [lastWindow, month, monthOptions])

  const filtered = useMemo(() => {
    let scoped = archive
    if (period === "last_20") scoped = takeLastDraws(archive, 20)
    else if (period === "last_50") scoped = takeLastDraws(archive, 50)
    else if (period === "year") {
      const year = archive[0]?.date.slice(0, 4)
      scoped = year
        ? archive.filter((draw) => draw.date.startsWith(year))
        : archive
    }
    if (activeMonth === "all") return scoped
    return scoped.filter((draw) => monthOf(draw.date) === activeMonth)
  }, [archive, period, activeMonth])

  const numberBoard = useMemo(() => numberFrequencyTable(filtered), [filtered])
  const starBoard = useMemo(() => starFrequencyTable(filtered), [filtered])
  const hotNumbers = useMemo(() => hottest(numberBoard, 10), [numberBoard])
  const lateNumbers = useMemo(() => overdue(numberBoard, 10), [numberBoard])
  const hotStars = useMemo(() => hottest(starBoard, 6), [starBoard])
  const lateStars = useMemo(() => overdue(starBoard, 6), [starBoard])
  const expectedN = expectedNumberHits(filtered.length)
  const expectedS = expectedStarHits(filtered.length)
  const coverage = numberCoverage(filtered)
  const sumStats = useMemo(() => {
    const series = toDrawSeries(filtered)
    return summarizeValues(series.map((point) => point.sumNumbers))
  }, [filtered])

  if (loading && draws.length === 0) {
    return <p className="text-sm text-muted-foreground">Chargement des tirages…</p>
  }

  return (
    <div className="flex flex-col gap-6">
      <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
        {archiveSummary(filtered)} Source{" "}
        {source === "neon" ? "Neon" : "fichier local"}.
      </p>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex w-full flex-col gap-1 sm:flex-1">
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            Fenêtre
            <HelpTip
              title="Fenêtre"
              body="20 ou 50 derniers tirages (tous calendriers), année civile, formule à 12 étoiles depuis 2016, ou tout l’historique. 20/50 se lisent mieux sur la courbe ; l’année et la formule donnent le bruit de fond."
            />
          </span>
          <nav className="flex flex-wrap gap-2" aria-label="Fenêtre">
            {PERIODS.map((item) => (
              <button
                key={item.id}
                type="button"
                aria-pressed={period === item.id}
                onClick={() => setPeriod(item.id)}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs",
                  period === item.id
                    ? "border-primary bg-primary/15 text-foreground"
                    : "border-border text-muted-foreground hover:text-foreground"
                )}
              >
                {item.label}
              </button>
            ))}
          </nav>
        </div>
        {lastWindow ? null : (
          <LabelHelp
            label="Mois"
            help={{
              title: "Mois",
              body: "Affine la courbe et les fréquences à un mois civil. Masqué sur 20/50 tirages : ces fenêtres sont déjà bornées.",
            }}
          >
            <Select value={activeMonth} onValueChange={(value) => setMonth(String(value))}>
              <SelectTrigger className="w-full sm:w-52" aria-label="Mois">
                <span className="flex flex-1 text-left">
                  {monthOptions.find((item) => item.value === activeMonth)?.label ??
                    "Tous les mois"}
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
          </LabelHelp>
        )}
      </div>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Tirages"
          value={String(filtered.length)}
          hint={
            lastWindow
              ? period === "last_20"
                ? "20 derniers"
                : "50 derniers"
              : activeMonth === "all"
                ? "période choisie"
                : "mois filtré"
          }
        />
        <StatCard
          label="Attendu / boule"
          value={formatStat(expectedN)}
          hint="5/50 par tirage"
        />
        <StatCard
          label="Couverture 1–50"
          value={`${coverage} / 50`}
          hint="boules vues au moins une fois"
        />
        <StatCard
          label="Somme moyenne"
          value={sumStats ? formatStat(sumStats.avg) : "—"}
          hint={
            sumStats
              ? `min ${sumStats.min} · max ${sumStats.max}`
              : "aucun tirage"
          }
        />
      </section>

      <DrawChart draws={filtered} />

      <section className="grid gap-4 lg:grid-cols-2">
        <FrequencyCard
          title="Numéros les plus sortis"
          items={hotNumbers}
          empty={filtered.length === 0}
          expected={expectedN}
          help={{
            title: "Numéros les plus sortis",
            body: "Classement des boules 1–50 les plus fréquentes dans la fenêtre. Comparez au nombre attendu (2× sur 20 tirages, 5× sur 50). Fréquence observée, pas une prédiction.",
          }}
        />
        <FrequencyCard
          title="Numéros en retard"
          items={lateNumbers}
          empty={filtered.length === 0}
          expected={expectedN}
          showDelay
          help={{
            title: "Numéros en retard",
            body: "Plus longtemps absents dans la fenêtre (en nombre de tirages). Un retard n’augmente pas la chance au tirage suivant.",
          }}
        />
        <FrequencyCard
          title="Étoiles les plus sorties"
          items={hotStars}
          empty={filtered.length === 0}
          star
          expected={expectedS}
          help={{
            title: "Étoiles les plus sorties",
            body: "Classement des étoiles 1–12 les plus fréquentes. Attendu ≈ 3,3× sur 20 tirages, ≈ 8,3× sur 50.",
          }}
        />
        <FrequencyCard
          title="Étoiles en retard"
          items={lateStars}
          empty={filtered.length === 0}
          star
          expected={expectedS}
          showDelay
          help={{
            title: "Étoiles en retard",
            body: "Étoiles les plus longtemps absentes dans la fenêtre. Même lecture que les numéros : descriptif, pas un signal jouable.",
          }}
        />
      </section>

      <EvolutionHeat
        numbers={numberBoard}
        stars={starBoard}
        empty={filtered.length === 0}
      />

      {lastWindow ? <EvolutionDraws draws={filtered} /> : null}

      <p className="max-w-2xl text-xs leading-5 text-muted-foreground">
        Chaque tirage est indépendant. Les fréquences et la SMA décrivent la
        fenêtre choisie, elles ne prédisent pas le prochain tirage.
      </p>
    </div>
  )
}

function StatCard({
  label,
  value,
  hint,
}: {
  label: string
  value: string
  hint: string
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <p className="text-xs tracking-wide text-muted-foreground uppercase">
          {label}
        </p>
        <CardTitle className="text-lg font-semibold tracking-tight tabular-nums">
          {value}
        </CardTitle>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </CardHeader>
    </Card>
  )
}

export function EvolutionPanel() {
  return (
    <AdminGate>
      <EvolutionContent />
    </AdminGate>
  )
}
