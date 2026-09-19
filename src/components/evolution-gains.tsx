"use client"

import { useMemo, useState } from "react"
import { CartesianGrid, ComposedChart, Line, XAxis, YAxis } from "recharts"

import { HelpTip, LabelHelp, TitleHelp, type HelpCopy } from "@/components/help"
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
  finiteNumbers,
  formatCompactCount,
  formatCompactEuro,
  formatCount,
  formatDrawDate,
  formatEuro,
  formatShortDate,
  isPrizeRank,
  pairedFinite,
  pearsonCorrelation,
  summarizeValues,
  toGainsChart,
  type Draw,
  type GainsChartPoint,
  type GainsScope,
} from "@/lib/draws"
import { cn } from "@/lib/utils"

type GainsView = "winners" | "jackpot" | "mass"

type SeriesKey =
  | "winnersFr"
  | "winnersEu"
  | "winnersExFr"
  | "jackpot"
  | "massFr"
  | "massEu"
  | "sumNumbers"

type ChartPoint = GainsChartPoint & Record<string, number | string | null>

const VIEWS: { value: GainsView; label: string }[] = [
  { value: "winners", label: "Gagnants" },
  { value: "jackpot", label: "Jackpot €" },
  { value: "mass", label: "Masse €" },
]

const VIEW_KEYS: Record<GainsView, SeriesKey[]> = {
  winners: ["winnersFr", "winnersEu", "winnersExFr", "sumNumbers"],
  jackpot: ["jackpot", "sumNumbers"],
  mass: ["massFr", "massEu", "sumNumbers"],
}

const chartConfig = {
  winnersFr: { label: "FR", color: "var(--chart-1)" },
  winnersEu: { label: "EU", color: "var(--chart-2)" },
  winnersExFr: { label: "Hors FR", color: "var(--chart-3)" },
  jackpot: { label: "Jackpot", color: "var(--chart-1)" },
  massFr: { label: "Masse FR", color: "var(--chart-1)" },
  massEu: { label: "Masse EU", color: "var(--chart-2)" },
  sumNumbers: { label: "Somme n°", color: "var(--chart-5)" },
  sma: { label: "SMA", color: "var(--chart-2)" },
} satisfies ChartConfig

const TITLE_HELP: HelpCopy = {
  title: "Évolution dans le temps · gains",
  wide: true,
  body: `Même famille que la courbe des boules, pour les gains FDJ de la fenêtre.

• Gagnants : effectifs FR, EU, et Hors FR. EU est le total des pays participants, France comprise (colonne FDJ « en Europe »). On n’additionne pas FR et EU. Hors FR = EU − FR.
• Jackpot € : montant du rang 1 (0 = report).
• Masse € : gagnants × rapport, totaux des 13 rangs ou un rang choisi.

La somme des 5 numéros se lit sur l’axe de droite (15–240). SMA optionnelle, lissage descriptif. Les tirages restent indépendants.`,
}

const VIEW_HELP: HelpCopy = {
  title: "Lecture",
  body: "Gagnants : têtes de colonnes FR / EU. Jackpot : le gros lot. Masse : l’argent réellement distribué (effectifs × rapport). La somme des numéros reste visible dans les trois lectures.",
}

const SCOPE_HELP: HelpCopy = {
  title: "Périmètre",
  body: "Totaux des 13 rangs, ou un rang FDJ (1 = jackpot, 13 = 2 numéros). Le fichier local n’a souvent que le rang 1 ; Neon porte l’échelle complète.",
}

const SERIES_HELP: Record<SeriesKey, HelpCopy> = {
  winnersFr: {
    title: "Gagnants FR",
    body: "Somme des gagnants France du périmètre choisi (13 rangs ou un rang). Cliquez pour masquer. Maj+clic : cette courbe seule.",
  },
  winnersEu: {
    title: "Gagnants EU",
    body: "Total Europe, France comprise. Ce n’est pas FR + un reste : c’est déjà le total. Cliquez pour masquer. Maj+clic : cette courbe seule.",
  },
  winnersExFr: {
    title: "Hors FR",
    body: "EU − FR : le complément, sans double compte. Cliquez pour afficher. Maj+clic : cette courbe seule.",
  },
  jackpot: {
    title: "Jackpot",
    body: "Rapport du rang 1. 0 € = report. Cliquez pour masquer. Maj+clic : cette courbe seule.",
  },
  massFr: {
    title: "Masse FR",
    body: "Gagnants France × rapport, sommé sur le périmètre. Ce que la France a reçu, pas un pronostic.",
  },
  massEu: {
    title: "Masse EU",
    body: "Gagnants Europe × rapport (France comprise). Cliquez pour masquer. Maj+clic : cette courbe seule.",
  },
  sumNumbers: {
    title: "Somme des numéros",
    body: "n1+n2+n3+n4+n5 du tirage (15 à 240, moyenne théorique 127,5). Axe de droite. Pour voir si une grille « haute » coïncide avec plus de gagnants — descriptif, pas un lien causal.",
  },
}

const SMA_HELP: HelpCopy = {
  title: "SMA",
  body: "Moyenne simple sur la période auto (5 tirages si la fenêtre a au moins 10 points, 10 si au moins 40). Une courbe par série visible. Lissage descriptif, pas une prédiction.",
}

const RANKS = Array.from({ length: 13 }, (_, i) => i + 1)

function defaultHidden(view: GainsView): Partial<Record<SeriesKey, boolean>> {
  if (view === "winners") return { winnersExFr: true }
  if (view === "mass") return { massFr: true }
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
  return key === "jackpot" || key === "massFr" || key === "massEu"
}

function isSumKey(key: SeriesKey) {
  return key === "sumNumbers"
}

function formatSeriesValue(key: SeriesKey, value: number | null | undefined) {
  if (value == null || typeof value !== "number" || !Number.isFinite(value)) return "—"
  if (key === "jackpot" && value === 0) return "Report"
  if (isEuroKey(key)) return formatEuro(value)
  if (key === "sumNumbers") return formatStat(value)
  return formatCount(value)
}

function formatTick(view: GainsView, value: number, sumAxis: boolean) {
  if (sumAxis) return formatStat(value, 0)
  if (view === "winners") return formatCompactCount(value)
  return formatCompactEuro(value)
}

function overlayValues(series: GainsChartPoint[], key: SeriesKey): number[] | null {
  const values = series.map((point) => point[key])
  if (values.some((value) => value == null || typeof value !== "number" || !Number.isFinite(value))) {
    return null
  }
  return values as number[]
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
  hidden: Partial<Record<SeriesKey, boolean>>
  smaPeriod: number
  showSma: boolean
}) {
  if (!active || !payload?.length) return null
  const point = payload[0]?.payload
  if (!point) return null

  return (
    <div className="grid min-w-0 max-w-[min(18rem,calc(100vw-2rem))] items-start gap-1.5 rounded-lg border border-border/50 bg-background px-2.5 py-1.5 text-xs shadow-xl">
      <div className="font-medium">{formatDrawDate(String(label ?? point.date))}</div>
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
                    style={{ background: chartConfig[key].color }}
                  />
                  <span className="flex-1 text-muted-foreground">
                    {chartConfig[key].label}
                  </span>
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

export function EvolutionGains({ draws }: { draws: Draw[] }) {
  const [view, setView] = useState<GainsView>("winners")
  const [scope, setScope] = useState<GainsScope>("totals")
  const [hidden, setHidden] = useState<Partial<Record<SeriesKey, boolean>>>(() =>
    defaultHidden("winners")
  )
  const [showSma, setShowSma] = useState(true)

  const series = useMemo(
    () => toGainsChart(draws, view === "jackpot" ? 1 : scope),
    [draws, view, scope]
  )
  const keys = VIEW_KEYS[view]
  const visible = keys.filter((key) => !hidden[key])
  const splitSum = visible.includes("sumNumbers") && visible.some((key) => !isSumKey(key))
  const smaPeriod = overlayPeriodFor(series.length)

  const overlayPacks = useMemo(() => {
    const packs: Partial<Record<SeriesKey, ReturnType<typeof overlayBands>>> = {}
    if (!smaPeriod) return packs
    for (const key of keys) {
      const values = overlayValues(series, key)
      if (!values) continue
      packs[key] = overlayBands(values, smaPeriod)
    }
    return packs
  }, [series, keys, smaPeriod])

  const chartData = useMemo(() => {
    if (!smaPeriod) return series as ChartPoint[]
    let points: ChartPoint[] = series
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
  }, [series, smaPeriod, keys, overlayPacks])

  const summaries = useMemo(() => {
    return keys.map((key) => ({
      key,
      label: chartConfig[key].label,
      stats: summarizeValues(finiteNumbers(series.map((point) => point[key]))),
    }))
  }, [series, keys])

  const shareStats = useMemo(
    () => summarizeValues(finiteNumbers(series.map((point) => point.shareFr))),
    [series]
  )

  const correlation = useMemo(() => {
    const yKey: SeriesKey =
      view === "jackpot" ? "jackpot" : view === "mass" ? "massEu" : "winnersEu"
    const paired = pairedFinite(
      series.map((point) => point.sumNumbers),
      series.map((point) => point[yKey])
    )
    return {
      label:
        view === "jackpot" ? "jackpot" : view === "mass" ? "masse EU" : "EU",
      r: pearsonCorrelation(paired.xs, paired.ys),
      n: paired.xs.length,
    }
  }, [series, view])

  function changeView(next: GainsView) {
    if (next === view) return
    setView(next)
    setHidden(defaultHidden(next))
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
    return `var(--color-${key})`
  }

  const leftDomain: [number, number | "auto"] =
    visible.length === 1 && visible[0] === "sumNumbers"
      ? [NUMBER_SUM_RANGE.min, "auto"]
      : [0, "auto"]

  return (
    <Card>
      <CardHeader className="gap-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="text-base font-medium">
            <TitleHelp help={TITLE_HELP}>Évolution dans le temps · gains</TitleHelp>
          </CardTitle>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
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
            {view === "jackpot" ? null : (
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
                    {RANKS.map((rank) => (
                      <SelectItem key={rank} value={String(rank)}>
                        Rang {rank} · {PRIZE_RANK_LABELS[rank]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </LabelHelp>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {series.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Aucun tirage à tracer : affinez le filtre.
          </p>
        ) : (
          <>
            <ChartContainer
              config={chartConfig}
              className="aspect-auto h-[220px] w-full sm:h-[280px] lg:h-[340px]"
            >
              <ComposedChart
                key={`${view}-${scopeValue(scope)}-${splitSum ? "split" : "one"}`}
                accessibilityLayer
                data={chartData}
                margin={{ left: 4, right: splitSum ? 36 : 8, top: 8, bottom: 4 }}
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
                  width={view === "winners" ? 44 : 48}
                  tickLine={false}
                  axisLine={false}
                  allowDecimals={view !== "winners"}
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
                <ChartTooltip
                  content={
                    <GainsTooltip
                      keys={keys}
                      hidden={hidden}
                      smaPeriod={smaPeriod}
                      showSma={showSma && smaPeriod > 0}
                    />
                  }
                />
                {visible.map((key) => (
                  <Line
                    key={key}
                    dataKey={key}
                    yAxisId={splitSum && isSumKey(key) ? "sum" : 0}
                    type="linear"
                    stroke={`var(--color-${key})`}
                    strokeWidth={isSumKey(key) ? 1.75 : 2}
                    strokeDasharray={isSumKey(key) && splitSum ? "4 3" : undefined}
                    connectNulls={false}
                    dot={series.length > 24 ? { r: 2 } : { r: 3 }}
                    activeDot={{ r: 4 }}
                    name={chartConfig[key].label}
                  />
                ))}
                {smaPeriod > 0 && showSma
                  ? visible
                      .filter((key) => overlayPacks[key])
                      .map((key) => (
                        <Line
                          key={`sma-${key}`}
                          dataKey={overlayField(key, "sma")}
                          yAxisId={splitSum && isSumKey(key) ? "sum" : 0}
                          type="linear"
                          stroke={overlayStroke(key)}
                          strokeWidth={2}
                          strokeDasharray="5 4"
                          dot={false}
                          connectNulls
                          legendType="none"
                          name={`SMA ${smaPeriod} ${chartConfig[key].label}`}
                        />
                      ))
                  : null}
              </ComposedChart>
            </ChartContainer>
            <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
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
                            : chartConfig[visible[0] ?? keys[0]].color,
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
                    title={`Afficher ou masquer ${chartConfig[key].label}. Maj+clic : cette courbe seule.`}
                    onClick={(event) => toggleSeries(key, event.shiftKey)}
                    className={cn(
                      "flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-xs transition-opacity hover:bg-muted",
                      hidden[key] && "opacity-40"
                    )}
                  >
                    <span
                      className="size-2 shrink-0 rounded-[2px]"
                      style={{ background: chartConfig[key].color }}
                    />
                    {chartConfig[key].label}
                  </button>
                  <HelpTip {...SERIES_HELP[key]} />
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
            <ul className="mt-3 flex flex-wrap justify-center gap-x-4 gap-y-1 text-center text-xs tabular-nums text-muted-foreground">
              {summaries.map((row) => (
                <li key={row.key}>
                  {row.label}
                  {row.stats
                    ? ` · ${
                        isEuroKey(row.key)
                          ? `${formatCompactEuro(row.stats.min)}–${formatCompactEuro(row.stats.max)} · moy. ${formatCompactEuro(row.stats.avg)}`
                          : row.key === "sumNumbers"
                            ? `${formatStat(row.stats.min, 0)}–${formatStat(row.stats.max, 0)} · moy. ${formatStat(row.stats.avg)}`
                            : `${formatCompactCount(row.stats.min)}–${formatCompactCount(row.stats.max)} · moy. ${formatCompactCount(row.stats.avg)}`
                      }`
                    : " · —"}
                </li>
              ))}
              {view === "winners" && shareStats ? (
                <li>
                  part FR · moy. {formatStat(shareStats.avg, 1)} %
                </li>
              ) : null}
              {correlation.r != null ? (
                <li className="inline-flex items-center gap-1">
                  <span>
                    r(somme, {correlation.label}) {formatR(correlation.r)}
                    {correlation.n < series.length ? ` · n=${correlation.n}` : ""}
                  </span>
                  <HelpTip
                    title="Corrélation somme / gains"
                    body="Pearson entre la somme des 5 numéros et la série de gains choisie (EU, jackpot ou masse EU), sur les tirages où les deux valeurs sont connues. Proche de 0 si les deux sont indépendants. Descriptif, pas un lien causal."
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
