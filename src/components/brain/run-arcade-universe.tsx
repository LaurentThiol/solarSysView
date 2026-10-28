import type { RankKey, ThoughtDraw } from "@/lib/run-arcade/thought"

import { cn } from "@/lib/utils"

const PLOT = { l: 28, r: 268, t: 16, b: 168 }
const VIEW_W = 360
const VIEW_H = 200

function scales(thought: ThoughtDraw) {
  const x0 = -0.35
  const x1 = thought.xMax + 1.45
  const y0 = thought.yMin
  const y1 = thought.yMax
  const xSpan = x1 - x0 || 1
  const ySpan = y1 - y0 || 1
  const X = (x: number) => PLOT.l + ((x - x0) / xSpan) * (PLOT.r - PLOT.l)
  const Y = (y: number) => PLOT.b - ((y - y0) / ySpan) * (PLOT.b - PLOT.t)
  const radiusPx = Math.abs(Y(thought.radius.cy) - Y(thought.radius.cy + thought.radius.r))
  return { X, Y, radiusPx }
}

function line(x1: number, y1: number, x2: number, y2: number) {
  return `M ${x1} ${y1} L ${x2} ${y2}`
}

export function RunnerUniverse({
  runnerId,
  thought,
  matched,
  className,
}: {
  runnerId: string
  thought: ThoughtDraw | null
  matched?: readonly RankKey[]
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
        En attente du premier tour.
      </div>
    )
  }

  const { X, Y, radiusPx } = scales(thought)
  const trail = thought.trail.map((point) => `${X(point.x)},${Y(point.y)}`).join(" ")
  const markerId = `run-arcade-${runnerId}-head`
  const cx = X(thought.radius.cx)
  const cy = Y(thought.radius.cy)

  return (
    <svg
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      role="img"
      aria-label={thought.phrase}
      data-testid="runner-universe"
      className={cn("h-40 w-full", className)}
    >
      <defs>
        <marker
          id={markerId}
          viewBox="0 0 8 8"
          refX="7"
          refY="4"
          markerWidth="7"
          markerHeight="7"
          orient="auto"
        >
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
      <circle
        cx={cx}
        cy={cy}
        r={Math.max(4, radiusPx)}
        className="fill-chart-1/10 stroke-chart-1"
        strokeWidth="1.25"
      />
      <line
        x1={X(thought.spoke.x1)}
        y1={Y(thought.spoke.y1)}
        x2={X(thought.spoke.x2)}
        y2={Y(thought.spoke.y2)}
        className="stroke-chart-1"
        strokeWidth="1"
      />
      <path
        d={line(X(thought.tangent.x1), Y(thought.tangent.y1), X(thought.tangent.x2), Y(thought.tangent.y2))}
        className="stroke-chart-2"
        strokeWidth="1.2"
        strokeDasharray="4 3"
        fill="none"
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
        x1={X(thought.projection.x1)}
        y1={Y(thought.projection.y1)}
        x2={X(thought.projection.x2)}
        y2={Y(thought.projection.y2)}
        className="stroke-chart-4"
        strokeWidth="1.6"
        markerEnd={`url(#${markerId})`}
      />
      <circle cx={X(thought.projection.x2)} cy={Y(thought.projection.y2)} r="3.5" className="fill-chart-4" />
      <circle cx={cx} cy={cy} r="2.4" className="fill-foreground" />
      {thought.marks.map((mark, index) => {
        const hit = matched?.includes(mark.key) ?? false
        const y = 22 + index * 24
        return (
          <g key={mark.key}>
            <text x="292" y={y} className="fill-muted-foreground text-[10px]">
              {mark.key}
            </text>
            <text
              x="318"
              y={y}
              className={hit ? "fill-[var(--ok)] text-[11px] font-medium" : "fill-foreground text-[11px]"}
            >
              {mark.value}
            </text>
          </g>
        )
      })}
    </svg>
  )
}
