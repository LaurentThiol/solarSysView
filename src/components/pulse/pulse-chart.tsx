"use client"

import { Bar, CartesianGrid, ComposedChart, Line, XAxis, YAxis } from "recharts"

import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import { formatShortDate } from "@/lib/draws"
import type { PulseTrace } from "@/lib/pulse"
import { cn } from "@/lib/utils"

const PALETTE = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
]

function chartRows(tracks: PulseTrace[], classic: boolean) {
  const byDate = new Map<string, Record<string, string | number>>()
  tracks.forEach((track, index) => {
    const hitKey = classic ? "hit" : `hit${index}`
    const waveKey = classic ? "wave" : `wave${index}`
    for (const point of track.points) {
      const row = byDate.get(point.date) ?? { date: point.date }
      row[hitKey] = point.hit
      row[waveKey] = point.wave
      byDate.set(point.date, row)
    }
  })
  return [...byDate.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([, row]) => row)
}

function chartConfig(tracks: PulseTrace[], classic: boolean): ChartConfig {
  if (classic) {
    return {
      hit: { label: "Sortie", color: "var(--chart-1)" },
      wave: { label: "Onde", color: "var(--chart-2)" },
    }
  }
  const config: ChartConfig = {}
  tracks.forEach((track, index) => {
    const color = PALETTE[index % PALETTE.length]
    config[`hit${index}`] = { label: `${track.label} · sortie`, color }
    config[`wave${index}`] = { label: track.label, color }
  })
  return config
}

export function PulseChart({
  points,
  series,
}: {
  points?: PulseTrace["points"]
  series?: PulseTrace[]
}) {
  const source: PulseTrace[] =
    series && series.length > 0
      ? series
      : points
        ? [{ id: "main", label: "Onde", points }]
        : []
  const tracks = source.filter((track) => track.points.length > 0)
  if (tracks.length === 0) return null
  const classic = !(series && series.length > 0)
  const rows = chartRows(tracks, classic)
  const config = chartConfig(tracks, classic)
  return (
    <ChartContainer
      config={config}
      className={cn("aspect-auto w-full", classic ? "h-72" : "h-80")}
      data-pulse-chart={classic ? "single" : "group"}
    >
      <ComposedChart data={rows} margin={{ left: 8, right: 8, top: 8 }}>
        <CartesianGrid vertical={false} />
        <XAxis
          dataKey="date"
          tickLine={false}
          axisLine={false}
          interval="preserveStartEnd"
          minTickGap={24}
          tickFormatter={(value) => formatShortDate(String(value))}
        />
        <YAxis yAxisId="hit" domain={[0, 1]} width={28} tickLine={false} axisLine={false} />
        <YAxis
          yAxisId="wave"
          orientation="right"
          domain={[-1, 1]}
          width={32}
          tickLine={false}
          axisLine={false}
        />
        <ChartTooltip
          content={
            <ChartTooltipContent
              labelFormatter={(value) => formatShortDate(String(value ?? ""))}
            />
          }
        />
        {classic ? null : <ChartLegend content={<ChartLegendContent />} />}
        {tracks.map((track, index) => {
          const hitKey = classic ? "hit" : `hit${index}`
          return (
            <Bar
              key={`${track.id}-hit`}
              yAxisId="hit"
              dataKey={hitKey}
              fill={`var(--color-${hitKey})`}
              radius={2}
              legendType="none"
            />
          )
        })}
        {tracks.map((track, index) => {
          const waveKey = classic ? "wave" : `wave${index}`
          return (
            <Line
              key={`${track.id}-wave`}
              yAxisId="wave"
              dataKey={waveKey}
              name={track.label}
              stroke={`var(--color-${waveKey})`}
              dot={false}
              strokeWidth={2}
              type="monotone"
              connectNulls={false}
            />
          )
        })}
      </ComposedChart>
    </ChartContainer>
  )
}
