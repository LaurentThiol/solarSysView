"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts"

import { HelpTip, HelpWrap, TitleHelp } from "@/components/help"
import { PersistArchive, PersistControl, PersistPairCard, RecentNote, SwapNote } from "@/components/nextdata/persist-panel"
import { RankPath } from "@/components/nextdata/rank-path"
import { StepMeter } from "@/components/nextdata/step-meter"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"
import { PillTabPanel, PillTabs } from "@/components/ui/pill-tabs"
import { DRAWS, type Draw } from "@/lib/draws"
import {
  BAND_FIELDS,
  calibrationCaption,
  formatShare,
  progressPercent,
  type BandCoverage,
  type Calibration,
  type StepProgress,
} from "@/lib/nextdata/bands"
import { chronosBanner, chronosShare, type ChronosNote, type ChronosStatus } from "@/lib/nextdata/chronos"
import { formatDecimal } from "@/lib/nextdata/compare"
import { NEXTDATA_HELP } from "@/lib/nextdata/help"
import {
  edgeFor,
  formatPoints,
  pairPersist,
  persistKey,
  radiusLabel,
  swappedValues,
  type PersistHeld,
  type PersistInfo,
  type PersistSetting,
  type PersistSwap,
} from "@/lib/nextdata/persist"
import type { Arbitration } from "@/lib/nextdata/rank-path"
import {
  lowestAgainstNext,
  lowestNote,
  RETOUR_READINGS,
  retourLabel,
  twinOrigin,
  undecidedRunnerUp,
  type RetourId,
} from "@/lib/nextdata/retour"
import { seriesRows, type SeriesRow } from "@/lib/nextdata/series"
import { shapeCaption } from "@/lib/nextdata/shape"
import {
  chanceOdds,
  chanceRange,
  chanceSentence,
  formatGap,
  formatHits,
  formatInterval,
  formatShareInterval,
  verdictLabel,
  type ChanceHits,
  type HitsChance,
  type MeanInterval,
  type PairedGap,
  type Verdict,
} from "@/lib/nextdata/uncertainty"
import { defaultStoredSpec, writeStoredSpec } from "@/lib/jeux"
import { useLabTab } from "@/lib/use-lab-tab"
import { cn } from "@/lib/utils"

const TABS = [
  { id: "pronostic", label: "Pronostic", help: NEXTDATA_HELP.tabPronostic },
  { id: "base", label: "Base", help: NEXTDATA_HELP.tabBase },
  { id: "retour", label: "Retour", help: NEXTDATA_HELP.tabRetour },
] as const

type TabId = (typeof TABS)[number]["id"]
const TAB_IDS = TABS.map((item) => item.id) as TabId[]

const FAMILIES: { id: string; label: string }[] = [
  { id: "calendrier", label: "Calendrier" },
  { id: "lune", label: "Lune" },
  { id: "forme", label: "Forme" },
  { id: "decennies", label: "Décennies" },
  { id: "delta", label: "Delta" },
  { id: "repetitions", label: "Répétitions" },
  { id: "couples", label: "Couples" },
  { id: "triples", label: "Triples" },
]

const SERIES = [
  { key: "sum", label: "Somme" },
  { key: "n1", label: "n1" },
  { key: "n2", label: "n2" },
  { key: "n3", label: "n3" },
  { key: "n4", label: "n4" },
  { key: "n5", label: "n5" },
  { key: "star_sum", label: "Somme ★" },
  { key: "e1", label: "e1" },
  { key: "e2", label: "e2" },
  { key: "spread", label: "Étendue" },
  { key: "consecutive", label: "Consécutifs" },
  { key: "star_spread", label: "Étendue ★" },
  { key: "star_consecutive", label: "Consécutifs ★" },
] as const

const CHART: ChartConfig = {
  actual: { label: "Sorti", color: "var(--foreground)" },
  corpus: { label: "Trois ans", color: "var(--chart-1)" },
  fenetre: { label: "Fenêtre seule", color: "var(--chart-2)" },
  catCorpus: { label: "CatBoost trois ans", color: "var(--chart-3)" },
  catFenetre: { label: "CatBoost fenêtre", color: "var(--chart-4)" },
}

type Band = { lo: number; mid: number; hi: number }
type Grid = { numbers: number[]; stars: number[]; score?: number }
type PersistBlock = { grid: Grid; swaps: PersistSwap[]; held: PersistHeld | null }
type ModePayload = {
  grid: Grid
  alternates: Grid[]
  quantiles: Record<string, Band>
  mae_sum: number | null
  blend_weight: number
  engine: string
  importance: { name: string; gain: number; family: string }[]
  chronos?: ChronosNote | null
  arbitration?: Arbitration | null
  calibration?: Calibration
  persist?: PersistBlock | null
  catboost?: ModePayload | null
}
type StepSide = {
  numbers: number[]
  stars: number[]
  sum: number | null
  n1?: number | null
  n2?: number | null
  n3?: number | null
  n4?: number | null
  n5?: number | null
  star_sum?: number | null
  e1?: number | null
  e2?: number | null
  swaps?: PersistSwap[]
  held?: PersistHeld | null
}
type BacktestRow = {
  date: string
  actual: StepSide
  corpus: StepSide
  fenetre: StepSide
  persistence: StepSide
} & Partial<Record<string, StepSide | string>>
type RetourMetrics = {
  mae: Record<string, number | null>
  rmse: Record<string, number | null>
  mae_sum_ci?: MeanInterval | null
  hits_numbers: number | null
  hits_stars: number | null
  hits_chance?: HitsChance | null
  versus?: Record<string, PairedGap>
}

const VERDICT_TONE: Record<Verdict, string> = {
  lower: "text-chart-2",
  higher: "text-destructive",
  undecided: "text-muted-foreground",
}

/** Repère de la colonne « contre la moyenne » : la moyenne, ou la lecture d’origine pour une jumelle Persist. */
function benchmarkOf(key: RetourId): RetourId | null {
  if (key === "mean") return null
  return twinOrigin(key) ?? "mean"
}

function chanceTitle(chance: ChanceHits | null | undefined) {
  const odds = chanceOdds(chance)
  return odds ? `Hasard ${chanceRange(chance)} ; ${odds}.` : undefined
}
type ForecastPayload = {
  ok: boolean
  error?: string
  focus: number
  focus_requested: number
  years_present: string[]
  primary: "corpus" | "fenetre"
  next_date: string
  star_pool: number
  engine: string
  catboost?: boolean
  best_mae_sum: "corpus" | "fenetre"
  modes: { corpus: ModePayload; fenetre: ModePayload }
  base: {
    draw_count: number
    numbers: { n: number; count: number; share: number }[]
    stars: { n: number; count: number; share: number }[]
    couples: { a: number; b: number; count: number; affinity: number; ago: number; lift: number }[]
    triples: { a: number; b: number; c: number; count: number; affinity: number; ago: number; lift: number }[]
  }
  backtest: {
    draw_count: number
    best_mae_sum: string
    rows: BacktestRow[]
    metrics: Record<string, RetourMetrics>
    bands?: Record<string, Record<string, BandCoverage>>
  }
  chart: Record<string, string | number | null>[]
  dependencies?: { ready?: boolean; install?: string }
  estimators?: number
  progress?: StepProgress
  persist?: PersistInfo | null
  chronos?: ChronosStatus
}

function rowSide(row: BacktestRow, key: string): StepSide | null {
  const side = row[key]
  return side && typeof side === "object" ? side : null
}

const MODE_LABEL = { corpus: "Trois ans", fenetre: "Fenêtre seule" } as const

function ringSize(band: Band | undefined) {
  if (!band) return 3
  const width = Math.abs(band.hi - band.lo)
  return Math.max(2, Math.min(10, 2 + width / 3))
}

const SWAPPED_OUTLINE = { outline: "2px dashed var(--foreground)", outlineOffset: "5px" } as const

function ForecastBalls({
  grid,
  quantiles,
  active,
  swaps,
}: {
  grid: Grid
  quantiles: Record<string, Band>
  active: boolean
  swaps?: PersistSwap[]
}) {
  const ranks = ["n1", "n2", "n3", "n4", "n5"] as const
  const swappedNumbers = swappedValues(swaps, "number")
  const swappedStars = swappedValues(swaps, "star")
  return (
    <div className={cn("flex flex-wrap items-center gap-2", active && "rounded-2xl bg-primary/5 px-3 py-2")}>
      {grid.numbers.map((value, index) => (
        <span
          key={`n-${value}-${index}`}
          data-swapped={swappedNumbers.has(value) ? "true" : undefined}
          title={swappedNumbers.has(value) ? "reprise de n−1 ou n−2" : undefined}
          className="inline-flex size-11 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground tabular-nums"
          style={{
            boxShadow: `0 0 0 ${ringSize(quantiles[ranks[index]])}px color-mix(in oklch, var(--primary) 28%, transparent)`,
            ...(swappedNumbers.has(value) ? SWAPPED_OUTLINE : {}),
          }}
        >
          {value}
        </span>
      ))}
      <span className="px-1 text-muted-foreground">+</span>
      {grid.stars.map((value, index) => (
        <span
          key={`s-${value}-${index}`}
          data-swapped={swappedStars.has(value) ? "true" : undefined}
          title={swappedStars.has(value) ? "reprise de n−1 ou n−2" : undefined}
          className="inline-flex size-11 items-center justify-center rounded-full bg-star text-sm font-semibold text-primary-foreground tabular-nums"
          style={{
            boxShadow: `0 0 0 ${ringSize(quantiles[index === 0 ? "e1" : "e2"])}px color-mix(in oklch, var(--star) 35%, transparent)`,
            ...(swappedStars.has(value) ? SWAPPED_OUTLINE : {}),
          }}
        >
          {value}
        </span>
      ))}
    </div>
  )
}

function PersistLine({
  block,
  info,
  quantiles,
  active,
}: {
  block: PersistBlock
  info: PersistInfo
  quantiles: Record<string, Band>
  active: boolean
}) {
  return (
    <div className="flex flex-col gap-2 border-t border-dashed border-border pt-2" data-persist-grid>
      <p className="text-xs font-medium text-muted-foreground">
        Persist {radiusLabel(info.radius)} · {info.limit === 1 ? "1 numéro" : "2 numéros"}
      </p>
      <ForecastBalls grid={block.grid} quantiles={quantiles} active={active} swaps={block.swaps} />
      <SwapNote swaps={block.swaps} held={block.held} radius={info.radius} limit={info.limit} />
    </div>
  )
}

function SeriesChart({
  title,
  dataKey,
  rows,
  delta,
  primary,
}: {
  title: string
  dataKey: string
  rows: SeriesRow[]
  delta: boolean
  primary: "corpus" | "fenetre"
}) {
  const data = seriesRows(rows, dataKey, primary, delta)
  const loKey = `${dataKey}_${primary}_lo`
  const hiKey = `${dataKey}_${primary}_hi`
  return (
    <div className="min-w-0">
      <p className="mb-1 text-xs font-medium text-muted-foreground">{title}</p>
      <ChartContainer config={CHART} className="aspect-[2.4/1] h-28 w-full">
        <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 10 }} minTickGap={18} />
          <YAxis tick={{ fontSize: 10 }} width={32} />
          <ChartTooltip content={<ChartTooltipContent />} />
          <Line type="monotone" dataKey={hiKey} stroke="var(--color-corpus)" dot={false} strokeWidth={1} strokeOpacity={0.35} connectNulls />
          <Line type="monotone" dataKey={loKey} stroke="var(--color-corpus)" dot={false} strokeWidth={1} strokeOpacity={0.35} connectNulls />
          <Line type="monotone" dataKey={dataKey} name="Sorti" stroke="var(--color-actual)" dot={false} strokeWidth={1.6} connectNulls />
          <Line type="monotone" dataKey={`${dataKey}_corpus`} name="Trois ans" stroke="var(--color-corpus)" dot={false} strokeDasharray="5 3" strokeWidth={1.4} connectNulls />
          <Line type="monotone" dataKey={`${dataKey}_fenetre`} name="Fenêtre seule" stroke="var(--color-fenetre)" dot={false} strokeDasharray="2 3" strokeWidth={1.4} connectNulls />
          <Line type="monotone" dataKey={`${dataKey}_corpus_catboost`} name="CatBoost trois ans" stroke="var(--color-catCorpus)" dot={false} strokeDasharray="1 3" strokeWidth={1.4} connectNulls />
          <Line type="monotone" dataKey={`${dataKey}_fenetre_catboost`} name="CatBoost fenêtre" stroke="var(--color-catFenetre)" dot={false} strokeDasharray="6 2" strokeWidth={1.4} connectNulls />
        </LineChart>
      </ChartContainer>
    </div>
  )
}

export function NextDataLab() {
  const router = useRouter()
  const [tab, selectTab] = useLabTab(TAB_IDS, "pronostic")
  const [draws, setDraws] = useState<Draw[]>(DRAWS)
  const [source, setSource] = useState("json")
  const [status, setStatus] = useState<{
    ready?: boolean
    install?: string
    lightgbm?: boolean
    lightgbm_error?: string | null
    hint?: string | null
    darts?: boolean
    chronos?: boolean
    chronos_error?: string | null
    catboost?: boolean
  } | null>(null)
  const [focus, setFocus] = useState<50 | 100>(50)
  const [years, setYears] = useState<string[]>(["n", "n-1", "n-2"])
  const [primary, setPrimary] = useState<"corpus" | "fenetre">("corpus")
  const [library, setLibrary] = useState<"lightgbm" | "catboost">("lightgbm")
  const [weekday, setWeekday] = useState<"tous" | "mardi" | "vendredi">("tous")
  const [families, setFamilies] = useState<string[]>(FAMILIES.map((item) => item.id))
  const [withChronos, setWithChronos] = useState(false)
  const [delta, setDelta] = useState(false)
  const [persistSetting, setPersistSetting] = useState<PersistSetting | null>(null)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [report, setReport] = useState<ForecastPayload | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    return () => abortRef.current?.abort()
  }, [])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const drawRes = await fetch("/api/draws?era=current", { cache: "no-store" })
        if (cancelled || !drawRes.ok) return
        const body = (await drawRes.json()) as { items?: Draw[]; source?: string }
        if (Array.isArray(body.items) && body.items.length >= 24) {
          setDraws(body.items)
          setSource(body.source || "neon")
        }
      } catch {
        /* le jeu embarqué reste affiché */
      }
    })()
    void (async () => {
      try {
        const statusRes = await fetch("/api/nextdata/status", { cache: "no-store" })
        if (cancelled || !statusRes.ok) return
        setStatus(await statusRes.json())
      } catch {
        /* le pronostic LightGBM reste proposé */
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const marked = useMemo(() => {
    const block = report?.modes[primary]
    const grid = library === "catboost" && block?.catboost ? block.catboost.grid : block?.grid
    return new Set(grid?.numbers ?? [])
  }, [report, primary, library])
  const markedStars = useMemo(() => {
    const block = report?.modes[primary]
    const grid = library === "catboost" && block?.catboost ? block.catboost.grid : block?.grid
    return new Set(grid?.stars ?? [])
  }, [report, primary, library])
  const pathTrace = useMemo(() => {
    const block = report?.modes[primary]
    if (library === "catboost" && block?.catboost) return block.catboost.arbitration
    return block?.arbitration
  }, [report, primary, library])

  function toggleYear(year: string) {
    if (year === "n") return
    setYears((current) => {
      const next = current.includes(year) ? current.filter((item) => item !== year) : [...current, year]
      return next.length ? next : current
    })
  }

  function toggleFamily(id: string) {
    setFamilies((current) => {
      const next = current.includes(id) ? current.filter((item) => item !== id) : [...current, id]
      return next.length ? next : current
    })
  }

  async function pronostiquer() {
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    setRunning(true)
    setError(null)
    const body = JSON.stringify({
      focus,
      years,
      primary,
      weekday,
      covariates: families,
      with_chronos: withChronos,
      persist: persistSetting,
      draws: draws.map((draw) => ({
        date: draw.date,
        weekday: draw.weekday,
        numbers: draw.numbers,
        stars: draw.stars,
        star_pool: draw.star_pool,
      })),
    })
    let ready = -1
    try {
      for (;;) {
        const response = await fetch("/api/nextdata/forecast", {
          method: "POST",
          headers: { "content-type": "application/json" },
          signal: controller.signal,
          body,
        })
        const payload = (await response.json()) as ForecastPayload
        if (!response.ok || payload.ok === false) {
          if (ready < 0) setReport(null)
          setError(payload.error || "Le pronostic n’a pas abouti.")
          return
        }
        setReport(payload)
        const progress = payload.progress
        if (!progress || progress.complete) return
        if (progress.ready <= ready) {
          setError("Le retour n’avance plus : un pas échoue à chaque tranche.")
          return
        }
        ready = progress.ready
      }
    } catch (err) {
      if (controller.signal.aborted) return
      setError(err instanceof Error ? err.message : "API injoignable")
    } finally {
      if (abortRef.current === controller) setRunning(false)
    }
  }

  function stop() {
    abortRef.current?.abort()
    abortRef.current = null
    setRunning(false)
  }

  function sendToJeux(withPersist = false) {
    const block = report?.modes[primary]
    const chosen = library === "catboost" && block?.catboost ? block.catboost : block
    const grid = withPersist ? chosen?.persist?.grid : chosen?.grid
    if (!grid) return
    const spec = defaultStoredSpec()
    const sum = grid.numbers.reduce((total, value) => total + value, 0)
    const starSum = grid.stars.reduce((total, value) => total + value, 0)
    writeStoredSpec({
      ...spec,
      numberForced: [...grid.numbers],
      starForced: [...grid.stars],
      numberMinSum: sum,
      numberMaxSum: sum,
      starMinSum: starSum,
      starMaxSum: starSum,
    })
    router.push("/jeux")
  }

  const maxCount = Math.max(1, ...(report?.base.numbers.map((item) => item.count) ?? [1]))
  const lowest = report ? lowestAgainstNext(report.backtest.metrics) : null
  const runnerUp = undecidedRunnerUp(lowest)
  const lowestTail = runnerUp ? `, sans écart tranché avec « ${retourLabel(runnerUp)} »` : ""
  const retourChance = report
    ? RETOUR_READINGS.map((item) => report.backtest.metrics[item.id]?.hits_chance).find((chance) => chance?.numbers)
    : null
  const shown: RetourId =
    library === "catboost" && report?.modes[primary].catboost ? (`${primary}_catboost` as const) : primary
  const shownBlock = library === "catboost" && report?.modes[primary].catboost ? report.modes[primary].catboost : report?.modes[primary]
  const progress = report?.progress ?? null
  const shownBands = report?.backtest.bands?.[shown]
  const persistInfo = report?.persist ?? null
  const persistMoved = Boolean(shownBlock?.persist?.swaps.length)
  const persistPair = useMemo(() => {
    if (!report?.persist) return null
    return pairPersist(
      report.backtest.rows.map((row) => ({
        actual: row.actual,
        raw: rowSide(row, shown),
        persist: rowSide(row, persistKey(shown)),
      })),
      report.star_pool
    )
  }, [report, shown])
  const archiveEdge = persistInfo?.base ? edgeFor(persistInfo.base.numbers, persistInfo.radius) : null

  return (
    <div className="flex min-w-0 flex-col gap-6" data-nextdata>
      <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
        <TitleHelp help={NEXTDATA_HELP.banner}>nextData</TitleHelp> propose deux grilles 5+2.
        n1 à n5 sont les numéros triés, pas l’ordre de sortie. L’anneau d’une boule suit la largeur
        de sa bande 10–90, calibrée sur le retour. Ce n’est pas une probabilité de gain FDJ.
      </p>

      {status && status.ready === false && (
        <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm">
          {status.hint || status.lightgbm_error || "LightGBM n’est pas installé."}{" "}
          {status.install || "./launch install-nextdata"}
        </p>
      )}

      <Card>
        <CardContent className="flex flex-col gap-4 pt-6">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Focus
              <HelpTip {...NEXTDATA_HELP.focus} />
            </span>
            {([50, 100] as const).map((value) => (
              <Button key={value} type="button" size="sm" variant={focus === value ? "default" : "outline"} onClick={() => setFocus(value)}>
                {value}
              </Button>
            ))}
            <span className="ml-2 inline-flex items-center gap-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Années
              <HelpTip {...NEXTDATA_HELP.years} />
            </span>
            {(["n", "n-1", "n-2"] as const).map((year) => (
              <Button
                key={year}
                type="button"
                size="sm"
                variant={years.includes(year) ? "default" : "outline"}
                aria-disabled={year === "n" || undefined}
                title={year === "n" ? "n reste cochée : ses tirages précèdent le prochain" : undefined}
                onClick={() => toggleYear(year)}
              >
                {year}
              </Button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2" data-primary-switch>
            <span className="inline-flex items-center gap-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Entraînement
              <HelpTip {...NEXTDATA_HELP.train} />
            </span>
            <Button type="button" variant={primary === "corpus" ? "default" : "outline"} onClick={() => setPrimary("corpus")}>
              Trois ans · poids ×3
            </Button>
            <Button type="button" variant={primary === "fenetre" ? "default" : "outline"} onClick={() => setPrimary("fenetre")}>
              Fenêtre seule
            </Button>
            <span className="ml-2 inline-flex items-center gap-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Bibliothèque
              <HelpTip {...NEXTDATA_HELP.bibliotheque} />
            </span>
            <Button type="button" size="sm" variant={library === "lightgbm" ? "default" : "outline"} onClick={() => setLibrary("lightgbm")}>
              LightGBM
            </Button>
            <Button
              type="button"
              size="sm"
              variant={library === "catboost" ? "default" : "outline"}
              disabled={status?.catboost === false && !report?.catboost}
              onClick={() => setLibrary("catboost")}
            >
              CatBoost
            </Button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Jour
              <HelpTip {...NEXTDATA_HELP.jour} />
            </span>
            {(["tous", "mardi", "vendredi"] as const).map((day) => (
              <Button key={day} type="button" size="sm" variant={weekday === day ? "secondary" : "ghost"} onClick={() => setWeekday(day)}>
                {day === "tous" ? "Tous" : day === "mardi" ? "Mardi" : "Vendredi"}
              </Button>
            ))}
            <HelpWrap help={NEXTDATA_HELP.moteur}>
              <Button type="button" size="sm" variant={withChronos ? "secondary" : "ghost"} onClick={() => setWithChronos((value) => !value)}>
                {withChronos ? "Chronos inclus" : "Sans Chronos"}
              </Button>
            </HelpWrap>
            <HelpWrap help={NEXTDATA_HELP.delta}>
              <Button type="button" size="sm" variant={delta ? "secondary" : "ghost"} onClick={() => setDelta((value) => !value)}>
                {delta ? "DeltaEvol" : "Niveaux"}
              </Button>
            </HelpWrap>
          </div>

          <PersistControl value={persistSetting} onChange={setPersistSetting} help={NEXTDATA_HELP.persist} />

          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Covariables
              <HelpTip {...NEXTDATA_HELP.covariates} />
            </span>
            {FAMILIES.map((family) => (
              <button
                key={family.id}
                type="button"
                onClick={() => toggleFamily(family.id)}
                className={cn(
                  "rounded-full border px-2.5 py-1 text-xs",
                  families.includes(family.id) ? "border-primary bg-primary/10 text-foreground" : "border-border text-muted-foreground"
                )}
              >
                {family.label}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <HelpWrap help={NEXTDATA_HELP.run}>
              <Button type="button" disabled={running || status?.ready === false} onClick={() => void pronostiquer()}>
                {!running ? "Pronostiquer" : progress ? `Pas ${progress.ready} sur ${progress.total}…` : "Calcul du prochain tirage…"}
              </Button>
            </HelpWrap>
            {running && (
              <Button type="button" size="sm" variant="ghost" onClick={stop}>
                Arrêter
              </Button>
            )}
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              {draws.length} tirages · {source === "neon" ? "archive synchronisée" : "jeu embarqué"}
              {status?.darts ? " · Darts" : ""}
              {status?.chronos && !status.chronos_error && !report?.chronos?.error ? " · Chronos" : ""}
              <HelpTip {...NEXTDATA_HELP.source} />
            </span>
          </div>
          {running && (
            <StepMeter
              percent={progress ? progressPercent(progress) : 0}
              ariaLabel="Avancement du retour"
              label={
                progress
                  ? `Pas ${progress.ready} sur ${progress.total} : le prochain tirage, puis le retour`
                  : "Calcul du prochain tirage…"
              }
            />
          )}
          {error && <p className="text-sm text-destructive">{error}</p>}
        </CardContent>
      </Card>

      <PillTabs idPrefix="nextdata" label="nextData" value={tab} onValueChange={selectTab} items={TABS} />

      <PillTabPanel idPrefix="nextdata" tab={tab}>
        {tab === "pronostic" && (
          <div className="flex flex-col gap-6">
            {!report && <p className="text-sm text-muted-foreground">Lancez un pronostic pour voir les deux grilles et les courbes du focus.</p>}
            {report && (
              <>
                <p className="text-sm text-muted-foreground">
                  Prochain tirage {report.next_date}. Focus utilisé : {report.focus}
                  {report.focus !== report.focus_requested ? ` (demandé ${report.focus_requested})` : ""}. Années présentes : {report.years_present.join(", ") || "—"}.
                  {lowest == null
                    ? ""
                    : lowest.best === shown
                      ? ` Cette lecture a la plus petite erreur de somme sur le retour${lowestTail}.`
                      : ` Sur le retour, la plus petite erreur de somme revient à « ${retourLabel(lowest.best)} »${lowestTail}.`}
                  {shownBlock?.calibration ? ` ${calibrationCaption(shownBlock.calibration)}` : ""}
                </p>
                {chronosBanner(report.chronos) && <p className="text-sm text-muted-foreground">{chronosBanner(report.chronos)}</p>}
                {persistInfo && (
                  <div className="flex flex-col gap-1" data-persist-recent>
                    {persistInfo.recent?.length ? <RecentNote recent={persistInfo.recent} /> : null}
                    {archiveEdge && archiveEdge.value != null && persistInfo.base ? (
                      <p className="text-xs tabular-nums text-muted-foreground">
                        Sur {persistInfo.base.draws} tirages de l’archive, un échange de numéro à {radiusLabel(persistInfo.radius)}{" "}
                        rapporte {formatPoints(archiveEdge.value)} [{formatPoints(archiveEdge.lo)} ; {formatPoints(archiveEdge.hi)}]
                        de sortie, le hasard 0. Détail et mesure sur le retour : onglet Retour.
                      </p>
                    ) : null}
                  </div>
                )}
                <div className="grid gap-4 md:grid-cols-2">
                  {(["corpus", "fenetre"] as const).map((mode) => {
                    const block = report.modes[mode]
                    const active = primary === mode
                    return (
                      <Card key={mode} className={cn(active && "border-primary")} data-mode={mode} data-active={active ? "true" : "false"}>
                        <CardHeader>
                          <CardTitle className="flex items-center justify-between gap-2 text-base">
                            <TitleHelp help={NEXTDATA_HELP.grille}>{MODE_LABEL[mode]}</TitleHelp>
                            <span className="text-xs font-normal text-muted-foreground">
                              {active ? "mise en avant" : "comparaison"}
                              {block.mae_sum != null ? ` · MAE somme ${block.mae_sum}` : ""}
                            </span>
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="flex flex-col gap-4">
                          <div className={cn("flex flex-col gap-2 rounded-xl p-2", active && library === "lightgbm" && "bg-primary/5")}>
                            <p className="text-xs font-medium text-muted-foreground">
                              LightGBM{block.mae_sum != null ? ` · MAE somme ${block.mae_sum}` : ""}
                              {block.engine === "darts" ? " · Darts" : ""}
                              {block.chronos?.available ? ` · ${chronosShare(block.chronos)}` : ""}
                            </p>
                            <ForecastBalls grid={block.grid} quantiles={block.quantiles} active={active && library === "lightgbm"} />
                            <p className="text-xs tabular-nums text-muted-foreground">{shapeCaption(block.grid.numbers, block.grid.stars)}</p>
                            {persistInfo && block.persist && (
                              <PersistLine block={block.persist} info={persistInfo} quantiles={block.quantiles} active={false} />
                            )}
                          </div>
                          {block.catboost && (
                            <div className={cn("flex flex-col gap-2 rounded-xl p-2", active && library === "catboost" && "bg-primary/5")}>
                              <p className="text-xs font-medium text-muted-foreground">
                                CatBoost{block.catboost.mae_sum != null ? ` · MAE somme ${block.catboost.mae_sum}` : ""}
                              </p>
                              <ForecastBalls grid={block.catboost.grid} quantiles={block.catboost.quantiles} active={active && library === "catboost"} />
                              <p className="text-xs tabular-nums text-muted-foreground">{shapeCaption(block.catboost.grid.numbers, block.catboost.grid.stars)}</p>
                              {persistInfo && block.catboost.persist && (
                                <PersistLine
                                  block={block.catboost.persist}
                                  info={persistInfo}
                                  quantiles={block.catboost.quantiles}
                                  active={false}
                                />
                              )}
                            </div>
                          )}
                          {active && (
                            <div className="flex flex-wrap gap-2">
                              <HelpWrap help={NEXTDATA_HELP.jeux}>
                                <Button type="button" variant="outline" onClick={() => sendToJeux()}>
                                  Envoyer vers Jeux
                                </Button>
                              </HelpWrap>
                              {persistInfo && persistMoved && (
                                <Button type="button" variant="outline" onClick={() => sendToJeux(true)}>
                                  Envoyer la grille Persist
                                </Button>
                              )}
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    )
                  })}
                </div>
                {pathTrace ? (
                  <Card>
                    <CardContent>
                      <RankPath help={NEXTDATA_HELP.chemin} trace={pathTrace} />
                    </CardContent>
                  </Card>
                ) : null}
                {((library === "catboost" && report.modes[primary].catboost
                  ? report.modes[primary].catboost.alternates
                  : report.modes[primary].alternates) ?? []
                ).length > 0 && (
                  <div className="flex flex-col gap-2">
                    <p className="inline-flex items-center gap-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Cinq suivantes · {MODE_LABEL[primary]} · {library === "catboost" ? "CatBoost" : "LightGBM"}
                      <HelpTip {...NEXTDATA_HELP.suivantes} />
                    </p>
                    <ul className="flex flex-col gap-1 text-sm tabular-nums">
                      {(library === "catboost" && report.modes[primary].catboost
                        ? report.modes[primary].catboost.alternates
                        : report.modes[primary].alternates
                      ).map((grid) => (
                        <li key={grid.numbers.join("-") + grid.stars.join("-")}>
                          {grid.numbers.join(" ")} + {grid.stars.join(" ")}
                          <span className="text-muted-foreground"> · {shapeCaption(grid.numbers, grid.stars)}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                <div className="flex flex-col gap-3">
                  <p className="inline-flex items-center gap-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Courbes
                    <HelpTip {...NEXTDATA_HELP.courbes} />
                  </p>
                <div className="grid gap-4 lg:grid-cols-2">
                  {SERIES.map((series) => (
                    <SeriesChart
                      key={series.key}
                      title={delta ? `${series.label} · Δ` : series.label}
                      dataKey={series.key}
                      rows={report.chart}
                      delta={delta}
                      primary={primary}
                    />
                  ))}
                </div>
                </div>
              </>
            )}
          </div>
        )}

        {tab === "base" && (
          <div className="flex flex-col gap-6">
            {!report && <p className="text-sm text-muted-foreground">La base se recompte au pronostic, sur le focus choisi.</p>}
            {report && (
              <>
                <p className="inline-flex items-center gap-1 text-sm text-muted-foreground">
                  <TitleHelp help={NEXTDATA_HELP.baseIntro}>
                    {report.base.draw_count} tirages. L’intensité suit l’effectif réel.
                  </TitleHelp>
                </p>
                <div className="grid max-w-3xl grid-cols-10 gap-1.5">
                  {report.base.numbers.map((item) => (
                    <div
                      key={item.n}
                      title={`${item.n} · ${item.count}`}
                      className={cn(
                        "flex aspect-square items-center justify-center rounded-md text-[11px] font-medium tabular-nums",
                        marked.has(item.n) && "ring-2 ring-primary"
                      )}
                      style={{ background: `color-mix(in oklch, var(--primary) ${Math.round(8 + (item.count / maxCount) * 72)}%, var(--muted))` }}
                    >
                      {item.n}
                    </div>
                  ))}
                </div>
                <div className="flex flex-wrap gap-2">
                  {report.base.stars.map((item) => (
                    <div
                      key={item.n}
                      className={cn(
                        "flex size-10 items-center justify-center rounded-full text-xs font-semibold tabular-nums",
                        markedStars.has(item.n) && "ring-2 ring-star"
                      )}
                      style={{ background: `color-mix(in oklch, var(--star) ${Math.round(15 + item.share * 400)}%, var(--muted))` }}
                    >
                      {item.n}
                      <span className="sr-only">{item.count}</span>
                    </div>
                  ))}
                </div>
                <div className="grid gap-6 md:grid-cols-2">
                  <Card>
                    <CardHeader><CardTitle className="text-base"><TitleHelp help={NEXTDATA_HELP.couples}>Couples sortis</TitleHelp></CardTitle></CardHeader>
                    <CardContent className="max-h-80 overflow-auto">
                      <ul className="flex flex-col gap-1 text-sm tabular-nums">
                        {report.base.couples.slice(0, 20).map((link) => (
                          <li key={`${link.a}-${link.b}`} className={cn(marked.has(link.a) && marked.has(link.b) && "font-semibold")}>
                            {link.a}–{link.b} · {link.count} · affinité {link.affinity} · il y a {link.ago}
                          </li>
                        ))}
                      </ul>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader><CardTitle className="text-base"><TitleHelp help={NEXTDATA_HELP.triples}>Triples sortis</TitleHelp></CardTitle></CardHeader>
                    <CardContent className="max-h-80 overflow-auto">
                      <ul className="flex flex-col gap-1 text-sm tabular-nums">
                        {report.base.triples.slice(0, 20).map((link) => (
                          <li key={`${link.a}-${link.b}-${link.c}`}>
                            {link.a}–{link.b}–{link.c} · {link.count} · affinité {link.affinity} · il y a {link.ago}
                          </li>
                        ))}
                      </ul>
                    </CardContent>
                  </Card>
                </div>
              </>
            )}
          </div>
        )}

        {tab === "retour" && (
          <div className="flex flex-col gap-6">
            {!report && <p className="text-sm text-muted-foreground">Le retour se remplit avec le pronostic.</p>}
            {report && (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[48rem] text-left text-sm">
                    <thead className="text-xs uppercase tracking-wide text-muted-foreground">
                      <tr>
                        <th className="py-2 pr-3"><TitleHelp help={NEXTDATA_HELP.metriques}>Lecture</TitleHelp></th>
                        <th className="py-2 pr-3">MAE somme</th>
                        <th className="py-2 pr-3">IC 95 %</th>
                        <th className="py-2 pr-3"><TitleHelp help={NEXTDATA_HELP.apparie}>Contre la moyenne</TitleHelp></th>
                        <th className="py-2 pr-3">RMSE somme</th>
                        <th className="py-2 pr-3">Numéros communs</th>
                        <th className="py-2">Étoiles communes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {RETOUR_READINGS.map(({ id: key, label }) => {
                        const block = report.backtest.metrics[key]
                        if (!block) return null
                        const best = lowest?.best === key
                        const rival = benchmarkOf(key)
                        const gap = rival ? block.versus?.[rival] : undefined
                        return (
                          <tr key={key} className={cn(best && "bg-primary/5")} data-retour={key}>
                            <td className="py-1.5 pr-3">{label}{best ? ` · ${lowestNote(lowest)}` : ""}</td>
                            <td className="py-1.5 pr-3 tabular-nums">{block.mae.sum == null ? "—" : formatDecimal(block.mae.sum)}</td>
                            <td className="py-1.5 pr-3 tabular-nums text-muted-foreground">{formatInterval(block.mae_sum_ci)}</td>
                            <td className="py-1.5 pr-3 tabular-nums" data-versus={rival ?? undefined}>
                              {gap?.verdict ? (
                                <>
                                  <span className={VERDICT_TONE[gap.verdict]}>
                                    {rival !== "mean" ? "face à sa lecture : " : ""}
                                    {verdictLabel(gap.verdict)}
                                  </span>
                                  <span className="block text-xs text-muted-foreground">{formatGap(gap)}</span>
                                </>
                              ) : (
                                "—"
                              )}
                            </td>
                            <td className="py-1.5 pr-3 tabular-nums">{block.rmse.sum == null ? "—" : formatDecimal(block.rmse.sum)}</td>
                            <td className="py-1.5 pr-3 tabular-nums" title={chanceTitle(block.hits_chance?.numbers)}>
                              {formatHits(block.hits_numbers)}
                            </td>
                            <td className="py-1.5 tabular-nums" title={chanceTitle(block.hits_chance?.stars)}>
                              {formatHits(block.hits_stars)}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {report.backtest.draw_count} tirages notés
                    {progress && !progress.complete ? `, ${progress.total - progress.ready} pas encore à calculer` : ""}.
                    {report.estimators ? ` Même réglage que le pronostic : ${report.estimators} arbres, quantiles 10, 50 et 90.` : ""}
                    {retourChance ? ` ${chanceSentence(retourChance)}` : ""}
                  </p>
                </div>
                {shownBands && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">
                        <TitleHelp help={NEXTDATA_HELP.bandes}>
                          Bandes 10–90 · {retourLabel(shown)}
                        </TitleHelp>
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="overflow-x-auto">
                      <table className="w-full min-w-[28rem] text-left text-sm tabular-nums" data-bands={shown}>
                        <thead className="text-xs uppercase tracking-wide text-muted-foreground">
                          <tr>
                            <th className="py-2 pr-3">Lecture</th>
                            <th className="py-2 pr-3">Brute</th>
                            <th className="py-2 pr-3">Calibrée</th>
                            <th className="py-2">Élargie au prochain tirage</th>
                          </tr>
                        </thead>
                        <tbody>
                          {BAND_FIELDS.map((field) => {
                            const measured = shownBands[field.key]
                            if (!measured) return null
                            const edge = shownBlock?.calibration?.edges?.[field.key]
                            return (
                              <tr key={field.key}>
                                <td className="py-1 pr-3">{field.label}</td>
                                <td className="py-1 pr-3">
                                  {formatShare(measured.raw)}
                                  <span className="text-xs text-muted-foreground">
                                    {measured.raw_lo != null ? ` (${formatShareInterval(measured.raw_lo, measured.raw_hi)})` : ""} · {measured.raw_count}
                                  </span>
                                </td>
                                <td className="py-1 pr-3">
                                  {formatShare(measured.calibrated)}
                                  <span className="text-xs text-muted-foreground">
                                    {measured.calibrated_lo != null
                                      ? ` (${formatShareInterval(measured.calibrated_lo, measured.calibrated_hi)})`
                                      : ""}{" "}
                                    · {measured.calibrated_count}
                                  </span>
                                </td>
                                <td className="py-1 text-xs text-muted-foreground">
                                  {edge ? `bas ${formatDecimal(-edge.down, true)} · haut ${formatDecimal(edge.up, true)}` : "—"}
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </CardContent>
                  </Card>
                )}
                {persistInfo && (
                  <div className="grid gap-4 lg:grid-cols-2">
                    {persistPair ? (
                      <PersistPairCard
                        summary={persistPair}
                        help={NEXTDATA_HELP.persistPair}
                        title={`Persist ${radiusLabel(persistInfo.radius)} · ${retourLabel(shown)}`}
                      />
                    ) : null}
                    {persistInfo.base ? (
                      <PersistArchive base={persistInfo.base} radius={persistInfo.radius} help={NEXTDATA_HELP.persistArchive} />
                    ) : null}
                  </div>
                )}
                <div className="grid gap-4 md:grid-cols-2">
                  {(["corpus", "fenetre"] as const).map((mode) => (
                    <Card key={mode}>
                      <CardHeader><CardTitle className="text-base"><TitleHelp help={NEXTDATA_HELP.tirages}>Tirages · {MODE_LABEL[mode]}</TitleHelp></CardTitle></CardHeader>
                      <CardContent className="max-h-96 overflow-auto">
                        <ul className="flex flex-col gap-1 text-xs tabular-nums">
                          {report.backtest.rows.map((row) => {
                            const side = row[mode]
                            const common = side.numbers.filter((value) => row.actual.numbers.includes(value)).length
                            return (
                              <li key={row.date}>
                                {row.date} · sorti {row.actual.numbers.join(" ")} · prévu {side.numbers.join(" ")} · {common}/5
                              </li>
                            )
                          })}
                        </ul>
                      </CardContent>
                    </Card>
                  ))}
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  {(["corpus", "fenetre"] as const).map((mode) => (
                    <Card key={`${mode}-imp`}>
                      <CardHeader><CardTitle className="text-base"><TitleHelp help={NEXTDATA_HELP.poids}>Poids · {MODE_LABEL[mode]}</TitleHelp></CardTitle></CardHeader>
                      <CardContent>
                        <p className="mb-2 text-xs text-muted-foreground">LightGBM</p>
                        <ul className="mb-4 flex flex-col gap-1 text-sm">
                          {report.modes[mode].importance.map((item) => (
                            <li key={item.name} className="flex justify-between gap-3 tabular-nums">
                              <span>{item.name} <span className="text-muted-foreground">{item.family}</span></span>
                              <span>{item.gain}</span>
                            </li>
                          ))}
                        </ul>
                        {report.modes[mode].catboost && (
                          <>
                            <p className="mb-2 text-xs text-muted-foreground">CatBoost</p>
                            <ul className="flex flex-col gap-1 text-sm">
                              {report.modes[mode].catboost.importance.map((item) => (
                                <li key={`cat-${item.name}`} className="flex justify-between gap-3 tabular-nums">
                                  <span>{item.name} <span className="text-muted-foreground">{item.family}</span></span>
                                  <span>{item.gain}</span>
                                </li>
                              ))}
                            </ul>
                          </>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </PillTabPanel>
    </div>
  )
}
