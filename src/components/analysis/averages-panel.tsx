"use client"

import { useMemo, useState } from "react"
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts"

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  Disclaimer,
  OverlayToggle,
  Stat,
  formatStat,
  lineConfig,
} from "@/components/analysis/shared"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ema, sma } from "@/lib/analysis"
import { sliceSeries } from "@/lib/analysis-window"
import { techPack } from "@/lib/ta"

type Tech = ReturnType<typeof techPack>

export function AveragesPanel({
  dates,
  fullValues,
  warmupCount,
  windowSize,
  tech,
}: {
  dates: string[]
  fullValues: number[]
  warmupCount: number
  windowSize: number
  tech: Tech
}) {
  const [showSma, setShowSma] = useState(true)
  const [showEma, setShowEma] = useState(true)
  const [showWma, setShowWma] = useState(true)
  const [showHma, setShowHma] = useState(false)
  const [showVwma, setShowVwma] = useState(false)

  const smaLine = useMemo(() => sma(fullValues, windowSize), [fullValues, windowSize])
  const emaLine = useMemo(() => ema(fullValues, windowSize), [fullValues, windowSize])
  const workValues = fullValues.slice(warmupCount)

  const data = useMemo(
    () =>
      dates.map((date, i) => ({
        date,
        value: workValues[i],
        sma: sliceSeries(smaLine, warmupCount)[i],
        ema: sliceSeries(emaLine, warmupCount)[i],
        wma: sliceSeries(tech.wma, warmupCount)[i],
        hma: sliceSeries(tech.hma, warmupCount)[i],
        vwma: sliceSeries(tech.vwma, warmupCount)[i],
      })),
    [dates, workValues, smaLine, emaLine, warmupCount, tech]
  )

  const lastCross = tech.crosses.at(-1)

  return (
    <div className="flex flex-col gap-4">
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label={`SMA ${windowSize}`} value={formatStat(smaLine.at(-1) ?? null)} />
        <Stat label={`EMA ${windowSize}`} value={formatStat(emaLine.at(-1) ?? null)} />
        <Stat label="WMA" value={formatStat(tech.last.wma)} />
        <Stat label="HMA" value={formatStat(tech.last.hma)} />
      </section>
      <div className="flex flex-wrap gap-2">
        <OverlayToggle label="SMA" on={showSma} onClick={() => setShowSma(!showSma)} />
        <OverlayToggle label="EMA" on={showEma} onClick={() => setShowEma(!showEma)} />
        <OverlayToggle label="WMA" on={showWma} onClick={() => setShowWma(!showWma)} />
        <OverlayToggle label="HMA" on={showHma} onClick={() => setShowHma(!showHma)} />
        <OverlayToggle label="VWMA (activité)" on={showVwma} onClick={() => setShowVwma(!showVwma)} />
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Moyennes mobiles</CardTitle>
        </CardHeader>
        <CardContent>
          <ChartContainer config={lineConfig} className="aspect-auto h-[260px] w-full">
            <LineChart data={data} margin={{ left: 4, right: 8, top: 8 }}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="date" tickLine={false} axisLine={false} minTickGap={28} />
              <YAxis width={40} tickLine={false} axisLine={false} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Line type="monotone" dataKey="value" stroke="var(--color-value)" dot={false} strokeWidth={2} />
              {showSma ? <Line type="monotone" dataKey="sma" stroke="var(--color-sma)" dot={false} /> : null}
              {showEma ? <Line type="monotone" dataKey="ema" stroke="var(--color-ema)" dot={false} /> : null}
              {showWma ? <Line type="monotone" dataKey="wma" stroke="var(--color-wma)" dot={false} /> : null}
              {showHma ? <Line type="monotone" dataKey="hma" stroke="var(--color-hma)" dot={false} /> : null}
              {showVwma ? <Line type="monotone" dataKey="vwma" stroke="var(--color-vwma)" dot={false} /> : null}
            </LineChart>
          </ChartContainer>
          <Disclaimer>
            Croisement analogique SMA courte / longue :{" "}
            {lastCross ? `${lastCross.kind} à l’index ${lastCross.index}` : "aucun dans la série avec warmup"}.
            Descriptif seulement.
          </Disclaimer>
        </CardContent>
      </Card>
    </div>
  )
}
