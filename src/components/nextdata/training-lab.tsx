"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { CartesianGrid, Line, LineChart, ReferenceLine, XAxis, YAxis } from "recharts"

import { HelpTip, HelpWrap, TitleHelp } from "@/components/help"
import { PersistArchive, PersistControl, PersistPairCard } from "@/components/nextdata/persist-panel"
import { RankPath } from "@/components/nextdata/rank-path"
import { StepMeter } from "@/components/nextdata/step-meter"
import { TrainingCompare } from "@/components/nextdata/training-compare"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"
import { DRAWS, type Draw } from "@/lib/draws"
import { chronosBanner, type ChronosStatus } from "@/lib/nextdata/chronos"
import { NEXTDATA_HELP, NEXTDATA_TRAINING_HELP } from "@/lib/nextdata/help"
import {
  pairPersist,
  persistKey,
  radiusLabel,
  type PersistHeld,
  type PersistInfo,
  type PersistSetting,
  type PersistSwap,
} from "@/lib/nextdata/persist"
import type { Arbitration } from "@/lib/nextdata/rank-path"
import { progressPercent, type StepProgress } from "@/lib/nextdata/bands"
import { formatDecimal } from "@/lib/nextdata/compare"
import { bandCoverage, deltaNumbers, TRAINING_SHIFT_TOTAL, visibleTrainingShift } from "@/lib/nextdata/training-progress"
import {
  coverageRange,
  formatCoverage,
  hitsWord,
  maeInterval,
  versusText,
  type HitsChance,
  type MeanInterval,
  type PairedGap,
  type Verdict,
} from "@/lib/nextdata/uncertainty"
import { cn } from "@/lib/utils"

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

const READINGS = [
  { id: "corpus", label: "LightGBM · trois ans", color: "var(--chart-1)", grid: true },
  { id: "fenetre", label: "LightGBM · fenêtre", color: "var(--chart-2)", grid: true },
  { id: "corpus_catboost", label: "CatBoost · trois ans", color: "var(--chart-3)", grid: true },
  { id: "fenetre_catboost", label: "CatBoost · fenêtre", color: "var(--chart-4)", grid: true },
  { id: "persistence", label: "Persistance", color: "var(--foreground)", grid: true },
  { id: "mean", label: "Moyenne", color: "var(--muted-foreground)", grid: false },
] as const

type ReadingId = (typeof READINGS)[number]["id"]

const BENCHMARKS = [
  { id: "mean", label: "la moyenne" },
  { id: "persistence", label: "la persistance" },
] as const

const VERDICT_TONE: Record<Verdict, string> = {
  lower: "text-chart-2",
  higher: "text-destructive",
  undecided: "text-muted-foreground",
}

const CHART: ChartConfig = {
  corpus: { label: "LightGBM trois ans", color: "var(--chart-1)" },
  fenetre: { label: "LightGBM fenêtre", color: "var(--chart-2)" },
  corpus_catboost: { label: "CatBoost trois ans", color: "var(--chart-3)" },
  fenetre_catboost: { label: "CatBoost fenêtre", color: "var(--chart-4)" },
  persistence: { label: "Persistance", color: "var(--foreground)" },
  mean: { label: "Moyenne", color: "var(--muted-foreground)" },
  persist: { label: "Persist", color: "var(--chart-5)" },
}

const RANK_ROWS = [
  { key: "n1", label: "n1" },
  { key: "n2", label: "n2" },
  { key: "n3", label: "n3" },
  { key: "n4", label: "n4" },
  { key: "n5", label: "n5" },
  { key: "e1", label: "e1" },
  { key: "e2", label: "e2" },
  { key: "sum", label: "sum" },
  { key: "spread", label: "étendue" },
  { key: "consecutive", label: "consécutifs" },
  { key: "star_spread", label: "étendue ★" },
  { key: "star_consecutive", label: "consécutifs ★" },
] as const

type Side = {
  numbers: number[]
  stars: number[]
  errors: Record<string, number | null>
  in_band: Record<string, boolean | null>
  in_band_raw?: Record<string, boolean | null>
  calibrated?: boolean
  calibration_steps?: number
  hits_numbers: number | null
  hits_stars: number | null
  arbitration?: Arbitration | null
  swaps?: PersistSwap[]
  held?: PersistHeld | null
}

type Shift = {
  x: number
  label: string
  date: string
  actual: { numbers: number[]; stars: number[]; sum: number | null }
  readings: Record<string, Side>
}

type Summary = Record<
  string,
  {
    mae_sum: number | null
    mae_sum_ci?: MeanInterval
    hits_numbers: number | null
    hits_stars?: number | null
    hits_chance?: HitsChance
    versus?: Record<string, PairedGap>
    count: number
  }
>

type TrainingPayload = {
  ok: boolean
  error?: string
  focus?: number
  years_present?: string[]
  catboost?: boolean
  chronos?: ChronosStatus
  shifts?: Shift[]
  summary?: Summary
  estimators?: number
  progress?: StepProgress
  persist?: PersistInfo | null
}

function tone(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "transparent"
  const strength = Math.max(0, Math.min(70, Math.abs(value) * 4))
  const mix = value > 0 ? "var(--destructive)" : "var(--chart-2)"
  return `color-mix(in oklch, ${mix} ${strength}%, var(--muted))`
}

export function TrainingLab() {
  const [draws, setDraws] = useState<Draw[]>(DRAWS)
  const [source, setSource] = useState("json")
  const [focus, setFocus] = useState<50 | 100>(50)
  const [years, setYears] = useState<string[]>(["n", "n-1", "n-2"])
  const [weekday, setWeekday] = useState<"tous" | "mardi" | "vendredi">("tous")
  const [families, setFamilies] = useState<string[]>(FAMILIES.map((item) => item.id))
  const [withChronos, setWithChronos] = useState(false)
  const [delta, setDelta] = useState(false)
  const [persistSetting, setPersistSetting] = useState<PersistSetting | null>(null)
  const [reading, setReading] = useState<ReadingId>("corpus")
  const [pinnedShift, setPinnedShift] = useState<number | null>(null)
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState<StepProgress | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [report, setReport] = useState<TrainingPayload | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const response = await fetch("/api/draws?era=current", { cache: "no-store" })
        if (cancelled || !response.ok) return
        const body = (await response.json()) as { items?: Draw[]; source?: string }
        if (Array.isArray(body.items) && body.items.length >= 24) {
          setDraws(body.items)
          setSource(body.source || "neon")
        }
      } catch {
        /* le jeu embarqué reste affiché */
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    return () => abortRef.current?.abort()
  }, [])

  const chartRows = useMemo(() => {
    const rows = (report?.shifts ?? []).map((shift) => {
      const row: Record<string, string | number | null> = { label: shift.label, x: shift.x }
      for (const item of READINGS) {
        row[item.id] = shift.readings[item.id]?.errors.sum ?? null
      }
      row.persist = shift.readings[persistKey(reading)]?.errors.sum ?? null
      return row
    })
    if (!delta) return rows
    const keys = [...READINGS.map((item) => item.id), "persist"]
    const differed = deltaNumbers(rows.map((row) => keys.map((key) => (typeof row[key] === "number" ? row[key] : null))))
    return rows.map((row, index) => {
      const next = { ...row }
      keys.forEach((key, column) => {
        next[key] = differed[index][column]
      })
      return next
    })
  }, [report, delta, reading])

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

  async function train() {
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    setRunning(true)
    setError(null)
    setReport(null)
    setPinnedShift(null)
    setProgress(null)
    const body = JSON.stringify({
      focus,
      years,
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
        const response = await fetch("/api/nextdata/training", {
          method: "POST",
          headers: { "content-type": "application/json" },
          signal: controller.signal,
          body,
        })
        const payload = (await response.json()) as TrainingPayload
        if (!response.ok || payload.ok === false) {
          setError(payload.error || "L’entraînement n’a pas abouti.")
          return
        }
        if (payload.catboost === false && (reading === "corpus_catboost" || reading === "fenetre_catboost")) {
          setReading("corpus")
        }
        setReport(payload)
        const step = payload.progress ?? null
        setProgress(step)
        if (!step || step.complete) return
        if (step.ready <= ready) {
          setError("Le calcul n’avance plus : un pas échoue à chaque tranche.")
          return
        }
        ready = step.ready
      }
    } catch (err) {
      if (controller.signal.aborted) return
      setError(err instanceof Error ? err.message : "API injoignable")
    } finally {
      if (abortRef.current === controller) {
        setRunning(false)
        setProgress(null)
      }
    }
  }

  function stop() {
    abortRef.current?.abort()
    abortRef.current = null
    setRunning(false)
    setProgress(null)
  }

  const percent = progressPercent(progress)

  const summary = report?.summary ?? {}
  const activeShift = visibleTrainingShift(report?.shifts ?? [], pinnedShift)
  const pathTrace = activeShift?.readings[reading]?.arbitration
  const shifts = report?.shifts ?? []
  const calibrationSteps = shifts.flatMap((shift) => {
    const side = shift.readings[reading]
    return side?.calibrated && side.calibration_steps ? [side.calibration_steps] : []
  })
  const persistInfo = report?.persist ?? null
  const readingLabel = READINGS.find((item) => item.id === reading)?.label
  const persistPair = useMemo(
    () =>
      report?.persist
        ? pairPersist(
            (report.shifts ?? []).map((shift) => ({
              actual: shift.actual,
              raw: shift.readings[reading],
              persist: shift.readings[persistKey(reading)],
            }))
          )
        : null,
    [report, reading]
  )

  return (
    <div className="flex min-w-0 flex-col gap-6" data-nextdata-training>
      <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
        <TitleHelp help={NEXTDATA_TRAINING_HELP.banner}>nextDataTraining</TitleHelp> recule de 1 à 10
        tirages. L’écart est prévu moins sorti. La persistance rejoue le tirage d’avant, la moyenne prévoit la
        somme moyenne d’avant. Ce n’est pas un ticket.
      </p>

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
            <HelpWrap help={NEXTDATA_TRAINING_HELP.chronos}>
              <Button type="button" size="sm" variant={withChronos ? "secondary" : "ghost"} onClick={() => setWithChronos((value) => !value)}>
                {withChronos ? "Chronos inclus" : "Sans Chronos"}
              </Button>
            </HelpWrap>
            <HelpWrap help={NEXTDATA_TRAINING_HELP.delta}>
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
            <Button type="button" disabled={running} onClick={() => void train()}>
              {running ? (progress ? `Pas ${progress.ready} sur ${progress.total}…` : "Premiers décalages…") : "Entraîner"}
            </Button>
            {running && (
              <Button type="button" size="sm" variant="ghost" onClick={stop}>
                Arrêter
              </Button>
            )}
            <span className="text-xs text-muted-foreground">
              {draws.length} tirages · {source === "neon" ? "archive synchronisée" : "jeu embarqué"}
            </span>
          </div>
          {running && (
            <StepMeter
              percent={percent}
              ariaLabel="Avancement de l’entraînement"
              label={
                !progress
                  ? "Les décalages −1, −2… partent d’abord"
                  : (report?.shifts?.length ?? 0) < TRAINING_SHIFT_TOTAL
                    ? `Pas ${progress.ready} sur ${progress.total} : les décalages d’abord`
                    : `Pas ${progress.ready} sur ${progress.total} : les tirages d’avant, pour le calibrage`
              }
            />
          )}
          {error && <p className="text-sm text-destructive">{error}</p>}
        </CardContent>
      </Card>

      {!report && !running && (
        <p className="text-sm text-muted-foreground">Lancez l’entraînement pour voir les dix écarts.</p>
      )}

      {report?.shifts && (
        <>
          {chronosBanner(report.chronos) && <p className="text-sm text-muted-foreground">{chronosBanner(report.chronos)}</p>}
          <div className="flex flex-wrap items-start gap-3">
            {READINGS.filter((item) => summary[item.id]).map((item) => {
              const entry = summary[item.id]
              const mae = entry?.mae_sum
              const interval = maeInterval(entry?.mae_sum_ci)
              const body = (
                <>
                  <span className="block text-xs text-muted-foreground">{item.label}</span>
                  <span className="text-lg font-semibold tabular-nums">{mae == null ? "—" : formatDecimal(mae)}</span>
                  <span className="mt-1 block text-xs text-muted-foreground">
                    MAE somme{interval ? ` · ${interval}` : ""}
                    {report?.chronos?.used && (item.id === "corpus" || item.id === "fenetre") ? " · Chronos" : ""}
                    {entry?.hits_numbers != null ? ` · ${hitsWord(entry.hits_numbers, "numéro", "numéros")}` : ""}
                  </span>
                  {BENCHMARKS.filter((rival) => rival.id !== item.id).map((rival) => {
                    const gap = entry?.versus?.[rival.id]
                    return (
                      <span
                        key={rival.id}
                        data-versus={rival.id}
                        className={cn("block text-xs tabular-nums", gap?.verdict ? VERDICT_TONE[gap.verdict] : "text-muted-foreground")}
                      >
                        contre {rival.label} : {versusText(gap)}
                      </span>
                    )
                  })}
                </>
              )
              if (!item.grid) {
                return (
                  <div key={item.id} className="rounded-xl border border-dashed border-border px-3 py-2 text-left">
                    {body}
                  </div>
                )
              }
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setReading(item.id)}
                  className={cn(
                    "rounded-xl border px-3 py-2 text-left",
                    reading === item.id ? "border-primary bg-primary/5" : "border-border"
                  )}
                >
                  {body}
                </button>
              )
            })}
            <span className="self-center">
              <HelpTip {...NEXTDATA_TRAINING_HELP.verdicts} />
            </span>
          </div>

          {persistInfo && (
            <div className="grid gap-4 lg:grid-cols-2" data-training-persist>
              {persistPair ? (
                <PersistPairCard
                  summary={persistPair}
                  help={NEXTDATA_TRAINING_HELP.persist}
                  title={`Persist ${radiusLabel(persistInfo.radius)} · ${readingLabel ?? reading}`}
                />
              ) : null}
              {persistInfo.base ? (
                <PersistArchive base={persistInfo.base} radius={persistInfo.radius} help={NEXTDATA_HELP.persistArchive} />
              ) : null}
            </div>
          )}

          {activeShift ? (
            <Card>
              <CardContent>
                <p className="mb-3 text-xs text-muted-foreground" data-path-shift={activeShift.x}>
                  Décalage {activeShift.label}
                  {activeShift.date ? ` · ${activeShift.date}` : ""}
                  {pinnedShift == null ? " · suit la mesure" : " · fixé"}
                </p>
                {pathTrace ? (
                  <RankPath key={`${reading}-${activeShift.x}`} help={NEXTDATA_HELP.chemin} trace={pathTrace} />
                ) : (
                  <p className="text-sm text-muted-foreground">Cette lecture ne détaille pas le calcul des rangs.</p>
                )}
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                <TitleHelp help={NEXTDATA_TRAINING_HELP.somme}>
                  {delta ? "Écart de somme · Δ" : "Écart de somme"}
                </TitleHelp>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ChartContainer config={CHART} className="aspect-[2.2/1] h-64 w-full">
                <LineChart data={chartRows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} width={36} />
                  <ReferenceLine y={0} stroke="var(--foreground)" strokeDasharray="3 3" />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  {READINGS.map((item) => (
                    <Line
                      key={item.id}
                      type="monotone"
                      dataKey={item.id}
                      name={item.label}
                      stroke={`var(--color-${item.id})`}
                      strokeWidth={reading === item.id ? 2.4 : 1.2}
                      dot={{ r: reading === item.id ? 3 : 2 }}
                      connectNulls
                    />
                  ))}
                  {persistInfo ? (
                    <Line
                      type="monotone"
                      dataKey="persist"
                      name={`${readingLabel ?? reading} · Persist ${radiusLabel(persistInfo.radius)}`}
                      stroke={`var(--color-${reading})`}
                      strokeDasharray="4 3"
                      strokeWidth={2}
                      dot={{ r: 2 }}
                      connectNulls
                    />
                  ) : null}
                </LineChart>
              </ChartContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                <TitleHelp help={NEXTDATA_TRAINING_HELP.rangs}>
                  Rangs · {READINGS.find((item) => item.id === reading)?.label}
                </TitleHelp>
              </CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full min-w-[36rem] border-separate border-spacing-1 text-center text-xs tabular-nums">
                <thead>
                  <tr>
                    <th className="text-left font-medium text-muted-foreground">
                      <HelpTip {...NEXTDATA_TRAINING_HELP.decalage} />
                    </th>
                    {report.shifts.map((shift) => (
                      <th key={shift.x}>
                        <button
                          type="button"
                          aria-pressed={activeShift?.x === shift.x}
                          onClick={() => setPinnedShift((current) => (current === shift.x ? null : shift.x))}
                          className={cn(
                            "rounded-md px-1.5 py-0.5 font-medium",
                            activeShift?.x === shift.x ? "bg-primary/10 text-foreground" : "text-muted-foreground"
                          )}
                        >
                          {shift.label}
                        </button>
                      </th>
                    ))}
                    <th
                      className="pl-2 font-medium text-muted-foreground"
                      title="tirages dans la bande 10–90 du modèle, puis l’intervalle à 95 % de cette part"
                    >
                      Brute
                    </th>
                    <th
                      className="pl-2 font-medium text-muted-foreground"
                      title="tirages dans la bande calibrée sur les tirages d’avant, puis l’intervalle à 95 % de cette part"
                    >
                      Calibrée
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {RANK_ROWS.map((field) => {
                    const raw = bandCoverage(shifts, reading, field.key, "raw")
                    const calibrated = bandCoverage(shifts, reading, field.key, "calibrated")
                    return (
                      <tr key={field.key}>
                        <th className="pr-2 text-left font-medium text-muted-foreground">{field.label}</th>
                        {shifts.map((shift) => {
                          const side = shift.readings[reading]
                          const value = side?.errors[field.key]
                          const covered = side?.in_band[field.key]
                          return (
                            <td
                              key={`${field.key}-${shift.x}`}
                              className="rounded-md px-1 py-1.5"
                              style={{ background: tone(value) }}
                              title={covered ? (side?.calibrated ? "dans la bande 10–90 calibrée" : "dans la bande 10–90 brute") : undefined}
                            >
                              {value == null ? "—" : value > 0 ? `+${value}` : value}
                              {covered ? " ·" : ""}
                            </td>
                          )
                        })}
                        {[raw, calibrated].map((measured, column) => (
                          <td
                            key={column}
                            className="pl-2 text-muted-foreground"
                            aria-label={measured.total ? formatCoverage(measured.inside, measured.total) : undefined}
                          >
                            {measured.total ? (
                              <>
                                <span className="block">{`${measured.inside}/${measured.total}`}</span>
                                <span className="block whitespace-nowrap text-[10px]">
                                  {coverageRange(measured.inside, measured.total)}
                                </span>
                              </>
                            ) : (
                              "—"
                            )}
                          </td>
                        ))}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              {calibrationSteps.length > 0 && (
                <p className="mt-2 text-xs text-muted-foreground">
                  Bandes calibrées sur{" "}
                  {Math.min(...calibrationSteps) === Math.max(...calibrationSteps)
                    ? calibrationSteps[0]
                    : `${Math.min(...calibrationSteps)} à ${Math.max(...calibrationSteps)}`}{" "}
                  tirages du focus : ceux qui précèdent chaque décalage.
                  {report.estimators ? ` Même réglage que le pronostic : ${report.estimators} arbres.` : ""}
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                <TitleHelp help={NEXTDATA_TRAINING_HELP.boules}>
                  Prévu et sorti · {READINGS.find((item) => item.id === reading)?.label}
                </TitleHelp>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <TrainingCompare
                shifts={report.shifts}
                reading={reading}
                chance={summary[reading]?.hits_chance}
                twinChance={summary[persistKey(reading)]?.hits_chance}
              />
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
