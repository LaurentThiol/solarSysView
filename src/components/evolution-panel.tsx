"use client"

import { useMemo, useState } from "react"

import { ChartDrawProvider, useChartDraw } from "@/components/chart-draw/chart-draw-context"
import { HelpTip, LabelHelp } from "@/components/help"
import { AdminGate } from "@/components/admin-gate"
import { useRegisterCapture } from "@/components/capture"
import { DrawChart } from "@/components/draw-chart"
import { EvolutionDraws } from "@/components/evolution-draws"
import { EvolutionGains } from "@/components/evolution-gains"
import { EvolutionHeat } from "@/components/evolution-heat"
import { EvolutionParity } from "@/components/evolution-parity"
import { EvolutionShape } from "@/components/evolution-shape"
import { FrequencyCard } from "@/components/frequency-card"
import { Card, CardHeader, CardTitle } from "@/components/ui/card"
import { PillTabs } from "@/components/ui/pill-tabs"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select"
import { packEvolution } from "@/lib/capture/pack"
import {
  DRAWS,
  archiveSummary,
  expectedNumberDelay,
  expectedNumberHits,
  expectedStarDelay,
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
import { WINDOW_PRESET_LABELS, filterCalendarYear, newestCalendarYear } from "@/lib/analysis-window"
import { ERA_LABELS } from "@/lib/copy"
import { useDraws, type DrawWindow } from "@/lib/use-draws"

const PERIODS: { id: DrawWindow; label: string }[] = [
  { id: "last_20", label: WINDOW_PRESET_LABELS.last_20 },
  { id: "last_50", label: WINDOW_PRESET_LABELS.last_50 },
  { id: "year", label: WINDOW_PRESET_LABELS.year },
  { id: "year_n1", label: WINDOW_PRESET_LABELS.year_n1 },
  { id: "current", label: ERA_LABELS.current },
  { id: "all", label: ERA_LABELS.all },
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
  const { sketches, chartMeta } = useChartDraw()
  const lastWindow = isLastWindow(period)
  const archive = useMemo(() => {
    if (period === "year_n1") {
      return [...draws].sort((a, b) => b.date.localeCompare(a.date))
    }
    return mergeDraws(draws, DRAWS)
  }, [draws, period])
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
      const year = newestCalendarYear(archive)
      scoped = year != null ? filterCalendarYear(archive, year) : archive
    }
    if (activeMonth === "all") return scoped
    return scoped.filter((draw) => monthOf(draw.date) === activeMonth)
  }, [archive, period, activeMonth])

  const numberBoard = useMemo(
    () => numberFrequencyTable(filtered, archive),
    [filtered, archive]
  )
  const starBoard = useMemo(
    () => starFrequencyTable(filtered, 12, archive),
    [filtered, archive]
  )
  const expectedN = expectedNumberHits(filtered.length)
  const expectedS = expectedStarHits(filtered.length)
  const expectedNDelay = expectedNumberDelay()
  const expectedSDelay = expectedStarDelay()
  const hotNumbers = useMemo(
    () => hottest(numberBoard, 10, { minCount: expectedN }),
    [numberBoard, expectedN]
  )
  const lateNumbers = useMemo(
    () =>
      overdue(numberBoard, 10, {
        minDelay: expectedNDelay,
        exclude: hotNumbers.map((item) => item.value),
      }),
    [numberBoard, expectedNDelay, hotNumbers]
  )
  const hotStars = useMemo(
    () => hottest(starBoard, 6, { minCount: expectedS }),
    [starBoard, expectedS]
  )
  const lateStars = useMemo(
    () =>
      overdue(starBoard, 6, {
        minDelay: expectedSDelay,
        exclude: hotStars.map((item) => item.value),
      }),
    [starBoard, expectedSDelay, hotStars]
  )
  const coverage = numberCoverage(filtered)
  const sumStats = useMemo(() => {
    const series = toDrawSeries(filtered)
    return {
      numbers: summarizeValues(series.map((point) => point.sumNumbers)),
      stars: summarizeValues(series.map((point) => point.sumStars)),
      spread: summarizeValues(series.map((point) => point.spread)),
      consecutive: summarizeValues(series.map((point) => point.consecutive)),
      decades: summarizeValues(series.map((point) => point.decadeOccupied)),
    }
  }, [filtered])

  const periodLabel = PERIODS.find((item) => item.id === period)?.label ?? period
  const bounds = useMemo(() => {
    if (!filtered.length) return { from: null as string | null, to: null as string | null }
    const dates = filtered.map((draw) => draw.date).sort((a, b) => a.localeCompare(b))
    return { from: dates[0] ?? null, to: dates[dates.length - 1] ?? null }
  }, [filtered])

  useRegisterCapture(() =>
    packEvolution({
      period,
      periodLabel,
      month: activeMonth,
      source,
      from: bounds.from,
      to: bounds.to,
      drawCount: filtered.length,
      sketches,
      chartMeta,
    })
  )

  if (loading && draws.length === 0) {
    return <p className="text-sm text-muted-foreground">Chargement des tirages…</p>
  }

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
        {archiveSummary(filtered)} Source{" "}
        {source === "neon" ? "Neon" : "fichier local"}.
      </p>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex w-full flex-col gap-1 sm:flex-1">
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            Fenêtre de travail
            <HelpTip
              title="Fenêtre de travail"
              body="20 ou 50 derniers tirages (tous calendriers), année civile, année n-1, formule actuelle (12 ★), ou tout l’historique. 20/50 se lisent mieux sur la courbe ; l’année et la formule donnent le bruit de fond."
            />
          </span>
          <PillTabs
            label="Fenêtre de travail"
            mode="chips"
            value={period}
            onValueChange={setPeriod}
            items={PERIODS}
          />
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
          label="Sommes moyennes"
          value={
            sumStats.numbers && sumStats.stars
              ? `${formatStat(sumStats.numbers.avg)} · ${formatStat(sumStats.stars.avg)}`
              : "—"
          }
          hint={
            sumStats.numbers && sumStats.stars
              ? `n° ${sumStats.numbers.min}–${sumStats.numbers.max} · ★ ${sumStats.stars.min}–${sumStats.stars.max}`
              : "aucun tirage"
          }
        />
      </section>

      <section className="grid gap-3 sm:grid-cols-3">
        <StatCard
          label="Étendue moyenne"
          value={sumStats.spread ? formatStat(sumStats.spread.avg) : "—"}
          hint={
            sumStats.spread
              ? `n5 − n1 · ${sumStats.spread.min}–${sumStats.spread.max}`
              : "aucun tirage"
          }
        />
        <StatCard
          label="Consécutifs moyens"
          value={sumStats.consecutive ? formatStat(sumStats.consecutive.avg) : "—"}
          hint={
            sumStats.consecutive
              ? `paires n, n+1 · ${sumStats.consecutive.min}–${sumStats.consecutive.max}`
              : "aucun tirage"
          }
        />
        <StatCard
          label="Décennies occupées"
          value={sumStats.decades ? formatStat(sumStats.decades.avg) : "—"}
          hint={
            sumStats.decades
              ? `bandes de 10 touchées · ${sumStats.decades.min}–${sumStats.decades.max}`
              : "aucun tirage"
          }
        />
      </section>

      <DrawChart draws={filtered} />

      <EvolutionGains draws={filtered} />

      <EvolutionParity draws={filtered} />

      <EvolutionShape draws={filtered} />

      <section className="grid gap-4 lg:grid-cols-2">
        <FrequencyCard
          title="Numéros les plus sortis"
          items={hotNumbers}
          empty={filtered.length === 0}
          expected={expectedN}
          noneLabel={`Aucune boule au-dessus de l’attendu (${formatStat(expectedN)}×).`}
          help={{
            title: "Numéros les plus sortis",
            body: "Tableau décroissant des boules 1–50 sorties plus souvent que l’attendu dans la fenêtre (2× sur 20 tirages, 5× sur 50). À fréquence égale, la plus récemment vue est devant. Fréquence observée, pas une prédiction.",
          }}
        />
        <FrequencyCard
          title="Numéros en retard"
          items={lateNumbers}
          empty={filtered.length === 0}
          expectedHint={`Retard attendu ${expectedNDelay} tirages`}
          showDelay
          noneLabel={`Aucun numéro au-delà du retard attendu (${expectedNDelay} tirages).`}
          help={{
            title: "Numéros en retard",
            body: "Tableau décroissant du retard (tirages depuis la dernière sortie), mesuré à la fin de la fenêtre sur tout l’historique connu — pas seulement les 20 ou 50 derniers. Seuls les retards plus longs que l’attente géométrique (10 tirages) sont listés, hors boules déjà classées « plus sorties ». Un retard n’augmente pas la chance au tirage suivant.",
          }}
        />
        <FrequencyCard
          title="Étoiles les plus sorties"
          items={hotStars}
          empty={filtered.length === 0}
          star
          expected={expectedS}
          noneLabel={`Aucune étoile au-dessus de l’attendu (${formatStat(expectedS)}×).`}
          help={{
            title: "Étoiles les plus sorties",
            body: "Tableau décroissant des étoiles 1–12 sorties plus souvent que l’attendu (≈ 3,3× sur 20 tirages, ≈ 8,3× sur 50). Une étoile à 6× n’apparaît pas aussi « en retard ».",
          }}
        />
        <FrequencyCard
          title="Étoiles en retard"
          items={lateStars}
          empty={filtered.length === 0}
          star
          expectedHint={`Retard attendu ${expectedSDelay} tirages`}
          showDelay
          noneLabel={`Aucune étoile au-delà du retard attendu (${expectedSDelay} tirages).`}
          help={{
            title: "Étoiles en retard",
            body: "Tableau décroissant du retard des étoiles, avec le même regard historique que les numéros. Seuls les retards plus longs que l’attente (6 tirages sur 12 ★) sont listés, hors étoiles déjà classées « plus sorties ». Descriptif, pas un signal jouable.",
          }}
        />
      </section>

      <EvolutionHeat
        numbers={numberBoard}
        stars={starBoard}
        empty={filtered.length === 0}
        expectedNumbers={expectedN}
        expectedStars={expectedS}
      />

      {lastWindow ? <EvolutionDraws draws={filtered} /> : null}

      <p className="max-w-2xl text-xs leading-5 text-muted-foreground">
        Chaque tirage est indépendant. Les fréquences, la SMA, les bandes de
        Bollinger, le cumul pair/impair et les totaux de gagnants décrivent la
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
      <ChartDrawProvider host="evolution">
        <EvolutionContent />
      </ChartDrawProvider>
    </AdminGate>
  )
}
