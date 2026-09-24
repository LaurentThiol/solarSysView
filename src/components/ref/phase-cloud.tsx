"use client"

import { useEffect, useMemo, useState } from "react"
import {
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  Scatter,
  useXAxisScale,
  useYAxisScale,
  XAxis,
  YAxis,
} from "recharts"

import { HelpTip } from "@/components/help"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart"
import { PillTabs } from "@/components/ui/pill-tabs"
import { phaseMeanCurve, scaleLabel, trajectorySegments } from "@/lib/ref-chart"
import {
  fetchPlane,
  fetchTrace,
  SCALES,
  type PlanePoint,
  type PlaneReport,
  type ScaleId,
  type TracePoint,
  type TraceReport,
} from "@/lib/ref"

const WINDOWS = [20, 50, 100] as const

function tint(fraction: number) {
  const hue = 210 - Math.round(Math.min(1, Math.max(0, fraction)) * 170)
  return `hsl(${hue} 62% 42%)`
}

function CycleChips({
  ids,
  labels,
  value,
  onChange,
}: {
  ids: readonly string[]
  labels: Record<string, string>
  value: string
  onChange: (id: string) => void
}) {
  return (
    <div className="flex flex-wrap gap-1">
      {ids.map((id) => (
        <button
          key={id}
          type="button"
          onClick={() => onChange(id)}
          className={
            id === value
              ? "rounded-full border border-primary bg-primary/15 px-2 py-0.5 text-xs"
              : "rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground"
          }
        >
          {labels[id] ?? id}
        </button>
      ))}
    </div>
  )
}

export function CycleCloud({
  cycles,
  initial,
  labels,
}: {
  cycles: readonly string[]
  initial: string
  labels: Record<string, string>
}) {
  const [cycle, setCycle] = useState(initial)
  const [window, setWindow] = useState<(typeof WINDOWS)[number]>(50)
  const [scale, setScale] = useState<ScaleId>("sum")
  const [report, setReport] = useState<TraceReport | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancel = false
    fetchTrace(cycle, window)
      .then((payload) => {
        if (!cancel) {
          setReport(payload)
          setError(null)
        }
      })
      .catch((reason: unknown) => {
        if (!cancel) setError(reason instanceof Error ? reason.message : "Trace indisponible")
      })
    return () => {
      cancel = true
    }
  }, [cycle, window])

  const points = report?.points ?? []
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Phase × tirage
          <HelpTip
            title="Nuage de phase"
            body="La courbe suit les tirages dans l’ordre des dates : trait plein pour la grandeur, tirets pour la phase. Le nuage place la même grandeur contre la phase, avec la moyenne par tranche."
          />
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <CycleChips ids={cycles} labels={labels} value={cycle} onChange={setCycle} />
        <WindowAndScale window={window} onWindow={setWindow} scale={scale} onScale={setScale} />
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        {report?.short ? (
          <p className="text-xs text-muted-foreground">
            L’archive visible a {report.count} tirages, moins que {window}.
          </p>
        ) : null}
        {report ? (
          <>
            <DrawCurve points={points} scale={scale} phaseLabel={labels[cycle] ?? cycle} />
            <PhaseScatter points={points} scale={scale} xLabel={labels[cycle] ?? cycle} />
          </>
        ) : error ? null : (
          <p className="text-sm text-muted-foreground">Chargement des tirages…</p>
        )}
      </CardContent>
    </Card>
  )
}

export function SynthesisPlane() {
  const [x, setX] = useState("lunaire")
  const [y, setY] = useState("carrington")
  const [window, setWindow] = useState<(typeof WINDOWS)[number]>(50)
  const [scale, setScale] = useState<ScaleId>("sum")
  const [report, setReport] = useState<PlaneReport | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancel = false
    fetchPlane(x, y, window)
      .then((payload) => {
        if (!cancel) {
          setReport(payload)
          setError(null)
        }
      })
      .catch((reason: unknown) => {
        if (!cancel) setError(reason instanceof Error ? reason.message : "Plan indisponible")
      })
    return () => {
      cancel = true
    }
  }, [x, y, window])

  const labels = useMemo(() => {
    const map: Record<string, string> = {}
    for (const id of report?.cycles ?? []) map[id] = id
    return { ...CYCLE_LABELS, ...map }
  }, [report])
  const ids = report?.cycles?.length ? report.cycles : Object.keys(CYCLE_LABELS)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Deux cycles, une grandeur
          <HelpTip
            title="Synthèse"
            body="Chaque point est un tirage des 20, 50 ou 100 derniers. Les axes sont deux phases. Le trait relie les tirages dans l’ordre des dates. La couleur est le total des numéros, le total des étoiles, un rang n1–n5, E1 ou E2."
          />
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <p className="text-sm text-muted-foreground">{report?.note}</p>
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="flex flex-col gap-1">
            <p className="text-xs text-muted-foreground">Abscisse</p>
            <CycleChips ids={ids} labels={labels} value={x} onChange={setX} />
          </div>
          <div className="flex flex-col gap-1">
            <p className="text-xs text-muted-foreground">Ordonnée</p>
            <CycleChips ids={ids} labels={labels} value={y} onChange={setY} />
          </div>
        </div>
        <WindowAndScale window={window} onWindow={setWindow} scale={scale} onScale={setScale} />
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        {report?.short ? (
          <p className="text-xs text-muted-foreground">
            L’archive visible a {report.count} tirages, moins que {window}.
          </p>
        ) : null}
        {report ? (
          <PlaneScatter points={report.points} scale={scale} xLabel={labels[x] ?? x} yLabel={labels[y] ?? y} />
        ) : error ? null : (
          <p className="text-sm text-muted-foreground">Chargement des tirages…</p>
        )}
      </CardContent>
    </Card>
  )
}

export const CYCLE_LABELS: Record<string, string> = {
  lunaire: "Lunaire",
  anomalistique: "Anomalistique",
  draconitique: "Draconitique",
  "vive-eau": "Vive-eau",
  nodal: "Nodal",
  saros: "Saros",
  meton: "Méton",
  carrington: "Carrington",
  schwabe: "Schwabe",
  hale: "Hale",
  gleissberg: "Gleissberg",
  tropique: "Tropique",
  chandler: "Chandler",
}

export const LUNAR_CYCLES = ["lunaire", "anomalistique", "draconitique", "vive-eau", "nodal", "saros", "meton"] as const
export const SOLAR_CYCLES = ["carrington", "schwabe", "hale", "gleissberg"] as const
export const EARTH_CYCLES = ["tropique", "chandler"] as const

function WindowAndScale({
  window,
  onWindow,
  scale,
  onScale,
}: {
  window: number
  onWindow: (value: (typeof WINDOWS)[number]) => void
  scale: ScaleId
  onScale: (value: ScaleId) => void
}) {
  return (
    <div className="flex flex-col gap-2">
      <PillTabs
        idPrefix={`ref-window-${window}`}
        label="Fenêtre"
        mode="chips"
        compact
        wrap
        value={String(window)}
        onValueChange={(id) => onWindow(Number(id) as (typeof WINDOWS)[number])}
        items={WINDOWS.map((item) => ({ id: String(item), label: `${item} tirages` }))}
      />
      <PillTabs
        idPrefix={`ref-scale-${scale}`}
        label="Grandeur"
        mode="chips"
        compact
        wrap
        value={scale}
        onValueChange={(id) => onScale(id as ScaleId)}
        items={SCALES.map((item) => ({ id: item.id, label: item.label }))}
      />
    </div>
  )
}

function DrawCurve({
  points,
  scale,
  phaseLabel,
}: {
  points: TracePoint[]
  scale: ScaleId
  phaseLabel: string
}) {
  const label = scaleLabel(scale)
  const rows = points.map((point) => ({ ...point, draw: point[scale] }))
  if (!rows.length) {
    return <p className="text-sm text-muted-foreground">Aucun tirage sur cette fenêtre.</p>
  }
  return (
    <div className="flex flex-col gap-1">
      <p className="text-xs text-muted-foreground">
        Courbe des tirages — {label}. Tirets : phase {phaseLabel}.
      </p>
      <ChartContainer
        config={{
          draw: { label, color: "var(--chart-1)" },
          phase: { label: `Phase ${phaseLabel}`, color: "var(--chart-2)" },
        }}
        className="aspect-auto h-64 w-full"
      >
        <ComposedChart data={rows} margin={{ left: 8, right: 8, top: 8, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 10 }}
            minTickGap={28}
            tickFormatter={(value) => String(value).slice(5)}
          />
          <YAxis yAxisId="draw" width={36} tick={{ fontSize: 10 }} />
          <YAxis
            yAxisId="phase"
            orientation="right"
            domain={[0, 1]}
            width={32}
            tick={{ fontSize: 10 }}
            tickFormatter={(value) => Number(value).toFixed(1)}
          />
          <ChartTooltip content={<ChartTooltipContent />} />
          <Line
            yAxisId="draw"
            type="monotone"
            dataKey="draw"
            stroke="var(--color-draw)"
            strokeWidth={2}
            dot={{ r: 2.5, fill: "var(--color-draw)" }}
            activeDot={{ r: 4 }}
            isAnimationActive={false}
          />
          <Line
            yAxisId="phase"
            type="monotone"
            dataKey="phase"
            stroke="var(--color-phase)"
            strokeWidth={1.5}
            strokeDasharray="4 3"
            dot={false}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ChartContainer>
    </div>
  )
}

function PhaseScatter({
  points,
  scale,
  xLabel,
}: {
  points: TracePoint[]
  scale: ScaleId
  xLabel: string
}) {
  const label = scaleLabel(scale)
  const curve = phaseMeanCurve(points, scale)
  const scatter = points.map((point) => ({ ...point, value: point[scale] }))
  return (
    <div className="flex flex-col gap-1">
      <p className="text-xs text-muted-foreground">
        Nuage — abscisse {xLabel}, ordonnée {label}. Trait : moyenne par tranche de phase.
      </p>
      <ChartContainer
        config={{
          value: { label, color: "var(--chart-1)" },
          mean: { label: "Moyenne", color: "var(--chart-4)" },
        }}
        className="aspect-auto h-64 w-full"
      >
        <ComposedChart margin={{ left: 8, right: 8, top: 8, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis
            dataKey="phase"
            type="number"
            domain={[0, 1]}
            name={xLabel}
            tick={{ fontSize: 10 }}
            tickFormatter={(value) => Number(value).toFixed(1)}
          />
          <YAxis dataKey="value" type="number" name={label} width={36} tick={{ fontSize: 10 }} />
          <ChartTooltip content={<ChartTooltipContent labelKey="date" />} />
          <Line
            data={curve}
            dataKey="value"
            name="mean"
            stroke="var(--color-mean)"
            strokeWidth={2}
            dot={{ r: 3, fill: "var(--color-mean)" }}
            isAnimationActive={false}
            legendType="none"
          />
          <Scatter data={scatter} name="value" fill="var(--color-value)" isAnimationActive={false} shape={DrawMark} />
        </ComposedChart>
      </ChartContainer>
    </div>
  )
}

function DrawMark(props: { cx?: number; cy?: number; fill?: string }) {
  const cx = Number(props.cx)
  const cy = Number(props.cy)
  if (!Number.isFinite(cx) || !Number.isFinite(cy)) return null
  return <circle cx={cx} cy={cy} r={4} fill={props.fill ?? "var(--chart-1)"} fillOpacity={0.9} />
}

function PlaneScatter({
  points,
  scale,
  xLabel,
  yLabel,
}: {
  points: PlanePoint[]
  scale: ScaleId
  xLabel: string
  yLabel: string
}) {
  const label = scaleLabel(scale)
  const values = points.map((point) => point[scale])
  const min = values.length ? Math.min(...values) : 0
  const max = values.length ? Math.max(...values) : 1
  const span = max - min || 1
  if (!points.length) {
    return <p className="text-sm text-muted-foreground">Aucun tirage sur cette fenêtre.</p>
  }
  return (
    <div className="flex flex-col gap-1">
      <p className="text-xs text-muted-foreground">
        {xLabel} × {yLabel}. Trait : ordre des tirages. Couleur : {label}.
      </p>
      <ChartContainer
        config={{ path: { label: "Tirages", color: "var(--chart-1)" }, point: { label, color: "var(--chart-4)" } }}
        className="aspect-auto h-80 w-full"
      >
        <ComposedChart margin={{ left: 8, right: 8, top: 8, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis
            dataKey="x"
            type="number"
            domain={[0, 1]}
            name={xLabel}
            tick={{ fontSize: 10 }}
            tickFormatter={(value) => Number(value).toFixed(1)}
          />
          <YAxis
            dataKey="y"
            type="number"
            domain={[0, 1]}
            name={yLabel}
            width={36}
            tick={{ fontSize: 10 }}
            tickFormatter={(value) => Number(value).toFixed(1)}
          />
          <ChartTooltip content={<ChartTooltipContent />} />
          <PlanePath points={points} />
          <Scatter data={points} name="point" isAnimationActive={false} shape={DrawMark}>
            {points.map((point) => (
              <Cell key={point.date} fill={tint((point[scale] - min) / span)} />
            ))}
          </Scatter>
        </ComposedChart>
      </ChartContainer>
    </div>
  )
}

function PlanePath({ points }: { points: PlanePoint[] }) {
  const xScale = useXAxisScale()
  const yScale = useYAxisScale()
  if (!xScale || !yScale) return null
  return (
    <g>
      {trajectorySegments(points).map((segment, index) => (
        <polyline
          key={index}
          fill="none"
          stroke="var(--color-path)"
          strokeWidth={1.75}
          strokeLinejoin="round"
          strokeLinecap="round"
          points={segment
            .map((point) => {
              const px = xScale(point.x)
              const py = yScale(point.y)
              if (px == null || py == null) return ""
              return `${px},${py}`
            })
            .filter(Boolean)
            .join(" ")}
        />
      ))}
    </g>
  )
}
