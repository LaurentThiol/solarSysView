"use client"

import { Fragment, useMemo, useState } from "react"
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  XAxis,
  YAxis,
} from "recharts"

import { HelpTip, LabelHelp, TitleHelp, type HelpCopy } from "@/components/help"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select"
import {
  bandExcursions,
  mapBandPoint,
  overlayBands,
  overlayField,
  overlayPeriodFor,
  overlayRecord,
  readOverlay,
  type BandPoint,
} from "@/lib/draw-overlays"
import { cn } from "@/lib/utils"
import {
  NUMBER_SUM_RANGE,
  STAR_SUM_RANGE,
  type Draw,
  formatDrawDate,
  formatShortDate,
  pearsonCorrelation,
  rangeFromValues,
  relativeToRange,
  summarizeValues,
  toDrawSeries,
  type ValueRange,
} from "@/lib/draws"

export type DrawChartMode =
  | "sumBoth"
  | "sumNumbers"
  | "eachNumber"
  | "sumStars"
  | "eachStar"

type RelativeScale = "theory" | "window"

const MODES: { value: DrawChartMode; label: string }[] = [
  { value: "sumBoth", label: "Sommes (relatif)" },
  { value: "sumNumbers", label: "Somme des numéros" },
  { value: "eachNumber", label: "Chaque numéro" },
  { value: "sumStars", label: "Somme des étoiles" },
  { value: "eachStar", label: "Chaque étoile" },
]

const SCALE_OPTIONS: { value: RelativeScale; label: string }[] = [
  { value: "theory", label: "Plage possible" },
  { value: "window", label: "Fenêtre" },
]

const chartConfig = {
  sumNumbers: { label: "Somme", color: "var(--chart-1)" },
  relNumbers: { label: "Somme numéros", color: "var(--chart-1)" },
  n1: { label: "n1", color: "var(--chart-1)" },
  n2: { label: "n2", color: "var(--chart-2)" },
  n3: { label: "n3", color: "var(--chart-3)" },
  n4: { label: "n4", color: "var(--chart-4)" },
  n5: { label: "n5", color: "var(--chart-5)" },
  sumStars: { label: "Somme étoiles", color: "var(--chart-2)" },
  relStars: { label: "Somme étoiles", color: "var(--chart-2)" },
  e1: { label: "e1", color: "var(--chart-1)" },
  e2: { label: "e2", color: "var(--chart-2)" },
  sma: { label: "SMA", color: "var(--chart-2)" },
  bbUpper: { label: "Bollinger +", color: "var(--chart-5)" },
  bbLower: { label: "Bollinger −", color: "var(--chart-5)" },
} satisfies ChartConfig

type SeriesKey =
  | "sumNumbers"
  | "relNumbers"
  | "n1"
  | "n2"
  | "n3"
  | "n4"
  | "n5"
  | "sumStars"
  | "relStars"
  | "e1"
  | "e2"

type ChartPoint = ReturnType<typeof toDrawSeries>[number] &
  Record<string, number | string | null>

const MODE_KEYS: Record<DrawChartMode, SeriesKey[]> = {
  sumBoth: ["relNumbers", "relStars"],
  sumNumbers: ["sumNumbers"],
  eachNumber: ["n1", "n2", "n3", "n4", "n5"],
  sumStars: ["sumStars"],
  eachStar: ["e1", "e2"],
}

const TITLE_HELP: Record<DrawChartMode, HelpCopy> = {
  sumBoth: {
    title: "Évolution dans le temps",
    body: "Chaque point est un tirage. Le mode Sommes (relatif) superpose numéros et étoiles sur 0–100 %. Sur 20 ou 50 tirages la courbe se lit mieux. SMA et Bollinger (optionnels) lissent ou encadrent la somme ; ce n’est pas un signal de jeu.",
  },
  sumNumbers: {
    title: "Évolution dans le temps",
    body: "Chaque point est un tirage. Sur 20 ou 50 tirages la courbe se lit mieux. SMA et Bollinger (optionnels) décrivent la somme ; ce n’est pas un signal de jeu.",
  },
  eachNumber: {
    title: "n1 à n5 — statistiques d’ordre",
    wide: true,
    body: `n1 à n5 sont les 5 boules du tirage EuroMillions, triées du plus petit au plus grand. Ce n’est pas l’ordre de sortie des boules.

n1 = plus petit, n2 = 2ᵉ plus petit, n3 = médian, n4 = 2ᵉ plus grand, n5 = plus grand. Exemple : {12, 41, 7, 28, 19} → n1 = 7, n2 = 12, n3 = 19, n4 = 28, n5 = 41.

Chaque point est un tirage, en ordre chronologique. L’axe Y va de 1 à 50.

SMA et Bollinger sont optionnels, une courbe à la fois (la série visible). Maj+clic sur un n l’isole pour lire sa bande. Lissage descriptif, pas une prédiction.

Les min / max / moy. sous le graphe décrivent chaque série sur la fenêtre affichée, pas un tirage isolé.`,
  },
  sumStars: {
    title: "Évolution dans le temps",
    body: "Chaque point est un tirage. La courbe est la somme des 2 étoiles. SMA et Bollinger (optionnels) décrivent cette somme ; ce n’est pas un signal de jeu.",
  },
  eachStar: {
    title: "e1 et e2 — statistiques d’ordre",
    wide: true,
    body: `e1 et e2 sont les 2 étoiles du tirage, triées du plus petit au plus grand — pas l’ordre de sortie.

e1 = plus petite étoile, e2 = plus grande. L’axe Y va de 1 à 12. SMA et Bollinger optionnels, comme pour n1–n5. Maj+clic isole une courbe. Les min / max / moy. portent sur la fenêtre affichée.`,
  },
}

const SERIES_HELP: Record<SeriesKey, HelpCopy> = {
  relNumbers: {
    title: "Somme numéros",
    body: "Somme des 5 boules, tracée en % de l’échelle choisie. Cliquez la pastille pour masquer. Maj+clic : cette courbe seule.",
  },
  relStars: {
    title: "Somme étoiles",
    body: "Somme des 2 étoiles, tracée en % de l’échelle choisie. Cliquez la pastille pour masquer. Maj+clic : cette courbe seule.",
  },
  sumNumbers: {
    title: "Somme",
    body: "Somme des 5 boules du tirage (typiquement 80–180). Cliquez la pastille pour masquer la courbe.",
  },
  n1: {
    title: "n1 — plus petit numéro",
    body: "Plus petit des 5 numéros du tirage, après tri croissant. Ce n’est pas la première boule sortie.\n\nCliquez pour afficher ou masquer. Maj+clic : n1 seul (utile pour SMA / Bollinger).",
  },
  n2: {
    title: "n2 — 2ᵉ plus petit",
    body: "Deuxième plus petit des 5 numéros du tirage (ordre croissant), pas la 2ᵉ boule sortie.\n\nCliquez pour afficher ou masquer. Maj+clic : n2 seul.",
  },
  n3: {
    title: "n3 — médian",
    body: "Numéro du milieu des 5 boules, après tri croissant.\n\nCliquez pour afficher ou masquer. Maj+clic : n3 seul.",
  },
  n4: {
    title: "n4 — 2ᵉ plus grand",
    body: "Deuxième plus grand des 5 numéros du tirage (ordre croissant).\n\nCliquez pour afficher ou masquer. Maj+clic : n4 seul.",
  },
  n5: {
    title: "n5 — plus grand numéro",
    body: "Plus grand des 5 numéros du tirage, après tri croissant. Ce n’est pas la dernière boule sortie.\n\nCliquez pour afficher ou masquer. Maj+clic : n5 seul.",
  },
  sumStars: {
    title: "Somme étoiles",
    body: "Somme des 2 étoiles du tirage. Cliquez la pastille pour masquer la courbe.",
  },
  e1: {
    title: "e1 — plus petite étoile",
    body: "Plus petite des 2 étoiles, après tri croissant — pas la première étoile sortie.\n\nCliquez pour afficher ou masquer. Maj+clic : e1 seule.",
  },
  e2: {
    title: "e2 — plus grande étoile",
    body: "Plus grande des 2 étoiles, après tri croissant — pas la dernière étoile sortie.\n\nCliquez pour afficher ou masquer. Maj+clic : e2 seule.",
  },
}

const SERIES_SELECT_HELP: HelpCopy = {
  title: "Série affichée",
  wide: true,
  body: `Sommes superposées (échelle relative 0–100 %), somme des 5 numéros, chacune des 5 boules, somme des 2 étoiles, ou chaque étoile. L’axe Y s’adapte (0–100 %, 1–50 ou 1–12).

« Chaque numéro » trace n1 à n5 : les 5 boules triées du plus petit au plus grand, pas l’ordre de sortie. « Chaque étoile » fait de même pour e1 < e2. SMA et Bollinger s’appliquent à chaque courbe visible.`,
}

const SUMMARY_HELP: HelpCopy = {
  title: "min · max · moy.",
  body: "Minimum, maximum et moyenne arithmétique de chaque série visible, calculés sur tous les tirages de la fenêtre — pas sur un seul tirage.",
}

const SMA_HELP: HelpCopy = {
  title: "SMA",
  body: "Moyenne simple sur la période auto (5 tirages si la fenêtre a au moins 10 points, 10 si au moins 40). Une courbe par série visible. Lissage descriptif, pas une prédiction.",
}

const BB_HELP: HelpCopy = {
  title: "Bollinger",
  body: "Bandes SMA ± 2σ de chaque série visible. Le milieu est la SMA. %B dans l’infobulle : 0 = bande basse, 1 = bande haute. Maj+clic sur un n pour isoler sa bande. Dispersion observée, pas un signal de jeu.",
}

function isRankMode(mode: DrawChartMode) {
  return mode === "eachNumber" || mode === "eachStar"
}

function yDomain(mode: DrawChartMode): [number, number] | [number, "auto"] {
  if (mode === "sumBoth") return [0, 100]
  if (mode === "eachNumber") return [1, 50]
  if (mode === "eachStar") return [1, 12]
  if (mode === "sumStars") return [3, "auto"]
  return [15, "auto"]
}

function yDomainLocked(mode: DrawChartMode) {
  return typeof yDomain(mode)[1] === "number"
}

function formatStat(value: number) {
  return value.toLocaleString("fr-FR", {
    maximumFractionDigits: 1,
    minimumFractionDigits: 0,
  })
}

function formatPct(value: number) {
  return `${value.toLocaleString("fr-FR", { maximumFractionDigits: 0 })} %`
}

function formatPctB(value: number) {
  return value.toLocaleString("fr-FR", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  })
}

function resolveRange(
  scale: RelativeScale,
  values: number[],
  theory: ValueRange
): ValueRange {
  if (scale === "window") return rangeFromValues(values) ?? theory
  return theory
}

function sourceKey(
  key: SeriesKey
): "sumNumbers" | "sumStars" | "n1" | "n2" | "n3" | "n4" | "n5" | "e1" | "e2" {
  if (key === "relNumbers") return "sumNumbers"
  if (key === "relStars") return "sumStars"
  return key
}

function mergeOverlays(
  points: ChartPoint[],
  key: SeriesKey,
  absBands: BandPoint[],
  chartBands: BandPoint[]
): ChartPoint[] {
  return points.map((point, i) => ({
    ...point,
    ...overlayRecord(key, chartBands[i], absBands[i]),
  }))
}

function CombinedTooltip({
  active,
  payload,
  label,
  smaPeriod,
  showSma,
  showBb,
  hidden,
}: {
  active?: boolean
  payload?: Array<{
    dataKey?: string | number
    payload?: ChartPoint
  }>
  label?: string
  smaPeriod: number
  showSma: boolean
  showBb: boolean
  hidden: Partial<Record<SeriesKey, boolean>>
}) {
  if (!active || !payload?.length) return null
  const point = payload[0]?.payload
  if (!point) return null

  const rows: {
    key: string
    label: string
    actual: number | null
    rel: number | null
    extra?: string
    color: string
  }[] = []

  const specs: { key: SeriesKey; label: string; actual: number }[] = [
    { key: "relNumbers", label: "Somme numéros", actual: point.sumNumbers },
    { key: "relStars", label: "Somme étoiles", actual: point.sumStars },
  ]

  for (const spec of specs) {
    if (hidden[spec.key]) continue
    rows.push({
      key: spec.key,
      label: spec.label,
      actual: spec.actual,
      rel: Number(point[spec.key]),
      color: chartConfig[spec.key].color,
    })
    if (showSma) {
      rows.push({
        key: `${spec.key}-sma`,
        label: `SMA ${smaPeriod} ${spec.key === "relNumbers" ? "numéros" : "étoiles"}`,
        actual: readOverlay(point, spec.key, "smaAbs"),
        rel: readOverlay(point, spec.key, "sma"),
        color: chartConfig[spec.key].color,
      })
    }
    if (showBb) {
      const lo = readOverlay(point, spec.key, "bbLowerAbs")
      const hi = readOverlay(point, spec.key, "bbUpperAbs")
      const pctB = readOverlay(point, spec.key, "pctB")
      rows.push({
        key: `${spec.key}-bb`,
        label: "Bollinger",
        actual: null,
        rel: null,
        extra:
          lo == null || hi == null
            ? "—"
            : `${formatStat(lo)} – ${formatStat(hi)}${
                pctB == null ? "" : ` · %B ${formatPctB(pctB)}`
              }`,
        color: chartConfig[spec.key].color,
      })
    }
  }

  return (
    <div className="grid min-w-40 items-start gap-1.5 rounded-lg border border-border/50 bg-background px-2.5 py-1.5 text-xs shadow-xl">
      <div className="font-medium">{formatDrawDate(String(label ?? point.date))}</div>
      <div className="grid gap-1.5">
        {rows.map((row) => (
          <div key={row.key} className="flex items-center gap-2">
            <span
              className="size-2.5 shrink-0 rounded-[2px]"
              style={{ background: row.color }}
            />
            <span className="flex-1 text-muted-foreground">{row.label}</span>
            {row.extra ? (
              <span className="font-mono font-medium tabular-nums">{row.extra}</span>
            ) : (
              <>
                <span className="font-mono font-medium tabular-nums">
                  {row.actual == null ? "—" : formatStat(row.actual)}
                </span>
                <span className="w-12 text-right font-mono text-muted-foreground tabular-nums">
                  {row.rel == null ? "—" : formatPct(row.rel)}
                </span>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

function SeriesTooltip({
  active,
  payload,
  label,
  keys,
  hidden,
  smaPeriod,
  showSma,
  showBb,
  combined,
}: {
  active?: boolean
  payload?: Array<{
    dataKey?: string | number
    payload?: ChartPoint
  }>
  label?: string
  keys: SeriesKey[]
  hidden: Partial<Record<SeriesKey, boolean>>
  smaPeriod: number
  showSma: boolean
  showBb: boolean
  combined: boolean
}) {
  if (combined) {
    return (
      <CombinedTooltip
        active={active}
        payload={payload}
        label={label}
        smaPeriod={smaPeriod}
        showSma={showSma}
        showBb={showBb}
        hidden={hidden}
      />
    )
  }
  if (!active || !payload?.length) return null
  const point = payload[0]?.payload
  if (!point) return null

  return (
    <div className="grid min-w-40 items-start gap-1.5 rounded-lg border border-border/50 bg-background px-2.5 py-1.5 text-xs shadow-xl">
      <div className="font-medium">{formatDrawDate(String(label ?? point.date))}</div>
      <div className="grid gap-1.5">
        {keys
          .filter((key) => !hidden[key])
          .map((key) => {
            const value = point[key]
            const sma = showSma ? readOverlay(point, key, "sma") : null
            const lo = showBb ? readOverlay(point, key, "bbLower") : null
            const hi = showBb ? readOverlay(point, key, "bbUpper") : null
            const pctB = showBb ? readOverlay(point, key, "pctB") : null
            return (
              <div key={key} className="grid gap-0.5">
                <div className="flex items-center gap-2">
                  <span
                    className="size-2.5 shrink-0 rounded-[2px]"
                    style={{ background: chartConfig[key].color }}
                  />
                  <span className="flex-1 text-muted-foreground">
                    {chartConfig[key].label}
                  </span>
                  <span className="font-mono font-medium tabular-nums">
                    {typeof value === "number" ? formatStat(value) : "—"}
                  </span>
                </div>
                {showSma ? (
                  <div className="flex items-center gap-2 pl-4 text-muted-foreground">
                    <span className="flex-1">SMA {smaPeriod}</span>
                    <span className="font-mono tabular-nums">
                      {sma == null ? "—" : formatStat(sma)}
                    </span>
                  </div>
                ) : null}
                {showBb ? (
                  <div className="flex items-center gap-2 pl-4 text-muted-foreground">
                    <span className="flex-1">Bollinger</span>
                    <span className="font-mono tabular-nums">
                      {lo == null || hi == null
                        ? "—"
                        : `${formatStat(lo)} – ${formatStat(hi)}${
                            pctB == null ? "" : ` · %B ${formatPctB(pctB)}`
                          }`}
                    </span>
                  </div>
                ) : null}
              </div>
            )
          })}
      </div>
    </div>
  )
}

export function DrawChart({ draws }: { draws: Draw[] }) {
  const [mode, setMode] = useState<DrawChartMode>("sumBoth")
  const [scale, setScale] = useState<RelativeScale>("theory")
  const [hidden, setHidden] = useState<Partial<Record<SeriesKey, boolean>>>({})
  const [showSma, setShowSma] = useState(true)
  const [showBb, setShowBb] = useState(false)

  const series = useMemo(() => toDrawSeries(draws), [draws])
  const keys = MODE_KEYS[mode]
  const visibleKeys = keys.filter((key) => !hidden[key])
  const combined = mode === "sumBoth"
  const smaPeriod = overlayPeriodFor(series.length)
  const rankMode = isRankMode(mode)

  const overlayPacks = useMemo(() => {
    const packs: Partial<
      Record<SeriesKey, { abs: BandPoint[]; values: number[] }>
    > = {}
    if (!smaPeriod) return packs
    for (const key of keys) {
      const values = series.map((point) => point[sourceKey(key)])
      packs[key] = { abs: overlayBands(values, smaPeriod), values }
    }
    return packs
  }, [series, keys, smaPeriod])

  const chartData = useMemo(() => {
    let points: ChartPoint[] = series
    if (combined) {
      const numberRange = resolveRange(
        scale,
        series.map((point) => point.sumNumbers),
        NUMBER_SUM_RANGE
      )
      const starRange = resolveRange(
        scale,
        series.map((point) => point.sumStars),
        STAR_SUM_RANGE
      )
      points = series.map((point) => ({
        ...point,
        relNumbers: relativeToRange(point.sumNumbers, numberRange),
        relStars: relativeToRange(point.sumStars, starRange),
      }))
      if (smaPeriod) {
        const nAbs = overlayPacks.relNumbers?.abs ?? []
        const sAbs = overlayPacks.relStars?.abs ?? []
        points = mergeOverlays(
          points,
          "relNumbers",
          nAbs,
          nAbs.map((band) => mapBandPoint(band, (value) => relativeToRange(value, numberRange)))
        )
        points = mergeOverlays(
          points,
          "relStars",
          sAbs,
          sAbs.map((band) => mapBandPoint(band, (value) => relativeToRange(value, starRange)))
        )
      }
      return points
    }
    if (!smaPeriod) return points
    for (const key of keys) {
      const abs = overlayPacks[key]?.abs
      if (!abs) continue
      points = mergeOverlays(points, key, abs, abs)
    }
    return points
  }, [series, smaPeriod, combined, scale, keys, overlayPacks])

  const summaries = useMemo(() => {
    const items: { key: string; label: string; min: number; max: number; avg: number }[] =
      []
    if (combined) {
      const pairs = [
        {
          hiddenKey: "relNumbers" as const,
          valueKey: "sumNumbers" as const,
          label: chartConfig.relNumbers.label,
        },
        {
          hiddenKey: "relStars" as const,
          valueKey: "sumStars" as const,
          label: chartConfig.relStars.label,
        },
      ]
      for (const pair of pairs) {
        if (hidden[pair.hiddenKey]) continue
        const stats = summarizeValues(series.map((point) => point[pair.valueKey]))
        if (stats) items.push({ key: pair.valueKey, label: pair.label, ...stats })
      }
      return items
    }
    for (const key of visibleKeys) {
      if (key === "relNumbers" || key === "relStars") continue
      const stats = summarizeValues(series.map((point) => point[key]))
      if (stats) items.push({ key, label: chartConfig[key].label, ...stats })
    }
    return items
  }, [series, visibleKeys, combined, hidden])

  const excursions = useMemo(() => {
    if (!showBb || !smaPeriod) return []
    return visibleKeys
      .map((key) => {
        const pack = overlayPacks[key]
        if (!pack) return null
        const stats = bandExcursions(pack.values, pack.abs)
        if (!stats.ready) return null
        return { key, label: chartConfig[key].label, ...stats }
      })
      .filter((item): item is { key: SeriesKey; label: string; outside: number; ready: number } =>
        Boolean(item)
      )
  }, [showBb, smaPeriod, visibleKeys, overlayPacks])

  const correlation = useMemo(() => {
    if (!combined || series.length < 3) return null
    return pearsonCorrelation(
      series.map((point) => point.sumNumbers),
      series.map((point) => point.sumStars)
    )
  }, [combined, series])

  function changeMode(next: DrawChartMode) {
    const leavingSums = !isRankMode(mode)
    const enteringSums = isRankMode(mode) && !isRankMode(next)
    setMode(next)
    setHidden({})
    if (leavingSums && isRankMode(next)) {
      setShowSma(false)
      setShowBb(false)
    } else if (enteringSums) {
      setShowSma(true)
      setShowBb(false)
    }
  }

  function toggleSeries(key: SeriesKey, solo: boolean) {
    if (solo) {
      const alreadySolo =
        !hidden[key] && keys.every((item) => item === key || hidden[item])
      if (alreadySolo) {
        setHidden({})
        return
      }
      setHidden(Object.fromEntries(keys.map((item) => [item, item !== key])))
      return
    }
    setHidden((current) => ({
      ...current,
      [key]: !current[key],
    }))
  }

  function overlayStroke(key: SeriesKey, kind: "sma" | "bb"): string {
    if (visibleKeys.length === 1) {
      return kind === "sma" ? "var(--color-sma)" : "var(--color-bbUpper)"
    }
    return `var(--color-${key})`
  }

  const useCustomTooltip = combined || showSma || showBb || rankMode

  return (
    <Card>
      <CardHeader className="gap-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="text-base font-medium">
            <TitleHelp help={TITLE_HELP[mode]}>
              Évolution dans le temps
            </TitleHelp>
          </CardTitle>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            {combined ? (
              <div className="flex flex-col gap-1">
                <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                  Échelle
                  <HelpTip
                    title="Échelle relative"
                    body="Plage possible : 0 % = minimum théorique (15 et 3), 100 % = maximum (240 et 23). 50 % = moyenne théorique. Fenêtre : chaque série est étirée entre son min et max de la période, pour comparer les formes."
                  />
                </span>
                <div className="flex flex-wrap gap-1.5" role="group" aria-label="Échelle relative">
                  {SCALE_OPTIONS.map((item) => (
                    <button
                      key={item.value}
                      type="button"
                      aria-pressed={scale === item.value}
                      onClick={() => setScale(item.value)}
                      className={cn(
                        "rounded-full border px-2.5 py-1 text-xs",
                        scale === item.value
                          ? "border-primary bg-primary/15 text-foreground"
                          : "border-border text-muted-foreground hover:text-foreground"
                      )}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
            <LabelHelp label="Série" help={SERIES_SELECT_HELP}>
              <Select
                value={mode}
                onValueChange={(value) => changeMode(value as DrawChartMode)}
              >
                <SelectTrigger className="w-full sm:w-64 sm:shrink-0" aria-label="Série affichée">
                  <span className="flex flex-1 text-left">
                    {MODES.find((item) => item.value === mode)?.label}
                  </span>
                </SelectTrigger>
                <SelectContent>
                  {MODES.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </LabelHelp>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {series.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Aucun tirage à tracer : affinez le filtre.
          </p>
        ) : (
          <>
            <ChartContainer
              config={chartConfig}
              className="aspect-auto h-[280px] w-full sm:h-[340px]"
            >
              <ComposedChart
                key={`${mode}-${combined ? scale : "abs"}`}
                accessibilityLayer
                data={chartData}
                margin={{ left: 4, right: 8, top: combined ? 16 : 8, bottom: 4 }}
              >
                <CartesianGrid vertical={false} />
                <XAxis
                  dataKey="date"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  minTickGap={28}
                  tickFormatter={formatShortDate}
                />
                <YAxis
                  domain={yDomain(mode)}
                  width={combined ? 42 : 36}
                  tickLine={false}
                  axisLine={false}
                  allowDecimals={false}
                  allowDataOverflow={yDomainLocked(mode)}
                  tickFormatter={combined ? (value) => `${value}%` : undefined}
                />
                {combined && scale === "theory" ? (
                  <ReferenceLine
                    y={50}
                    stroke="var(--muted-foreground)"
                    strokeOpacity={0.4}
                    strokeDasharray="4 4"
                  />
                ) : null}
                <ChartTooltip
                  content={
                    useCustomTooltip ? (
                      <SeriesTooltip
                        keys={keys}
                        hidden={hidden}
                        smaPeriod={smaPeriod}
                        showSma={showSma && smaPeriod > 0}
                        showBb={showBb && smaPeriod > 0}
                        combined={combined}
                      />
                    ) : (
                      <ChartTooltipContent
                        labelFormatter={(value) =>
                          formatDrawDate(String(value ?? ""))
                        }
                      />
                    )
                  }
                />
                {showBb && smaPeriod > 0 && visibleKeys.length === 1
                  ? visibleKeys.map((key) => (
                      <Fragment key={`bb-fill-${key}`}>
                        <Area
                          type="monotone"
                          dataKey={overlayField(key, "bbBase")}
                          stackId={`bb-${key}`}
                          fill="transparent"
                          stroke="none"
                          legendType="none"
                          tooltipType="none"
                          connectNulls
                          isAnimationActive={false}
                        />
                        <Area
                          type="monotone"
                          dataKey={overlayField(key, "bbSpan")}
                          stackId={`bb-${key}`}
                          fill={overlayStroke(key, "bb")}
                          fillOpacity={0.14}
                          stroke="none"
                          legendType="none"
                          tooltipType="none"
                          connectNulls
                          isAnimationActive={false}
                        />
                      </Fragment>
                    ))
                  : null}
                {keys.map((key) => (
                  <Line
                    key={key}
                    dataKey={key}
                    type="monotone"
                    stroke={`var(--color-${key})`}
                    strokeWidth={2}
                    hide={Boolean(hidden[key])}
                    dot={series.length > 24 ? { r: 2 } : { r: 3 }}
                    activeDot={{ r: 4 }}
                  />
                ))}
                {smaPeriod > 0 && showSma
                  ? visibleKeys.map((key) => (
                      <Line
                        key={`sma-${key}`}
                        dataKey={overlayField(key, "sma")}
                        type="monotone"
                        stroke={overlayStroke(key, "sma")}
                        strokeWidth={2}
                        strokeDasharray="5 4"
                        dot={false}
                        connectNulls
                        legendType="none"
                        name={`SMA ${smaPeriod} ${chartConfig[key].label}`}
                      />
                    ))
                  : null}
                {smaPeriod > 0 && showBb
                  ? visibleKeys.map((key) => (
                      <Fragment key={`bb-${key}`}>
                        <Line
                          dataKey={overlayField(key, "bbUpper")}
                          type="monotone"
                          stroke={overlayStroke(key, "bb")}
                          strokeWidth={1.25}
                          strokeDasharray="2 3"
                          strokeOpacity={visibleKeys.length === 1 ? 1 : 0.7}
                          dot={false}
                          connectNulls
                          legendType="none"
                          name={`Bollinger + ${chartConfig[key].label}`}
                        />
                        <Line
                          dataKey={overlayField(key, "bbLower")}
                          type="monotone"
                          stroke={overlayStroke(key, "bb")}
                          strokeWidth={1.25}
                          strokeDasharray="2 3"
                          strokeOpacity={visibleKeys.length === 1 ? 1 : 0.7}
                          dot={false}
                          connectNulls
                          legendType="none"
                          name={`Bollinger − ${chartConfig[key].label}`}
                        />
                        {!showSma ? (
                          <Line
                            dataKey={overlayField(key, "sma")}
                            type="monotone"
                            stroke={overlayStroke(key, "sma")}
                            strokeWidth={1.5}
                            strokeDasharray="4 3"
                            dot={false}
                            connectNulls
                            legendType="none"
                            name={`Bollinger ${chartConfig[key].label}`}
                          />
                        ) : null}
                      </Fragment>
                    ))
                  : null}
              </ComposedChart>
            </ChartContainer>
            <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
              {smaPeriod > 0 ? (
                <>
                  <span className="inline-flex items-center gap-1">
                    <button
                      type="button"
                      aria-pressed={showSma}
                      title={`Afficher ou masquer la SMA ${smaPeriod}`}
                      onClick={() => setShowSma((current) => !current)}
                      className={cn(
                        "flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-xs transition-opacity hover:bg-muted",
                        !showSma && "opacity-40"
                      )}
                    >
                      <span
                        className="size-2 shrink-0 rounded-[2px]"
                        style={{
                          background:
                            visibleKeys.length === 1
                              ? chartConfig.sma.color
                              : chartConfig[visibleKeys[0] ?? keys[0]].color,
                          boxShadow: "inset 0 0 0 1px transparent",
                        }}
                      />
                      SMA {smaPeriod}
                    </button>
                    <HelpTip {...SMA_HELP} />
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <button
                      type="button"
                      aria-pressed={showBb}
                      title="Afficher ou masquer les bandes de Bollinger"
                      onClick={() => setShowBb((current) => !current)}
                      className={cn(
                        "flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-xs transition-opacity hover:bg-muted",
                        !showBb && "opacity-40"
                      )}
                    >
                      <span
                        className="size-2 shrink-0 rounded-[2px] border border-dashed"
                        style={{
                          borderColor: chartConfig.bbUpper.color,
                          background: "transparent",
                        }}
                      />
                      Bollinger
                    </button>
                    <HelpTip {...BB_HELP} />
                  </span>
                </>
              ) : null}
              {keys.map((key) => (
                <span key={key} className="inline-flex items-center gap-1">
                  <button
                    type="button"
                    aria-pressed={!hidden[key]}
                    title={`Afficher ou masquer ${chartConfig[key].label}. Maj+clic : cette courbe seule.`}
                    onClick={(event) => toggleSeries(key, event.shiftKey)}
                    className={cn(
                      "flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-xs transition-opacity hover:bg-muted",
                      hidden[key] && "opacity-40"
                    )}
                  >
                    <span
                      className="size-2 shrink-0 rounded-[2px]"
                      style={{ background: chartConfig[key].color }}
                    />
                    {chartConfig[key].label}
                  </button>
                  <HelpTip {...SERIES_HELP[key]} />
                </span>
              ))}
            </div>
            {rankMode && (showSma || showBb) && visibleKeys.length > 2 ? (
              <p className="mt-2 text-center text-xs text-muted-foreground">
                Maj+clic sur un n pour n’afficher que sa SMA / bande.
              </p>
            ) : null}
            {combined ? (
              <p className="mt-3 text-center text-xs text-muted-foreground">
                {scale === "theory"
                  ? "0–100 % de la plage possible (numéros 15–240, étoiles 3–23). Trait à 50 % = moyenne théorique. Infobulle : sommes réelles."
                  : "0–100 % du min–max de la fenêtre, série par série, pour comparer les formes. Infobulle : sommes réelles."}
              </p>
            ) : null}
            {summaries.length > 0 ? (
              <div className="mt-3 flex w-full flex-wrap items-start justify-center gap-1.5 text-center text-xs text-muted-foreground">
                <p>
                  {summaries
                    .map(
                      (item) =>
                        `${item.label} : min ${item.min} · max ${item.max} · moy. ${formatStat(item.avg)}`
                    )
                    .join("  ·  ")}
                </p>
                <HelpTip {...SUMMARY_HELP} className="mt-0.5" />
                {correlation != null ? (
                  <span className="inline-flex items-center gap-1">
                    <span>
                      · corrélation {formatStat(correlation)} (attendu ≈ 0)
                    </span>
                    <HelpTip
                      title="Corrélation"
                      body="Pearson entre somme des numéros et somme des étoiles sur la fenêtre. Proche de 0 si les deux tirages sont indépendants. Descriptif, pas un signal de jeu."
                    />
                  </span>
                ) : null}
                {excursions.length > 0 ? (
                  <span className="inline-flex items-center gap-1">
                    <span>
                      · hors bande{" "}
                      {excursions
                        .map((item) => `${item.label} ${item.outside}/${item.ready}`)
                        .join(" · ")}
                    </span>
                    <HelpTip
                      title="Hors bande"
                      body="Nombre de tirages où la série sort de SMA ± 2σ, une fois la fenêtre Bollinger pleine. Sous un bruit gaussien on attend ~5 %. Descriptif, pas un signal de jeu."
                    />
                  </span>
                ) : null}
              </div>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  )
}
