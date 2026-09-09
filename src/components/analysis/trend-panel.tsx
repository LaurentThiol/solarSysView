"use client"

import { useMemo, useState } from "react"
import { CartesianGrid, ComposedChart, Line, LineChart, Scatter, XAxis, YAxis } from "recharts"

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
import { sliceSeries } from "@/lib/analysis-window"
import { techPack } from "@/lib/ta"

type Tech = ReturnType<typeof techPack>

export function TrendPanel({
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
  const [showAdx, setShowAdx] = useState(true)
  const [showSt, setShowSt] = useState(true)
  const [showPsar, setShowPsar] = useState(true)
  const [showAroon, setShowAroon] = useState(false)

  const data = useMemo(
    () =>
      dates.map((date, i) => {
        const fi = warmupCount + i
        return {
          date,
          value: values[i],
          adx: sliceSeries(tech.adx.adx, warmupCount)[i],
          plusDi: sliceSeries(tech.adx.plusDi, warmupCount)[i],
          minusDi: sliceSeries(tech.adx.minusDi, warmupCount)[i],
          supertrend: sliceSeries(tech.supertrend.supertrend, warmupCount)[i],
          psar: sliceSeries(tech.psar, warmupCount)[i],
          aroonUp: sliceSeries(tech.aroon.aroonUp, warmupCount)[i],
          aroonDown: sliceSeries(tech.aroon.aroonDown, warmupCount)[i],
          pivotH: tech.zigzag.find((z) => z.index === fi && z.type === "H")?.price,
          pivotL: tech.zigzag.find((z) => z.index === fi && z.type === "L")?.price,
        }
      }),
    [dates, values, warmupCount, tech]
  )

  return (
    <div className="flex flex-col gap-4">
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Stat label="Dow" value={tech.structure.trend} />
        <Stat label="HH / HL" value={`${tech.structure.highs ?? "—"} / ${tech.structure.lows ?? "—"}`} />
        <Stat label="ADX" value={`${formatStat(tech.last.adx)} · ${tech.adxRegime}`} />
        <Stat label="Pivots ZigZag" value={String(tech.zigzag.length)} />
        <Stat label="Niveaux S/R" value={String(tech.supportResistance.length)} />
      </section>
      <div className="flex flex-wrap gap-2">
        <OverlayToggle label="ADX / DMI" on={showAdx} onClick={() => setShowAdx(!showAdx)} />
        <OverlayToggle label="Supertrend" on={showSt} onClick={() => setShowSt(!showSt)} />
        <OverlayToggle label="PSAR" on={showPsar} onClick={() => setShowPsar(!showPsar)} />
        <OverlayToggle label="Aroon" on={showAroon} onClick={() => setShowAroon(!showAroon)} />
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Série + ZigZag / Supertrend / PSAR</CardTitle>
        </CardHeader>
        <CardContent>
          <ChartContainer config={lineConfig} className="aspect-auto h-[260px] w-full">
            <ComposedChart data={data} margin={{ left: 4, right: 8, top: 8 }}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="date" tickLine={false} axisLine={false} minTickGap={28} />
              <YAxis width={40} tickLine={false} axisLine={false} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Line type="monotone" dataKey="value" stroke="var(--color-value)" dot={false} strokeWidth={2} />
              {showSt ? (
                <Line type="monotone" dataKey="supertrend" stroke="var(--color-supertrend)" dot={false} />
              ) : null}
              {showPsar ? <Scatter dataKey="psar" fill="var(--color-psar)" /> : null}
              <Scatter dataKey="pivotH" fill="var(--chart-5)" />
              <Scatter dataKey="pivotL" fill="var(--chart-3)" />
            </ComposedChart>
          </ChartContainer>
        </CardContent>
      </Card>
      {showAdx ? (
        <Card>
          <CardHeader>
            <CardTitle>ADX / DMI (14) — filtre de régime</CardTitle>
          </CardHeader>
          <CardContent>
            <ChartContainer config={lineConfig} className="aspect-auto h-[180px] w-full">
              <LineChart data={data} margin={{ left: 4, right: 8, top: 8 }}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="date" tickLine={false} axisLine={false} minTickGap={28} />
                <YAxis width={32} tickLine={false} axisLine={false} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Line type="monotone" dataKey="adx" stroke="var(--color-adx)" dot={false} strokeWidth={2} />
                <Line type="monotone" dataKey="plusDi" stroke="var(--color-plusDi)" dot={false} />
                <Line type="monotone" dataKey="minusDi" stroke="var(--color-minusDi)" dot={false} />
              </LineChart>
            </ChartContainer>
            <Disclaimer>&lt; 20 range · 20–25 naissant · &gt; 25 établi · &gt; 40 fort (essoufflement possible).</Disclaimer>
          </CardContent>
        </Card>
      ) : null}
      {showAroon ? (
        <Card>
          <CardHeader>
            <CardTitle>Aroon (25)</CardTitle>
          </CardHeader>
          <CardContent>
            <ChartContainer config={lineConfig} className="aspect-auto h-[160px] w-full">
              <LineChart data={data} margin={{ left: 4, right: 8, top: 8 }}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="date" tickLine={false} axisLine={false} minTickGap={28} />
                <YAxis domain={[0, 100]} width={32} tickLine={false} axisLine={false} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Line type="monotone" dataKey="aroonUp" stroke="var(--color-aroonUp)" dot={false} />
                <Line type="monotone" dataKey="aroonDown" stroke="var(--color-aroonDown)" dot={false} />
              </LineChart>
            </ChartContainer>
          </CardContent>
        </Card>
      ) : null}
      <Card>
        <CardHeader>
          <CardTitle>Supports / résistances (clustering des pivots)</CardTitle>
        </CardHeader>
        <CardContent>
          {tech.supportResistance.length === 0 ? (
            <p className="text-sm text-muted-foreground">Pas assez de pivots regroupés.</p>
          ) : (
            <ul className="grid gap-1 sm:grid-cols-2">
              {tech.supportResistance.slice(0, 12).map((level) => (
                <li key={`${level.type}-${level.price}`} className="flex justify-between text-sm">
                  <span>{level.type === "H" ? "R" : "S"}</span>
                  <span className="tabular-nums text-muted-foreground">
                    {formatStat(level.price)} · {level.hits} impacts
                  </span>
                </li>
              ))}
            </ul>
          )}
          <Disclaimer>
            Droite support pente {formatStat(tech.trendlineSupport?.slope ?? null, 4)} · résistance{" "}
            {formatStat(tech.trendlineResistance?.slope ?? null, 4)}. Elliott : ZigZag + Fibonacci
            seulement, pas de comptage 1-2-3-4-5.
          </Disclaimer>
        </CardContent>
      </Card>
    </div>
  )
}
