"use client"

import { useMemo, useState } from "react"
import { CartesianGrid, Line, LineChart, ReferenceLine, XAxis, YAxis } from "recharts"

import { HelpTip, TitleHelp, type HelpCopy } from "@/components/help"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  ChartContainer,
  ChartTooltip,
  type ChartConfig,
} from "@/components/ui/chart"
import { sma } from "@/lib/analysis"
import {
  type Draw,
  type ParityChartPoint,
  formatDrawDate,
  formatParitySplit,
  formatShortDate,
  pearsonCorrelation,
  summarizeParitySeries,
  toParityChart,
} from "@/lib/draws"
import { cn } from "@/lib/utils"

type ParityView = "walk" | "step"
type SeriesKey = "numbers" | "stars"

const VIEWS: { value: ParityView; label: string }[] = [
  { value: "walk", label: "Cumul" },
  { value: "step", label: "Par tirage" },
]

const chartConfig = {
  walkNumbers: { label: "Numéros", color: "var(--chart-1)" },
  walkStars: { label: "Étoiles", color: "var(--chart-2)" },
  parityNumbers: { label: "Numéros", color: "var(--chart-1)" },
  parityStars: { label: "Étoiles", color: "var(--chart-2)" },
  smaNumbers: { label: "SMA numéros", color: "var(--chart-1)" },
  smaStars: { label: "SMA étoiles", color: "var(--chart-2)" },
  bandHiNumbers: { label: "Bande numéros", color: "var(--chart-1)" },
  bandLoNumbers: { label: "Bande numéros", color: "var(--chart-1)" },
  bandHiStars: { label: "Bande étoiles", color: "var(--chart-2)" },
  bandLoStars: { label: "Bande étoiles", color: "var(--chart-2)" },
} satisfies ChartConfig

const TITLE_HELP: HelpCopy = {
  title: "Suivi pair / impair",
  wide: true,
  body: `Chaque boule ou étoile paire compte +1, chaque impaire −1.

Score d’un tirage = somme de ces signes :
• 5 numéros : de −5 (5 impairs) à +5 (5 pairs), toujours un entier impair.
• 2 étoiles : −2, 0 ou +2.

Le cumul part de 0 au premier tirage de la fenêtre et additionne les scores. Espérance 0 (25 pairs / 25 impairs dans l’urne, 6 / 6 pour les étoiles). Une dérive n’augmente pas la chance au tirage suivant.`,
}

const VIEW_HELP: HelpCopy = {
  title: "Cumul ou par tirage",
  body: "Cumul : marche du score depuis le début de la fenêtre (courbe de suivi). Par tirage : le pas de chaque grille (+1/−1 par boule). La SMA lisse la série affichée.",
}

const SERIES_HELP: Record<SeriesKey, HelpCopy> = {
  numbers: {
    title: "Numéros",
    body: "Score des 5 boules : pair +1, impair −1. Cliquez la pastille pour masquer la courbe.",
  },
  stars: {
    title: "Étoiles",
    body: "Score des 2 étoiles : pair +1, impair −1. Cliquez la pastille pour masquer la courbe.",
  },
}

const BAND_HELP: HelpCopy = {
  title: "Bande ±1,96σ√t",
  body: "Zone où une marche d’espérance 0 a environ 95 % de chances de se trouver. Elle s’élargit avec √t. L’axe Y suit le cumul observé : si la marche reste calme, la bande sort du graphe. Descriptif, pas une prédiction.",
}

const SUMMARY_HELP: HelpCopy = {
  title: "min · max · cumul",
  body: "Sur le cumul de la fenêtre : excursion min/max, dernière valeur, pas moyen par tirage. Compteurs de majorités paires/impaires, part du temps où le cumul était positif, et série en cours (tirages consécutifs du même signe).",
}

type ChartPoint = ParityChartPoint & {
  smaNumbers: number | null
  smaStars: number | null
}

function smaPeriodFor(length: number) {
  if (length >= 40) return 10
  if (length >= 10) return 5
  return 0
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

function formatExpectedSplit(even: number) {
  const body = formatStat(even, 1)
  return `${body}p / ${body}i`
}

function formatPct(value: number) {
  return `${formatStat(100 * value, 0)} %`
}

function formatStreak(sign: -1 | 0 | 1, length: number, kind: SeriesKey) {
  if (length === 0) return "série —"
  const n = `${length} tirage${length > 1 ? "s" : ""}`
  if (kind === "stars") {
    if (sign > 0) return `${n} à 2 pairs`
    if (sign < 0) return `${n} à 2 impairs`
  }
  if (sign > 0) return `${n} à majorité paire`
  if (sign < 0) return `${n} à majorité impaire`
  return "série —"
}

function yDomain(
  view: ParityView,
  points: ChartPoint[],
  hidden: Partial<Record<SeriesKey, boolean>>
): [number, number] {
  if (view === "step") return [-5, 5]
  const values: number[] = [0]
  for (const point of points) {
    if (!hidden.numbers) values.push(point.walkNumbers)
    if (!hidden.stars) values.push(point.walkStars)
  }
  const lo = Math.min(...values)
  const hi = Math.max(...values)
  const pad = Math.max(1, Math.ceil((hi - lo) * 0.12) || 1)
  return [lo - pad, hi + pad]
}

function ParityTooltip({
  active,
  payload,
  label,
  view,
  smaPeriod,
}: {
  active?: boolean
  payload?: Array<{
    dataKey?: string | number
    color?: string
    payload?: ChartPoint
  }>
  label?: string
  view: ParityView
  smaPeriod: number
}) {
  if (!active || !payload?.length) return null
  const point = payload[0]?.payload
  if (!point) return null

  const rows: { key: string; label: string; color: string; detail: string }[] = []
  const seen = new Set<string>()
  for (const item of payload) {
    const key = String(item.dataKey ?? "")
    if (seen.has(key) || key.startsWith("band")) continue
    seen.add(key)
    const color = item.color ?? "var(--muted-foreground)"
    if (key === "walkNumbers" || key === "parityNumbers") {
      rows.push({
        key,
        label: "Numéros",
        color,
        detail: `${formatParitySplit(point.evenNumbers, point.oddNumbers)} · pas ${formatSigned(point.parityNumbers, 0)} · cumul ${formatSigned(point.walkNumbers, 0)}`,
      })
    } else if (key === "walkStars" || key === "parityStars") {
      rows.push({
        key,
        label: "Étoiles",
        color,
        detail: `${formatParitySplit(point.evenStars, point.oddStars)} · pas ${formatSigned(point.parityStars, 0)} · cumul ${formatSigned(point.walkStars, 0)}`,
      })
    } else if (key === "smaNumbers") {
      rows.push({
        key,
        label: `SMA ${smaPeriod} numéros`,
        color,
        detail: point.smaNumbers == null ? "—" : formatSigned(point.smaNumbers),
      })
    } else if (key === "smaStars") {
      rows.push({
        key,
        label: `SMA ${smaPeriod} étoiles`,
        color,
        detail: point.smaStars == null ? "—" : formatSigned(point.smaStars),
      })
    }
  }

  return (
    <div className="grid min-w-48 items-start gap-1.5 rounded-lg border border-border/50 bg-background px-2.5 py-1.5 text-xs shadow-xl">
      <div className="font-medium">{formatDrawDate(String(label ?? point.date))}</div>
      {view === "walk" ? (
        <p className="text-muted-foreground">Cumul depuis le début de la fenêtre.</p>
      ) : null}
      <div className="grid gap-1.5">
        {rows.map((row) => (
          <div key={row.key} className="flex items-start gap-2">
            <span
              className="mt-0.5 size-2.5 shrink-0 rounded-[2px]"
              style={{ background: row.color }}
            />
            <div className="min-w-0 flex-1">
              <div className="text-muted-foreground">{row.label}</div>
              <div className="font-mono font-medium tabular-nums">{row.detail}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export function EvolutionParity({ draws }: { draws: Draw[] }) {
  const [view, setView] = useState<ParityView>("walk")
  const [hidden, setHidden] = useState<Partial<Record<SeriesKey, boolean>>>({})
  const [showSma, setShowSma] = useState(true)
  const [showBand, setShowBand] = useState(false)

  const points = useMemo(() => toParityChart(draws), [draws])
  const smaPeriod = smaPeriodFor(points.length)
  const numberKey = view === "walk" ? "walkNumbers" : "parityNumbers"
  const starKey = view === "walk" ? "walkStars" : "parityStars"
  const showNumbers = !hidden.numbers
  const showStars = !hidden.stars

  const chartData = useMemo(() => {
    const numberValues = points.map((point) => point[numberKey])
    const starValues = points.map((point) => point[starKey])
    const smaN = smaPeriod ? sma(numberValues, smaPeriod) : []
    const smaS = smaPeriod ? sma(starValues, smaPeriod) : []
    return points.map((point, i) => ({
      ...point,
      smaNumbers: smaPeriod ? (smaN[i] ?? null) : null,
      smaStars: smaPeriod ? (smaS[i] ?? null) : null,
    }))
  }, [points, numberKey, starKey, smaPeriod])

  const numberStats = useMemo(
    () => summarizeParitySeries(points, "numbers"),
    [points]
  )
  const starStats = useMemo(() => summarizeParitySeries(points, "stars"), [points])
  const correlation = useMemo(() => {
    if (points.length < 3 || hidden.numbers || hidden.stars) return null
    const xs =
      view === "walk"
        ? points.map((point) => point.walkNumbers)
        : points.map((point) => point.parityNumbers)
    const ys =
      view === "walk"
        ? points.map((point) => point.walkStars)
        : points.map((point) => point.parityStars)
    return pearsonCorrelation(xs, ys)
  }, [points, view, hidden.numbers, hidden.stars])

  const domain = yDomain(view, chartData, hidden)
  const bandOn = view === "walk" && showBand

  return (
    <Card>
      <CardHeader className="gap-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="text-base font-medium">
            <TitleHelp help={TITLE_HELP}>Suivi pair / impair</TitleHelp>
          </CardTitle>
          <div className="flex flex-col gap-1">
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              Lecture
              <HelpTip {...VIEW_HELP} />
            </span>
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Lecture pair / impair">
              {VIEWS.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  aria-pressed={view === item.value}
                  onClick={() => setView(item.value)}
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
        {points.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Aucun tirage à tracer : affinez le filtre.
          </p>
        ) : (
          <>
            <ChartContainer
              config={chartConfig}
              className="aspect-auto h-[280px] w-full sm:h-[340px]"
            >
              <LineChart
                key={`${view}-${showBand ? "band" : "plain"}`}
                accessibilityLayer
                data={chartData}
                margin={{ left: 4, right: 8, top: 8, bottom: 4 }}
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
                  domain={domain}
                  width={42}
                  tickLine={false}
                  axisLine={false}
                  allowDecimals={false}
                />
                <ReferenceLine
                  y={0}
                  stroke="var(--muted-foreground)"
                  strokeOpacity={0.45}
                  strokeDasharray="4 4"
                />
                <ChartTooltip
                  content={<ParityTooltip view={view} smaPeriod={smaPeriod} />}
                />
                {bandOn && showNumbers ? (
                  <>
                    <Line
                      dataKey="bandHiNumbers"
                      type="linear"
                      stroke="var(--color-bandHiNumbers)"
                      strokeWidth={1}
                      strokeDasharray="2 5"
                      strokeOpacity={0.45}
                      dot={false}
                      legendType="none"
                      name="Bande + numéros"
                    />
                    <Line
                      dataKey="bandLoNumbers"
                      type="linear"
                      stroke="var(--color-bandLoNumbers)"
                      strokeWidth={1}
                      strokeDasharray="2 5"
                      strokeOpacity={0.45}
                      dot={false}
                      legendType="none"
                      name="Bande − numéros"
                    />
                  </>
                ) : null}
                {bandOn && showStars ? (
                  <>
                    <Line
                      dataKey="bandHiStars"
                      type="linear"
                      stroke="var(--color-bandHiStars)"
                      strokeWidth={1}
                      strokeDasharray="2 5"
                      strokeOpacity={0.45}
                      dot={false}
                      legendType="none"
                      name="Bande + étoiles"
                    />
                    <Line
                      dataKey="bandLoStars"
                      type="linear"
                      stroke="var(--color-bandLoStars)"
                      strokeWidth={1}
                      strokeDasharray="2 5"
                      strokeOpacity={0.45}
                      dot={false}
                      legendType="none"
                      name="Bande − étoiles"
                    />
                  </>
                ) : null}
                <Line
                  dataKey={numberKey}
                  type="linear"
                  stroke="var(--color-walkNumbers)"
                  strokeWidth={2}
                  hide={!showNumbers}
                  dot={points.length > 24 ? { r: 2 } : { r: 3 }}
                  activeDot={{ r: 4 }}
                  name="Numéros"
                />
                <Line
                  dataKey={starKey}
                  type="linear"
                  stroke="var(--color-walkStars)"
                  strokeWidth={2}
                  hide={!showStars}
                  dot={points.length > 24 ? { r: 2 } : { r: 3 }}
                  activeDot={{ r: 4 }}
                  name="Étoiles"
                />
                {smaPeriod > 0 && showSma && showNumbers ? (
                  <Line
                    dataKey="smaNumbers"
                    type="linear"
                    stroke="var(--color-smaNumbers)"
                    strokeWidth={2}
                    strokeDasharray="5 4"
                    dot={false}
                    connectNulls
                    name={`SMA ${smaPeriod} numéros`}
                  />
                ) : null}
                {smaPeriod > 0 && showSma && showStars ? (
                  <Line
                    dataKey="smaStars"
                    type="linear"
                    stroke="var(--color-smaStars)"
                    strokeWidth={2}
                    strokeDasharray="5 4"
                    dot={false}
                    connectNulls
                    name={`SMA ${smaPeriod} étoiles`}
                  />
                ) : null}
              </LineChart>
            </ChartContainer>
            <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
              {smaPeriod > 0 ? (
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
                      style={{ background: chartConfig.smaNumbers.color }}
                    />
                    SMA {smaPeriod}
                  </button>
                  <HelpTip
                    title={`SMA ${smaPeriod}`}
                    body={`Moyenne simple sur ${smaPeriod} tirages, sur la série affichée (cumul ou pas). Lissage descriptif, pas une prédiction.`}
                  />
                </span>
              ) : null}
              {view === "walk" ? (
                <span className="inline-flex items-center gap-1">
                  <button
                    type="button"
                    aria-pressed={showBand}
                    title="Afficher ou masquer la bande type ±1,96σ√t"
                    onClick={() => setShowBand((current) => !current)}
                    className={cn(
                      "flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-xs transition-opacity hover:bg-muted",
                      !showBand && "opacity-40"
                    )}
                  >
                    <span className="size-2 shrink-0 rounded-[2px] border border-dashed border-muted-foreground" />
                    Bande ±1,96σ
                  </button>
                  <HelpTip {...BAND_HELP} />
                </span>
              ) : null}
              {(["numbers", "stars"] as const).map((key) => (
                <span key={key} className="inline-flex items-center gap-1">
                  <button
                    type="button"
                    aria-pressed={!hidden[key]}
                    title={`Afficher ou masquer ${key === "numbers" ? "numéros" : "étoiles"}`}
                    onClick={() =>
                      setHidden((current) => ({
                        ...current,
                        [key]: !current[key],
                      }))
                    }
                    className={cn(
                      "flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-xs transition-opacity hover:bg-muted",
                      hidden[key] && "opacity-40"
                    )}
                  >
                    <span
                      className="size-2 shrink-0 rounded-[2px]"
                      style={{
                        background:
                          key === "numbers"
                            ? chartConfig.walkNumbers.color
                            : chartConfig.walkStars.color,
                      }}
                    />
                    {key === "numbers" ? "Numéros" : "Étoiles"}
                  </button>
                  <HelpTip {...SERIES_HELP[key]} />
                </span>
              ))}
            </div>
            <p className="mt-3 text-center text-xs text-muted-foreground">
              {view === "walk"
                ? "Trait à 0 = équilibre pair / impair. Le cumul repart de 0 au premier tirage de la fenêtre."
                : "Pas de chaque tirage : numéros −5…+5, étoiles −2, 0, +2. Trait à 0 = autant de pairs que d’impairs (possible seulement pour les étoiles)."}
            </p>
            {numberStats || starStats ? (
              <div className="mt-3 flex w-full flex-col items-center gap-1.5 text-center text-xs text-muted-foreground">
                <div className="flex flex-wrap items-start justify-center gap-1.5">
                  <p>
                    {[
                      showNumbers && numberStats
                        ? `Numéros : min ${formatSigned(numberStats.minWalk, 0)} · max ${formatSigned(numberStats.maxWalk, 0)} · cumul ${formatSigned(numberStats.lastWalk, 0)} · pas moy. ${formatSigned(numberStats.meanStep)}`
                        : null,
                      showStars && starStats
                        ? `Étoiles : min ${formatSigned(starStats.minWalk, 0)} · max ${formatSigned(starStats.maxWalk, 0)} · cumul ${formatSigned(starStats.lastWalk, 0)} · pas moy. ${formatSigned(starStats.meanStep)}`
                        : null,
                    ]
                      .filter(Boolean)
                      .join("  ·  ")}
                  </p>
                  <HelpTip {...SUMMARY_HELP} className="mt-0.5" />
                </div>
                <p>
                  {[
                    showNumbers && numberStats
                      ? `Boules ${formatParitySplit(numberStats.evenTotal, numberStats.oddTotal)} (attendu ${formatExpectedSplit(numberStats.expectedEven)}) · ${numberStats.plusCount} maj. paires / ${numberStats.minusCount} impaires · ${formatPct(numberStats.aboveZeroShare)} du cumul > 0 · ${formatStreak(numberStats.streak.sign, numberStats.streak.length, "numbers")}`
                      : null,
                    showStars && starStats
                      ? `Étoiles ${formatParitySplit(starStats.evenTotal, starStats.oddTotal)} (attendu ${formatExpectedSplit(starStats.expectedEven)}) · ${starStats.plusCount} à 2 pairs / ${starStats.zeroCount} mixtes / ${starStats.minusCount} à 2 impairs · ${formatPct(starStats.aboveZeroShare)} du cumul > 0 · ${formatStreak(starStats.streak.sign, starStats.streak.length, "stars")}`
                      : null,
                  ]
                    .filter(Boolean)
                    .join("  ·  ")}
                </p>
                {correlation != null ? (
                  <span className="inline-flex items-center gap-1">
                    <span>corrélation {formatStat(correlation)} (attendu ≈ 0)</span>
                    <HelpTip
                      title="Corrélation"
                      body="Pearson entre les deux séries affichées (cumuls ou pas). Proche de 0 si numéros et étoiles sont indépendants. Descriptif, pas un signal de jeu."
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
