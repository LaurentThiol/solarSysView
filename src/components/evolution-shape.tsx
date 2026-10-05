"use client"

import { Fragment, useMemo, useState } from "react"
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  XAxis,
  YAxis,
} from "recharts"

import { HelpTip, TitleHelp, type HelpCopy } from "@/components/help"
import { MonthEndMarks } from "@/components/month-end-marks"
import { WeekdaySeriesLines, WeekdaySplitLegend } from "@/components/weekday-split"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  ChartContainer,
  ChartTooltip,
  type ChartConfig,
} from "@/components/ui/chart"
import {
  bandExcursions,
  overlayBands,
  overlayField,
  overlayPeriodFor,
  overlayRecord,
  readOverlay,
  type BandPoint,
} from "@/lib/draw-overlays"
import { weekdaySplitKeys } from "@/lib/draw-chart-rank"
import {
  type Draw,
  formatDrawDate,
  formatShortDate,
  summarizeValues,
  toDrawSeries,
} from "@/lib/draws"
import { withMonthEndNote } from "@/lib/month-end"
import { DECADE_LABELS } from "@/lib/grid-shape"
import { cn } from "@/lib/utils"
import {
  seriesHasBothWeekdays,
  weekdayDayLineCaption,
  weekdayOverlayFieldsFor,
  weekdaySeriesPhrase,
  type DrawWeekday,
} from "@/lib/weekday-scope"

type ShapeView = "spread" | "consecutive" | "decades"

const VIEWS: { value: ShapeView; label: string }[] = [
  { value: "spread", label: "Étendue" },
  { value: "consecutive", label: "Consécutifs" },
  { value: "decades", label: "Décennies" },
]

const chartConfig = {
  spread: { label: "Étendue n°", color: "var(--chart-1)" },
  starSpread: { label: "Étendue ★", color: "var(--chart-2)" },
  consecutive: { label: "Consécutifs n°", color: "var(--chart-1)" },
  starConsecutive: { label: "Consécutifs ★", color: "var(--chart-2)" },
  d0: { label: DECADE_LABELS[0], color: "var(--chart-1)" },
  d1: { label: DECADE_LABELS[1], color: "var(--chart-2)" },
  d2: { label: DECADE_LABELS[2], color: "var(--chart-3)" },
  d3: { label: DECADE_LABELS[3], color: "var(--chart-4)" },
  d4: { label: DECADE_LABELS[4], color: "var(--chart-5)" },
  decadeOccupied: { label: "Observées", color: "var(--foreground)" },
  sma: { label: "SMA", color: "var(--chart-2)" },
  bbUpper: { label: "Bollinger +", color: "var(--chart-5)" },
  bbLower: { label: "Bollinger −", color: "var(--chart-5)" },
} satisfies ChartConfig

type SeriesKey =
  | "spread"
  | "starSpread"
  | "consecutive"
  | "starConsecutive"
  | "d0"
  | "d1"
  | "d2"
  | "d3"
  | "d4"
  | "decadeOccupied"

type ChartPoint = ReturnType<typeof toDrawSeries>[number] &
  Record<string, number | string | null>

const VIEW_KEYS: Record<ShapeView, SeriesKey[]> = {
  spread: ["spread", "starSpread"],
  consecutive: ["consecutive", "starConsecutive"],
  decades: ["d0", "d1", "d2", "d3", "d4", "decadeOccupied"],
}

const TITLE_HELP: HelpCopy = {
  title: "Forme de la grille",
  wide: true,
  body: `Trois lectures du tapis 5×10, les mêmes que Jeux :

• Étendue = max − min des 5 numéros (4 à 49). Les étoiles : e2 − e1 (1 à 11).
• Consécutifs = paires (n, n+1). 0 à 4 pour les numéros, 0 ou 1 pour les étoiles.
• Décennies = combien de boules dans 1–10, 11–20, …, 41–50. Observées = combien de ces bandes le tirage touche, de 1 (cinq boules dans la même décennie) à 5 (une boule par décennie).

SMA et Bollinger (optionnels) lissent ou encadrent chaque courbe visible. Maj+clic isole une série. Descriptif : chaque tirage reste indépendant.

Quand la fenêtre mêle mardi et vendredi, la première courbe visible se dédouble : mardi en trait plein, vendredi en tirets.`,
}

const VIEW_HELP: HelpCopy = {
  title: "Lecture",
  body: "Étendue et consécutifs superposent numéros et étoiles. Décennies : une courbe par bande de 10, plus Observées (bandes touchées par le tirage, de 1 à 5). SMA et Bollinger s’appliquent à chaque courbe visible.",
}

const SMA_HELP: HelpCopy = {
  title: "SMA",
  body: "Moyenne simple sur la période auto (5 tirages si la fenêtre a au moins 10 points, 10 si au moins 40). Une courbe par série visible. Lissage descriptif, pas une prédiction.",
}

const BB_HELP: HelpCopy = {
  title: "Bollinger",
  body: "Bandes SMA ± 2σ de chaque série visible. Le milieu est la SMA. %B dans l’infobulle : 0 = bande basse, 1 = bande haute. Maj+clic sur une pastille pour isoler sa bande. Dispersion observée, pas un signal de jeu.",
}

function formatStat(value: number, digits = 1) {
  return value.toLocaleString("fr-FR", {
    maximumFractionDigits: digits,
    minimumFractionDigits: 0,
  })
}

function formatPctB(value: number) {
  return value.toLocaleString("fr-FR", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  })
}

function yDomain(view: ShapeView): [number, number] {
  if (view === "spread") return [0, 49]
  if (view === "consecutive") return [0, 4]
  return [0, 5]
}

function mergeOverlays(
  points: ChartPoint[],
  key: SeriesKey,
  bands: BandPoint[]
): ChartPoint[] {
  return points.map((point, i) => ({
    ...point,
    ...overlayRecord(key, bands[i]),
  }))
}

function ShapeTooltip({
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
  payload?: Array<{
    dataKey?: string | number
    payload?: ChartPoint
  }>
  label?: string
  keys: SeriesKey[]
  hidden: Partial<Record<SeriesKey, boolean>>
  smaPeriod: number
  showSma: boolean
  showBb: boolean
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
                  <span className="flex-1 text-muted-foreground">
                    {chartConfig[key].label}
                  </span>
                  <span className="font-mono font-medium tabular-nums">
                    {typeof value === "number" ? formatStat(value, 0) : "—"}
                  </span>
                </div>
                {showSma ? (
                  <div className="flex items-center gap-2 pl-4 text-muted-foreground">
                    <span className="flex-1">SMA {smaPeriod}</span>
                    <span className="font-mono tabular-nums">
                      {sma == null ? "—" : formatStat(sma)}
                    </span>
                  </div>
                ) : null}
                {showBb ? (
                  <div className="flex items-center gap-2 pl-4 text-muted-foreground">
                    <span className="flex-1">Bollinger</span>
                    <span className="font-mono tabular-nums">
                      {lo == null || hi == null
                        ? "—"
                        : `${formatStat(lo)} – ${formatStat(hi)}${
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

export function EvolutionShape({ draws }: { draws: Draw[] }) {
  const [view, setView] = useState<ShapeView>("spread")
  const [hidden, setHidden] = useState<Partial<Record<SeriesKey, boolean>>>({})
  const [showSma, setShowSma] = useState(true)
  const [showBb, setShowBb] = useState(false)
  const [dayLine, setDayLine] = useState({ mardi: true, vendredi: true })

  const series = useMemo(() => toDrawSeries(draws), [draws])
  const keys = VIEW_KEYS[view]
  const visible = useMemo(() => keys.filter((key) => !hidden[key]), [keys, hidden])
  const smaPeriod = overlayPeriodFor(series.length)
  const multiSeries = view === "decades"
  const mixedDays = useMemo(() => seriesHasBothWeekdays(series), [series])
  const splitKeys = useMemo(() => weekdaySplitKeys(visible), [visible])
  const showDayLines = mixedDays && splitKeys.length > 0
  const splitLabels = splitKeys.map((key) => String(chartConfig[key].label))

  const overlayPacks = useMemo(() => {
    const packs: Partial<
      Record<SeriesKey, { abs: BandPoint[]; values: number[] }>
    > = {}
    if (!smaPeriod) return packs
    for (const key of keys) {
      const values = series.map((point) => point[key])
      packs[key] = { abs: overlayBands(values, smaPeriod), values }
    }
    return packs
  }, [series, keys, smaPeriod])

  const chartData = useMemo(() => {
    let points: ChartPoint[] = series
    if (showDayLines && splitKeys.length > 0) {
      points = points.map((point) => ({
        ...point,
        ...weekdayOverlayFieldsFor(
          point.weekday,
          splitKeys.map((key) => {
            const raw = point[key]
            return {
              key,
              value: typeof raw === "number" && Number.isFinite(raw) ? raw : null,
            }
          })
        ),
      }))
    }
    if (!smaPeriod) return points
    for (const key of keys) {
      const abs = overlayPacks[key]?.abs
      if (!abs) continue
      points = mergeOverlays(points, key, abs)
    }
    return points
  }, [series, smaPeriod, keys, overlayPacks, showDayLines, splitKeys])

  const summaries = useMemo(() => {
    return keys.map((key) => ({
      key,
      label: chartConfig[key].label,
      stats: summarizeValues(series.map((point) => point[key])),
    }))
  }, [series, keys])

  const excursions = useMemo(() => {
    if (!showBb || !smaPeriod) return []
    return visible
      .map((key) => {
        const pack = overlayPacks[key]
        if (!pack) return null
        const stats = bandExcursions(pack.values, pack.abs)
        if (!stats.ready) return null
        return { key, label: chartConfig[key].label, ...stats }
      })
      .filter(
        (item): item is { key: SeriesKey; label: string; outside: number; ready: number } =>
          Boolean(item)
      )
  }, [showBb, smaPeriod, visible, overlayPacks])

  function changeView(next: ShapeView) {
    if (next === view) return
    const leavingPair = view !== "decades"
    const enteringDecades = next === "decades"
    setView(next)
    setHidden({})
    if (leavingPair && enteringDecades) {
      setShowSma(false)
      setShowBb(false)
    } else if (!leavingPair && !enteringDecades) {
      setShowSma(true)
      setShowBb(false)
    }
  }

  function toggleSeries(key: SeriesKey, solo: boolean) {
    if (solo) {
      const alreadySolo =
        !hidden[key] && keys.every((item) => item === key || hidden[item])
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

  function overlayStroke(key: SeriesKey, kind: "sma" | "bb"): string {
    if (visible.length === 1) {
      return kind === "sma" ? "var(--color-sma)" : "var(--color-bbUpper)"
    }
    return `var(--color-${key})`
  }

  return (
    <Card>
      <CardHeader className="gap-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="text-base font-medium">
            <TitleHelp help={withMonthEndNote(TITLE_HELP)}>Forme · décennies, étendue, consécutifs</TitleHelp>
          </CardTitle>
          <div className="flex flex-col gap-1">
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              Lecture
              <HelpTip {...VIEW_HELP} />
            </span>
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Lecture de la forme">
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
                key={`${view}-${showDayLines ? "mix" : "one"}`}
                accessibilityLayer
                data={chartData}
                margin={{ left: 4, right: 8, top: 8, bottom: 4 }}
              >
                <CartesianGrid vertical={false} />
                <MonthEndMarks dates={series.map((point) => point.date)} />
                <XAxis
                  dataKey="date"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  minTickGap={28}
                  tickFormatter={formatShortDate}
                />
                <YAxis
                  domain={yDomain(view)}
                  width={36}
                  tickLine={false}
                  axisLine={false}
                  allowDecimals={false}
                  allowDataOverflow
                />
                <ChartTooltip
                  content={
                    <ShapeTooltip
                      keys={keys}
                      hidden={hidden}
                      smaPeriod={smaPeriod}
                      showSma={showSma && smaPeriod > 0}
                      showBb={showBb && smaPeriod > 0}
                    />
                  }
                />
                {showBb && smaPeriod > 0 && visible.length === 1
                  ? visible.map((key) => (
                      <Fragment key={`bb-fill-${key}`}>
                        <Area
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
                    dataKey={key}
                    type="linear"
                    stroke={`var(--color-${key})`}
                    strokeWidth={key === "decadeOccupied" ? 2.75 : 2}
                    dot={false}
                    name={chartConfig[key].label}
                  />
                ))}
                {smaPeriod > 0 && showSma
                  ? visible.map((key) => (
                      <Line
                        key={`sma-${key}`}
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
                {smaPeriod > 0 && showBb
                  ? visible.map((key) => (
                      <Fragment key={`bb-${key}`}>
                        <Line
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
                {showDayLines ? (
                  <WeekdaySeriesLines
                    seriesKeys={splitKeys}
                    showMardi={dayLine.mardi}
                    showVendredi={dayLine.vendredi}
                  />
                ) : null}
              </ComposedChart>
            </ChartContainer>
            <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
              {showDayLines ? (
                <WeekdaySplitLegend
                  metric={weekdaySeriesPhrase(splitLabels)}
                  seriesCount={splitKeys.length}
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
                          boxShadow: "inset 0 0 0 1px transparent",
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
            {showDayLines ? (
              <p className="mt-2 text-center text-xs text-muted-foreground">
                {weekdayDayLineCaption(splitLabels)}
              </p>
            ) : null}
            {multiSeries && (showSma || showBb) && visible.length > 2 ? (
              <p className="mt-2 text-center text-xs text-muted-foreground">
                Maj+clic sur une courbe pour n’afficher que sa SMA / bande.
              </p>
            ) : null}
            <ul className="mt-3 flex flex-wrap justify-center gap-x-4 gap-y-1 text-center text-xs tabular-nums text-muted-foreground">
              {summaries.map((row) => (
                <li key={row.key}>
                  {row.label}
                  {row.stats
                    ? ` · ${formatStat(row.stats.min, 0)}–${formatStat(row.stats.max, 0)} · moy. ${formatStat(row.stats.avg)}`
                    : " · —"}
                </li>
              ))}
              {excursions.length > 0 ? (
                <li className="inline-flex items-center gap-1">
                  <span>
                    hors bande{" "}
                    {excursions
                      .map((item) => `${item.label} ${item.outside}/${item.ready}`)
                      .join(" · ")}
                  </span>
                  <HelpTip
                    title="Hors bande"
                    body="Nombre de tirages où la série sort de SMA ± 2σ, une fois la fenêtre Bollinger pleine. Sous un bruit gaussien on attend ~5 %. Descriptif, pas un signal de jeu."
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
