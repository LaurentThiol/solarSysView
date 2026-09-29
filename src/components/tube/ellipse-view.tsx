"use client"

import { TUBE_COLORS } from "@/components/tube/palette"
import type { TubeEllipse, TubeEllipsePair, TubePlane, TubeSection } from "@/lib/tube"

const WIDTH = 280
const HEIGHT = 210
const PAD = 22

function px(value: number) {
  return Math.round(value * 100) / 100
}

function ellipsePath(
  shape: TubeEllipse,
  sx: (value: number) => number,
  sy: (value: number) => number
) {
  const steps = 48
  const points: string[] = []
  for (let i = 0; i <= steps; i += 1) {
    const t = (i / steps) * Math.PI * 2
    const ex =
      Math.cos(shape.angle) * shape.major * Math.cos(t) - Math.sin(shape.angle) * shape.minor * Math.sin(t)
    const ey =
      Math.sin(shape.angle) * shape.major * Math.cos(t) + Math.cos(shape.angle) * shape.minor * Math.sin(t)
    points.push(`${px(sx(shape.sumCenter + ex))},${px(sy(shape.yCenter + ey))}`)
  }
  return `M ${points.join(" L ")} Z`
}

const PLANE_AXIS: Record<TubePlane, string> = {
  etendue: "étendue",
  parite: "parité",
}

export function EllipseView({
  section,
  pair,
}: {
  section: TubeSection
  pair: TubeEllipsePair
}) {
  const shapes = [pair.nominal, pair.deformed]
  let minX = Math.min(section.sum, section.center, section.deformedCenter)
  let maxX = Math.max(section.sum, section.center, section.deformedCenter)
  let minY = pair.deformed.y
  let maxY = pair.deformed.y
  for (const shape of shapes) {
    minX = Math.min(minX, shape.sumCenter - shape.major)
    maxX = Math.max(maxX, shape.sumCenter + shape.major)
    minY = Math.min(minY, shape.yCenter - shape.major, shape.y)
    maxY = Math.max(maxY, shape.yCenter + shape.major, shape.y)
  }
  const span = Math.max(maxX - minX, maxY - minY, 1)
  const cx = (minX + maxX) / 2
  const cy = (minY + maxY) / 2
  const scale = (WIDTH - PAD * 2) / span
  const sx = (value: number) => WIDTH / 2 + (value - cx) * scale
  const sy = (value: number) => HEIGHT / 2 - (value - cy) * scale
  const pointColor = pair.insideDeformed ? TUBE_COLORS.inside : TUBE_COLORS.outside
  const axis = PLANE_AXIS[pair.deformed.plane]

  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      className="h-auto w-full max-w-xs text-muted-foreground"
      role="img"
      aria-label={`Ellipse ${axis} du ${section.date}`}
    >
      <path
        d={ellipsePath(pair.nominal, sx, sy)}
        fill="var(--muted-foreground)"
        fillOpacity={0.05}
        stroke="var(--muted-foreground)"
        strokeDasharray="4 3"
      />
      <path
        d={ellipsePath(pair.deformed, sx, sy)}
        fill="var(--chart-1)"
        fillOpacity={0.16}
        stroke="var(--chart-1)"
        strokeWidth={1.5}
      />
      <circle cx={px(sx(section.deformedCenter))} cy={px(sy(pair.deformed.yCenter))} r={3} fill="var(--chart-1)" />
      <circle cx={px(sx(section.sum))} cy={px(sy(pair.deformed.y))} r={4.5} fill={pointColor} />
      <text x={PAD} y={16} fontSize={10} fill="currentColor">
        somme →
      </text>
      <text x={PAD} y={HEIGHT - 8} fontSize={10} fill="currentColor">
        {axis} ↑
      </text>
    </svg>
  )
}

/** Quelques sections le long du temps : verticale = somme, horizontale = le second axe, ramené à une largeur lisible. */
export function EllipseStrip({
  sections,
  pairs,
  hover,
}: {
  sections: readonly TubeSection[]
  pairs: readonly TubeEllipsePair[]
  hover: number | null
}) {
  const width = 640
  const height = 150
  const padX = 12
  const padY = 16
  if (sections.length < 2) return null
  let lo = Infinity
  let hi = -Infinity
  for (const section of sections) {
    lo = Math.min(lo, section.deformedLower, section.sum)
    hi = Math.max(hi, section.deformedUpper, section.sum)
  }
  const ySpan = Math.max(hi - lo, 1)
  const sy = (value: number) => height - padY - ((value - lo) / ySpan) * (height - padY * 2)
  const stride = Math.max(1, Math.ceil(sections.length / 64))
  const indexes: number[] = []
  for (let i = 0; i < sections.length; i += stride) indexes.push(i)
  if (hover != null && !indexes.includes(hover)) indexes.push(hover)

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-auto w-full" role="img" aria-label="Tube de sections elliptiques">
      {indexes.map((index) => {
        const section = sections[index]
        const pair = pairs[index]
        if (!section || !pair) return null
        const x = padX + (index / (sections.length - 1)) * (width - padX * 2)
        const active = index === hover
        const shape = pair.deformed
        const yScale = Math.max(shape.minor, 1)
        const rx = active ? 11 : 7
        const steps = 20
        const points: string[] = []
        for (let k = 0; k <= steps; k += 1) {
          const t = (k / steps) * Math.PI * 2
          const ex =
            Math.cos(shape.angle) * shape.major * Math.cos(t) - Math.sin(shape.angle) * shape.minor * Math.sin(t)
          const ey =
            Math.sin(shape.angle) * shape.major * Math.cos(t) + Math.cos(shape.angle) * shape.minor * Math.sin(t)
          points.push(`${px(x + (ey / yScale) * rx)},${px(sy(shape.sumCenter + ex))}`)
        }
        return (
          <path
            key={section.date}
            d={`M ${points.join(" L ")} Z`}
            fill="var(--chart-1)"
            fillOpacity={active ? 0.35 : 0.08}
            stroke="var(--chart-1)"
            strokeOpacity={active ? 1 : 0.35}
            strokeWidth={active ? 1.5 : 0.6}
          />
        )
      })}
    </svg>
  )
}
