"use client"

import { useXAxisScale, useYAxisDomain, useYAxisScale } from "recharts"

import { monthBoundaries } from "@/lib/month-end"

function coord(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null
}

/** Trait vertical fin entre le dernier tirage d’un mois et le premier du suivant. */
export function MonthEndMarks({
  dates,
  yAxisId,
}: {
  dates: readonly string[]
  yAxisId?: string | number
}) {
  const xScale = useXAxisScale()
  const yScale = useYAxisScale(yAxisId)
  const yDomain = useYAxisDomain(yAxisId)
  if (!xScale || !yScale || !yDomain || yDomain.length < 2 || dates.length < 2) return null
  const y1 = coord(yScale(yDomain[0]))
  const y2 = coord(yScale(yDomain[1]))
  if (y1 == null || y2 == null) return null
  const boundaries = monthBoundaries(dates)
  if (boundaries.length === 0) return null

  return (
    <g pointerEvents="none" data-month-ends={boundaries.length} aria-hidden>
      {boundaries.map((boundary) => {
        const left = coord(xScale(boundary.date, { position: "middle" }))
        const right = coord(xScale(boundary.next, { position: "middle" }))
        if (left == null || right == null) return null
        const x = (left + right) / 2
        return (
          <line
            key={`${boundary.date}|${boundary.next}`}
            data-month-end={boundary.date}
            x1={x}
            x2={x}
            y1={y1}
            y2={y2}
            stroke="var(--muted-foreground)"
            strokeWidth={1}
            strokeOpacity={0.7}
            shapeRendering="crispEdges"
          />
        )
      })}
    </g>
  )
}
