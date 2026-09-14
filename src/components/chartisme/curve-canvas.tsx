"use client"

import { useMemo, useRef, useState } from "react"

import type { FigureHit, Guide } from "@/lib/chartisme"
import { PIVOT_ROLE_LABELS } from "@/lib/chartisme"
import { cn } from "@/lib/utils"

// Recharts est écarté ici : il n'expose pas les coordonnées pixel, donc
// impossible d'y poser une ligne de cou au bon endroit. Même procédé qu'à
// l'onglet Analyse : une échelle explicite, et tout se dessine dessus.
const HEIGHT = 300
const ACTIVITY_HEIGHT = 56
const PAD = 20
const LABEL_GAP = 14

export type CurveSelection = { fromIndex: number; toIndex: number }

const GUIDE_STYLE: Record<string, { color: string; width: number }> = {
  neckline: { color: "var(--chart-5)", width: 1.8 },
  support: { color: "var(--chart-5)", width: 1.6 },
  resistance: { color: "var(--chart-5)", width: 1.6 },
  upper: { color: "var(--chart-1)", width: 1.4 },
  lower: { color: "var(--chart-2)", width: 1.4 },
  pole: { color: "var(--chart-4)", width: 2.2 },
  height: { color: "var(--muted-foreground)", width: 1.2 },
}

function styleOf(role: string) {
  return GUIDE_STYLE[role] ?? { color: "var(--muted-foreground)", width: 1.3 }
}

export function CurveCanvas({
  values,
  dates,
  activity = [],
  hit = null,
  hits = [],
  selection = null,
  onSelect,
  showActivity = true,
  contextCount = 0,
  label,
}: {
  values: number[]
  dates?: string[]
  activity?: number[]
  hit?: FigureHit | null
  /** Toutes les lectures listées : une marque en tête du tracé, la sélection en plein. */
  hits?: Array<FigureHit & { rare?: boolean }>
  selection?: CurveSelection | null
  onSelect?: (selection: CurveSelection) => void
  showActivity?: boolean
  /** Tirages de tête calculés mais hors fenêtre d'étude — tracés en retrait. */
  contextCount?: number
  label?: string
}) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [drag, setDrag] = useState<CurveSelection | null>(null)

  const width = Math.max(480, Math.min(1280, values.length * 8))
  const chartH = showActivity && activity.length ? HEIGHT - ACTIVITY_HEIGHT : HEIGHT
  const innerH = chartH - PAD * 2

  const scale = useMemo(() => {
    const guideValues = (hit?.guides ?? []).flatMap((guide) =>
      guide.points.map((point) => point.value)
    )
    const targetValue = hit?.target ? [hit.target.value] : []
    const pool = [...values, ...guideValues, ...targetValue].filter((v) =>
      Number.isFinite(v)
    )
    const max = Math.max(...pool)
    const min = Math.min(...pool)
    return { max, min, span: max - min || 1 }
  }, [values, hit])

  function y(value: number) {
    return PAD + ((scale.max - value) / scale.span) * innerH
  }

  function x(index: number) {
    if (values.length < 2) return PAD
    return PAD + ((width - PAD * 2) * index) / (values.length - 1)
  }

  const activityScale = useMemo(() => {
    const max = activity.length ? Math.max(...activity) : 0
    return max > 0 ? max : 1
  }, [activity])

  function activityY(value: number) {
    const top = chartH + 6
    const usable = ACTIVITY_HEIGHT - 14
    return top + usable - (value / activityScale) * usable
  }

  // Moyenne mobile 20 de l'activité : c'est la règle d'or rendue visible.
  const mm20 = useMemo(() => {
    if (!activity.length) return []
    return activity.map((_, index) => {
      const from = Math.max(0, index - 19)
      const chunk = activity.slice(from, index + 1)
      return chunk.reduce((a, b) => a + b, 0) / chunk.length
    })
  }, [activity])

  function indexAt(clientX: number) {
    const svg = svgRef.current
    if (!svg) return 0
    const box = svg.getBoundingClientRect()
    const ratio = (clientX - box.left) / box.width
    const raw = Math.round(((ratio * width - PAD) / (width - PAD * 2)) * (values.length - 1))
    return Math.max(0, Math.min(values.length - 1, raw))
  }

  const active = drag ?? selection

  const curvePoints = values.map((value, index) => `${x(index)},${y(value)}`).join(" ")

  return (
    <div className="overflow-x-auto">
      <svg
        ref={svgRef}
        data-capture-visual=""
        viewBox={`0 0 ${width} ${HEIGHT}`}
        width={width}
        height={HEIGHT}
        role="img"
        aria-label={label ? `Courbe ${label}` : "Courbe annotée"}
        className={cn("max-w-none touch-none", onSelect && "cursor-crosshair")}
        onPointerDown={(event) => {
          if (!onSelect) return
          const index = indexAt(event.clientX)
          setDrag({ fromIndex: index, toIndex: index })
        }}
        onPointerMove={(event) => {
          if (!drag || !onSelect) return
          setDrag({ ...drag, toIndex: indexAt(event.clientX) })
        }}
        onPointerUp={() => {
          if (!drag || !onSelect) return
          const from = Math.min(drag.fromIndex, drag.toIndex)
          const to = Math.max(drag.fromIndex, drag.toIndex)
          setDrag(null)
          if (to - from >= 7) onSelect({ fromIndex: from, toIndex: to })
        }}
        onPointerLeave={() => setDrag(null)}
      >
        {contextCount > 0 && contextCount < values.length ? (
          <g>
            <rect
              x={PAD}
              y={PAD / 2}
              width={Math.max(0, x(contextCount) - PAD)}
              height={chartH - PAD}
              fill="var(--muted-foreground)"
              opacity={0.08}
            />
            <line
              x1={x(contextCount)}
              x2={x(contextCount)}
              y1={PAD / 2}
              y2={chartH - PAD / 2}
              stroke="var(--muted-foreground)"
              strokeWidth={1.2}
              strokeDasharray="3 3"
            />
            <text
              x={x(contextCount) - 4}
              y={PAD}
              textAnchor="end"
              className="fill-muted-foreground text-[9px]"
            >
              contexte
            </text>
          </g>
        ) : null}

        {hits.map((found, index) => {
          const selected =
            hit != null &&
            found.figure === hit.figure &&
            found.from_index === hit.from_index &&
            found.to_index === hit.to_index
          const widthPx = Math.max(2, x(found.to_index) - x(found.from_index))
          return (
            <rect
              key={`span-${found.figure}-${found.from_index}-${index}`}
              x={x(found.from_index)}
              y={4}
              width={widthPx}
              height={selected ? 8 : 5}
              fill={found.rare === false ? "var(--muted-foreground)" : "var(--chart-4)"}
              opacity={selected ? 0.9 : 0.35}
            />
          )
        })}

        {active && active.toIndex !== active.fromIndex ? (
          <rect
            x={x(Math.min(active.fromIndex, active.toIndex))}
            y={PAD / 2}
            width={Math.abs(x(active.toIndex) - x(active.fromIndex))}
            height={chartH - PAD}
            fill="var(--chart-1)"
            opacity={0.12}
          />
        ) : null}

        {hit ? (
          <rect
            x={x(hit.from_index)}
            y={PAD / 2}
            width={Math.max(2, x(hit.to_index) - x(hit.from_index))}
            height={chartH - PAD}
            fill="var(--chart-4)"
            opacity={0.07}
          />
        ) : null}

        <polyline
          points={curvePoints}
          fill="none"
          stroke="var(--foreground)"
          strokeWidth={1.6}
          strokeLinejoin="round"
        />

        {(hit?.guides ?? []).map((guide, index) => (
          <GuideLine key={`${guide.role}-${index}`} guide={guide} x={x} y={y} />
        ))}

        {hit?.target ? (
          <g>
            <line
              x1={x(hit.breakout?.index ?? hit.to_index)}
              x2={width - PAD}
              y1={y(hit.target.value)}
              y2={y(hit.target.value)}
              stroke="var(--chart-3)"
              strokeWidth={1.4}
              strokeDasharray="2 4"
            />
            <text
              x={width - PAD}
              y={y(hit.target.value) - 5}
              textAnchor="end"
              className="fill-[var(--chart-3)] text-[10px]"
            >
              objectif {hit.target.value.toFixed(1)}
            </text>
          </g>
        ) : null}

        {hit?.breakout ? (
          <g>
            <circle
              cx={x(hit.breakout.index)}
              cy={y(hit.breakout.value)}
              r={4.5}
              fill={hit.breakout.confirmed ? "var(--chart-3)" : "var(--chart-5)"}
            />
            <line
              x1={x(hit.breakout.index)}
              x2={x(hit.breakout.index)}
              y1={y(hit.breakout.level)}
              y2={y(hit.breakout.value)}
              stroke={hit.breakout.confirmed ? "var(--chart-3)" : "var(--chart-5)"}
              strokeWidth={1.6}
            />
            <text
              x={x(hit.breakout.index) + 6}
              y={y(hit.breakout.value) + (hit.breakout.direction === "down" ? 12 : -6)}
              className={cn(
                "text-[10px]",
                hit.breakout.confirmed
                  ? "fill-[var(--chart-3)]"
                  : "fill-[var(--chart-5)]"
              )}
            >
              {hit.breakout.confirmed ? "cassure confirmée" : "fake breakout"}
            </text>
          </g>
        ) : null}

        {(hit?.pivots ?? []).map((pivot, index) => (
          <g key={`${pivot.role}-${pivot.index}-${index}`}>
            <circle
              cx={x(pivot.index)}
              cy={y(pivot.value)}
              r={3.4}
              fill="var(--chart-1)"
              stroke="var(--background)"
              strokeWidth={1}
            />
            <text
              x={x(pivot.index)}
              y={y(pivot.value) - LABEL_GAP + (index % 2 === 0 ? 0 : -9)}
              textAnchor="middle"
              className="fill-muted-foreground text-[9px]"
            >
              {PIVOT_ROLE_LABELS[pivot.role] ?? pivot.role}
            </text>
          </g>
        ))}

        {showActivity && activity.length ? (
          <g>
            <line
              x1={PAD}
              x2={width - PAD}
              y1={chartH + 4}
              y2={chartH + 4}
              stroke="var(--border)"
              strokeWidth={1}
            />
            {activity.map((value, index) => (
              <line
                key={`act-${index}`}
                x1={x(index)}
                x2={x(index)}
                y1={activityY(0)}
                y2={activityY(value)}
                stroke="var(--muted-foreground)"
                strokeWidth={Math.max(1, (width - PAD * 2) / activity.length / 2)}
                opacity={0.45}
              />
            ))}
            <polyline
              points={mm20.map((value, index) => `${x(index)},${activityY(value)}`).join(" ")}
              fill="none"
              stroke="var(--chart-4)"
              strokeWidth={1.3}
            />
            <text
              x={PAD}
              y={chartH + 16}
              className="fill-muted-foreground text-[9px]"
            >
              activité · MM20
            </text>
          </g>
        ) : null}

        {dates?.length ? (
          <>
            <text x={PAD} y={HEIGHT - 4} className="fill-muted-foreground text-[9px]">
              {dates[0]}
            </text>
            <text
              x={width - PAD}
              y={HEIGHT - 4}
              textAnchor="end"
              className="fill-muted-foreground text-[9px]"
            >
              {dates[dates.length - 1]}
            </text>
          </>
        ) : null}
      </svg>
    </div>
  )
}

function GuideLine({
  guide,
  x,
  y,
}: {
  guide: Guide
  x: (index: number) => number
  y: (value: number) => number
}) {
  if (guide.points.length < 2) return null
  const style = styleOf(guide.role)
  return (
    <g>
      <polyline
        points={guide.points.map((point) => `${x(point.index)},${y(point.value)}`).join(" ")}
        fill="none"
        stroke={style.color}
        strokeWidth={style.width}
        strokeDasharray={guide.dashed ? "5 4" : undefined}
      />
      {guide.role === "neckline" ? (
        <text
          x={x(guide.points[0].index) + 4}
          y={y(guide.points[0].value) - 5}
          className="fill-[var(--chart-5)] text-[9px]"
        >
          ligne de cou
        </text>
      ) : null}
    </g>
  )
}
