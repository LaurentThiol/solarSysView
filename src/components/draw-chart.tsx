"use client"

import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceDot,
  ReferenceLine,
  XAxis,
  YAxis,
  useXAxisScale,
  useYAxisScale,
  type MouseHandlerDataParam,
} from "recharts"

import { CoordHud } from "@/components/chart-draw/coord-hud"
import { useChartDrawOptional } from "@/components/chart-draw/chart-draw-context"
import { SketchToolbar } from "@/components/chart-draw/sketch-toolbar"
import { CurveName } from "@/components/chartisme/curve-thumb"
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
import {
  DRAFT_KEY,
  buildSketchGeometry,
  canFreePlaceArrival,
  channelLabel,
  extremaIndices,
  invertLinear,
  isDemagnetizeModifier,
  isMagneted,
  magnetKindAt,
  magnetOnCurve,
  magnetOnTouches,
  nearestSampleByX,
  newSketchId,
  pixelDistance,
  readTooltipIndex,
  readWindow,
  remapSketch,
  resolveSketchBand,
  sketchDataKey,
  swingTouches,
  valueFromPixelY,
  windowTooShort,
  type AxisScales,
  type ChartAnchor,
  type LiveCursor,
  type PixelSample,
} from "@/lib/chart-draw"
import { isRailFigure } from "@/lib/chartisme/catalog"
import { cn } from "@/lib/utils"
import {
  NUMBER_SUM_RANGE,
  STAR_SUM_RANGE,
  type Draw,
  formatDrawDate,
  formatRank1Step,
  formatShortDate,
  fromRelativeRange,
  pearsonCorrelation,
  rangeFromValues,
  relativeToRange,
  summarizeValues,
  toDrawSeries,
  type DrawSeriesPoint,
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
  rank1: { label: "1er rang", color: "oklch(0.68 0.18 25)" },
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
  | "rank1"

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

La ligne « 1er rang » (si l’archive a les gagnants) se lit sur l’axe de droite : 0 s’il y a au moins un gagnant du jackpot, +1 sinon (report). Maj+clic l’isole sur 0–1.

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
  rank1: {
    title: "Gagnant 1er rang",
    body: "0 s’il y a au moins un gagnant du jackpot (rang 1, total Europe, France comprise). +1 s’il n’y en a aucun (report). Cliquez pour masquer. Maj+clic : cette courbe seule (échelle 0–1).",
  },
}

const SERIES_SELECT_HELP: HelpCopy = {
  title: "Série affichée",
  wide: true,
  body: `Sommes superposées (échelle relative 0–100 %), somme des 5 numéros, chacune des 5 boules, somme des 2 étoiles, ou chaque étoile. L’axe Y s’adapte (0–100 %, 1–50 ou 1–12).

« Chaque numéro » trace n1 à n5 : les 5 boules triées du plus petit au plus grand, pas l’ordre de sortie — plus la ligne 1er rang (0 = gagnant, +1 = pas gagnant) quand l’archive la porte. « Chaque étoile » fait de même pour e1 < e2. SMA et Bollinger s’appliquent à chaque courbe visible.`,
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

function yDomain(
  mode: DrawChartMode,
  visibleKeys: SeriesKey[]
): [number, number] | [number, "auto"] {
  if (mode === "sumBoth") return [0, 100]
  if (mode === "eachNumber") {
    if (visibleKeys.length === 1 && visibleKeys[0] === "rank1") return [0, 1]
    return [1, 50]
  }
  if (mode === "eachStar") return [1, 12]
  if (mode === "sumStars") return [3, "auto"]
  return [15, "auto"]
}

function yDomainLocked(mode: DrawChartMode, visibleKeys: SeriesKey[]) {
  return typeof yDomain(mode, visibleKeys)[1] === "number"
}

function chartKeys(mode: DrawChartMode, series: DrawSeriesPoint[]): SeriesKey[] {
  const keys = MODE_KEYS[mode]
  if (mode !== "eachNumber") return keys
  if (series.some((point) => typeof point.rank1 === "number")) {
    return [...keys, "rank1"]
  }
  return keys
}

function splitRank1Axis(mode: DrawChartMode, visibleKeys: SeriesKey[]) {
  return (
    mode === "eachNumber" &&
    visibleKeys.includes("rank1") &&
    visibleKeys.some((key) => key !== "rank1")
  )
}

function plotAxisId(key: SeriesKey, split: boolean): string | number {
  return split && key === "rank1" ? "rank1" : 0
}

function seriesValuesOf(series: DrawSeriesPoint[], key: SeriesKey) {
  return series.map((point) => {
    const value = point[sourceKey(key)]
    return typeof value === "number" ? value : Number.NaN
  })
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

function sourceKey(key: SeriesKey): keyof DrawSeriesPoint {
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

function plottedOf(
  key: SeriesKey,
  actual: number,
  ranges: { numbers: ValueRange; stars: ValueRange }
) {
  if (key === "relNumbers") return relativeToRange(actual, ranges.numbers)
  if (key === "relStars") return relativeToRange(actual, ranges.stars)
  return actual
}

function actualFromPlotted(
  key: SeriesKey,
  plotted: number,
  ranges: { numbers: ValueRange; stars: ValueRange }
) {
  if (key === "relNumbers") return fromRelativeRange(plotted, ranges.numbers)
  if (key === "relStars") return fromRelativeRange(plotted, ranges.stars)
  return plotted
}

/** Les échelles relatives sont bornées 0–100 : un rail hors domaine disparaît. */
function clampPlotted(key: SeriesKey, value: number) {
  if (key === "relNumbers" || key === "relStars") {
    return Math.min(100, Math.max(0, value))
  }
  return value
}

function writeBandFields(
  extra: Record<string, number | null>,
  prefix: string,
  date: string,
  upperAt: Map<string, number>,
  lowerAt: Map<string, number>,
  seriesKey: SeriesKey,
  ranges: { numbers: ValueRange; stars: ValueRange }
) {
  const u = upperAt.get(date)
  const l = lowerAt.get(date)
  if (u == null || l == null) return
  const up = clampPlotted(seriesKey, plottedOf(seriesKey, u, ranges))
  const lo = clampPlotted(seriesKey, plottedOf(seriesKey, l, ranges))
  extra[`${prefix}_upper`] = up
  extra[`${prefix}_lower`] = lo
  extra[`${prefix}_base`] = lo
  extra[`${prefix}_span`] = Math.max(0, up - lo)
}

function writeMedianField(
  extra: Record<string, number | null>,
  prefix: string,
  date: string,
  medianAt: Map<string, number> | null,
  seriesKey: SeriesKey,
  ranges: { numbers: ValueRange; stars: ValueRange }
) {
  if (!medianAt) return
  const mid = medianAt.get(date)
  if (mid == null) return
  extra[`${prefix}_median`] = clampPlotted(seriesKey, plottedOf(seriesKey, mid, ranges))
}

type ChartPointerState = MouseHandlerDataParam

type PointerLike = {
  clientX: number
  clientY: number
  currentTarget: EventTarget | null
  altKey?: boolean
}

function pointerPixel(state: ChartPointerState, event?: PointerLike) {
  if (event) return { x: event.clientX, y: event.clientY }
  const at = state.activeCoordinate
  if (at && Number.isFinite(at.x) && Number.isFinite(at.y)) {
    return { x: at.x, y: at.y }
  }
  return null
}

function chartSvg(event: PointerLike): SVGSVGElement | null {
  const node = event.currentTarget
  if (node instanceof SVGSVGElement) return node
  if (node instanceof SVGElement) return node.ownerSVGElement
  if (node instanceof Element) return node.querySelector("svg")
  return null
}

function svgToClient(svg: SVGSVGElement, x: number, y: number) {
  if (typeof svg.createSVGPoint !== "function") return { x, y }
  const ctm = svg.getScreenCTM()
  if (!ctm) return { x, y }
  const pt = svg.createSVGPoint()
  pt.x = x
  pt.y = y
  const screen = pt.matrixTransform(ctm)
  return { x: screen.x, y: screen.y }
}

function clientToSvg(svg: SVGSVGElement, clientX: number, clientY: number) {
  if (typeof svg.createSVGPoint !== "function") return { x: clientX, y: clientY }
  const ctm = svg.getScreenCTM()
  if (!ctm) return { x: clientX, y: clientY }
  const pt = svg.createSVGPoint()
  pt.x = clientX
  pt.y = clientY
  const local = pt.matrixTransform(ctm.inverse())
  return { x: local.x, y: local.y }
}

function scaleInvertY(
  yScale: ((value: number) => number | undefined) | null | undefined,
  pixel: number
): number | null {
  if (!yScale) return null
  const scale = yScale as unknown as {
    invert?: (n: number) => unknown
    domain?: () => unknown[]
  }
  if (typeof scale.invert === "function") {
    const value = Number(scale.invert(pixel))
    if (Number.isFinite(value)) return value
  }
  const domain = typeof scale.domain === "function" ? scale.domain() : null
  const lo = domain && Number.isFinite(Number(domain[0])) ? Number(domain[0]) : null
  const hi = domain && Number.isFinite(Number(domain[1])) ? Number(domain[1]) : null
  if (lo == null || hi == null) return null
  return invertLinear((value) => yScale(value) ?? Number.NaN, pixel, lo, hi)
}

function MagnetHalo({
  live,
  plotted,
  onScales,
  yAxisId,
}: {
  live: LiveCursor | null
  plotted: number | null
  onScales: (scales: AxisScales) => void
  yAxisId?: string | number
}) {
  const xScale = useXAxisScale()
  const yScale = useYAxisScale(yAxisId)
  useLayoutEffect(() => {
    onScales({
      x: xScale ? (value) => xScale(value, { position: "middle" }) ?? Number.NaN : null,
      y: yScale ? (value) => yScale(value) ?? Number.NaN : null,
      invertY: yScale ? (pixel) => scaleInvertY(yScale, pixel) ?? Number.NaN : null,
    })
  }, [xScale, yScale, onScales])
  if (!live || plotted == null || !xScale || !yScale) return null
  const mx = xScale(live.date, { position: "middle" })
  const my = yScale(plotted)
  if (mx == null || my == null || !Number.isFinite(mx) || !Number.isFinite(my)) return null
  return (
    <g pointerEvents="none">
      <circle
        cx={mx}
        cy={my}
        r={live.snapped ? 8 : 5}
        fill="none"
        stroke="var(--chart-4)"
        strokeWidth={live.snapped ? 2 : 1}
        strokeDasharray={live.snapped ? undefined : "3 2"}
      />
    </g>
  )
}

function pixelSamples(
  dates: string[],
  values: number[],
  key: SeriesKey,
  ranges: { numbers: ValueRange; stars: ValueRange },
  scales: AxisScales
): PixelSample[] {
  const { x, y } = scales
  if (!x || !y) return []
  const out: PixelSample[] = []
  for (let i = 0; i < dates.length; i += 1) {
    const px = x(dates[i])
    const py = y(plottedOf(key, values[i], ranges))
    if (Number.isFinite(px) && Number.isFinite(py)) out.push({ index: i, px, py })
  }
  return out
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
    <div className="grid min-w-0 max-w-[min(18rem,calc(100vw-2rem))] items-start gap-1.5 rounded-lg border border-border/50 bg-background px-2.5 py-1.5 text-xs shadow-xl">
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
    <div className="grid min-w-0 max-w-[min(18rem,calc(100vw-2rem))] items-start gap-1.5 rounded-lg border border-border/50 bg-background px-2.5 py-1.5 text-xs shadow-xl">
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
                    {typeof value !== "number"
                      ? "—"
                      : key === "rank1"
                        ? formatRank1Step(value)
                        : formatStat(value)}
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

function placementHint(options: {
  live: LiveCursor | null
  startIndex: number | null
  midIndex?: number | null
  rails?: boolean
}) {
  const { live, startIndex, midIndex, rails } = options
  if (!live) return "Survole la courbe."
  const hasStart = startIndex != null
  const hasMid = midIndex != null
  if (live.offCurve) {
    if (
      startIndex != null &&
      live.index !== startIndex &&
      windowTooShort(startIndex, live.index)
    ) {
      return "Au moins 8 tirages entre le premier point et celui-ci."
    }
    return "Point hors courbe — clique pour poser."
  }
  if (!live.snapped) {
    if (hasStart) return "Approche un pivot de touche, ou Alt (⌥) pour poser hors courbe."
    return "Approche un pivot pour ancrer la borne."
  }
  if (
    startIndex != null &&
    live.index !== startIndex &&
    windowTooShort(startIndex, live.index) &&
    !hasMid
  ) {
    return "Au moins 8 tirages pour refermer la figure."
  }
  if (rails && hasStart && !hasMid) return "Clique le second point de la borne."
  if (rails && hasMid) return "Clique le contact opposé — le parallèle (ou la seconde borne)."
  if (hasStart) return "Clique l’arrivée. Alt (⌥) : hors courbe."
  return rails ? "Clique le premier point de la borne." : "Clique le départ."
}

export function DrawChart({ draws }: { draws: Draw[] }) {
  const draw = useChartDrawOptional()
  const drawRef = useRef(draw)
  useLayoutEffect(() => {
    drawRef.current = draw
  })
  const scalesRef = useRef<AxisScales>({ x: null, y: null, invertY: null })
  const onScales = useCallback((scales: AxisScales) => {
    scalesRef.current = scales
  }, [])
  const lastPointerRef = useRef<{ state: ChartPointerState; event: PointerLike } | null>(null)
  const pointerLogicRef = useRef<{
    liveFromPointer: (
      state: ChartPointerState,
      event: PointerLike,
      demagnetizeOverride?: boolean
    ) => LiveCursor | null
    publishLive: (live: LiveCursor | null) => void
  } | null>(null)
  const [altHeld, setAltHeld] = useState(false)
  const [mode, setMode] = useState<DrawChartMode>("sumBoth")
  const [scale, setScale] = useState<RelativeScale>("theory")
  const [hidden, setHidden] = useState<Partial<Record<SeriesKey, boolean>>>({})
  const [showSma, setShowSma] = useState(true)
  const [showBb, setShowBb] = useState(false)
  const [targetKey, setTargetKey] = useState<SeriesKey>("relNumbers")
  const [hint, setHint] = useState<string | null>(null)

  const series = useMemo(() => toDrawSeries(draws), [draws])
  const keys = useMemo(() => chartKeys(mode, series), [mode, series])
  const visibleKeys = useMemo(
    () => keys.filter((key) => !hidden[key]),
    [keys, hidden]
  )
  const combined = mode === "sumBoth"
  const smaPeriod = overlayPeriodFor(series.length)
  const rankMode = isRankMode(mode)
  const splitRank1 = splitRank1Axis(mode, visibleKeys)

  const overlayPacks = useMemo(() => {
    const packs: Partial<
      Record<SeriesKey, { abs: BandPoint[]; values: number[] }>
    > = {}
    if (!smaPeriod) return packs
    for (const key of keys) {
      const values = series.map((point) => point[sourceKey(key)])
      if (
        !values.every(
          (value): value is number => typeof value === "number" && Number.isFinite(value)
        )
      ) {
        continue
      }
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
      const stats = summarizeValues(
        series
          .map((point) => point[key])
          .filter(
            (value): value is number => typeof value === "number" && Number.isFinite(value)
          )
      )
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

  const numberRange = useMemo(
    () =>
      resolveRange(
        scale,
        series.map((point) => point.sumNumbers),
        NUMBER_SUM_RANGE
      ),
    [scale, series]
  )
  const starRange = useMemo(
    () =>
      resolveRange(
        scale,
        series.map((point) => point.sumStars),
        STAR_SUM_RANGE
      ),
    [scale, series]
  )
  const ranges = useMemo(
    () => ({ numbers: numberRange, stars: starRange }),
    [numberRange, starRange]
  )
  const dates = useMemo(() => series.map((point) => point.date), [series])

  const storedSketches = draw?.sketches
  const visibleSketches = useMemo(() => {
    if (!storedSketches) return []
    return storedSketches
      .map((sketch) => remapSketch(sketch, dates))
      .filter((sketch): sketch is NonNullable<typeof sketch> => sketch != null)
      .filter((sketch) => keys.includes(sketch.seriesKey as SeriesKey))
  }, [storedSketches, dates, keys])

  const draftStart = draw?.draft?.start ?? null
  const draftMid = draw?.draft?.mid ?? null
  const draftLive = draw?.live ?? null
  const draftFigure = draw?.figure ?? "ete"
  const drawing = Boolean(draw?.drawing)
  const draftGeometry = useMemo(() => {
    if (!drawing || !draftStart || !draftLive) return null
    const values = seriesValuesOf(series, targetKey)
    if (draftMid && isRailFigure(draftFigure)) {
      return buildSketchGeometry({
        figure: draftFigure,
        values,
        dates,
        from: draftStart.index,
        to: draftMid.index,
        fromActual: draftStart.actual,
        toActual: draftMid.actual,
        via: draftLive.index,
        viaActual: draftLive.actual,
      })
    }
    return buildSketchGeometry({
      figure: draftFigure,
      values,
      dates,
      from: draftStart.index,
      to: draftLive.index,
      fromActual: draftStart.actual,
      toActual: draftLive.actual,
    })
  }, [drawing, draftStart, draftMid, draftLive, draftFigure, series, dates, targetKey])
  const draftPoints = draftGeometry?.points ?? []
  const draftBand = draftGeometry?.band

  const lastSketch = visibleSketches[0] ?? null
  const hudStart = draftStart ?? lastSketch?.start ?? null
  const hudEnd = draftStart ? null : lastSketch?.end ?? null
  const draftReading = useMemo(() => {
    if (draftStart && draftLive && draftLive.index !== draftStart.index) {
      if (windowTooShort(draftStart.index, draftLive.index)) return null
      const values = seriesValuesOf(series, targetKey)
      return readWindow(values, dates, draftStart.index, draftLive.index, draftBand)
    }
    return lastSketch?.reading ?? null
  }, [draftStart, draftLive, draftBand, series, dates, targetKey, lastSketch])

  const plotData = useMemo(() => {
    if (!visibleSketches.length && !draftPoints.length && !draftBand) return chartData
    const seriesByKey = (key: SeriesKey) => seriesValuesOf(series, key)
    const bySketch = visibleSketches.map((sketch) => {
      const seriesKey = sketch.seriesKey as SeriesKey
      const values = seriesByKey(seriesKey)
      const band = resolveSketchBand(sketch, values, dates)
      return {
        key: sketchDataKey(sketch.id),
        seriesKey,
        at: new Map(sketch.points.map((point) => [point.date, point.actual])),
        band,
        upperAt: band ? new Map(band.upper.map((point) => [point.date, point.actual])) : null,
        lowerAt: band ? new Map(band.lower.map((point) => [point.date, point.actual])) : null,
        medianAt:
          band?.median && (sketch.showMedian ?? draw?.showMedian)
            ? new Map(band.median.map((point) => [point.date, point.actual]))
            : null,
        target: band?.target ?? null,
      }
    })
    const draftAt = new Map(draftPoints.map((point) => [point.date, point.actual]))
    const draftUpperAt = draftBand
      ? new Map(draftBand.upper.map((point) => [point.date, point.actual]))
      : null
    const draftLowerAt = draftBand
      ? new Map(draftBand.lower.map((point) => [point.date, point.actual]))
      : null
    const draftMedianAt =
      draftBand?.median && draw?.showMedian
        ? new Map(draftBand.median.map((point) => [point.date, point.actual]))
        : null
    return chartData.map((point) => {
      const extra: Record<string, number | null> = {}
      const date = String(point.date)
      for (const sketch of bySketch) {
        if (sketch.upperAt && sketch.lowerAt) {
          writeBandFields(
            extra,
            sketch.key,
            date,
            sketch.upperAt,
            sketch.lowerAt,
            sketch.seriesKey,
            ranges
          )
          writeMedianField(extra, sketch.key, date, sketch.medianAt, sketch.seriesKey, ranges)
        } else {
          const actual = sketch.at.get(date)
          extra[sketch.key] =
            actual == null ? null : plottedOf(sketch.seriesKey, actual, ranges)
        }
      }
      if (draftUpperAt && draftLowerAt) {
        writeBandFields(extra, DRAFT_KEY, date, draftUpperAt, draftLowerAt, targetKey, ranges)
        writeMedianField(extra, DRAFT_KEY, date, draftMedianAt, targetKey, ranges)
      } else if (draftPoints.length) {
        const actual = draftAt.get(date)
        extra[DRAFT_KEY] = actual == null ? null : plottedOf(targetKey, actual, ranges)
      }
      return { ...point, ...extra }
    })
  }, [
    chartData,
    visibleSketches,
    draftPoints,
    draftBand,
    ranges,
    targetKey,
    series,
    dates,
    draw?.showMedian,
  ])

  const setChartMeta = draw?.setChartMeta
  const visibleKeyList = visibleKeys.join(",")
  useEffect(() => {
    if (!setChartMeta) return
    setChartMeta({
      mode,
      modeLabel: MODES.find((item) => item.value === mode)?.label ?? mode,
      scale: combined ? scale : null,
      showSma: showSma && smaPeriod > 0,
      showBb: showBb && smaPeriod > 0,
      smaPeriod,
      visibleKeys: visibleKeyList ? visibleKeyList.split(",") : [],
    })
  }, [setChartMeta, mode, combined, scale, showSma, showBb, smaPeriod, visibleKeyList])

  useEffect(() => {
    if (!draw?.drawing) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setAltHeld(false)
      lastPointerRef.current = null
      return
    }
    function replay(demagnetize: boolean) {
      const snap = lastPointerRef.current
      const logic = pointerLogicRef.current
      if (!snap || !logic) return
      logic.publishLive(logic.liveFromPointer(snap.state, snap.event, demagnetize))
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        const current = drawRef.current
        if (current?.draft?.start) current.cancelDraft()
        else current?.setDrawing(false)
        return
      }
      if (event.key === "Alt" || event.key === "AltGraph") {
        const current = drawRef.current
        if (current?.draft?.start) {
          event.preventDefault()
        }
        setAltHeld(true)
        replay(true)
      }
    }
    function onKeyUp(event: KeyboardEvent) {
      if (event.key !== "Alt" && event.key !== "AltGraph") return
      setAltHeld(false)
      replay(false)
    }
    function onBlur() {
      setAltHeld(false)
      replay(false)
    }
    window.addEventListener("keydown", onKeyDown)
    window.addEventListener("keyup", onKeyUp)
    window.addEventListener("blur", onBlur)
    return () => {
      window.removeEventListener("keydown", onKeyDown)
      window.removeEventListener("keyup", onKeyUp)
      window.removeEventListener("blur", onBlur)
    }
  }, [draw?.drawing])

  function seriesValues(key: SeriesKey) {
    return seriesValuesOf(series, key)
  }

  function rememberPointer(state: ChartPointerState, event: PointerLike) {
    lastPointerRef.current = {
      state,
      event: {
        clientX: event.clientX,
        clientY: event.clientY,
        currentTarget: event.currentTarget,
        altKey: event.altKey,
      },
    }
  }

  function liveFromPointer(
    state: ChartPointerState,
    event: PointerLike,
    demagnetizeOverride?: boolean
  ): LiveCursor | null {
    if (!series.length) return null
    const values = seriesValues(targetKey)
    const pointer = pointerPixel(state, event)
    const svg = chartSvg(event)
    const rawSamples = pixelSamples(dates, values, targetKey, ranges, scalesRef.current)
    const samples = svg
      ? rawSamples.map((sample) => {
          const client = svgToClient(svg, sample.px, sample.py)
          return { index: sample.index, px: client.x, py: client.y }
        })
      : rawSamples
    const current = drawRef.current
    const demagnetize =
      demagnetizeOverride ?? (isDemagnetizeModifier(event) || altHeld)
    const offCurve = canFreePlaceArrival(
      Boolean(current?.draft?.start),
      demagnetize
    )
    const extrema = extremaIndices(values)
    const touches = swingTouches(values)
    const rails = isRailFigure(current?.figure ?? "")
    const startTouch = current?.draft?.start
    const midTouch = current?.draft?.mid
    let prefer: "H" | "L" | "any" = "any"
    if (rails && startTouch && !midTouch) {
      const atStart = touches.find((touch) => touch.index === startTouch.index)
      prefer = atStart?.type ?? "any"
    } else if (rails && startTouch && midTouch) {
      const atStart = touches.find((touch) => touch.index === startTouch.index)
      prefer = atStart?.type === "H" ? "L" : atStart?.type === "L" ? "H" : "any"
    }
    let index: number | null = null
    let distance: number | null = null
    let curveKind: LiveCursor["kind"] | null = null
    if (pointer && samples.length) {
      if (offCurve) {
        const near = nearestSampleByX(samples, pointer.x)
        if (near) {
          index = near.index
          const at = samples.find((item) => item.index === near.index)
          distance = at
            ? Math.hypot(pointer.x - at.px, pointer.y - at.py)
            : near.distanceX
        }
      } else {
        const hit = rails
          ? magnetOnTouches(samples, pointer, touches, prefer)
          : magnetOnCurve(samples, pointer, extrema)
        if (hit) {
          index = hit.index
          distance = hit.distance
          curveKind = hit.kind
        }
      }
    }
    if (index == null) {
      index = readTooltipIndex(state.activeTooltipIndex ?? state.activeIndex)
      const active = state.activeCoordinate
      if (active && svg) {
        distance = pixelDistance(pointer, svgToClient(svg, active.x, active.y))
      } else {
        distance = pixelDistance(pointer, active ?? null)
      }
    }
    if (index == null || index < 0 || index >= series.length) return null
    if (offCurve) {
      const svgLocal = svg && pointer ? clientToSvg(svg, pointer.x, pointer.y) : null
      let plotted: number | null = null
      if (svgLocal) {
        const inverted = scalesRef.current.invertY?.(svgLocal.y)
        if (inverted != null && Number.isFinite(inverted)) plotted = inverted
        if (plotted == null && rawSamples.length) {
          const plottedValues = values.map((value) => plottedOf(targetKey, value, ranges))
          plotted = valueFromPixelY(rawSamples, plottedValues, svgLocal.y)
        }
      }
      const actual =
        plotted != null && Number.isFinite(plotted)
          ? actualFromPlotted(targetKey, plotted, ranges)
          : null
      if (actual != null && Number.isFinite(actual)) {
        const sample = samples.find((item) => item.index === index)
        if (sample && pointer) {
          distance = Math.hypot(pointer.x - sample.px, pointer.y - sample.py)
        }
        return {
          index,
          date: series[index].date,
          seriesKey: targetKey,
          seriesLabel: chartConfig[targetKey].label,
          actual,
          snapped: false,
          offCurve: true,
          kind: "free",
          distancePx: distance,
          clientX: event.clientX,
          clientY: event.clientY,
        }
      }
    }
    const snapped = isMagneted(distance)
    const kind = snapped
      ? (curveKind && curveKind !== "free" ? curveKind : magnetKindAt(index, extrema))
      : "free"
    const sample = samples.find((item) => item.index === index)
    if (sample && pointer) distance = Math.hypot(pointer.x - sample.px, pointer.y - sample.py)
    return {
      index,
      date: series[index].date,
      seriesKey: targetKey,
      seriesLabel: chartConfig[targetKey].label,
      actual: values[index],
      snapped,
      offCurve: false,
      kind,
      distancePx: distance,
      clientX: event.clientX,
      clientY: event.clientY,
    }
  }

  function publishLive(live: LiveCursor | null) {
    const current = drawRef.current
    if (!current?.drawing) return
    current.setLive(live)
    setHint(
      placementHint({
        live,
        startIndex: current.draft?.start?.index ?? null,
        midIndex: current.draft?.mid?.index ?? null,
        rails: isRailFigure(current.figure),
      })
    )
  }

  useLayoutEffect(() => {
    pointerLogicRef.current = { liveFromPointer, publishLive }
  })

  function onChartMove(state: ChartPointerState, event: PointerLike) {
    const current = drawRef.current
    if (!current?.drawing) return
    rememberPointer(state, event)
    publishLive(liveFromPointer(state, event))
  }

  function onChartClick(state: ChartPointerState, event: PointerLike) {
    const current = drawRef.current
    if (!current?.drawing) return
    rememberPointer(state, event)
    const live = liveFromPointer(state, event)
    if (!live) {
      setHint("Survole la courbe.")
      return
    }
    if (!live.snapped && !live.offCurve) {
      setHint(
        placementHint({
          live,
          startIndex: current.draft?.start?.index ?? null,
          midIndex: current.draft?.mid?.index ?? null,
          rails: isRailFigure(current.figure),
        })
      )
      return
    }
    const start = current.draft?.start
    const mid = current.draft?.mid
    const rails = isRailFigure(current.figure)
    const makeAnchor = (): ChartAnchor => ({
      index: live.index,
      date: live.date,
      seriesKey: live.seriesKey,
      actual: live.actual,
      snapped: live.snapped,
      kind: live.kind,
    })
    if (!start) {
      if (!live.snapped) {
        setHint("Approche un pivot pour ancrer la borne.")
        return
      }
      current.setDraft({
        figure: current.figure,
        seriesKey: targetKey,
        seriesLabel: chartConfig[targetKey].label,
        start: makeAnchor(),
        mid: null,
      })
      setHint(
        rails
          ? "Clique le second point de la borne."
          : "Clique l’arrivée. Alt (⌥) : hors courbe."
      )
      return
    }
    if (rails && !mid) {
      if (live.index === start.index) {
        setHint("Choisis un autre point pour fermer la borne.")
        return
      }
      current.setDraft({
        figure: current.figure,
        seriesKey: targetKey,
        seriesLabel: chartConfig[targetKey].label,
        start,
        mid: makeAnchor(),
      })
      setHint("Clique le contact opposé — le parallèle (ou la seconde borne).")
      return
    }
    const left = Math.min(start.index, mid?.index ?? live.index, live.index)
    const right = Math.max(start.index, mid?.index ?? live.index, live.index)
    if (windowTooShort(left, right)) {
      setHint("Au moins 8 tirages pour refermer la figure.")
      return
    }
    const values = seriesValues(targetKey)
    const end = makeAnchor()
    const geo = buildSketchGeometry({
      figure: current.figure,
      values,
      dates,
      from: start.index,
      to: rails && mid ? mid.index : end.index,
      fromActual: start.actual,
      toActual: rails && mid ? mid.actual : end.actual,
      via: rails ? end.index : undefined,
      viaActual: rails ? end.actual : undefined,
    })
    current.addSketch({
      id: newSketchId(),
      host: current.host,
      figure: current.figure,
      seriesKey: targetKey,
      seriesLabel: chartConfig[targetKey].label,
      start,
      mid: rails ? mid ?? undefined : undefined,
      end,
      points: geo.points,
      band: geo.band,
      showMedian: current.showMedian,
      reading: readWindow(values, dates, left, right, geo.band),
      createdAt: new Date().toISOString(),
    })
    setHint("Annotation posée. Clique un nouveau départ, ou désactive le dessin.")
  }

  function changeMode(next: DrawChartMode) {
    const leavingSums = !isRankMode(mode)
    const enteringSums = isRankMode(mode) && !isRankMode(next)
    setMode(next)
    setHidden({})
    setTargetKey(MODE_KEYS[next][0])
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
                    <CurveName
                      kind={mode}
                      label={MODES.find((item) => item.value === mode)?.label ?? mode}
                    />
                  </span>
                </SelectTrigger>
                <SelectContent className="min-w-56">
                  {MODES.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      <CurveName kind={item.value} label={item.label} />
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </LabelHelp>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {draw ? (
          <div className="mb-3">
            <SketchToolbar
              drawing={draw.drawing}
              figure={draw.figure}
              seriesKey={targetKey}
              seriesOptions={keys.map((key) => ({
                value: key,
                label: chartConfig[key].label,
              }))}
              sketches={draw.sketches}
              dates={dates}
              canUndo={Boolean(draw.draft?.start || draw.draft?.mid)}
              showMedian={draw.showMedian}
              onShowMedian={draw.setShowMedian}
              onToggle={() => {
                const next = !draw.drawing
                draw.setDrawing(next)
                if (next) {
                  draw.setDraft({
                    figure: draw.figure,
                    seriesKey: targetKey,
                    seriesLabel: chartConfig[targetKey].label,
                    start: null,
                    mid: null,
                  })
                  setHint(
                    isRailFigure(draw.figure)
                      ? "Clique le premier point de la borne."
                      : "Clique le départ, près de la courbe."
                  )
                  if (hidden[targetKey]) {
                    setHidden((current) => ({ ...current, [targetKey]: false }))
                  }
                } else {
                  setHint(null)
                }
              }}
              onFigure={draw.setFigure}
              onSeries={(key) => {
                setTargetKey(key as SeriesKey)
                draw.cancelDraft()
                setHint(
                  isRailFigure(draw.figure)
                    ? "Clique le premier point de la borne."
                    : "Clique le départ, près de la courbe."
                )
              }}
              onCancel={draw.cancelDraft}
              onClear={draw.clearSketches}
              onRemove={draw.removeSketch}
            />
          </div>
        ) : null}
        {series.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Aucun tirage à tracer : affinez le filtre.
          </p>
        ) : (
          <>
            <ChartContainer
              config={chartConfig}
              className={cn(
                "aspect-auto h-[220px] w-full sm:h-[280px] lg:h-[340px]",
                draw?.drawing && "cursor-crosshair"
              )}
            >
              <ComposedChart
                key={`${mode}-${combined ? scale : "abs"}-${splitRank1 ? "split" : "one"}`}
                accessibilityLayer
                data={plotData}
                margin={{
                  left: 4,
                  right: splitRank1 ? 36 : 8,
                  top: combined ? 16 : 8,
                  bottom: 4,
                }}
                onMouseMove={(state, event) => {
                  if (!draw?.drawing) return
                  onChartMove(state, event)
                }}
                onClick={(state, event) => {
                  if (!draw?.drawing) return
                  onChartClick(state, event)
                }}
                onMouseLeave={() => {
                  lastPointerRef.current = null
                  if (draw?.drawing) draw.setLive(null)
                }}
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
                  domain={yDomain(mode, visibleKeys)}
                  width={combined ? 42 : 36}
                  tickLine={false}
                  axisLine={false}
                  allowDecimals={false}
                  allowDataOverflow={yDomainLocked(mode, visibleKeys)}
                  tickFormatter={combined ? (value) => `${value}%` : undefined}
                />
                {splitRank1 ? (
                  <YAxis
                    yAxisId="rank1"
                    orientation="right"
                    domain={[0, 1]}
                    width={32}
                    ticks={[0, 1]}
                    tickLine={false}
                    axisLine={false}
                    allowDecimals={false}
                    tickFormatter={(value) => (value === 0 ? "0" : "+1")}
                  />
                ) : null}
                {combined && scale === "theory" ? (
                  <ReferenceLine
                    y={50}
                    stroke="var(--muted-foreground)"
                    strokeOpacity={0.4}
                    strokeDasharray="4 4"
                  />
                ) : null}
                <ChartTooltip
                  cursor={draw?.drawing ? false : undefined}
                  content={
                    draw?.drawing ? (
                      () => null
                    ) : useCustomTooltip ? (
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
                          yAxisId={plotAxisId(key, splitRank1)}
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
                          yAxisId={plotAxisId(key, splitRank1)}
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
                    yAxisId={plotAxisId(key, splitRank1)}
                    type={key === "rank1" ? "stepAfter" : "monotone"}
                    stroke={`var(--color-${key})`}
                    strokeWidth={key === "rank1" ? 1.75 : 2}
                    strokeDasharray={key === "rank1" ? "4 3" : undefined}
                    hide={Boolean(hidden[key])}
                    connectNulls={false}
                    dot={
                      key === "rank1"
                        ? { r: 3 }
                        : series.length > 24
                          ? { r: 2 }
                          : { r: 3 }
                    }
                    activeDot={{ r: 4 }}
                  />
                ))}
                {smaPeriod > 0 && showSma
                  ? visibleKeys.map((key) => (
                      <Line
                        key={`sma-${key}`}
                        dataKey={overlayField(key, "sma")}
                        yAxisId={plotAxisId(key, splitRank1)}
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
                          yAxisId={plotAxisId(key, splitRank1)}
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
                          yAxisId={plotAxisId(key, splitRank1)}
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
                            yAxisId={plotAxisId(key, splitRank1)}
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
                {visibleSketches.map((sketch) => {
                  const seriesKey = sketch.seriesKey as SeriesKey
                  const axisId = plotAxisId(seriesKey, splitRank1)
                  const values = seriesValuesOf(series, seriesKey)
                  const band = resolveSketchBand(sketch, values, dates)
                  if (band) {
                    const prefix = sketchDataKey(sketch.id)
                    return (
                      <Fragment key={sketch.id}>
                        <Area
                          type="linear"
                          dataKey={`${prefix}_base`}
                          yAxisId={axisId}
                          stackId={`canal-${sketch.id}`}
                          fill="transparent"
                          stroke="none"
                          legendType="none"
                          tooltipType="none"
                          isAnimationActive={false}
                        />
                        <Area
                          type="linear"
                          dataKey={`${prefix}_span`}
                          yAxisId={axisId}
                          stackId={`canal-${sketch.id}`}
                          fill="var(--chart-5)"
                          fillOpacity={0.16}
                          stroke="none"
                          legendType="none"
                          tooltipType="none"
                          isAnimationActive={false}
                        />
                        <Line
                          dataKey={`${prefix}_upper`}
                          yAxisId={axisId}
                          type="linear"
                          stroke="var(--chart-5)"
                          strokeWidth={2}
                          dot={false}
                          connectNulls
                          legendType="none"
                          tooltipType="none"
                          isAnimationActive={false}
                          name={`${channelLabel(sketch.figure, band)} +`}
                        />
                        <Line
                          dataKey={`${prefix}_lower`}
                          yAxisId={axisId}
                          type="linear"
                          stroke="var(--chart-5)"
                          strokeWidth={2}
                          dot={false}
                          connectNulls
                          legendType="none"
                          tooltipType="none"
                          isAnimationActive={false}
                          name={`${channelLabel(sketch.figure, band)} −`}
                        />
                        {sketch.showMedian ?? draw?.showMedian ? (
                          <Line
                            dataKey={`${prefix}_median`}
                            yAxisId={axisId}
                            type="linear"
                            stroke="var(--chart-5)"
                            strokeWidth={1.25}
                            strokeDasharray="4 3"
                            strokeOpacity={0.85}
                            dot={false}
                            connectNulls
                            legendType="none"
                            tooltipType="none"
                            isAnimationActive={false}
                            name="Médiane"
                          />
                        ) : null}
                        {band.target != null ? (
                          <ReferenceLine
                            y={plottedOf(seriesKey, band.target, ranges)}
                            yAxisId={axisId}
                            stroke="var(--chart-3)"
                            strokeDasharray="2 4"
                            strokeOpacity={0.8}
                            label={{
                              value: "objectif",
                              fill: "var(--chart-3)",
                              fontSize: 10,
                              position: "insideTopRight",
                            }}
                          />
                        ) : null}
                      </Fragment>
                    )
                  }
                  return (
                    <Line
                      key={sketch.id}
                      dataKey={sketchDataKey(sketch.id)}
                      yAxisId={axisId}
                      type="monotone"
                      stroke="var(--chart-4)"
                      strokeWidth={2}
                      strokeDasharray="6 3"
                      dot={false}
                      connectNulls
                      legendType="none"
                      tooltipType="none"
                      isAnimationActive={false}
                      name={sketch.seriesLabel}
                    />
                  )
                })}
                {draftBand ? (
                  <Fragment>
                    <Area
                      type="linear"
                      dataKey={`${DRAFT_KEY}_base`}
                      yAxisId={plotAxisId(targetKey, splitRank1)}
                      stackId="canal-draft"
                      fill="transparent"
                      stroke="none"
                      legendType="none"
                      tooltipType="none"
                      isAnimationActive={false}
                    />
                    <Area
                      type="linear"
                      dataKey={`${DRAFT_KEY}_span`}
                      yAxisId={plotAxisId(targetKey, splitRank1)}
                      stackId="canal-draft"
                      fill="var(--chart-5)"
                      fillOpacity={0.1}
                      stroke="none"
                      legendType="none"
                      tooltipType="none"
                      isAnimationActive={false}
                    />
                    <Line
                      dataKey={`${DRAFT_KEY}_upper`}
                      yAxisId={plotAxisId(targetKey, splitRank1)}
                      type="linear"
                      stroke="var(--chart-5)"
                      strokeWidth={2}
                      strokeOpacity={0.9}
                      dot={false}
                      connectNulls
                      legendType="none"
                      tooltipType="none"
                      isAnimationActive={false}
                    />
                    <Line
                      dataKey={`${DRAFT_KEY}_lower`}
                      yAxisId={plotAxisId(targetKey, splitRank1)}
                      type="linear"
                      stroke="var(--chart-5)"
                      strokeWidth={2}
                      strokeOpacity={0.9}
                      dot={false}
                      connectNulls
                      legendType="none"
                      tooltipType="none"
                      isAnimationActive={false}
                    />
                    {draw?.showMedian ? (
                      <Line
                        dataKey={`${DRAFT_KEY}_median`}
                        yAxisId={plotAxisId(targetKey, splitRank1)}
                        type="linear"
                        stroke="var(--chart-5)"
                        strokeWidth={1.25}
                        strokeDasharray="4 3"
                        strokeOpacity={0.75}
                        dot={false}
                        connectNulls
                        legendType="none"
                        tooltipType="none"
                        isAnimationActive={false}
                      />
                    ) : null}
                    {draftBand.target != null ? (
                      <ReferenceLine
                        y={plottedOf(targetKey, draftBand.target, ranges)}
                        yAxisId={plotAxisId(targetKey, splitRank1)}
                        stroke="var(--chart-3)"
                        strokeDasharray="2 4"
                        strokeOpacity={0.7}
                      />
                    ) : null}
                  </Fragment>
                ) : draftPoints.length > 0 ? (
                  <Line
                    dataKey={DRAFT_KEY}
                    yAxisId={plotAxisId(targetKey, splitRank1)}
                    type="monotone"
                    stroke="var(--chart-4)"
                    strokeWidth={2}
                    strokeDasharray="2 3"
                    strokeOpacity={0.9}
                    dot={false}
                    connectNulls
                    legendType="none"
                    tooltipType="none"
                    isAnimationActive={false}
                  />
                ) : null}
                {draw?.draft?.start ? (
                  <>
                    <ReferenceLine
                      x={draw.draft.start.date}
                      stroke="var(--chart-4)"
                      strokeDasharray="3 3"
                      strokeOpacity={0.55}
                    />
                    <ReferenceDot
                      x={draw.draft.start.date}
                      y={plottedOf(
                        draw.draft.start.seriesKey as SeriesKey,
                        draw.draft.start.actual,
                        ranges
                      )}
                      yAxisId={plotAxisId(
                        draw.draft.start.seriesKey as SeriesKey,
                        splitRank1
                      )}
                      r={5}
                      fill="var(--chart-4)"
                      stroke="var(--background)"
                    />
                  </>
                ) : null}
                {draw?.draft?.mid ? (
                  <ReferenceDot
                    x={draw.draft.mid.date}
                    y={plottedOf(
                      draw.draft.mid.seriesKey as SeriesKey,
                      draw.draft.mid.actual,
                      ranges
                    )}
                    yAxisId={plotAxisId(
                      draw.draft.mid.seriesKey as SeriesKey,
                      splitRank1
                    )}
                    r={5}
                    fill="var(--chart-5)"
                    stroke="var(--background)"
                  />
                ) : null}
                {draw?.drawing && draw.live ? (
                  <>
                    <ReferenceLine
                      x={draw.live.date}
                      stroke="var(--chart-4)"
                      strokeDasharray="3 3"
                      strokeOpacity={0.35}
                    />
                    <ReferenceDot
                      x={draw.live.date}
                      y={plottedOf(targetKey, draw.live.actual, ranges)}
                      yAxisId={plotAxisId(targetKey, splitRank1)}
                      r={4}
                      fill={draw.live.snapped ? "var(--chart-4)" : "transparent"}
                      stroke="var(--chart-4)"
                    />
                  </>
                ) : null}
                {visibleSketches.map((sketch) => (
                  <Fragment key={`${sketch.id}-anchors`}>
                    <ReferenceDot
                      x={sketch.start.date}
                      y={plottedOf(sketch.seriesKey as SeriesKey, sketch.start.actual, ranges)}
                      yAxisId={plotAxisId(sketch.seriesKey as SeriesKey, splitRank1)}
                      r={4}
                      fill="var(--chart-4)"
                      stroke="var(--background)"
                    />
                    <ReferenceDot
                      x={sketch.end.date}
                      y={plottedOf(sketch.seriesKey as SeriesKey, sketch.end.actual, ranges)}
                      yAxisId={plotAxisId(sketch.seriesKey as SeriesKey, splitRank1)}
                      r={4}
                      fill="var(--chart-4)"
                      stroke="var(--background)"
                    />
                    {sketch.mid ? (
                      <ReferenceDot
                        x={sketch.mid.date}
                        y={plottedOf(sketch.seriesKey as SeriesKey, sketch.mid.actual, ranges)}
                        yAxisId={plotAxisId(sketch.seriesKey as SeriesKey, splitRank1)}
                        r={4}
                        fill="var(--chart-5)"
                        stroke="var(--background)"
                      />
                    ) : null}
                  </Fragment>
                ))}
                <MagnetHalo
                  live={draw?.drawing ? draw.live : null}
                  plotted={
                    draw?.live
                      ? plottedOf(targetKey, draw.live.actual, ranges)
                      : null
                  }
                  onScales={onScales}
                  yAxisId={
                    splitRank1 && targetKey === "rank1" ? "rank1" : undefined
                  }
                />
              </ComposedChart>
            </ChartContainer>
            {draw?.drawing ? (
              <CoordHud
                live={draw.live}
                start={hudStart}
                mid={draftMid}
                end={hudEnd}
                rails={isRailFigure(draw.figure)}
                figureLabel={channelLabel(draw.figure, draftBand)}
                seriesLabel={chartConfig[targetKey].label}
                reading={draftReading}
                drawCount={series.length}
                hint={hint}
              />
            ) : null}
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
            {splitRank1 ? (
              <p className="mt-3 text-center text-xs text-muted-foreground">
                Axe droit : 1er rang · 0 = gagnant du jackpot · +1 = pas de gagnant
                (report).
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
