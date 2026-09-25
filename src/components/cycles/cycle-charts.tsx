"use client"

import { useMemo, useState } from "react"
import { Area, Bar, BarChart, CartesianGrid, ComposedChart, Line, XAxis, YAxis } from "recharts"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import { VARIABLE_LABELS, type VariableName } from "@/lib/analysis"
import type { CycleChannel, CycleFit, CyclePanel, CycleSignature } from "@/lib/cycles"

const MODULE_LABEL: Record<string, string> = {
  analyse: "Analyse",
  ref: "Réf",
  harmo: "Harmo",
  chartisme: "Chartisme",
  morpho: "Morpho",
  relief: "Relief",
  pronostic: "Pronostic",
}

const CLOCKS = [
  { id: "lunar", label: "Lune", color: "var(--chart-2)" },
  { id: "carrington", label: "Carrington", color: "var(--chart-3)" },
  { id: "harmo", label: "Raie Harmo", color: "var(--chart-4)" },
  { id: "tropical", label: "Année", color: "var(--chart-5)" },
] as const

const MODULE_TRACES = [
  { id: "occupancy", label: "Figure chartiste", color: "var(--chart-2)" },
  { id: "activity", label: "Activité", color: "var(--chart-3)" },
  { id: "morpho", label: "Forme Morpho", color: "var(--chart-4)" },
  { id: "relief", label: "Centroïde Relief", color: "var(--chart-5)" },
  { id: "residual", label: "Résidu", color: "var(--chart-1)" },
] as const

export function moduleLabel(module: string) {
  return MODULE_LABEL[module] ?? module
}

export function channelTitle(channel: CycleChannel) {
  if (channel.id.startsWith("series:")) {
    const name = channel.id.slice("series:".length) as VariableName
    return VARIABLE_LABELS[name] ?? channel.label
  }
  return channel.label.replace(/ sin$| cos$/, "")
}

export function weightTitle(id: string) {
  const named: Record<string, string> = {
    "chartisme:activity": "Activité",
    "chartisme:occupancy": "Figure",
    "morpho:gap_std": "Forme Morpho",
    "relief:centroid": "Centroïde",
    "pronostic:z": "Résidu",
    weekday: "Mardi",
  }
  if (named[id]) return named[id]
  if (id.startsWith("series:")) {
    const name = id.slice("series:".length) as VariableName
    return VARIABLE_LABELS[name] ?? id
  }
  return id
    .replace(":sin", "")
    .replace(":cos", " cos")
    .replace("chartisme:", "Chartisme · ")
    .replace("morpho:", "Morpho · ")
    .replace("relief:", "Relief · ")
    .replace("pronostic:", "Pronostic · ")
    .replace("harmo", "Harmo")
    .replace("lunar", "Lune")
    .replace("carrington", "Carrington")
    .replace("schwabe", "Schwabe")
    .replace("tropical", "Année")
    .replace("weekday", "Mardi")
    .replace("anomalistique", "Anomalistique")
    .replace("draconitique", "Draconitique")
    .replace("saros", "Saros")
}

function unit(values: Array<number | null> | undefined) {
  const finite = (values ?? []).filter((value): value is number => value != null && Number.isFinite(value))
  if (finite.length < 2) return values ?? []
  const lo = Math.min(...finite)
  const hi = Math.max(...finite)
  const span = hi - lo || 1
  return (values ?? []).map((value) => (value == null ? null : (value - lo) / span))
}

function rowsOf(panel: CyclePanel) {
  const dates = panel.dates ?? []
  const series = panel.series ?? {}
  return dates.map((date, index) => {
    const row: Record<string, string | number | null> = { date: date.slice(5) }
    for (const [key, values] of Object.entries(series)) {
      row[key] = values[index] ?? null
    }
    return row
  })
}

export function CycleOverlayChart({
  panel,
  targetLabel,
}: {
  panel: CyclePanel
  targetLabel: string
}) {
  const [clocks, setClocks] = useState<string[]>(["lunar", "harmo"])
  const [modules, setModules] = useState<string[]>(["occupancy", "residual"])
  const data = useMemo(() => rowsOf(panel), [panel])
  const moduleData = useMemo(() => {
    const dates = panel.dates ?? []
    const series = panel.series ?? {}
    const scaled = Object.fromEntries(MODULE_TRACES.map((trace) => [trace.id, unit(series[trace.id])]))
    return dates.map((date, index) => {
      const row: Record<string, string | number | null> = { date: date.slice(5) }
      for (const trace of MODULE_TRACES) row[trace.id] = scaled[trace.id]?.[index] ?? null
      return row
    })
  }, [panel])

  const clockConfig = {
    target: { label: targetLabel, color: "var(--chart-1)" },
    ...Object.fromEntries(CLOCKS.map((clock) => [clock.id, { label: clock.label, color: clock.color }])),
  } satisfies ChartConfig
  const moduleConfig = Object.fromEntries(
    MODULE_TRACES.map((trace) => [trace.id, { label: trace.label, color: trace.color }])
  ) satisfies ChartConfig

  if (!data.length) return <p className="text-sm text-muted-foreground">Pas de points dans cette fenêtre.</p>

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader className="gap-2">
          <CardTitle>Courbe et horloges</CardTitle>
          <p className="text-sm leading-6 text-muted-foreground">
            Axe gauche : {targetLabel}, dans son unité. Axe droit : phase de l’horloge, de 0 (début du cycle) à 1
            (fin). Les deux axes ne partagent pas d’échelle. Une phase qui monte en même temps que la courbe dit un
            rythme commun, pas une cause.
          </p>
          <div className="flex flex-wrap gap-2">
            {CLOCKS.map((clock) => {
              const on = clocks.includes(clock.id)
              return (
                <button
                  key={clock.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() =>
                    setClocks((current) =>
                      current.includes(clock.id) ? current.filter((id) => id !== clock.id) : [...current, clock.id]
                    )
                  }
                  className={
                    on
                      ? "rounded-full border border-foreground/30 bg-foreground/10 px-2.5 py-1 text-xs"
                      : "rounded-full border border-border px-2.5 py-1 text-xs text-muted-foreground"
                  }
                >
                  {clock.label}
                </button>
              )
            })}
          </div>
        </CardHeader>
        <CardContent>
          <ChartContainer config={clockConfig} className="aspect-auto h-[280px] w-full">
            <ComposedChart data={data} margin={{ left: 4, right: 8, top: 8 }}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="date" tickLine={false} axisLine={false} minTickGap={28} />
              <YAxis yAxisId="curve" width={40} tickLine={false} axisLine={false} />
              <YAxis yAxisId="phase" orientation="right" domain={[0, 1]} width={28} tickLine={false} axisLine={false} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <ChartLegend content={<ChartLegendContent />} />
              <Line yAxisId="curve" type="monotone" dataKey="target" stroke="var(--color-target)" dot={false} strokeWidth={2} />
              {CLOCKS.filter((clock) => clocks.includes(clock.id)).map((clock) => (
                <Line
                  key={clock.id}
                  yAxisId="phase"
                  type="monotone"
                  dataKey={clock.id}
                  stroke={`var(--color-${clock.id})`}
                  dot={false}
                  strokeDasharray="4 3"
                />
              ))}
            </ComposedChart>
          </ChartContainer>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="gap-2">
          <CardTitle>Ce que les autres modules voient</CardTitle>
          <p className="text-sm leading-6 text-muted-foreground">
            Chaque tracé est ramené entre 0 et 1 sur la fenêtre, pour les comparer. Chartisme : occupation d’une figure
            et activité. Morpho : écart des trous de la grille. Relief : centroïde n1→n5. Pronostic : résidu de la
            courbe contre sa moyenne passée. Ce ne sont pas des horloges.
          </p>
          <div className="flex flex-wrap gap-2">
            {MODULE_TRACES.map((trace) => {
              const on = modules.includes(trace.id)
              return (
                <button
                  key={trace.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() =>
                    setModules((current) =>
                      current.includes(trace.id) ? current.filter((id) => id !== trace.id) : [...current, trace.id]
                    )
                  }
                  className={
                    on
                      ? "rounded-full border border-foreground/30 bg-foreground/10 px-2.5 py-1 text-xs"
                      : "rounded-full border border-border px-2.5 py-1 text-xs text-muted-foreground"
                  }
                >
                  {trace.label}
                </button>
              )
            })}
          </div>
        </CardHeader>
        <CardContent>
          <ChartContainer config={moduleConfig} className="aspect-auto h-[200px] w-full">
            <ComposedChart data={moduleData} margin={{ left: 4, right: 8, top: 8 }}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="date" tickLine={false} axisLine={false} minTickGap={28} />
              <YAxis domain={[0, 1]} width={28} tickLine={false} axisLine={false} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <ChartLegend content={<ChartLegendContent />} />
              {MODULE_TRACES.filter((trace) => modules.includes(trace.id)).map((trace) => (
                <Line
                  key={trace.id}
                  type="monotone"
                  dataKey={trace.id}
                  stroke={`var(--color-${trace.id})`}
                  dot={false}
                />
              ))}
            </ComposedChart>
          </ChartContainer>
        </CardContent>
      </Card>
    </div>
  )
}

export function WeightChart({
  title,
  caption,
  rows,
}: {
  title: string
  caption: string
  rows: { id: string; label: string; value: number }[]
}) {
  const config = { value: { label: "Poids", color: "var(--chart-1)" } } satisfies ChartConfig
  const data = rows.map((row) => ({ ...row, value: Number(row.value.toFixed(3)) }))
  return (
    <Card>
      <CardHeader className="gap-1">
        <CardTitle>{title}</CardTitle>
        <p className="text-sm text-muted-foreground">{caption}</p>
      </CardHeader>
      <CardContent>
        <ChartContainer config={config} className="aspect-auto w-full" style={{ height: Math.max(180, data.length * 28) }}>
          <BarChart data={data} layout="vertical" margin={{ left: 8, right: 12, top: 4 }}>
            <CartesianGrid horizontal={false} />
            <XAxis type="number" tickLine={false} axisLine={false} />
            <YAxis type="category" dataKey="label" width={128} tickLine={false} axisLine={false} />
            <ChartTooltip content={<ChartTooltipContent />} />
            <Bar dataKey="value" fill="var(--color-value)" radius={3} />
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}

export function RibbonChart({ fit }: { fit: CycleFit }) {
  const ribbon = fit.ribbon ?? []
  const data = ribbon.map((row) => ({
    date: row.date.slice(5),
    réel: row.y,
    médiane: row.q50,
    base: row.q10,
    bande: Number((row.q90 - row.q10).toFixed(4)),
  }))
  const config = {
    réel: { label: "Valeur archivée", color: "var(--chart-1)" },
    médiane: { label: "Médiane du modèle", color: "var(--chart-2)" },
    bande: { label: "Entre 10 % et 90 %", color: "var(--chart-3)" },
  } satisfies ChartConfig
  if (!data.length) return null
  return (
    <Card>
      <CardHeader className="gap-1">
        <CardTitle>Couverture dans l’archive</CardTitle>
        <p className="text-sm leading-6 text-muted-foreground">
          Chaque point est un tirage déjà passé. La bande va du quantile 10 % au quantile 90 % annoncé avant ce
          tirage. La médiane est le centre. Si la valeur archivée sort souvent de la bande, le modèle ne tient pas le
          tracé. Ce n’est pas une prévision du prochain tirage.
        </p>
      </CardHeader>
      <CardContent>
        <ChartContainer config={config} className="aspect-auto h-[260px] w-full">
          <ComposedChart data={data} margin={{ left: 4, right: 8, top: 8 }}>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="date" tickLine={false} axisLine={false} minTickGap={24} />
            <YAxis width={40} tickLine={false} axisLine={false} />
            <ChartTooltip content={<ChartTooltipContent />} />
            <ChartLegend content={<ChartLegendContent />} />
            <Area type="monotone" dataKey="base" stackId="band" stroke="none" fill="transparent" legendType="none" />
            <Area type="monotone" dataKey="bande" stackId="band" stroke="none" fill="var(--color-bande)" fillOpacity={0.35} />
            <Line type="monotone" dataKey="médiane" stroke="var(--color-médiane)" dot={false} />
            <Line type="monotone" dataKey="réel" stroke="var(--color-réel)" dot={false} strokeWidth={2} />
          </ComposedChart>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}

const PHASE_TICKS = ["0", "⅛", "¼", "⅜", "½", "⅝", "¾", "⅞"]

export function AttentionChart({
  name,
  mass,
  locked,
  flatness,
}: {
  name: string
  mass: number[]
  locked: boolean
  flatness: number
}) {
  const config = { mass: { label: "Part de l’attention", color: "var(--chart-1)" } } satisfies ChartConfig
  const data = mass.map((value, index) => ({
    label: PHASE_TICKS[index] ?? String(index + 1),
    mass: Number(value.toFixed(3)),
  }))
  return (
    <Card>
      <CardHeader className="gap-1">
        <CardTitle>
          {weightTitle(name)}{" "}
          <span className="text-sm font-normal text-muted-foreground">
            {locked ? "l’attention se groupe sur une phase" : "l’attention est répartie"} · écart {flatness.toFixed(2)}
          </span>
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Part de l’attention selon la phase du tirage regardé. 0 est le début du cycle, ½ son milieu. Une barre
          dominante veut dire que le modèle revient toujours au même endroit du cycle.
        </p>
      </CardHeader>
      <CardContent>
        <ChartContainer config={config} className="aspect-auto h-[180px] w-full">
          <BarChart data={data} margin={{ left: 4, right: 8, top: 8 }}>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="label" tickLine={false} axisLine={false} />
            <YAxis width={36} tickLine={false} axisLine={false} />
            <ChartTooltip content={<ChartTooltipContent />} />
            <Bar dataKey="mass" fill="var(--color-mass)" radius={3} />
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}

export function signatureRows(signature: CycleSignature, kind: "known" | "past") {
  const ids = kind === "known" ? signature.known_ids : signature.past_ids
  const weights = kind === "known" ? signature.vsn_known : signature.vsn_past
  return ids
    .map((id, index) => ({ id, label: weightTitle(id), value: weights[index] ?? 0 }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 12)
}
