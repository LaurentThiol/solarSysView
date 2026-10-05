"use client"

import { useEffect, useMemo, useState } from "react"

import { TitleHelp, type HelpCopy } from "@/components/help"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  ANNUAL_MONTHS,
  annualPants,
  THEORETICAL_NUMBER_SUM,
  type AnnualBar,
  type AnnualLane,
  type AnnualRole,
} from "@/lib/annual-sum"
import { newestCalendarYear } from "@/lib/analysis-window"
import { DRAWS, formatDrawDate, type Draw } from "@/lib/draws"
import { filterDrawsByWeekday, WEEKDAY_LINE_COLOR, type WeekdayScope } from "@/lib/weekday-scope"

const TITLE_HELP: HelpCopy = {
  title: "Annuel",
  wide: true,
  body: `Graphique horizontal. Les années n, n−1 et n−2 sont en tête, côte à côte. Chaque barre part vers la droite : c’est la somme des 5 numéros d’un tirage.

Les mois descendent, de janvier à décembre, et ont la même hauteur. Le jour place la barre dans le mois, donc une fin de mois tombe au même endroit sur les trois années — février bissextile compris. Le trait horizontal ferme le mois. Le chiffre à droite de la colonne est la moyenne des sommes de ce mois.

Le trait vertical est la moyenne théorique, 128. L’échelle est commune et resserrée sur les sommes observées : elle ne part pas de 0, pour que l’écart se voie.

Mardi en cyan, vendredi en rose. « en cours » : l’année n n’a pas encore de tirage en décembre. Δ, à droite, compare les moyennes de mois (n moins n−1, puis n−1 moins n−2), pas des totaux. Un mois avec peu de tirages bouge davantage. Le filtre jour du bandeau s’applique ; la fenêtre 20 / 50 / année ne coupe pas ces trois années.

Lecture d’archive. Les tirages restent indépendants.`,
}

const ROLE_LABEL: Record<AnnualRole, string> = {
  n: "n",
  "n-1": "n−1",
  "n-2": "n−2",
}

const DELTA_TITLE = [
  "Moyenne du mois : n moins n−1",
  "Moyenne du mois : n−1 moins n−2",
] as const

const VB_W = 980
const LABEL_W = 46
const DELTA_W = 46
const PAD_R = 8
const HEADER_H = 50
const MONTH_H = 56
const PLOT_H = ANNUAL_MONTHS.length * MONTH_H
const VB_H = HEADER_H + PLOT_H + 8
const COL_GAP = 18
const MEAN_GUTTER = 32
const COLS_W = VB_W - LABEL_W - DELTA_W - PAD_R
const COL_W = (COLS_W - 2 * COL_GAP) / 3

type Tip = {
  bar: AnnualBar
  year: number
}

export function EvolutionAnnual({ weekday }: { weekday: WeekdayScope }) {
  const archive = useAnnualArchive()
  const filtered = useMemo(
    () => filterDrawsByWeekday(archive.draws, weekday),
    [archive.draws, weekday]
  )
  const model = useMemo(
    () =>
      annualPants(
        filtered.map((draw) => ({
          date: draw.date,
          weekday: draw.weekday,
          numbers: draw.numbers,
        })),
        archive.anchor
      ),
    [filtered, archive.anchor]
  )
  const [tip, setTip] = useState<Tip | null>(null)
  const days = useMemo(() => weekdaysPresent(model.lanes), [model.lanes])
  const localGap =
    archive.source === "json" && model.lanes.slice(1).every((lane) => lane.bars.length === 0)
  const summary = model.lanes
    .map((lane) => {
      const mean = lane.mean == null ? "sans tirage" : `moyenne ${formatInt(lane.mean)}`
      return `${ROLE_LABEL[lane.role]} ${lane.year}, ${lane.bars.length} tirages, ${mean}`
    })
    .join(". ")

  return (
    <Card data-annual-pants data-annual-source={archive.source}>
      <CardHeader>
        <CardTitle className="text-sm">
          <TitleHelp help={TITLE_HELP}>Somme des numéros</TitleHelp>
        </CardTitle>
        <p className="max-w-3xl text-xs leading-5 text-muted-foreground">
          Barres horizontales. n, n−1 et n−2 sont en tête. Trait horizontal en fin de mois,
          trait vertical à 128. Le chiffre en bout de colonne est la moyenne du mois.
        </p>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {days.has("mardi") ? (
            <LegendSwatch color={WEEKDAY_LINE_COLOR.mardi} label="Mardi" />
          ) : null}
          {days.has("vendredi") ? (
            <LegendSwatch color={WEEKDAY_LINE_COLOR.vendredi} label="Vendredi" />
          ) : null}
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-3 w-px border-l border-dashed border-muted-foreground" />
            Moyenne 128
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-px w-6 bg-foreground/30" />
            Fin de mois
          </span>
          {archive.loading ? <span>Chargement des trois années…</span> : null}
        </div>

        <div className="overflow-x-auto">
          <svg
            viewBox={`0 0 ${VB_W} ${VB_H}`}
            data-annual-orientation="horizontal"
            className="h-auto w-full min-w-[760px]"
            role="img"
            aria-label={`Somme des 5 numéros, trois années en tête. ${summary}`}
            style={{ fontFamily: "inherit" }}
            onPointerLeave={() => setTip(null)}
          >
            {model.lanes.map((lane, index) => (
              <YearHead key={lane.role} lane={lane} index={index} yMin={model.yMin} yMax={model.yMax} />
            ))}
            <text x={LABEL_W + COLS_W + 4} y={16} fill="var(--muted-foreground)" fontSize="10">
              <title>{DELTA_TITLE[0]}</title>
              Δ n
            </text>
            <text x={LABEL_W + COLS_W + 4} y={30} fill="var(--muted-foreground)" fontSize="10">
              <title>{DELTA_TITLE[1]}</title>
              Δ n−1
            </text>

            {ANNUAL_MONTHS.map((month) =>
              month.month % 2 === 0 ? (
                <rect
                  key={month.month}
                  x={LABEL_W}
                  y={yTime((month.month - 1) / 12)}
                  width={COLS_W}
                  height={MONTH_H}
                  fill="var(--muted)"
                  opacity={0.4}
                />
              ) : null
            )}

            {model.lanes.map((lane, index) => (
              <YearColumn
                key={lane.role}
                lane={lane}
                index={index}
                yMin={model.yMin}
                yMax={model.yMax}
                loading={archive.loading && lane.bars.length === 0}
                active={tip?.year === lane.year ? tip.bar.date : null}
                onHover={(bar) =>
                  setTip((current) =>
                    current?.year === lane.year && current.bar.date === bar.date
                      ? current
                      : { bar, year: lane.year }
                  )
                }
              />
            ))}

            {ANNUAL_MONTHS.map((month) => (
              <g key={month.month}>
                <text
                  x={4}
                  y={yTime((month.month - 0.5) / 12) + 4}
                  fill="var(--muted-foreground)"
                  fontSize="11"
                >
                  {month.label}
                </text>
                <line
                  data-month-end={month.month}
                  x1={LABEL_W}
                  x2={LABEL_W + COLS_W}
                  y1={yTime(month.month / 12)}
                  y2={yTime(month.month / 12)}
                  stroke="var(--foreground)"
                  strokeOpacity={0.28}
                />
              </g>
            ))}

            {model.deltas[0] && model.deltas[1]
              ? ANNUAL_MONTHS.map((month, index) => (
                  <g key={`delta-${month.month}`} data-annual-delta={month.month}>
                    <text
                      x={LABEL_W + COLS_W + 4}
                      y={yTime((month.month - 0.5) / 12) - 1}
                      fill={deltaFill(model.deltas[0][index]?.delta ?? null)}
                      fontSize="10"
                    >
                      <title>
                        {DELTA_TITLE[0]} · {month.label} · {model.deltas[0][index]?.newerCount ?? 0}{" "}
                        tirages contre {model.deltas[0][index]?.olderCount ?? 0}
                      </title>
                      {formatDelta(model.deltas[0][index]?.delta ?? null)}
                    </text>
                    <text
                      x={LABEL_W + COLS_W + 4}
                      y={yTime((month.month - 0.5) / 12) + 12}
                      fill={deltaFill(model.deltas[1][index]?.delta ?? null)}
                      fontSize="10"
                    >
                      <title>
                        {DELTA_TITLE[1]} · {month.label} · {model.deltas[1][index]?.newerCount ?? 0}{" "}
                        tirages contre {model.deltas[1][index]?.olderCount ?? 0}
                      </title>
                      {formatDelta(model.deltas[1][index]?.delta ?? null)}
                    </text>
                  </g>
                ))
              : null}

            {tip ? (
              <line
                x1={LABEL_W}
                x2={LABEL_W + COLS_W}
                y1={yTime(tip.bar.x)}
                y2={yTime(tip.bar.x)}
                stroke="var(--foreground)"
                strokeOpacity={0.35}
                pointerEvents="none"
              />
            ) : null}
          </svg>
        </div>

        <p data-annual-detail aria-live="polite" className="min-h-10 text-sm leading-5 tabular-nums">
          {tip ? <Detail bar={tip.bar} year={tip.year} /> : (
            <span className="text-muted-foreground">
              Survolez une barre pour lire la date, les numéros et l’écart à 128.
            </span>
          )}
        </p>
        <p className="text-xs leading-5 text-muted-foreground">
          Δ n : moyenne du mois de n moins celle de n−1. Δ n−1 : n−1 moins n−2. Positif, la
          moyenne la plus récente est plus haute.{" "}
          {archive.source === "neon" ? "Source Neon." : "Source fichier local."}
          {localGap
            ? " n−1 et n−2 restent vides tant que l’archive distante ne répond pas."
            : ""}
        </p>
      </CardContent>
    </Card>
  )
}

function YearHead({
  lane,
  index,
  yMin,
  yMax,
}: {
  lane: AnnualLane
  index: number
  yMin: number
  yMax: number
}) {
  const left = colLeft(index)
  const ticks =
    index === 0
      ? [yMin, THEORETICAL_NUMBER_SUM, yMax].filter(
          (value, tickIndex, all) => all.indexOf(value) === tickIndex
        )
      : []
  return (
    <g data-annual-head={lane.role}>
      <text
        x={left + COL_W / 2}
        y={16}
        textAnchor="middle"
        fill="var(--foreground)"
        fontSize="13"
        fontWeight={600}
      >
        {ROLE_LABEL[lane.role]} {lane.year}
        {lane.partial ? " · en cours" : ""}
      </text>
      {ticks.map((value) => {
        const atMin = value === yMin
        const atMax = value === yMax
        return (
          <text
            key={value}
            x={atMin ? left + 4 : atMax ? left + COL_W - MEAN_GUTTER : sumX(index, value, yMin, yMax)}
            y={36}
            textAnchor={atMin ? "start" : atMax ? "end" : "middle"}
            fill="var(--muted-foreground)"
            fontSize="10"
          >
            {formatInt(value)}
          </text>
        )
      })}
    </g>
  )
}

function YearColumn({
  lane,
  index,
  yMin,
  yMax,
  loading,
  active,
  onHover,
}: {
  lane: AnnualLane
  index: number
  yMin: number
  yMax: number
  loading: boolean
  active: string | null
  onHover: (bar: AnnualBar) => void
}) {
  const left = colLeft(index)
  const origin = left + 4
  const thick = Math.max(3.2, (MONTH_H / 31) * 0.85)
  const meanX = sumX(index, THEORETICAL_NUMBER_SUM, yMin, yMax)

  return (
    <g
      data-annual-year={lane.year}
      data-annual-role={lane.role}
      data-annual-partial={lane.partial ? "true" : "false"}
    >
      <line
        x1={meanX}
        x2={meanX}
        y1={HEADER_H}
        y2={HEADER_H + PLOT_H}
        stroke="var(--muted-foreground)"
        strokeDasharray="4 3"
        strokeOpacity={0.8}
      />
      {lane.bars.map((bar) => {
        const y = yTime(bar.x)
        const end = sumX(index, bar.sum, yMin, yMax)
        const highlighted = active === bar.date
        return (
          <rect
            key={bar.date}
            x={origin}
            y={y - thick / 2}
            width={Math.max(1, end - origin)}
            height={thick}
            rx={0.6}
            fill={barFill(bar.weekday)}
            stroke={highlighted ? "var(--foreground)" : "none"}
            strokeWidth={highlighted ? 1 : 0}
            data-annual-bar={bar.date}
          >
            <title>
              {formatDrawDate(bar.date)} · somme {formatInt(bar.sum)}
            </title>
          </rect>
        )
      })}
      {lane.months.map((month) => (
        <text
          key={month.month}
          x={left + COL_W - 6}
          y={yTime(month.month / 12) - 5}
          textAnchor="end"
          fill="var(--muted-foreground)"
          fontSize="10"
        >
          {month.mean == null ? "—" : formatInt(month.mean)}
        </text>
      ))}
      <rect
        x={left}
        y={HEADER_H}
        width={COL_W}
        height={PLOT_H}
        fill="transparent"
        style={{ cursor: "crosshair" }}
        onPointerMove={(event) => {
          const bar = nearestBar(event, lane)
          if (bar) onHover(bar)
        }}
      />
      {lane.bars.length === 0 ? (
        <text
          x={left + COL_W / 2}
          y={HEADER_H + PLOT_H / 2}
          textAnchor="middle"
          fill="var(--muted-foreground)"
          fontSize="12"
        >
          {loading ? "chargement…" : "aucun tirage"}
        </text>
      ) : null}
    </g>
  )
}

function Detail({ bar, year }: { bar: AnnualBar; year: number }) {
  const numbers = [...bar.numbers].sort((a, b) => a - b).join(" ")
  return (
    <>
      <span className="text-foreground">{formatDrawDate(bar.date)}</span>
      <span className="text-muted-foreground"> · {year} · </span>
      <span className="text-foreground">{numbers}</span>
      <span className="text-muted-foreground"> · somme </span>
      <span className="text-foreground">{formatInt(bar.sum)}</span>
      <span className="text-muted-foreground"> · écart {signedGap(bar.sum)} à 128</span>
    </>
  )
}

function LegendSwatch({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="inline-block h-3 w-1.5 rounded-[1px]" style={{ background: color }} />
      {label}
    </span>
  )
}

function useAnnualArchive() {
  const anchorSeed = newestCalendarYear(DRAWS) ?? new Date().getUTCFullYear()
  const [draws, setDraws] = useState<Draw[]>(() => DRAWS)
  const [anchor, setAnchor] = useState(anchorSeed)
  const [source, setSource] = useState<"json" | "neon">("json")
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const head = await fetchDrawYear(null)
        if (cancelled) return
        const year = head.year ?? anchorSeed
        const [prev, older] = await Promise.all([
          fetchDrawYear(year - 1),
          fetchDrawYear(year - 2),
        ])
        if (cancelled) return
        const items = [...head.items, ...prev.items, ...older.items]
        if (items.length === 0) {
          setDraws(DRAWS)
          setAnchor(anchorSeed)
          setSource("json")
          return
        }
        setDraws(items)
        setAnchor(year)
        setSource("neon")
      } catch {
        if (!cancelled) {
          setDraws(DRAWS)
          setAnchor(anchorSeed)
          setSource("json")
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [anchorSeed])

  return { draws, anchor, source, loading }
}

async function fetchDrawYear(year: number | null): Promise<{ year: number | null; items: Draw[] }> {
  const params = new URLSearchParams()
  if (year != null) params.set("year", String(year))
  const query = params.toString()
  const response = await fetch(`/api/draws${query ? `?${query}` : ""}`, {
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  })
  if (!response.ok) return { year, items: [] }
  const payload = (await response.json()) as {
    ok?: boolean
    items?: Draw[]
    year?: number | null
  }
  const items = payload.ok && payload.items?.length ? payload.items : []
  return {
    year: typeof payload.year === "number" ? payload.year : year,
    items,
  }
}

function colLeft(index: number) {
  return LABEL_W + index * (COL_W + COL_GAP)
}

function yTime(unit: number) {
  return HEADER_H + unit * PLOT_H
}

function sumX(index: number, sum: number, yMin: number, yMax: number) {
  const span = yMax - yMin || 1
  const t = Math.min(1, Math.max(0, (sum - yMin) / span))
  return colLeft(index) + 4 + t * (COL_W - 8 - MEAN_GUTTER)
}

function nearestBar(event: React.PointerEvent<SVGRectElement>, lane: AnnualLane): AnnualBar | null {
  const svg = event.currentTarget.ownerSVGElement
  const matrix = svg?.getScreenCTM()
  if (!svg || !matrix || lane.bars.length === 0) return null
  const point = svg.createSVGPoint()
  point.x = event.clientX
  point.y = event.clientY
  const local = point.matrixTransform(matrix.inverse())
  const unit = (local.y - HEADER_H) / PLOT_H
  let best: AnnualBar | null = null
  let bestDist = 0.02
  for (const bar of lane.bars) {
    const dist = Math.abs(bar.x - unit)
    if (dist < bestDist) {
      best = bar
      bestDist = dist
    }
  }
  return best
}

function barFill(weekday: string) {
  if (weekday === "mardi") return WEEKDAY_LINE_COLOR.mardi
  if (weekday === "vendredi") return WEEKDAY_LINE_COLOR.vendredi
  return "var(--chart-1)"
}

function weekdaysPresent(lanes: AnnualLane[]) {
  const days = new Set<string>()
  for (const lane of lanes) {
    for (const bar of lane.bars) {
      if (bar.weekday === "mardi" || bar.weekday === "vendredi") days.add(bar.weekday)
    }
  }
  return days
}

function formatInt(value: number) {
  return Math.round(value).toLocaleString("fr-FR")
}

function formatDelta(value: number | null) {
  if (value == null) return "—"
  const rounded = Math.round(value)
  if (rounded > 0) return `+${rounded.toLocaleString("fr-FR")}`
  if (rounded < 0) return `−${Math.abs(rounded).toLocaleString("fr-FR")}`
  return "0"
}

function deltaFill(value: number | null) {
  if (value == null || Math.round(value) === 0) return "var(--muted-foreground)"
  return value > 0 ? "var(--chart-4)" : "var(--chart-2)"
}

function signedGap(sum: number) {
  const gap = Math.round(sum - THEORETICAL_NUMBER_SUM)
  if (gap > 0) return `+${gap.toLocaleString("fr-FR")}`
  if (gap < 0) return `−${Math.abs(gap).toLocaleString("fr-FR")}`
  return "0"
}
