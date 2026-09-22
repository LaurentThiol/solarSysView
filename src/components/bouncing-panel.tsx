"use client"

import { useEffect, useMemo, useState } from "react"
import { CartesianGrid, ComposedChart, Line, ReferenceDot, XAxis, YAxis } from "recharts"

import { TitleHelp, type HelpCopy } from "@/components/help"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import { PillTabs } from "@/components/ui/pill-tabs"
import {
  BOUNCE_SERIES,
  bounceCaptureOf,
  scanBounces,
  type BounceCapture,
  type BounceEpisode,
} from "@/lib/bouncing"
import { formatShortDate, toDrawSeries, type Draw, type DrawSeriesPoint } from "@/lib/draws"
import { cn } from "@/lib/utils"

const HELP: HelpCopy = {
  title: "Bouncing",
  wide: true,
  body: "Cherche, sur n1…n5 et e1, e2, les passages où la courbe fait des arches de plus en plus basses, comme une balle qui s’amortit. e est la restitution : chaque rebond garde cette fraction de la hauteur précédente. Le trait plein est l’épisode, les pointillés sont les sommets théoriques, les points sont les contacts. Lecture du tracé, pas un pronostic.",
}

const FILTERS = [
  { id: "all" as const, label: "Toutes" },
  ...BOUNCE_SERIES.map((id) => ({ id, label: id })),
]

type SeriesFilter = (typeof FILTERS)[number]["id"]

const chartConfig = {
  value: { label: "Série", color: "var(--muted-foreground)" },
  episode: { label: "Épisode", color: "var(--chart-1)" },
  envelope: { label: "Enveloppe", color: "var(--chart-5)" },
} satisfies ChartConfig

function formatRatio(value: number) {
  return value.toLocaleString("fr-FR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function formatDay(iso: string | null) {
  if (!iso) return "?"
  return new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short" }).format(
    new Date(`${iso}T12:00:00`)
  )
}

function formatHalfLife(value: number) {
  if (!Number.isFinite(value)) return "—"
  return value.toLocaleString("fr-FR", { maximumFractionDigits: 1 })
}

function episodeLine(episode: BounceEpisode) {
  return `${episode.series} · ${episode.bounces} rebonds · e ≈ ${formatRatio(episode.restitution)} · hauteurs ×${formatRatio(episode.heightRatio)} · R² ${formatRatio(episode.r2)} · ${formatDay(episode.fromDate)} → ${formatDay(episode.toDate)}`
}

function chartRows(points: DrawSeriesPoint[], episode: BounceEpisode) {
  const envelopeAt = new Map(episode.envelope.map((point) => [point.index, point.value]))
  return points.map((point, index) => {
    const inside = index >= episode.fromIndex && index <= episode.toIndex
    return {
      date: point.date,
      value: point[episode.series],
      episode: inside ? point[episode.series] : null,
      envelope: envelopeAt.get(index) ?? null,
    }
  })
}

export function BouncingPanel({
  draws,
  onEpisode,
}: {
  draws: Draw[]
  onEpisode?: (episode: BounceCapture | null) => void
}) {
  const [filter, setFilter] = useState<SeriesFilter>("all")
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const points = useMemo(() => toDrawSeries(draws), [draws])
  const episodes = useMemo(() => scanBounces(points), [points])
  const visible = useMemo(
    () => (filter === "all" ? episodes : episodes.filter((episode) => episode.series === filter)),
    [episodes, filter]
  )
  const selected = visible.find((episode) => episode.id === selectedId) ?? visible[0] ?? null

  useEffect(() => {
    onEpisode?.(selected ? bounceCaptureOf(selected) : null)
  }, [onEpisode, selected])

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <TitleHelp help={HELP}>Atténuation</TitleHelp>
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          n1 à n5 et e1, e2 sur la fenêtre affichée. Une arche qui s’amortit décrit
          le tracé, elle ne dit rien du tirage suivant.
        </p>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <PillTabs
          label="Série"
          mode="chips"
          compact
          wrap
          value={filter}
          onValueChange={setFilter}
          items={FILTERS}
        />
        {visible.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {episodes.length === 0
              ? "Aucun amortissement de rebond sur cette fenêtre."
              : "Aucun amortissement de rebond sur cette série."}
          </p>
        ) : (
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
            <ul className="flex max-h-80 flex-col gap-1.5 overflow-y-auto" aria-label="Épisodes">
              {visible.map((episode) => {
                const active = episode.id === selected?.id
                return (
                  <li key={episode.id}>
                    <button
                      type="button"
                      aria-pressed={active}
                      onClick={() => setSelectedId(episode.id)}
                      className={cn(
                        "w-full rounded-lg px-3 py-2 text-left text-sm leading-5 ring-1 ring-foreground/10",
                        active ? "bg-muted ring-foreground/25" : "hover:bg-muted/60"
                      )}
                    >
                      {episodeLine(episode)}
                    </button>
                  </li>
                )
              })}
            </ul>
            {selected ? <BounceChart points={points} episode={selected} /> : null}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function BounceChart({
  points,
  episode,
}: {
  points: DrawSeriesPoint[]
  episode: BounceEpisode
}) {
  const rows = chartRows(points, episode)
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <p className="text-sm tabular-nums">
        {episode.series} · e {formatRatio(episode.restitution)} · hauteurs ×
        {formatRatio(episode.heightRatio)} · R² {formatRatio(episode.r2)} · demi-vie{" "}
        {formatHalfLife(episode.halfLifeDraws)} tirages
      </p>
      <ChartContainer config={chartConfig} className="aspect-auto h-64 w-full">
        <ComposedChart data={rows} margin={{ left: 4, right: 8, top: 8 }}>
          <CartesianGrid vertical={false} />
          <XAxis
            dataKey="date"
            tickLine={false}
            axisLine={false}
            minTickGap={28}
            tickFormatter={(value) => formatShortDate(String(value))}
          />
          <YAxis width={36} tickLine={false} axisLine={false} />
          <ChartTooltip
            content={
              <ChartTooltipContent
                labelFormatter={(value) => formatShortDate(String(value))}
              />
            }
          />
          <Line
            type="monotone"
            dataKey="value"
            stroke="var(--color-value)"
            dot={false}
            strokeWidth={1.5}
            isAnimationActive={false}
          />
          <Line
            type="monotone"
            dataKey="episode"
            stroke="var(--color-episode)"
            dot={false}
            strokeWidth={2.5}
            connectNulls={false}
            isAnimationActive={false}
          />
          <Line
            type="monotone"
            dataKey="envelope"
            stroke="var(--color-envelope)"
            strokeDasharray="4 4"
            dot={false}
            strokeWidth={1.5}
            connectNulls
            isAnimationActive={false}
          />
          {episode.impacts.map((point) => (
            <ReferenceDot
              key={`impact-${point.index}`}
              x={points[point.index]?.date}
              y={point.value}
              r={3}
              fill="var(--chart-3)"
              stroke="none"
            />
          ))}
          {episode.apexes.map((point) => (
            <ReferenceDot
              key={`apex-${point.index}`}
              x={points[point.index]?.date}
              y={point.value}
              r={3.5}
              fill="var(--chart-1)"
              stroke="none"
            />
          ))}
        </ComposedChart>
      </ChartContainer>
      <p className="text-xs text-muted-foreground">
        Trait pâle : toute la fenêtre. Trait plein : épisode. Pointillés : sommets
        théoriques. Points : contacts au sol et sommets observés.
      </p>
    </div>
  )
}
