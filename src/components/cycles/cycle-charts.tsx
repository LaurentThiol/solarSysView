"use client"

import { useMemo, useState } from "react"
import { Area, Bar, BarChart, CartesianGrid, ComposedChart, Line, XAxis, YAxis } from "recharts"

import { HelpTip, HelpWrap, TitleHelp, type HelpCopy } from "@/components/help"
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
import { cycleChartRows, type CycleChannel, type CycleFit, type CyclePanel, type CycleSignature } from "@/lib/cycles"
import { formatDrawDate, formatShortDate } from "@/lib/draws"

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
  {
    id: "lunar",
    label: "Lune",
    color: "var(--chart-2)",
    help: "Mois synodique (~29,53 j). L’axe droit montre la phase, de 0 à 1.",
  },
  {
    id: "carrington",
    label: "Carrington",
    color: "var(--chart-3)",
    help: "Rotation solaire (~27,3 j). Phase calendaire, lue dans Réf.",
  },
  {
    id: "harmo",
    label: "Raie Harmo",
    color: "var(--chart-4)",
    help: "Période dominante de la courbe, estimée sur le passé puis tenue fixe.",
  },
  {
    id: "harmo_court",
    label: "Cycle court",
    color: "var(--chart-5)",
    help: "Phase de l’arche de 4 à 8 tirages. La période est la médiane de ces arches.",
  },
  {
    id: "tropical",
    label: "Année",
    color: "var(--chart-5)",
    help: "Année tropique (~365,24 j) : la saison, jour de l’année.",
  },
] as const

const MODULE_TRACES = [
  {
    id: "occupancy",
    label: "Figure chartiste",
    color: "var(--chart-2)",
    help: "1 si le tirage est dans une arche de 9 à 120 tirages, ramené entre 0 et 1 sur la fenêtre.",
  },
  {
    id: "court",
    label: "Cycle court",
    color: "var(--chart-3)",
    help: "1 si l’arche de pivots dure de 4 à 8 tirages.",
  },
  {
    id: "activity",
    label: "Activité",
    color: "var(--chart-3)",
    help: "Valeur absolue de la variation de la cible, d’un tirage au précédent.",
  },
  {
    id: "morpho",
    label: "Forme Morpho",
    color: "var(--chart-4)",
    help: "Écart max − min des trous g1–g4 : forme du glyphe.",
  },
  {
    id: "relief",
    label: "Centroïde Relief",
    color: "var(--chart-5)",
    help: "Hauteur moyenne du profil n1 vers n5.",
  },
  {
    id: "residual",
    label: "Résidu",
    color: "var(--chart-1)",
    help: "Écart de la cible à la médiane des 8 tirages précédents, divisé par la demi-étendue.",
  },
] as const

const CLOCK_CHART_HELP = {
  title: "Courbe et horloges",
  body: "Axe gauche : la cible, dans son unité. Axe droit : phase de l’horloge, de 0 (début du cycle) à 1 (fin). Les deux axes ne partagent pas d’échelle. L’abscisse est un tirage, affiché en jour/mois. Une phase qui monte en même temps que la courbe dit un rythme commun.",
} as const

const MODULE_CHART_HELP = {
  title: "Ce que les autres modules voient",
  body: "Chaque tracé est ramené entre 0 et 1 sur la fenêtre, pour les comparer. Ce ne sont pas des horloges.",
} as const

const RIBBON_HELP = {
  title: "Couverture dans l’archive",
  body: "Chaque point est un tirage déjà passé. La bande va du quantile 10 % au quantile 90 % annoncé avant ce tirage. La médiane est le centre. Si la valeur archivée sort souvent de la bande, le modèle ne tient pas le tracé.",
} as const

const ATTENTION_FLATNESS =
  "0 si la masse est plate, 1 si elle tient dans une seule phase. Le verrou se déclare à partir de 0,15."

const ATTENTION_HELP: HelpCopy = {
  title: "Attention repliée",
  body: "Part de l’attention selon la phase du tirage regardé. 0 est le début du cycle, ½ son milieu.",
  items: [
    {
      label: "Pas suivant",
      text: "Premier pas de l’horizon seulement.",
    },
    {
      label: "Tout l’horizon",
      text: "Somme des pas de l’horizon.",
    },
    {
      label: "Écart",
      text: ATTENTION_FLATNESS,
    },
  ],
}

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
    "chartisme:court": "Cycle court",
    "chartisme:etendue": "Étendue courte",
    "morpho:gap_span": "Forme Morpho",
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
  return cycleChartRows(panel.dates ?? [], panel.series ?? {})
}

function axisTooltip(value: unknown) {
  return formatDrawDate(String(value ?? ""))
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
    return cycleChartRows(dates, scaled)
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
          <CardTitle>
            <TitleHelp help={CLOCK_CHART_HELP}>Courbe et horloges</TitleHelp>
          </CardTitle>
          <p className="text-sm leading-6 text-muted-foreground">
            Axe gauche : {targetLabel}, dans son unité. Axe droit : phase de 0 à 1. Les deux axes ne partagent pas
            d’échelle. L’abscisse est un tirage, affiché en jour/mois.
          </p>
          <div className="flex flex-wrap gap-2">
            {CLOCKS.map((clock) => {
              const on = clocks.includes(clock.id)
              return (
                <HelpWrap key={clock.id} help={{ title: clock.label, body: clock.help }}>
                  <button
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
                </HelpWrap>
              )
            })}
          </div>
        </CardHeader>
        <CardContent>
          <ChartContainer config={clockConfig} className="aspect-auto h-[280px] w-full">
            <ComposedChart data={data} margin={{ left: 4, right: 8, top: 8 }}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="date" tickLine={false} axisLine={false} minTickGap={28} tickFormatter={formatShortDate} />
              <YAxis yAxisId="curve" width={40} tickLine={false} axisLine={false} />
              <YAxis yAxisId="phase" orientation="right" domain={[0, 1]} width={28} tickLine={false} axisLine={false} />
              <ChartTooltip content={<ChartTooltipContent labelFormatter={axisTooltip} />} />
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
          <CardTitle>
            <TitleHelp help={MODULE_CHART_HELP}>Ce que les autres modules voient</TitleHelp>
          </CardTitle>
          <p className="text-sm leading-6 text-muted-foreground">
            {MODULE_CHART_HELP.body} Chartisme : occupation d’une figure et activité. Morpho : écart des trous de la
            grille. Relief : centroïde n1→n5. Pronostic : résidu de la courbe contre sa médiane passée.
          </p>
          <div className="flex flex-wrap gap-2">
            {MODULE_TRACES.map((trace) => {
              const on = modules.includes(trace.id)
              return (
                <HelpWrap key={trace.id} help={{ title: trace.label, body: trace.help }}>
                  <button
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
                </HelpWrap>
              )
            })}
          </div>
        </CardHeader>
        <CardContent>
          <ChartContainer config={moduleConfig} className="aspect-auto h-[200px] w-full">
            <ComposedChart data={moduleData} margin={{ left: 4, right: 8, top: 8 }}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="date" tickLine={false} axisLine={false} minTickGap={28} tickFormatter={formatShortDate} />
              <YAxis domain={[0, 1]} width={28} tickLine={false} axisLine={false} />
              <ChartTooltip content={<ChartTooltipContent labelFormatter={axisTooltip} />} />
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
  help,
}: {
  title: string
  caption: string
  rows: { id: string; label: string; value: number }[]
  help?: HelpCopy
}) {
  const config = { value: { label: "Poids", color: "var(--chart-1)" } } satisfies ChartConfig
  const data = rows.map((row) => ({ ...row, value: Number(row.value.toFixed(3)) }))
  return (
    <Card>
      <CardHeader className="gap-1">
        <CardTitle>
          <TitleHelp help={help ?? { title, body: caption }}>{title}</TitleHelp>
        </CardTitle>
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
    date: row.date,
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
        <CardTitle>
          <TitleHelp help={RIBBON_HELP}>Couverture dans l’archive</TitleHelp>
        </CardTitle>
        <p className="text-sm leading-6 text-muted-foreground">{RIBBON_HELP.body}</p>
      </CardHeader>
      <CardContent>
        <ChartContainer config={config} className="aspect-auto h-[260px] w-full">
          <ComposedChart data={data} margin={{ left: 4, right: 8, top: 8 }}>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="date" tickLine={false} axisLine={false} minTickGap={24} tickFormatter={formatShortDate} />
            <YAxis width={40} tickLine={false} axisLine={false} />
            <ChartTooltip content={<ChartTooltipContent labelFormatter={axisTooltip} />} />
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
  massNext,
  locked,
  flatness,
}: {
  name: string
  mass: number[]
  massNext?: number[]
  locked: boolean
  flatness: number
}) {
  const config = {
    pas: { label: "Pas suivant", color: "var(--chart-1)" },
    horizon: { label: "Tout l’horizon", color: "var(--chart-2)" },
  } satisfies ChartConfig
  const data = mass.map((value, index) => ({
    label: PHASE_TICKS[index] ?? String(index + 1),
    horizon: Number(value.toFixed(3)),
    pas: massNext ? Number((massNext[index] ?? 0).toFixed(3)) : null,
  }))
  return (
    <Card>
      <CardHeader className="gap-1">
        <CardTitle>
          <TitleHelp help={{ ...ATTENTION_HELP, title: weightTitle(name) }}>{weightTitle(name)}</TitleHelp>{" "}
          <span className="inline-flex flex-wrap items-center gap-1 text-sm font-normal text-muted-foreground">
            {locked ? "l’attention se groupe sur une phase" : "l’attention est répartie"}
            · écart {flatness.toFixed(2)}
            <HelpTip title="Écart" body={ATTENTION_FLATNESS} />
          </span>
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          {ATTENTION_HELP.body} « Pas suivant » ne regarde que le premier pas de l’horizon ; « tout l’horizon » somme
          les pas. Une barre dominante veut dire que le modèle revient toujours au même endroit du cycle.
        </p>
      </CardHeader>
      <CardContent>
        <ChartContainer config={config} className="aspect-auto h-[180px] w-full">
          <BarChart data={data} margin={{ left: 4, right: 8, top: 8 }}>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="label" tickLine={false} axisLine={false} />
            <YAxis width={36} tickLine={false} axisLine={false} />
            <ChartTooltip content={<ChartTooltipContent />} />
            <ChartLegend content={<ChartLegendContent />} />
            {massNext ? <Bar dataKey="pas" fill="var(--color-pas)" radius={3} /> : null}
            <Bar dataKey="horizon" fill="var(--color-horizon)" radius={3} />
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}

export function clockRows(signature: CycleSignature) {
  if (signature.vsn_known_grouped?.length) {
    return signature.vsn_known_grouped.map((row) => ({
      id: row.id,
      label: weightTitle(row.id),
      value: row.value,
    }))
  }
  return signatureRows(signature, "known")
}

export function pastReadingRows(signature: CycleSignature) {
  const weights = signature.vsn_past_without_target ?? signature.vsn_past
  const rows = signature.past_ids
    .map((id, index) => ({ id, label: weightTitle(id), value: weights[index] ?? 0 }))
    .filter((row) => row.id !== signature.copy_id)
    .sort((a, b) => b.value - a.value)
    .slice(0, 11)
  if (signature.copy_weight != null) {
    rows.push({ id: "copy", label: "Copie du pas précédent", value: signature.copy_weight })
  }
  return rows
}

export function signatureRows(signature: CycleSignature, kind: "known" | "past") {
  const ids = kind === "known" ? signature.known_ids : signature.past_ids
  const weights = kind === "known" ? signature.vsn_known : signature.vsn_past
  return ids
    .map((id, index) => ({ id, label: weightTitle(id), value: weights[index] ?? 0 }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 12)
}
