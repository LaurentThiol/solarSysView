"use client"

import { Scatter, ScatterChart, Tooltip, XAxis, YAxis } from "recharts"

import { ChartContainer, type ChartConfig } from "@/components/ui/chart"
import { formatJournalDay, timelineDomain, type TimelinePoint } from "@/lib/journal"

const LANE_COLORS = [
  "#7eb6ff",
  "#f0a202",
  "#7dce82",
  "#e07a9a",
  "#c4b5fd",
  "#67e8f9",
  "#fbbf24",
  "#86efac",
  "#fda4af",
  "#93c5fd",
  "#f9a8d4",
  "#a3e635",
  "#fdba74",
  "#5eead4",
  "#d8b4fe",
  "#fde68a",
  "#6ee7b7",
  "#fca5a5",
  "#a5b4fc",
  "#fcd34d",
  "#67e8f9",
  "#86efac",
  "#f9a8d4",
  "#fdba74",
  "#c4b5fd",
  "#7eb6ff",
]

const chartConfig = {
  pr: { label: "PR", color: "#7eb6ff" },
} satisfies ChartConfig

export function JournalTimeline({
  points,
  lanes,
  selectedSlug,
  onSelect,
}: {
  points: TimelinePoint[]
  lanes: string[]
  selectedSlug: string | null
  onSelect: (slug: string) => void
}) {
  if (points.length === 0) {
    return <p className="text-sm text-muted-foreground">Aucune PR sur cette sélection.</p>
  }
  const height = Math.max(220, lanes.length * 28 + 36)
  const domain = timelineDomain(points)
  const colorOf = new Map(lanes.map((lane, index) => [lane, LANE_COLORS[index % LANE_COLORS.length]]))

  function Dot(props: { cx?: number; cy?: number; payload?: TimelinePoint }) {
    const { cx, cy, payload } = props
    if (cx == null || cy == null || !payload) return null
    const selected = payload.slug === selectedSlug
    return (
      <circle
        cx={cx}
        cy={cy}
        r={selected ? 6 : 4.5}
        fill={colorOf.get(payload.lane) ?? "#7eb6ff"}
        stroke={selected ? "var(--foreground)" : "transparent"}
        strokeWidth={2}
        style={{ cursor: "pointer" }}
        onClick={() => onSelect(payload.slug)}
      >
        <title>{`#${payload.number} ${payload.title}`}</title>
      </circle>
    )
  }

  return (
    <div className="overflow-x-auto">
      <ChartContainer
        config={chartConfig}
        className="aspect-auto min-w-[720px]"
        style={{ height }}
        initialDimension={{ width: 960, height }}
      >
        <ScatterChart margin={{ top: 8, right: 12, bottom: 4, left: 4 }}>
          <XAxis
            dataKey="x"
            type="number"
            domain={[domain.min, domain.max]}
            tickFormatter={(value: number) =>
              formatJournalDay(new Date(value).toISOString().slice(0, 10))
            }
            tick={{ fontSize: 11 }}
            minTickGap={28}
          />
          <YAxis
            dataKey="y"
            type="number"
            reversed
            domain={[-0.5, Math.max(lanes.length - 0.5, 0.5)]}
            ticks={lanes.map((_, index) => index)}
            tickFormatter={(value: number) => lanes[value] ?? ""}
            width={132}
            tick={{ fontSize: 11 }}
            interval={0}
          />
          <Tooltip
            cursor={{ strokeDasharray: "3 3" }}
            content={({ active, payload }) => {
              const point = payload?.[0]?.payload as TimelinePoint | undefined
              if (!active || !point) return null
              return (
                <div className="max-w-xs rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs leading-5 shadow-sm">
                  <p className="font-medium">
                    #{point.number} · {formatJournalDay(point.mergedOn)}
                  </p>
                  <p>{point.title}</p>
                </div>
              )
            }}
          />
          <Scatter data={points} shape={Dot} isAnimationActive={false} />
        </ScatterChart>
      </ChartContainer>
    </div>
  )
}
