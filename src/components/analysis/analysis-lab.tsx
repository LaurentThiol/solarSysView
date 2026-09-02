"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import {
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Line,
  LineChart,
  ReferenceLine,
  Scatter,
  ScatterChart,
  XAxis,
  YAxis,
} from "recharts"

import { CandleChart } from "@/components/analysis/candle-chart"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  type VariableName,
  VARIABLE_LABELS,
  VARIABLE_NAMES,
  bayesBalls,
  chiSquareUniform,
  heikinAshi,
  histogram,
  hotBacktest,
  ohlcBlocks,
  pairLift,
  rankProbabilities,
  rollingStats,
  series,
  technicalIndicators,
} from "@/lib/analysis"
import { type Draw, formatDrawDate, monthOf, monthsPresent } from "@/lib/draws"
import { useDraws } from "@/lib/use-draws"

const TABS = [
  { id: "variables", label: "Variables" },
  { id: "proba", label: "Probabilités" },
  { id: "inference", label: "Hasard" },
  { id: "bayes", label: "Bayésien" },
  { id: "dependence", label: "Dépendance" },
] as const

type TabId = (typeof TABS)[number]["id"]

const lineConfig = {
  value: { label: "Valeur", color: "var(--chart-1)" },
  sma: { label: "SMA", color: "var(--chart-2)" },
  ema: { label: "EMA", color: "var(--chart-4)" },
  bbUpper: { label: "Bollinger +", color: "var(--chart-5)" },
  bbMiddle: { label: "Bollinger", color: "var(--chart-2)" },
  bbLower: { label: "Bollinger −", color: "var(--chart-5)" },
  rsi: { label: "RSI", color: "var(--chart-1)" },
  line: { label: "MACD", color: "var(--chart-1)" },
  signal: { label: "Signal", color: "var(--chart-4)" },
  histogram: { label: "Histogramme", color: "var(--chart-2)" },
} satisfies ChartConfig

function formatStat(value: number) {
  return value.toLocaleString("fr-FR", { maximumFractionDigits: 2 })
}

export function AnalysisLab() {
  const [era, setEra] = useState<"current" | "all">("current")
  const { draws, source, loading } = useDraws(era)
  const [tab, setTab] = useState<TabId>("variables")
  const [variable, setVariable] = useState<VariableName>("sum")
  const [window, setWindow] = useState(20)
  const [block, setBlock] = useState<"month" | "week" | "window">("month")
  const [ball, setBall] = useState(7)
  const [heikin, setHeikin] = useState(false)
  const [month, setMonth] = useState("all")
  const [query, setQuery] = useState("")
  const [mc, setMc] = useState<{
    max_frequency?: { observed: number; p_ge_observed: number; mean: number }
    max_delay_draws?: { observed: number; p_ge_observed: number; mean: number }
    n_sim?: number
  } | null>(null)
  const [mcError, setMcError] = useState<string | null>(null)

  const monthOptions = useMemo(() => monthsPresent(draws), [draws])

  const filtered = useMemo(() => {
    const wanted = query
      .split(/[\s,;+]+/)
      .map((t) => Number.parseInt(t, 10))
      .filter((n) => Number.isInteger(n) && n >= 1 && n <= 50)
    return draws.filter((draw) => {
      if (month !== "all" && monthOf(draw.date) !== month) return false
      if (wanted.length === 0) return true
      const pool = new Set([...draw.numbers, ...draw.stars])
      return wanted.every((n) => pool.has(n))
    })
  }, [draws, month, query])

  const chrono = useMemo(
    () => [...filtered].sort((a, b) => a.date.localeCompare(b.date)),
    [filtered]
  )

  const payload = useMemo(
    () => series(chrono, variable, ball),
    [chrono, variable, ball]
  )
  const rolling = useMemo(
    () => rollingStats(chrono, variable, window, ball),
    [chrono, variable, window, ball]
  )
  const candles = useMemo(() => {
    const raw = ohlcBlocks(chrono, variable, block, window, ball)
    return heikin ? heikinAshi(raw) : raw
  }, [chrono, variable, block, window, ball, heikin])

  const ranks = useMemo(() => rankProbabilities(12), [])
  const chi = useMemo(() => chiSquareUniform(chrono), [chrono])
  const bayes = useMemo(() => bayesBalls(chrono), [chrono])
  const pairs = useMemo(() => pairLift(chrono), [chrono])
  const backtest = useMemo(() => hotBacktest(chrono, window), [chrono, window])
  const hist = useMemo(() => histogram(payload.values, variable === "sum" ? 10 : 1), [payload.values, variable])

  async function loadMc() {
    setMcError(null)
    try {
      const from = chrono[0]?.date
      const to = chrono.at(-1)?.date
      const params = new URLSearchParams({
        era,
        n: "400",
        seed: "0",
      })
      if (from) params.set("from_date", from)
      if (to) params.set("to_date", to)
      const response = await fetch(`/api/analysis/montecarlo?${params}`, {
        cache: "no-store",
      })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      setMc(await response.json())
    } catch (error) {
      setMcError(
        error instanceof Error
          ? "Monte-Carlo Python indisponible (API / Neon). Le reste tourne sur les tirages chargés."
          : "Monte-Carlo indisponible"
      )
    }
  }

  if (loading) {
    return <p className="text-sm text-muted-foreground">Chargement des tirages…</p>
  }

  return (
    <div className="flex flex-col gap-6">
      <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
        Chaque outil lit les <strong>mêmes tirages</strong> ({chrono.length} après filtre,
        source {source === "neon" ? "Neon" : "JSON local"}). Les tirages sont
        indépendants : SMA, EMA, RSI, MACD, Bollinger et ATR décrivent la série
        observée, ce ne sont pas des signaux de jeu. Jeu interdit aux mineurs.
      </p>

      <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap">
        <Select value={era} onValueChange={(v) => setEra(v as "current" | "all")}>
          <SelectTrigger className="w-full sm:w-56" aria-label="Ère">
            <span className="flex flex-1 text-left">
              {era === "all" ? "Tout l’historique" : "Formule actuelle (12 ★)"}
            </span>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="current">Formule actuelle (12 ★)</SelectItem>
            <SelectItem value="all">Tout l’historique</SelectItem>
          </SelectContent>
        </Select>
        <Select value={month} onValueChange={(v) => setMonth(String(v))}>
          <SelectTrigger className="w-full sm:w-44" aria-label="Mois">
            <span className="flex flex-1 text-left">
              {monthOptions.find((item) => item.value === month)?.label ?? "Tous les mois"}
            </span>
          </SelectTrigger>
          <SelectContent>
            {monthOptions.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filtrer par numéros"
          className="sm:w-56"
        />
        <Select
          value={variable}
          onValueChange={(v) => setVariable(v as VariableName)}
        >
          <SelectTrigger className="w-full sm:w-56" aria-label="Variable">
            <span className="flex flex-1 text-left">{VARIABLE_LABELS[variable]}</span>
          </SelectTrigger>
          <SelectContent>
            {VARIABLE_NAMES.map((name) => (
              <SelectItem key={name} value={name}>
                {VARIABLE_LABELS[name]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {(variable === "delay" || variable === "hit") && (
          <Input
            type="number"
            min={1}
            max={50}
            value={ball}
            onChange={(e) => setBall(Number(e.target.value) || 7)}
            aria-label="Boule"
            className="w-24"
          />
        )}
        <label className="flex items-center gap-2 text-sm">
          X
          <Input
            type="number"
            min={2}
            max={200}
            value={window}
            onChange={(e) => setWindow(Number(e.target.value) || 20)}
            className="w-20"
          />
        </label>
      </div>

      <nav className="flex flex-wrap gap-2" aria-label="Outils">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            className={`rounded-full border px-3 py-1 text-xs ${
              tab === item.id
                ? "border-primary bg-primary/15 text-foreground"
                : "border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            {item.label}
          </button>
        ))}
      </nav>

      {tab === "variables" ? (
        <VariablesPanel
          payload={payload}
          rolling={rolling}
          candles={candles}
          hist={hist}
          block={block}
          setBlock={setBlock}
          heikin={heikin}
          setHeikin={setHeikin}
          windowSize={window}
        />
      ) : null}
      {tab === "proba" ? <ProbaPanel ranks={ranks} /> : null}
      {tab === "inference" ? (
        <InferencePanel
          chi={chi}
          bayes={bayes}
          n={chrono.length}
          mc={mc}
          mcError={mcError}
          onMc={loadMc}
        />
      ) : null}
      {tab === "bayes" ? <BayesPanel balls={bayes} n={chrono.length} /> : null}
      {tab === "dependence" ? (
        <DependencePanel pairs={pairs} backtest={backtest} draws={chrono} />
      ) : null}
    </div>
  )
}

function OverlayToggle({
  label,
  on,
  onClick,
}: {
  label: string
  on: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={`rounded-md border px-2 py-1 text-xs ${
        on
          ? "border-primary bg-primary/15 text-foreground"
          : "border-border text-muted-foreground hover:text-foreground"
      }`}
    >
      {label}
    </button>
  )
}

function VariablesPanel({
  payload,
  rolling,
  candles,
  hist,
  block,
  setBlock,
  heikin,
  setHeikin,
  windowSize,
}: {
  payload: ReturnType<typeof series>
  rolling: ReturnType<typeof rollingStats>
  candles: ReturnType<typeof ohlcBlocks>
  hist: ReturnType<typeof histogram>
  block: "month" | "week" | "window"
  setBlock: (v: "month" | "week" | "window") => void
  heikin: boolean
  setHeikin: (v: boolean) => void
  windowSize: number
}) {
  const [showSma, setShowSma] = useState(true)
  const [showEma, setShowEma] = useState(true)
  const [showBb, setShowBb] = useState(true)
  const [showRsi, setShowRsi] = useState(true)
  const [showMacd, setShowMacd] = useState(true)

  const seriesTa = useMemo(
    () => technicalIndicators(payload.values, candles, { window: windowSize }),
    [payload.values, candles, windowSize]
  )
  const candleTa = useMemo(
    () => technicalIndicators(candles.map((c) => c.c), candles, { window: windowSize }),
    [candles, windowSize]
  )
  const seriesData = useMemo(
    () =>
      payload.points.map((point, index) => ({
        date: point.date,
        value: point.value,
        sma: seriesTa.sma[index],
        ema: seriesTa.ema[index],
        bbUpper: seriesTa.bollinger.upper[index],
        bbMiddle: seriesTa.bollinger.middle[index],
        bbLower: seriesTa.bollinger.lower[index],
        rsi: seriesTa.rsi[index],
        line: seriesTa.macd.line[index],
        signal: seriesTa.macd.signal[index],
        histogram: seriesTa.macd.histogram[index],
      })),
    [payload.points, seriesTa]
  )
  const overlays = useMemo(() => {
    const rows = []
    if (showSma) {
      rows.push({ key: "sma", values: candleTa.sma, color: "var(--chart-2)" })
    }
    if (showEma) {
      rows.push({ key: "ema", values: candleTa.ema, color: "var(--chart-4)" })
    }
    if (showBb) {
      rows.push(
        { key: "bbUpper", values: candleTa.bollinger.upper, color: "var(--chart-5)", dashed: true },
        { key: "bbMiddle", values: candleTa.bollinger.middle, color: "var(--chart-2)", dashed: true },
        { key: "bbLower", values: candleTa.bollinger.lower, color: "var(--chart-5)", dashed: true }
      )
    }
    return rows
  }, [candleTa, showSma, showEma, showBb])

  return (
    <div className="flex flex-col gap-4">
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
        <Stat label="Tirages" value={String(payload.drawCount)} />
        <Stat
          label={`Moyenne / ${rolling.window}`}
          value={rolling.mean != null ? formatStat(rolling.mean) : "—"}
        />
        <Stat
          label="z-score"
          value={rolling.zscore != null ? formatStat(rolling.zscore) : "—"}
        />
        <Stat
          label={`RSI ${seriesTa.periods.rsi}`}
          value={seriesTa.last.rsi != null ? formatStat(seriesTa.last.rsi) : "—"}
        />
        <Stat
          label="MACD"
          value={seriesTa.last.macd != null ? formatStat(seriesTa.last.macd) : "—"}
        />
        <Stat
          label={`ATR ${seriesTa.periods.atr}`}
          value={seriesTa.last.atr != null ? formatStat(seriesTa.last.atr) : "—"}
        />
      </section>
      <div className="flex flex-wrap gap-2">
        <OverlayToggle label={`SMA ${windowSize}`} on={showSma} onClick={() => setShowSma(!showSma)} />
        <OverlayToggle label={`EMA ${windowSize}`} on={showEma} onClick={() => setShowEma(!showEma)} />
        <OverlayToggle label="Bollinger" on={showBb} onClick={() => setShowBb(!showBb)} />
        <OverlayToggle label="RSI" on={showRsi} onClick={() => setShowRsi(!showRsi)} />
        <OverlayToggle label="MACD" on={showMacd} onClick={() => setShowMacd(!showMacd)} />
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Série · {VARIABLE_LABELS[payload.name]}</CardTitle>
        </CardHeader>
        <CardContent>
          {payload.points.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucun tirage.</p>
          ) : (
            <ChartContainer config={lineConfig} className="aspect-auto h-[280px] w-full">
              <LineChart data={seriesData} margin={{ left: 4, right: 8, top: 8 }}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="date" tickLine={false} axisLine={false} minTickGap={28} />
                <YAxis width={40} tickLine={false} axisLine={false} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Line type="monotone" dataKey="value" stroke="var(--color-value)" dot={false} strokeWidth={2} />
                {showSma ? (
                  <Line type="monotone" dataKey="sma" stroke="var(--color-sma)" dot={false} strokeWidth={1.5} connectNulls={false} />
                ) : null}
                {showEma ? (
                  <Line type="monotone" dataKey="ema" stroke="var(--color-ema)" dot={false} strokeWidth={1.5} connectNulls={false} />
                ) : null}
                {showBb ? (
                  <>
                    <Line type="monotone" dataKey="bbUpper" stroke="var(--color-bbUpper)" dot={false} strokeDasharray="4 3" connectNulls={false} />
                    <Line type="monotone" dataKey="bbMiddle" stroke="var(--color-bbMiddle)" dot={false} strokeDasharray="4 3" connectNulls={false} />
                    <Line type="monotone" dataKey="bbLower" stroke="var(--color-bbLower)" dot={false} strokeDasharray="4 3" connectNulls={false} />
                  </>
                ) : null}
              </LineChart>
            </ChartContainer>
          )}
          <p className="mt-2 text-xs text-muted-foreground">
            Fenêtre X={rolling.window} · σ {formatStat(rolling.std)} · RSI Wilder{" "}
            {seriesTa.last.rsi != null ? formatStat(seriesTa.last.rsi) : "—"}{" "}
            (descriptif, pas un signal).
          </p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle>Chandeliers OHLC</CardTitle>
          <div className="flex flex-wrap gap-2">
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
            <button
              type="button"
              onClick={() => setHeikin(!heikin)}
              className="rounded-md border border-border px-2 py-1 text-xs"
            >
              {heikin ? "OHLC brut" : "Heikin-Ashi"}
            </button>
          </div>
        </CardHeader>
        <CardContent>
          <CandleChart candles={candles} overlays={overlays} />
        </CardContent>
      </Card>
      {showRsi ? (
        <Card>
          <CardHeader>
            <CardTitle>RSI Wilder ({seriesTa.periods.rsi})</CardTitle>
          </CardHeader>
          <CardContent>
            <ChartContainer config={lineConfig} className="aspect-auto h-[160px] w-full">
              <LineChart data={seriesData} margin={{ left: 4, right: 8, top: 8 }}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="date" tickLine={false} axisLine={false} minTickGap={28} />
                <YAxis domain={[0, 100]} width={32} tickLine={false} axisLine={false} />
                <ReferenceLine y={70} stroke="var(--chart-5)" strokeDasharray="3 3" />
                <ReferenceLine y={30} stroke="var(--chart-3)" strokeDasharray="3 3" />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Line type="monotone" dataKey="rsi" stroke="var(--color-rsi)" dot={false} strokeWidth={2} connectNulls={false} />
              </LineChart>
            </ChartContainer>
            <p className="mt-2 text-xs text-muted-foreground">
              Seuils 30 / 70 à titre visuel. Un RSI extrême sur une série de tirages
              indépendants n’indique pas le prochain résultat.
            </p>
          </CardContent>
        </Card>
      ) : null}
      {showMacd ? (
        <Card>
          <CardHeader>
            <CardTitle>
              MACD ({seriesTa.periods.macdFast}, {seriesTa.periods.macdSlow},{" "}
              {seriesTa.periods.macdSignal})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ChartContainer config={lineConfig} className="aspect-auto h-[180px] w-full">
              <ComposedChart data={seriesData} margin={{ left: 4, right: 8, top: 8 }}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="date" tickLine={false} axisLine={false} minTickGap={28} />
                <YAxis width={40} tickLine={false} axisLine={false} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="histogram" fill="var(--color-histogram)" radius={1} />
                <Line type="monotone" dataKey="line" stroke="var(--color-line)" dot={false} strokeWidth={2} connectNulls={false} />
                <Line type="monotone" dataKey="signal" stroke="var(--color-signal)" dot={false} strokeWidth={1.5} connectNulls={false} />
              </ComposedChart>
            </ChartContainer>
            <p className="mt-2 text-xs text-muted-foreground">
              Croisements MACD / signal : lecture analogique, pas un conseil de jeu.
            </p>
          </CardContent>
        </Card>
      ) : null}
      <Card>
        <CardHeader>
          <CardTitle>Histogramme observé</CardTitle>
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

function ProbaPanel({
  ranks,
}: {
  ranks: ReturnType<typeof rankProbabilities>
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Probabilités exactes (5/50 + 2/12)</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <p className="text-sm text-muted-foreground">
          {combText()} grilles possibles. Hypergéométrique, pas une estimation.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-muted-foreground">
                <th className="py-1 pr-3">Rang</th>
                <th className="py-1 pr-3">Gain</th>
                <th className="py-1 pr-3">P</th>
                <th className="py-1">1 sur</th>
              </tr>
            </thead>
            <tbody>
              {ranks.map((row) => (
                <tr key={row.label} className="border-t border-border">
                  <td className="py-1 pr-3 tabular-nums">{row.rank ?? "—"}</td>
                  <td className="py-1 pr-3">{row.label}</td>
                  <td className="py-1 pr-3 tabular-nums">{row.p.toExponential(3)}</td>
                  <td className="py-1 tabular-nums">{row.oneIn?.toLocaleString("fr-FR")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  )
}

function combText() {
  return "139 838 160"
}

function InferencePanel({
  chi,
  bayes,
  n,
  mc,
  mcError,
  onMc,
}: {
  chi: ReturnType<typeof chiSquareUniform>
  bayes: ReturnType<typeof bayesBalls>
  n: number
  mc: {
    max_frequency?: { observed: number; p_ge_observed: number; mean: number }
    max_delay_draws?: { observed: number; p_ge_observed: number; mean: number }
    n_sim?: number
  } | null
  mcError: string | null
  onMc: () => void
}) {
  const forest = bayes.slice().sort((a, b) => b.count - a.count)
  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>χ² d’adéquation (fréquences 1–50)</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Statistique {formatStat(chi.stat)} pour {n} tirages (espérance {formatStat(chi.expected)} par
          boule). Modèle approximatif : p = 5/50, counts dépendants intra-tirage.
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>IC Wilson vs p0 = 0,1</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="grid gap-1 sm:grid-cols-2">
            {forest.slice(0, 20).map((row) => (
              <li key={row.value} className="flex items-center justify-between text-xs">
                <span className="tabular-nums">{row.value}</span>
                <span className="text-muted-foreground tabular-nums">
                  {row.count}× · [{formatStat(row.lo)}, {formatStat(row.hi)}]
                  {row.lo <= 0.1 && 0.1 <= row.hi ? "" : " · hors p0"}
                </span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Monte-Carlo des records</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 text-sm">
          <button
            type="button"
            onClick={onMc}
            className="w-fit rounded-md border border-border px-3 py-1 text-xs"
          >
            Lancer 400 historiques synthétiques (API Python)
          </button>
          {mcError ? <p className="text-muted-foreground">{mcError}</p> : null}
          {mc?.max_frequency ? (
            <p>
              Fréquence max observée {mc.max_frequency.observed} (moy. H0{" "}
              {formatStat(mc.max_frequency.mean)}) · P(≥ obs) ={" "}
              {formatStat(mc.max_frequency.p_ge_observed)}
              {mc.max_delay_draws
                ? ` · retard max ${mc.max_delay_draws.observed} tirages, P(≥ obs) = ${formatStat(mc.max_delay_draws.p_ge_observed)}`
                : ""}
            </p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  )
}

function BayesPanel({
  balls,
  n,
}: {
  balls: ReturnType<typeof bayesBalls>
  n: number
}) {
  const data = balls.map((b) => ({ value: b.value, predictive: b.predictive }))
  return (
    <Card>
      <CardHeader>
        <CardTitle>Beta-Binomial · prédictive P(boule au prochain tirage)</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="mb-3 text-sm text-muted-foreground">
          Prior uniforme, {n} tirages. Les barres se resserrent vers 0,1 : ce n’est pas
          un ranking jouable.
        </p>
        <ChartContainer
          config={{ predictive: { label: "Prédictive", color: "var(--chart-4)" } }}
          className="h-[240px] w-full"
        >
          <BarChart data={data}>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="value" tickLine={false} axisLine={false} interval={4} />
            <YAxis domain={[0, 0.2]} width={36} tickLine={false} axisLine={false} />
            <ChartTooltip content={<ChartTooltipContent />} />
            <Bar dataKey="predictive" fill="var(--color-predictive)" radius={2} />
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}

function DependencePanel({
  pairs,
  backtest,
  draws,
}: {
  pairs: ReturnType<typeof pairLift>
  backtest: ReturnType<typeof hotBacktest>
  draws: Draw[]
}) {
  const scatter = draws.map((d) => ({
    sum: d.numbers.reduce((a, b) => a + b, 0),
    spread: Math.max(...d.numbers) - Math.min(...d.numbers),
    date: d.date,
  }))
  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Paires à plus fort lift</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="grid gap-1 sm:grid-cols-2">
            {pairs.map((row) => (
              <li key={`${row.a}-${row.b}`} className="flex justify-between text-sm">
                <span className="tabular-nums">
                  {row.a} · {row.b}
                </span>
                <span className="text-muted-foreground tabular-nums">
                  {row.count}× · lift {formatStat(row.lift)}
                </span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Backtest « 5 plus chauds » vs hasard</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Sur {backtest.n} tirages, {formatStat(backtest.mean)} numéro(s) en commun en
          moyenne (attendu sous uniforme : {formatStat(backtest.expected)}). Un écart
          durable serait surprenant ; l’égalité est le résultat honnête.
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Nuage somme × étendue</CardTitle>
        </CardHeader>
        <CardContent>
          <ChartContainer
            config={{ spread: { label: "Étendue", color: "var(--chart-2)" } }}
            className="h-[240px] w-full"
          >
            <ScatterChart>
              <CartesianGrid />
              <XAxis dataKey="sum" name="somme" tickLine={false} />
              <YAxis dataKey="spread" name="étendue" tickLine={false} width={36} />
              <ChartTooltip
                content={({ payload }) => {
                  const row = payload?.[0]?.payload as { date?: string; sum?: number } | undefined
                  if (!row?.date) return null
                  return (
                    <div className="rounded-md border border-border bg-card px-2 py-1 text-xs">
                      <Link href="/tirage" className="underline">
                        {formatDrawDate(row.date)}
                      </Link>
                      <div>somme {row.sum}</div>
                    </div>
                  )
                }}
              />
              <Scatter data={scatter} fill="var(--chart-2)" />
            </ScatterChart>
          </ChartContainer>
        </CardContent>
      </Card>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <p className="text-xs tracking-wide text-muted-foreground uppercase">{label}</p>
        <CardTitle className="text-lg tabular-nums">{value}</CardTitle>
      </CardHeader>
    </Card>
  )
}
