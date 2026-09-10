"use client"

import { useMemo, useState } from "react"
import { CartesianGrid, Line, LineChart, ReferenceLine, XAxis, YAxis } from "recharts"

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  Disclaimer,
  OverlayToggle,
  HELP,
  Stat,
  formatStat,
  lineConfig,
} from "@/components/analysis/shared"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { sliceSeries } from "@/lib/analysis-window"
import { techPack } from "@/lib/ta"

type Tech = ReturnType<typeof techPack>

export function VolatilityPanel({
  dates,
  values,
  warmupCount,
  tech,
}: {
  dates: string[]
  values: number[]
  warmupCount: number
  tech: Tech
}) {
  const [showBb, setShowBb] = useState(true)
  const [showKc, setShowKc] = useState(true)
  const [showDc, setShowDc] = useState(false)
  const squeezeCount = tech.squeeze.filter((v) => v === true).length

  const data = useMemo(
    () =>
      dates.map((date, i) => ({
        date,
        value: values[i],
        bbUpper: sliceSeries(tech.bollinger.upper, warmupCount)[i],
        bbMiddle: sliceSeries(tech.bollinger.middle, warmupCount)[i],
        bbLower: sliceSeries(tech.bollinger.lower, warmupCount)[i],
        kcUpper: sliceSeries(tech.keltner.upper, warmupCount)[i],
        kcLower: sliceSeries(tech.keltner.lower, warmupCount)[i],
        donchianUpper: sliceSeries(tech.donchian.upper, warmupCount)[i],
        donchianLower: sliceSeries(tech.donchian.lower, warmupCount)[i],
        percentB: sliceSeries(tech.bollinger.percentB, warmupCount)[i],
        bbWidth: sliceSeries(tech.bollinger.width, warmupCount)[i],
      })),
    [dates, values, warmupCount, tech]
  )

  return (
    <div className="flex flex-col gap-4">
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="%B" value={formatStat(tech.last.percentB)} />
        <Stat label="Squeezes" value={String(squeezeCount)} />
        <Stat label="ATR" value={formatStat(tech.last.atr)} />
        <Stat
          label="Largeur BB"
          value={formatStat(tech.bollinger.width.filter((v): v is number => v != null).at(-1) ?? null)}
        />
      </section>
      <div className="flex flex-wrap gap-2">
        <OverlayToggle label="Bollinger" on={showBb} onClick={() => setShowBb(!showBb)} help={HELP.bollinger} />
        <OverlayToggle label="Keltner" on={showKc} onClick={() => setShowKc(!showKc)} help={HELP.keltner} />
        <OverlayToggle label="Donchian" on={showDc} onClick={() => setShowDc(!showDc)} help={HELP.donchian} />
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Bandes de volatilité</CardTitle>
        </CardHeader>
        <CardContent>
          <ChartContainer config={lineConfig} className="aspect-auto h-[260px] w-full">
            <LineChart data={data} margin={{ left: 4, right: 8, top: 8 }}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="date" tickLine={false} axisLine={false} minTickGap={28} />
              <YAxis width={40} tickLine={false} axisLine={false} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Line type="monotone" dataKey="value" stroke="var(--color-value)" dot={false} strokeWidth={2} />
              {showBb ? (
                <>
                  <Line type="monotone" dataKey="bbUpper" stroke="var(--color-bbUpper)" dot={false} strokeDasharray="4 3" />
                  <Line type="monotone" dataKey="bbMiddle" stroke="var(--color-bbMiddle)" dot={false} strokeDasharray="4 3" />
                  <Line type="monotone" dataKey="bbLower" stroke="var(--color-bbLower)" dot={false} strokeDasharray="4 3" />
                </>
              ) : null}
              {showKc ? (
                <>
                  <Line type="monotone" dataKey="kcUpper" stroke="var(--color-kcUpper)" dot={false} strokeDasharray="2 2" />
                  <Line type="monotone" dataKey="kcLower" stroke="var(--color-kcLower)" dot={false} strokeDasharray="2 2" />
                </>
              ) : null}
              {showDc ? (
                <>
                  <Line type="monotone" dataKey="donchianUpper" stroke="var(--color-donchianUpper)" dot={false} />
                  <Line type="monotone" dataKey="donchianLower" stroke="var(--color-donchianLower)" dot={false} />
                </>
              ) : null}
            </LineChart>
          </ChartContainer>
          <Disclaimer>
            Squeeze = Bollinger à l’intérieur de Keltner. Donchian 20 est le cœur du système Turtle.
          </Disclaimer>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>%B et largeur normalisée</CardTitle>
        </CardHeader>
        <CardContent>
          <ChartContainer config={lineConfig} className="aspect-auto h-[160px] w-full">
            <LineChart data={data} margin={{ left: 4, right: 8, top: 8 }}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="date" tickLine={false} axisLine={false} minTickGap={28} />
              <YAxis width={36} tickLine={false} axisLine={false} />
              <ReferenceLine y={1} strokeDasharray="3 3" />
              <ReferenceLine y={0} strokeDasharray="3 3" />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Line type="monotone" dataKey="percentB" stroke="var(--color-percentB)" dot={false} />
              <Line type="monotone" dataKey="bbWidth" stroke="var(--color-bbWidth)" dot={false} />
            </LineChart>
          </ChartContainer>
        </CardContent>
      </Card>
    </div>
  )
}
