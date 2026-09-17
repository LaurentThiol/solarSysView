"use client"

import { curveSparkBounds, curveSparkSeries } from "@/lib/chartisme/curve-shapes"
import { sparklinePoints } from "@/lib/chartisme/sketch-shapes"
import { cn } from "@/lib/utils"

const WIDTH = 48
const HEIGHT = 20

/** Forme typique d'un type de courbe, à coller à côté du nom. */
export function CurveThumb({
  kind,
  className,
  label,
}: {
  kind: string
  className?: string
  label?: string
}) {
  const series = curveSparkSeries(kind)
  if (!series.length) return null
  const flat = series.flat()
  const bounds = curveSparkBounds(kind) ?? { min: Math.min(...flat), max: Math.max(...flat) }
  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      width={WIDTH}
      height={HEIGHT}
      aria-hidden={label ? undefined : true}
      role={label ? "img" : undefined}
      aria-label={label}
      className={cn("size-[48px_20px] shrink-0 text-amber-300", className)}
    >
      {series.map((values, index) => {
        const points = sparklinePoints(values, WIDTH, HEIGHT, 1.5, bounds)
        if (!points) return null
        const opacity = 1 - index * 0.16
        return (
          <polyline
            key={index}
            points={points}
            fill="none"
            stroke="currentColor"
            strokeOpacity={Math.max(0.35, opacity)}
            strokeWidth={1.3}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        )
      })}
    </svg>
  )
}

export function CurveName({
  kind,
  label,
  className,
}: {
  kind: string
  label: string
  className?: string
}) {
  return (
    <span className={cn("inline-flex min-w-0 items-center gap-1.5", className)}>
      <CurveThumb kind={kind} />
      <span className="truncate">{label}</span>
    </span>
  )
}
