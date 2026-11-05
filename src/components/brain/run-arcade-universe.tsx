"use client"

import { memo, useRef, useState } from "react"

import { curveLabel, RAIL_LEFT, RAIL_RIGHT, type CurveKey } from "@/lib/run-arcade/curves"
import { gesturePhrase } from "@/lib/run-arcade/skills"
import type { VersionStroke } from "@/lib/run-arcade/strokes"
import { formatCents, type CurveMask, type RailMark, type ThoughtDraw } from "@/lib/run-arcade/thought"
import { CURVE_VIEW_SPAN, curveWindow, slideByPointer, windowDraws } from "@/lib/run-arcade/window"

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

function scales(thought: ThoughtDraw, x0: number, x1: number) {
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
  const rawLeft = Math.min(X(mask.x1), X(mask.x2))
  const rawRight = Math.max(X(mask.x1), X(mask.x2))
  if (rawRight < PLOT.l || rawLeft > PLOT.r) return null
  let left = rawLeft
  let right = rawRight
  if (right - left < MASK_MIN) {
    const mid = (left + right) / 2
    left = mid - MASK_MIN / 2
    right = mid + MASK_MIN / 2
  }
  left = Math.max(PLOT.l, left)
  right = Math.min(PLOT.r, right)
  if (right - left < 1) return null
  const top = Y(yMax)
  const height = Math.max(1, Y(yMin) - top)
  return { left, width: right - left, top, height }
}

function railTone(key: CurveKey, matched: readonly CurveKey[], exact: readonly CurveKey[]) {
  if (matched.includes(key)) return "fill-[var(--ok)] font-medium"
  if (exact.includes(key)) return "fill-chart-2 font-medium"
  return "fill-foreground"
}

/** Élargit le cadre si une pointe de version sort de la série déjà dessinée. */
function frameThought(thought: ThoughtDraw, versions: readonly VersionStroke[], thoughtTip: number) {
  const ys = [thought.yMin, thought.yMax, thoughtTip, ...versions.map((item) => item.tip)]
  const lo = Math.min(...ys)
  const hi = Math.max(...ys)
  if (lo >= thought.yMin && hi <= thought.yMax) return thought
  const span = Math.max(hi - lo, 1)
  const pad = Math.max(0.8, span * 0.08)
  return { ...thought, yMin: lo - pad, yMax: hi + pad }
}

function RunnerUniverseView({
  runnerId,
  thought,
  matched = [],
  exact = [],
  className,
  pan = true,
  onPress,
  versions = null,
  thoughtTip = null,
}: {
  runnerId: string
  thought: ThoughtDraw | null
  matched?: readonly CurveKey[]
  exact?: readonly CurveKey[]
  className?: string
  /** Curseur et glisser. Le dessin envoyé à l’IA reste calé sur le bout, sans curseur. */
  pan?: boolean
  /** Clic sur le trait, sans compter un glisser. */
  onPress?: () => void
  /** Une ligne par version encore en vie. Absent : le vecteur unique. */
  versions?: readonly VersionStroke[] | null
  /** Pensée : moyenne pondérée de ces pointes. */
  thoughtTip?: number | null
}) {
  const focusKey = `${runnerId}:${thought?.focus ?? ""}`
  const [parkedOn, setParkedOn] = useState(focusKey)
  const [start, setStart] = useState<number | null>(null)
  if (parkedOn !== focusKey) {
    setParkedOn(focusKey)
    setStart(null)
  }
  const drag = useRef<{ id: number; x: number; start: number; steps: number; travel: number; moved: boolean } | null>(
    null
  )

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

  const versionList = versions ?? []
  const blended = versionList.length > 0 && thoughtTip != null && Number.isFinite(thoughtTip) ? thoughtTip : null
  const framed = blended != null ? frameThought(thought, versionList, blended) : thought
  const view = curveWindow(framed.xMax, start)
  const { X, Y, radiusPx } = scales(framed, view.x0, view.x1)
  const trail = framed.trail.map((point) => `${X(point.x)},${Y(point.y)}`).join(" ")
  const lines = observationLines(thought.observation)
  const markerId = `run-arcade-${runnerId}-head`
  const cx = X(thought.radius.cx)
  const cy = Y(thought.radius.cy)
  const marks = new Map<CurveKey, RailMark>(thought.marks.map((mark) => [mark.key, mark]))
  const caseX = X(thought.projection.x)
  const caseY = Y(thought.projection.y)
  const draws = windowDraws(view.x0, view.x1, thought.trail.length)
  const canPan = pan && view.sliding
  const atEnd = view.start >= view.steps

  function park(next: number) {
    setStart(next >= view.steps ? null : next)
  }

  function onPointerDown(event: React.PointerEvent<SVGSVGElement>) {
    if (!canPan) return
    drag.current = {
      id: event.pointerId,
      x: event.clientX,
      start: view.start,
      steps: view.steps,
      travel: view.travel,
      moved: false,
    }
    try {
      event.currentTarget.setPointerCapture(event.pointerId)
    } catch {
      // Le pointeur n’est pas capturable : le glisser suit quand même les mouvements sur le dessin.
    }
  }

  function onPointerMove(event: React.PointerEvent<SVGSVGElement>) {
    const session = drag.current
    if (!session || session.id !== event.pointerId) return
    const dx = event.clientX - session.x
    if (Math.abs(dx) <= 4) return
    session.moved = true
    const width = event.currentTarget.getBoundingClientRect().width
    const plotPx = (width * (PLOT.r - PLOT.l)) / VIEW_W
    park(
      slideByPointer({
        start: session.start,
        steps: session.steps,
        travel: session.travel,
        span: CURVE_VIEW_SPAN,
        dx,
        plotPx,
      })
    )
  }

  function onPointerUp(event: React.PointerEvent<SVGSVGElement>) {
    const session = drag.current
    if (!session || session.id !== event.pointerId) return
    drag.current = null
    if (!session.moved) onPress?.()
  }

  return (
    <div className="w-full">
      <svg
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        role="img"
        aria-label={thought.phrase}
        data-testid="runner-universe"
        data-runner-universe={runnerId}
        data-sliding={view.sliding ? "oui" : "non"}
        data-window={`${draws.first}-${draws.last}`}
        onPointerDown={canPan ? onPointerDown : undefined}
        onPointerMove={canPan ? onPointerMove : undefined}
        onPointerUp={canPan ? onPointerUp : undefined}
        onPointerCancel={() => {
          drag.current = null
        }}
        onClick={canPan ? undefined : onPress}
        className={cn("h-40 w-full", canPan && "cursor-grab touch-none select-none", className)}
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
          <clipPath id={`${markerId}-plot`}>
            <rect x={PLOT.l} y={4} width={PLOT.r - PLOT.l} height={172} />
          </clipPath>
        </defs>
        <rect x="0" y="0" width={VIEW_W} height={VIEW_H} className="fill-canvas" rx="8" />
        <g clipPath={`url(#${markerId}-plot)`}>
          <polyline points={trail} className="stroke-foreground" strokeWidth="1.6" fill="none" data-testid="runner-curve" />
          {[...thought.masks].sort((a, b) => Number(a.drives) - Number(b.drives)).map((mask) => {
            const box = maskBox(mask, X, Y, framed.yMin, framed.yMax)
            if (!box) return null
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
                <title>{`${mask.name} · ${gesturePhrase(mask.gesture)} · ${mask.drives ? "pose la pensée" : "autre masque"}${mask.cents == null ? "" : ` · ${formatCents(mask.cents)}`} · tirages ${mask.x1 + 1}–${mask.x2 + 1}`}</title>
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
            {blended != null ? (
              <g data-testid="runner-version-strokes">
                {versionList.map((item) => {
                  const dashed = item.weight <= 0
                  const tipText = `pointe ${formatValue(item.tip)} · poids ${item.label}`
                  return (
                    <g key={item.id}>
                      <line
                        x1={X(thought.vector.x1)}
                        y1={Y(thought.vector.y1)}
                        x2={X(thought.vector.x2)}
                        y2={Y(item.tip)}
                        stroke="transparent"
                        strokeWidth="6"
                      >
                        <title>{tipText}</title>
                      </line>
                      <line
                        x1={X(thought.vector.x1)}
                        y1={Y(thought.vector.y1)}
                        x2={X(thought.vector.x2)}
                        y2={Y(item.tip)}
                        className={dashed ? "stroke-muted-foreground" : "stroke-chart-4"}
                        strokeWidth="0.9"
                        strokeDasharray={dashed ? "3 2" : undefined}
                        data-testid="runner-version-stroke"
                        data-name={item.name}
                        data-gesture={item.gesture}
                        data-tip={item.tip}
                        data-weight={item.weight}
                        data-dashed={dashed ? "oui" : "non"}
                      >
                        <title>{tipText}</title>
                      </line>
                      <circle
                        cx={X(thought.vector.x2)}
                        cy={Y(item.tip)}
                        r="2.2"
                        className={dashed ? "fill-muted-foreground" : "fill-chart-4"}
                      >
                        <title>{tipText}</title>
                      </circle>
                    </g>
                  )
                })}
                <line
                  x1={X(thought.vector.x1)}
                  y1={Y(thought.vector.y1)}
                  x2={X(thought.vector.x2)}
                  y2={Y(blended)}
                  className="stroke-chart-4"
                  strokeWidth="2.6"
                  markerEnd={`url(#${markerId})`}
                  data-testid="runner-thought-stroke"
                  data-tip={blended}
                >
                  <title>{`pensée ${formatValue(blended)}`}</title>
                </line>
                {Math.abs(thought.projection.y - blended) >= 0.5 ? (
                  <line
                    x1={X(thought.vector.x2)}
                    y1={Y(blended)}
                    x2={X(thought.projection.x)}
                    y2={Y(thought.projection.y)}
                    className="stroke-muted-foreground"
                    strokeWidth="0.9"
                    strokeDasharray="2 2"
                    data-testid="runner-recall"
                  />
                ) : null}
              </g>
            ) : (
              <>
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
              </>
            )}
          </g>
          {caseX > PLOT.l && caseX < PLOT.r ? (
            <line x1={caseX} y1={caseY} x2={PLOT.r} y2={caseY} className="stroke-chart-4/50" strokeWidth="0.8" strokeDasharray="1 3" />
          ) : null}
          <circle cx={caseX} cy={caseY} r="3.6" className="fill-canvas stroke-chart-4" strokeWidth="1.6" />
          <circle cx={caseX} cy={caseY} r="1.6" className="fill-chart-4" />
          {caseX > PLOT.l && caseX < PLOT.r ? (
            <text x={Math.min(caseX, PLOT.r - 2)} y={caseY - 4} textAnchor="end" className="fill-chart-4 text-[9px]">
              {formatValue(thought.projection.y)}
            </text>
          ) : null}
          <circle cx={cx} cy={cy} r="2.4" className="fill-foreground" />
        </g>
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
                <title>{`${curveLabel(key)} : pensée ${formatValue(blended != null && key === thought.focus ? blended : mark.thought)} · case ${mark.value}`}</title>
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
      {canPan ? (
        <div
          className="mt-1 flex items-center gap-2"
          data-testid="runner-slide"
          data-curve-slide=""
          onPointerDown={(event) => event.stopPropagation()}
        >
          <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground" data-testid="runner-slide-label">
            {draws.first}–{draws.last}
            <span className="text-muted-foreground/70"> sur {draws.total}</span>
          </span>
          <input
            type="range"
            min={0}
            max={view.steps}
            step={1}
            value={view.start}
            aria-label="Déplacer le cadre le long de la courbe"
            aria-valuemin={0}
            aria-valuemax={view.steps}
            aria-valuenow={view.start}
            aria-valuetext={`tirages ${draws.first} à ${draws.last} sur ${draws.total}`}
            className="h-4 min-w-0 flex-1 cursor-ew-resize appearance-none bg-transparent [&::-moz-range-thumb]:h-3.5 [&::-moz-range-thumb]:w-3.5 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-chart-4 [&::-moz-range-track]:h-1 [&::-moz-range-track]:rounded-full [&::-moz-range-track]:bg-border [&::-webkit-slider-runnable-track]:h-1 [&::-webkit-slider-runnable-track]:rounded-full [&::-webkit-slider-runnable-track]:bg-border [&::-webkit-slider-thumb]:mt-[-5px] [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-chart-4"
            onChange={(event) => park(Number(event.target.value))}
          />
          <button
            type="button"
            disabled={atEnd}
            onClick={() => setStart(null)}
            className="shrink-0 text-[10px] text-chart-4 disabled:text-muted-foreground"
            title="Revenir au bout de la courbe"
          >
            Au bout
          </button>
        </div>
      ) : null}
    </div>
  )
}

/**
 * Mémoïsé : un runner ne redessine que quand sa pensée (ou ses cases) change.
 * Les autres entrées sont des primitives ou des références stables entre événements étrangers.
 */
export const RunnerUniverse = memo(RunnerUniverseView)
