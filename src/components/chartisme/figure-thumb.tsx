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
const PLATE_WIDTH = 168
const PLATE_HEIGHT = 70

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
  plate = false,
}: {
  figure: string
  className?: string
  label?: string
  /** Gabarit plus grand, pour le glossaire. */
  plate?: boolean
}) {
  const width = plate ? PLATE_WIDTH : WIDTH
  const height = plate ? PLATE_HEIGHT : HEIGHT
  const pad = plate ? 8 : 1.5
  const guides = sparkGuides(figure)
  const values = sparkValues(figure)
  const showCurve = sparkShowsCurve(figure)
  const pool = guides
    ? [...guides.upper, ...guides.lower, ...(showCurve ? values : [])]
    : values
  const box = pool.length ? { min: Math.min(...pool), max: Math.max(...pool) } : undefined
  const curvePts = showCurve ? sparklinePoints(values, width, height, pad, box) : ""
  const upperPts = guides ? sparklinePoints(guides.upper, width, height, pad, box) : ""
  const lowerPts = guides ? sparklinePoints(guides.lower, width, height, pad, box) : ""
  const capU = ends(upperPts)
  const capL = ends(lowerPts)
  if (!curvePts && !upperPts) return null
  const railsOnly = sparkSolidGuides(figure)
  const curveStroke = plate ? 2.2 : 1.4
  const guideStroke = plate ? (railsOnly ? 2.4 : 1.8) : railsOnly ? 1.5 : 1.15
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      aria-hidden={label ? undefined : true}
      role={label ? "img" : undefined}
      aria-label={label}
      className={cn(plate ? "shrink-0 text-sky-200" : "size-[48px_20px] shrink-0 text-sky-300", className)}
    >
      {plate ? <rect width={width} height={height} rx={10} fill="#12182a" /> : null}
      {upperPts ? (
        <polyline
          points={upperPts}
          fill="none"
          stroke="currentColor"
          strokeWidth={guideStroke}
          strokeDasharray={railsOnly ? undefined : plate ? "7 5" : "2 1.4"}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      ) : null}
      {lowerPts ? (
        <polyline
          points={lowerPts}
          fill="none"
          stroke="currentColor"
          strokeWidth={guideStroke}
          strokeDasharray={railsOnly ? undefined : plate ? "7 5" : "2 1.4"}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      ) : null}
      {capU && capL ? (
        <g stroke="currentColor" strokeWidth={plate ? 1.6 : 1} opacity={0.75}>
          <line x1={capU.x0} y1={capU.y0} x2={capL.x0} y2={capL.y0} />
          <line x1={capU.x1} y1={capU.y1} x2={capL.x1} y2={capL.y1} />
        </g>
      ) : null}
      {curvePts ? (
        <polyline
          points={curvePts}
          fill="none"
          stroke="currentColor"
          strokeWidth={curveStroke}
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
