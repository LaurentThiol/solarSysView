"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts"

import { HelpTip, HelpWrap, TitleHelp } from "@/components/help"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"
import { PillTabPanel, PillTabs } from "@/components/ui/pill-tabs"
import { DRAWS, type Draw } from "@/lib/draws"
import { NEXTDATA_HELP } from "@/lib/nextdata/help"
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
] as const

const CHART: ChartConfig = {
  actual: { label: "Sorti", color: "var(--foreground)" },
  corpus: { label: "Trois ans", color: "var(--chart-1)" },
  fenetre: { label: "Fenêtre seule", color: "var(--chart-2)" },
}

type Band = { lo: number; mid: number; hi: number }
type Grid = { numbers: number[]; stars: number[]; score?: number }
type ModePayload = {
  grid: Grid
  alternates: Grid[]
  quantiles: Record<string, Band>
  mae_sum: number | null
  blend_weight: number
  engine: string
  importance: { name: string; gain: number; family: string }[]
  chronos?: { available?: boolean; weight?: number; holdout_mae_chronos?: number; holdout_mae_lgb?: number } | null
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
    rows: {
      date: string
      actual: StepSide
      corpus: StepSide
      fenetre: StepSide
      persistence: StepSide
    }[]
    metrics: Record<string, { mae: Record<string, number | null>; rmse: Record<string, number | null>; hits_numbers: number | null; hits_stars: number | null }>
  }
  chart: Record<string, string | number | null>[]
  dependencies?: { ready?: boolean; install?: string }
}

const MODE_LABEL = { corpus: "Trois ans", fenetre: "Fenêtre seule" } as const

function ringSize(band: Band | undefined) {
  if (!band) return 3
  const width = Math.abs(band.hi - band.lo)
  return Math.max(2, Math.min(10, 2 + width / 3))
}

function ForecastBalls({
  grid,
  quantiles,
  active,
}: {
  grid: Grid
  quantiles: Record<string, Band>
  active: boolean
}) {
  const ranks = ["n1", "n2", "n3", "n4", "n5"] as const
  return (
    <div className={cn("flex flex-wrap items-center gap-2", active && "rounded-2xl bg-primary/5 px-3 py-2")}>
      {grid.numbers.map((value, index) => (
        <span
          key={`n-${value}-${index}`}
          className="inline-flex size-11 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground tabular-nums"
          style={{ boxShadow: `0 0 0 ${ringSize(quantiles[ranks[index]])}px color-mix(in oklch, var(--primary) 28%, transparent)` }}
        >
          {value}
        </span>
      ))}
      <span className="px-1 text-muted-foreground">+</span>
      {grid.stars.map((value, index) => (
        <span
          key={`s-${value}-${index}`}
          className="inline-flex size-11 items-center justify-center rounded-full bg-star text-sm font-semibold text-primary-foreground tabular-nums"
          style={{ boxShadow: `0 0 0 ${ringSize(quantiles[index === 0 ? "e1" : "e2"])}px color-mix(in oklch, var(--star) 35%, transparent)` }}
        >
          {value}
        </span>
      ))}
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
  rows: Record<string, string | number | null>[]
  delta: boolean
  primary: "corpus" | "fenetre"
}) {
  const keys = [dataKey, `${dataKey}_corpus`, `${dataKey}_fenetre`]
  const data = rows.map((row, index) => {
    const next = { ...row }
    if (!delta) return next
    const previous = rows[index - 1]
    for (const key of keys) {
      const current = Number(row[key])
      const prior = Number(previous?.[key])
      next[key] = Number.isFinite(current) && Number.isFinite(prior) ? Math.round((current - prior) * 100) / 100 : null
    }
    return next
  })
  if (data.length >= 2) {
    const last = data[data.length - 1]
    const prev = data[data.length - 2]
    if (last?.kind === "forecast") {
      const lo = `${dataKey}_${primary}_lo`
      const hi = `${dataKey}_${primary}_hi`
      prev[lo] = prev[dataKey]
      prev[hi] = prev[dataKey]
    }
  }
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
  } | null>(null)
  const [focus, setFocus] = useState<50 | 100>(50)
  const [years, setYears] = useState<string[]>(["n", "n-1", "n-2"])
  const [primary, setPrimary] = useState<"corpus" | "fenetre">("corpus")
  const [weekday, setWeekday] = useState<"tous" | "mardi" | "vendredi">("tous")
  const [families, setFamilies] = useState<string[]>(FAMILIES.map((item) => item.id))
  const [withChronos, setWithChronos] = useState(false)
  const [delta, setDelta] = useState(false)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [report, setReport] = useState<ForecastPayload | null>(null)

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

  const marked = useMemo(() => new Set(report?.modes[primary].grid.numbers ?? []), [report, primary])
  const markedStars = useMemo(() => new Set(report?.modes[primary].grid.stars ?? []), [report, primary])

  function toggleYear(year: string) {
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
    setRunning(true)
    setError(null)
    try {
      const response = await fetch("/api/nextdata/forecast", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          focus,
          years,
          primary,
          weekday,
          covariates: families,
          with_chronos: withChronos,
          draws: draws.map((draw) => ({
            date: draw.date,
            weekday: draw.weekday,
            numbers: draw.numbers,
            stars: draw.stars,
            star_pool: draw.star_pool,
          })),
        }),
      })
      const body = (await response.json()) as ForecastPayload
      if (!response.ok || body.ok === false) {
        setReport(null)
        setError(body.error || "Le pronostic n’a pas abouti.")
        return
      }
      setReport(body)
    } catch (err) {
      setError(err instanceof Error ? err.message : "API injoignable")
    } finally {
      setRunning(false)
    }
  }

  function sendToJeux() {
    const grid = report?.modes[primary].grid
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

  return (
    <div className="flex min-w-0 flex-col gap-6" data-nextdata>
      <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
        <TitleHelp help={NEXTDATA_HELP.banner}>nextData</TitleHelp> propose deux grilles 5+2.
        n1 à n5 sont les numéros triés, pas l’ordre de sortie. L’anneau d’une boule suit la largeur
        du quantile. Ce n’est pas une probabilité de gain FDJ.
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
              <Button key={year} type="button" size="sm" variant={years.includes(year) ? "default" : "outline"} onClick={() => toggleYear(year)}>
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
                {withChronos ? "Chronos inclus" : "LightGBM seul"}
              </Button>
            </HelpWrap>
            <HelpWrap help={NEXTDATA_HELP.delta}>
              <Button type="button" size="sm" variant={delta ? "secondary" : "ghost"} onClick={() => setDelta((value) => !value)}>
                {delta ? "DeltaEvol" : "Niveaux"}
              </Button>
            </HelpWrap>
          </div>

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
                {running ? "Calcul des deux lectures…" : "Pronostiquer"}
              </Button>
            </HelpWrap>
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              {draws.length} tirages · {source === "neon" ? "archive synchronisée" : "jeu embarqué"}
              {status?.darts ? " · Darts" : ""}
              {status?.chronos ? " · Chronos" : ""}
              <HelpTip {...NEXTDATA_HELP.source} />
            </span>
          </div>
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
                  {report.best_mae_sum === primary ? " Ce mode a la plus petite erreur de somme sur le retour." : ` La plus petite erreur de somme est ${MODE_LABEL[report.best_mae_sum]}.`}
                </p>
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
                        <CardContent className="flex flex-col gap-3">
                          <ForecastBalls grid={block.grid} quantiles={block.quantiles} active={active} />
                          <p className="text-xs text-muted-foreground">
                            Moteur {block.engine === "darts" ? "Darts + chaîne" : "LightGBM"}.
                            {block.chronos?.available ? ` Mélange Chronos : poids LightGBM ${block.blend_weight}.` : ""}
                          </p>
                          {active && (
                            <HelpWrap help={NEXTDATA_HELP.jeux}>
                              <Button type="button" variant="outline" onClick={sendToJeux}>
                                Envoyer vers Jeux
                              </Button>
                            </HelpWrap>
                          )}
                        </CardContent>
                      </Card>
                    )
                  })}
                </div>
                {report.modes[primary].alternates.length > 0 && (
                  <div className="flex flex-col gap-2">
                    <p className="inline-flex items-center gap-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Cinq suivantes · {MODE_LABEL[primary]}
                      <HelpTip {...NEXTDATA_HELP.suivantes} />
                    </p>
                    <ul className="flex flex-col gap-1 text-sm tabular-nums">
                      {report.modes[primary].alternates.map((grid) => (
                        <li key={grid.numbers.join("-") + grid.stars.join("-")}>
                          {grid.numbers.join(" ")} + {grid.stars.join(" ")}
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
                  <table className="w-full min-w-[36rem] text-left text-sm">
                    <thead className="text-xs uppercase tracking-wide text-muted-foreground">
                      <tr>
                        <th className="py-2 pr-3"><TitleHelp help={NEXTDATA_HELP.metriques}>Lecture</TitleHelp></th>
                        <th className="py-2 pr-3">MAE somme</th>
                        <th className="py-2 pr-3">RMSE somme</th>
                        <th className="py-2 pr-3">Numéros communs</th>
                        <th className="py-2">Étoiles communes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(
                        [
                          ["corpus", "Trois ans"],
                          ["fenetre", "Fenêtre seule"],
                          ["persistence", "Persistance"],
                          ["mean", "Moyenne"],
                        ] as const
                      ).map(([key, label]) => {
                        const block = report.backtest.metrics[key]
                        if (!block) return null
                        const best = report.backtest.best_mae_sum === key
                        return (
                          <tr key={key} className={cn(best && "bg-primary/5")}>
                            <td className="py-1.5 pr-3">{label}{best ? " · plus basse erreur" : ""}</td>
                            <td className="py-1.5 pr-3 tabular-nums">{block.mae.sum ?? "—"}</td>
                            <td className="py-1.5 pr-3 tabular-nums">{block.rmse.sum ?? "—"}</td>
                            <td className="py-1.5 pr-3 tabular-nums">{block.hits_numbers ?? "—"}</td>
                            <td className="py-1.5 tabular-nums">{block.hits_stars ?? "—"}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
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
                        <ul className="flex flex-col gap-1 text-sm">
                          {report.modes[mode].importance.map((item) => (
                            <li key={item.name} className="flex justify-between gap-3 tabular-nums">
                              <span>{item.name} <span className="text-muted-foreground">{item.family}</span></span>
                              <span>{item.gain}</span>
                            </li>
                          ))}
                        </ul>
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
