"use client"

import { useMemo, useState } from "react"
import { Bar, CartesianGrid, ComposedChart, Line, LineChart, ReferenceLine, XAxis, YAxis } from "recharts"

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
import { macd, rsi } from "@/lib/analysis"
import { sliceSeries } from "@/lib/analysis-window"
import { techPack } from "@/lib/ta"

type Tech = ReturnType<typeof techPack>

export function MomentumPanel({
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
  const [showRsi, setShowRsi] = useState(true)
  const [showMacd, setShowMacd] = useState(true)
  const [showStoch, setShowStoch] = useState(true)
  const [showCci, setShowCci] = useState(false)
  const [showWr, setShowWr] = useState(false)

  const rsiLine = useMemo(() => rsi(values, 14), [values])
  const macdPack = useMemo(() => macd(values), [values])

  const data = useMemo(
    () =>
      dates.map((date, i) => {
        const fi = warmupCount + i
        return {
          date,
          rsi: rsiLine[fi] ?? rsiLine[i],
          line: macdPack.line[fi] ?? macdPack.line[i],
          signal: macdPack.signal[fi] ?? macdPack.signal[i],
          histogram: macdPack.histogram[fi] ?? macdPack.histogram[i],
          k: sliceSeries(tech.stochastic.k, warmupCount)[i],
          d: sliceSeries(tech.stochastic.d, warmupCount)[i],
          cci: sliceSeries(tech.cci, warmupCount)[i],
          wr: sliceSeries(tech.williamsR, warmupCount)[i],
        }
      }),
    [dates, warmupCount, rsiLine, macdPack, tech]
  )

  // RSI/MACD computed on work-only values here — parent should pass withWarmup values.
  return (
    <div className="flex flex-col gap-4">
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="RSI 14" value={formatStat(rsiLine.at(-1) ?? null)} />
        <Stat label="MACD" value={formatStat(macdPack.line.at(-1) ?? null)} />
        <Stat label="Stoch %K" value={formatStat(tech.last.stochK)} />
        <Stat label="CCI" value={formatStat(tech.last.cci)} />
      </section>
      <div className="flex flex-wrap gap-2">
        <OverlayToggle label="RSI" on={showRsi} onClick={() => setShowRsi(!showRsi)} />
        <OverlayToggle label="MACD" on={showMacd} onClick={() => setShowMacd(!showMacd)} />
        <OverlayToggle label="Stochastique" on={showStoch} onClick={() => setShowStoch(!showStoch)} />
        <OverlayToggle label="CCI" on={showCci} onClick={() => setShowCci(!showCci)} />
        <OverlayToggle label="Williams %R" on={showWr} onClick={() => setShowWr(!showWr)} />
      </div>
      {tech.divergences.length ? (
        <p className="text-sm">
          Divergences RSI/ZigZag :{" "}
          {tech.divergences.map((d) => `${d.kind} (${d.from} → ${d.to})`).join(" · ")}
        </p>
      ) : (
        <Disclaimer>Pas de divergence RSI/prix détectée sur les derniers swings.</Disclaimer>
      )}
      {showRsi ? (
        <Card>
          <CardHeader>
            <CardTitle>RSI Wilder (14)</CardTitle>
          </CardHeader>
          <CardContent>
            <ChartContainer config={lineConfig} className="aspect-auto h-[160px] w-full">
              <LineChart data={data} margin={{ left: 4, right: 8, top: 8 }}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="date" tickLine={false} axisLine={false} minTickGap={28} />
                <YAxis domain={[0, 100]} width={32} tickLine={false} axisLine={false} />
                <ReferenceLine y={70} stroke="var(--chart-5)" strokeDasharray="3 3" />
                <ReferenceLine y={30} stroke="var(--chart-3)" strokeDasharray="3 3" />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Line type="monotone" dataKey="rsi" stroke="var(--color-rsi)" dot={false} strokeWidth={2} />
              </LineChart>
            </ChartContainer>
          </CardContent>
        </Card>
      ) : null}
      {showMacd ? (
        <Card>
          <CardHeader>
            <CardTitle>MACD (12, 26, 9)</CardTitle>
          </CardHeader>
          <CardContent>
            <ChartContainer config={lineConfig} className="aspect-auto h-[180px] w-full">
              <ComposedChart data={data} margin={{ left: 4, right: 8, top: 8 }}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="date" tickLine={false} axisLine={false} minTickGap={28} />
                <YAxis width={40} tickLine={false} axisLine={false} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="histogram" fill="var(--color-histogram)" radius={1} />
                <Line type="monotone" dataKey="line" stroke="var(--color-line)" dot={false} strokeWidth={2} />
                <Line type="monotone" dataKey="signal" stroke="var(--color-signal)" dot={false} />
              </ComposedChart>
            </ChartContainer>
          </CardContent>
        </Card>
      ) : null}
      {showStoch ? (
        <Card>
          <CardHeader>
            <CardTitle>Stochastique %K / %D (14, 3)</CardTitle>
          </CardHeader>
          <CardContent>
            <ChartContainer config={lineConfig} className="aspect-auto h-[160px] w-full">
              <LineChart data={data} margin={{ left: 4, right: 8, top: 8 }}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="date" tickLine={false} axisLine={false} minTickGap={28} />
                <YAxis domain={[0, 100]} width={32} tickLine={false} axisLine={false} />
                <ReferenceLine y={80} stroke="var(--chart-5)" strokeDasharray="3 3" />
                <ReferenceLine y={20} stroke="var(--chart-3)" strokeDasharray="3 3" />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Line type="monotone" dataKey="k" stroke="var(--color-k)" dot={false} />
                <Line type="monotone" dataKey="d" stroke="var(--color-d)" dot={false} />
              </LineChart>
            </ChartContainer>
          </CardContent>
        </Card>
      ) : null}
      {showCci ? (
        <Card>
          <CardHeader>
            <CardTitle>CCI (20)</CardTitle>
          </CardHeader>
          <CardContent>
            <ChartContainer config={lineConfig} className="aspect-auto h-[140px] w-full">
              <LineChart data={data} margin={{ left: 4, right: 8, top: 8 }}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="date" tickLine={false} axisLine={false} minTickGap={28} />
                <YAxis width={40} tickLine={false} axisLine={false} />
                <ReferenceLine y={100} strokeDasharray="3 3" />
                <ReferenceLine y={-100} strokeDasharray="3 3" />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Line type="monotone" dataKey="cci" stroke="var(--color-cci)" dot={false} />
              </LineChart>
            </ChartContainer>
          </CardContent>
        </Card>
      ) : null}
      {showWr ? (
        <Card>
          <CardHeader>
            <CardTitle>Williams %R (14)</CardTitle>
          </CardHeader>
          <CardContent>
            <ChartContainer config={lineConfig} className="aspect-auto h-[140px] w-full">
              <LineChart data={data} margin={{ left: 4, right: 8, top: 8 }}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="date" tickLine={false} axisLine={false} minTickGap={28} />
                <YAxis domain={[-100, 0]} width={36} tickLine={false} axisLine={false} />
                <ReferenceLine y={-20} strokeDasharray="3 3" />
                <ReferenceLine y={-80} strokeDasharray="3 3" />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Line type="monotone" dataKey="wr" stroke="var(--color-wr)" dot={false} />
              </LineChart>
            </ChartContainer>
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}
