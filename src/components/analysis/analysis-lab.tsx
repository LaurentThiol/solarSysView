"use client"

import { useMemo, useState } from "react"

import { AveragesPanel } from "@/components/analysis/averages-panel"
import { FiguresPanel } from "@/components/analysis/figures-panel"
import { FlowPanel } from "@/components/analysis/flow-panel"
import { LevelsPanel } from "@/components/analysis/levels-panel"
import { MemoPanel } from "@/components/analysis/memo-panel"
import { MomentumPanel } from "@/components/analysis/momentum-panel"
import { NumbersPanel } from "@/components/analysis/numbers-panel"
import { ParityPanel } from "@/components/analysis/parity-panel"
import {
  BayesPanel,
  DependencePanel,
  InferencePanel,
  ProbaPanel,
} from "@/components/analysis/stats-panels"
import { SystemPanel } from "@/components/analysis/system-panel"
import { TrendPanel } from "@/components/analysis/trend-panel"
import { ViewPanel } from "@/components/analysis/view-panel"
import { VolatilityPanel } from "@/components/analysis/volatility-panel"
import { WindowBar } from "@/components/analysis/window-bar"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select"
import {
  type VariableName,
  VARIABLE_LABELS,
  VARIABLE_NAMES,
  series,
} from "@/lib/analysis"
import {
  DEFAULT_WARMUP,
  compareWindows,
  resolveWindow,
  rollingProfile,
  type WindowPreset,
} from "@/lib/analysis-window"
import { parseQueryNumbers, drawMatchesQuery } from "@/lib/draws"
import { techPack } from "@/lib/ta"
import { useDraws } from "@/lib/use-draws"

const TECH_TABS = [
  { id: "vue", label: "Vue" },
  { id: "tendance", label: "Tendance" },
  { id: "momentum", label: "Momentum" },
  { id: "volatilite", label: "Volatilité" },
  { id: "niveaux", label: "Niveaux" },
  { id: "figures", label: "Figures" },
  { id: "flux", label: "Flux" },
  { id: "moyennes", label: "Moyennes" },
  { id: "systeme", label: "Système" },
] as const

const DRAW_TABS = [
  { id: "numeros", label: "Numéros" },
  { id: "parite", label: "Pair / impair" },
  { id: "hasard", label: "Hasard" },
  { id: "bayes", label: "Bayésien" },
  { id: "dependence", label: "Dépendance" },
  { id: "proba", label: "Probabilités" },
  { id: "memo", label: "Mémo" },
] as const

type TabId = (typeof TECH_TABS)[number]["id"] | (typeof DRAW_TABS)[number]["id"]

function TabRow({
  items,
  tab,
  setTab,
  label,
}: {
  items: readonly { id: string; label: string }[]
  tab: string
  setTab: (id: TabId) => void
  label: string
}) {
  return (
    <nav className="flex flex-wrap gap-2" aria-label={label}>
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={() => setTab(item.id as TabId)}
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
  )
}

export function AnalysisLab() {
  const [era, setEra] = useState<"current" | "all">("current")
  const { draws, source, loading } = useDraws(era)
  const [tab, setTab] = useState<TabId>("vue")
  const [variable, setVariable] = useState<VariableName>("sum")
  const [windowSize, setWindowSize] = useState(20)
  const [ball, setBall] = useState(7)
  const [query, setQuery] = useState("")
  const [preset, setPreset] = useState<WindowPreset>("last_100")
  const [customFrom, setCustomFrom] = useState("")
  const [customTo, setCustomTo] = useState("")
  const [lastN, setLastN] = useState("")
  const [warmup, setWarmup] = useState(DEFAULT_WARMUP)
  const [compareOn, setCompareOn] = useState(false)
  const [mc, setMc] = useState<{
    max_frequency?: { observed: number; p_ge_observed: number; mean: number }
    max_delay_draws?: { observed: number; p_ge_observed: number; mean: number }
    n_sim?: number
  } | null>(null)
  const [mcError, setMcError] = useState<string | null>(null)

  const archive = useMemo(
    () => [...draws].sort((a, b) => a.date.localeCompare(b.date)),
    [draws]
  )

  const resolved = useMemo(() => {
    const parsedN = Number.parseInt(lastN, 10)
    return resolveWindow(archive, {
      preset,
      fromDate: preset === "custom" ? customFrom || undefined : customFrom || undefined,
      toDate: customTo || undefined,
      lastN: Number.isFinite(parsedN) && parsedN > 0 ? parsedN : undefined,
      warmup,
    })
  }, [archive, preset, customFrom, customTo, lastN, warmup])

  const wanted = useMemo(() => parseQueryNumbers(query), [query])
  const work = useMemo(
    () => resolved.work.filter((draw) => drawMatchesQuery(draw, wanted)),
    [resolved.work, wanted]
  )
  const withWarmup = useMemo(() => {
    if (wanted.length === 0) return resolved.withWarmup
    return [...resolved.warmup, ...work]
  }, [resolved.withWarmup, resolved.warmup, work, wanted.length])
  const warmupCount = withWarmup.length - work.length

  const workSeries = useMemo(
    () => series(work, variable, ball),
    [work, variable, ball]
  )
  const fullSeries = useMemo(
    () => series(withWarmup, variable, ball),
    [withWarmup, variable, ball]
  )
  const tech = useMemo(
    () =>
      techPack(fullSeries.values, [], fullSeries.points.map((p) => p.date), {
        smaPeriod: windowSize,
        warmupCount,
      }),
    [fullSeries, windowSize, warmupCount]
  )
  const profile = useMemo(
    () => rollingProfile(archive, variable, windowSize, ball),
    [archive, variable, windowSize, ball]
  )
  const comparison = useMemo(
    () => compareWindows(work, resolved.compare.work, variable, ball),
    [work, resolved.compare.work, variable, ball]
  )

  async function loadMc() {
    setMcError(null)
    try {
      const from = work[0]?.date
      const to = work.at(-1)?.date
      const params = new URLSearchParams({ era, n: "400", seed: "0" })
      if (from) params.set("from_date", from)
      if (to) params.set("to_date", to)
      const response = await fetch(`/api/analysis/montecarlo?${params}`, { cache: "no-store" })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      setMc(await response.json())
    } catch {
      setMcError(
        "Monte-Carlo Python indisponible (API / Neon). Le reste tourne sur les tirages chargés."
      )
    }
  }

  function handleFrom(value: string) {
    if (preset !== "custom") setCustomTo(resolved.toDate ?? "")
    setCustomFrom(value)
    setPreset("custom")
  }

  function handleTo(value: string) {
    if (preset !== "custom") setCustomFrom(resolved.fromDate ?? "")
    setCustomTo(value)
    setPreset("custom")
  }

  if (loading) {
    return <p className="text-sm text-muted-foreground">Chargement des tirages…</p>
  }

  const displayFrom =
    preset === "custom" ? customFrom : resolved.fromDate ?? customFrom
  const displayTo = preset === "custom" ? customTo : resolved.toDate ?? customTo

  return (
    <div className="flex flex-col gap-6">
      <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
        Chaque outil lit la <strong>même fenêtre</strong> ({work.length} tirages, source{" "}
        {source === "neon" ? "Neon" : "JSON local"}). Les tirages sont indépendants : les
        indicateurs décrivent la série observée, pas le prochain tirage.
      </p>

      <WindowBar
        window={{ ...resolved, work, drawCount: work.length }}
        preset={preset}
        fromDate={displayFrom}
        toDate={displayTo}
        lastN={lastN}
        warmup={warmup}
        compareOn={compareOn}
        onPreset={(v) => {
          setPreset(v)
          if (v !== "custom") {
            setCustomFrom("")
            setCustomTo("")
            setLastN("")
          }
        }}
        onFrom={handleFrom}
        onTo={handleTo}
        onLastN={setLastN}
        onWarmup={setWarmup}
        onCompare={setCompareOn}
      />

      <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap">
        <Select value={era} onValueChange={(v) => setEra(v as "current" | "all")}>
          <SelectTrigger className="w-full sm:w-56" aria-label="Ère">
            <span className="flex flex-1 text-left">
              {era === "all" ? "Archive : tout l’historique" : "Archive : formule actuelle (12 ★)"}
            </span>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="current">Archive : formule actuelle (12 ★)</SelectItem>
            <SelectItem value="all">Archive : tout l’historique</SelectItem>
          </SelectContent>
        </Select>
        <Select value={variable} onValueChange={(v) => setVariable(v as VariableName)}>
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
            value={windowSize}
            onChange={(e) => setWindowSize(Number(e.target.value) || 20)}
            className="w-20"
            aria-label="Période des indicateurs"
          />
        </label>
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filtrer par numéros"
          className="sm:w-56"
        />
      </div>

      <TabRow items={TECH_TABS} tab={tab} setTab={setTab} label="Analyse technique" />
      <TabRow items={DRAW_TABS} tab={tab} setTab={setTab} label="Tirage" />

      {tab === "vue" ? (
        <ViewPanel
          work={work}
          withWarmup={withWarmup}
          warmupCount={warmupCount}
          variable={variable}
          ball={ball}
          windowSize={windowSize}
          fromDate={resolved.fromDate}
          toDate={resolved.toDate}
          profile={profile}
          compareOn={compareOn}
          comparison={comparison}
          tech={tech}
        />
      ) : null}
      {tab === "tendance" ? (
        <TrendPanel
          dates={workSeries.points.map((p) => p.date)}
          values={workSeries.values}
          warmupCount={warmupCount}
          tech={tech}
        />
      ) : null}
      {tab === "momentum" ? (
        <MomentumPanel
          dates={workSeries.points.map((p) => p.date)}
          values={fullSeries.values}
          warmupCount={warmupCount}
          tech={tech}
        />
      ) : null}
      {tab === "volatilite" ? (
        <VolatilityPanel
          dates={workSeries.points.map((p) => p.date)}
          values={workSeries.values}
          warmupCount={warmupCount}
          tech={tech}
        />
      ) : null}
      {tab === "niveaux" ? (
        <LevelsPanel
          dates={workSeries.points.map((p) => p.date)}
          values={workSeries.values}
          warmupCount={warmupCount}
          tech={tech}
        />
      ) : null}
      {tab === "figures" ? <FiguresPanel tech={tech} /> : null}
      {tab === "flux" ? (
        <FlowPanel
          dates={workSeries.points.map((p) => p.date)}
          warmupCount={warmupCount}
          tech={tech}
        />
      ) : null}
      {tab === "moyennes" ? (
        <AveragesPanel
          dates={workSeries.points.map((p) => p.date)}
          fullValues={fullSeries.values}
          warmupCount={warmupCount}
          windowSize={windowSize}
          tech={tech}
        />
      ) : null}
      {tab === "systeme" ? <SystemPanel tech={tech} /> : null}
      {tab === "numeros" ? (
        <NumbersPanel
          draws={work}
          ball={ball}
          onSelectBall={setBall}
          onAnalyze={(variable, n) => {
            setBall(n)
            setVariable(variable)
            setTab("vue")
          }}
        />
      ) : null}
      {tab === "parite" ? (
        <ParityPanel
          draws={work}
          onSelectBall={(n) => {
            setBall(n)
            setTab("numeros")
          }}
          onAnalyze={() => {
            setVariable("parity")
            setTab("vue")
          }}
        />
      ) : null}
      {tab === "hasard" ? (
        <InferencePanel draws={work} mc={mc} mcError={mcError} onMc={loadMc} />
      ) : null}
      {tab === "bayes" ? <BayesPanel draws={work} /> : null}
      {tab === "dependence" ? <DependencePanel draws={work} windowSize={windowSize} /> : null}
      {tab === "proba" ? <ProbaPanel /> : null}
      {tab === "memo" ? <MemoPanel /> : null}
    </div>
  )
}
