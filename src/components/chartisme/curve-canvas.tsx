"use client"

import { useMemo, useRef, useState } from "react"

import type { FigureHit, Guide } from "@/lib/chartisme"
import {
  PIVOT_ROLE_LABELS,
  coveringHitIndices,
  cycleHitIndex,
  hoverHitIndex,
} from "@/lib/chartisme"
import { contextBandLabel, startsInContext } from "@/lib/chartisme/window"
import { cn } from "@/lib/utils"

// Recharts est écarté ici : il n'expose pas les coordonnées pixel, donc
// impossible d'y poser une ligne de cou au bon endroit. Même procédé qu'à
// l'onglet Analyse : une échelle explicite, et tout se dessine dessus.
const HEIGHT = 300
const ACTIVITY_HEIGHT = 56
const PAD = 20
const LABEL_GAP = 14
/** Zone cliquable du bandeau de lectures, dans le padding du tracé. */
const BANNER_HIT = 16
const BANNER_Y = 3
const BANNER_H = 6
const BANNER_H_ACTIVE = 9

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

/** Points d'une polyline entre deux indices, bornes comprises. */
function polylinePoints(
  series: number[],
  from: number,
  to: number,
  xOf: (index: number) => number,
  yOf: (value: number) => number
) {
  const pts: string[] = []
  const last = Math.min(to, series.length - 1)
  for (let index = Math.max(0, from); index <= last; index += 1) {
    const value = series[index]
    if (value === undefined) continue
    pts.push(`${xOf(index)},${yOf(value)}`)
  }
  return pts.join(" ")
}

export function CurveCanvas({
  values,
  dates,
  activity = [],
  hit = null,
  hits = [],
  selection = null,
  onSelect,
  onHitSelect,
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
  /** Clic sur une marque du bandeau : la lecture correspondante, ou la suivante si plusieurs se superposent. */
  onHitSelect?: (index: number) => void
  showActivity?: boolean
  /** Tirages de tête calculés mais hors fenêtre d'étude — tracés en retrait. */
  contextCount?: number
  label?: string
}) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [drag, setDrag] = useState<CurveSelection | null>(null)
  const [hover, setHover] = useState<number | null>(null)

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

  function posAt(clientX: number, clientY?: number) {
    const svg = svgRef.current
    const box = svg?.getBoundingClientRect()
    const ratioX = box ? (clientX - box.left) / box.width : 0
    const ratioY = box && clientY != null ? (clientY - box.top) / box.height : 0
    const raw = Math.round(
      ((ratioX * width - PAD) / (width - PAD * 2)) * (values.length - 1)
    )
    return {
      index: Math.max(0, Math.min(values.length - 1, raw)),
      y: ratioY * HEIGHT,
    }
  }

  function indexAt(clientX: number) {
    return posAt(clientX).index
  }

  const selectedIndex = hit
    ? hits.findIndex(
        (found) =>
          found.figure === hit.figure &&
          found.from_index === hit.from_index &&
          found.to_index === hit.to_index
      )
    : -1

  const paintOrder = hits.map((_, index) => index).sort((a, b) => {
    const aOn = a === selectedIndex || a === hover ? 1 : 0
    const bOn = b === selectedIndex || b === hover ? 1 : 0
    if (aOn !== bOn) return aOn - bOn
    return b - a
  })

  const hoverFound = hover != null ? (hits[hover] ?? null) : null

  const active = drag ?? selection

  const splitAt =
    contextCount > 0 && contextCount < values.length ? contextCount : null
  const bandBottom =
    showActivity && activity.length ? HEIGHT - 10 : chartH - PAD / 2
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
        aria-label={
          label
            ? `Courbe ${label}${
                onHitSelect
                  ? " — clic sur le bandeau au-dessus du tracé pour choisir une lecture"
                  : ""
              }`
            : "Courbe annotée"
        }
        className={cn(
          "max-w-none touch-none",
          hover != null ? "cursor-pointer" : onSelect && "cursor-crosshair"
        )}
        onPointerDown={(event) => {
          if (onHitSelect && hits.length && posAt(event.clientX, event.clientY).y <= BANNER_HIT) {
            const next = cycleHitIndex(
              coveringHitIndices(hits, indexAt(event.clientX)),
              selectedIndex
            )
            if (next != null) {
              onHitSelect(next)
              return
            }
          }
          if (!onSelect) return
          const index = indexAt(event.clientX)
          setDrag({ fromIndex: index, toIndex: index })
        }}
        onPointerMove={(event) => {
          if (drag && onSelect) {
            setDrag({ ...drag, toIndex: indexAt(event.clientX) })
            return
          }
          if (!hits.length) return
          const { index, y } = posAt(event.clientX, event.clientY)
          if (y > BANNER_HIT) {
            setHover(null)
            return
          }
          setHover(hoverHitIndex(coveringHitIndices(hits, index), selectedIndex))
        }}
        onPointerUp={() => {
          if (!drag || !onSelect) return
          const from = Math.min(drag.fromIndex, drag.toIndex)
          const to = Math.max(drag.fromIndex, drag.toIndex)
          setDrag(null)
          if (to - from >= 7) onSelect({ fromIndex: from, toIndex: to })
        }}
        onPointerLeave={() => {
          setDrag(null)
          setHover(null)
        }}
      >
        {splitAt != null ? (
          <g style={{ pointerEvents: "none" }}>
            <rect
              x={PAD}
              y={BANNER_HIT}
              width={Math.max(0, x(splitAt) - PAD)}
              height={Math.max(0, bandBottom - BANNER_HIT)}
              fill="var(--muted-foreground)"
              opacity={0.08}
            />
            <line
              x1={x(splitAt)}
              x2={x(splitAt)}
              y1={BANNER_HIT}
              y2={bandBottom}
              stroke="var(--muted-foreground)"
              strokeWidth={1.2}
              strokeDasharray="3 3"
            />
            <text
              x={PAD + 2}
              y={PAD + 10}
              className="fill-muted-foreground text-[9px]"
            >
              {contextBandLabel(contextCount)}
            </text>
            <text
              x={x(splitAt) + 6}
              y={PAD + 10}
              className="fill-muted-foreground text-[9px]"
            >
              étude
            </text>
          </g>
        ) : null}

        {paintOrder.map((index) => {
          const found = hits[index]
          if (!found) return null
          const selected = index === selectedIndex
          const hovered = index === hover
          const widthPx = Math.max(2, x(found.to_index) - x(found.from_index))
          const hitWidth = Math.max(12, widthPx)
          const hitX = x(found.from_index) - (hitWidth - widthPx) / 2
          return (
            <g
              key={`span-${found.figure}-${found.from_index}-${index}`}
              data-banner-hit={index}
              className={onHitSelect ? "cursor-pointer" : undefined}
              onPointerDown={(event) => {
                if (!onHitSelect) return
                event.stopPropagation()
                const next = cycleHitIndex(
                  coveringHitIndices(hits, indexAt(event.clientX)),
                  selectedIndex
                )
                onHitSelect(next ?? index)
              }}
              onPointerEnter={() => setHover(index)}
              onPointerLeave={() =>
                setHover((current) => (current === index ? null : current))
              }
            >
              <title>
                {found.label} · {found.confidence.toFixed(2)}
                {found.rare === false ? " · bruit" : ""}
                {startsInContext(found, contextCount)
                  ? " · commence dans le contexte"
                  : ""}
                {onHitSelect ? " — clic pour sélectionner" : ""}
              </title>
              <rect
                x={hitX}
                y={0}
                width={hitWidth}
                height={BANNER_HIT}
                fill="transparent"
              />
              <rect
                x={x(found.from_index)}
                y={BANNER_Y}
                width={widthPx}
                height={selected || hovered ? BANNER_H_ACTIVE : BANNER_H}
                fill={found.rare === false ? "var(--muted-foreground)" : "var(--chart-4)"}
                opacity={selected ? 0.95 : hovered ? 0.75 : 0.4}
              />
            </g>
          )
        })}

        {hoverFound ? (
          <text
            x={Math.min(
              width - PAD,
              Math.max(PAD, (x(hoverFound.from_index) + x(hoverFound.to_index)) / 2)
            )}
            y={BANNER_HIT + 1}
            textAnchor="middle"
            className="fill-foreground text-[9px]"
            style={{ pointerEvents: "none" }}
          >
            {hoverFound.label}
            {hoverFound.rare === false ? " · bruit" : ""}
            {startsInContext(hoverFound, contextCount) ? " · à cheval" : ""}
          </text>
        ) : null}

        {active && active.toIndex !== active.fromIndex ? (
          <rect
            x={x(Math.min(active.fromIndex, active.toIndex))}
            y={BANNER_HIT}
            width={Math.abs(x(active.toIndex) - x(active.fromIndex))}
            height={chartH - PAD / 2 - BANNER_HIT}
            fill="var(--chart-1)"
            opacity={0.12}
            style={{ pointerEvents: "none" }}
          />
        ) : null}

        {hit ? (
          <rect
            x={x(hit.from_index)}
            y={BANNER_HIT}
            width={Math.max(2, x(hit.to_index) - x(hit.from_index))}
            height={chartH - PAD / 2 - BANNER_HIT}
            fill="var(--chart-4)"
            opacity={0.07}
            style={{ pointerEvents: "none" }}
          />
        ) : null}

        {splitAt != null ? (
          <>
            <polyline
              points={polylinePoints(values, 0, splitAt, x, y)}
              fill="none"
              stroke="var(--muted-foreground)"
              strokeWidth={1.15}
              strokeLinejoin="round"
              opacity={0.55}
              style={{ pointerEvents: "none" }}
            />
            <polyline
              points={polylinePoints(values, splitAt, values.length - 1, x, y)}
              fill="none"
              stroke="var(--foreground)"
              strokeWidth={1.6}
              strokeLinejoin="round"
              style={{ pointerEvents: "none" }}
            />
          </>
        ) : (
          <polyline
            points={curvePoints}
            fill="none"
            stroke="var(--foreground)"
            strokeWidth={1.6}
            strokeLinejoin="round"
            style={{ pointerEvents: "none" }}
          />
        )}

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
                opacity={splitAt != null && index < splitAt ? 0.16 : 0.45}
              />
            ))}
            {splitAt != null ? (
              <>
                <polyline
                  points={polylinePoints(mm20, 0, splitAt, x, activityY)}
                  fill="none"
                  stroke="var(--chart-4)"
                  strokeWidth={1}
                  opacity={0.4}
                />
                <polyline
                  points={polylinePoints(mm20, splitAt, mm20.length - 1, x, activityY)}
                  fill="none"
                  stroke="var(--chart-4)"
                  strokeWidth={1.3}
                />
              </>
            ) : (
              <polyline
                points={mm20.map((value, index) => `${x(index)},${activityY(value)}`).join(" ")}
                fill="none"
                stroke="var(--chart-4)"
                strokeWidth={1.3}
              />
            )}
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
            {splitAt != null && dates[0] && x(splitAt) - PAD >= 72 ? (
              <text x={PAD} y={HEIGHT - 4} className="fill-muted-foreground text-[9px]">
                {dates[0]}
              </text>
            ) : splitAt == null && dates[0] ? (
              <text x={PAD} y={HEIGHT - 4} className="fill-muted-foreground text-[9px]">
                {dates[0]}
              </text>
            ) : null}
            {splitAt != null && dates[splitAt] ? (
              <text
                x={x(splitAt)}
                y={HEIGHT - 4}
                textAnchor={x(splitAt) - PAD < 72 ? "start" : "middle"}
                className="fill-muted-foreground text-[9px]"
              >
                {dates[splitAt]}
              </text>
            ) : null}
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
