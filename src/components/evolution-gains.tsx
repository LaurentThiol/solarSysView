"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Area, CartesianGrid, ComposedChart, Line, XAxis, YAxis } from "recharts"

import { CoordHud } from "@/components/chart-draw/coord-hud"
import { SketchPlotLayers } from "@/components/chart-draw/sketch-layers"
import { SketchToolbar } from "@/components/chart-draw/sketch-toolbar"
import { useSketchChart } from "@/components/chart-draw/use-sketch-chart"
import { HelpTip, LabelHelp, TitleHelp, type HelpCopy } from "@/components/help"
import { WeekdayDot, WeekdaySplitLegend } from "@/components/weekday-split"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  ChartContainer,
  ChartTooltip,
  type ChartConfig,
} from "@/components/ui/chart"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select"
import { isRailFigure } from "@/lib/chartisme/catalog"
import { channelLabel } from "@/lib/chart-draw"
import {
  overlayBands,
  overlayField,
  overlayPeriodFor,
  overlayRecord,
  readOverlay,
} from "@/lib/draw-overlays"
import {
  NUMBER_SUM_RANGE,
  PRIZE_RANK_LABELS,
  PRIZE_RANKS,
  finiteNumbers,
  formatCompactCount,
  formatCompactEuro,
  formatCount,
  formatDrawDate,
  formatEuro,
  formatRank1Step,
  formatShortDate,
  isPrizeRank,
  logDomain,
  logPlotValue,
  massRankKey,
  pairedFinite,
  pearsonCorrelation,
  summarizeValues,
  toGainsChart,
  weekdayMean,
  type Draw,
  type GainsChartPoint,
  type GainsScope,
} from "@/lib/draws"
import {
  WEEKDAY_LINE_COLOR,
  normalizeDrawWeekday,
  weekdayLineDash,
  weekdaySplitFields,
  type DrawWeekday,
} from "@/lib/weekday-scope"
import { cn } from "@/lib/utils"

type GainsView = "winners" | "jackpot" | "mass" | "stack" | "report"

type SeriesKey =
  | "winnersFr"
  | "winnersEu"
  | "winnersExFr"
  | "winnersR1"
  | "winnersR13"
  | "jackpot"
  | "prizeR13"
  | "massFr"
  | "massEu"
  | "massR1"
  | "massR13"
  | "sumNumbers"
  | "reportLength"
  | "rank1"
  | string

type ChartPoint = GainsChartPoint & Record<string, number | string | null>

const VIEWS: { value: GainsView; label: string }[] = [
  { value: "winners", label: "Gagnants" },
  { value: "jackpot", label: "Jackpot €" },
  { value: "mass", label: "Masse €" },
  { value: "stack", label: "Empilée" },
  { value: "report", label: "Report" },
]

const STACK_KEYS = [...PRIZE_RANKS].reverse().map((rank) => massRankKey(rank))

function viewKeys(view: GainsView, scope: GainsScope): SeriesKey[] {
  if (view === "winners") {
    const keys: SeriesKey[] = ["winnersFr", "winnersEu", "winnersExFr"]
    if (scope === "totals") keys.push("winnersR1", "winnersR13")
    keys.push("sumNumbers")
    return keys
  }
  if (view === "jackpot") return ["jackpot", "prizeR13", "sumNumbers"]
  if (view === "mass") {
    const keys: SeriesKey[] = ["massFr", "massEu"]
    if (scope === "totals") keys.push("massR1", "massR13")
    keys.push("sumNumbers")
    return keys
  }
  if (view === "stack") return STACK_KEYS
  return ["reportLength", "jackpot", "rank1"]
}

function rankColor(rank: number) {
  if (rank === 1) return "var(--chart-1)"
  if (rank === 13) return "var(--chart-3)"
  const hue = (55 + (rank - 2) * 24) % 360
  return `oklch(0.66 0.13 ${hue})`
}

const chartConfig = {
  winnersFr: { label: "FR", color: "var(--chart-1)" },
  winnersEu: { label: "EU", color: "var(--chart-2)" },
  winnersExFr: { label: "Hors FR", color: "var(--chart-3)" },
  winnersR1: { label: "R1", color: "var(--chart-1)" },
  winnersR13: { label: "R13", color: "var(--chart-3)" },
  jackpot: { label: "Jackpot", color: "var(--chart-1)" },
  prizeR13: { label: "Rapport R13", color: "var(--chart-3)" },
  massFr: { label: "Masse FR", color: "var(--chart-1)" },
  massEu: { label: "Masse EU", color: "var(--chart-2)" },
  massR1: { label: "Masse R1", color: "var(--chart-1)" },
  massR13: { label: "Masse R13", color: "var(--chart-3)" },
  sumNumbers: { label: "Somme n°", color: "var(--chart-5)" },
  reportLength: { label: "Longueur report", color: "var(--chart-4)" },
  rank1: { label: "1er rang", color: "oklch(0.68 0.18 25)" },
  overlayMardi: { label: "Mardi", color: WEEKDAY_LINE_COLOR.mardi },
  overlayVendredi: { label: "Vendredi", color: WEEKDAY_LINE_COLOR.vendredi },
  sma: { label: "SMA", color: "var(--chart-2)" },
  ...Object.fromEntries(
    PRIZE_RANKS.map((rank) => [
      massRankKey(rank),
      { label: `R${rank}`, color: rankColor(rank) },
    ])
  ),
} satisfies ChartConfig

const TITLE_HELP: HelpCopy = {
  title: "Évolution dans le temps · gains",
  wide: true,
  body: `Même famille que la courbe des boules, pour les gains FDJ de la fenêtre.

• Gagnants : effectifs FR, EU, Hors FR. EU comprend la France. On n’additionne pas FR et EU. Sur les totaux, R1 et R13 se comparent en échelle log (quelques gagnants du jackpot vs des centaines de milliers au rang 13).
• Jackpot € : montant du rang 1 (0 = report). Rapport R13 à côté, surtout en log.
• Masse € : gagnants × rapport. Empilée : les 13 rangs empilés (EU).
• Report : longueur de la série sans gagnant du jackpot (1, 2, 3…), pas seulement le 0/+1 des boules.
• Mardi / vendredi : les mises ne sont pas les mêmes ; le filtre sépare les deux soirs.

La somme des 5 numéros reste sur l’axe droit (15–240). Dessin libre chartiste comme sur les sommes. SMA optionnelle. Les tirages restent indépendants.`,
}

const VIEW_HELP: HelpCopy = {
  title: "Lecture",
  body: "Gagnants : têtes de colonnes FR / EU, plus R1 / R13 sur les totaux. Jackpot : gros lot vs rapport du rang 13. Masse : argent distribué. Empilée : contribution de chaque rang. Report : combien de tirages le jackpot a roulé.",
}

const SCOPE_HELP: HelpCopy = {
  title: "Périmètre",
  body: "Totaux des 13 rangs, ou un rang FDJ (1 = jackpot, 13 = 2 numéros). Le fichier local n’a souvent que le rang 1 ; Neon porte l’échelle complète.",
}

const LOG_HELP: HelpCopy = {
  title: "Échelle log",
  body: "Les totaux écrasent le jackpot (quelques gagnants, millions d’euros) contre le rang 13 (des centaines de milliers de gagnants, quelques euros). La log les met sur le même graphique. 0 (report) sort de l’échelle.",
}

const SERIES_HELP: Record<string, HelpCopy> = {
  winnersFr: {
    title: "Gagnants FR",
    body: "Somme des gagnants France du périmètre. Cliquez pour masquer. Maj+clic : cette courbe seule.",
  },
  winnersEu: {
    title: "Gagnants EU",
    body: "Total Europe, France comprise. Ce n’est pas FR + un reste. Cliquez pour masquer. Maj+clic : cette courbe seule.",
  },
  winnersExFr: {
    title: "Hors FR",
    body: "EU − FR, sans double compte. Cliquez pour afficher. Maj+clic : cette courbe seule.",
  },
  winnersR1: {
    title: "Gagnants R1",
    body: "Effectif Europe du jackpot. À lire contre R13, surtout en log.",
  },
  winnersR13: {
    title: "Gagnants R13",
    body: "Effectif Europe du rang 13 (2 numéros). Des ordres de grandeur au-dessus du jackpot.",
  },
  jackpot: {
    title: "Jackpot",
    body: "Rapport du rang 1. 0 € = report. Cliquez pour masquer. Maj+clic : cette courbe seule.",
  },
  prizeR13: {
    title: "Rapport R13",
    body: "Rapport unitaire du rang 13. En log, on le voit à côté du jackpot.",
  },
  massFr: {
    title: "Masse FR",
    body: "Gagnants France × rapport, sommé sur le périmètre.",
  },
  massEu: {
    title: "Masse EU",
    body: "Gagnants Europe × rapport (France comprise).",
  },
  massR1: {
    title: "Masse R1",
    body: "Masse Europe du jackpot (gagnants × rapport). 0 si report.",
  },
  massR13: {
    title: "Masse R13",
    body: "Masse Europe du rang 13. Souvent comparable au jackpot, pour une tout autre raison (volume × petit rapport).",
  },
  sumNumbers: {
    title: "Somme des numéros",
    body: "n1+n2+n3+n4+n5 (15 à 240). Axe de droite, toujours linéaire.",
  },
  reportLength: {
    title: "Longueur de report",
    body: "Nombre de tirages consécutifs sans gagnant du jackpot. 0 le soir où quelqu’un gagne. La série 0/+1 des boules dit seulement s’il y a report ; ici on compte la longueur.",
  },
  rank1: {
    title: "1er rang",
    body: "Même pas que sur la courbe des boules : 0 = gagnant, +1 = report.",
  },
}

const SMA_HELP: HelpCopy = {
  title: "SMA",
  body: "Moyenne simple sur la période auto (5 tirages si la fenêtre a au moins 10 points, 10 si au moins 40). Lissage descriptif, pas une prédiction.",
}

function defaultHidden(view: GainsView): Partial<Record<string, boolean>> {
  if (view === "winners") return { winnersExFr: true, winnersR1: true, winnersR13: true }
  if (view === "jackpot") return { prizeR13: true }
  if (view === "mass") return { massFr: true, massR1: true, massR13: true }
  if (view === "report") return { rank1: true }
  return {}
}

function parseScope(value: string): GainsScope {
  if (value === "totals") return "totals"
  const rank = Number(value)
  return isPrizeRank(rank) ? rank : "totals"
}

function scopeValue(scope: GainsScope): string {
  return scope === "totals" ? "totals" : String(scope)
}

function formatStat(value: number, digits = 1) {
  return value.toLocaleString("fr-FR", {
    maximumFractionDigits: digits,
    minimumFractionDigits: 0,
  })
}

function formatR(value: number) {
  return value.toLocaleString("fr-FR", {
    signDisplay: "exceptZero",
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  })
}

function isEuroKey(key: SeriesKey) {
  return (
    key === "jackpot" ||
    key === "prizeR13" ||
    key === "massFr" ||
    key === "massEu" ||
    key === "massR1" ||
    key === "massR13" ||
    String(key).startsWith("massR")
  )
}

function isSumKey(key: SeriesKey) {
  return key === "sumNumbers"
}

function seriesLabelOf(key: SeriesKey) {
  return chartConfig[key as keyof typeof chartConfig]?.label ?? String(key)
}

function seriesColorOf(key: SeriesKey) {
  return chartConfig[key as keyof typeof chartConfig]?.color ?? "var(--chart-2)"
}

function seriesHelpOf(key: SeriesKey): HelpCopy {
  if (SERIES_HELP[key]) return SERIES_HELP[key]
  const match = /^massR(\d+)$/.exec(String(key))
  if (match) {
    const rank = Number(match[1])
    return {
      title: `Masse R${rank}`,
      body: `Gagnants Europe × rapport du rang ${rank} (${PRIZE_RANK_LABELS[rank]}). Couche de l’empilement.`,
    }
  }
  return { title: String(key), body: "Série de gains." }
}

function formatSeriesValue(key: SeriesKey, value: number | null | undefined) {
  if (value == null || typeof value !== "number" || !Number.isFinite(value)) return "—"
  if (key === "jackpot" && value === 0) return "Report"
  if (key === "rank1") return formatRank1Step(value)
  if (key === "reportLength") {
    return value === 0 ? "0 · gagné" : `${formatStat(value, 0)} tirage${value > 1 ? "s" : ""}`
  }
  if (isEuroKey(key)) return formatEuro(value)
  if (key === "sumNumbers") return formatStat(value)
  return formatCount(value)
}

function formatTick(view: GainsView, value: number, sumAxis: boolean) {
  if (sumAxis) return formatStat(value, 0)
  if (view === "winners" || view === "report") return formatCompactCount(value)
  return formatCompactEuro(value)
}

function overlayValues(series: GainsChartPoint[], key: SeriesKey): number[] | null {
  const values = series.map((point) => point[key])
  if (values.some((value) => value == null || typeof value !== "number" || !Number.isFinite(value))) {
    return null
  }
  return values as number[]
}

function asNumber(value: string | number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null
}

function weekdayTag(value: string | null | undefined) {
  const day = String(value ?? "").toLowerCase()
  if (day === "mardi") return "mardi"
  if (day === "vendredi") return "vendredi"
  return null
}

function GainsTooltip({
  active,
  payload,
  label,
  keys,
  hidden,
  smaPeriod,
  showSma,
}: {
  active?: boolean
  payload?: Array<{
    dataKey?: string | number
    payload?: ChartPoint
  }>
  label?: string
  keys: SeriesKey[]
  hidden: Partial<Record<string, boolean>>
  smaPeriod: number
  showSma: boolean
}) {
  if (!active || !payload?.length) return null
  const point = payload[0]?.payload
  if (!point) return null
  const day = weekdayTag(String(point.weekday ?? ""))

  return (
    <div className="grid min-w-0 max-w-[min(18rem,calc(100vw-2rem))] items-start gap-1.5 rounded-lg border border-border/50 bg-background px-2.5 py-1.5 text-xs shadow-xl">
      <div className="font-medium">
        {formatDrawDate(String(label ?? point.date))}
        {day ? ` · ${day}` : ""}
      </div>
      <div className="grid gap-1.5">
        {keys
          .filter((key) => !hidden[key])
          .map((key) => {
            const value = point[key]
            const sma = showSma ? readOverlay(point, key, "sma") : null
            return (
              <div key={key} className="grid gap-0.5">
                <div className="flex items-center gap-2">
                  <span
                    className="size-2.5 shrink-0 rounded-[2px]"
                    style={{ background: seriesColorOf(key) }}
                  />
                  <span className="flex-1 text-muted-foreground">{seriesLabelOf(key)}</span>
                  <span className="font-mono font-medium tabular-nums">
                    {typeof value === "number" ? formatSeriesValue(key, value) : "—"}
                  </span>
                </div>
                {showSma ? (
                  <div className="flex items-center gap-2 pl-4 text-muted-foreground">
                    <span className="flex-1">SMA {smaPeriod}</span>
                    <span className="font-mono tabular-nums">
                      {sma == null ? "—" : formatSeriesValue(key, sma)}
                    </span>
                  </div>
                ) : null}
              </div>
            )
          })}
        {typeof point.shareFr === "number" && keys.includes("winnersFr") ? (
          <div className="flex items-center gap-2 text-muted-foreground">
            <span className="flex-1">Part FR</span>
            <span className="font-mono tabular-nums">{formatStat(point.shareFr, 1)} %</span>
          </div>
        ) : null}
      </div>
    </div>
  )
}

function showsScope(view: GainsView) {
  return view === "winners" || view === "mass"
}

function allowsLog(view: GainsView) {
  return view === "winners" || view === "jackpot" || view === "mass"
}

function allowsSma(view: GainsView) {
  return view !== "stack"
}

function allowsDraw(view: GainsView) {
  return view !== "stack"
}

function splitSeries(view: GainsView): { key: SeriesKey; label: string } {
  if (view === "jackpot" || view === "report") return { key: "jackpot", label: "jackpot" }
  if (view === "mass" || view === "stack") return { key: "massEu", label: "masse EU" }
  return { key: "winnersEu", label: "EU" }
}

export function EvolutionGains({
  draws,
  history,
}: {
  draws: Draw[]
  history?: Draw[]
}) {
  const [view, setView] = useState<GainsView>("winners")
  const [scope, setScope] = useState<GainsScope>("totals")
  const [logScale, setLogScale] = useState(true)
  const [hidden, setHidden] = useState<Partial<Record<string, boolean>>>(() =>
    defaultHidden("winners")
  )
  const [showSma, setShowSma] = useState(true)
  const [dayLine, setDayLine] = useState({ mardi: true, vendredi: true })
  const [targetKey, setTargetKey] = useState<SeriesKey>("winnersEu")

  const chartScope = view === "jackpot" || view === "report" ? 1 : scope
  const series = useMemo(
    () => toGainsChart(draws, chartScope, history ?? draws),
    [draws, chartScope, history]
  )
  const mixedDays = useMemo(() => {
    let mardi = false
    let vendredi = false
    for (const point of series) {
      const day = normalizeDrawWeekday(String(point.weekday ?? ""))
      if (day === "mardi") mardi = true
      if (day === "vendredi") vendredi = true
      if (mardi && vendredi) return true
    }
    return false
  }, [series])
  const keys = viewKeys(view, view === "jackpot" ? "totals" : scope)
  const visible = keys.filter((key) => !hidden[key])
  const splitSum =
    visible.includes("sumNumbers") && visible.some((key) => !isSumKey(key))
  const splitReport =
    view === "report" &&
    visible.includes("reportLength") &&
    visible.includes("jackpot")
  const smaPeriod = allowsSma(view) ? overlayPeriodFor(series.length) : 0
  const useLog = allowsLog(view) && logScale
  const split = splitSeries(view)
  const showDayLines = mixedDays && view !== "stack"

  useEffect(() => {
    if (!keys.includes(targetKey)) {
      const fallback = visible.find((key) => !isSumKey(key)) ?? keys[0]
      if (fallback) setTargetKey(fallback)
    }
  }, [keys, targetKey, visible])

  const overlayPacks = useMemo(() => {
    const packs: Partial<Record<string, ReturnType<typeof overlayBands>>> = {}
    if (!smaPeriod) return packs
    for (const key of keys) {
      const values = overlayValues(series, key)
      if (!values) continue
      packs[key] = overlayBands(values, smaPeriod)
    }
    return packs
  }, [series, keys, smaPeriod])

  const chartData = useMemo(() => {
    let points: ChartPoint[] = series
    if (useLog) {
      points = points.map((point) => {
        const next = { ...point }
        for (const key of keys) {
          if (isSumKey(key) || key === "reportLength" || key === "rank1") continue
          const value = point[key]
          next[key] =
            typeof value === "number" ? logPlotValue(value) : value
        }
        return next
      })
    }
    if (view === "stack") {
      points = points.map((point) => {
        const next = { ...point }
        for (const key of STACK_KEYS) {
          const value = point[key]
          next[key] =
            typeof value === "number" && Number.isFinite(value) ? value : 0
        }
        return next
      })
    }
    if (mixedDays && view !== "stack") {
      points = points.map((point) => ({
        ...point,
        ...weekdaySplitFields(String(point.weekday ?? ""), asNumber(point[split.key])),
      }))
    }
    if (!smaPeriod) return points
    for (const key of keys) {
      const bands = overlayPacks[key]
      if (!bands) continue
      points = points.map((point, i) => {
        const band = bands[i]
        if (!band) return point
        return { ...point, ...overlayRecord(key, band) }
      })
    }
    return points
  }, [series, smaPeriod, keys, overlayPacks, useLog, view, mixedDays, split.key])

  const summaries = useMemo(() => {
    return keys
      .filter((key) => view !== "stack" || !hidden[key])
      .map((key) => ({
        key,
        label: seriesLabelOf(key),
        stats: summarizeValues(finiteNumbers(series.map((point) => asNumber(point[key])))),
      }))
  }, [series, keys, view, hidden])

  const shareStats = useMemo(
    () => summarizeValues(finiteNumbers(series.map((point) => point.shareFr))),
    [series]
  )

  const weekdayStats = useMemo(() => {
    const rows = series.map((point) => {
      const raw = point[split.key]
      return {
        weekday: String(point.weekday ?? ""),
        value: typeof raw === "number" ? raw : null,
      }
    })
    return {
      label: split.label,
      euro: isEuroKey(split.key),
      mardi: weekdayMean(rows, "mardi"),
      vendredi: weekdayMean(rows, "vendredi"),
    }
  }, [series, split.key, split.label])

  const correlation = useMemo(() => {
    if (view === "stack" || view === "report") return null
    const yKey: SeriesKey =
      view === "jackpot" ? "jackpot" : view === "mass" ? "massEu" : "winnersEu"
    const paired = pairedFinite(
      series.map((point) => point.sumNumbers),
      series.map((point) => asNumber(point[yKey]))
    )
    return {
      label: view === "jackpot" ? "jackpot" : view === "mass" ? "masse EU" : "EU",
      r: pearsonCorrelation(paired.xs, paired.ys),
      n: paired.xs.length,
    }
  }, [series, view])

  const seriesValues = useCallback(
    (key: SeriesKey) =>
      series.map((point) => {
        const value = point[key]
        return typeof value === "number" && Number.isFinite(value) ? value : Number.NaN
      }),
    [series]
  )

  const plotAxisId = useCallback(
    (key: string) => {
      if (splitSum && isSumKey(key)) return "sum"
      if (splitReport && key === "jackpot") return "jackpot"
      if (view === "report" && key === "rank1" && visible.includes("reportLength")) {
        return "rank1"
      }
      return 0
    },
    [splitSum, splitReport, view, visible]
  )

  const sketch = useSketchChart({
    enabled: allowsDraw(view),
    points: chartData,
    keys,
    targetKey,
    seriesLabel: seriesLabelOf,
    seriesValues,
    axisId: plotAxisId,
  })

  const plotData = useMemo(
    () => sketch.mergeSketchFields(chartData),
    [sketch, chartData]
  )

  function changeView(next: GainsView) {
    if (next === view) return
    setView(next)
    setHidden(defaultHidden(next))
    setLogScale(next === "winners" || next === "mass")
    const nextKeys = viewKeys(next, scope)
    const fallback = nextKeys.find((key) => !isSumKey(key)) ?? nextKeys[0]
    if (fallback) setTargetKey(fallback)
  }

  function changeLog(next: boolean) {
    setLogScale(next)
    if (!next) return
    setHidden((current) => {
      const copy = { ...current }
      if (view === "winners") {
        copy.winnersR1 = false
        copy.winnersR13 = false
      }
      if (view === "jackpot") copy.prizeR13 = false
      if (view === "mass") {
        copy.massR1 = false
        copy.massR13 = false
      }
      return copy
    })
  }

  function toggleSeries(key: SeriesKey, solo: boolean) {
    if (solo) {
      const alreadySolo =
        !hidden[key] && keys.every((item) => item === key || hidden[item])
      if (alreadySolo) {
        setHidden(defaultHidden(view))
        return
      }
      setHidden(Object.fromEntries(keys.map((item) => [item, item !== key])))
      return
    }
    setHidden((current) => ({
      ...current,
      [key]: !current[key],
    }))
  }

  function overlayStroke(key: SeriesKey): string {
    if (visible.length === 1) return "var(--color-sma)"
    return seriesColorOf(key)
  }

  const sparseRanks = useMemo(
    () => draws.every((draw) => !(draw.prizes ?? []).some((tier) => tier.rank > 1)),
    [draws]
  )

  const logValues = visible
    .filter((key) => !isSumKey(key) && key !== "rank1" && key !== "reportLength")
    .flatMap((key) => series.map((point) => asNumber(point[key])))
  const leftLogDomain = useLog ? logDomain(logValues) : null
  const leftDomain: [number, number | "auto"] =
    visible.length === 1 && visible[0] === "sumNumbers"
      ? [NUMBER_SUM_RANGE.min, "auto"]
      : view === "report" && !splitReport
        ? [0, "auto"]
        : leftLogDomain
          ? leftLogDomain
          : [0, "auto"]

  const leftIsLog = Boolean(useLog && leftLogDomain)

  return (
    <Card>
      <CardHeader className="gap-4">
        <div className="flex flex-col gap-3">
          <CardTitle className="text-base font-medium">
            <TitleHelp help={TITLE_HELP}>Évolution dans le temps · gains</TitleHelp>
          </CardTitle>
          <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-end">
            <div className="flex flex-col gap-1">
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                Lecture
                <HelpTip {...VIEW_HELP} />
              </span>
              <div className="flex flex-wrap gap-1.5" role="group" aria-label="Lecture des gains">
                {VIEWS.map((item) => (
                  <button
                    key={item.value}
                    type="button"
                    aria-pressed={view === item.value}
                    onClick={() => changeView(item.value)}
                    className={cn(
                      "rounded-full border px-2.5 py-1 text-xs",
                      view === item.value
                        ? "border-primary bg-primary/15 text-foreground"
                        : "border-border text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
            {showsScope(view) ? (
              <LabelHelp label="Périmètre" help={SCOPE_HELP}>
                <Select
                  value={scopeValue(scope)}
                  onValueChange={(value) => setScope(parseScope(String(value)))}
                >
                  <SelectTrigger className="w-full sm:w-56" aria-label="Périmètre des gains">
                    <span className="flex flex-1 text-left">
                      {scope === "totals"
                        ? "Totaux · 13 rangs"
                        : `Rang ${scope} · ${PRIZE_RANK_LABELS[scope]}`}
                    </span>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="totals">Totaux · 13 rangs</SelectItem>
                    {PRIZE_RANKS.map((rank) => (
                      <SelectItem key={rank} value={String(rank)}>
                        Rang {rank} · {PRIZE_RANK_LABELS[rank]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </LabelHelp>
            ) : null}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {sketch.draw ? (
          <div className="mb-3 flex flex-col gap-2">
            <SketchToolbar
              drawing={sketch.drawing}
              figure={sketch.draw.figure}
              seriesKey={targetKey}
              seriesOptions={keys.map((key) => ({
                value: key,
                label: seriesLabelOf(key),
              }))}
              sketches={sketch.draw.sketches}
              dates={sketch.dates}
              canUndo={Boolean(sketch.draw.draft?.start || sketch.draw.draft?.mid || sketch.moving)}
              showMedian={sketch.draw.showMedian}
              onShowMedian={sketch.draw.setShowMedian}
              onToggle={() => {
                if (hidden[targetKey]) {
                  setHidden((current) => ({ ...current, [targetKey]: false }))
                }
                sketch.startDrawing()
              }}
              onFigure={(figure) => {
                sketch.clearMove()
                sketch.draw?.setFigure(figure)
              }}
              onSeries={(key) => {
                setTargetKey(key)
                sketch.draw?.cancelDraft()
                sketch.clearMove()
                sketch.setHint(
                  isRailFigure(sketch.draw?.figure ?? "")
                    ? "Clique le premier point de la borne, ou un point déjà posé."
                    : "Clique le départ, ou un point déjà posé pour le reprendre."
                )
              }}
              onCancel={() => {
                if (sketch.moving) {
                  sketch.clearMove()
                  sketch.draw?.cancelDraft()
                  sketch.setHint(
                    "Déplacement annulé. Clique un point pour le reprendre, ou un départ."
                  )
                  return
                }
                sketch.draw?.cancelDraft()
              }}
              onClear={() => {
                sketch.clearMove()
                sketch.draw?.clearSketches()
              }}
              onRemove={(id) => {
                if (sketch.moving?.sketchId === id) sketch.clearMove()
                sketch.draw?.removeSketch(id)
              }}
            />
            {sketch.drawing ? (
              <CoordHud
                live={sketch.draw.live}
                start={sketch.hudStart}
                mid={sketch.hudMid}
                end={sketch.hudEnd}
                rails={isRailFigure(sketch.draw.figure)}
                figureLabel={channelLabel(sketch.draw.figure, sketch.previewBand)}
                seriesLabel={seriesLabelOf(targetKey)}
                reading={sketch.draftReading}
                drawCount={series.length}
                hint={sketch.hint}
              />
            ) : null}
          </div>
        ) : null}
        {series.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Aucun tirage à tracer : affinez le filtre.
          </p>
        ) : (
          <>
            <ChartContainer
              config={chartConfig}
              className={cn(
                "aspect-auto h-[220px] w-full sm:h-[280px] lg:h-[340px]",
                sketch.drawing && sketch.moving && "cursor-grabbing",
                sketch.drawing && !sketch.moving && "cursor-crosshair"
              )}
            >
              <ComposedChart
                key={`${view}-${scopeValue(scope)}-${mixedDays ? "mix" : "one"}-${leftIsLog ? "log" : "lin"}`}
                accessibilityLayer
                data={plotData}
                margin={{
                  left: 4,
                  right: splitSum || splitReport ? 36 : 8,
                  top: 8,
                  bottom: 4,
                }}
                onMouseDown={(state, event) => {
                  if (!sketch.drawing) return
                  sketch.onChartPointerDown(state, event)
                }}
                onMouseMove={(state, event) => {
                  if (!sketch.drawing) return
                  sketch.onChartMove(state, event)
                }}
                onClick={(state, event) => {
                  if (!sketch.drawing) return
                  sketch.onChartClick(state, event)
                }}
                onMouseLeave={() => sketch.onChartLeave()}
              >
                <CartesianGrid vertical={false} />
                <XAxis
                  dataKey="date"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  minTickGap={28}
                  tickFormatter={formatShortDate}
                />
                <YAxis
                  domain={leftDomain}
                  scale={leftIsLog ? "log" : "auto"}
                  width={view === "winners" || view === "report" ? 44 : 56}
                  tickLine={false}
                  axisLine={false}
                  allowDecimals={view !== "winners" && view !== "report"}
                  allowDataOverflow={leftIsLog}
                  tickFormatter={(value) =>
                    formatTick(
                      view,
                      Number(value),
                      visible.length === 1 && visible[0] === "sumNumbers"
                    )
                  }
                />
                {splitSum ? (
                  <YAxis
                    yAxisId="sum"
                    orientation="right"
                    domain={[NUMBER_SUM_RANGE.min, "auto"]}
                    width={32}
                    tickLine={false}
                    axisLine={false}
                    allowDecimals={false}
                    tickFormatter={(value) => formatStat(Number(value), 0)}
                  />
                ) : null}
                {splitReport ? (
                  <YAxis
                    yAxisId="jackpot"
                    orientation="right"
                    domain={
                      useLog
                        ? logDomain(series.map((point) => point.jackpot)) ?? [1, "auto"]
                        : [0, "auto"]
                    }
                    scale={useLog ? "log" : "auto"}
                    width={48}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(value) => formatCompactEuro(Number(value))}
                  />
                ) : null}
                {view === "report" && visible.includes("rank1") && !visible.includes("jackpot") ? (
                  <YAxis
                    yAxisId="rank1"
                    orientation="right"
                    domain={[0, 1]}
                    width={32}
                    ticks={[0, 1]}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(value) => (value === 0 ? "0" : "+1")}
                  />
                ) : null}
                <ChartTooltip
                  cursor={sketch.drawing ? false : undefined}
                  content={
                    sketch.drawing ? (
                      () => null
                    ) : (
                      <GainsTooltip
                        keys={keys}
                        hidden={hidden}
                        smaPeriod={smaPeriod}
                        showSma={showSma && smaPeriod > 0}
                      />
                    )
                  }
                />
                {view === "stack"
                  ? visible.map((key) => (
                      <Area
                        key={key}
                        dataKey={key}
                        type="linear"
                        stackId="mass"
                        stroke={seriesColorOf(key)}
                        fill={seriesColorOf(key)}
                        fillOpacity={0.72}
                        strokeWidth={1}
                        name={seriesLabelOf(key)}
                        isAnimationActive={false}
                      />
                    ))
                  : visible.map((key) => (
                      <Line
                        key={key}
                        dataKey={key}
                        yAxisId={plotAxisId(key)}
                        type={key === "rank1" || key === "reportLength" ? "stepAfter" : "linear"}
                        stroke={seriesColorOf(key)}
                        strokeWidth={isSumKey(key) || key === "rank1" ? 1.75 : 2}
                        strokeDasharray={
                          (isSumKey(key) && splitSum) || key === "rank1" ? "4 3" : undefined
                        }
                        connectNulls={false}
                        dot={series.length > 24 ? { r: 2 } : { r: 3 }}
                        activeDot={{ r: 4 }}
                        name={seriesLabelOf(key)}
                      />
                    ))}
                {smaPeriod > 0 && showSma
                  ? visible
                      .filter((key) => overlayPacks[key])
                      .map((key) => (
                        <Line
                          key={`sma-${key}`}
                          dataKey={overlayField(key, "sma")}
                          yAxisId={plotAxisId(key)}
                          type="linear"
                          stroke={overlayStroke(key)}
                          strokeWidth={2}
                          strokeDasharray="5 4"
                          dot={false}
                          connectNulls
                          legendType="none"
                          name={`SMA ${smaPeriod} ${seriesLabelOf(key)}`}
                        />
                      ))
                  : null}
                {showDayLines ? (
                  <>
                    <Line
                      dataKey="overlayMardi"
                      yAxisId={plotAxisId(split.key)}
                      type="linear"
                      stroke={WEEKDAY_LINE_COLOR.mardi}
                      strokeWidth={2.75}
                      strokeDasharray={weekdayLineDash("mardi")}
                      connectNulls
                      hide={!dayLine.mardi}
                      dot={(props) => <WeekdayDot day="mardi" {...props} />}
                      activeDot={(props) => <WeekdayDot day="mardi" {...props} />}
                      isAnimationActive={false}
                      legendType="none"
                      name="Mardi"
                    />
                    <Line
                      dataKey="overlayVendredi"
                      yAxisId={plotAxisId(split.key)}
                      type="linear"
                      stroke={WEEKDAY_LINE_COLOR.vendredi}
                      strokeWidth={2.75}
                      strokeDasharray={weekdayLineDash("vendredi")}
                      connectNulls
                      hide={!dayLine.vendredi}
                      dot={(props) => <WeekdayDot day="vendredi" {...props} />}
                      activeDot={(props) => <WeekdayDot day="vendredi" {...props} />}
                      isAnimationActive={false}
                      legendType="none"
                      name="Vendredi"
                    />
                  </>
                ) : null}
                {sketch.draw ? (
                  <SketchPlotLayers
                    sketches={sketch.displaySketches}
                    draftBand={sketch.draftBand}
                    hasDraftLine={sketch.draftPoints.length > 0}
                    targetAxisId={sketch.targetAxisId}
                    axisId={plotAxisId}
                    drawing={sketch.drawing}
                    moving={sketch.moving}
                    hoveredHandle={sketch.hoveredHandle}
                    live={sketch.draw.live}
                    draftStart={sketch.draw.draft?.start ?? null}
                    draftMid={sketch.draw.draft?.mid}
                    showMedian={sketch.draw.showMedian}
                    onScales={sketch.onScales}
                  />
                ) : null}
              </ComposedChart>
            </ChartContainer>
            <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
              {showDayLines ? (
                <WeekdaySplitLegend
                  metric={split.label}
                  showMardi={dayLine.mardi}
                  showVendredi={dayLine.vendredi}
                  onToggle={(day: DrawWeekday) =>
                    setDayLine((current) => ({ ...current, [day]: !current[day] }))
                  }
                />
              ) : null}
              {allowsLog(view) ? (
                <span className="inline-flex items-center gap-1">
                  <button
                    type="button"
                    data-action="gains-log-scale"
                    aria-pressed={logScale}
                    aria-label={
                      logScale
                        ? "Échelle logarithmique activée"
                        : "Échelle logarithmique désactivée"
                    }
                    title={
                      logScale
                        ? "Échelle log activée — cliquer pour l’échelle linéaire"
                        : "Échelle log désactivée — cliquer pour l’échelle logarithmique"
                    }
                    onClick={() => changeLog(!logScale)}
                    className={cn(
                      "flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-medium transition-colors",
                      logScale
                        ? "border-ok/70 bg-ok/20 text-ok hover:bg-ok/30"
                        : "border-err/70 bg-err/20 text-err hover:bg-err/30"
                    )}
                  >
                    <span
                      aria-hidden
                      className="grid size-3 shrink-0 place-items-center rounded-full bg-black/35 ring-1 ring-black/50"
                    >
                      <span
                        className={cn(
                          "size-2 rounded-full",
                          logScale
                            ? "bg-ok shadow-[0_0_7px_var(--ok)]"
                            : "bg-err shadow-[0_0_7px_var(--err)]"
                        )}
                      />
                    </span>
                    log
                  </button>
                  <HelpTip {...LOG_HELP} />
                </span>
              ) : null}
              {smaPeriod > 0 ? (
                <span className="inline-flex items-center gap-1">
                  <button
                    type="button"
                    aria-pressed={showSma}
                    title={`Afficher ou masquer la SMA ${smaPeriod}`}
                    onClick={() => setShowSma((current) => !current)}
                    className={cn(
                      "flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-xs transition-opacity hover:bg-muted",
                      !showSma && "opacity-40"
                    )}
                  >
                    <span
                      className="size-2 shrink-0 rounded-[2px]"
                      style={{
                        background:
                          visible.length === 1
                            ? chartConfig.sma.color
                            : seriesColorOf(visible[0] ?? keys[0]),
                      }}
                    />
                    SMA {smaPeriod}
                  </button>
                  <HelpTip {...SMA_HELP} />
                </span>
              ) : null}
              {keys.map((key) => (
                <span key={key} className="inline-flex items-center gap-1">
                  <button
                    type="button"
                    aria-pressed={!hidden[key]}
                    title={`Afficher ou masquer ${seriesLabelOf(key)}. Maj+clic : cette courbe seule.`}
                    onClick={(event) => toggleSeries(key, event.shiftKey)}
                    className={cn(
                      "flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-xs transition-opacity hover:bg-muted",
                      hidden[key] && "opacity-40"
                    )}
                  >
                    <span
                      className="size-2 shrink-0 rounded-[2px]"
                      style={{ background: seriesColorOf(key) }}
                    />
                    {seriesLabelOf(key)}
                  </button>
                  <HelpTip {...seriesHelpOf(key)} />
                </span>
              ))}
            </div>
            {splitSum ? (
              <p className="mt-2 text-center text-xs text-muted-foreground">
                Axe droit : somme des 5 numéros (15–240)
                {view === "winners"
                  ? ". EU comprend la France ; Hors FR = EU − FR."
                  : "."}
              </p>
            ) : null}
            {splitReport ? (
              <p className="mt-2 text-center text-xs text-muted-foreground">
                Axe droit : jackpot €. Gauche : longueur de report (0 = gagné).
              </p>
            ) : null}
            {leftIsLog ? (
              <p className="mt-1 text-center text-xs text-muted-foreground">
                Échelle log : 0 (report) hors axe. R1 et R13 deviennent lisibles ensemble.
              </p>
            ) : null}
            {showDayLines ? (
              <p className="mt-1 text-center text-xs text-muted-foreground">
                Mardi (cyan) et vendredi (rose) : « {split.label} », soir par soir.
              </p>
            ) : null}
            {view === "stack" ? (
              <p className="mt-2 text-center text-xs text-muted-foreground">
                Masse EU empilée, rang 13 en base jusqu’au jackpot au sommet. Pas de log
                (une pile n’a pas de sens en log).
              </p>
            ) : null}
            {sparseRanks && view !== "jackpot" && view !== "report" ? (
              <p className="mt-1 text-center text-xs text-muted-foreground">
                Cette archive n’a que le rang 1 : les totaux 13 rangs et l’empilement se
                réduisent au jackpot. Neon porte l’échelle complète.
              </p>
            ) : null}
            <ul className="mt-3 flex flex-wrap justify-center gap-x-4 gap-y-1 text-center text-xs tabular-nums text-muted-foreground">
              {view === "stack"
                ? null
                : summaries.map((row) => (
                    <li key={row.key}>
                      {row.label}
                      {row.stats
                        ? ` · ${
                            isEuroKey(row.key)
                              ? `${formatCompactEuro(row.stats.min)}–${formatCompactEuro(row.stats.max)} · moy. ${formatCompactEuro(row.stats.avg)}`
                              : row.key === "sumNumbers"
                                ? `${formatStat(row.stats.min, 0)}–${formatStat(row.stats.max, 0)} · moy. ${formatStat(row.stats.avg)}`
                                : row.key === "rank1"
                                  ? `${formatRank1Step(row.stats.min)} → ${formatRank1Step(row.stats.max)}`
                                  : `${formatCompactCount(row.stats.min)}–${formatCompactCount(row.stats.max)} · moy. ${formatCompactCount(row.stats.avg)}`
                          }`
                        : " · —"}
                    </li>
                  ))}
              {view === "winners" && shareStats ? (
                <li>part FR · moy. {formatStat(shareStats.avg, 1)} %</li>
              ) : null}
              {mixedDays &&
              (weekdayStats.mardi != null || weekdayStats.vendredi != null) ? (
                <li>
                  mardi · moy.{" "}
                  {weekdayStats.mardi == null
                    ? "—"
                    : weekdayStats.euro
                      ? formatCompactEuro(weekdayStats.mardi)
                      : formatCompactCount(weekdayStats.mardi)}
                  {" · "}
                  vendredi · moy.{" "}
                  {weekdayStats.vendredi == null
                    ? "—"
                    : weekdayStats.euro
                      ? formatCompactEuro(weekdayStats.vendredi)
                      : formatCompactCount(weekdayStats.vendredi)}
                  {` (${weekdayStats.label})`}
                </li>
              ) : null}
              {correlation?.r != null ? (
                <li className="inline-flex items-center gap-1">
                  <span>
                    r(somme, {correlation.label}) {formatR(correlation.r)}
                    {correlation.n < series.length ? ` · n=${correlation.n}` : ""}
                  </span>
                  <HelpTip
                    title="Corrélation somme / gains"
                    body="Pearson entre la somme des 5 numéros et la série de gains choisie, sur les tirages où les deux valeurs sont connues. Descriptif, pas un lien causal."
                  />
                </li>
              ) : null}
            </ul>
          </>
        )}
      </CardContent>
    </Card>
  )
}
