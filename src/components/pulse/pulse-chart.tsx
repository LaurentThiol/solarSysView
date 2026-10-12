"use client"

import { Bar, CartesianGrid, ComposedChart, Line, XAxis, YAxis } from "recharts"

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import { formatShortDate } from "@/lib/draws"
import type { PulsePoint } from "@/lib/pulse"

const config = {
  hit: { label: "Sortie", color: "var(--chart-1)" },
  wave: { label: "Onde", color: "var(--chart-2)" },
} satisfies ChartConfig

export function PulseChart({ points }: { points: PulsePoint[] }) {
  const rows = points.map((point) => ({
    date: formatShortDate(point.date),
    hit: point.hit,
    wave: point.wave,
  }))
  return (
    <ChartContainer config={config} className="aspect-auto h-72 w-full">
      <ComposedChart data={rows} margin={{ left: 8, right: 8, top: 8 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="date" tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={24} />
        <YAxis yAxisId="hit" domain={[0, 1]} width={28} tickLine={false} axisLine={false} />
        <YAxis
          yAxisId="wave"
          orientation="right"
          domain={[-1, 1]}
          width={32}
          tickLine={false}
          axisLine={false}
        />
        <ChartTooltip content={<ChartTooltipContent />} />
        <Bar yAxisId="hit" dataKey="hit" fill="var(--color-hit)" radius={2} />
        <Line
          yAxisId="wave"
          dataKey="wave"
          stroke="var(--color-wave)"
          dot={false}
          strokeWidth={2}
          type="monotone"
        />
      </ComposedChart>
    </ChartContainer>
  )
}
