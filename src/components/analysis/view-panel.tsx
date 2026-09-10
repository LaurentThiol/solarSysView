"use client"

import { useMemo, useState } from "react"
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ReferenceArea,
  XAxis,
  YAxis,
} from "recharts"

import { CandleChart } from "@/components/analysis/candle-chart"
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
import { LabelHelp, TitleHelp } from "@/components/help"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select"
import {
  type VariableName,
  VARIABLE_LABELS,
  heikinAshi,
  histogram,
  ohlcBlocks,
  rollingStats,
  series,
  technicalIndicators,
  type AnalysisDraw,
} from "@/lib/analysis"
import { sliceSeries, type ProfilePoint, type WindowCompare } from "@/lib/analysis-window"
import { renko, techPack } from "@/lib/ta"

type Tech = ReturnType<typeof techPack>

export function ViewPanel({
  work,
  withWarmup,
  warmupCount,
  variable,
  ball,
  windowSize,
  fromDate,
  toDate,
  profile,
  compareOn,
  comparison,
  tech,
}: {
  work: AnalysisDraw[]
  withWarmup: AnalysisDraw[]
  warmupCount: number
  variable: VariableName
  ball: number
  windowSize: number
  fromDate: string | null
  toDate: string | null
  profile: { points: ProfilePoint[] }
  compareOn: boolean
  comparison: WindowCompare
  tech: Tech
}) {
  const [block, setBlock] = useState<"month" | "week" | "window">("month")
  const [style, setStyle] = useState<"ohlc" | "heikin" | "renko">("ohlc")
  const [showSma, setShowSma] = useState(true)
  const [showEma, setShowEma] = useState(true)
  const [showBb, setShowBb] = useState(true)

  const payload = useMemo(() => series(work, variable, ball), [work, variable, ball])
  const full = useMemo(
    () => series(withWarmup, variable, ball),
    [withWarmup, variable, ball]
  )
  const rolling = useMemo(
    () => rollingStats(work, variable, windowSize, ball),
    [work, variable, windowSize, ball]
  )
  const fullTa = useMemo(
    () => technicalIndicators(full.values, [], { window: windowSize }),
    [full.values, windowSize]
  )
  const seriesData = useMemo(
    () =>
      payload.points.map((point, index) => {
        const fullIndex = warmupCount + index
        return {
          date: point.date,
          value: point.value,
          sma: sliceSeries(fullTa.sma, warmupCount)[index],
          ema: sliceSeries(fullTa.ema, warmupCount)[index],
          bbUpper: sliceSeries(fullTa.bollinger.upper, warmupCount)[index],
          bbMiddle: sliceSeries(fullTa.bollinger.middle, warmupCount)[index],
          bbLower: sliceSeries(fullTa.bollinger.lower, warmupCount)[index],
          high: tech.zigzag.find((z) => z.index === fullIndex && z.type === "H")?.price,
          low: tech.zigzag.find((z) => z.index === fullIndex && z.type === "L")?.price,
        }
      }),
    [payload.points, fullTa, warmupCount, tech.zigzag]
  )
  const rawCandles = useMemo(
    () => ohlcBlocks(work, variable, block, windowSize, ball),
    [work, variable, block, windowSize, ball]
  )
  const candles = useMemo(() => {
    if (style === "heikin") return heikinAshi(rawCandles)
    if (style === "renko") {
      const brick = (tech.last.adx && rolling.std ? rolling.std / 2 : rolling.std) || 1
      return renko(
        payload.values,
        payload.points.map((p) => p.date),
        brick
      )
    }
    return rawCandles
  }, [style, rawCandles, payload, tech.last.adx, rolling.std])
  const hist = useMemo(
    () => histogram(payload.values, variable === "sum" ? 10 : 1),
    [payload.values, variable]
  )
  const shadeFrom = profile.points.find((p) => fromDate && p.date >= fromDate)?.date
  const shadeTo = [...profile.points].reverse().find((p) => toDate && p.date <= toDate)?.date

  return (
    <div className="flex flex-col gap-4">
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
        <Stat label="Tirages" value={String(payload.drawCount)} />
        <Stat
          label={`Moyenne / ${rolling.window}`}
          value={rolling.mean != null ? formatStat(rolling.mean) : "—"}
        />
        <Stat label="z-score" value={rolling.zscore != null ? formatStat(rolling.zscore) : "—"} />
        <Stat label={`RSI ${fullTa.periods.rsi}`} value={formatStat(fullTa.last.rsi)} />
        <Stat label="MACD" value={formatStat(fullTa.last.macd)} />
        <Stat label="Structure" value={tech.structure.trend} />
      </section>
      {compareOn ? (
        <Card>
          <CardHeader>
            <CardTitle>Fenêtre A vs précédente</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2 text-sm sm:grid-cols-2">
            <p>
              A · {comparison.a.drawCount} tirages · moyenne {formatStat(comparison.a.mean)} · χ²{" "}
              {formatStat(comparison.a.chiSquare)}
            </p>
            <p>
              B · {comparison.b.drawCount} tirages · moyenne {formatStat(comparison.b.mean)} · χ²{" "}
              {formatStat(comparison.b.chiSquare)}
            </p>
            <p className="sm:col-span-2 text-muted-foreground">
              Δ moyenne {formatStat(comparison.deltaMean)}
              {comparison.freqDelta[0]
                ? ` · plus fort écart de fréquence : boule ${comparison.freqDelta[0].value}`
                : ""}
            </p>
          </CardContent>
        </Card>
      ) : null}
      <Card>
        <CardHeader>
          <CardTitle>Profil temporel (toute l’ère chargée)</CardTitle>
        </CardHeader>
        <CardContent>
          {profile.points.length === 0 ? (
            <p className="text-sm text-muted-foreground">Pas assez de tirages.</p>
          ) : (
            <ChartContainer config={lineConfig} className="aspect-auto h-[180px] w-full">
              <AreaChart data={profile.points} margin={{ left: 4, right: 8, top: 8 }}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="date" tickLine={false} axisLine={false} minTickGap={28} />
                <YAxis width={36} tickLine={false} axisLine={false} />
                {shadeFrom && shadeTo ? (
                  <ReferenceArea x1={shadeFrom} x2={shadeTo} fill="var(--chart-1)" fillOpacity={0.12} />
                ) : null}
                <ChartTooltip content={<ChartTooltipContent />} />
                <Area dataKey="mean" stroke="var(--color-mean)" fill="var(--color-mean)" fillOpacity={0.15} />
                <Line type="monotone" dataKey="std" stroke="var(--color-std)" dot={false} />
                <Line type="monotone" dataKey="coverage" stroke="var(--color-coverage)" dot={false} />
              </AreaChart>
            </ChartContainer>
          )}
          <Disclaimer>
            Zone ombrée = fenêtre de travail. Un agrégat unique sur 10 ans lisse les régimes ; ce
            profil les montre.
          </Disclaimer>
        </CardContent>
      </Card>
      <div className="flex flex-wrap gap-2">
        <OverlayToggle label={`SMA ${windowSize}`} on={showSma} onClick={() => setShowSma(!showSma)} help={HELP.sma} />
        <OverlayToggle label={`EMA ${windowSize}`} on={showEma} onClick={() => setShowEma(!showEma)} help={HELP.ema} />
        <OverlayToggle label="Bollinger" on={showBb} onClick={() => setShowBb(!showBb)} help={HELP.bollinger} />
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Série · {VARIABLE_LABELS[variable]}</CardTitle>
        </CardHeader>
        <CardContent>
          {payload.points.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucun tirage dans la fenêtre.</p>
          ) : (
            <ChartContainer config={lineConfig} className="aspect-auto h-[280px] w-full">
              <LineChart data={seriesData} margin={{ left: 4, right: 8, top: 8 }}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="date" tickLine={false} axisLine={false} minTickGap={28} />
                <YAxis width={40} tickLine={false} axisLine={false} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Line type="monotone" dataKey="value" stroke="var(--color-value)" dot={false} strokeWidth={2} />
                {showSma ? (
                  <Line type="monotone" dataKey="sma" stroke="var(--color-sma)" dot={false} strokeWidth={1.5} />
                ) : null}
                {showEma ? (
                  <Line type="monotone" dataKey="ema" stroke="var(--color-ema)" dot={false} strokeWidth={1.5} />
                ) : null}
                {showBb ? (
                  <>
                    <Line type="monotone" dataKey="bbUpper" stroke="var(--color-bbUpper)" dot={false} strokeDasharray="4 3" />
                    <Line type="monotone" dataKey="bbMiddle" stroke="var(--color-bbMiddle)" dot={false} strokeDasharray="4 3" />
                    <Line type="monotone" dataKey="bbLower" stroke="var(--color-bbLower)" dot={false} strokeDasharray="4 3" />
                  </>
                ) : null}
              </LineChart>
            </ChartContainer>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle>
            <TitleHelp
              help={{
                title: "Chandeliers",
                body: "Agrège la variable en bougies (open/high/low/close) par mois, semaine ou paquets de X tirages. OHLC classique, Heikin-Ashi (lissé) ou Renko (briques de taille fixe).",
              }}
            >
              Chandeliers
            </TitleHelp>
          </CardTitle>
          <div className="flex flex-wrap items-end gap-2">
            <LabelHelp
              label="Bloc"
              help={{
                title: "Bloc",
                body: "Mois civil, semaine ISO, ou paquets successifs de X tirages (X = période des indicateurs, plus haut dans la page).",
              }}
            >
              <Select value={block} onValueChange={(v) => setBlock(v as typeof block)}>
                <SelectTrigger className="w-40" aria-label="Bloc">
                  <span className="flex flex-1 text-left">
                    {block === "month" ? "Mois" : block === "week" ? "Semaine" : "Paquets de X"}
                  </span>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="month">Mois</SelectItem>
                  <SelectItem value="week">Semaine</SelectItem>
                  <SelectItem value="window">Paquets de X</SelectItem>
                </SelectContent>
              </Select>
            </LabelHelp>
            <LabelHelp
              label="Style"
              help={{
                title: "Style de bougie",
                body: "OHLC = ouvert/haut/bas/clôture. Heikin-Ashi lisse le bruit. Renko ignore le temps et ne trace que les mouvements d’une brique.",
              }}
            >
              <Select value={style} onValueChange={(v) => setStyle(v as typeof style)}>
                <SelectTrigger className="w-40" aria-label="Style">
                  <span className="flex flex-1 text-left">
                    {style === "ohlc" ? "OHLC" : style === "heikin" ? "Heikin-Ashi" : "Renko"}
                  </span>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ohlc">OHLC</SelectItem>
                  <SelectItem value="heikin">Heikin-Ashi</SelectItem>
                  <SelectItem value="renko">Renko</SelectItem>
                </SelectContent>
              </Select>
            </LabelHelp>
          </div>
        </CardHeader>
        <CardContent>
          <CandleChart candles={candles} />
          <Disclaimer>
            Kagi : {tech.kagi.length} retournements · Point &amp; Figure : {tech.pnf.length} colonnes
            (box ≈ ATR/4).
          </Disclaimer>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Histogramme de la fenêtre</CardTitle>
        </CardHeader>
        <CardContent>
          <ChartContainer config={{ count: { label: "Tirages", color: "var(--chart-2)" } }} className="h-[200px] w-full">
            <BarChart data={hist}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="bin" tickLine={false} axisLine={false} />
              <YAxis width={32} tickLine={false} axisLine={false} allowDecimals={false} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Bar dataKey="count" fill="var(--color-count)" radius={4} />
            </BarChart>
          </ChartContainer>
        </CardContent>
      </Card>
    </div>
  )
}
