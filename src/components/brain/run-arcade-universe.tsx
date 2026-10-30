import { curveLabel, RAIL_LEFT, RAIL_RIGHT, type CurveKey } from "@/lib/run-arcade/curves"
import type { RailMark, ThoughtDraw } from "@/lib/run-arcade/thought"

import { cn } from "@/lib/utils"

const PLOT = { l: 28, r: 258, t: 16, b: 168 }
const VIEW_W = 380
const VIEW_H = 200
const RAIL_TOP = 22
const RAIL_STEP = 24
const COLUMNS = [
  { keys: RAIL_LEFT, label: 268, value: 296 },
  { keys: RAIL_RIGHT, label: 324, value: 350 },
] as const

function scales(thought: ThoughtDraw) {
  const x0 = -0.35
  const x1 = thought.xMax + 0.6
  const y0 = thought.yMin
  const y1 = thought.yMax
  const xSpan = x1 - x0 || 1
  const ySpan = y1 - y0 || 1
  const X = (x: number) => PLOT.l + ((x - x0) / xSpan) * (PLOT.r - PLOT.l)
  const Y = (y: number) => PLOT.b - ((y - y0) / ySpan) * (PLOT.b - PLOT.t)
  const radiusPx = Math.abs(Y(thought.radius.cy) - Y(thought.radius.cy + thought.radius.r))
  return { X, Y, radiusPx }
}

function formatValue(value: number) {
  const rounded = Math.round(value * 10) / 10
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1).replace(".", ",")
}

function railTone(key: CurveKey, matched: readonly CurveKey[], exact: readonly CurveKey[]) {
  if (matched.includes(key)) return "fill-[var(--ok)] font-medium"
  if (exact.includes(key)) return "fill-chart-2 font-medium"
  return "fill-foreground"
}

export function RunnerUniverse({
  runnerId,
  thought,
  matched = [],
  exact = [],
  className,
}: {
  runnerId: string
  thought: ThoughtDraw | null
  matched?: readonly CurveKey[]
  exact?: readonly CurveKey[]
  className?: string
}) {
  if (!thought) {
    return (
      <div
        className={cn(
          "flex h-40 items-center justify-center rounded-lg border border-dashed border-border text-xs text-muted-foreground",
          className
        )}
      >
        En attente du lancement.
      </div>
    )
  }

  const { X, Y, radiusPx } = scales(thought)
  const trail = thought.trail.map((point) => `${X(point.x)},${Y(point.y)}`).join(" ")
  const markerId = `run-arcade-${runnerId}-head`
  const cx = X(thought.radius.cx)
  const cy = Y(thought.radius.cy)
  const marks = new Map<CurveKey, RailMark>(thought.marks.map((mark) => [mark.key, mark]))
  const caseX = X(thought.projection.x)
  const caseY = Y(thought.projection.y)

  return (
    <svg
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      role="img"
      aria-label={thought.phrase}
      data-testid="runner-universe"
      data-runner-universe={runnerId}
      className={cn("h-40 w-full", className)}
    >
      <defs>
        <marker id={markerId} viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto">
          <path d="M0 0 L8 4 L0 8 Z" className="fill-chart-4" />
        </marker>
        <marker
          id={`${markerId}-vel`}
          viewBox="0 0 8 8"
          refX="7"
          refY="4"
          markerWidth="6"
          markerHeight="6"
          orient="auto"
        >
          <path d="M0 0 L8 4 L0 8 Z" className="fill-chart-3" />
        </marker>
      </defs>
      <rect x="0" y="0" width={VIEW_W} height={VIEW_H} className="fill-canvas" rx="8" />
      {thought.golden.map((level) => (
        <g key={level.ratio}>
          <line
            x1={PLOT.l}
            x2={PLOT.r}
            y1={Y(level.y)}
            y2={Y(level.y)}
            className={level.chosen ? "stroke-chart-1" : "stroke-border"}
            strokeWidth={level.chosen ? 1.25 : 0.75}
            strokeDasharray={level.chosen ? undefined : "2 4"}
          />
          {level.chosen ? (
            <text x={PLOT.l + 4} y={Y(level.y) - 3} className="fill-chart-1 text-[9px]">
              {String(level.ratio).replace(".", ",")}
            </text>
          ) : null}
        </g>
      ))}
      <circle cx={cx} cy={cy} r={Math.max(4, radiusPx)} className="fill-chart-1/10 stroke-chart-1" strokeWidth="1.25" />
      <line
        x1={X(thought.spoke.x1)}
        y1={Y(thought.spoke.y1)}
        x2={X(thought.spoke.x2)}
        y2={Y(thought.spoke.y2)}
        className="stroke-chart-1"
        strokeWidth="1"
      />
      <line
        x1={X(thought.tangent.x1)}
        y1={Y(thought.tangent.y1)}
        x2={X(thought.tangent.x2)}
        y2={Y(thought.tangent.y2)}
        className="stroke-chart-2"
        strokeWidth="1.2"
        strokeDasharray="4 3"
      />
      <polyline points={trail} className="stroke-foreground" strokeWidth="1.6" fill="none" />
      {thought.velocity ? (
        <line
          x1={X(thought.velocity.x1)}
          y1={Y(thought.velocity.y1)}
          x2={X(thought.velocity.x2)}
          y2={Y(thought.velocity.y2)}
          className="stroke-chart-3"
          strokeWidth="1.4"
          markerEnd={`url(#${markerId}-vel)`}
        />
      ) : null}
      <line
        x1={X(thought.vector.x1)}
        y1={Y(thought.vector.y1)}
        x2={X(thought.vector.x2)}
        y2={Y(thought.vector.y2)}
        className="stroke-chart-4"
        strokeWidth="1.6"
        markerEnd={`url(#${markerId})`}
        data-testid="runner-vector"
      />
      {thought.recall ? (
        <line
          x1={X(thought.recall.x1)}
          y1={Y(thought.recall.y1)}
          x2={X(thought.recall.x2)}
          y2={Y(thought.recall.y2)}
          className="stroke-muted-foreground"
          strokeWidth="0.9"
          strokeDasharray="2 2"
          data-testid="runner-recall"
        />
      ) : null}
      <line x1={caseX} y1={caseY} x2={PLOT.r} y2={caseY} className="stroke-chart-4/50" strokeWidth="0.8" strokeDasharray="1 3" />
      <circle cx={caseX} cy={caseY} r="3.6" className="fill-canvas stroke-chart-4" strokeWidth="1.6" />
      <circle cx={caseX} cy={caseY} r="1.6" className="fill-chart-4" />
      <text x={PLOT.r - 2} y={caseY - 3} textAnchor="end" className="fill-chart-4 text-[9px]">
        {formatValue(thought.projection.y)}
      </text>
      <circle cx={cx} cy={cy} r="2.4" className="fill-foreground" />
      {COLUMNS.map((column) =>
        column.keys.map((key, index) => {
          const mark = marks.get(key)
          if (!mark) return null
          const y = RAIL_TOP + index * RAIL_STEP
          const focus = key === thought.focus
          return (
            <g key={key} data-rail={key}>
              <title>{`${curveLabel(key)} : pensée ${formatValue(mark.thought)} · case ${mark.value}`}</title>
              <text
                x={column.label}
                y={y}
                className={cn("text-[10px]", focus ? "fill-chart-4 font-medium" : "fill-muted-foreground")}
              >
                {curveLabel(key)}
              </text>
              <text x={column.value} y={y} className={cn("text-[11px]", railTone(key, matched, exact))}>
                {mark.value}
              </text>
            </g>
          )
        })
      )}
    </svg>
  )
}
