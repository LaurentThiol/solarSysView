"use client"

import { useMemo, useEffect, useState } from "react"

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
import { useRegisterCapture } from "@/components/capture"
import { HelpTip, LabelHelp, TitleHelp, type HelpCopy } from "@/components/help"
import { WindowBar } from "@/components/analysis/window-bar"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
} from "@/components/ui/select"
import {
  type VariableName,
  NUMBER_VARIABLE_NAMES,
  STAR_VARIABLE_NAMES,
  VARIABLE_LABELS,
  series,
  seriesIndex,
  variableNeedsBall,
  variableNeedsStar,
} from "@/lib/analysis"
import {
  DEFAULT_WARMUP,
  compareWindows,
  resolveWindow,
  rollingProfile,
  type WindowPreset,
} from "@/lib/analysis-window"
import { parseQueryNumbers, drawMatchesQuery } from "@/lib/draws"
import { packAnalyse } from "@/lib/capture/pack"
import { techPack } from "@/lib/ta"
import {
  asPositiveInt,
  asVariableName,
  asWindowPreset,
  readLabSearch,
} from "@/lib/lab-search"
import { useDraws } from "@/lib/use-draws"

const TECH_TABS = [
  {
    id: "vue",
    label: "Vue",
    help: {
      title: "Vue",
      body: "Vue d’ensemble de la variable choisie : stats, profil glissant, série et chandeliers. Tous les onglets lisent la même fenêtre.",
    },
  },
  {
    id: "tendance",
    label: "Tendance",
    help: {
      title: "Tendance",
      body: "ADX / DMI, Supertrend, PSAR, Aroon et structure de Dow sur la série de la fenêtre.",
    },
  },
  {
    id: "momentum",
    label: "Momentum",
    help: {
      title: "Momentum",
      body: "RSI, MACD, stochastique, CCI et Williams %R. Oscillateurs de la variable, pas un pronostic.",
    },
  },
  {
    id: "volatilite",
    label: "Volatilité",
    help: {
      title: "Volatilité",
      body: "Bollinger, Keltner, Donchian, ATR et squeezes autour de la série.",
    },
  },
  {
    id: "niveaux",
    label: "Niveaux",
    help: {
      title: "Niveaux",
      body: "Ichimoku, Fibonacci, pivots et supports / résistances détectés sur la fenêtre.",
    },
  },
  {
    id: "figures",
    label: "Figures",
    help: {
      title: "Figures",
      body: "Chandeliers japonais et figures chartistes (heuristique ZigZag). Pédagogique, pas un signal de jeu.",
    },
  },
  {
    id: "flux",
    label: "Flux",
    help: {
      title: "Flux",
      body: "OBV, ADL, MFI, VWAP transposés à l’activité des tirages (pas un volume de marché).",
    },
  },
  {
    id: "moyennes",
    label: "Moyennes",
    help: {
      title: "Moyennes",
      body: "SMA, EMA, WMA, HMA et VWMA sur la période X, distincte de la plage calendaire.",
    },
  },
  {
    id: "systeme",
    label: "Système",
    help: {
      title: "Système",
      body: "Backtest Donchian + ADX, walk-forward et analogie de sizing (nombre de grilles). Squelette pédagogique.",
    },
  },
] as const

const DRAW_TABS = [
  {
    id: "numeros",
    label: "Numéros",
    help: {
      title: "Numéros",
      body: "Grille 1–50 : cliquer un numéro pour voir sorties, retard, IC Wilson, puis envoyer présence ou retard vers Vue.",
    },
  },
  {
    id: "parite",
    label: "Pair / impair",
    help: {
      title: "Pair / impair",
      body: "Composition de chaque tirage vs la loi hypergéométrique (25 pairs / 25 impairs dans l’urne).",
    },
  },
  {
    id: "hasard",
    label: "Hasard",
    help: {
      title: "Hasard",
      body: "χ² d’adéquation, intervalles de Wilson, Monte-Carlo des records de fréquence et de retard.",
    },
  },
  {
    id: "bayes",
    label: "Bayésien",
    help: {
      title: "Bayésien",
      body: "Prédictive beta-binomiale P(boule au prochain tirage) avec prior uniforme. Les barres se resserrent vers 10 %.",
    },
  },
  {
    id: "dependence",
    label: "Dépendance",
    help: {
      title: "Dépendance",
      body: "Lift des paires, backtest « 5 plus chauds » et nuage somme × étendue. Toujours sous l’hypothèse d’indépendance.",
    },
  },
  {
    id: "proba",
    label: "Probabilités",
    help: {
      title: "Probabilités",
      body: "Rangs officiels 5/50 + 2/12. Indépendant de la fenêtre temporelle (139 838 160 grilles).",
    },
  },
  {
    id: "memo",
    label: "Mémo",
    help: {
      title: "Mémo",
      body: "Aide-mémoire des périodes d’indicateurs et des biais (sur-optimisation, look-ahead, indépendance des tirages).",
    },
  },
] as const

const MEASURE_BAR_HELP: HelpCopy = {
  title: "Bandeau de mesure",
  body: "Il ne choisit pas quels tirages forment la fenêtre (c’est la barre Fenêtre de travail, plus haut) : il dit ce qu’on mesure sur cette fenêtre, et éventuellement quels tirages on garde. Tous les onglets d’analyse lisent ce même jeu.",
  items: [
    {
      label: "Archive",
      text: "Quelle base charger. Formule actuelle (12 ★) : uniquement les tirages avec le pool d’étoiles 1–12 (depuis 2016). Tout l’historique mélange les anciennes formules (étoiles 1–9 puis 1–11) ; à réserver aux comparaisons longues.",
    },
    {
      label: "Variable",
      text: "Grandeur envoyée aux onglets Vue, Tendance, Momentum, etc. Présence d’une boule : série 0/1 (sortie ou non à chaque tirage). Autres choix : somme, étendue, parité, haut-bas, consécutifs, étoiles, centroïde, retard.",
    },
    {
      label: "Boule",
      text: "Visible seulement pour Présence ou Retard. Numéro 1–50 suivi. L’onglet Numéros peut le remplir pour vous.",
    },
    {
      label: "X",
      text: "Période des indicateurs (SMA, RSI, Bollinger…). Ce n’est pas la plage calendaire : celle-ci se règle dans la barre Fenêtre, plus haut.",
    },
    {
      label: "Filtre",
      text: "Restreint la fenêtre aux tirages qui contiennent les boules/étoiles tapées (séparées par des espaces). Stats et graphes se recalculent sur ce sous-ensemble. Vide = toute la fenêtre.",
    },
  ],
}

type TabId = (typeof TECH_TABS)[number]["id"] | (typeof DRAW_TABS)[number]["id"]

function TabRow({
  items,
  tab,
  setTab,
  label,
}: {
  items: readonly { id: string; label: string; help: HelpCopy }[]
  tab: string
  setTab: (id: TabId) => void
  label: string
}) {
  return (
    <nav className="flex flex-wrap gap-2" aria-label={label}>
      {items.map((item) => (
        <span key={item.id} className="inline-flex items-center gap-1">
          <button
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
          <HelpTip {...item.help} />
        </span>
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
  const [star, setStar] = useState(1)
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

  useEffect(() => {
    const params = readLabSearch()
    const nextVariable = asVariableName(params.get("variable"))
    if (nextVariable) setVariable(nextVariable)
    const nextPreset = asWindowPreset(params.get("preset"))
    if (nextPreset) setPreset(nextPreset)
    const x = asPositiveInt(params.get("x"), 2, 200)
    if (x != null) setWindowSize(x)
    const n = asPositiveInt(params.get("n"), 1, 50)
    if (n != null) {
      const target = nextVariable ?? "sum"
      if (variableNeedsStar(target)) setStar(Math.min(12, n))
      else setBall(n)
    }
  }, [])

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

  const variableN = seriesIndex(variable, ball, star)

  const workSeries = useMemo(
    () => series(work, variable, variableN),
    [work, variable, variableN]
  )
  const fullSeries = useMemo(
    () => series(withWarmup, variable, variableN),
    [withWarmup, variable, variableN]
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
    () => rollingProfile(archive, variable, windowSize, variableN),
    [archive, variable, windowSize, variableN]
  )
  const comparison = useMemo(
    () => compareWindows(work, resolved.compare.work, variable, variableN),
    [work, resolved.compare.work, variable, variableN]
  )

  useRegisterCapture(() =>
    packAnalyse({
      tab,
      era,
      source,
      variable,
      ball,
      star,
      query,
      windowSize,
      preset,
      resolved: { ...resolved, work, drawCount: work.length },
      warmupCount,
      points: workSeries.points,
      values: workSeries.values,
      last: tech.last,
      adxRegime: tech.adxRegime,
      structure: tech.structure,
      squeeze: tech.squeeze,
      disclaimer: tech.disclaimer,
    })
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
    <div className="flex min-w-0 flex-col gap-6">
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

      <div className="flex flex-col gap-3 rounded-xl border border-border bg-card/40 p-3">
        <p className="text-sm font-medium text-foreground">
          <TitleHelp help={MEASURE_BAR_HELP}>Mesure</TitleHelp>
        </p>
        <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-end">
        <LabelHelp
          label="Archive"
          help={{
            title: "Ère",
            body: "Formule actuelle = pool de 12 étoiles. Tout l’historique mélange les anciennes formules (étoile 1–9 puis 1–11) : à réserver aux comparaisons longues.",
          }}
        >
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
        </LabelHelp>
        <LabelHelp
          label="Variable"
          help={{
            title: "Variable",
            body: "Grandeur tracée dans Vue / Tendance / etc. Les métriques des numéros (1–50) sont listées en premier, puis celles des étoiles (1–12) : somme, retard ou présence.",
          }}
        >
          <Select value={variable} onValueChange={(v) => setVariable(v as VariableName)}>
            <SelectTrigger className="w-full sm:w-56" aria-label="Variable">
              <span className="flex flex-1 text-left">{VARIABLE_LABELS[variable]}</span>
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectLabel>Numéros</SelectLabel>
                {NUMBER_VARIABLE_NAMES.map((name) => (
                  <SelectItem key={name} value={name}>
                    {VARIABLE_LABELS[name]}
                  </SelectItem>
                ))}
              </SelectGroup>
              <SelectSeparator />
              <SelectGroup>
                <SelectLabel>Étoiles</SelectLabel>
                {STAR_VARIABLE_NAMES.map((name) => (
                  <SelectItem key={name} value={name}>
                    {VARIABLE_LABELS[name]}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </LabelHelp>
        {variableNeedsBall(variable) && (
          <LabelHelp
            label="Boule"
            help={{
              title: "Boule",
              body: "Numéro 1–50 utilisé quand la variable est « Retard d’une boule » ou « Présence d’une boule ». L’onglet Numéros peut le remplir pour vous.",
            }}
          >
            <Input
              type="number"
              min={1}
              max={50}
              value={ball}
              onChange={(e) => setBall(Number(e.target.value) || 7)}
              aria-label="Boule"
              className="w-24"
            />
          </LabelHelp>
        )}
        {variableNeedsStar(variable) && (
          <LabelHelp
            label="Étoile"
            help={{
              title: "Étoile",
              body: "Étoile 1–12 utilisée quand la variable est « Retard d’une étoile » ou « Présence d’une étoile ». Sur l’ancienne formule, les étoiles 10–12 n’existaient pas.",
            }}
          >
            <Input
              type="number"
              min={1}
              max={12}
              value={star}
              onChange={(e) => setStar(Number(e.target.value) || 1)}
              aria-label="Étoile"
              className="w-24"
            />
          </LabelHelp>
        )}
        <LabelHelp
          label="X"
          help={{
            title: "Période X",
            body: "Période des indicateurs (SMA, RSI, Bollinger…). Ce n’est pas la plage calendaire : celle-ci se règle dans la barre Fenêtre, plus haut.",
          }}
        >
          <Input
            type="number"
            min={2}
            max={200}
            value={windowSize}
            onChange={(e) => setWindowSize(Number(e.target.value) || 20)}
            className="w-20"
            aria-label="Période des indicateurs"
          />
        </LabelHelp>
        <LabelHelp
          label="Filtre"
          help={{
            title: "Filtrer par numéros",
            body: "Ne garde dans la fenêtre que les tirages contenant ces boules/étoiles (espace-séparés). Les stats et graphes se recalculent sur ce sous-ensemble.",
          }}
        >
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filtrer par numéros"
            className="sm:w-56"
          />
        </LabelHelp>
        </div>
      </div>

      <TabRow items={TECH_TABS} tab={tab} setTab={setTab} label="Analyse technique" />
      <TabRow items={DRAW_TABS} tab={tab} setTab={setTab} label="Tirage" />

      {tab === "vue" ? (
        <ViewPanel
          work={work}
          withWarmup={withWarmup}
          warmupCount={warmupCount}
          variable={variable}
          ball={variableN}
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
