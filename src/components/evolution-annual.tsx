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
  type MonthDelta,
} from "@/lib/annual-sum"
import { newestCalendarYear } from "@/lib/analysis-window"
import { DRAWS, formatDrawDate, type Draw } from "@/lib/draws"
import { filterDrawsByWeekday, WEEKDAY_LINE_COLOR, type WeekdayScope } from "@/lib/weekday-scope"

const TITLE_HELP: HelpCopy = {
  title: "Annuel",
  wide: true,
  body: `Trois lignes de barres verticales, années n, n−1 et n−2, l’une sous l’autre. Chaque barre est la somme des 5 numéros d’un tirage.

Les mois ont la même largeur. Le jour place la barre dans le mois, donc une fin de mois tombe au même endroit sur les trois années — février bissextile compris. Le trait vertical ferme le mois. Le chiffre dessous est la moyenne des sommes de ce mois.

Le trait horizontal est la moyenne théorique, 128. L’échelle est commune et resserrée sur les sommes observées : elle ne part pas de 0, pour que l’écart se voie.

Mardi en cyan, vendredi en rose. « en cours » : l’année n n’a pas encore de tirage en décembre. Δ compare les moyennes de mois (n moins n−1, puis n−1 moins n−2), pas des totaux. Un mois avec peu de tirages bouge davantage. Le filtre jour du bandeau s’applique ; la fenêtre 20 / 50 / année ne coupe pas ces trois années.

Lecture d’archive. Les tirages restent indépendants.`,
}

const ROLE_LABEL: Record<AnnualRole, string> = {
  n: "n",
  "n-1": "n−1",
  "n-2": "n−2",
}

const DELTA_LABEL = ["Δ n", "Δ n−1"] as const
const DELTA_TITLE = [
  "Moyenne du mois : n moins n−1",
  "Moyenne du mois : n−1 moins n−2",
] as const

const VB_W = 980
const PAD_L = 72
const PAD_R = 14
const PAD_T = 22
const LANE_H = 112
const MEAN_H = 16
const LANE_GAP = 12
const DELTA_H = 18
const PAD_B = 6
const LANE_BLOCK = LANE_H + MEAN_H + LANE_GAP
const PLOT_W = VB_W - PAD_L - PAD_R
const VB_H = PAD_T + 3 * LANE_BLOCK + 6 + 2 * DELTA_H + PAD_B

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
          Barres verticales étroites, trois années en parallèle. Trait vertical en fin de mois,
          trait horizontal à 128. Le chiffre sous le trait est la moyenne du mois.
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
            <span className="inline-block h-px w-6 border-t border-dashed border-muted-foreground" />
            Moyenne 128
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-3 w-px bg-border" />
            Fin de mois
          </span>
          {archive.loading ? <span>Chargement des trois années…</span> : null}
        </div>

        <div className="overflow-x-auto">
          <svg
            viewBox={`0 0 ${VB_W} ${VB_H}`}
            className="h-auto w-full min-w-[720px]"
            role="img"
            aria-label={`Somme des 5 numéros, trois années. ${summary}`}
            style={{ fontFamily: "inherit" }}
            onPointerLeave={() => setTip(null)}
          >
            {ANNUAL_MONTHS.map((month) => (
              <text
                key={month.month}
                x={xOf((month.month - 0.5) / 12)}
                y={14}
                textAnchor="middle"
                fill="var(--muted-foreground)"
                fontSize="11"
              >
                {month.label}
              </text>
            ))}

            {model.lanes.map((lane, index) => (
              <Lane
                key={lane.role}
                lane={lane}
                top={PAD_T + index * LANE_BLOCK}
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

            {tip ? (
              <line
                x1={xOf(tip.bar.x)}
                x2={xOf(tip.bar.x)}
                y1={PAD_T}
                y2={PAD_T + 3 * LANE_BLOCK - LANE_GAP}
                stroke="var(--foreground)"
                strokeOpacity={0.35}
                pointerEvents="none"
              />
            ) : null}

            {model.deltas.map((row, index) => (
              <DeltaRow
                key={DELTA_LABEL[index]}
                row={row}
                label={DELTA_LABEL[index]}
                title={DELTA_TITLE[index]}
                top={PAD_T + 3 * LANE_BLOCK + 4 + index * DELTA_H}
              />
            ))}
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

function Lane({
  lane,
  top,
  yMin,
  yMax,
  loading,
  active,
  onHover,
}: {
  lane: AnnualLane
  top: number
  yMin: number
  yMax: number
  loading: boolean
  active: string | null
  onHover: (bar: AnnualBar) => void
}) {
  const dayW = PLOT_W / 12 / 31
  const barW = Math.max(3.5, dayW * 0.9)
  const baseline = yOf(top, yMin, yMin, yMax)

  return (
    <g
      data-annual-year={lane.year}
      data-annual-role={lane.role}
      data-annual-partial={lane.partial ? "true" : "false"}
    >
      {ANNUAL_MONTHS.map((month) =>
        month.month % 2 === 0 ? (
          <rect
            key={month.month}
            x={xOf((month.month - 1) / 12)}
            y={top}
            width={PLOT_W / 12}
            height={LANE_H}
            fill="var(--muted)"
            opacity={0.45}
          />
        ) : null
      )}
      <line
        x1={PAD_L}
        x2={VB_W - PAD_R}
        y1={yOf(top, THEORETICAL_NUMBER_SUM, yMin, yMax)}
        y2={yOf(top, THEORETICAL_NUMBER_SUM, yMin, yMax)}
        stroke="var(--muted-foreground)"
        strokeDasharray="4 3"
        strokeOpacity={0.8}
      />
      {[yMin, THEORETICAL_NUMBER_SUM, yMax]
        .filter((value, index, all) => all.indexOf(value) === index)
        .map((value) => (
          <text
            key={value}
            x={PAD_L - 8}
            y={yOf(top, value, yMin, yMax) + 3}
            textAnchor="end"
            fill="var(--muted-foreground)"
            fontSize="10"
          >
            {formatInt(value)}
          </text>
        ))}
      <text x={8} y={top + 16} fill="var(--foreground)" fontSize="13" fontWeight={600}>
        {ROLE_LABEL[lane.role]}
      </text>
      <text x={8} y={top + 32} fill="var(--muted-foreground)" fontSize="11">
        {lane.year}
      </text>
      {lane.partial ? (
        <text x={8} y={top + 46} fill="var(--muted-foreground)" fontSize="10">
          en cours
        </text>
      ) : null}

      {lane.bars.map((bar) => {
        const y = yOf(top, bar.sum, yMin, yMax)
        const height = Math.max(1, baseline - y)
        const highlighted = active === bar.date
        return (
          <rect
            key={bar.date}
            x={xOf(bar.x) - barW / 2}
            y={y}
            width={barW}
            height={height}
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
        <g key={month.month}>
          <line
            data-month-end={month.month}
            x1={xOf(month.x)}
            x2={xOf(month.x)}
            y1={top}
            y2={top + LANE_H}
            stroke="var(--foreground)"
            strokeOpacity={0.28}
          />
          <text
            x={xOf((month.month - 0.5) / 12)}
            y={top + LANE_H + 12}
            textAnchor="middle"
            fill="var(--muted-foreground)"
            fontSize="10"
          >
            {month.mean == null ? "—" : formatInt(month.mean)}
          </text>
        </g>
      ))}

      <rect
        x={PAD_L}
        y={top}
        width={PLOT_W}
        height={LANE_H}
        fill="transparent"
        style={{ cursor: "crosshair" }}
        onPointerMove={(event) => {
          const bar = nearestBar(event, lane)
          if (bar) onHover(bar)
        }}
      />

      {lane.bars.length === 0 ? (
        <text
          x={PAD_L + PLOT_W / 2}
          y={top + LANE_H / 2}
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

function DeltaRow({
  row,
  label,
  title,
  top,
}: {
  row: MonthDelta[]
  label: string
  title: string
  top: number
}) {
  return (
    <g data-annual-delta={label}>
      <text x={8} y={top + 12} fill="var(--muted-foreground)" fontSize="11">
        <title>{title}</title>
        {label}
      </text>
      {row.map((cell) => (
        <text
          key={cell.month}
          x={xOf((cell.month - 0.5) / 12)}
          y={top + 12}
          textAnchor="middle"
          fill={deltaFill(cell.delta)}
          fontSize="11"
        >
          <title>
            {cell.label} · {cell.newerCount} tirages contre {cell.olderCount}
          </title>
          {formatDelta(cell.delta)}
        </text>
      ))}
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

function xOf(unit: number) {
  return PAD_L + unit * PLOT_W
}

function yOf(top: number, value: number, yMin: number, yMax: number) {
  const span = yMax - yMin || 1
  const inner = LANE_H - 8
  const t = (value - yMin) / span
  return top + 4 + (1 - t) * inner
}

function nearestBar(event: React.PointerEvent<SVGRectElement>, lane: AnnualLane): AnnualBar | null {
  const svg = event.currentTarget.ownerSVGElement
  const matrix = svg?.getScreenCTM()
  if (!svg || !matrix || lane.bars.length === 0) return null
  const point = svg.createSVGPoint()
  point.x = event.clientX
  point.y = event.clientY
  const local = point.matrixTransform(matrix.inverse())
  const unit = (local.x - PAD_L) / PLOT_W
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
