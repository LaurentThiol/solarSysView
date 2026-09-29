"use client"

import { Fragment, useCallback, useMemo, useState } from "react"
import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  ReferenceLine,
  XAxis,
  YAxis,
} from "recharts"

import { CoordHud } from "@/components/chart-draw/coord-hud"
import { SketchPlotLayers } from "@/components/chart-draw/sketch-layers"
import { SketchToolbar } from "@/components/chart-draw/sketch-toolbar"
import { useSketchChart } from "@/components/chart-draw/use-sketch-chart"
import { HelpTip, TitleHelp, type HelpCopy } from "@/components/help"
import { WeekdaySeriesLines, WeekdaySplitLegend } from "@/components/weekday-split"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  ChartContainer,
  ChartTooltip,
  type ChartConfig,
} from "@/components/ui/chart"
import { isRailFigure } from "@/lib/chartisme/catalog"
import { FREE_SEGMENT_KEPT_HINT, channelLabel, drawingStartHint } from "@/lib/chart-draw"
import { isOrderRankKey, rankStepLaw, type OrderRankKey } from "@/lib/delta-chance"
import {
  coherenceLabel,
  coherenceReading,
  numberCoherence,
  numberCoherenceTheory,
  starCoherence,
  starCoherenceTheory,
} from "@/lib/delta-coherence"
import {
  DELTA_VIEW_KEYS,
  deltaBinWidth,
  deltaDomain,
  deltaHistogram,
  deltaOverlayBands,
  finiteDeltas,
  previousLevel,
  shuffleMeanAbs,
  shuffleSeed,
  summarizeDelta,
  summarizeEdgeMotion,
  toDeltaSeries,
  type DeltaKey,
  type DeltaPoint,
  type DeltaView,
  type EdgeMotion,
} from "@/lib/delta-evol"
import {
  overlayField,
  overlayPeriodFor,
  overlayRecord,
  readOverlay,
  type BandPoint,
} from "@/lib/draw-overlays"
import { weekdaySplitKeys } from "@/lib/draw-chart-rank"
import { formatDrawDate, formatShortDate, toDrawSeries, type Draw } from "@/lib/draws"
import { cn } from "@/lib/utils"
import {
  seriesHasBothWeekdays,
  weekdayDayLineCaption,
  weekdayOverlayFieldsFor,
  weekdaySeriesPhrase,
  type DrawWeekday,
} from "@/lib/weekday-scope"

const VIEWS: { value: DeltaView; label: string }[] = [
  { value: "sums", label: "Sommes" },
  { value: "numbers", label: "n1 à n5" },
  { value: "stars", label: "e1 et e2" },
  { value: "all", label: "Tout" },
]

const chartConfig = {
  n1: { label: "Δ n1", color: "var(--chart-1)" },
  n2: { label: "Δ n2", color: "var(--chart-2)" },
  n3: { label: "Δ n3", color: "var(--chart-3)" },
  n4: { label: "Δ n4", color: "var(--chart-4)" },
  n5: { label: "Δ n5", color: "var(--chart-5)" },
  e1: { label: "Δ e1", color: "var(--chart-1)" },
  e2: { label: "Δ e2", color: "var(--chart-2)" },
  sumNumbers: { label: "Δ somme n", color: "var(--chart-1)" },
  sumStars: { label: "Δ somme E", color: "var(--chart-2)" },
  sma: { label: "SMA", color: "var(--chart-2)" },
  bbUpper: { label: "Bollinger +", color: "var(--chart-5)" },
  bbLower: { label: "Bollinger −", color: "var(--chart-5)" },
} satisfies ChartConfig

type ChartPoint = DeltaPoint & Record<string, number | string | null>

const TITLE_HELP: HelpCopy = {
  title: "DeltaEvol",
  wide: true,
  body: `Écart entre le tirage n et le tirage n−1, dans l’ordre de la fenêtre.

• Δ n1 … Δ n5 : le plus petit, le 2ᵉ, …, le plus grand, après tri — pas l’ordre de sortie.
• Δ e1 et Δ e2 : même lecture pour les étoiles.
• Δ somme n et Δ somme E : somme des 5 boules, somme des 2 étoiles.
• Le premier tirage de la fenêtre n’a pas de prédécesseur : la courbe commence au second point.
• La ligne 0 est la base. Au-dessus, la série a monté ; en dessous, elle a baissé.

SMA et Bollinger (optionnels) lissent ou encadrent ces écarts, pas les niveaux. Maj+clic isole une série. Les sommes vivent sur une autre échelle que n1–n5 : Sommes les sépare (Δ somme n à gauche, Δ somme E à droite). Tout les superpose et laisse les sommes écraser les rangs.

Dessin libre chartiste sur ces écarts : figure de la table ou segment, comme sur les gains. Lecture du tracé, pas un signal.

n1 et n5 du même signe : la grille glisse. Signes opposés : elle s’étire (l’étendue grandit) ou se resserre. L’histogramme situe le dernier pas parmi ceux de la série. |Δ| est comparé à un mélange des mêmes valeurs : une ampleur dans la fourchette est celle de ces nombres remis au hasard, pas un signal.

Descriptif : chaque tirage reste indépendant.`,
}

const VIEW_HELP: HelpCopy = {
  title: "Lecture",
  body: "Sommes : Δ somme des numéros et Δ somme des étoiles, deux axes. n1 à n5 et e1 / e2 : rangs d’ordre, même échelle. Tout : les neuf écarts ensemble — les sommes dominent le cadre.",
}

const SMA_HELP: HelpCopy = {
  title: "SMA",
  body: "Moyenne simple des écarts, période auto (5 si au moins 10 écarts, 10 si au moins 40). Une courbe par série visible. Lissage de la variation, pas une prédiction.",
}

const BB_HELP: HelpCopy = {
  title: "Bollinger",
  body: "Bandes SMA ± 2σ de chaque écart visible. Le milieu est la SMA des écarts. %B dans l’infobulle : 0 = bande basse, 1 = bande haute. Dispersion des variations, pas un signal de jeu.",
}

const SUMMARY_HELP: HelpCopy = {
  title: "dernier · moy. · |Δ|",
  body: "Sur les écarts de la fenêtre : dernier pas, moyenne signée (près de 0 si la série ne dérive pas), moyenne des valeurs absolues (ampleur typique d’un pas), et série en cours du même signe. Le mélange remet ces mêmes valeurs dans 200 ordres au hasard : la fourchette est le 5e–95e de leurs |Δ|. Dedans, l’ampleur est celle d’un ordre quelconque. Dehors, le pas est plus calme ou plus agité que ce mélange. Ce n’est pas un signal de jeu.",
}

const MOTION_HELP: HelpCopy = {
  title: "n1 et n5",
  body: "Même sens : les deux bords bougent ensemble, la grille glisse. Sens opposés : l’étendue change — s’étire si n5 monte pendant que n1 descend, se resserre dans l’autre cas. Un bord à 0 ne compte ni l’un ni l’autre.",
}

const HISTOGRAM_HELP: HelpCopy = {
  title: "Histogramme des pas",
  body: "Combien de fois chaque écart est apparu dans la fenêtre. Le bac du dernier pas est en couleur. Pour n1–n5 et e1–e2, la barre claire est le nombre de pas attendu si deux tirages indépendants sortent de l’urne. Un bac loin du centre est un grand pas pour cette série, pas une prédiction.",
}

const COHERENCE_HELP: HelpCopy = {
  title: "Cohérence des variations",
  wide: true,
  body: "À chaque tirage, |somme des Δ| / somme des |Δ|, sur n1–n5 d’un côté et e1–e2 de l’autre.\n\n1 : toute la variation va dans le même sens (la grille glisse). 0 : les hausses annulent les baisses (la forme se déforme). Le trait est l’espérance de cet indice si deux grilles indépendantes sortent de l’urne. Au-dessus, les rangs bougent plus ensemble que la loi. En dessous, ils se contredisent davantage. Descriptif, pas un signal.",
}

const CHANCE_HELP: HelpCopy = {
  title: "Hasard théorique",
  wide: true,
  body: "La barre est le |Δ| moyen observé entre deux tirages qui se suivent. Le trait est l’espérance du même |Δ| si l’on tire deux grilles indépendantes dans l’urne : 5 numéros parmi 50, 2 étoiles parmi le pool de la fenêtre.\n\nLe point est le dernier |Δ|. Près du trait, la variation a l’ampleur de la loi. Plus court, la série bouge moins que deux tirages indépendants. Plus long, elle bouge davantage. Ce n’est pas un signal de jeu.",
}

const ORDER_RANKS: OrderRankKey[] = ["n1", "n2", "n3", "n4", "n5", "e1", "e2"]

function sharedStarPool(draws: Draw[]) {
  let pool: number | null = null
  for (const draw of draws) {
    const value = draw.star_pool ?? 12
    if (pool == null) pool = value
    else if (pool !== value) return null
  }
  return pool
}

function motionPhrase(motion: EdgeMotion | null, slide: -1 | 1 | 0) {
  if (motion === "slide" && slide > 0) return "glisse vers le haut"
  if (motion === "slide" && slide < 0) return "glisse vers le bas"
  if (motion === "slide") return "glisse"
  if (motion === "stretch") return "s’étire"
  if (motion === "squeeze") return "se resserre"
  if (motion === "still") return "un bord immobile"
  return "—"
}

function chancePhrase(observed: number, theory: number) {
  if (theory <= 0) return "—"
  const ratio = observed / theory
  if (ratio < 0.85) return "plus calme que la loi"
  if (ratio > 1.15) return "plus agité que la loi"
  return "comme la loi"
}

function shufflePhrase(observed: number, low: number, high: number) {
  if (observed < low) return "plus calme que le mélange"
  if (observed > high) return "plus agité que le mélange"
  return "dans le mélange"
}

function formatStat(value: number, digits = 1) {
  const rounded = Number(value.toFixed(digits))
  return (rounded === 0 ? 0 : rounded).toLocaleString("fr-FR", {
    maximumFractionDigits: digits,
    minimumFractionDigits: 0,
  })
}

function formatSigned(value: number, digits = 1) {
  const rounded = Number(value.toFixed(digits))
  const normalized = rounded === 0 ? 0 : rounded
  return normalized.toLocaleString("fr-FR", {
    maximumFractionDigits: digits,
    minimumFractionDigits: 0,
    signDisplay: "exceptZero",
  })
}

function formatPctB(value: number) {
  return value.toLocaleString("fr-FR", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  })
}

function formatStreak(sign: -1 | 0 | 1, length: number) {
  if (length === 0 || sign === 0) return "série —"
  const n = `${length} pas`
  if (sign > 0) return `${n} en hausse`
  return `${n} en baisse`
}

function stepLabel(point: DeltaPoint, key: DeltaKey) {
  const delta = point[key]
  if (delta == null) return "—"
  const previous = previousLevel(point, key)
  const current = point[`level_${key}`]
  if (previous == null) return formatSigned(delta, 0)
  return `${formatStat(previous, 0)} → ${formatStat(current, 0)} · ${formatSigned(delta, 0)}`
}

function mergeOverlays(points: ChartPoint[], key: DeltaKey, bands: BandPoint[]): ChartPoint[] {
  return points.map((point, index) => ({
    ...point,
    ...overlayRecord(key, bands[index] ?? { sma: null, upper: null, lower: null, percentB: null }),
  }))
}

function DeltaTooltip({
  active,
  payload,
  label,
  keys,
  hidden,
  smaPeriod,
  showSma,
  showBb,
}: {
  active?: boolean
  payload?: Array<{ dataKey?: string | number; payload?: ChartPoint }>
  label?: string
  keys: readonly DeltaKey[]
  hidden: Partial<Record<DeltaKey, boolean>>
  smaPeriod: number
  showSma: boolean
  showBb: boolean
}) {
  if (!active || !payload?.length) return null
  const point = payload[0]?.payload
  if (!point) return null

  return (
    <div className="grid min-w-0 max-w-[min(20rem,calc(100vw-2rem))] items-start gap-1.5 rounded-lg border border-border/50 bg-background px-2.5 py-1.5 text-xs shadow-xl">
      <div className="font-medium">{formatDrawDate(String(label ?? point.date))}</div>
      <div className="grid gap-1.5">
        {keys
          .filter((key) => !hidden[key])
          .map((key) => {
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
                  <span className="flex-1 text-muted-foreground">{chartConfig[key].label}</span>
                  <span className="font-mono font-medium tabular-nums">{stepLabel(point, key)}</span>
                </div>
                {showSma ? (
                  <div className="flex items-center gap-2 pl-4 text-muted-foreground">
                    <span className="flex-1">SMA {smaPeriod}</span>
                    <span className="font-mono tabular-nums">
                      {sma == null ? "—" : formatSigned(sma)}
                    </span>
                  </div>
                ) : null}
                {showBb ? (
                  <div className="flex items-center gap-2 pl-4 text-muted-foreground">
                    <span className="flex-1">Bollinger</span>
                    <span className="font-mono tabular-nums">
                      {lo == null || hi == null
                        ? "—"
                        : `${formatSigned(lo)} – ${formatSigned(hi)}${
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

function ChanceMeter({
  label,
  observed,
  theory,
  lastAbs,
  tail,
  color,
}: {
  label: string
  observed: number
  theory: number
  lastAbs: number
  tail: number
  color: string
}) {
  const span = Math.max(theory * 1.75, observed, lastAbs, 1)
  const observedPct = Math.min(100, (observed / span) * 100)
  const theoryPct = Math.min(100, (theory / span) * 100)
  const lastPct = Math.min(100, (lastAbs / span) * 100)
  return (
    <div className="min-w-0">
      <div className="mb-1 flex items-baseline justify-between gap-2 text-xs">
        <span className="font-medium">{label}</span>
        <span className="tabular-nums text-muted-foreground">
          {formatStat(observed / theory, 2)} ×
        </span>
      </div>
      <div className="relative h-2.5 rounded-full bg-muted">
        <div
          className="absolute inset-y-0 left-0 rounded-full"
          style={{ width: `${observedPct}%`, background: color, opacity: 0.85 }}
        />
        <span
          aria-hidden
          className="absolute top-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-background"
          style={{ left: `${lastPct}%`, background: color }}
        />
        <span
          aria-hidden
          className="absolute inset-y-[-3px] w-0.5 -translate-x-1/2 rounded-full bg-foreground"
          style={{ left: `${theoryPct}%` }}
        />
      </div>
      <p className="mt-1 text-[11px] tabular-nums text-muted-foreground">
        |Δ| {formatStat(observed)} · loi {formatStat(theory)} · {chancePhrase(observed, theory)}
        {" · "}dernier {formatStat(lastAbs, 0)}, {formatStat(100 * tail, 0)} % aussi grands
      </p>
    </div>
  )
}

export function EvolutionDelta({ draws }: { draws: Draw[] }) {
  const [view, setView] = useState<DeltaView>("sums")
  const [hidden, setHidden] = useState<Partial<Record<DeltaKey, boolean>>>({})
  const [showSma, setShowSma] = useState(true)
  const [showBb, setShowBb] = useState(false)
  const [dayLine, setDayLine] = useState({ mardi: true, vendredi: true })
  const [targetKey, setTargetKey] = useState<DeltaKey>("sumNumbers")

  const series = useMemo(() => toDeltaSeries(toDrawSeries(draws)), [draws])
  const keys = DELTA_VIEW_KEYS[view]
  const visible = useMemo(() => keys.filter((key) => !hidden[key]), [keys, hidden])
  const deltaCount = Math.max(0, series.length - 1)
  const smaPeriod = overlayPeriodFor(deltaCount)
  const mixedDays = useMemo(() => seriesHasBothWeekdays(series), [series])
  const splitKeys = useMemo(() => weekdaySplitKeys(visible), [visible])
  const showDayLines = mixedDays && splitKeys.length > 0
  const splitLabels = splitKeys.map((key) => String(chartConfig[key].label))
  const dualAxis = view === "sums"
  const seriesKey = keys.includes(targetKey) ? targetKey : (keys[0] ?? targetKey)

  const overlayPacks = useMemo(() => {
    const packs: Partial<Record<DeltaKey, { abs: BandPoint[]; values: Array<number | null> }>> = {}
    if (!smaPeriod) return packs
    for (const key of keys) {
      const values = series.map((point) => point[key])
      packs[key] = { abs: deltaOverlayBands(values, smaPeriod), values }
    }
    return packs
  }, [series, keys, smaPeriod])

  const chartData = useMemo(() => {
    let points: ChartPoint[] = series
    if (showDayLines && splitKeys.length > 0) {
      points = points.map((point) => ({
        ...point,
        ...weekdayOverlayFieldsFor(
          point.weekday,
          splitKeys.map((key) => ({ key, value: point[key] }))
        ),
      }))
    }
    if (!smaPeriod) return points
    for (const key of keys) {
      const abs = overlayPacks[key]?.abs
      if (!abs) continue
      points = mergeOverlays(points, key, abs)
    }
    return points
  }, [series, smaPeriod, keys, overlayPacks, showDayLines, splitKeys])

  const domains = useMemo(() => {
    const collect = (key: DeltaKey) => {
      const values = finiteDeltas(series.map((point) => point[key]))
      if (showSma || showBb) {
        const bands = overlayPacks[key]?.abs ?? []
        for (const band of bands) {
          if (showSma && band.sma != null) values.push(band.sma)
          if (showBb && band.upper != null) values.push(band.upper)
          if (showBb && band.lower != null) values.push(band.lower)
        }
      }
      return deltaDomain(values)
    }
    if (dualAxis) {
      return {
        left: collect("sumNumbers"),
        right: collect("sumStars"),
      }
    }
    const values: number[] = []
    for (const key of visible) {
      values.push(...finiteDeltas(series.map((point) => point[key])))
      if (showSma || showBb) {
        for (const band of overlayPacks[key]?.abs ?? []) {
          if (showSma && band.sma != null) values.push(band.sma)
          if (showBb && band.upper != null) values.push(band.upper)
          if (showBb && band.lower != null) values.push(band.lower)
        }
      }
    }
    return { left: deltaDomain(values), right: deltaDomain(values) }
  }, [dualAxis, series, visible, overlayPacks, showSma, showBb])

  const summaries = useMemo(() => {
    return keys.map((key) => ({
      key,
      label: chartConfig[key].label,
      stats: summarizeDelta(series.map((point) => point[key])),
    }))
  }, [series, keys])

  const motion = useMemo(
    () => summarizeEdgeMotion(series.map((point) => ({ n1: point.n1, n5: point.n5 }))),
    [series]
  )

  const shuffles = useMemo(() => {
    return keys.map((key) => {
      const levels = series.map((point) => point[`level_${key}`])
      return {
        key,
        label: chartConfig[key].label,
        compare: shuffleMeanAbs(levels, { seed: shuffleSeed(key, levels.length) }),
      }
    })
  }, [series, keys])

  const starPool = useMemo(() => sharedStarPool(draws), [draws])

  const coherence = useMemo(() => {
    const numberTheory = numberCoherenceTheory()
    const starsTheory = starPool == null ? null : starCoherenceTheory(starPool)
    const points = series.map((point) => ({
      date: point.date,
      numbers: numberCoherence(point),
      stars: starPool == null ? null : starCoherence(point),
      n1: point.n1,
      n2: point.n2,
      n3: point.n3,
      n4: point.n4,
      n5: point.n5,
      e1: point.e1,
      e2: point.e2,
    }))
    const meanOf = (key: "numbers" | "stars") => {
      const values = points
        .map((point) => point[key])
        .filter((value): value is number => value != null)
      if (values.length === 0) return null
      return values.reduce((sum, value) => sum + value, 0) / values.length
    }
    const last = [...points].reverse().find((point) => point.numbers != null) ?? null
    return {
      points,
      numberTheory,
      starsTheory,
      numberMean: meanOf("numbers"),
      starMean: meanOf("stars"),
      last,
    }
  }, [series, starPool])

  const chanceRows = useMemo(() => {
    return ORDER_RANKS.flatMap((key) => {
      if (key.startsWith("e") && starPool == null) return []
      const stats = summarizeDelta(series.map((point) => point[key]))
      if (!stats) return []
      const law = rankStepLaw(key, starPool ?? 12)
      return [
        {
          key,
          label: chartConfig[key].label.replace("Δ ", ""),
          observed: stats.meanAbs,
          lastAbs: Math.abs(stats.last),
          theory: law.meanAbs,
          tail: law.absAtLeast(stats.last),
          color: chartConfig[key].color,
        },
      ]
    })
  }, [series, starPool])

  const histograms = useMemo(() => {
    return visible.map((key) => {
      const values = series.map((point) => point[key])
      const finite = finiteDeltas(values)
      const last = finite.length > 0 ? finite[finite.length - 1] : null
      const width = deltaBinWidth(key)
      const law = isOrderRankKey(key) && (key.startsWith("n") || starPool != null)
        ? rankStepLaw(key, starPool ?? 12)
        : null
      return {
        key,
        label: chartConfig[key].label,
        bins: deltaHistogram(values, width, last).map((bin) => ({
          ...bin,
          chance:
            law == null
              ? null
              : Array.from({ length: width }, (_, offset) => law.mass(bin.bin + offset)).reduce(
                  (sum, probability) => sum + probability,
                  0
                ) * finite.length,
        })),
      }
    })
  }, [series, visible, starPool])

  const seriesValues = useCallback(
    (key: DeltaKey) =>
      series.map((point) => {
        const value = point[key]
        return typeof value === "number" && Number.isFinite(value) ? value : Number.NaN
      }),
    [series]
  )

  const plotAxisId = useCallback(
    (key: string) => (dualAxis && key === "sumStars" ? "right" : "left"),
    [dualAxis]
  )

  const sketch = useSketchChart({
    enabled: series.length >= 2,
    points: chartData,
    keys,
    targetKey: seriesKey,
    seriesLabel: (key) => chartConfig[key].label,
    seriesValues,
    axisId: plotAxisId,
  })

  const plotData = useMemo(
    () => sketch.mergeSketchFields(chartData),
    [sketch, chartData]
  )

  function changeView(next: DeltaView) {
    if (next === view) return
    setView(next)
    setHidden({})
    const nextKeys = DELTA_VIEW_KEYS[next]
    if (!nextKeys.includes(targetKey)) {
      const fallback = nextKeys[0]
      if (fallback) setTargetKey(fallback)
    }
    sketch.clearMove()
    sketch.draw?.cancelDraft()
  }

  function toggleSeries(key: DeltaKey, solo: boolean) {
    if (solo) {
      const alreadySolo = !hidden[key] && keys.every((item) => item === key || hidden[item])
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

  function axisOf(key: DeltaKey) {
    if (dualAxis && key === "sumStars") return "right"
    return "left"
  }

  function overlayStroke(key: DeltaKey, kind: "sma" | "bb"): string {
    if (visible.length === 1) {
      return kind === "sma" ? "var(--color-sma)" : "var(--color-bbUpper)"
    }
    return `var(--color-${key})`
  }

  const smaOn = showSma && smaPeriod > 0
  const bbOn = showBb && smaPeriod > 0

  return (
    <Card>
      <CardHeader className="gap-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="text-base font-medium">
            <TitleHelp help={TITLE_HELP}>DeltaEvol</TitleHelp>
          </CardTitle>
          <div className="flex flex-col gap-1">
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              Lecture
              <HelpTip {...VIEW_HELP} />
            </span>
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Lecture des écarts">
              {VIEWS.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  aria-pressed={view === item.value}
                  onClick={() => changeView(item.value)}
                  className={cn(
                    "rounded-full border px-2.5 py-1 text-xs",
                    view === item.value
                      ? "border-primary bg-primary/15 text-foreground"
                      : "border-border text-muted-foreground hover:text-foreground"
                  )}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {series.length < 2 ? (
          <p className="text-sm text-muted-foreground">
            Il faut au moins deux tirages pour un écart n − n−1.
          </p>
        ) : (
          <>
            {sketch.draw ? (
              <div className="mb-3 flex flex-col gap-2">
                <SketchToolbar
                  drawing={sketch.drawing}
                  figure={sketch.draw.figure}
                  seriesKey={seriesKey}
                  seriesOptions={keys.map((key) => ({
                    value: key,
                    label: chartConfig[key].label,
                  }))}
                  sketches={sketch.draw.sketches}
                  dates={sketch.dates}
                  canUndo={Boolean(
                    sketch.draw.draft?.start || sketch.draw.draft?.mid || sketch.moving
                  )}
                  showMedian={sketch.draw.showMedian}
                  onShowMedian={sketch.draw.setShowMedian}
                  freeArrival={sketch.freeArrival}
                  onFreeArrival={sketch.setFreeArrival}
                  onToggle={() => {
                    if (hidden[seriesKey]) {
                      setHidden((current) => ({ ...current, [seriesKey]: false }))
                    }
                    sketch.startDrawing()
                  }}
                  onFigure={(figure) => {
                    sketch.clearMove()
                    sketch.draw?.setFigure(figure)
                  }}
                  onSeries={(key) => {
                    setTargetKey(key as DeltaKey)
                    sketch.draw?.cancelDraft()
                    sketch.clearMove()
                    sketch.setHint(
                      sketch.draw?.draft?.parallelOf
                        ? FREE_SEGMENT_KEPT_HINT
                        : drawingStartHint(sketch.draw?.figure ?? "")
                    )
                  }}
                  onCancel={() => {
                    if (sketch.moving) {
                      sketch.clearMove()
                      sketch.draw?.cancelDraft()
                      sketch.setHint(
                        "Déplacement annulé. Clique un point pour le reprendre, ou un départ."
                      )
                      return
                    }
                    const pendingParallel = Boolean(sketch.draw?.draft?.parallelOf)
                    sketch.draw?.cancelDraft()
                    if (pendingParallel) sketch.setHint(FREE_SEGMENT_KEPT_HINT)
                  }}
                  onClear={() => {
                    sketch.clearMove()
                    sketch.draw?.clearSketches()
                  }}
                  onRemove={(id) => {
                    if (sketch.moving?.sketchId === id) sketch.clearMove()
                    sketch.draw?.removeSketch(id)
                  }}
                />
                {sketch.drawing ? (
                  <CoordHud
                    live={sketch.draw.live}
                    start={sketch.hudStart}
                    mid={sketch.hudMid}
                    end={sketch.hudEnd}
                    rails={
                      isRailFigure(sketch.draw.figure) || Boolean(sketch.draw.draft?.parallelOf)
                    }
                    figureLabel={channelLabel(sketch.draw.figure, sketch.previewBand)}
                    seriesLabel={chartConfig[seriesKey].label}
                    reading={sketch.draftReading}
                    drawCount={series.length}
                    hint={sketch.hint}
                  />
                ) : null}
              </div>
            ) : null}
            <ChartContainer
              config={chartConfig}
              className={cn(
                "aspect-auto h-[220px] w-full sm:h-[280px] lg:h-[340px]",
                sketch.drawing && sketch.moving && "cursor-grabbing",
                sketch.drawing && !sketch.moving && "cursor-crosshair"
              )}
            >
              <ComposedChart
                key={`${view}-${showDayLines ? "mix" : "one"}-${dualAxis ? "dual" : "one"}`}
                accessibilityLayer
                data={plotData}
                margin={{ left: 4, right: dualAxis ? 8 : 8, top: 8, bottom: 4 }}
                onMouseDown={(state, event) => {
                  if (!sketch.drawing) return
                  sketch.onChartPointerDown(state, event)
                }}
                onMouseMove={(state, event) => {
                  if (!sketch.drawing) return
                  sketch.onChartMove(state, event)
                }}
                onClick={(state, event) => {
                  if (!sketch.drawing) return
                  sketch.onChartClick(state, event)
                }}
                onMouseLeave={() => sketch.onChartLeave()}
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
                  yAxisId="left"
                  domain={domains.left}
                  width={40}
                  tickLine={false}
                  axisLine={false}
                  allowDecimals={false}
                />
                {dualAxis ? (
                  <YAxis
                    yAxisId="right"
                    orientation="right"
                    domain={domains.right}
                    width={36}
                    tickLine={false}
                    axisLine={false}
                    allowDecimals={false}
                  />
                ) : null}
                <ReferenceLine
                  yAxisId="left"
                  y={0}
                  stroke="var(--muted-foreground)"
                  strokeOpacity={0.45}
                  strokeDasharray="4 4"
                />
                <ChartTooltip
                  cursor={sketch.drawing ? false : undefined}
                  content={
                    sketch.drawing ? (
                      () => null
                    ) : (
                      <DeltaTooltip
                        keys={keys}
                        hidden={hidden}
                        smaPeriod={smaPeriod}
                        showSma={smaOn}
                        showBb={bbOn}
                      />
                    )
                  }
                />
                {bbOn && visible.length === 1
                  ? visible.map((key) => (
                      <Fragment key={`bb-fill-${key}`}>
                        <Area
                          yAxisId={axisOf(key)}
                          type="linear"
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
                          yAxisId={axisOf(key)}
                          type="linear"
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
                {visible.map((key) => (
                  <Line
                    key={key}
                    yAxisId={axisOf(key)}
                    dataKey={key}
                    type="linear"
                    stroke={`var(--color-${key})`}
                    strokeWidth={2}
                    dot={false}
                    connectNulls={false}
                    name={chartConfig[key].label}
                  />
                ))}
                {smaOn
                  ? visible.map((key) => (
                      <Line
                        key={`sma-${key}`}
                        yAxisId={axisOf(key)}
                        dataKey={overlayField(key, "sma")}
                        type="linear"
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
                {bbOn
                  ? visible.map((key) => (
                      <Fragment key={`bb-${key}`}>
                        <Line
                          yAxisId={axisOf(key)}
                          dataKey={overlayField(key, "bbUpper")}
                          type="linear"
                          stroke={overlayStroke(key, "bb")}
                          strokeWidth={1.25}
                          strokeDasharray="2 3"
                          strokeOpacity={visible.length === 1 ? 1 : 0.7}
                          dot={false}
                          connectNulls
                          legendType="none"
                          name={`Bollinger + ${chartConfig[key].label}`}
                        />
                        <Line
                          yAxisId={axisOf(key)}
                          dataKey={overlayField(key, "bbLower")}
                          type="linear"
                          stroke={overlayStroke(key, "bb")}
                          strokeWidth={1.25}
                          strokeDasharray="2 3"
                          strokeOpacity={visible.length === 1 ? 1 : 0.7}
                          dot={false}
                          connectNulls
                          legendType="none"
                          name={`Bollinger − ${chartConfig[key].label}`}
                        />
                        {!showSma ? (
                          <Line
                            yAxisId={axisOf(key)}
                            dataKey={overlayField(key, "sma")}
                            type="linear"
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
                {showDayLines ? (
                  <WeekdaySeriesLines
                    seriesKeys={splitKeys}
                    showMardi={dayLine.mardi}
                    showVendredi={dayLine.vendredi}
                    yAxisId={(key) => axisOf(key as DeltaKey)}
                  />
                ) : null}
                {sketch.draw ? (
                  <SketchPlotLayers
                    sketches={sketch.displaySketches}
                    draftBand={sketch.draftBand}
                    hasDraftLine={sketch.draftPoints.length > 0}
                    targetAxisId={sketch.targetAxisId}
                    axisId={plotAxisId}
                    drawing={sketch.drawing}
                    moving={sketch.moving}
                    hoveredHandle={sketch.hoveredHandle}
                    live={sketch.draw.live}
                    draftStart={sketch.draw.draft?.start ?? null}
                    draftMid={sketch.draw.draft?.mid}
                    draftFigure={sketch.draw.figure}
                    showMedian={sketch.draw.showMedian}
                    onScales={sketch.onScales}
                  />
                ) : null}
              </ComposedChart>
            </ChartContainer>
            <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
              {showDayLines ? (
                <WeekdaySplitLegend
                  metric={weekdaySeriesPhrase(splitLabels)}
                  seriesCount={splitKeys.length}
                  showMardi={dayLine.mardi}
                  showVendredi={dayLine.vendredi}
                  onToggle={(day: DrawWeekday) =>
                    setDayLine((current) => ({ ...current, [day]: !current[day] }))
                  }
                />
              ) : null}
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
                            visible.length === 1
                              ? chartConfig.sma.color
                              : chartConfig[visible[0] ?? keys[0]].color,
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
                <button
                  key={key}
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
              ))}
            </div>
            {showDayLines ? (
              <p className="mt-2 text-center text-xs text-muted-foreground">
                {weekdayDayLineCaption(splitLabels)}
              </p>
            ) : null}
            {view === "all" && visible.length > 2 ? (
              <p className="mt-2 text-center text-xs text-muted-foreground">
                Les sommes écrasent n1–n5 et les étoiles. Maj+clic isole une courbe, ou passez par n1 à n5 / e1 et e2.
              </p>
            ) : null}
            <ul className="mt-3 flex flex-wrap justify-center gap-x-4 gap-y-1 text-center text-xs tabular-nums text-muted-foreground">
              {summaries.map((row) => (
                <li key={row.key}>
                  {row.label}
                  {row.stats
                    ? ` · ${formatSigned(row.stats.last, 0)} · moy. ${formatSigned(row.stats.avg)} · |Δ| ${formatStat(row.stats.meanAbs)} · ${formatStreak(row.stats.streak.sign, row.stats.streak.length)}`
                    : " · —"}
                </li>
              ))}
              <li className="inline-flex items-center">
                <HelpTip {...SUMMARY_HELP} />
              </li>
            </ul>
            <p className="mt-2 flex flex-wrap items-center justify-center gap-x-2 text-center text-xs text-muted-foreground">
              <span>
                n1 et n5 · {motion.slide} glissement{motion.slide > 1 ? "s" : ""} · {motion.stretch}{" "}
                étirement{motion.stretch > 1 ? "s" : ""} · {motion.squeeze} resserrement
                {motion.squeeze > 1 ? "s" : ""} · {motion.still} bord{motion.still > 1 ? "s" : ""}{" "}
                immobile{motion.still > 1 ? "s" : ""} · dernier :{" "}
                {motionPhrase(motion.last, motion.lastSlide)}
              </span>
              <HelpTip {...MOTION_HELP} />
            </p>
            {coherence.points.length > 1 ? (
              <div className="mt-4">
                <p className="mb-2 flex items-center justify-center gap-1 text-center text-xs text-muted-foreground">
                  Cohérence des variations
                  <HelpTip {...COHERENCE_HELP} />
                </p>
                <ChartContainer
                  config={{
                    numbers: { label: "n1–n5", color: "var(--chart-1)" },
                    stars: { label: "e1–e2", color: "var(--chart-2)" },
                  }}
                  className="aspect-auto h-[160px] w-full"
                >
                  <ComposedChart data={coherence.points} margin={{ left: 4, right: 8, top: 8, bottom: 4 }}>
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
                      domain={[0, 1]}
                      width={32}
                      tickLine={false}
                      axisLine={false}
                      ticks={[0, 0.5, 1]}
                    />
                    <ReferenceLine
                      y={coherence.numberTheory}
                      stroke="var(--color-numbers)"
                      strokeDasharray="4 4"
                      strokeOpacity={0.7}
                    />
                    {coherence.starsTheory != null ? (
                      <ReferenceLine
                        y={coherence.starsTheory}
                        stroke="var(--color-stars)"
                        strokeDasharray="2 3"
                        strokeOpacity={0.7}
                      />
                    ) : null}
                    <ChartTooltip
                      content={({ active, payload }) => {
                        const point = payload?.[0]?.payload as (typeof coherence.points)[number] | undefined
                        if (!active || !point) return null
                        const ranks = ["n1", "n2", "n3", "n4", "n5", "e1", "e2"] as const
                        return (
                          <div className="grid min-w-0 max-w-[min(20rem,calc(100vw-2rem))] gap-1 rounded-lg border border-border/50 bg-background px-2.5 py-1.5 text-xs shadow-xl">
                            <div className="font-medium">{formatDrawDate(point.date)}</div>
                            <div className="flex flex-wrap gap-x-2 tabular-nums">
                              {ranks.map((key) => (
                                <span key={key}>
                                  {key} {point[key] == null ? "—" : formatSigned(point[key], 0)}
                                </span>
                              ))}
                            </div>
                            <div>
                              n1–n5 {point.numbers == null ? "—" : formatStat(point.numbers, 2)} ·{" "}
                              {coherenceLabel(coherenceReading(point.numbers))}
                            </div>
                            <div>
                              e1–e2 {point.stars == null ? "—" : formatStat(point.stars, 2)} ·{" "}
                              {coherenceLabel(coherenceReading(point.stars))}
                            </div>
                          </div>
                        )
                      }}
                    />
                    <Line
                      dataKey="numbers"
                      type="linear"
                      stroke="var(--color-numbers)"
                      strokeWidth={2}
                      dot={false}
                      connectNulls={false}
                      name="n1–n5"
                    />
                    {starPool != null ? (
                      <Line
                        dataKey="stars"
                        type="linear"
                        stroke="var(--color-stars)"
                        strokeWidth={2}
                        dot={false}
                        connectNulls={false}
                        name="e1–e2"
                      />
                    ) : null}
                  </ComposedChart>
                </ChartContainer>
                <p className="mt-2 text-center text-xs tabular-nums text-muted-foreground">
                  n1–n5 · moy. {coherence.numberMean == null ? "—" : formatStat(coherence.numberMean, 2)} · loi{" "}
                  {formatStat(coherence.numberTheory, 2)}
                  {coherence.starsTheory == null
                    ? ""
                    : ` · e1–e2 · moy. ${coherence.starMean == null ? "—" : formatStat(coherence.starMean, 2)} · loi ${formatStat(coherence.starsTheory, 2)}`}
                  {coherence.last
                    ? ` · dernier : ${coherenceLabel(coherenceReading(coherence.last.numbers))}`
                    : ""}
                </p>
                {coherence.last ? (
                  <p className="mt-1 flex flex-wrap justify-center gap-1.5 text-xs tabular-nums">
                    {(["n1", "n2", "n3", "n4", "n5", "e1", "e2"] as const).map((key) => {
                      const step = coherence.last?.[key]
                      const up = typeof step === "number" && step > 0
                      const down = typeof step === "number" && step < 0
                      return (
                        <span
                          key={key}
                          className={cn(
                            "rounded-md border px-1.5 py-0.5",
                            up && "border-chart-1/40 bg-chart-1/15",
                            down && "border-chart-5/40 bg-chart-5/15",
                            !up && !down && "border-border text-muted-foreground"
                          )}
                        >
                          {key} {step == null ? "—" : formatSigned(step, 0)}
                        </span>
                      )
                    })}
                  </p>
                ) : null}
              </div>
            ) : null}
            {shuffles.some((row) => row.compare) ? (
              <ul className="mt-2 flex flex-wrap justify-center gap-x-4 gap-y-1 text-center text-xs tabular-nums text-muted-foreground">
                {shuffles.map((row) =>
                  row.compare ? (
                    <li key={row.key}>
                      {row.label} · |Δ| {formatStat(row.compare.observed)} · mélange{" "}
                      {formatStat(row.compare.shuffleMean)} ({formatStat(row.compare.low)}–
                      {formatStat(row.compare.high)}) ·{" "}
                      {shufflePhrase(row.compare.observed, row.compare.low, row.compare.high)}
                    </li>
                  ) : null
                )}
              </ul>
            ) : null}
            {chanceRows.length > 0 ? (
              <div className="mt-4">
                <p className="mb-2 flex items-center justify-center gap-1 text-center text-xs text-muted-foreground">
                  Hasard théorique
                  <HelpTip {...CHANCE_HELP} />
                </p>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                  {chanceRows
                    .filter((row) => row.key.startsWith("n"))
                    .map(({ key, ...row }) => (
                      <ChanceMeter key={key} {...row} />
                    ))}
                </div>
                {starPool == null ? (
                  <p className="mt-2 text-center text-xs text-muted-foreground">
                    Étoiles : plusieurs formules dans la fenêtre, pas de loi unique.
                  </p>
                ) : (
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    {chanceRows
                      .filter((row) => row.key.startsWith("e"))
                      .map(({ key, ...row }) => (
                        <ChanceMeter key={key} {...row} />
                      ))}
                  </div>
                )}
              </div>
            ) : null}
            {histograms.some((row) => row.bins.length > 0) ? (
              <div className="mt-4">
                <p className="mb-2 flex items-center justify-center gap-1 text-center text-xs text-muted-foreground">
                  Histogramme des pas
                  <HelpTip {...HISTOGRAM_HELP} />
                </p>
                <div className="grid gap-3 sm:grid-cols-2">
                  {histograms.map((row) =>
                    row.bins.length === 0 ? null : (
                      <div key={row.key}>
                        <p className="mb-1 text-center text-xs text-muted-foreground">{row.label}</p>
                        <ChartContainer
                          config={{
                            count: { label: row.label, color: chartConfig[row.key].color },
                            chance: { label: "Loi", color: "var(--muted-foreground)" },
                          }}
                          className="aspect-auto h-[120px] w-full"
                        >
                          <BarChart data={row.bins} margin={{ left: 0, right: 4, top: 4, bottom: 0 }}>
                            <CartesianGrid vertical={false} />
                            <XAxis
                              dataKey="label"
                              tickLine={false}
                              axisLine={false}
                              tickMargin={4}
                              minTickGap={12}
                              interval="preserveStartEnd"
                            />
                            <YAxis width={24} tickLine={false} axisLine={false} allowDecimals={false} />
                            {row.bins.some((bin) => bin.chance != null) ? (
                              <Bar
                                dataKey="chance"
                                fill="var(--muted-foreground)"
                                fillOpacity={0.18}
                                radius={2}
                                isAnimationActive={false}
                              />
                            ) : null}
                            <Bar dataKey="count" radius={2} isAnimationActive={false}>
                              {row.bins.map((bin) => (
                                <Cell
                                  key={bin.bin}
                                  fill={
                                    bin.holdsLast
                                      ? chartConfig[row.key].color
                                      : "var(--muted-foreground)"
                                  }
                                  fillOpacity={bin.holdsLast ? 1 : 0.35}
                                />
                              ))}
                            </Bar>
                          </BarChart>
                        </ChartContainer>
                      </div>
                    )
                  )}
                </div>
              </div>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  )
}
