"use client"

import { useMemo, useState } from "react"
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts"

import { HelpTip, LabelHelp, TitleHelp } from "@/components/help"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
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
  type Draw,
  formatDrawDate,
  formatShortDate,
  summarizeValues,
  toDrawSeries,
} from "@/lib/draws"

export type DrawChartMode =
  | "sumNumbers"
  | "eachNumber"
  | "sumStars"
  | "eachStar"

const MODES: { value: DrawChartMode; label: string }[] = [
  { value: "sumNumbers", label: "Somme des numéros" },
  { value: "eachNumber", label: "Chaque numéro" },
  { value: "sumStars", label: "Somme des étoiles" },
  { value: "eachStar", label: "Chaque étoile" },
]

const chartConfig = {
  sumNumbers: { label: "Somme", color: "var(--chart-1)" },
  n1: { label: "n1", color: "var(--chart-1)" },
  n2: { label: "n2", color: "var(--chart-2)" },
  n3: { label: "n3", color: "var(--chart-3)" },
  n4: { label: "n4", color: "var(--chart-4)" },
  n5: { label: "n5", color: "var(--chart-5)" },
  sumStars: { label: "Somme étoiles", color: "var(--chart-4)" },
  e1: { label: "e1", color: "var(--chart-1)" },
  e2: { label: "e2", color: "var(--chart-2)" },
} satisfies ChartConfig

type SeriesKey = keyof typeof chartConfig

const MODE_KEYS: Record<DrawChartMode, SeriesKey[]> = {
  sumNumbers: ["sumNumbers"],
  eachNumber: ["n1", "n2", "n3", "n4", "n5"],
  sumStars: ["sumStars"],
  eachStar: ["e1", "e2"],
}

function yDomain(mode: DrawChartMode): [number, number] | [number, "auto"] {
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

export function DrawChart({ draws }: { draws: Draw[] }) {
  const [mode, setMode] = useState<DrawChartMode>("sumNumbers")
  const [hidden, setHidden] = useState<Partial<Record<SeriesKey, boolean>>>({})

  const series = useMemo(() => toDrawSeries(draws), [draws])
  const keys = MODE_KEYS[mode]
  const visibleKeys = keys.filter((key) => !hidden[key])

  const summaries = useMemo(() => {
    return visibleKeys
      .map((key) => {
        const stats = summarizeValues(series.map((point) => point[key]))
        if (!stats) return null
        return { key, label: chartConfig[key].label, ...stats }
      })
      .filter((item) => item !== null)
  }, [series, visibleKeys])

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
                body: "Chaque point est un tirage. Choisissez la série (somme, chaque boule, étoiles). Cliquez une pastille sous le graphe pour masquer une courbe.",
              }}
            >
              Évolution dans le temps
            </TitleHelp>
          </CardTitle>
          <LabelHelp
            label="Série"
            help={{
              title: "Série affichée",
              body: "Somme des 5 numéros, chacune des 5 boules, somme des 2 étoiles, ou chaque étoile. L’axe Y s’adapte (1–50 ou 1–12).",
            }}
          >
            <Select
              value={mode}
              onValueChange={(value) => changeMode(value as DrawChartMode)}
            >
              <SelectTrigger className="w-full sm:w-56" aria-label="Série affichée">
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
                  domain={yDomain(mode)}
                  width={36}
                  tickLine={false}
                  axisLine={false}
                  allowDecimals={false}
                />
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      labelFormatter={(value) =>
                        formatDrawDate(String(value ?? ""))
                      }
                    />
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
              </LineChart>
            </ChartContainer>
            <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
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
            {summaries.length > 0 ? (
              <p className="mt-3 text-center text-xs text-muted-foreground">
                {summaries
                  .map(
                    (item) =>
                      `${item.label} : min ${item.min} · max ${item.max} · moy. ${formatStat(item.avg)}`
                  )
                  .join("  ·  ")}
              </p>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  )
}
