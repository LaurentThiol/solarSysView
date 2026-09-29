"use client"

import { FAMILY_COLORS, TUBE_COLORS } from "@/components/tube/palette"
import { RANK_RGB, rgbCssOf } from "@/lib/relief"
import { TUBE_RANKS, TUBE_SOURCE_LABELS, type TubeSection, type TubeSource } from "@/lib/tube"

const WIDTH = 340
const HEIGHT = 252
const TOP = 16
const BOTTOM = 222
const X_NOMINAL = 46
const X_DEFORMED = 112
const X_FORCES = 186
const FORCE_STEP = 22
const X_MOON = 312
const FORCE_BASE = (TOP + BOTTOM) / 2
const PX_PER_SIGMA = 26
const FORCE_CLAMP = 3.2

/** Au centième : le rendu serveur et le navigateur n'ont pas toujours les mêmes derniers bits de Math.cos / tanh. */
function px(value: number) {
  return Math.round(value * 100) / 100
}

function Arrow({
  x1,
  y1,
  x2,
  y2,
  color,
  width = 1.75,
  dashed = false,
  opacity = 1,
}: {
  x1: number
  y1: number
  x2: number
  y2: number
  color: string
  width?: number
  dashed?: boolean
  opacity?: number
}) {
  const dx = x2 - x1
  const dy = y2 - y1
  const length = Math.hypot(dx, dy)
  if (length < 1.5) {
    return <circle cx={x1} cy={y1} r={2} fill={color} opacity={opacity} />
  }
  const ux = dx / length
  const uy = dy / length
  const head = Math.min(7, length * 0.6)
  const bx = x2 - ux * head
  const by = y2 - uy * head
  const wing = head * 0.55
  return (
    <g opacity={opacity}>
      <line
        x1={px(x1)}
        y1={px(y1)}
        x2={px(bx)}
        y2={px(by)}
        stroke={color}
        strokeWidth={width}
        strokeDasharray={dashed ? "4 3" : undefined}
        strokeLinecap="round"
      />
      <polygon
        points={`${px(x2)},${px(y2)} ${px(bx - uy * wing)},${px(by + ux * wing)} ${px(bx + uy * wing)},${px(by - ux * wing)}`}
        fill={color}
      />
    </g>
  )
}

/** Disque éclairé vu de l'hémisphère nord : croissante à droite, décroissante à gauche. */
export function MoonGlyph({ fraction, cx, cy, r }: { fraction: number; cx: number; cy: number; r: number }) {
  const f = ((fraction % 1) + 1) % 1
  const k = Math.cos(2 * Math.PI * f)
  const rx = px(Math.max(0.01, r * Math.abs(k)))
  const waxing = f < 0.5
  const crescent = k > 0
  const outerSweep = waxing ? 1 : 0
  const terminatorSweep = waxing ? (crescent ? 0 : 1) : crescent ? 1 : 0
  const lit = `M ${cx} ${cy - r} A ${r} ${r} 0 0 ${outerSweep} ${cx} ${cy + r} A ${rx} ${r} 0 0 ${terminatorSweep} ${cx} ${cy - r} Z`
  return (
    <g>
      <circle cx={cx} cy={cy} r={r} fill={TUBE_COLORS.moonDark} stroke="var(--border)" />
      <path d={lit} fill={TUBE_COLORS.moonLit} />
    </g>
  )
}

export function SectionView({
  section,
  sources,
}: {
  section: TubeSection
  sources: ReadonlySet<TubeSource>
}) {
  const lo = Math.min(section.lower, section.deformedLower, section.sum) - 6
  const hi = Math.max(section.upper, section.deformedUpper, section.sum) + 6
  const y = (value: number) => px(BOTTOM - ((value - lo) / (hi - lo || 1)) * (BOTTOM - TOP))
  const drawColor = section.insideDeformed ? TUBE_COLORS.inside : TUBE_COLORS.outside
  const stretch =
    Math.abs(section.widthFactor - 1) < 0.001
      ? TUBE_COLORS.deformed
      : section.widthFactor > 1
        ? FAMILY_COLORS.etirement
        : FAMILY_COLORS.compression
  const forceY = (value: number) =>
    px(FORCE_BASE - Math.max(-FORCE_CLAMP, Math.min(FORCE_CLAMP, value)) * PX_PER_SIGMA)

  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      className="h-auto w-full max-w-md text-muted-foreground"
      role="img"
      aria-label={`Section du ${section.date} : tube de ${Math.round(section.deformedLower)} à ${Math.round(section.deformedUpper)}, somme ${section.sum}`}
    >
      <line
        x1={24}
        x2={X_DEFORMED + 26}
        y1={y(section.sum)}
        y2={y(section.sum)}
        stroke={drawColor}
        strokeDasharray="2 3"
      />
      <line
        x1={X_NOMINAL}
        x2={X_NOMINAL}
        y1={y(section.lower)}
        y2={y(section.upper)}
        stroke={TUBE_COLORS.nominal}
        strokeWidth={6}
        strokeOpacity={0.18}
        strokeLinecap="round"
      />
      <Arrow
        x1={X_NOMINAL}
        y1={y(section.center)}
        x2={X_NOMINAL}
        y2={y(section.upper)}
        color={TUBE_COLORS.nominal}
        dashed
      />
      <Arrow
        x1={X_NOMINAL}
        y1={y(section.center)}
        x2={X_NOMINAL}
        y2={y(section.lower)}
        color={TUBE_COLORS.nominal}
        dashed
      />
      <circle cx={X_NOMINAL} cy={y(section.center)} r={3.5} fill={TUBE_COLORS.nominal} />

      <Arrow
        x1={X_NOMINAL + 5}
        y1={y(section.center)}
        x2={X_DEFORMED - 5}
        y2={y(section.deformedCenter)}
        color={FAMILY_COLORS.cisaillement}
        width={1.5}
        dashed
      />

      <line
        x1={X_DEFORMED}
        x2={X_DEFORMED}
        y1={y(section.deformedLower)}
        y2={y(section.deformedUpper)}
        stroke={TUBE_COLORS.deformed}
        strokeWidth={8}
        strokeOpacity={0.22}
        strokeLinecap="round"
      />
      <Arrow
        x1={X_DEFORMED}
        y1={y(section.deformedCenter)}
        x2={X_DEFORMED}
        y2={y(section.deformedUpper)}
        color={stretch}
        width={2}
      />
      <Arrow
        x1={X_DEFORMED}
        y1={y(section.deformedCenter)}
        x2={X_DEFORMED}
        y2={y(section.deformedLower)}
        color={stretch}
        width={2}
      />
      <circle cx={X_DEFORMED} cy={y(section.deformedCenter)} r={4} fill={TUBE_COLORS.deformed} />
      <circle cx={X_DEFORMED + 26} cy={y(section.sum)} r={4.5} fill={drawColor} />
      <text
        x={X_DEFORMED + 34}
        y={y(section.sum) + 4}
        fontSize={11}
        fill={drawColor}
        className="tabular-nums"
      >
        {section.sum}
      </text>

      <line
        x1={X_FORCES - 14}
        x2={X_MOON + 16}
        y1={FORCE_BASE}
        y2={FORCE_BASE}
        stroke="var(--border)"
        strokeDasharray="3 3"
      />
      {TUBE_RANKS.map((rank, k) => {
        const x = X_FORCES + k * FORCE_STEP
        return (
          <g key={rank}>
            <Arrow
              x1={x}
              y1={FORCE_BASE}
              x2={x}
              y2={forceY(section.forces[k])}
              color={rgbCssOf(RANK_RGB[k])}
              width={2.5}
              opacity={sources.has(rank) ? 1 : 0.25}
            />
            <text x={x} y={HEIGHT - 12} fontSize={10} textAnchor="middle" fill="currentColor">
              {TUBE_SOURCE_LABELS[rank]}
            </text>
          </g>
        )
      })}
      <MoonGlyph fraction={section.moonFraction} cx={X_MOON} cy={TOP + 14} r={12} />
      <Arrow
        x1={X_MOON}
        y1={FORCE_BASE}
        x2={X_MOON}
        y2={forceY(section.drift)}
        color={TUBE_COLORS.moonLit}
        width={2.5}
        opacity={sources.has("lune") ? 1 : 0.25}
      />
      <text x={X_MOON} y={HEIGHT - 12} fontSize={10} textAnchor="middle" fill="currentColor">
        Lune
      </text>
      <text x={X_NOMINAL} y={HEIGHT - 12} fontSize={10} textAnchor="middle" fill="currentColor">
        nominal
      </text>
      <text x={X_DEFORMED} y={HEIGHT - 12} fontSize={10} textAnchor="middle" fill="currentColor">
        déformé
      </text>
    </svg>
  )
}
