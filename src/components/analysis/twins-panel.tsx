"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { usePathname, useRouter } from "next/navigation"

import { TwinsDemoBar, TwinsDemoPopup } from "@/components/analysis/twins-demo"
import { TitleHelp } from "@/components/help"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { queuePendingAnalogs } from "@/lib/brain/pending-analogs"
import { queueBrainPin } from "@/lib/brain/specialist-demo"
import { formatDrawDate, formatShortDate } from "@/lib/draws"
import type { FingerprintDraw } from "@/lib/fingerprints"
import {
  DEFAULT_TWIN_K,
  FINGERPRINT_AXES,
  buildFingerprintIndex,
  fingerprintAxisLabel,
  formatDeltaChip,
  isFingerprintAxis,
  parseFingerprintAxes,
  zFill,
  type FingerprintAxis,
  type FingerprintRow,
} from "@/lib/fingerprints"
import {
  DEMO_MASK_AXES,
  TWINS_DEMO_ALL_AXES,
  demoTwinPreview,
  scrollTwinsDemoTarget,
  twinsDemoStepOf,
  twinsDemoWantsStart,
  type TwinsDemoStepId,
} from "@/lib/twins-demo"
import { applyTwinsSearch } from "@/lib/twins-url"
import { cn } from "@/lib/utils"

function demoHighlight(step: TwinsDemoStepId | null, ids: TwinsDemoStepId[], elevate = false) {
  return step && ids.includes(step)
    ? cn("ring-2 ring-primary/80 ring-offset-2 ring-offset-background", elevate && "relative z-[70]")
    : ""
}

function waitMs(ms: number) {
  return new Promise<void>((resolve) => window.setTimeout(resolve, ms))
}

const STAR_AXES = new Set<FingerprintAxis>(["star_sum", "e1", "e2"])

function radarAxisLabel(axis: FingerprintAxis): string {
  switch (axis) {
    case "high_low":
      return "h/l"
    case "consecutive":
      return "cons"
    case "centroid":
      return "cent"
    case "star_sum":
      return "s★"
    case "spread":
      return "spr"
    case "parity":
      return "par"
    default:
      return axis
  }
}

function gridLabel(numbers: number[], stars: number[]) {
  return `${numbers.join(" · ")} + ${stars.join(" · ")}`
}

function RadarPortrait({
  axes,
  query,
  neighbor,
}: {
  axes: FingerprintAxis[]
  query: FingerprintRow | null
  neighbor: FingerprintRow | null
}) {
  const size = 340
  const cx = size / 2
  const cy = size / 2
  const maxR = 118
  const n = axes.length
  if (!n || !query) {
    return <p className="text-sm text-muted-foreground">Choisissez un tirage dans la heatmap.</p>
  }

  const point = (index: number, z: number) => {
    const angle = -Math.PI / 2 + (index * 2 * Math.PI) / n
    const t = (Math.max(-3, Math.min(3, z)) + 3) / 6
    const r = t * maxR
    return [cx + r * Math.cos(angle), cy + r * Math.sin(angle)] as const
  }

  const polygon = (zs: number[]) =>
    zs.map((z, i) => point(i, z).join(",")).join(" ")

  const meanRing = Array.from({ length: 60 }, (_, i) => {
    const angle = (i / 60) * 2 * Math.PI
    return `${cx + 0.5 * maxR * Math.cos(angle)},${cy + 0.5 * maxR * Math.sin(angle)}`
  }).join(" ")

  return (
    <svg viewBox={`0 0 ${size} ${size}`} className="mx-auto h-72 w-full max-w-sm" role="img">
      <title>Radar z-score du tirage, de la moyenne de fenêtre et du voisin</title>
      <polygon points={meanRing} fill="none" stroke="var(--border)" strokeDasharray="3 3" />
      {[1, 2, 3].map((ring) => (
        <circle
          key={ring}
          cx={cx}
          cy={cy}
          r={(ring / 3) * maxR}
          fill="none"
          stroke="var(--border)"
          strokeOpacity={0.45}
        />
      ))}
      {axes.map((axis, i) => {
        const [x, y] = point(i, 3)
        const [lx, ly] = point(i, i % 2 === 0 ? 3.42 : 3.82)
        return (
          <g key={axis}>
            <line x1={cx} y1={cy} x2={x} y2={y} stroke="var(--border)" />
            <text
              x={lx}
              y={ly}
              textAnchor="middle"
              dominantBaseline="middle"
              className="fill-muted-foreground"
              fontSize={n > 12 ? 9 : 10}
            >
              {radarAxisLabel(axis)}
            </text>
          </g>
        )
      })}
      <polygon
        points={polygon(query.z)}
        fill="color-mix(in oklab, var(--chart-1) 28%, transparent)"
        stroke="var(--chart-1)"
        strokeWidth={1.6}
      />
      {neighbor ? (
        <polygon
          points={polygon(neighbor.z)}
          fill="none"
          stroke="var(--chart-5)"
          strokeWidth={1.6}
          strokeDasharray="5 3"
        />
      ) : null}
    </svg>
  )
}

export function TwinsPanel({
  draws,
  initialQuery = null,
  initialAxes = null,
}: {
  draws: FingerprintDraw[]
  initialQuery?: string | null
  initialAxes?: FingerprintAxis[] | null
}) {
  const router = useRouter()
  const pathname = usePathname()
  const [axes, setAxes] = useState<FingerprintAxis[]>(() =>
    initialAxes?.length ? parseFingerprintAxes(initialAxes) : [...FINGERPRINT_AXES]
  )
  const [queryDate, setQueryDate] = useState<string | null>(initialQuery)
  const [queryMissing, setQueryMissing] = useState(false)
  const [overlayDate, setOverlayDate] = useState<string | null>(null)
  const [demoStep, setDemoStep] = useState<TwinsDemoStepId | null>(null)
  const [demoRunning, setDemoRunning] = useState(false)
  const [demoDone, setDemoDone] = useState(false)
  const [demoWaiting, setDemoWaiting] = useState(false)
  const demoAutoRef = useRef(false)
  const demoStopRef = useRef(false)
  const demoGateRef = useRef<{ resolve: (ok: boolean) => void } | null>(null)

  const index = useMemo(
    () =>
      buildFingerprintIndex(draws, {
        axes,
        queryDate,
        k: DEFAULT_TWIN_K,
      }),
    [draws, axes, queryDate]
  )

  useEffect(() => {
    const next = index.query?.date ?? null
    if (next && next !== queryDate) setQueryDate(next)
  }, [index.query?.date, queryDate])

  useEffect(() => {
    if (initialAxes?.length) setAxes(parseFingerprintAxes(initialAxes))
  }, [initialAxes])

  useEffect(() => {
    if (!initialQuery || !draws.length) return
    if (draws.some((draw) => draw.date === initialQuery)) {
      setQueryMissing(false)
      setQueryDate(initialQuery)
      return
    }
    setQueryMissing(true)
  }, [draws, initialQuery])

  useEffect(() => {
    if (overlayDate && !index.neighbors.some((row) => row.date === overlayDate)) {
      setOverlayDate(null)
    }
  }, [index.neighbors, overlayDate])

  const overlayRow = useMemo(() => {
    if (!overlayDate) return null
    return index.rows.find((row) => row.date === overlayDate) ?? null
  }, [index.rows, overlayDate])

  const neighborDates = useMemo(() => new Set(index.neighbors.map((row) => row.date)), [index.neighbors])

  const writeTwinsUrl = useCallback(
    (nextQuery: string | null, nextAxes: FingerprintAxis[]) => {
      if (typeof window === "undefined") return
      const query = applyTwinsSearch(window.location.search, {
        queryDate: nextQuery,
        axes: nextAxes,
      })
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false })
    },
    [pathname, router]
  )

  function selectQuery(date: string) {
    setQueryDate(date)
    setOverlayDate(null)
    setQueryMissing(false)
    writeTwinsUrl(date, axes)
  }

  function applyAxes(next: FingerprintAxis[]) {
    setAxes(next)
    writeTwinsUrl(queryDate ?? index.query?.date ?? null, next)
  }

  function toggleAxis(axis: FingerprintAxis) {
    const next = axes.includes(axis)
      ? axes.filter((item) => item !== axis)
      : parseFingerprintAxes([...axes, axis])
    if (!next.length) return
    applyAxes(next)
  }

  function pinNeighbor(focusDate: string) {
    const query = index.query?.date
    if (!query) return
    queuePendingAnalogs({ queryDate: query, focusDate, axes })
    queueBrainPin("analyse/analogs")
    router.push("/brain")
  }

  const finishDemoGate = useCallback((ok: boolean) => {
    const gate = demoGateRef.current
    demoGateRef.current = null
    setDemoWaiting(false)
    gate?.resolve(ok)
  }, [])

  const stopDemo = useCallback(() => {
    demoStopRef.current = true
    setDemoRunning(false)
    setDemoDone(true)
    finishDemoGate(false)
  }, [finishDemoGate])

  const nextDemoStep = useCallback(() => {
    finishDemoGate(true)
  }, [finishDemoGate])

  const runDemo = useCallback(async () => {
    if (demoRunning || !draws.length) return
    demoAutoRef.current = true
    demoStopRef.current = false
    setDemoRunning(true)
    setDemoDone(false)
    setDemoWaiting(false)
    setAxes([...TWINS_DEMO_ALL_AXES])
    setQueryDate(null)
    setOverlayDate(null)

    const preview = demoTwinPreview(draws)

    const begin = (step: TwinsDemoStepId) => {
      setDemoStep(step)
      setDemoWaiting(false)
      scrollTwinsDemoTarget(twinsDemoStepOf(step).target)
    }

    const ask = async (step: TwinsDemoStepId) => {
      if (demoStopRef.current) return false
      setDemoStep(step)
      scrollTwinsDemoTarget(twinsDemoStepOf(step).target)
      await waitMs(380)
      if (demoStopRef.current) return false
      setDemoWaiting(true)
      const ok = await new Promise<boolean>((resolve) => {
        demoGateRef.current = { resolve }
      })
      return ok && !demoStopRef.current
    }

    try {
      begin("window")
      if (!(await ask("window"))) return

      begin("axes")
      setAxes([...TWINS_DEMO_ALL_AXES])
      if (!(await ask("axes"))) return

      begin("mask")
      setAxes([...DEMO_MASK_AXES])
      setOverlayDate(null)
      if (!(await ask("mask"))) return

      begin("heatmap")
      if (preview.query?.date) setQueryDate(preview.query.date)
      setOverlayDate(null)
      if (!(await ask("heatmap"))) return

      begin("twins")
      setOverlayDate(preview.neighbors[0]?.date ?? null)
      if (!(await ask("twins"))) return

      begin("analogs")
      if (!(await ask("analogs"))) return
    } finally {
      setDemoWaiting(false)
      setDemoRunning(false)
      setDemoDone(true)
      if (!demoStopRef.current) setDemoStep("analogs")
    }
  }, [demoRunning, draws])

  useEffect(() => {
    if (demoAutoRef.current || !draws.length) return
    if (typeof window === "undefined" || !twinsDemoWantsStart(window.location.search)) return
    const timer = window.setTimeout(() => {
      if (demoAutoRef.current) return
      demoAutoRef.current = true
      void runDemo()
    }, 80)
    return () => window.clearTimeout(timer)
  }, [draws.length, runDemo])

  if (!draws.length) {
    return <p className="text-sm text-muted-foreground">Fenêtre vide : aucun portrait à indexer.</p>
  }

  return (
    <div className="flex flex-col gap-4">
      <TwinsDemoBar
        step={demoStep}
        running={demoRunning}
        done={demoDone}
        waiting={demoWaiting}
        onStart={() => void runDemo()}
        onStop={stopDemo}
      />
      <TwinsDemoPopup
        step={demoStep}
        open={demoRunning && demoWaiting}
        onNext={nextDemoStep}
        onCancel={stopDemo}
      />
      <Card
        data-demo="twins-axes"
        className={demoHighlight(demoStep, ["axes", "mask"], demoWaiting)}
      >
        <CardHeader>
          <CardTitle>
            <TitleHelp
              help={{
                title: "Axes du portrait",
                body: "Chaque puce est une variable Analyse. Cocher un sous-ensemble, c’est croiser seulement ces axes : les jumeaux se recalculent. Delay / hit restent hors portrait (histoire d’une boule). Les couleurs de la heatmap sont des z-scores vs la moyenne de cette fenêtre, pas une prédiction.",
              }}
            >
              Axes croisés
            </TitleHelp>
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="rounded-md border border-border px-2 py-1 text-xs"
              onClick={() => applyAxes([...FINGERPRINT_AXES])}
            >
              Tous
            </button>
            <button
              type="button"
              className="rounded-md border border-border px-2 py-1 text-xs"
              onClick={() => {
                applyAxes([...DEMO_MASK_AXES])
                setOverlayDate(null)
              }}
              title="Croiser seulement somme, étendue et parité"
            >
              Somme · étendue · parité
            </button>
            {FINGERPRINT_AXES.map((axis) => {
              const on = axes.includes(axis)
              return (
                <button
                  key={axis}
                  type="button"
                  aria-pressed={on}
                  title={fingerprintAxisLabel(axis)}
                  onClick={() => toggleAxis(axis)}
                  className={cn(
                    "rounded-md border px-2 py-1 text-xs tabular-nums",
                    on
                      ? "border-primary/50 bg-primary/10 text-foreground"
                      : "border-border text-muted-foreground",
                    STAR_AXES.has(axis) ? "italic" : ""
                  )}
                >
                  {axis}
                </button>
              )
            })}
          </div>
          <p className="text-xs text-muted-foreground">
            {axes.length} axe{axes.length > 1 ? "s" : ""} · query{" "}
            {index.query ? formatDrawDate(index.query.date) : "—"}. Les tirages sont indépendants.
            {queryMissing && initialQuery ? (
              <span className="ml-1 text-destructive">
                {initialQuery} hors fenêtre — dernier tirage de la fenêtre.
              </span>
            ) : null}
          </p>
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(16rem,0.8fr)]">
        <Card
          data-demo="twins-heatmap"
          className={demoHighlight(demoStep, ["heatmap"], demoWaiting)}
        >
          <CardHeader>
            <CardTitle>
              <TitleHelp
                help={{
                  title: "Index z-score",
                  body: "Une ligne = un tirage de la fenêtre, une colonne = un axe coché. La couleur est l’écart à la moyenne de la fenêtre (bleu bas, ambre haut). Cliquez une ligne pour en faire la query.",
                }}
              >
                Heatmap de l’index
              </TitleHelp>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="max-h-[28rem] overflow-auto rounded-md border border-border">
              <table className="min-w-max border-collapse text-xs">
                <thead className="sticky top-0 z-10 bg-card">
                  <tr>
                    <th className="sticky left-0 z-20 bg-card px-2 py-1 text-left font-medium">Date</th>
                    {index.axes.map((axis) => (
                      <th key={axis} className="px-1 py-1 text-center font-medium text-muted-foreground">
                        {axis}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[...index.rows].reverse().map((row) => {
                    const selected = row.date === index.query?.date
                    const twin = neighborDates.has(row.date)
                    return (
                      <tr key={row.date}>
                        <th className="sticky left-0 bg-card p-0 font-normal">
                          <button
                            type="button"
                            onClick={() => selectQuery(row.date)}
                            title={`Indexer le ${formatDrawDate(row.date)}`}
                            className={cn(
                              "w-full px-2 py-1 text-left tabular-nums",
                              selected && "bg-primary/15 font-medium",
                              !selected && twin && "bg-chart-5/10"
                            )}
                          >
                            {formatShortDate(row.date)}
                          </button>
                        </th>
                        {row.z.map((z, i) => {
                          const axis = index.axes[i]
                          const raw = axis && isFingerprintAxis(axis) ? row.params[axis] : null
                          return (
                            <td key={`${row.date}-${axis}`} className="p-0">
                              <button
                                type="button"
                                onClick={() => selectQuery(row.date)}
                                title={`${row.date} · ${axis} z=${z.toFixed(2)} brut=${raw ?? "—"}`}
                                style={{ background: zFill(z) }}
                                className={cn(
                                  "block h-6 w-7",
                                  selected && "ring-1 ring-inset ring-primary",
                                  !selected && twin && "ring-1 ring-inset ring-chart-5/70"
                                )}
                              />
                            </td>
                          )
                        })}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        <Card
          data-demo="twins-radar"
          className={demoHighlight(demoStep, ["analogs"], demoWaiting)}
        >
          <CardHeader>
            <CardTitle>
              <TitleHelp
                help={{
                  title: "Radar z-score",
                  body: "Le polygone plein est le tirage query. Le cercle pointillé est la moyenne de fenêtre (z = 0). Le polygone ambre est le voisin cliqué. Les rayons sont bornés à ±3 σ.",
                }}
              >
                Portrait
              </TitleHelp>
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            <RadarPortrait axes={index.axes} query={index.query} neighbor={overlayRow} />
            <ul className="text-xs text-muted-foreground">
              <li>
                <span className="mr-1 inline-block h-2 w-2 rounded-sm bg-chart-1" /> query
                {index.query ? ` · ${gridLabel(index.query.numbers, index.query.stars)}` : ""}
              </li>
              <li>
                <span className="mr-1 inline-block h-2 w-2 rounded-sm border border-dashed border-border" />{" "}
                moyenne de fenêtre
              </li>
              {overlayRow ? (
                <li>
                  <span className="mr-1 inline-block h-2 w-2 rounded-sm border border-dashed border-chart-5" />{" "}
                  voisin {formatShortDate(overlayRow.date)}
                </li>
              ) : null}
            </ul>
          </CardContent>
        </Card>
      </div>

      <Card
        data-demo="twins-list"
        className={demoHighlight(demoStep, ["twins"], demoWaiting)}
      >
        <CardHeader>
          <CardTitle>
            <TitleHelp
              help={{
                title: "Jumeaux",
                body: "Huit tirages les plus proches en cosinus sur les z-scores des axes cochés. Les puces sont des deltas bruts (unités Analyse) : voisin − query. Ce n’est pas P(prochain tirage).",
              }}
            >
              Huit plus proches
            </TitleHelp>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {index.neighbors.length ? (
            <ul className="flex flex-col gap-2">
              {index.neighbors.map((row) => {
                const active = overlayDate === row.date
                return (
                  <li key={row.date} className="flex items-stretch gap-2">
                    <button
                      type="button"
                      onClick={() => setOverlayDate(row.date)}
                      title={`Comparer au ${formatDrawDate(row.date)}`}
                      className={cn(
                        "flex min-w-0 flex-1 flex-col gap-1 rounded-md border px-3 py-2 text-left",
                        active ? "border-chart-5/60 bg-chart-5/10" : "border-border"
                      )}
                    >
                      <span className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                        <span>{formatDrawDate(row.date)}</span>
                        <span className="tabular-nums text-muted-foreground">score {row.score.toFixed(3)}</span>
                      </span>
                      <span className="text-xs tabular-nums text-muted-foreground">
                        {gridLabel(row.numbers, row.stars)}
                      </span>
                      <span className="flex flex-wrap gap-1">
                        {index.axes.map((axis) => {
                          const value = row.delta[axis]
                          if (value == null) return null
                          return (
                            <span
                              key={`${row.date}-${axis}`}
                              className={cn(
                                "rounded-sm border px-1.5 py-0.5 text-[11px] tabular-nums",
                                value === 0
                                  ? "border-border text-muted-foreground"
                                  : "border-border bg-muted/60"
                              )}
                            >
                              {formatDeltaChip(axis, value)}
                            </span>
                          )
                        })}
                      </span>
                    </button>
                    <button
                      type="button"
                      data-action="pin-analog"
                      onClick={(event) => {
                        event.stopPropagation()
                        pinNeighbor(row.date)
                      }}
                      title={`Épingler ${formatDrawDate(row.date)} dans Brain (query ${index.query?.date ?? "—"})`}
                      className="shrink-0 self-center rounded-md border border-border px-2 py-1 text-xs"
                    >
                      Épingler
                    </button>
                  </li>
                )
              })}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">
              Pas assez de tirages dans la fenêtre pour un voisinage.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
