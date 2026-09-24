"use client"

import { useEffect, useMemo, useState } from "react"
import { CartesianGrid, Cell, Scatter, ScatterChart, XAxis, YAxis } from "recharts"

import { HelpTip } from "@/components/help"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ChartContainer, ChartTooltip } from "@/components/ui/chart"
import { PillTabs } from "@/components/ui/pill-tabs"
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
            body="Abscisse : phase du cycle (0 à 1). Ordonnée : total des numéros, total des étoiles, n1 à n5, E1 ou E2. La fenêtre est les 20, 50 ou 100 derniers tirages."
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
        <PhaseScatter points={points} scale={scale} xLabel={labels[cycle] ?? cycle} />
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
            body="Chaque point est un tirage des 20, 50 ou 100 derniers. Les axes sont deux phases. La couleur est le total des numéros, le total des étoiles, un rang n1–n5, E1 ou E2."
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
        <PlaneScatter points={report?.points ?? []} scale={scale} xLabel={labels[x] ?? x} yLabel={labels[y] ?? y} />
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

function PhaseScatter({
  points,
  scale,
  xLabel,
}: {
  points: TracePoint[]
  scale: ScaleId
  xLabel: string
}) {
  return (
    <ChartContainer config={{ point: { label: scale, color: "var(--chart-1)" } }} className="aspect-auto h-64 w-full">
      <ScatterChart margin={{ left: 8, right: 8, top: 8, bottom: 8 }}>
        <CartesianGrid />
        <XAxis dataKey="phase" type="number" domain={[0, 1]} name={xLabel} tickFormatter={(value) => Number(value).toFixed(1)} />
        <YAxis dataKey={scale} type="number" name={scale} width={36} />
        <ChartTooltip cursor={{ strokeDasharray: "3 3" }} />
        <Scatter data={points} fill="var(--chart-1)" />
      </ScatterChart>
    </ChartContainer>
  )
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
  const values = points.map((point) => point[scale])
  const min = values.length ? Math.min(...values) : 0
  const max = values.length ? Math.max(...values) : 1
  const span = max - min || 1
  return (
    <ChartContainer config={{ point: { label: scale, color: "var(--chart-1)" } }} className="aspect-auto h-80 w-full">
      <ScatterChart margin={{ left: 8, right: 8, top: 8, bottom: 8 }}>
        <CartesianGrid />
        <XAxis dataKey="x" type="number" domain={[0, 1]} name={xLabel} tickFormatter={(value) => Number(value).toFixed(1)} />
        <YAxis dataKey="y" type="number" domain={[0, 1]} name={yLabel} width={36} tickFormatter={(value) => Number(value).toFixed(1)} />
        <ChartTooltip cursor={{ strokeDasharray: "3 3" }} />
        <Scatter data={points}>
          {points.map((point) => (
            <Cell key={point.date} fill={tint((point[scale] - min) / span)} />
          ))}
        </Scatter>
      </ScatterChart>
    </ChartContainer>
  )
}
