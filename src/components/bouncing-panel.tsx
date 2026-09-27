"use client"

import { useEffect, useMemo, useState } from "react"
import {
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceArea,
  ReferenceDot,
  XAxis,
  YAxis,
} from "recharts"

import { HelpTip, TitleHelp, type HelpCopy } from "@/components/help"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import { PillTabs } from "@/components/ui/pill-tabs"
import {
  BOUNCE_SERIES,
  DEFAULT_BOUNCE_QUERY,
  bounceCaptureOf,
  scanBounces,
  type BounceCapture,
  type BounceEpisode,
  type BounceQuery,
} from "@/lib/bouncing"
import { formatShortDate, toDrawSeries, type Draw, type DrawSeriesPoint } from "@/lib/draws"
import { cn } from "@/lib/utils"

const HELP: HelpCopy = {
  title: "Bouncing",
  wide: true,
  body: "Cherche, sur n1…n5 et e1, e2, les passages où la courbe fait des arches de plus en plus basses, comme une balle qui s’amortit. e est la restitution : chaque rebond garde cette fraction de la hauteur précédente. La dérivée de l’arche, sa pente, doit décroître régulièrement et changer de signe au sommet. Les curseurs resserrent la recherche vers la droite. Le bandeau colore l’épisode, le trait plein le suit, les pointillés sont les sommets théoriques. Lecture du tracé, pas un pronostic.",
}

const SLIDER_HELP = {
  bounces: {
    title: "Rebonds minimum",
    body: "Nombre d’arches d’affilée. Vers la droite, il en faut davantage : une oscillation isolée ne suffit plus.",
  },
  r2: {
    title: "Ajustement des hauteurs",
    body: "Qualité de la décroissance, R² du log des hauteurs. Vers la droite, les sommets doivent suivre une exponentielle plus nette.",
  },
  shape: {
    title: "Forme des arches",
    body: "Ressemblance de chaque rebond avec une parabole. Vers la droite, les zigzags anguleux sont écartés.",
  },
  derivative: {
    title: "Dérivée des arches",
    body: "Pente de chaque rebond, lue au-dessus de la corde. Elle doit baisser d’un tirage à l’autre et passer de positive à négative au sommet, comme la dérivée d’une parabole. Vers la droite, cette baisse doit être plus régulière. Deux tirages ne suffisent pas à lire une pente.",
  },
  damping: {
    title: "Amortissement exigé",
    body: "Plafond de la restitution e. Vers la droite, la balle doit perdre plus de hauteur d’un rebond à l’autre.",
  },
  swing: {
    title: "Amplitude minimale",
    body: "Seuil des creux et des sommets, en multiple du réglage de base. Vers la droite, les petits écarts ne comptent plus comme des rebonds.",
  },
} as const satisfies Record<string, HelpCopy>

const FILTERS = [
  { id: "all" as const, label: "Toutes" },
  ...BOUNCE_SERIES.map((id) => ({ id, label: id })),
]

type SeriesFilter = (typeof FILTERS)[number]["id"]

const chartConfig = {
  value: { label: "Série", color: "var(--muted-foreground)" },
  episode: { label: "Épisode", color: "var(--chart-1)" },
  envelope: { label: "Enveloppe", color: "var(--chart-5)" },
} satisfies ChartConfig

function formatRatio(value: number) {
  return value.toLocaleString("fr-FR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function formatDay(iso: string | null) {
  if (!iso) return "?"
  return new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short" }).format(
    new Date(`${iso}T12:00:00`)
  )
}

function formatHalfLife(value: number) {
  if (!Number.isFinite(value)) return "—"
  return value.toLocaleString("fr-FR", { maximumFractionDigits: 1 })
}

function episodeLine(episode: BounceEpisode) {
  return `${episode.series} · ${episode.bounces} rebonds · e ≈ ${formatRatio(episode.restitution)} · hauteurs ×${formatRatio(episode.heightRatio)} · R² ${formatRatio(episode.r2)} · dérivée ${formatRatio(episode.derivative)} · ${formatDay(episode.fromDate)} → ${formatDay(episode.toDate)}`
}

function chartRows(points: DrawSeriesPoint[], episode: BounceEpisode) {
  const envelopeAt = new Map(episode.envelope.map((point) => [point.index, point.value]))
  return points.map((point, index) => {
    const inside = index >= episode.fromIndex && index <= episode.toIndex
    return {
      date: point.date,
      value: point[episode.series],
      episode: inside ? point[episode.series] : null,
      envelope: envelopeAt.get(index) ?? null,
    }
  })
}

function isDefaultQuery(query: BounceQuery) {
  return (
    query.minBounces === DEFAULT_BOUNCE_QUERY.minBounces &&
    query.minR2 === DEFAULT_BOUNCE_QUERY.minR2 &&
    query.minParabola === DEFAULT_BOUNCE_QUERY.minParabola &&
    query.minDerivative === DEFAULT_BOUNCE_QUERY.minDerivative &&
    query.maxRestitution === DEFAULT_BOUNCE_QUERY.maxRestitution &&
    query.swingScale === DEFAULT_BOUNCE_QUERY.swingScale
  )
}

function roundTo(value: number, step: number) {
  const rounded = Math.round(value / step) * step
  return Number(rounded.toFixed(4))
}

export function BouncingPanel({
  draws,
  onEpisode,
  query: queryProp,
  onQuery,
}: {
  draws: Draw[]
  onEpisode?: (episode: BounceCapture | null) => void
  query?: BounceQuery
  onQuery?: (query: BounceQuery) => void
}) {
  const [filter, setFilter] = useState<SeriesFilter>("all")
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [localQuery, setLocalQuery] = useState<BounceQuery>(DEFAULT_BOUNCE_QUERY)
  const query = queryProp ?? localQuery
  const points = useMemo(() => toDrawSeries(draws), [draws])
  const episodes = useMemo(() => scanBounces(points, query), [points, query])
  const visible = useMemo(
    () => (filter === "all" ? episodes : episodes.filter((episode) => episode.series === filter)),
    [episodes, filter]
  )
  const selected = visible.find((episode) => episode.id === selectedId) ?? visible[0] ?? null
  const defaults = isDefaultQuery(query)

  useEffect(() => {
    onEpisode?.(selected ? bounceCaptureOf(selected) : null)
  }, [onEpisode, selected])

  function commit(next: BounceQuery) {
    onQuery?.(next)
    if (!queryProp) setLocalQuery(next)
  }

  function patch(next: Partial<BounceQuery>) {
    commit({ ...query, ...next })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <TitleHelp help={HELP}>Atténuation</TitleHelp>
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          n1 à n5 et e1, e2 sur la fenêtre affichée. Vers la droite, chaque curseur
          resserre la recherche. La dérivée écarte les pointes dont la pente ne suit
          pas une parabole. Une arche qui s’amortit décrit le tracé, elle ne dit
          rien du tirage suivant.
        </p>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <SeveritySliders
          query={query}
          defaults={defaults}
          onChange={patch}
          onReset={() => commit(DEFAULT_BOUNCE_QUERY)}
        />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <PillTabs
            label="Série"
            mode="chips"
            compact
            wrap
            value={filter}
            onValueChange={setFilter}
            items={FILTERS}
          />
          <p className="text-xs tabular-nums text-muted-foreground">
            {visible.length} épisode{visible.length > 1 ? "s" : ""}
          </p>
        </div>
        {visible.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {episodes.length === 0
              ? defaults
                ? "Aucun amortissement de rebond sur cette fenêtre."
                : "Aucun amortissement avec ces seuils."
              : "Aucun amortissement de rebond sur cette série."}
          </p>
        ) : (
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
            <ul className="flex max-h-80 flex-col gap-1.5 overflow-y-auto" aria-label="Épisodes">
              {visible.map((episode) => {
                const active = episode.id === selected?.id
                return (
                  <li key={episode.id}>
                    <button
                      type="button"
                      aria-pressed={active}
                      onClick={() => setSelectedId(episode.id)}
                      className={cn(
                        "w-full rounded-lg px-3 py-2 text-left text-sm leading-5 ring-1 ring-foreground/10",
                        active ? "bg-muted ring-foreground/25" : "hover:bg-muted/60"
                      )}
                    >
                      {episodeLine(episode)}
                    </button>
                  </li>
                )
              })}
            </ul>
            {selected ? <BounceChart points={points} episode={selected} /> : null}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

const E_LOOSE = 0.95
const E_STRICT = 0.55

function SeveritySliders({
  query,
  defaults,
  onChange,
  onReset,
}: {
  query: BounceQuery
  defaults: boolean
  onChange: (next: Partial<BounceQuery>) => void
  onReset: () => void
}) {
  const dampingVisual = roundTo(E_LOOSE + E_STRICT - query.maxRestitution, 0.01)
  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <SliderField
          label="Rebonds minimum"
          help={SLIDER_HELP.bounces}
          ariaLabel="Rebonds minimum"
          min={3}
          max={6}
          step={1}
          value={query.minBounces}
          display={String(query.minBounces)}
          onChange={(value) => onChange({ minBounces: value })}
        />
        <SliderField
          label="Ajustement des hauteurs"
          help={SLIDER_HELP.r2}
          ariaLabel="Ajustement des hauteurs"
          min={0.4}
          max={0.95}
          step={0.05}
          value={query.minR2}
          display={`R² ${formatRatio(query.minR2)}`}
          onChange={(value) => onChange({ minR2: roundTo(value, 0.05) })}
        />
        <SliderField
          label="Forme des arches"
          help={SLIDER_HELP.shape}
          ariaLabel="Forme des arches"
          min={0.5}
          max={0.95}
          step={0.05}
          value={query.minParabola}
          display={formatRatio(query.minParabola)}
          onChange={(value) => onChange({ minParabola: roundTo(value, 0.05) })}
        />
        <SliderField
          label="Dérivée des arches"
          help={SLIDER_HELP.derivative}
          ariaLabel="Dérivée des arches"
          min={0.2}
          max={0.9}
          step={0.05}
          value={query.minDerivative}
          display={formatRatio(query.minDerivative)}
          onChange={(value) => onChange({ minDerivative: roundTo(value, 0.05) })}
        />
        <SliderField
          label="Amortissement exigé"
          help={SLIDER_HELP.damping}
          ariaLabel="Amortissement exigé"
          min={E_STRICT}
          max={E_LOOSE}
          step={0.01}
          value={dampingVisual}
          display={`e ≤ ${formatRatio(query.maxRestitution)}`}
          onChange={(value) => onChange({ maxRestitution: roundTo(E_LOOSE + E_STRICT - value, 0.01) })}
        />
        <SliderField
          label="Amplitude minimale"
          help={SLIDER_HELP.swing}
          ariaLabel="Amplitude minimale"
          min={1}
          max={3}
          step={0.25}
          value={query.swingScale}
          display={`×${query.swingScale.toLocaleString("fr-FR", { maximumFractionDigits: 2 })}`}
          onChange={(value) => onChange({ swingScale: roundTo(value, 0.25) })}
        />
      </div>
      <div>
        <Button type="button" variant="outline" size="sm" onClick={onReset} disabled={defaults}>
          Réglages d’origine
        </Button>
      </div>
    </div>
  )
}

function SliderField({
  label,
  help,
  ariaLabel,
  min,
  max,
  step,
  value,
  display,
  onChange,
}: {
  label: string
  help: HelpCopy
  ariaLabel: string
  min: number
  max: number
  step: number
  value: number
  display: string
  onChange: (value: number) => void
}) {
  return (
    <label className="flex min-w-0 flex-col gap-1 text-xs text-muted-foreground">
      <span className="inline-flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1">
          {label}
          <HelpTip {...help} />
        </span>
        <span className="tabular-nums text-foreground">{display}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-label={ariaLabel}
        onChange={(event) => onChange(Number(event.target.value))}
        className="accent-primary"
      />
    </label>
  )
}

function BounceChart({
  points,
  episode,
}: {
  points: DrawSeriesPoint[]
  episode: BounceEpisode
}) {
  const rows = chartRows(points, episode)
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <p className="text-sm tabular-nums">
        {episode.series} · e {formatRatio(episode.restitution)} · hauteurs ×
        {formatRatio(episode.heightRatio)} · R² {formatRatio(episode.r2)} · forme{" "}
        {formatRatio(episode.parabola)} · dérivée {formatRatio(episode.derivative)} · demi-vie{" "}
        {formatHalfLife(episode.halfLifeDraws)} tirages
      </p>
      <ChartContainer config={chartConfig} className="aspect-auto h-64 w-full">
        <ComposedChart data={rows} margin={{ left: 4, right: 8, top: 8 }}>
          <CartesianGrid vertical={false} />
          <XAxis
            dataKey="date"
            tickLine={false}
            axisLine={false}
            minTickGap={28}
            tickFormatter={(value) => formatShortDate(String(value))}
          />
          <YAxis width={36} tickLine={false} axisLine={false} />
          <ChartTooltip
            content={
              <ChartTooltipContent
                labelFormatter={(value) => formatShortDate(String(value))}
              />
            }
          />
          <ReferenceArea
            x1={points[episode.fromIndex]?.date}
            x2={points[episode.toIndex]?.date}
            fill="var(--chart-1)"
            fillOpacity={0.12}
            strokeOpacity={0}
          />
          <Line
            type="monotone"
            dataKey="value"
            stroke="var(--color-value)"
            dot={false}
            strokeWidth={1.5}
            isAnimationActive={false}
          />
          <Line
            type="monotone"
            dataKey="episode"
            stroke="var(--color-episode)"
            dot={false}
            strokeWidth={2.5}
            connectNulls={false}
            isAnimationActive={false}
          />
          <Line
            type="monotone"
            dataKey="envelope"
            stroke="var(--color-envelope)"
            strokeDasharray="4 4"
            dot={false}
            strokeWidth={1.5}
            connectNulls
            isAnimationActive={false}
          />
          {episode.impacts.map((point) => (
            <ReferenceDot
              key={`impact-${point.index}`}
              x={points[point.index]?.date}
              y={point.value}
              r={3}
              fill="var(--chart-3)"
              stroke="none"
            />
          ))}
          {episode.apexes.map((point) => (
            <ReferenceDot
              key={`apex-${point.index}`}
              x={points[point.index]?.date}
              y={point.value}
              r={3.5}
              fill="var(--chart-1)"
              stroke="none"
            />
          ))}
        </ComposedChart>
      </ChartContainer>
      <p className="text-xs text-muted-foreground">
        Trait pâle : toute la fenêtre. Trait plein : épisode. Pointillés : sommets
        théoriques. Points : contacts au sol et sommets observés.
      </p>
    </div>
  )
}
