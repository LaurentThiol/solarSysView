import { curveLabel, RAIL_LEFT, RAIL_RIGHT, type CurveKey } from "@/lib/run-arcade/curves"
import { gesturePhrase } from "@/lib/run-arcade/skills"
import type { CurveMask, RailMark, ThoughtDraw } from "@/lib/run-arcade/thought"

import { cn } from "@/lib/utils"

const PLOT = { l: 28, r: 258, t: 16, b: 168 }
const VIEW_W = 380
const VIEW_H = 224
const MASK_MIN = 12
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

function observationLines(observation: string) {
  const mark = " · tangente "
  const at = observation.indexOf(mark)
  if (at < 0) return [observation]
  return [observation.slice(0, at), observation.slice(at + 3)]
}

function maskBox(mask: CurveMask, X: (x: number) => number, Y: (y: number) => number, yMin: number, yMax: number) {
  const start = X(mask.x1)
  const end = X(mask.x2)
  const rawLeft = Math.min(start, end)
  const rawRight = Math.max(start, end)
  const width = Math.max(MASK_MIN, rawRight - rawLeft)
  const left = rawRight - rawLeft < MASK_MIN ? (rawLeft + rawRight) / 2 - width / 2 : rawLeft
  const top = Y(yMax)
  const height = Math.max(1, Y(yMin) - top)
  return { left: Math.max(PLOT.l, left), width, top, height }
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
  const lines = observationLines(thought.observation)
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
      <polyline points={trail} className="stroke-foreground" strokeWidth="1.6" fill="none" data-testid="runner-curve" />
      {[...thought.masks].sort((a, b) => Number(a.drives) - Number(b.drives)).map((mask) => {
        const box = maskBox(mask, X, Y, thought.yMin, thought.yMax)
        return (
          <rect
            key={mask.id}
            data-mask={mask.id}
            data-drives={mask.drives ? "oui" : "non"}
            x={box.left}
            y={box.top}
            width={box.width}
            height={box.height}
            className={mask.drives ? "fill-chart-4/25 stroke-chart-4" : "fill-chart-1/15 stroke-chart-1"}
            strokeWidth={mask.drives ? 1 : 0.6}
          >
            <title>{`${mask.name} · ${gesturePhrase(mask.gesture)} · ${mask.drives ? "pose la pensée" : "autre masque"} · tirages ${mask.x1 + 1}–${mask.x2 + 1}`}</title>
          </rect>
        )
      })}
      <g data-calque="tangente">
        <line
          x1={X(thought.tangent.x1)}
          y1={Y(thought.tangent.y1)}
          x2={X(thought.tangent.x2)}
          y2={Y(thought.tangent.y2)}
          className="stroke-chart-2"
          strokeWidth="1.2"
          strokeDasharray="4 3"
        />
      </g>
      <g data-calque="cercle">
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
      </g>
      <g data-calque="pas">
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
      </g>
      <g data-calque="vecteur">
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
      </g>
      <line x1={caseX} y1={caseY} x2={PLOT.r} y2={caseY} className="stroke-chart-4/50" strokeWidth="0.8" strokeDasharray="1 3" />
      <circle cx={caseX} cy={caseY} r="3.6" className="fill-canvas stroke-chart-4" strokeWidth="1.6" />
      <circle cx={caseX} cy={caseY} r="1.6" className="fill-chart-4" />
      <text x={PLOT.r - 2} y={caseY - 3} textAnchor="end" className="fill-chart-4 text-[9px]">
        {formatValue(thought.projection.y)}
      </text>
      <circle cx={cx} cy={cy} r="2.4" className="fill-foreground" />
      <rect x="0" y="176" width={VIEW_W} height="48" className="fill-canvas" />
      <text x="8" y="192" className="fill-foreground text-[8px]" data-testid="runner-lecture">
        {lines[0]}
      </text>
      {lines[1] ? (
        <text
          x="8"
          y="208"
          className="fill-muted-foreground text-[7px]"
          textLength={lines[1].length > 78 ? 364 : undefined}
          lengthAdjust="spacingAndGlyphs"
        >
          {lines[1]}
        </text>
      ) : null}
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
