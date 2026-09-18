"use client"

import {
  sparkGuides,
  sparkShowsCurve,
  sparkSolidGuides,
  sparkValues,
  sparklinePoints,
} from "@/lib/chartisme/sketch-shapes"
import { cn } from "@/lib/utils"

const WIDTH = 48
const HEIGHT = 20

function ends(points: string) {
  const parts = points.split(" ").filter(Boolean)
  if (parts.length < 2) return null
  const first = parts[0].split(",").map(Number)
  const last = parts[parts.length - 1].split(",").map(Number)
  if (first.length < 2 || last.length < 2) return null
  return { x0: first[0], y0: first[1], x1: last[0], y1: last[1] }
}

/** Gabarit d'école en miniature, à coller à côté du nom d'une figure. */
export function FigureThumb({
  figure,
  className,
  label,
}: {
  figure: string
  className?: string
  label?: string
}) {
  const guides = sparkGuides(figure)
  const values = sparkValues(figure)
  const showCurve = sparkShowsCurve(figure)
  const pool = guides
    ? [...guides.upper, ...guides.lower, ...(showCurve ? values : [])]
    : values
  const box = pool.length ? { min: Math.min(...pool), max: Math.max(...pool) } : undefined
  const curvePts = showCurve ? sparklinePoints(values, WIDTH, HEIGHT, 1.5, box) : ""
  const upperPts = guides ? sparklinePoints(guides.upper, WIDTH, HEIGHT, 1.5, box) : ""
  const lowerPts = guides ? sparklinePoints(guides.lower, WIDTH, HEIGHT, 1.5, box) : ""
  const capU = ends(upperPts)
  const capL = ends(lowerPts)
  if (!curvePts && !upperPts) return null
  const railsOnly = sparkSolidGuides(figure)
  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      width={WIDTH}
      height={HEIGHT}
      aria-hidden={label ? undefined : true}
      role={label ? "img" : undefined}
      aria-label={label}
      className={cn("size-[48px_20px] shrink-0 text-sky-300", className)}
    >
      {upperPts ? (
        <polyline
          points={upperPts}
          fill="none"
          stroke="currentColor"
          strokeWidth={railsOnly ? 1.5 : 1.15}
          strokeDasharray={railsOnly ? undefined : "2 1.4"}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      ) : null}
      {lowerPts ? (
        <polyline
          points={lowerPts}
          fill="none"
          stroke="currentColor"
          strokeWidth={railsOnly ? 1.5 : 1.15}
          strokeDasharray={railsOnly ? undefined : "2 1.4"}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      ) : null}
      {capU && capL ? (
        <g stroke="currentColor" strokeWidth={1} opacity={0.75}>
          <line x1={capU.x0} y1={capU.y0} x2={capL.x0} y2={capL.y0} />
          <line x1={capU.x1} y1={capU.y1} x2={capL.x1} y2={capL.y1} />
        </g>
      ) : null}
      {curvePts ? (
        <polyline
          points={curvePts}
          fill="none"
          stroke="currentColor"
          strokeWidth={1.4}
          strokeOpacity={guides ? (railsOnly ? 0.4 : 0.72) : 1}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      ) : null}
    </svg>
  )
}

export function FigureName({
  figure,
  label,
  className,
}: {
  figure: string
  label: string
  className?: string
}) {
  return (
    <span className={cn("inline-flex min-w-0 items-center gap-1.5", className)}>
      <FigureThumb figure={figure} />
      <span className="truncate">{label}</span>
    </span>
  )
}
