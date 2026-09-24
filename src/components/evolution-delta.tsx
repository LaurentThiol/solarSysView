"use client"

import { Fragment, useMemo, useState } from "react"
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  XAxis,
  YAxis,
} from "recharts"

import { HelpTip, TitleHelp, type HelpCopy } from "@/components/help"
import { WeekdayDot, WeekdaySplitLegend } from "@/components/weekday-split"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  ChartContainer,
  ChartTooltip,
  type ChartConfig,
} from "@/components/ui/chart"
import {
  DELTA_VIEW_KEYS,
  deltaDomain,
  deltaOverlayBands,
  finiteDeltas,
  previousLevel,
  summarizeDelta,
  toDeltaSeries,
  type DeltaKey,
  type DeltaPoint,
  type DeltaView,
} from "@/lib/delta-evol"
import {
  overlayField,
  overlayPeriodFor,
  overlayRecord,
  readOverlay,
  type BandPoint,
} from "@/lib/draw-overlays"
import { formatDrawDate, formatShortDate, toDrawSeries, type Draw } from "@/lib/draws"
import { cn } from "@/lib/utils"
import {
  WEEKDAY_LINE_COLOR,
  seriesHasBothWeekdays,
  weekdayLineDash,
  weekdaySplitFields,
  type DrawWeekday,
} from "@/lib/weekday-scope"

const VIEWS: { value: DeltaView; label: string }[] = [
  { value: "sums", label: "Sommes" },
  { value: "numbers", label: "n1 à n5" },
  { value: "stars", label: "e1 et e2" },
  { value: "all", label: "Tout" },
]

const chartConfig = {
  n1: { label: "Δ n1", color: "var(--chart-1)" },
  n2: { label: "Δ n2", color: "var(--chart-2)" },
  n3: { label: "Δ n3", color: "var(--chart-3)" },
  n4: { label: "Δ n4", color: "var(--chart-4)" },
  n5: { label: "Δ n5", color: "var(--chart-5)" },
  e1: { label: "Δ e1", color: "var(--chart-1)" },
  e2: { label: "Δ e2", color: "var(--chart-2)" },
  sumNumbers: { label: "Δ somme n", color: "var(--chart-1)" },
  sumStars: { label: "Δ somme E", color: "var(--chart-2)" },
  sma: { label: "SMA", color: "var(--chart-2)" },
  bbUpper: { label: "Bollinger +", color: "var(--chart-5)" },
  bbLower: { label: "Bollinger −", color: "var(--chart-5)" },
} satisfies ChartConfig

type ChartPoint = DeltaPoint & Record<string, number | string | null>

const TITLE_HELP: HelpCopy = {
  title: "DeltaEvol",
  wide: true,
  body: `Écart entre le tirage n et le tirage n−1, dans l’ordre de la fenêtre.

• Δ n1 … Δ n5 : le plus petit, le 2ᵉ, …, le plus grand, après tri — pas l’ordre de sortie.
• Δ e1 et Δ e2 : même lecture pour les étoiles.
• Δ somme n et Δ somme E : somme des 5 boules, somme des 2 étoiles.
• Le premier tirage de la fenêtre n’a pas de prédécesseur : la courbe commence au second point.
• La ligne 0 est la base. Au-dessus, la série a monté ; en dessous, elle a baissé.

SMA et Bollinger (optionnels) lissent ou encadrent ces écarts, pas les niveaux. Maj+clic isole une série. Les sommes vivent sur une autre échelle que n1–n5 : Sommes les sépare (Δ somme n à gauche, Δ somme E à droite). Tout les superpose et laisse les sommes écraser les rangs. Descriptif : chaque tirage reste indépendant.`,
}

const VIEW_HELP: HelpCopy = {
  title: "Lecture",
  body: "Sommes : Δ somme des numéros et Δ somme des étoiles, deux axes. n1 à n5 et e1 / e2 : rangs d’ordre, même échelle. Tout : les neuf écarts ensemble — les sommes dominent le cadre.",
}

const SMA_HELP: HelpCopy = {
  title: "SMA",
  body: "Moyenne simple des écarts, période auto (5 si au moins 10 écarts, 10 si au moins 40). Une courbe par série visible. Lissage de la variation, pas une prédiction.",
}

const BB_HELP: HelpCopy = {
  title: "Bollinger",
  body: "Bandes SMA ± 2σ de chaque écart visible. Le milieu est la SMA des écarts. %B dans l’infobulle : 0 = bande basse, 1 = bande haute. Dispersion des variations, pas un signal de jeu.",
}

const SUMMARY_HELP: HelpCopy = {
  title: "dernier · moy. · |Δ|",
  body: "Sur les écarts de la fenêtre : dernier pas, moyenne signée (près de 0 si la série ne dérive pas), moyenne des valeurs absolues (ampleur typique d’un pas), et série en cours du même signe.",
}

function formatStat(value: number, digits = 1) {
  const rounded = Number(value.toFixed(digits))
  return (rounded === 0 ? 0 : rounded).toLocaleString("fr-FR", {
    maximumFractionDigits: digits,
    minimumFractionDigits: 0,
  })
}

function formatSigned(value: number, digits = 1) {
  const rounded = Number(value.toFixed(digits))
  const normalized = rounded === 0 ? 0 : rounded
  return normalized.toLocaleString("fr-FR", {
    maximumFractionDigits: digits,
    minimumFractionDigits: 0,
    signDisplay: "exceptZero",
  })
}

function formatPctB(value: number) {
  return value.toLocaleString("fr-FR", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  })
}

function formatStreak(sign: -1 | 0 | 1, length: number) {
  if (length === 0 || sign === 0) return "série —"
  const n = `${length} pas`
  if (sign > 0) return `${n} en hausse`
  return `${n} en baisse`
}

function stepLabel(point: DeltaPoint, key: DeltaKey) {
  const delta = point[key]
  if (delta == null) return "—"
  const previous = previousLevel(point, key)
  const current = point[`level_${key}`]
  if (previous == null) return formatSigned(delta, 0)
  return `${formatStat(previous, 0)} → ${formatStat(current, 0)} · ${formatSigned(delta, 0)}`
}

function mergeOverlays(points: ChartPoint[], key: DeltaKey, bands: BandPoint[]): ChartPoint[] {
  return points.map((point, index) => ({
    ...point,
    ...overlayRecord(key, bands[index] ?? { sma: null, upper: null, lower: null, percentB: null }),
  }))
}

function DeltaTooltip({
  active,
  payload,
  label,
  keys,
  hidden,
  smaPeriod,
  showSma,
  showBb,
}: {
  active?: boolean
  payload?: Array<{ dataKey?: string | number; payload?: ChartPoint }>
  label?: string
  keys: readonly DeltaKey[]
  hidden: Partial<Record<DeltaKey, boolean>>
  smaPeriod: number
  showSma: boolean
  showBb: boolean
}) {
  if (!active || !payload?.length) return null
  const point = payload[0]?.payload
  if (!point) return null

  return (
    <div className="grid min-w-0 max-w-[min(20rem,calc(100vw-2rem))] items-start gap-1.5 rounded-lg border border-border/50 bg-background px-2.5 py-1.5 text-xs shadow-xl">
      <div className="font-medium">{formatDrawDate(String(label ?? point.date))}</div>
      <div className="grid gap-1.5">
        {keys
          .filter((key) => !hidden[key])
          .map((key) => {
            const sma = showSma ? readOverlay(point, key, "sma") : null
            const lo = showBb ? readOverlay(point, key, "bbLower") : null
            const hi = showBb ? readOverlay(point, key, "bbUpper") : null
            const pctB = showBb ? readOverlay(point, key, "pctB") : null
            return (
              <div key={key} className="grid gap-0.5">
                <div className="flex items-center gap-2">
                  <span
                    className="size-2.5 shrink-0 rounded-[2px]"
                    style={{ background: chartConfig[key].color }}
                  />
                  <span className="flex-1 text-muted-foreground">{chartConfig[key].label}</span>
                  <span className="font-mono font-medium tabular-nums">{stepLabel(point, key)}</span>
                </div>
                {showSma ? (
                  <div className="flex items-center gap-2 pl-4 text-muted-foreground">
                    <span className="flex-1">SMA {smaPeriod}</span>
                    <span className="font-mono tabular-nums">
                      {sma == null ? "—" : formatSigned(sma)}
                    </span>
                  </div>
                ) : null}
                {showBb ? (
                  <div className="flex items-center gap-2 pl-4 text-muted-foreground">
                    <span className="flex-1">Bollinger</span>
                    <span className="font-mono tabular-nums">
                      {lo == null || hi == null
                        ? "—"
                        : `${formatSigned(lo)} – ${formatSigned(hi)}${
                            pctB == null ? "" : ` · %B ${formatPctB(pctB)}`
                          }`}
                    </span>
                  </div>
                ) : null}
              </div>
            )
          })}
      </div>
    </div>
  )
}

export function EvolutionDelta({ draws }: { draws: Draw[] }) {
  const [view, setView] = useState<DeltaView>("sums")
  const [hidden, setHidden] = useState<Partial<Record<DeltaKey, boolean>>>({})
  const [showSma, setShowSma] = useState(true)
  const [showBb, setShowBb] = useState(false)
  const [dayLine, setDayLine] = useState({ mardi: true, vendredi: true })

  const series = useMemo(() => toDeltaSeries(toDrawSeries(draws)), [draws])
  const keys = DELTA_VIEW_KEYS[view]
  const visible = keys.filter((key) => !hidden[key])
  const deltaCount = Math.max(0, series.length - 1)
  const smaPeriod = overlayPeriodFor(deltaCount)
  const mixedDays = useMemo(() => seriesHasBothWeekdays(series), [series])
  const splitKey = visible[0] ?? null
  const showDayLines = mixedDays && splitKey != null
  const dualAxis = view === "sums"

  const overlayPacks = useMemo(() => {
    const packs: Partial<Record<DeltaKey, { abs: BandPoint[]; values: Array<number | null> }>> = {}
    if (!smaPeriod) return packs
    for (const key of keys) {
      const values = series.map((point) => point[key])
      packs[key] = { abs: deltaOverlayBands(values, smaPeriod), values }
    }
    return packs
  }, [series, keys, smaPeriod])

  const chartData = useMemo(() => {
    let points: ChartPoint[] = series
    if (showDayLines && splitKey) {
      points = points.map((point) => ({
        ...point,
        ...weekdaySplitFields(point.weekday, point[splitKey]),
      }))
    }
    if (!smaPeriod) return points
    for (const key of keys) {
      const abs = overlayPacks[key]?.abs
      if (!abs) continue
      points = mergeOverlays(points, key, abs)
    }
    return points
  }, [series, smaPeriod, keys, overlayPacks, showDayLines, splitKey])

  const domains = useMemo(() => {
    const collect = (key: DeltaKey) => {
      const values = finiteDeltas(series.map((point) => point[key]))
      if (showSma || showBb) {
        const bands = overlayPacks[key]?.abs ?? []
        for (const band of bands) {
          if (showSma && band.sma != null) values.push(band.sma)
          if (showBb && band.upper != null) values.push(band.upper)
          if (showBb && band.lower != null) values.push(band.lower)
        }
      }
      return deltaDomain(values)
    }
    if (dualAxis) {
      return {
        left: collect("sumNumbers"),
        right: collect("sumStars"),
      }
    }
    const values: number[] = []
    for (const key of visible) {
      values.push(...finiteDeltas(series.map((point) => point[key])))
      if (showSma || showBb) {
        for (const band of overlayPacks[key]?.abs ?? []) {
          if (showSma && band.sma != null) values.push(band.sma)
          if (showBb && band.upper != null) values.push(band.upper)
          if (showBb && band.lower != null) values.push(band.lower)
        }
      }
    }
    return { left: deltaDomain(values), right: deltaDomain(values) }
  }, [dualAxis, series, visible, overlayPacks, showSma, showBb])

  const summaries = useMemo(() => {
    return keys.map((key) => ({
      key,
      label: chartConfig[key].label,
      stats: summarizeDelta(series.map((point) => point[key])),
    }))
  }, [series, keys])

  function changeView(next: DeltaView) {
    if (next === view) return
    setView(next)
    setHidden({})
  }

  function toggleSeries(key: DeltaKey, solo: boolean) {
    if (solo) {
      const alreadySolo = !hidden[key] && keys.every((item) => item === key || hidden[item])
      if (alreadySolo) {
        setHidden({})
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

  function axisOf(key: DeltaKey) {
    if (dualAxis && key === "sumStars") return "right"
    return "left"
  }

  function overlayStroke(key: DeltaKey, kind: "sma" | "bb"): string {
    if (visible.length === 1) {
      return kind === "sma" ? "var(--color-sma)" : "var(--color-bbUpper)"
    }
    return `var(--color-${key})`
  }

  const smaOn = showSma && smaPeriod > 0
  const bbOn = showBb && smaPeriod > 0

  return (
    <Card>
      <CardHeader className="gap-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="text-base font-medium">
            <TitleHelp help={TITLE_HELP}>DeltaEvol</TitleHelp>
          </CardTitle>
          <div className="flex flex-col gap-1">
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              Lecture
              <HelpTip {...VIEW_HELP} />
            </span>
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Lecture des écarts">
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
        </div>
      </CardHeader>
      <CardContent>
        {series.length < 2 ? (
          <p className="text-sm text-muted-foreground">
            Il faut au moins deux tirages pour un écart n − n−1.
          </p>
        ) : (
          <>
            <ChartContainer
              config={chartConfig}
              className="aspect-auto h-[220px] w-full sm:h-[280px] lg:h-[340px]"
            >
              <ComposedChart
                key={`${view}-${showDayLines ? "mix" : "one"}-${dualAxis ? "dual" : "one"}`}
                accessibilityLayer
                data={chartData}
                margin={{ left: 4, right: dualAxis ? 8 : 8, top: 8, bottom: 4 }}
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
                  yAxisId="left"
                  domain={domains.left}
                  width={40}
                  tickLine={false}
                  axisLine={false}
                  allowDecimals={false}
                />
                {dualAxis ? (
                  <YAxis
                    yAxisId="right"
                    orientation="right"
                    domain={domains.right}
                    width={36}
                    tickLine={false}
                    axisLine={false}
                    allowDecimals={false}
                  />
                ) : null}
                <ReferenceLine
                  yAxisId="left"
                  y={0}
                  stroke="var(--muted-foreground)"
                  strokeOpacity={0.45}
                  strokeDasharray="4 4"
                />
                <ChartTooltip
                  content={
                    <DeltaTooltip
                      keys={keys}
                      hidden={hidden}
                      smaPeriod={smaPeriod}
                      showSma={smaOn}
                      showBb={bbOn}
                    />
                  }
                />
                {bbOn && visible.length === 1
                  ? visible.map((key) => (
                      <Fragment key={`bb-fill-${key}`}>
                        <Area
                          yAxisId={axisOf(key)}
                          type="linear"
                          dataKey={overlayField(key, "bbBase")}
                          stackId={`bb-${key}`}
                          fill="transparent"
                          stroke="none"
                          legendType="none"
                          tooltipType="none"
                          connectNulls
                          isAnimationActive={false}
                        />
                        <Area
                          yAxisId={axisOf(key)}
                          type="linear"
                          dataKey={overlayField(key, "bbSpan")}
                          stackId={`bb-${key}`}
                          fill={overlayStroke(key, "bb")}
                          fillOpacity={0.14}
                          stroke="none"
                          legendType="none"
                          tooltipType="none"
                          connectNulls
                          isAnimationActive={false}
                        />
                      </Fragment>
                    ))
                  : null}
                {visible.map((key) => (
                  <Line
                    key={key}
                    yAxisId={axisOf(key)}
                    dataKey={key}
                    type="linear"
                    stroke={`var(--color-${key})`}
                    strokeWidth={2}
                    dot={false}
                    connectNulls={false}
                    name={chartConfig[key].label}
                  />
                ))}
                {smaOn
                  ? visible.map((key) => (
                      <Line
                        key={`sma-${key}`}
                        yAxisId={axisOf(key)}
                        dataKey={overlayField(key, "sma")}
                        type="linear"
                        stroke={overlayStroke(key, "sma")}
                        strokeWidth={2}
                        strokeDasharray="5 4"
                        dot={false}
                        connectNulls
                        legendType="none"
                        name={`SMA ${smaPeriod} ${chartConfig[key].label}`}
                      />
                    ))
                  : null}
                {bbOn
                  ? visible.map((key) => (
                      <Fragment key={`bb-${key}`}>
                        <Line
                          yAxisId={axisOf(key)}
                          dataKey={overlayField(key, "bbUpper")}
                          type="linear"
                          stroke={overlayStroke(key, "bb")}
                          strokeWidth={1.25}
                          strokeDasharray="2 3"
                          strokeOpacity={visible.length === 1 ? 1 : 0.7}
                          dot={false}
                          connectNulls
                          legendType="none"
                          name={`Bollinger + ${chartConfig[key].label}`}
                        />
                        <Line
                          yAxisId={axisOf(key)}
                          dataKey={overlayField(key, "bbLower")}
                          type="linear"
                          stroke={overlayStroke(key, "bb")}
                          strokeWidth={1.25}
                          strokeDasharray="2 3"
                          strokeOpacity={visible.length === 1 ? 1 : 0.7}
                          dot={false}
                          connectNulls
                          legendType="none"
                          name={`Bollinger − ${chartConfig[key].label}`}
                        />
                        {!showSma ? (
                          <Line
                            yAxisId={axisOf(key)}
                            dataKey={overlayField(key, "sma")}
                            type="linear"
                            stroke={overlayStroke(key, "sma")}
                            strokeWidth={1.5}
                            strokeDasharray="4 3"
                            dot={false}
                            connectNulls
                            legendType="none"
                            name={`Bollinger ${chartConfig[key].label}`}
                          />
                        ) : null}
                      </Fragment>
                    ))
                  : null}
                {showDayLines && splitKey ? (
                  <>
                    <Line
                      yAxisId={axisOf(splitKey)}
                      dataKey="overlayMardi"
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
                      yAxisId={axisOf(splitKey)}
                      dataKey="overlayVendredi"
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
              </ComposedChart>
            </ChartContainer>
            <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
              {showDayLines && splitKey ? (
                <WeekdaySplitLegend
                  metric={String(chartConfig[splitKey].label)}
                  showMardi={dayLine.mardi}
                  showVendredi={dayLine.vendredi}
                  onToggle={(day: DrawWeekday) =>
                    setDayLine((current) => ({ ...current, [day]: !current[day] }))
                  }
                />
              ) : null}
              {smaPeriod > 0 ? (
                <>
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
                  <span className="inline-flex items-center gap-1">
                    <button
                      type="button"
                      aria-pressed={showBb}
                      title="Afficher ou masquer les bandes de Bollinger"
                      onClick={() => setShowBb((current) => !current)}
                      className={cn(
                        "flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-xs transition-opacity hover:bg-muted",
                        !showBb && "opacity-40"
                      )}
                    >
                      <span
                        className="size-2 shrink-0 rounded-[2px] border border-dashed"
                        style={{
                          borderColor: chartConfig.bbUpper.color,
                          background: "transparent",
                        }}
                      />
                      Bollinger
                    </button>
                    <HelpTip {...BB_HELP} />
                  </span>
                </>
              ) : null}
              {keys.map((key) => (
                <button
                  key={key}
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
              ))}
            </div>
            {view === "all" && visible.length > 2 ? (
              <p className="mt-2 text-center text-xs text-muted-foreground">
                Les sommes écrasent n1–n5 et les étoiles. Maj+clic isole une courbe, ou passez par n1 à n5 / e1 et e2.
              </p>
            ) : null}
            <ul className="mt-3 flex flex-wrap justify-center gap-x-4 gap-y-1 text-center text-xs tabular-nums text-muted-foreground">
              {summaries.map((row) => (
                <li key={row.key}>
                  {row.label}
                  {row.stats
                    ? ` · ${formatSigned(row.stats.last, 0)} · moy. ${formatSigned(row.stats.avg)} · |Δ| ${formatStat(row.stats.meanAbs)} · ${formatStreak(row.stats.streak.sign, row.stats.streak.length)}`
                    : " · —"}
                </li>
              ))}
              <li className="inline-flex items-center">
                <HelpTip {...SUMMARY_HELP} />
              </li>
            </ul>
          </>
        )}
      </CardContent>
    </Card>
  )
}
