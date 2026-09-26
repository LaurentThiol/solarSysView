"use client"

import { curveSparkBounds, curveSparkSeries } from "@/lib/chartisme/curve-shapes"
import { sparklinePoints } from "@/lib/chartisme/sketch-shapes"
import { cn } from "@/lib/utils"

const WIDTH = 48
const HEIGHT = 20
const PLATE_WIDTH = 168
const PLATE_HEIGHT = 70

/** Forme typique d'un type de courbe, à coller à côté du nom. */
export function CurveThumb({
  kind,
  className,
  label,
  plate = false,
}: {
  kind: string
  className?: string
  label?: string
  /** Gabarit plus grand, pour le glossaire. */
  plate?: boolean
}) {
  const series = curveSparkSeries(kind)
  if (!series.length) return null
  const width = plate ? PLATE_WIDTH : WIDTH
  const height = plate ? PLATE_HEIGHT : HEIGHT
  const pad = plate ? 8 : 1.5
  const flat = series.flat()
  const boxed = curveSparkBounds(kind)
  // Le glossaire isole la forme. Le sélecteur, lui, garde la boîte théorique
  // pour que n1 reste bas et n5 haut quand on les compare.
  const bounds = plate || !boxed ? { min: Math.min(...flat), max: Math.max(...flat) } : boxed
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      aria-hidden={label ? undefined : true}
      role={label ? "img" : undefined}
      aria-label={label}
      className={cn(plate ? "shrink-0 text-amber-200" : "size-[48px_20px] shrink-0 text-amber-300", className)}
    >
      {plate ? <rect width={width} height={height} rx={10} fill="#12182a" /> : null}
      {series.map((values, index) => {
        const points = sparklinePoints(values, width, height, pad, bounds)
        if (!points) return null
        const opacity = 1 - index * 0.16
        return (
          <polyline
            key={index}
            points={points}
            fill="none"
            stroke="currentColor"
            strokeOpacity={Math.max(0.35, opacity)}
            strokeWidth={plate ? 2.2 : 1.3}
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
