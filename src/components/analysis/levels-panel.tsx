"use client"

import { useMemo, useState } from "react"
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts"

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
import { breakoutTargets, techPack } from "@/lib/ta"

type Tech = ReturnType<typeof techPack>

export function LevelsPanel({
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
  const [showIchi, setShowIchi] = useState(true)
  const [showFib, setShowFib] = useState(true)
  const fib = tech.fibonacci
  const pivots = tech.pivots?.classic
  const sr = tech.supportResistance
  const targets =
    sr.length >= 2
      ? breakoutTargets(sr[sr.length - 1].price, sr[0].price, values.at(-1) ?? 0, tech.structure.trend !== "down")
      : null

  const data = useMemo(
    () =>
      dates.map((date, i) => ({
        date,
        value: values[i],
        tenkan: sliceSeries(tech.ichimoku.tenkan, warmupCount)[i],
        kijun: sliceSeries(tech.ichimoku.kijun, warmupCount)[i],
        senkouA: sliceSeries(tech.ichimoku.senkouA, warmupCount)[i],
        senkouB: sliceSeries(tech.ichimoku.senkouB, warmupCount)[i],
        chikou: sliceSeries(tech.ichimoku.chikou, warmupCount)[i],
      })),
    [dates, values, warmupCount, tech]
  )

  return (
    <div className="flex flex-col gap-4">
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Tenkan" value={formatStat(tech.ichimoku.tenkan.filter((v): v is number => v != null).at(-1) ?? null)} />
        <Stat label="Kijun" value={formatStat(tech.ichimoku.kijun.filter((v): v is number => v != null).at(-1) ?? null)} />
        <Stat label="Pivot P" value={formatStat(pivots?.P ?? null)} />
        <Stat label="Objectif report" value={formatStat(targets?.measuredMove ?? null)} />
      </section>
      <div className="flex flex-wrap gap-2">
        <OverlayToggle label="Ichimoku" on={showIchi} onClick={() => setShowIchi(!showIchi)} help={HELP.ichimoku} />
        <OverlayToggle label="Fibonacci" on={showFib} onClick={() => setShowFib(!showFib)} help={HELP.fibonacci} />
      </div>
      {showIchi ? (
        <Card>
          <CardHeader>
            <CardTitle>Ichimoku (9 / 26 / 52)</CardTitle>
          </CardHeader>
          <CardContent>
            <ChartContainer config={lineConfig} className="aspect-auto h-[260px] w-full">
              <LineChart data={data} margin={{ left: 4, right: 8, top: 8 }}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="date" tickLine={false} axisLine={false} minTickGap={28} />
                <YAxis width={40} tickLine={false} axisLine={false} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Line type="monotone" dataKey="value" stroke="var(--color-value)" dot={false} strokeWidth={2} />
                <Line type="monotone" dataKey="tenkan" stroke="var(--color-tenkan)" dot={false} />
                <Line type="monotone" dataKey="kijun" stroke="var(--color-kijun)" dot={false} />
                <Line type="monotone" dataKey="senkouA" stroke="var(--color-senkouA)" dot={false} strokeDasharray="4 3" />
                <Line type="monotone" dataKey="senkouB" stroke="var(--color-senkouB)" dot={false} strokeDasharray="4 3" />
                <Line type="monotone" dataKey="chikou" stroke="var(--color-chikou)" dot={false} strokeDasharray="2 2" />
              </LineChart>
            </ChartContainer>
            <Disclaimer>
              Chikou est la clôture décalée 26 périodes en arrière — look-ahead si on la lisait comme
              signal temps réel. Affichage seulement.
            </Disclaimer>
          </CardContent>
        </Card>
      ) : null}
      {showFib && fib ? (
        <Card>
          <CardHeader>
            <CardTitle>
              Fibonacci {fib.bullish ? "haussière" : "baissière"} · {fib.from} → {fib.to}
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <div>
              <p className="mb-1 text-xs uppercase text-muted-foreground">Retracements</p>
              <ul className="text-sm">
                {Object.entries(fib.retracements).map(([k, v]) => (
                  <li key={k} className="flex justify-between">
                    <span>{k}</span>
                    <span className="tabular-nums">{formatStat(v)}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="mb-1 text-xs uppercase text-muted-foreground">Extensions</p>
              <ul className="text-sm">
                {Object.entries(fib.extensions).map(([k, v]) => (
                  <li key={k} className="flex justify-between">
                    <span>{k}</span>
                    <span className="tabular-nums">{formatStat(v)}</span>
                  </li>
                ))}
              </ul>
            </div>
          </CardContent>
        </Card>
      ) : null}
      {pivots ? (
        <Card>
          <CardHeader>
            <CardTitle>Pivots du bloc précédent (classique / Fib / Camarilla / Woodie)</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 text-sm">
            {(["classic", "fibonacci", "camarilla", "woodie"] as const).map((name) => (
              <div key={name}>
                <p className="mb-1 text-xs uppercase text-muted-foreground">{name}</p>
                <ul>
                  {Object.entries(tech.pivots?.[name] ?? {}).map(([k, v]) => (
                    <li key={k} className="flex justify-between tabular-nums">
                      <span>{k}</span>
                      <span>{formatStat(v)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}
      {targets ? (
        <Card>
          <CardHeader>
            <CardTitle>Objectifs après cassure</CardTitle>
          </CardHeader>
          <CardContent className="text-sm">
            Report d’amplitude {formatStat(targets.measuredMove)} · jambe Fib 1,618{" "}
            {formatStat(targets.fib1618Leg)} (hauteur {formatStat(targets.height)}).
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}
