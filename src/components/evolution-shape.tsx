"use client"

import { useMemo, useState } from "react"
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts"

import { HelpTip, TitleHelp, type HelpCopy } from "@/components/help"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  ChartContainer,
  ChartTooltip,
  type ChartConfig,
} from "@/components/ui/chart"
import {
  type Draw,
  formatDrawDate,
  formatShortDate,
  summarizeValues,
  toDrawSeries,
} from "@/lib/draws"
import { DECADE_LABELS } from "@/lib/grid-shape"
import { cn } from "@/lib/utils"

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
} satisfies ChartConfig

type SeriesKey = keyof typeof chartConfig

const TITLE_HELP: HelpCopy = {
  title: "Forme de la grille",
  wide: true,
  body: `Trois lectures du tapis 5×10, les mêmes que Jeux :

• Étendue = max − min des 5 numéros (4 à 49). Les étoiles : e2 − e1 (1 à 11).
• Consécutifs = paires (n, n+1). 0 à 4 pour les numéros, 0 ou 1 pour les étoiles.
• Décennies = combien de boules dans 1–10, 11–20, …, 41–50.

Descriptif : chaque tirage reste indépendant.`,
}

const VIEW_HELP: HelpCopy = {
  title: "Lecture",
  body: "Étendue et consécutifs superposent numéros et étoiles. Décennies : une courbe par bande de 10.",
}

function formatStat(value: number, digits = 1) {
  return value.toLocaleString("fr-FR", {
    maximumFractionDigits: digits,
    minimumFractionDigits: 0,
  })
}

function yDomain(view: ShapeView): [number, number] {
  if (view === "spread") return [0, 49]
  if (view === "consecutive") return [0, 4]
  return [0, 5]
}

function ShapeTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean
  payload?: Array<{
    dataKey?: string | number
    color?: string
    name?: string
    value?: number
  }>
  label?: string
}) {
  if (!active || !payload?.length) return null
  return (
    <div className="grid min-w-40 items-start gap-1.5 rounded-lg border border-border/50 bg-background px-2.5 py-1.5 text-xs shadow-xl">
      <div className="font-medium">{formatDrawDate(String(label))}</div>
      <div className="grid gap-1.5">
        {payload.map((item) => {
          const key = String(item.dataKey ?? "")
          if (key.startsWith("sma")) return null
          return (
            <div key={key} className="flex items-center gap-2">
              <span
                className="size-2.5 shrink-0 rounded-[2px]"
                style={{ background: item.color }}
              />
              <span className="flex-1 text-muted-foreground">
                {chartConfig[key as SeriesKey]?.label ?? item.name}
              </span>
              <span className="font-mono font-medium tabular-nums">
                {item.value == null ? "—" : formatStat(Number(item.value), 0)}
              </span>
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

  const series = useMemo(() => toDrawSeries(draws), [draws])
  const keys: SeriesKey[] =
    view === "spread"
      ? ["spread", "starSpread"]
      : view === "consecutive"
        ? ["consecutive", "starConsecutive"]
        : ["d0", "d1", "d2", "d3", "d4"]
  const visible = keys.filter((key) => !hidden[key])

  const summaries = useMemo(() => {
    return keys.map((key) => ({
      key,
      label: chartConfig[key].label,
      stats: summarizeValues(series.map((point) => point[key])),
    }))
  }, [series, keys])

  return (
    <Card>
      <CardHeader className="gap-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="text-base font-medium">
            <TitleHelp help={TITLE_HELP}>Forme · décennies, étendue, consécutifs</TitleHelp>
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
                  onClick={() => setView(item.value)}
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
              className="aspect-auto h-[280px] w-full sm:h-[340px]"
            >
              <LineChart
                key={view}
                accessibilityLayer
                data={series}
                margin={{ left: 4, right: 8, top: 8, bottom: 4 }}
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
                  domain={yDomain(view)}
                  width={36}
                  tickLine={false}
                  axisLine={false}
                  allowDecimals={false}
                />
                <ChartTooltip content={<ShapeTooltip />} />
                {visible.map((key) => (
                  <Line
                    key={key}
                    dataKey={key}
                    type="linear"
                    stroke={`var(--color-${key})`}
                    strokeWidth={2}
                    dot={false}
                    name={chartConfig[key].label}
                  />
                ))}
              </LineChart>
            </ChartContainer>
            <div className="mt-3 flex flex-wrap gap-2">
              {keys.map((key) => (
                <button
                  key={key}
                  type="button"
                  aria-pressed={!hidden[key]}
                  onClick={() =>
                    setHidden((current) => ({ ...current, [key]: !current[key] }))
                  }
                  className={cn(
                    "rounded-full border px-2.5 py-1 text-xs",
                    hidden[key]
                      ? "border-border text-muted-foreground"
                      : "border-primary/40 bg-primary/10 text-foreground"
                  )}
                >
                  {chartConfig[key].label}
                </button>
              ))}
            </div>
            <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs tabular-nums text-muted-foreground">
              {summaries.map((row) => (
                <li key={row.key}>
                  {row.label}
                  {row.stats
                    ? ` · ${formatStat(row.stats.min, 0)}–${formatStat(row.stats.max, 0)} · moy. ${formatStat(row.stats.avg)}`
                    : " · —"}
                </li>
              ))}
            </ul>
          </>
        )}
      </CardContent>
    </Card>
  )
}
