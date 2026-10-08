"use client"

import { useMemo, useState } from "react"
import { CartesianGrid, ComposedChart, Line, XAxis, YAxis } from "recharts"

import { HelpTip, TitleHelp, type HelpCopy } from "@/components/help"
import { MonthEndMarks } from "@/components/month-end-marks"
import { WeekdaySeriesLines, WeekdaySplitLegend } from "@/components/weekday-split"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ChartContainer, ChartTooltip, type ChartConfig } from "@/components/ui/chart"
import { weekdaySplitKeys } from "@/lib/draw-chart-rank"
import {
  overlayBands,
  overlayField,
  overlayPeriodFor,
  overlayRecord,
  readOverlay,
  type BandPoint,
} from "@/lib/draw-overlays"
import { formatDrawDate, formatShortDate, type Draw } from "@/lib/draws"
import { withMonthEndNote } from "@/lib/month-end"
import {
  numberPersistTheory,
  persistShare,
  sharedStarPool,
  starPersistTheory,
  toPersistSeries,
  type PersistPoint,
  type PersistShare,
} from "@/lib/persist-evol"
import { cn } from "@/lib/utils"
import {
  seriesHasBothWeekdays,
  weekdayDayLineCaption,
  weekdayLinesOff,
  weekdayOverlayFieldsFor,
  weekdaySeriesPhrase,
  type DrawWeekday,
} from "@/lib/weekday-scope"

type PersistView = "both" | "numbers" | "stars"
type PersistKey = "numbers" | "stars" | "numbers2" | "stars2"

const VIEWS: { value: PersistView; label: string }[] = [
  { value: "both", label: "Les deux" },
  { value: "numbers", label: "Numéros" },
  { value: "stars", label: "Étoiles" },
]

const chartConfig = {
  numbers: { label: "Numéros n−1", color: "var(--chart-1)" },
  numbers2: { label: "Numéros n−2", color: "var(--chart-3)" },
  stars: { label: "Étoiles n−1", color: "var(--chart-2)" },
  stars2: { label: "Étoiles n−2", color: "var(--chart-4)" },
  sma: { label: "SMA", color: "var(--chart-2)" },
} satisfies ChartConfig

const VIEW_KEYS: Record<PersistView, PersistKey[]> = {
  both: ["numbers", "numbers2", "stars", "stars2"],
  numbers: ["numbers", "numbers2"],
  stars: ["stars", "stars2"],
}

function isLag2(key: PersistKey) {
  return key === "numbers2" || key === "stars2"
}

const TITLE_HELP: HelpCopy = {
  title: "Persist",
  wide: true,
  body: `Reprise d’une boule d’un tirage à l’autre, dans l’ordre de la fenêtre.

• n−1 : +1 si au moins une boule du tirage était déjà dans le tirage précédent, sinon 0.
• n−2 : même règle contre le tirage d’encore avant. Les deux premiers points n’ont pas de n−2.
• Numéros : les 5 boules. Étoiles : les 2 étoiles. Chaque décalage a sa courbe.
• L’infobulle nomme les boules reprises et la date comparée. Ce n’est pas le compte des paires n, n+1 de Forme.

La SMA, si elle est affichée, est le taux local de ces 0 / +1. La part de la fenêtre se compare au taux de deux grilles indépendantes, le même pour n−1 et n−2. Mardi seul, n−1 est le mardi d’avant dans la fenêtre, n−2 le mardi d’encore avant. Descriptif : chaque tirage reste indépendant.`,
}

const VIEW_HELP: HelpCopy = {
  title: "Lecture",
  body: "Les deux : numéros et étoiles, chacun en n−1 et en n−2, sur la même échelle 0 / +1. Les marches se superposent quand elles valent +1. n−2 est en pointillés. Numéros ou Étoiles ne garde qu’un pool. Une série seule, si la fenêtre mêle les deux soirs, se dédouble : mardi en trait plein, vendredi en tirets. Maj+clic sur une pastille fait de même.",
}

const SMA_HELP: HelpCopy = {
  title: "SMA",
  body: "Moyenne simple des 0 / +1, période auto (5 si au moins 10 tirages, 10 si au moins 40). Les trous du début n’entrent pas dans la fenêtre : un pour n−1, deux pour n−2. Taux local de reprise, pas une prédiction.",
}

const SUMMARY_HELP: HelpCopy = {
  title: "Part et série",
  body: "Sur les pas de la fenêtre : nombre de +1, part, série de +1 en cours à la fin, et le taux si deux grilles indépendantes sortent de l’urne (5 parmi 50, 2 étoiles parmi le pool de la fenêtre). Le taux est le même pour n−1 et n−2. Pools d’étoiles mélangés : pas de taux. Ce n’est pas un signal de jeu.",
}

const EMPTY_BAND: BandPoint = {
  sma: null,
  upper: null,
  lower: null,
  percentB: null,
}

type ChartPoint = PersistPoint & Record<string, number | string | null | number[]>

function formatPct(value: number) {
  return value.toLocaleString("fr-FR", {
    style: "percent",
    maximumFractionDigits: 1,
  })
}

function formatStep(value: number | null) {
  if (value == null) return "—"
  return value === 1 ? "+1" : "0"
}

function repriseLabel(values: number[]) {
  return values.length === 0 ? "aucune" : values.join(", ")
}

function alignBands(values: Array<0 | 1 | null>, period: number): BandPoint[] {
  const finite: number[] = []
  for (const value of values) {
    if (value === 0 || value === 1) finite.push(value)
  }
  const bands = overlayBands(finite, period)
  let cursor = 0
  return values.map((value) => {
    if (value !== 0 && value !== 1) return EMPTY_BAND
    const band = bands[cursor] ?? EMPTY_BAND
    cursor += 1
    return band
  })
}

function theoryFor(key: PersistKey, pool: number | null): number | null {
  if (key === "numbers" || key === "numbers2") return numberPersistTheory()
  return pool == null ? null : starPersistTheory(pool)
}

function repeatedOf(point: PersistPoint, key: PersistKey): number[] {
  if (key === "numbers") return point.repeatedNumbers
  if (key === "numbers2") return point.repeatedNumbers2
  if (key === "stars") return point.repeatedStars
  return point.repeatedStars2
}

function comparedDate(point: PersistPoint, key: PersistKey): string | null {
  return isLag2(key) ? point.lag2Date : point.prevDate
}

function PersistTooltip({
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
  keys: PersistKey[]
  hidden: Partial<Record<PersistKey, boolean>>
  smaPeriod: number
  showSma: boolean
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
            const raw = point[key]
            const value = raw === 0 || raw === 1 ? raw : null
            const repeated = repeatedOf(point, key)
            const against = comparedDate(point, key)
            const sma = showSma ? readOverlay(point, key, "sma") : null
            return (
              <div key={key} className="grid gap-0.5">
                <div className="flex items-center gap-2">
                  <span
                    className="size-2.5 shrink-0 rounded-[2px]"
                    style={{ background: chartConfig[key].color }}
                  />
                  <span className="flex-1 text-muted-foreground">{chartConfig[key].label}</span>
                  <span className="font-mono font-medium tabular-nums">{formatStep(value)}</span>
                </div>
                {value === 0 || value === 1 ? (
                  <div className="pl-4 text-muted-foreground">
                    {repriseLabel(repeated)}
                    {against ? ` · ${formatShortDate(against)}` : ""}
                  </div>
                ) : null}
                {showSma ? (
                  <div className="flex items-center gap-2 pl-4 text-muted-foreground">
                    <span className="flex-1">SMA {smaPeriod}</span>
                    <span className="font-mono tabular-nums">
                      {sma == null ? "—" : formatPct(sma)}
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

export function EvolutionPersist({ draws }: { draws: Draw[] }) {
  const [view, setView] = useState<PersistView>("both")
  const [hidden, setHidden] = useState<Partial<Record<PersistKey, boolean>>>({})
  const [showSma, setShowSma] = useState(true)
  const [dayLine, setDayLine] = useState<{ mardi: boolean; vendredi: boolean }>(weekdayLinesOff)

  const series = useMemo(() => toPersistSeries(draws), [draws])
  const keys = VIEW_KEYS[view]
  const visible = useMemo(() => keys.filter((key) => !hidden[key]), [keys, hidden])
  const smaPeriod = overlayPeriodFor(series.length)
  const mixedDays = useMemo(() => seriesHasBothWeekdays(series), [series])
  const splitKeys = useMemo(() => weekdaySplitKeys(visible), [visible])
  const showDayLines = mixedDays && splitKeys.length === 1
  const splitLabels = splitKeys.map((key) => String(chartConfig[key].label))
  const starPool = useMemo(() => sharedStarPool(draws), [draws])

  const chartData = useMemo(() => {
    let points: ChartPoint[] = series
    if (showDayLines && splitKeys.length > 0) {
      points = points.map((point) => ({
        ...point,
        ...weekdayOverlayFieldsFor(
          point.weekday,
          splitKeys.map((key) => ({ key, value: point[key] }))
        ),
      }))
    }
    if (smaPeriod > 0) {
      for (const key of keys) {
        const bands = alignBands(
          series.map((point) => point[key]),
          smaPeriod
        )
        points = points.map((point, index) => ({
          ...point,
          ...overlayRecord(key, bands[index] ?? EMPTY_BAND),
        }))
      }
    }
    return points
  }, [series, smaPeriod, keys, showDayLines, splitKeys])

  const summaries = useMemo(() => {
    return keys.map((key) => ({
      key,
      label: chartConfig[key].label,
      stats: persistShare(series.map((point) => point[key])),
      theory: theoryFor(key, starPool),
    }))
  }, [series, keys, starPool])

  function changeView(next: PersistView) {
    if (next === view) return
    setView(next)
    setHidden({})
  }

  function toggleSeries(key: PersistKey, solo: boolean) {
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

  function overlayStroke(key: PersistKey): string {
    if (visible.length === 1) return "var(--color-sma)"
    return `var(--color-${key})`
  }

  const smaOn = showSma && smaPeriod > 0

  return (
    <Card>
      <CardHeader className="gap-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="text-base font-medium">
            <TitleHelp help={withMonthEndNote(TITLE_HELP)}>Persist</TitleHelp>
          </CardTitle>
          <div className="flex flex-col gap-1">
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              Lecture
              <HelpTip {...VIEW_HELP} />
            </span>
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Lecture de la reprise">
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
            Il faut au moins deux tirages pour une reprise.
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
                  domain={[-0.08, 1.12]}
                  ticks={[0, 1]}
                  width={36}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(value) => (Number(value) === 1 ? "+1" : "0")}
                />
                <ChartTooltip
                  content={
                    <PersistTooltip
                      keys={keys}
                      hidden={hidden}
                      smaPeriod={smaPeriod}
                      showSma={smaOn}
                    />
                  }
                />
                {visible.map((key) => (
                  <Line
                    key={key}
                    dataKey={key}
                    type="stepAfter"
                    stroke={`var(--color-${key})`}
                    strokeWidth={2}
                    strokeDasharray={isLag2(key) ? "1 3" : undefined}
                    dot={false}
                    name={chartConfig[key].label}
                    isAnimationActive={false}
                  />
                ))}
                {smaOn
                  ? visible.map((key) => (
                      <Line
                        key={`sma-${key}`}
                        dataKey={overlayField(key, "sma")}
                        type="linear"
                        stroke={overlayStroke(key)}
                        strokeWidth={2}
                        strokeDasharray="5 4"
                        dot={false}
                        connectNulls
                        legendType="none"
                        name={`SMA ${smaPeriod} ${chartConfig[key].label}`}
                        isAnimationActive={false}
                      />
                    ))
                  : null}
                {showDayLines ? (
                  <WeekdaySeriesLines
                    seriesKeys={splitKeys}
                    showMardi={dayLine.mardi}
                    showVendredi={dayLine.vendredi}
                    type="stepAfter"
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
            {showDayLines && (dayLine.mardi || dayLine.vendredi) ? (
              <p className="mt-2 text-center text-xs text-muted-foreground">
                {weekdayDayLineCaption(splitLabels)}
              </p>
            ) : null}
            <ul className="mt-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-center text-xs tabular-nums text-muted-foreground">
              {summaries.map((row) => (
                <li key={row.key}>
                  {row.label}
                  {row.stats ? ` · ${summaryLine(row.stats, row.theory)}` : " · —"}
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

function summaryLine(stats: PersistShare, theory: number | null) {
  const law = theory == null ? "loi —" : `loi ${formatPct(theory)}`
  return `${stats.hits}/${stats.total} à +1 · ${formatPct(stats.share)} · série ${stats.streak} · ${law}`
}
