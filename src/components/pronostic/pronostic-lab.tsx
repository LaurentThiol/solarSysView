"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"

import { WindowBar } from "@/components/analysis/window-bar"
import { Disclaimer, OverlayToggle } from "@/components/analysis/shared"
import { useRegisterCapture } from "@/components/capture"
import { DrawBalls } from "@/components/draw-balls"
import {
  HelpWrap,
  LabelHelp,
  TitleHelp,
  type HelpCopy,
} from "@/components/help"
import { WeekdaySynthesisCard } from "@/components/weekday-synthesis-card"
import { HistoricPanel } from "@/components/pronostic/historic-panel"
import { Button } from "@/components/ui/button"
import { PillTabPanel, PillTabs } from "@/components/ui/pill-tabs"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select"
import {
  DEFAULT_WARMUP,
  formatWindowBanner,
  resolveWindow,
  type WindowPreset,
} from "@/lib/analysis-window"
import { inferSpecialist, listSpecialists } from "@/lib/brain/specialists"
import { packPronostic } from "@/lib/capture/pack"
import {
  LIST_LIMIT,
  SAMPLE_SIZE,
  TOTAL_GRIDS,
  formatCount,
  formatOneIn,
  listGrids,
  listPool,
  samplePool,
  writeStoredSpec,
} from "@/lib/jeux"
import { asWindowPreset } from "@/lib/lab-search"
import { useLabTab } from "@/lib/use-lab-tab"
import { formatPlayDate, nextPlayDate, persistPlays } from "@/lib/plays"
import {
  ENVELOPE_METHODS,
  ENVELOPE_METHOD_LABELS,
  LAYER_HELP,
  applyProposal,
  cascadeCounts,
  clampStack,
  countStack,
  defaultLearn,
  defaultStack,
  isImpossible,
  moveLayer,
  pointsFromDraws,
  poolSize,
  proposeStack,
  proposalSummary,
  rankLabel,
  rankTitle,
  setLayerEnabled,
  tighten,
  walkForwardCoverage,
  type EnvelopeMethod,
  type LearnConfig,
  type ParityMode,
  type PoolKind,
  type SlotBand,
  type StackState,
} from "@/lib/pronostic"
import { PRONOSTIC_SESSION_KEY, stackToPoolSpec, stacksToStoredSpec } from "@/lib/pronostic/handoff"
import { useDraws } from "@/lib/use-draws"
import { useWeekdayScope } from "@/lib/use-weekday-scope"
import { weekdayFilterDay } from "@/lib/weekday-scope"
import { cn } from "@/lib/utils"

const HELP = {
  banner: {
    title: "Pronostic",
    body: "Hypothèse de lecture : on resserre l’univers 5+2 par couches. Le décompte est exact. Le tirage officiel reste uniforme sur 139 838 160 grilles ; P(rang) ne change pas.",
  },
  cascade: {
    title: "Cascade",
    body: "Univers, puis chaque couche activée dans l’ordre de la pile. Une couche éteinte n’entre pas dans le décompte.",
  },
  learn: {
    title: "Proposeur",
    body: "Lit la fenêtre (20/50/100/année) et propose des bandes. min/max ± k·σ élargit l’enveloppe observée ; les percentiles la resserrent. Jamais appliqué tout seul.",
  },
  coverage: {
    title: "Couverture walk-forward",
    body: "Pour chaque tirage de la fenêtre, enveloppes calculées sur les W tirages précédents. Taux de hits vs volume moyen restant. 100 % de couverture en gardant presque tout l’univers n’apprend rien.",
  },
  parityMode: {
    title: "Observé / anticipé",
    body: "Observé : bande lue sur la fenêtre (ou le proposeur). Anticipé : vous posez la parité, éventuellement depuis un spécialiste paire-impair.",
  },
  slots: {
    title: "Espaces",
    body: "Intervalle de chaque statistique d’ordre. Chevauchement autorisé ; n1 < n2 < … impose l’unicité. Formule théorique n_i ∈ [i, 50−5+i].",
  },
  handoff: {
    title: "Envoyer vers Jeux",
    body: "Recopie somme, parité et espaces dans le compteur Jeux (les curseurs Jeux n’exposent pas les rangs ; le décompte les applique).",
  },
  consign: {
    title: "Consigner",
    body: "Envoie cette grille dans le journal pour le prochain tirage encore ouvert, avec le spec Pronostic.",
  },
} satisfies Record<string, HelpCopy>

const LOOKBACKS = [20, 50, 100] as const

const TABS = [
  {
    id: "atelier",
    label: "Atelier",
    help: {
      title: "Atelier",
      body: "Couches, proposeur et décompte exact des grilles 5+2 restantes.",
    },
  },
  {
    id: "historic",
    label: "Historique",
    help: {
      title: "Historique",
      body: "Note chaque tirage des 100 derniers avec une marge d’erreur annoncée avant lui, et compte la mise en grilles 5+2. Ce n’est pas P(prochain tirage).",
    },
  },
] as const

type PronosticTab = (typeof TABS)[number]["id"]
const PRONOSTIC_TAB_IDS = TABS.map((item) => item.id) as PronosticTab[]

type StoredPronostic = {
  numbers: StackState
  stars: StackState
  learn: LearnConfig
  lookback: number
  preset: WindowPreset
  pool: PoolKind
}

function RangeField({
  label,
  help,
  min,
  max,
  value,
  onChange,
  display,
  ariaLabel,
}: {
  label: string
  help: HelpCopy
  min: number
  max: number
  value: number
  onChange: (value: number) => void
  display: string
  ariaLabel: string
}) {
  return (
    <LabelHelp label={label} help={help} className="min-w-0 flex-1">
      <div className="flex items-center gap-2">
        <input
          type="range"
          min={min}
          max={max}
          value={value}
          onChange={(event) => onChange(Number(event.target.value))}
          className="jeux-range min-w-0 flex-1"
          aria-label={ariaLabel}
        />
        <span className="w-16 shrink-0 text-right text-xs tabular-nums text-foreground">
          {display}
        </span>
      </div>
    </LabelHelp>
  )
}

function MiniHistogram({
  values,
  min,
  max,
  lo,
  hi,
  label,
}: {
  values: number[]
  min: number
  max: number
  lo: number
  hi: number
  label: string
}) {
  if (values.length === 0 || max < min) {
    return <p className="text-xs text-muted-foreground">Pas encore de fenêtre.</p>
  }
  const bins = 24
  const width = Math.max(1, max - min + 1)
  const counts = new Array(bins).fill(0)
  for (const value of values) {
    const t = (value - min) / width
    const index = Math.min(bins - 1, Math.max(0, Math.floor(t * bins)))
    counts[index] += 1
  }
  const peak = Math.max(1, ...counts)
  return (
    <div className="flex flex-col gap-1" aria-label={label}>
      <div className="relative flex h-14 items-end gap-px">
        {counts.map((count, i) => (
          <div
            key={i}
            className="min-w-0 flex-1 rounded-t-sm bg-primary/70"
            style={{ height: `${Math.max(count ? 8 : 2, (100 * count) / peak)}%` }}
          />
        ))}
        <div
          className="pointer-events-none absolute inset-y-0 rounded-sm border border-primary/50 bg-primary/10"
          style={{
            left: `${((lo - min) / width) * 100}%`,
            width: `${Math.max(2, ((hi - lo + 1) / width) * 100)}%`,
          }}
        />
      </div>
      <p className="text-[10px] tabular-nums text-muted-foreground">
        {min}–{max} · bande {lo}–{hi}
      </p>
    </div>
  )
}

function Sparkline({ values, label }: { values: number[]; label: string }) {
  if (values.length === 0) return null
  const lo = Math.min(...values)
  const hi = Math.max(...values)
  const span = Math.max(1, hi - lo)
  const w = 120
  const h = 28
  const points = values
    .map((value, i) => {
      const x = values.length === 1 ? w / 2 : (i / (values.length - 1)) * w
      const y = h - ((value - lo) / span) * (h - 4) - 2
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(" ")
  return (
    <svg width={w} height={h} className="text-primary" aria-label={label}>
      <polyline fill="none" stroke="currentColor" strokeWidth="1.5" points={points} />
    </svg>
  )
}

function SlotTrack({
  kind,
  slots,
}: {
  kind: PoolKind
  slots: SlotBand[]
}) {
  const pool = poolSize(kind)
  return (
    <div className="relative h-10 overflow-hidden rounded-md bg-muted" aria-hidden>
      {slots.map((band, i) => (
        <div
          key={i}
          className="absolute top-1 bottom-1 rounded-sm opacity-50"
          style={{
            left: `${((band.lo - 1) / pool) * 100}%`,
            width: `${((band.hi - band.lo + 1) / pool) * 100}%`,
            background: `var(--chart-${(i % 5) + 1})`,
          }}
          title={`${rankLabel(kind, i)} ${band.lo}–${band.hi}`}
        />
      ))}
    </div>
  )
}

function formatPct(value: number | null | undefined, digits = 1) {
  if (value == null || Number.isNaN(value)) return "—"
  return value.toLocaleString("fr-FR", {
    style: "percent",
    maximumFractionDigits: digits,
  })
}

function specialistMatches(
  item: { target?: string; slug?: string; name?: string; handle?: string },
  kind: "sum" | "parity"
) {
  const hay = `${item.target ?? ""} ${item.slug ?? ""} ${item.name ?? ""} ${item.handle ?? ""}`.toLowerCase()
  const needles = kind === "sum" ? ["sum", "somme"] : ["parity", "paire", "impair"]
  return needles.some((needle) => hay.includes(needle))
}

export function PronosticLab() {
  const router = useRouter()
  const [weekday] = useWeekdayScope()
  const { draws, source } = useDraws("all", weekday)
  const [preset, setPreset] = useState<WindowPreset>("last_50")
  const [customFrom, setCustomFrom] = useState("")
  const [customTo, setCustomTo] = useState("")
  const [lastN, setLastN] = useState("")
  const [warmup, setWarmup] = useState(DEFAULT_WARMUP)
  const [compareOn, setCompareOn] = useState(false)
  const [pool, setPool] = useState<PoolKind>("numbers")
  const [numbers, setNumbers] = useState<StackState>(() => defaultStack("numbers"))
  const [stars, setStars] = useState<StackState>(() => defaultStack("stars"))
  const [learn, setLearn] = useState<LearnConfig>(defaultLearn)
  const [lookback, setLookback] = useState<(typeof LOOKBACKS)[number]>(50)
  const [ready, setReady] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const [sampleSeed, setSampleSeed] = useState(1)
  const [tab, selectTab] = useLabTab(PRONOSTIC_TAB_IDS, "atelier")

  useEffect(() => {
    const id = window.setTimeout(() => {
      try {
        const raw = sessionStorage.getItem(PRONOSTIC_SESSION_KEY)
        if (raw) {
          const parsed = JSON.parse(raw) as Partial<StoredPronostic>
          if (parsed.numbers?.kind === "numbers") setNumbers(clampStack(parsed.numbers))
          if (parsed.stars?.kind === "stars") setStars(clampStack(parsed.stars))
          if (parsed.learn?.method) setLearn({ ...defaultLearn(), ...parsed.learn })
          if (parsed.lookback && LOOKBACKS.includes(parsed.lookback as (typeof LOOKBACKS)[number])) {
            setLookback(parsed.lookback as (typeof LOOKBACKS)[number])
          }
          const nextPreset = asWindowPreset(parsed.preset ?? null)
          if (nextPreset) setPreset(nextPreset)
          if (parsed.pool === "stars" || parsed.pool === "numbers") setPool(parsed.pool)
        }
      } catch {
        /* ignore */
      }
      const urlPreset = asWindowPreset(new URLSearchParams(window.location.search).get("preset"))
      if (urlPreset) setPreset(urlPreset)
      setReady(true)
    }, 0)
    return () => window.clearTimeout(id)
  }, [])

  useEffect(() => {
    if (!ready) return
    try {
      const payload: StoredPronostic = { numbers, stars, learn, lookback, preset, pool }
      sessionStorage.setItem(PRONOSTIC_SESSION_KEY, JSON.stringify(payload))
    } catch {
      /* quota */
    }
  }, [numbers, stars, learn, lookback, preset, pool, ready])

  const archive = useMemo(
    () => [...draws].sort((a, b) => a.date.localeCompare(b.date)),
    [draws]
  )
  const resolved = useMemo(() => {
    const parsedN = Number.parseInt(lastN, 10)
    return resolveWindow(archive, {
      preset,
      fromDate: customFrom || undefined,
      toDate: customTo || undefined,
      lastN: Number.isFinite(parsedN) && parsedN > 0 ? parsedN : undefined,
      warmup,
      weekday: weekdayFilterDay(weekday),
    })
  }, [archive, preset, customFrom, customTo, lastN, warmup, weekday])

  const work = resolved.work
  const historyPoints = useMemo(() => {
    const rows = resolved.withWarmup.length ? resolved.withWarmup : archive
    return {
      numbers: pointsFromDraws("numbers", rows),
      stars: pointsFromDraws("stars", rows),
    }
  }, [resolved.withWarmup, archive])
  const workPoints = useMemo(
    () => ({
      numbers: pointsFromDraws("numbers", work),
      stars: pointsFromDraws("stars", work),
    }),
    [work]
  )

  const active = pool === "numbers" ? numbers : stars
  const setActive = pool === "numbers" ? setNumbers : setStars
  const tightActive = useMemo(() => tighten(active), [active])
  const windowStart = Math.max(0, historyPoints[pool].length - workPoints[pool].length)

  const numberCount = useMemo(() => countStack(numbers), [numbers])
  const starCount = useMemo(() => countStack(stars), [stars])
  const grids = numberCount * starCount
  const cascade = useMemo(() => cascadeCounts(active), [active])
  const coverage = useMemo(
    () =>
      walkForwardCoverage(historyPoints[pool], windowStart, lookback, pool, learn),
    [historyPoints, pool, windowStart, lookback, learn]
  )

  const numberSpec = useMemo(() => stackToPoolSpec(numbers), [numbers])
  const starSpec = useMemo(() => stackToPoolSpec(stars), [stars])

  const listed = useMemo(() => {
    if (grids === 0 || grids > LIST_LIMIT) return []
    const nCombos = listPool(numberSpec)
    const sCombos = listPool(starSpec)
    if (nCombos.length === 0 || sCombos.length === 0) return []
    return listGrids(nCombos, sCombos, LIST_LIMIT)
  }, [grids, numberSpec, starSpec])
  const samples = useMemo(() => {
    if (grids === 0 || grids <= LIST_LIMIT) return []
    const nCombos = samplePool(numberSpec, Math.min(SAMPLE_SIZE, Math.max(1, numberCount)), sampleSeed)
    const sCombos = samplePool(starSpec, Math.min(SAMPLE_SIZE, Math.max(1, starCount)), sampleSeed + 17)
    const nLen = Math.max(nCombos.length, 1)
    const sLen = Math.max(sCombos.length, 1)
    const take = Math.min(SAMPLE_SIZE, Math.max(nCombos.length, sCombos.length))
    const gridsOut: Array<{ numbers: number[]; stars: number[] }> = []
    for (let i = 0; i < take; i += 1) {
      const numbers = nCombos[i % nLen]
      const stars = sCombos[i % sLen]
      if (!numbers || !stars) continue
      gridsOut.push({ numbers, stars })
    }
    return gridsOut
  }, [grids, numberSpec, starSpec, numberCount, starCount, sampleSeed])

  const proposal = useMemo(
    () => proposeStack(pool, workPoints[pool], learn, active.parityMode),
    [pool, workPoints, learn, active.parityMode]
  )

  useRegisterCapture(() =>
    packPronostic({
      pool,
      source,
      preset,
      resolved,
      grids,
      numberCount,
      starCount,
      cascade,
      coverage,
      learn,
      diagnostics: tightActive.diagnostics,
      numbers: tighten(numbers).state,
      stars: tighten(stars).state,
    })
  )

  function applyHistoric(next: {
    numbers: StackState
    stars: StackState
    learn: LearnConfig
    lookback: (typeof LOOKBACKS)[number]
  }) {
    setNumbers(clampStack(next.numbers))
    setStars(clampStack(next.stars))
    setLearn(next.learn)
    setLookback(next.lookback)
    setPool("numbers")
    const margin = next.learn.k.toLocaleString("fr-FR", { maximumFractionDigits: 2 })
    setNote(
      `Prévision du prochain tirage appliquée : ${next.lookback} tirages d’avant, marge ${margin} σ. Ce tirage n’entre pas dans le calcul.`
    )
    selectTab("atelier")
  }

  function patchActive(patch: Partial<StackState>) {
    setActive(clampStack({ ...active, ...patch }))
  }

  function applyLearn() {
    setActive(applyProposal(active, proposal))
    setNote(`Proposition appliquée (${ENVELOPE_METHOD_LABELS[learn.method]}).`)
  }

  async function importSpecialists() {
    try {
      const listedSpecs = await listSpecialists()
      const items = listedSpecs.items ?? []
      const sumHit = items.find((item) => specialistMatches(item, "sum"))
      const parityHit = items.find((item) => specialistMatches(item, "parity"))
      if (!sumHit && !parityHit) {
        setNote("Aucun spécialiste somme / parité enregistré.")
        return
      }
      const notes: string[] = []
      if (sumHit) {
        const rec = await inferSpecialist(sumHit.slug)
        const forecast = rec.forecast ?? rec.last_forecast
        const value = forecast?.value
        const sigma = forecast?.sigma ?? 0
        if (typeof value === "number" && Number.isFinite(value)) {
          const lo = Math.round(value - (Number.isFinite(sigma) ? sigma : 0))
          const hi = Math.round(value + (Number.isFinite(sigma) ? sigma : 0))
          setNumbers((prev) =>
            clampStack({
              ...prev,
              minSum: lo,
              maxSum: hi,
            })
          )
          notes.push(`somme ${lo}–${hi}`)
        }
      }
      if (parityHit) {
        const rec = await inferSpecialist(parityHit.slug)
        const forecast = rec.forecast ?? rec.last_forecast
        const value = forecast?.class_id ?? forecast?.value
        if (typeof value === "number" && Number.isFinite(value)) {
          const even = Math.min(5, Math.max(0, Math.round(value)))
          setNumbers((prev) =>
            clampStack({
              ...prev,
              minEven: even,
              maxEven: even,
              parityMode: "anticipated",
            })
          )
          notes.push(`${even} pairs`)
        }
      }
      setNote(notes.length ? `Spécialistes : ${notes.join(" · ")}.` : "Forecasts inexploitables (pas une somme / un nombre de pairs).")
    } catch (error) {
      setNote(error instanceof Error ? error.message : "Spécialistes injoignables.")
    }
  }

  function sendToJeux() {
    writeStoredSpec(stacksToStoredSpec(numbers, stars))
    router.push("/jeux")
  }

  async function consignGrid(grid: { numbers: number[]; stars: number[] }) {
    const playDate = nextPlayDate()
    const result = await persistPlays({
      play_date: playDate,
      items: [
        {
          ...grid,
          label: "Pronostic",
          source: "pronostic",
          spec: stacksToStoredSpec(numbers, stars),
        },
      ],
    })
    if (result.items.length === 0) {
      setNote(result.error)
      return
    }
    setNote(`Consigné pour le ${formatPlayDate(playDate)}. Voir le journal.`)
  }

  const solutions = listed.length > 0 ? listed : samples
  const tightSlots = tightActive.state.slots
  const sums = pool === "numbers"
    ? { min: 15, max: 240 }
    : { min: 3, max: 23 }
  const draw = pool === "numbers" ? 5 : 2
  const impossible = isImpossible(tightActive.state)

  return (
    <div className={tab === "atelier" ? "flex min-w-0 flex-col gap-6 pb-28" : "flex min-w-0 flex-col gap-6"}>
      <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
        <TitleHelp help={HELP.banner}>Pronostic</TitleHelp> pose une hypothèse
        de lecture sur l’univers 5+2. L’atelier compte les grilles restantes.
        L’historique note chaque tirage passé avec une marge annoncée à
        l’avance, et compte la mise en grilles. Ce n’est pas P(grille).
      </p>
      <PillTabs
        idPrefix="pronostic"
        label="Pronostic"
        value={tab}
        onValueChange={selectTab}
        items={TABS}
      />
      <PillTabPanel idPrefix="pronostic" tab={tab}>
        {tab === "historic" ? (
          <HistoricPanel
            draws={archive}
            source={source}
            weekday={weekday}
            onApply={applyHistoric}
          />
        ) : (
          <div className="flex min-w-0 flex-col gap-6">
      <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
        Trois couches (somme, rangs/parité, espaces) se resserrent. Le nombre
        affiché est le volume restant, pas une chance de gain.
      </p>
      <WindowBar
        window={resolved}
        preset={preset}
        fromDate={customFrom}
        toDate={customTo}
        lastN={lastN}
        warmup={warmup}
        compareOn={compareOn}
        showCompare={false}
        onPreset={setPreset}
        onFrom={setCustomFrom}
        onTo={setCustomTo}
        onLastN={setLastN}
        onWarmup={setWarmup}
        onCompare={setCompareOn}
      />
      {weekday === "synthese" ? <WeekdaySynthesisCard draws={draws} /> : null}

      <div className="flex flex-wrap gap-2">
        <OverlayToggle
          label="Numéros"
          on={pool === "numbers"}
          onClick={() => setPool("numbers")}
          help={{ title: "Numéros", body: "Pile des 5 statistiques d’ordre n1–n5." }}
        />
        <OverlayToggle
          label="Étoiles"
          on={pool === "stars"}
          onClick={() => setPool("stars")}
          help={{ title: "Étoiles", body: "Même cascade pour e1–e2 (somme 3–23)." }}
        />
      </div>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <p className="text-xs tracking-wide text-muted-foreground uppercase">
              Solutions 5+2
            </p>
            <CardTitle className="text-lg tabular-nums">{formatCount(grids)}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <p className="text-xs tracking-wide text-muted-foreground uppercase">
              Comb. n° × étoiles
            </p>
            <CardTitle className="text-lg tabular-nums">
              {formatCount(numberCount)} × {formatCount(starCount)}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <p className="text-xs tracking-wide text-muted-foreground uppercase">
              1 sur
            </p>
            <CardTitle className="text-lg tabular-nums">
              {formatOneIn(grids > 0 ? TOTAL_GRIDS / grids : null)}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <p className="text-xs tracking-wide text-muted-foreground uppercase">
              <TitleHelp help={HELP.cascade}>Cascade</TitleHelp>
            </p>
            <CardTitle className="text-sm font-normal">
              <ol className="flex flex-col gap-0.5 text-xs tabular-nums text-muted-foreground">
                {cascade.map((step) => (
                  <li key={step.id}>
                    {step.label} · {formatCount(step.count)}
                  </li>
                ))}
              </ol>
            </CardTitle>
          </CardHeader>
        </Card>
      </section>

      {tightActive.diagnostics.length > 0 ? (
        <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {tightActive.diagnostics[0]}
        </p>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>
            <TitleHelp help={HELP.learn}>Proposeur d’enveloppes</TitleHelp>
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <LabelHelp label="Formule" help={HELP.learn}>
              <Select
                value={learn.method}
                onValueChange={(value) =>
                  setLearn((prev) => ({ ...prev, method: value as EnvelopeMethod }))
                }
              >
                <SelectTrigger className="w-full" aria-label="Formule d’enveloppe">
                  <span className="flex flex-1 text-left">{ENVELOPE_METHOD_LABELS[learn.method]}</span>
                </SelectTrigger>
                <SelectContent>
                  {ENVELOPE_METHODS.map((method) => (
                    <SelectItem key={method} value={method}>
                      {ENVELOPE_METHOD_LABELS[method]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </LabelHelp>
            <RangeField
              label={`k · σ (${learn.k.toFixed(1)})`}
              help={HELP.learn}
              min={0}
              max={30}
              value={Math.round(learn.k * 10)}
              onChange={(value) => setLearn((prev) => ({ ...prev, k: value / 10 }))}
              display={learn.k.toFixed(1)}
              ariaLabel="Multiplicateur d’écart-type"
            />
            <RangeField
              label={`Percentile ${learn.percentile} %`}
              help={HELP.learn}
              min={0}
              max={25}
              value={learn.percentile}
              onChange={(value) => setLearn((prev) => ({ ...prev, percentile: value }))}
              display={`${learn.percentile}%`}
              ariaLabel="Queue percentile"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted-foreground">Lookback</span>
            {LOOKBACKS.map((item) => (
              <Button
                key={item}
                type="button"
                size="sm"
                variant={lookback === item ? "default" : "outline"}
                onClick={() => setLookback(item)}
              >
                {item}
              </Button>
            ))}
          </div>
          <p className="text-sm text-muted-foreground">
            {proposalSummary(pool, proposal)}
          </p>
          <p className="text-xs tabular-nums text-muted-foreground">
            <TitleHelp help={HELP.coverage}>Walk-forward</TitleHelp> :{" "}
            {coverage.n
              ? `${formatPct(coverage.rate)} de hits sur ${coverage.n} · volume moyen ${formatPct(coverage.meanVolume, 2)}`
              : "pas assez d’historique avant la fenêtre."}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={applyLearn}>
              Appliquer les propositions
            </Button>
            <Button type="button" variant="outline" onClick={() => void importSpecialists()}>
              Importer les spécialistes
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setActive(defaultStack(pool))}
            >
              Reset {pool === "numbers" ? "numéros" : "étoiles"}
            </Button>
          </div>
          {learn.method === "minmax_std" ? (
            <Disclaimer>
              min/max + k·σ élargit l’enveloppe observée. Les percentiles la resserrent.
            </Disclaimer>
          ) : null}
        </CardContent>
      </Card>

      {active.layers.map((layer, index) => (
        <Card key={layer.id} className={cn(!layer.enabled && "opacity-70")}>
          <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2">
            <CardTitle>
              <TitleHelp help={LAYER_HELP[layer.id]}>
                {index + 1}. {layer.label}
              </TitleHelp>
            </CardTitle>
            <div className="flex flex-wrap gap-1">
              <Button
                type="button"
                size="xs"
                variant="outline"
                disabled={index === 0}
                onClick={() => setActive(moveLayer(active, layer.id, -1))}
              >
                Haut
              </Button>
              <Button
                type="button"
                size="xs"
                variant="outline"
                disabled={index === active.layers.length - 1}
                onClick={() => setActive(moveLayer(active, layer.id, 1))}
              >
                Bas
              </Button>
              <Button
                type="button"
                size="xs"
                variant={layer.enabled ? "default" : "outline"}
                onClick={() => setActive(setLayerEnabled(active, layer.id, !layer.enabled))}
              >
                {layer.enabled ? "On" : "Off"}
              </Button>
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {layer.id === "sum" ? (
              <>
                <MiniHistogram
                  values={workPoints[pool].map((point) => point.sum)}
                  min={sums.min}
                  max={sums.max}
                  lo={active.minSum}
                  hi={active.maxSum}
                  label="Sommes de la fenêtre"
                />
                <div className="grid gap-3 lg:grid-cols-2">
                  <RangeField
                    label="Somme mini"
                    help={LAYER_HELP.sum}
                    min={sums.min}
                    max={sums.max}
                    value={active.minSum}
                    onChange={(value) => patchActive({ minSum: value })}
                    display={String(active.minSum)}
                    ariaLabel="Somme minimale"
                  />
                  <RangeField
                    label="Somme maxi"
                    help={LAYER_HELP.sum}
                    min={sums.min}
                    max={sums.max}
                    value={active.maxSum}
                    onChange={(value) => patchActive({ maxSum: value })}
                    display={String(active.maxSum)}
                    ariaLabel="Somme maximale"
                  />
                </div>
              </>
            ) : null}
            {layer.id === "parity" ? (
              <>
                <div className="flex flex-wrap gap-2">
                  <OverlayToggle
                    label="Observé"
                    on={active.parityMode === "observed"}
                    onClick={() => patchActive({ parityMode: "observed" satisfies ParityMode })}
                    help={HELP.parityMode}
                  />
                  <OverlayToggle
                    label="Anticipé"
                    on={active.parityMode === "anticipated"}
                    onClick={() => patchActive({ parityMode: "anticipated" })}
                    help={HELP.parityMode}
                  />
                </div>
                <div className="grid gap-3 lg:grid-cols-2">
                  <RangeField
                    label="Pairs mini"
                    help={LAYER_HELP.parity}
                    min={0}
                    max={draw}
                    value={active.minEven}
                    onChange={(value) => patchActive({ minEven: value, parityMode: "anticipated" })}
                    display={`${active.minEven}p`}
                    ariaLabel="Nombre minimal de pairs"
                  />
                  <RangeField
                    label="Pairs maxi"
                    help={LAYER_HELP.parity}
                    min={0}
                    max={draw}
                    value={active.maxEven}
                    onChange={(value) => patchActive({ maxEven: value, parityMode: "anticipated" })}
                    display={`${active.maxEven}p`}
                    ariaLabel="Nombre maximal de pairs"
                  />
                </div>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
                  {Array.from({ length: draw }, (_, i) => (
                    <div key={i} className="rounded-md border border-border px-2 py-1">
                      <p className="text-[10px] text-muted-foreground">
                        {rankLabel(pool, i)}
                      </p>
                      <Sparkline
                        values={workPoints[pool].map((point) => point.ranks[i])}
                        label={rankTitle(pool, i)}
                      />
                    </div>
                  ))}
                </div>
              </>
            ) : null}
            {layer.id === "slots" ? (
              <>
                <TitleHelp help={HELP.slots}>
                  <span className="sr-only">Espaces</span>
                </TitleHelp>
                <SlotTrack kind={pool} slots={tightSlots} />
                <p className="text-[10px] tabular-nums text-muted-foreground">
                  Effectif après resserrage :{" "}
                  {tightSlots.map((band, i) => `${rankLabel(pool, i)} ${band.lo}–${band.hi}`).join(" · ")}
                </p>
                <div className="flex flex-col gap-3">
                  {active.slots.map((band, i) => (
                    <div key={i} className="grid gap-2 lg:grid-cols-2">
                      <RangeField
                        label={`${rankLabel(pool, i)} mini`}
                        help={LAYER_HELP.slots}
                        min={1}
                        max={poolSize(pool)}
                        value={band.lo}
                        onChange={(value) => {
                          const slots = active.slots.map((item, j) =>
                            j === i ? { ...item, lo: value } : item
                          )
                          patchActive({ slots })
                        }}
                        display={String(band.lo)}
                        ariaLabel={`${rankTitle(pool, i)} minimum`}
                      />
                      <RangeField
                        label={`${rankLabel(pool, i)} maxi`}
                        help={LAYER_HELP.slots}
                        min={1}
                        max={poolSize(pool)}
                        value={band.hi}
                        onChange={(value) => {
                          const slots = active.slots.map((item, j) =>
                            j === i ? { ...item, hi: value } : item
                          )
                          patchActive({ slots })
                        }}
                        display={String(band.hi)}
                        ariaLabel={`${rankTitle(pool, i)} maximum`}
                      />
                    </div>
                  ))}
                </div>
              </>
            ) : null}
          </CardContent>
        </Card>
      ))}

      <Card>
        <CardHeader>
          <CardTitle>Grilles</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-2">
            <HelpWrap help={HELP.handoff}>
              <Button type="button" variant="outline" onClick={sendToJeux}>
                Envoyer vers Jeux
              </Button>
            </HelpWrap>
            <Button type="button" variant="outline" onClick={() => router.push("/jeux?tab=histoJeux")}>
              Journal
            </Button>
            {grids > LIST_LIMIT ? (
              <Button type="button" variant="outline" onClick={() => setSampleSeed((n) => n + 1)}>
                Autre échantillon
              </Button>
            ) : null}
          </div>
          {impossible || grids === 0 ? (
            <p className="text-sm text-muted-foreground">
              Aucune grille 5+2 dans ces bornes.
            </p>
          ) : solutions.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {formatCount(grids)} solutions — liste sous 50, sinon échantillon uniforme.
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {solutions.map((grid) => (
                <li
                  key={`${grid.numbers.join("-")}-${grid.stars.join("-")}`}
                  className="flex flex-col gap-2 rounded-lg border border-border px-3 py-2 sm:flex-row sm:items-center sm:justify-between"
                >
                  <DrawBalls numbers={grid.numbers} stars={grid.stars} />
                  <HelpWrap help={HELP.consign}>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => void consignGrid(grid)}
                    >
                      Consigner
                    </Button>
                  </HelpWrap>
                </li>
              ))}
            </ul>
          )}
          {note ? <p className="text-sm text-muted-foreground">{note}</p> : null}
          <Disclaimer>
            {formatWindowBanner(resolved)} · source {source}. Hypothèse de lecture,
            tirage officiel uniforme.
          </Disclaimer>
        </CardContent>
      </Card>

      <div
        className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/95 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur"
        role="status"
        aria-live="polite"
      >
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-baseline justify-between gap-2 px-4 py-3 sm:px-6">
          <p className="text-sm font-medium tabular-nums">
            {formatCount(grids)} solution{grids === 1 ? "" : "s"}
          </p>
          <p className="text-xs text-muted-foreground tabular-nums">
            {grids === 0
              ? tightActive.diagnostics[0] || "Aucune grille 5+2 dans ces bornes."
              : `${formatCount(numberCount)} comb. n° × ${formatCount(starCount)} comb. ★ · 1 sur ${formatOneIn(
                  TOTAL_GRIDS / grids
                )} · ${formatPct(grids / TOTAL_GRIDS, 3)} de l’univers`}
          </p>
        </div>
      </div>
          </div>
        )}
      </PillTabPanel>
    </div>
  )
}
