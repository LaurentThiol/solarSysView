"use client"

import { useEffect, useMemo, useState } from "react"
import { CartesianGrid, Line, LineChart, ReferenceLine, XAxis, YAxis } from "recharts"

import { HelpTip, TitleHelp } from "@/components/help"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"
import { DRAWS, type Draw } from "@/lib/draws"
import { NEXTDATA_HELP, NEXTDATA_TRAINING_HELP } from "@/lib/nextdata/help"
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
  { id: "corpus", label: "LightGBM · trois ans", color: "var(--chart-1)" },
  { id: "fenetre", label: "LightGBM · fenêtre", color: "var(--chart-2)" },
  { id: "corpus_catboost", label: "CatBoost · trois ans", color: "var(--chart-3)" },
  { id: "fenetre_catboost", label: "CatBoost · fenêtre", color: "var(--chart-4)" },
  { id: "persistence", label: "Persistance", color: "var(--foreground)" },
] as const

type ReadingId = (typeof READINGS)[number]["id"]

const CHART: ChartConfig = {
  corpus: { label: "LightGBM trois ans", color: "var(--chart-1)" },
  fenetre: { label: "LightGBM fenêtre", color: "var(--chart-2)" },
  corpus_catboost: { label: "CatBoost trois ans", color: "var(--chart-3)" },
  fenetre_catboost: { label: "CatBoost fenêtre", color: "var(--chart-4)" },
  persistence: { label: "Persistance", color: "var(--foreground)" },
}

const RANK_ROWS = ["n1", "n2", "n3", "n4", "n5", "e1", "e2", "sum"] as const

type Side = {
  numbers: number[]
  stars: number[]
  errors: Record<string, number | null>
  in_band: Record<string, boolean | null>
  hits_numbers: number | null
  hits_stars: number | null
}

type Shift = {
  x: number
  label: string
  date: string
  actual: { numbers: number[]; stars: number[]; sum: number | null }
  readings: Record<string, Side>
}

type Summary = Record<string, { mae_sum: number | null; hits_numbers: number | null; count: number }>

type TrainingPayload = {
  ok: boolean
  error?: string
  focus?: number
  years_present?: string[]
  catboost?: boolean
  shifts?: Shift[]
  summary?: Summary
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
  const [reading, setReading] = useState<ReadingId>("corpus")
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [report, setReport] = useState<TrainingPayload | null>(null)

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

  const chartRows = useMemo(
    () =>
      (report?.shifts ?? []).map((shift) => {
        const row: Record<string, string | number | null> = { label: shift.label, x: shift.x }
        for (const item of READINGS) {
          row[item.id] = shift.readings[item.id]?.errors.sum ?? null
        }
        return row
      }),
    [report]
  )

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

  async function train() {
    setRunning(true)
    setError(null)
    try {
      const response = await fetch("/api/nextdata/training", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          focus,
          years,
          weekday,
          covariates: families,
          draws: draws.map((draw) => ({
            date: draw.date,
            weekday: draw.weekday,
            numbers: draw.numbers,
            stars: draw.stars,
            star_pool: draw.star_pool,
          })),
        }),
      })
      const body = (await response.json()) as TrainingPayload
      if (!response.ok || body.ok === false) {
        setReport(null)
        setError(body.error || "L’entraînement n’a pas abouti.")
        return
      }
      setReport(body)
      if (!body.catboost && (reading === "corpus_catboost" || reading === "fenetre_catboost")) {
        setReading("corpus")
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "API injoignable")
    } finally {
      setRunning(false)
    }
  }

  const summary = report?.summary ?? {}
  const persistenceMae = summary.persistence?.mae_sum

  return (
    <div className="flex min-w-0 flex-col gap-6" data-nextdata-training>
      <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
        <TitleHelp help={NEXTDATA_TRAINING_HELP.banner}>nextDataTraining</TitleHelp> recule de 1 à 10
        tirages. L’écart est prévu moins sorti. La persistance rejoue le tirage d’avant. Ce n’est pas un ticket.
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
              <Button key={year} type="button" size="sm" variant={years.includes(year) ? "default" : "outline"} onClick={() => toggleYear(year)}>
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
            <Button type="button" disabled={running} onClick={() => void train()}>
              {running ? "Décalage −1 à −10…" : "Entraîner"}
            </Button>
            <span className="text-xs text-muted-foreground">
              {draws.length} tirages · {source === "neon" ? "archive synchronisée" : "jeu embarqué"}
            </span>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </CardContent>
      </Card>

      {!report && <p className="text-sm text-muted-foreground">Lancez l’entraînement pour voir les dix écarts.</p>}

      {report?.shifts && (
        <>
          <div className="flex flex-wrap gap-3">
            {READINGS.filter((item) => summary[item.id]).map((item) => {
              const mae = summary[item.id]?.mae_sum
              const better = mae != null && persistenceMae != null && item.id !== "persistence" && mae < persistenceMae
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
                  <span className="block text-xs text-muted-foreground">{item.label}</span>
                  <span className="text-lg font-semibold tabular-nums">{mae ?? "—"}</span>
                  <span className="mt-1 block text-xs text-muted-foreground">
                    MAE somme{better ? " · sous la persistance" : ""}
                    {summary[item.id]?.hits_numbers != null ? ` · ${summary[item.id]?.hits_numbers} numéros` : ""}
                  </span>
                </button>
              )
            })}
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                <TitleHelp help={NEXTDATA_TRAINING_HELP.somme}>Écart de somme</TitleHelp>
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
                      <th key={shift.x} className="font-medium text-muted-foreground">{shift.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {RANK_ROWS.map((field) => (
                    <tr key={field}>
                      <th className="pr-2 text-left font-medium text-muted-foreground">{field}</th>
                      {report.shifts.map((shift) => {
                        const side = shift.readings[reading]
                        const value = side?.errors[field]
                        const covered = side?.in_band[field]
                        return (
                          <td
                            key={`${field}-${shift.x}`}
                            className="rounded-md px-1 py-1.5"
                            style={{ background: tone(value) }}
                            title={covered ? "dans la bande 10–90" : undefined}
                          >
                            {value == null ? "—" : value > 0 ? `+${value}` : value}
                            {covered ? " ·" : ""}
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                <TitleHelp help={NEXTDATA_TRAINING_HELP.boules}>Prévu et sorti</TitleHelp>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="flex flex-col gap-2 text-sm tabular-nums">
                {report.shifts.map((shift) => {
                  const side = shift.readings[reading]
                  return (
                    <li key={shift.x}>
                      <span className="text-muted-foreground">{shift.label} · {shift.date}</span>
                      {" · sorti "}
                      {shift.actual.numbers.join(" ")}
                      {side?.numbers?.length ? ` · prévu ${side.numbers.join(" ")}` : ""}
                      {side?.hits_numbers != null ? ` · ${side.hits_numbers}/5` : ""}
                      {side?.hits_stars != null ? ` · étoiles ${side.hits_stars}/2` : ""}
                    </li>
                  )
                })}
              </ul>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
