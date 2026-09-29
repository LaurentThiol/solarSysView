"use client"

import {
  Area,
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  ReferenceLine,
  useXAxisScale,
  useYAxisScale,
  XAxis,
  YAxis,
  type MouseHandlerDataParam,
} from "recharts"

import { FAMILY_COLORS, TUBE_COLORS } from "@/components/tube/palette"
import { ChartContainer, ChartTooltip, type ChartConfig } from "@/components/ui/chart"
import { readTooltipIndex } from "@/lib/chart-draw/magnet"
import { formatShortDate } from "@/lib/draws"
import { SUM_MEAN, type TubeSection } from "@/lib/tube"

const SYNC_ID = "tube-flux"

type TubeRow = {
  date: string
  sum: number
  axis: number
  axisDeformed: number
  nominal: [number, number]
  deformed: [number, number]
  inside: boolean
  /** Variation de largeur, en % de la largeur nominale. */
  width: number
  /** Glissement de la section, en % de la demi-largeur nominale. */
  shift: number
}

function toRows(sections: readonly TubeSection[]): TubeRow[] {
  return sections.map((s) => ({
    date: s.date,
    sum: s.sum,
    axis: s.center,
    axisDeformed: s.deformedCenter,
    nominal: [s.lower, s.upper],
    deformed: [s.deformedLower, s.deformedUpper],
    inside: s.insideDeformed,
    width: (s.widthFactor - 1) * 100,
    shift: s.halfWidth > 0 ? (s.shift / s.halfWidth) * 100 : 0,
  }))
}

const tubeConfig = {
  deformed: { label: "Tube déformé", color: TUBE_COLORS.deformed },
  nominal: { label: "Tube nominal", color: TUBE_COLORS.nominal },
  axis: { label: "Axe SMA", color: TUBE_COLORS.nominal },
  axisDeformed: { label: "Axe déformé", color: TUBE_COLORS.deformed },
  sum: { label: "Somme", color: TUBE_COLORS.inside },
} satisfies ChartConfig

const strainConfig = {
  width: { label: "Largeur", color: FAMILY_COLORS.etirement },
  shift: { label: "Glissement", color: FAMILY_COLORS.cisaillement },
} satisfies ChartConfig

type HoverProps = {
  hover: number | null
  onHover: (index: number | null) => void
}

function hoverHandlers(onHover: HoverProps["onHover"]) {
  return {
    onMouseMove: (state: MouseHandlerDataParam) =>
      onHover(readTooltipIndex(state.activeTooltipIndex ?? state.activeIndex)),
    onMouseLeave: () => onHover(null),
  }
}

function formatPoints(value: number) {
  return value.toLocaleString("fr-FR", { maximumFractionDigits: 1 })
}

type TooltipPayload = ReadonlyArray<{ payload?: unknown }> | undefined

function TubeTooltip({ active, payload }: { active?: boolean; payload?: TooltipPayload }) {
  const row = payload?.[0]?.payload as TubeRow | undefined
  if (!active || !row) return null
  return (
    <div className="grid gap-0.5 rounded-lg border border-border/50 bg-background px-2.5 py-1.5 text-xs shadow-xl">
      <p className="font-medium text-foreground">{formatShortDate(row.date)}</p>
      <p className={row.inside ? "text-foreground" : "text-destructive"}>
        Somme {row.sum} · {row.inside ? "dans le tube" : "hors du tube"}
      </p>
      <p className="text-muted-foreground tabular-nums">
        Tube {formatPoints(row.deformed[0])} → {formatPoints(row.deformed[1])} · axe{" "}
        {formatPoints(row.axisDeformed)}
      </p>
    </div>
  )
}

function StrainTooltip({ active, payload }: { active?: boolean; payload?: TooltipPayload }) {
  const row = payload?.[0]?.payload as TubeRow | undefined
  if (!active || !row) return null
  const width = Math.round(row.width)
  const shift = Math.round(row.shift)
  return (
    <div className="grid gap-0.5 rounded-lg border border-border/50 bg-background px-2.5 py-1.5 text-xs shadow-xl">
      <p className="font-medium text-foreground">{formatShortDate(row.date)}</p>
      <p style={{ color: width >= 0 ? FAMILY_COLORS.etirement : FAMILY_COLORS.compression }}>
        {width >= 0 ? "Étirement" : "Compression"} {width >= 0 ? "+" : ""}
        {width} % de largeur
      </p>
      <p style={{ color: FAMILY_COLORS.cisaillement }}>
        Cisaillement {shift >= 0 ? "+" : ""}
        {shift} % de demi-largeur
      </p>
    </div>
  )
}

function FluxDot({
  cx,
  cy,
  inside,
  small,
}: {
  cx?: number
  cy?: number
  inside: boolean
  small: boolean
}) {
  if (cx == null || cy == null || !Number.isFinite(cx) || !Number.isFinite(cy)) return <g />
  const r = inside ? (small ? 1.6 : 2.6) : small ? 2.4 : 3.6
  return (
    <circle
      cx={cx}
      cy={cy}
      r={r}
      fill={inside ? TUBE_COLORS.inside : TUBE_COLORS.outside}
      fillOpacity={inside ? 0.75 : 1}
    />
  )
}

/** Anneaux : quelques sections du tube déformé, et celle sous le curseur. */
function SectionRings({ rows, hover, every }: { rows: TubeRow[]; hover: number | null; every: number }) {
  const xScale = useXAxisScale()
  const yScale = useYAxisScale()
  if (!xScale || !yScale) return null
  return (
    <g pointerEvents="none">
      {rows.map((row, i) => {
        const active = i === hover
        if (!active && i % every !== 0) return null
        const x = xScale(row.date, { position: "middle" })
        const y1 = yScale(row.deformed[0])
        const y2 = yScale(row.deformed[1])
        if (x == null || y1 == null || y2 == null) return null
        return (
          <line
            key={row.date}
            x1={x}
            x2={x}
            y1={y1}
            y2={y2}
            stroke={TUBE_COLORS.deformed}
            strokeOpacity={active ? 0.95 : 0.28}
            strokeWidth={active ? 2.5 : 1}
          />
        )
      })}
    </g>
  )
}

export function TubeChart({
  sections,
  domain,
  hover,
  onHover,
}: HoverProps & { sections: readonly TubeSection[]; domain: [number, number] }) {
  const rows = toRows(sections)
  const small = rows.length > 150
  const every = Math.max(1, Math.round(rows.length / 24))
  return (
    <ChartContainer config={tubeConfig} className="aspect-auto h-[300px] w-full sm:h-[380px]">
      <ComposedChart
        data={rows}
        syncId={SYNC_ID}
        margin={{ left: 4, right: 12, top: 10, bottom: 0 }}
        {...hoverHandlers(onHover)}
      >
        <CartesianGrid vertical={false} />
        <XAxis
          dataKey="date"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          minTickGap={32}
          tickFormatter={formatShortDate}
        />
        <YAxis
          domain={domain}
          width={36}
          tickLine={false}
          axisLine={false}
          allowDataOverflow
          tick={{ fontSize: 10 }}
        />
        <ReferenceLine
          y={SUM_MEAN}
          stroke="var(--border)"
          strokeDasharray="2 4"
          label={{ value: "127,5", position: "insideTopRight", fontSize: 10, fill: "var(--muted-foreground)" }}
        />
        <Area
          dataKey="nominal"
          type="linear"
          stroke="var(--color-nominal)"
          strokeOpacity={0.6}
          strokeDasharray="4 3"
          fill="var(--color-nominal)"
          fillOpacity={0.06}
          isAnimationActive={false}
          activeDot={false}
        />
        <Area
          dataKey="deformed"
          type="linear"
          stroke="var(--color-deformed)"
          strokeWidth={1.5}
          fill="var(--color-deformed)"
          fillOpacity={0.2}
          isAnimationActive={false}
          activeDot={false}
        />
        <SectionRings rows={rows} hover={hover} every={every} />
        <Line
          dataKey="axis"
          type="linear"
          stroke="var(--color-axis)"
          strokeDasharray="5 4"
          strokeWidth={1.25}
          dot={false}
          activeDot={false}
          isAnimationActive={false}
        />
        <Line
          dataKey="axisDeformed"
          type="linear"
          stroke="var(--color-axisDeformed)"
          strokeWidth={2}
          dot={false}
          activeDot={false}
          isAnimationActive={false}
        />
        <Line
          dataKey="sum"
          type="linear"
          stroke="var(--color-sum)"
          strokeOpacity={0.2}
          strokeWidth={1}
          dot={(props: { cx?: number; cy?: number; index?: number; payload?: TubeRow }) => (
            <FluxDot
              key={props.index}
              cx={props.cx}
              cy={props.cy}
              inside={props.payload?.inside ?? true}
              small={small}
            />
          )}
          activeDot={{ r: 5, fill: "var(--color-deformed)", stroke: "var(--background)" }}
          isAnimationActive={false}
        />
        <ChartTooltip cursor={false} content={<TubeTooltip />} />
      </ComposedChart>
    </ChartContainer>
  )
}

export function StrainChart({
  sections,
  hover,
  onHover,
}: HoverProps & { sections: readonly TubeSection[] }) {
  const rows = toRows(sections)
  return (
    <ChartContainer config={strainConfig} className="aspect-auto h-[120px] w-full">
      <ComposedChart
        data={rows}
        syncId={SYNC_ID}
        margin={{ left: 4, right: 12, top: 4, bottom: 0 }}
        {...hoverHandlers(onHover)}
      >
        <CartesianGrid vertical={false} />
        <XAxis dataKey="date" hide />
        <YAxis
          domain={[-100, 100]}
          ticks={[-100, -50, 0, 50, 100]}
          width={36}
          tickLine={false}
          axisLine={false}
          tick={{ fontSize: 10 }}
        />
        <ReferenceLine y={0} stroke="var(--border)" />
        <Bar dataKey="width" isAnimationActive={false} maxBarSize={10}>
          {rows.map((row, i) => (
            <Cell
              key={row.date}
              fill={row.width >= 0 ? FAMILY_COLORS.etirement : FAMILY_COLORS.compression}
              fillOpacity={i === hover ? 1 : 0.7}
            />
          ))}
        </Bar>
        <Line
          dataKey="shift"
          type="linear"
          stroke="var(--color-shift)"
          strokeWidth={1.75}
          dot={false}
          activeDot={{ r: 3.5, fill: "var(--color-shift)" }}
          isAnimationActive={false}
        />
        <ChartTooltip cursor={{ fill: "var(--muted)", fillOpacity: 0.4 }} content={<StrainTooltip />} />
      </ComposedChart>
    </ChartContainer>
  )
}
