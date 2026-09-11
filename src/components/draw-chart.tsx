"use client"

import { useMemo, useState } from "react"
import { CartesianGrid, Line, LineChart, ReferenceLine, XAxis, YAxis } from "recharts"

import { HelpTip, LabelHelp, TitleHelp } from "@/components/help"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { sma } from "@/lib/analysis"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"
import {
  NUMBER_SUM_RANGE,
  STAR_SUM_RANGE,
  type Draw,
  formatDrawDate,
  formatShortDate,
  pearsonCorrelation,
  rangeFromValues,
  relativeToRange,
  summarizeValues,
  toDrawSeries,
  type ValueRange,
} from "@/lib/draws"

export type DrawChartMode =
  | "sumBoth"
  | "sumNumbers"
  | "eachNumber"
  | "sumStars"
  | "eachStar"

type RelativeScale = "theory" | "window"

const MODES: { value: DrawChartMode; label: string }[] = [
  { value: "sumBoth", label: "Sommes (relatif)" },
  { value: "sumNumbers", label: "Somme des numéros" },
  { value: "eachNumber", label: "Chaque numéro" },
  { value: "sumStars", label: "Somme des étoiles" },
  { value: "eachStar", label: "Chaque étoile" },
]

const SCALE_OPTIONS: { value: RelativeScale; label: string }[] = [
  { value: "theory", label: "Plage possible" },
  { value: "window", label: "Fenêtre" },
]

const chartConfig = {
  sumNumbers: { label: "Somme", color: "var(--chart-1)" },
  relNumbers: { label: "Somme numéros", color: "var(--chart-1)" },
  n1: { label: "n1", color: "var(--chart-1)" },
  n2: { label: "n2", color: "var(--chart-2)" },
  n3: { label: "n3", color: "var(--chart-3)" },
  n4: { label: "n4", color: "var(--chart-4)" },
  n5: { label: "n5", color: "var(--chart-5)" },
  sumStars: { label: "Somme étoiles", color: "var(--chart-2)" },
  relStars: { label: "Somme étoiles", color: "var(--chart-2)" },
  e1: { label: "e1", color: "var(--chart-1)" },
  e2: { label: "e2", color: "var(--chart-2)" },
  sma: { label: "SMA", color: "var(--chart-2)" },
  smaNumbers: { label: "SMA numéros", color: "var(--chart-1)" },
  smaStars: { label: "SMA étoiles", color: "var(--chart-2)" },
} satisfies ChartConfig

type SeriesKey = Exclude<
  keyof typeof chartConfig,
  "sma" | "smaNumbers" | "smaStars"
>

type CombinedPoint = ReturnType<typeof toDrawSeries>[number] & {
  relNumbers: number
  relStars: number
  smaNumbers: number | null
  smaStars: number | null
  smaSumNumbers: number | null
  smaSumStars: number | null
}

const MODE_KEYS: Record<DrawChartMode, SeriesKey[]> = {
  sumBoth: ["relNumbers", "relStars"],
  sumNumbers: ["sumNumbers"],
  eachNumber: ["n1", "n2", "n3", "n4", "n5"],
  sumStars: ["sumStars"],
  eachStar: ["e1", "e2"],
}

function yDomain(mode: DrawChartMode): [number, number] | [number, "auto"] {
  if (mode === "sumBoth") return [0, 100]
  if (mode === "eachNumber") return [1, 50]
  if (mode === "eachStar") return [1, 12]
  if (mode === "sumStars") return [3, "auto"]
  return [15, "auto"]
}

function formatStat(value: number) {
  return value.toLocaleString("fr-FR", {
    maximumFractionDigits: 1,
    minimumFractionDigits: 0,
  })
}

function formatPct(value: number) {
  return `${value.toLocaleString("fr-FR", { maximumFractionDigits: 0 })} %`
}

function smaPeriodFor(length: number) {
  if (length >= 40) return 10
  if (length >= 10) return 5
  return 0
}

function resolveRange(
  scale: RelativeScale,
  values: number[],
  theory: ValueRange
): ValueRange {
  if (scale === "window") return rangeFromValues(values) ?? theory
  return theory
}

function CombinedTooltip({
  active,
  payload,
  label,
  smaPeriod,
}: {
  active?: boolean
  payload?: Array<{
    dataKey?: string | number
    color?: string
    payload?: CombinedPoint
  }>
  label?: string
  smaPeriod: number
}) {
  if (!active || !payload?.length) return null
  const point = payload[0]?.payload
  if (!point) return null

  const rows: { key: string; label: string; actual: number | null; rel: number | null; color: string }[] =
    []
  for (const item of payload) {
    const key = String(item.dataKey ?? "")
    if (key === "relNumbers") {
      rows.push({
        key,
        label: "Somme numéros",
        actual: point.sumNumbers,
        rel: point.relNumbers,
        color: item.color ?? chartConfig.relNumbers.color,
      })
    } else if (key === "relStars") {
      rows.push({
        key,
        label: "Somme étoiles",
        actual: point.sumStars,
        rel: point.relStars,
        color: item.color ?? chartConfig.relStars.color,
      })
    } else if (key === "smaNumbers") {
      rows.push({
        key,
        label: `SMA ${smaPeriod} numéros`,
        actual: point.smaSumNumbers,
        rel: point.smaNumbers,
        color: item.color ?? chartConfig.smaNumbers.color,
      })
    } else if (key === "smaStars") {
      rows.push({
        key,
        label: `SMA ${smaPeriod} étoiles`,
        actual: point.smaSumStars,
        rel: point.smaStars,
        color: item.color ?? chartConfig.smaStars.color,
      })
    }
  }

  return (
    <div className="grid min-w-40 items-start gap-1.5 rounded-lg border border-border/50 bg-background px-2.5 py-1.5 text-xs shadow-xl">
      <div className="font-medium">{formatDrawDate(String(label ?? point.date))}</div>
      <div className="grid gap-1.5">
        {rows.map((row) => (
          <div key={row.key} className="flex items-center gap-2">
            <span
              className="size-2.5 shrink-0 rounded-[2px]"
              style={{ background: row.color }}
            />
            <span className="flex-1 text-muted-foreground">{row.label}</span>
            <span className="font-mono font-medium tabular-nums">
              {row.actual == null ? "—" : formatStat(row.actual)}
            </span>
            <span className="w-12 text-right font-mono text-muted-foreground tabular-nums">
              {row.rel == null ? "—" : formatPct(row.rel)}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

export function DrawChart({ draws }: { draws: Draw[] }) {
  const [mode, setMode] = useState<DrawChartMode>("sumBoth")
  const [scale, setScale] = useState<RelativeScale>("theory")
  const [hidden, setHidden] = useState<Partial<Record<SeriesKey, boolean>>>({})
  const [showSma, setShowSma] = useState(true)

  const series = useMemo(() => toDrawSeries(draws), [draws])
  const keys = MODE_KEYS[mode]
  const visibleKeys = keys.filter((key) => !hidden[key])
  const combined = mode === "sumBoth"
  const canSma = combined || mode === "sumNumbers" || mode === "sumStars"
  const smaPeriod = canSma ? smaPeriodFor(series.length) : 0

  const chartData = useMemo(() => {
    if (combined) {
      const numberRange = resolveRange(
        scale,
        series.map((point) => point.sumNumbers),
        NUMBER_SUM_RANGE
      )
      const starRange = resolveRange(
        scale,
        series.map((point) => point.sumStars),
        STAR_SUM_RANGE
      )
      const smaN = smaPeriod ? sma(series.map((point) => point.sumNumbers), smaPeriod) : []
      const smaS = smaPeriod ? sma(series.map((point) => point.sumStars), smaPeriod) : []
      return series.map((point, i) => {
        const smaSumNumbers = smaPeriod ? (smaN[i] ?? null) : null
        const smaSumStars = smaPeriod ? (smaS[i] ?? null) : null
        return {
          ...point,
          relNumbers: relativeToRange(point.sumNumbers, numberRange),
          relStars: relativeToRange(point.sumStars, starRange),
          smaNumbers:
            smaSumNumbers == null ? null : relativeToRange(smaSumNumbers, numberRange),
          smaStars:
            smaSumStars == null ? null : relativeToRange(smaSumStars, starRange),
          smaSumNumbers,
          smaSumStars,
        }
      })
    }
    if (!smaPeriod) return series
    const key = mode === "sumStars" ? "sumStars" : "sumNumbers"
    const values = sma(
      series.map((point) => point[key]),
      smaPeriod
    )
    return series.map((point, i) => ({ ...point, sma: values[i] }))
  }, [series, smaPeriod, mode, combined, scale])

  const summaries = useMemo(() => {
    const items: { key: string; label: string; min: number; max: number; avg: number }[] =
      []
    if (combined) {
      const pairs = [
        {
          hiddenKey: "relNumbers" as const,
          valueKey: "sumNumbers" as const,
          label: chartConfig.relNumbers.label,
        },
        {
          hiddenKey: "relStars" as const,
          valueKey: "sumStars" as const,
          label: chartConfig.relStars.label,
        },
      ]
      for (const pair of pairs) {
        if (hidden[pair.hiddenKey]) continue
        const stats = summarizeValues(series.map((point) => point[pair.valueKey]))
        if (stats) items.push({ key: pair.valueKey, label: pair.label, ...stats })
      }
      return items
    }
    for (const key of visibleKeys) {
      if (key === "relNumbers" || key === "relStars") continue
      const stats = summarizeValues(series.map((point) => point[key]))
      if (stats) items.push({ key, label: chartConfig[key].label, ...stats })
    }
    return items
  }, [series, visibleKeys, combined, hidden])

  const correlation = useMemo(() => {
    if (!combined || series.length < 3) return null
    return pearsonCorrelation(
      series.map((point) => point.sumNumbers),
      series.map((point) => point.sumStars)
    )
  }, [combined, series])

  function changeMode(next: DrawChartMode) {
    setMode(next)
    setHidden({})
  }

  return (
    <Card>
      <CardHeader className="gap-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="text-base font-medium">
            <TitleHelp
              help={{
                title: "Évolution dans le temps",
                body: "Chaque point est un tirage. Le mode Sommes (relatif) superpose numéros et étoiles sur 0–100 %. Sur 20 ou 50 tirages la courbe se lit mieux. La SMA (5 ou 10) lisse la somme ; ce n’est pas un signal de jeu.",
              }}
            >
              Évolution dans le temps
            </TitleHelp>
          </CardTitle>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            {combined ? (
              <div className="flex flex-col gap-1">
                <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                  Échelle
                  <HelpTip
                    title="Échelle relative"
                    body="Plage possible : 0 % = minimum théorique (15 et 3), 100 % = maximum (240 et 23). 50 % = moyenne théorique. Fenêtre : chaque série est étirée entre son min et max de la période, pour comparer les formes."
                  />
                </span>
                <div className="flex flex-wrap gap-1.5" role="group" aria-label="Échelle relative">
                  {SCALE_OPTIONS.map((item) => (
                    <button
                      key={item.value}
                      type="button"
                      aria-pressed={scale === item.value}
                      onClick={() => setScale(item.value)}
                      className={cn(
                        "rounded-full border px-2.5 py-1 text-xs",
                        scale === item.value
                          ? "border-primary bg-primary/15 text-foreground"
                          : "border-border text-muted-foreground hover:text-foreground"
                      )}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
            <LabelHelp
              label="Série"
              help={{
                title: "Série affichée",
                body: "Sommes superposées (échelle relative), somme des 5 numéros, chacune des 5 boules, somme des 2 étoiles, ou chaque étoile. L’axe Y s’adapte (0–100 %, 1–50 ou 1–12).",
              }}
            >
              <Select
                value={mode}
                onValueChange={(value) => changeMode(value as DrawChartMode)}
              >
                <SelectTrigger className="w-full sm:w-64 sm:shrink-0" aria-label="Série affichée">
                  <span className="flex flex-1 text-left">
                    {MODES.find((item) => item.value === mode)?.label}
                  </span>
                </SelectTrigger>
                <SelectContent>
                  {MODES.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </LabelHelp>
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
              className="aspect-auto h-[280px] w-full sm:h-[340px]"
            >
              <LineChart
                key={`${mode}-${combined ? scale : "abs"}`}
                accessibilityLayer
                data={chartData}
                margin={{ left: 4, right: 8, top: combined ? 16 : 8, bottom: 4 }}
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
                  domain={yDomain(mode)}
                  width={combined ? 42 : 36}
                  tickLine={false}
                  axisLine={false}
                  allowDecimals={false}
                  tickFormatter={combined ? (value) => `${value}%` : undefined}
                />
                {combined && scale === "theory" ? (
                  <ReferenceLine
                    y={50}
                    stroke="var(--muted-foreground)"
                    strokeOpacity={0.4}
                    strokeDasharray="4 4"
                  />
                ) : null}
                <ChartTooltip
                  content={
                    combined ? (
                      <CombinedTooltip smaPeriod={smaPeriod} />
                    ) : (
                      <ChartTooltipContent
                        labelFormatter={(value) =>
                          formatDrawDate(String(value ?? ""))
                        }
                      />
                    )
                  }
                />
                {keys.map((key) => (
                  <Line
                    key={key}
                    dataKey={key}
                    type="monotone"
                    stroke={`var(--color-${key})`}
                    strokeWidth={2}
                    hide={Boolean(hidden[key])}
                    dot={series.length > 24 ? { r: 2 } : { r: 3 }}
                    activeDot={{ r: 4 }}
                  />
                ))}
                {combined && smaPeriod > 0 && showSma && !hidden.relNumbers ? (
                  <Line
                    dataKey="smaNumbers"
                    type="monotone"
                    stroke="var(--color-smaNumbers)"
                    strokeWidth={2}
                    strokeDasharray="5 4"
                    dot={false}
                    connectNulls
                    name={`SMA ${smaPeriod} numéros`}
                  />
                ) : null}
                {combined && smaPeriod > 0 && showSma && !hidden.relStars ? (
                  <Line
                    dataKey="smaStars"
                    type="monotone"
                    stroke="var(--color-smaStars)"
                    strokeWidth={2}
                    strokeDasharray="5 4"
                    dot={false}
                    connectNulls
                    name={`SMA ${smaPeriod} étoiles`}
                  />
                ) : null}
                {!combined && smaPeriod > 0 && showSma ? (
                  <Line
                    dataKey="sma"
                    type="monotone"
                    stroke="var(--color-sma)"
                    strokeWidth={2}
                    strokeDasharray="5 4"
                    dot={false}
                    connectNulls
                    name={`SMA ${smaPeriod}`}
                  />
                ) : null}
              </LineChart>
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
                        background: combined
                          ? chartConfig.smaNumbers.color
                          : chartConfig.sma.color,
                      }}
                    />
                    SMA {smaPeriod}
                  </button>
                  <HelpTip
                    title={`SMA ${smaPeriod}`}
                    body={`Moyenne simple sur ${smaPeriod} tirages, affichée sur la somme. Lissage descriptif, pas une prédiction.`}
                  />
                </span>
              ) : null}
              {keys.map((key) => (
                <span key={key} className="inline-flex items-center gap-1">
                  <button
                    type="button"
                    aria-pressed={!hidden[key]}
                    title={`Afficher ou masquer ${chartConfig[key].label}`}
                    onClick={() =>
                      setHidden((current) => ({
                        ...current,
                        [key]: !current[key],
                      }))
                    }
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
                  <HelpTip
                    title={chartConfig[key].label}
                    body={`Cliquez la pastille pour afficher ou masquer la série « ${chartConfig[key].label} » sur le graphique.`}
                  />
                </span>
              ))}
            </div>
            {combined ? (
              <p className="mt-3 text-center text-xs text-muted-foreground">
                {scale === "theory"
                  ? "0–100 % de la plage possible (numéros 15–240, étoiles 3–23). Trait à 50 % = moyenne théorique. Infobulle : sommes réelles."
                  : "0–100 % du min–max de la fenêtre, série par série, pour comparer les formes. Infobulle : sommes réelles."}
              </p>
            ) : null}
            {summaries.length > 0 ? (
              <p className="mt-3 flex flex-wrap items-center justify-center gap-x-1 gap-y-1 text-center text-xs text-muted-foreground">
                <span>
                  {summaries
                    .map(
                      (item) =>
                        `${item.label} : min ${item.min} · max ${item.max} · moy. ${formatStat(item.avg)}`
                    )
                    .join("  ·  ")}
                </span>
                {correlation != null ? (
                  <span className="inline-flex items-center gap-1">
                    <span>
                      · corrélation {formatStat(correlation)} (attendu ≈ 0)
                    </span>
                    <HelpTip
                      title="Corrélation"
                      body="Pearson entre somme des numéros et somme des étoiles sur la fenêtre. Proche de 0 si les deux tirages sont indépendants. Descriptif, pas un signal de jeu."
                    />
                  </span>
                ) : null}
              </p>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  )
}
