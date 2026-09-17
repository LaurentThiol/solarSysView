"use client"

import { sparkValues, sparklinePoints } from "@/lib/chartisme/sketch-shapes"
import { cn } from "@/lib/utils"

const WIDTH = 48
const HEIGHT = 20

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
  const points = sparklinePoints(sparkValues(figure), WIDTH, HEIGHT, 1.5)
  if (!points) return null
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
      <polyline
        points={points}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.4}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
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
