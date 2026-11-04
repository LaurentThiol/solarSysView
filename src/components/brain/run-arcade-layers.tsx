"use client"

import { memo, useRef, useState } from "react"

import { TitleHelp, type HelpCopy } from "@/components/help"
import { type RankKey, type RankPoint } from "@/lib/run-arcade/curves"
import {
  numberPhrase,
  numberStats,
  readFocus,
  readWindow,
  slotBands,
  starPhrase,
  starStats,
} from "@/lib/run-arcade/layers"
import { CURVE_VIEW_SPAN, curveWindow, slideByPointer, windowDraws } from "@/lib/run-arcade/window"
import type { PoolKind } from "@/lib/pronostic/bounds"
import { cn } from "@/lib/utils"

const PLOT = { l: 28, r: 360, t: 14, b: 156 }
const VIEW_W = 380
const VIEW_H = 176

type LayerStyle = {
  key: RankKey
  stroke: string
  fill: string
  dot: string
}

const NUMBER_LAYERS: LayerStyle[] = [
  { key: "n1", stroke: "stroke-chart-1", fill: "fill-chart-1", dot: "bg-chart-1" },
  { key: "n2", stroke: "stroke-chart-2", fill: "fill-chart-2", dot: "bg-chart-2" },
  { key: "n3", stroke: "stroke-chart-3", fill: "fill-chart-3", dot: "bg-chart-3" },
  { key: "n4", stroke: "stroke-chart-4", fill: "fill-chart-4", dot: "bg-chart-4" },
  { key: "n5", stroke: "stroke-chart-5", fill: "fill-chart-5", dot: "bg-chart-5" },
]

const STAR_LAYERS: LayerStyle[] = [
  { key: "e1", stroke: "stroke-chart-1", fill: "fill-chart-1", dot: "bg-chart-1" },
  { key: "e2", stroke: "stroke-chart-5", fill: "fill-chart-5", dot: "bg-chart-5" },
]

function axes(x0: number, x1: number, y0: number, y1: number) {
  const xSpan = x1 - x0 || 1
  const ySpan = y1 - y0 || 1
  const X = (x: number) => PLOT.l + ((x - x0) / xSpan) * (PLOT.r - PLOT.l)
  const Y = (y: number) => PLOT.b - ((y - y0) / ySpan) * (PLOT.b - PLOT.t)
  return { X, Y }
}

function LayerToggles({
  layers,
  hidden,
  onToggle,
  label,
}: {
  layers: readonly LayerStyle[]
  hidden: ReadonlySet<RankKey>
  onToggle: (key: RankKey) => void
  label: string
}) {
  return (
    <div className="mb-1 flex flex-wrap gap-1" role="group" aria-label={label}>
      {layers.map((layer) => {
        const off = hidden.has(layer.key)
        return (
          <button
            key={layer.key}
            type="button"
            aria-pressed={!off}
            data-testid={`layer-toggle-${layer.key}`}
            onClick={() => onToggle(layer.key)}
            className={cn(
              "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px]",
              off ? "border-border text-muted-foreground" : "border-foreground/30 text-foreground"
            )}
          >
            <span className={cn("h-2 w-2 rounded-full", off ? "bg-muted-foreground" : layer.dot)} />
            {layer.key}
          </button>
        )
      })}
    </div>
  )
}

function LayerPlot({
  testId,
  label,
  points,
  layers,
  hidden,
  kind,
  y0,
  y1,
  x0,
  x1,
  focusIndex,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
}: {
  testId: string
  label: string
  points: readonly RankPoint[]
  layers: readonly LayerStyle[]
  hidden: ReadonlySet<RankKey>
  kind: PoolKind
  y0: number
  y1: number
  x0: number
  x1: number
  focusIndex: number
  onPointerDown: (event: React.PointerEvent<SVGSVGElement>) => void
  onPointerMove: (event: React.PointerEvent<SVGSVGElement>) => void
  onPointerUp: (event: React.PointerEvent<SVGSVGElement>) => void
  onPointerCancel: () => void
}) {
  const { X, Y } = axes(x0, x1, y0, y1)
  const bands = slotBands(kind)
  const visible = layers.filter((layer) => !hidden.has(layer.key))
  const shown = points.map((point, index) => ({ point, index }))
  const clipId = `${testId}-clip`

  return (
    <svg
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      role="img"
      aria-label={label}
      data-testid={testId}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      className="h-52 w-full cursor-pointer touch-none select-none"
    >
      <defs>
        <clipPath id={clipId}>
          <rect x={PLOT.l} y={PLOT.t - 4} width={PLOT.r - PLOT.l} height={PLOT.b - PLOT.t + 8} />
        </clipPath>
      </defs>
      <rect x="0" y="0" width={VIEW_W} height={VIEW_H} className="fill-canvas" rx="8" />
      <text x="4" y={Y(y1) + 8} className="fill-muted-foreground text-[8px]">
        {y1}
      </text>
      <text x="4" y={Y(y0)} className="fill-muted-foreground text-[8px]">
        {y0}
      </text>
      <g clipPath={`url(#${clipId})`}>
        {bands.map((band, index) => {
          const layer = layers[index]
          if (!layer || hidden.has(layer.key)) return null
          return (
            <g key={layer.key} data-band={layer.key} className="opacity-35">
              <line x1={PLOT.l} x2={PLOT.r} y1={Y(band.lo)} y2={Y(band.lo)} className={layer.stroke} strokeWidth="0.6" />
              <line x1={PLOT.l} x2={PLOT.r} y1={Y(band.hi)} y2={Y(band.hi)} className={layer.stroke} strokeWidth="0.6" />
            </g>
          )
        })}
        {shown.map(({ point, index }) => {
          if (visible.length < 2 || index === focusIndex) return null
          const coords = visible.map((layer) => `${X(index)},${Y(point[layer.key])}`).join(" ")
          return (
            <polyline
              key={point.date}
              points={coords}
              fill="none"
              data-profile={point.date}
              className="stroke-muted-foreground"
              strokeWidth="0.7"
            />
          )
        })}
        {visible.map((layer) => (
          <polyline
            key={layer.key}
            points={shown.map(({ point, index }) => `${X(index)},${Y(point[layer.key])}`).join(" ")}
            fill="none"
            data-layer={layer.key}
            className={layer.stroke}
            strokeWidth="1.5"
          >
            <title>{layer.key}</title>
          </polyline>
        ))}
        {focusIndex >= 0 && focusIndex < points.length ? (
          <g data-focus={points[focusIndex]?.date}>
            <line
              x1={X(focusIndex)}
              x2={X(focusIndex)}
              y1={PLOT.t}
              y2={PLOT.b}
              className="stroke-chart-4/50"
              strokeWidth="1"
            />
            {visible.length >= 2 ? (
              <polyline
                points={visible.map((layer) => `${X(focusIndex)},${Y(points[focusIndex][layer.key])}`).join(" ")}
                fill="none"
                data-profile={points[focusIndex].date}
                className="stroke-chart-4"
                strokeWidth="1.7"
              />
            ) : null}
            {visible.map((layer) => (
              <circle
                key={layer.key}
                cx={X(focusIndex)}
                cy={Y(points[focusIndex][layer.key])}
                r="2.6"
                className={cn(layer.fill, "stroke-canvas")}
                strokeWidth="1"
              />
            ))}
          </g>
        ) : null}
      </g>
    </svg>
  )
}

function RunArcadeLayersView({ points, help }: { points: readonly RankPoint[]; help: HelpCopy }) {
  const signature = `${points.length}:${points[0]?.date ?? ""}:${points.at(-1)?.date ?? ""}`
  const [parkedOn, setParkedOn] = useState(signature)
  const [start, setStart] = useState<number | null>(null)
  const [chosen, setChosen] = useState<number | null>(null)
  const [hiddenList, setHiddenList] = useState<RankKey[]>([])
  const drag = useRef<{ id: number; x: number; start: number; steps: number; travel: number; moved: boolean } | null>(
    null
  )
  const parked = parkedOn === signature
  if (!parked) {
    setParkedOn(signature)
    setStart(null)
    setChosen(null)
  }
  const activeStart = parked ? start : null
  const activeChosen = parked ? chosen : null
  const hidden = new Set(hiddenList)

  const view = curveWindow(Math.max(0, points.length - 1), activeStart)
  const draws = windowDraws(view.x0, view.x1, points.length)
  const frameFirst = draws.first > 0 ? draws.first - 1 : 0
  const frameLast = draws.last > 0 ? draws.last - 1 : 0
  const focusIndex =
    activeChosen != null && activeChosen >= frameFirst && activeChosen <= frameLast ? activeChosen : frameLast
  const visible = points.slice(frameFirst, frameLast + 1)
  const reading = readWindow(visible)
  const focus = points.length > 0 ? readFocus(points, focusIndex) : null
  const latest = focusIndex === frameLast
  const atEnd = view.start >= view.steps

  function park(next: number) {
    setStart(next >= view.steps ? null : next)
  }

  function toggle(key: RankKey) {
    setHiddenList((current) => (current.includes(key) ? current.filter((item) => item !== key) : [...current, key]))
  }

  function indexAt(svg: SVGSVGElement, clientX: number) {
    const rect = svg.getBoundingClientRect()
    if (rect.width < 1 || points.length === 0) return 0
    const x = ((clientX - rect.left) / rect.width) * VIEW_W
    const span = view.x1 - view.x0 || 1
    const dataX = view.x0 + ((x - PLOT.l) / (PLOT.r - PLOT.l)) * span
    return Math.min(points.length - 1, Math.max(0, Math.round(dataX)))
  }

  function onPointerDown(event: React.PointerEvent<SVGSVGElement>) {
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
      // Le pointeur n’est pas capturable : le clic choisit quand même la colonne.
    }
  }

  function onPointerMove(event: React.PointerEvent<SVGSVGElement>) {
    const session = drag.current
    if (!session || session.id !== event.pointerId || !view.sliding) return
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
    if (session.moved) return
    const index = indexAt(event.currentTarget, event.clientX)
    if (index >= frameFirst && index <= frameLast) setChosen(index)
  }

  const numbersLabel = focus ? numberPhrase(reading, focus, latest) : "Numéros"
  const starsLabel = focus ? starPhrase(reading, focus, latest) : "Étoiles"

  return (
    <section
      className="rounded-xl border bg-card p-3"
      data-testid="run-arcade-layers"
      data-count={points.length}
      data-last={points.at(-1)?.date ?? ""}
      data-window={points.length > 0 ? `${draws.first}-${draws.last}` : "0-0"}
    >
      <header className="mb-2">
        <h2 className="text-sm font-medium">
          <TitleHelp help={help}>Couches</TitleHelp>
        </h2>
        <p className="text-xs text-muted-foreground">Mêmes tirages, deux échelles. Le trait vertical est le profil.</p>
      </header>
      {points.length === 0 || !focus ? (
        <div className="flex h-40 items-center justify-center rounded-lg border border-dashed border-border text-xs text-muted-foreground">
          En attente des tirages.
        </div>
      ) : (
        <>
          <div className="grid gap-3 lg:grid-cols-2">
            <div data-testid="layers-numbers-card">
              <h3 className="mb-1 text-xs font-medium">n1 à n5</h3>
              <LayerToggles layers={NUMBER_LAYERS} hidden={hidden} onToggle={toggle} label="Couches des numéros" />
              <LayerPlot
                testId="layers-numbers"
                label={numbersLabel}
                points={points}
                layers={NUMBER_LAYERS}
                hidden={hidden}
                kind="numbers"
                y0={1}
                y1={50}
                x0={view.x0}
                x1={view.x1}
                focusIndex={focusIndex}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={() => {
                  drag.current = null
                }}
              />
              <p className="mt-2 text-sm leading-5" data-testid="layers-phrase-numbers" data-focus={focus.point.date}>
                {numbersLabel}
              </p>
              <p className="text-xs text-muted-foreground" data-testid="layers-stats-numbers">
                {numberStats(reading)}
              </p>
            </div>
            <div data-testid="layers-stars-card">
              <h3 className="mb-1 text-xs font-medium">e1 et e2</h3>
              <LayerToggles layers={STAR_LAYERS} hidden={hidden} onToggle={toggle} label="Couches des étoiles" />
              <LayerPlot
                testId="layers-stars"
                label={starsLabel}
                points={points}
                layers={STAR_LAYERS}
                hidden={hidden}
                kind="stars"
                y0={1}
                y1={12}
                x0={view.x0}
                x1={view.x1}
                focusIndex={focusIndex}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={() => {
                  drag.current = null
                }}
              />
              <p className="mt-2 text-sm leading-5" data-testid="layers-phrase-stars" data-focus={focus.point.date}>
                {starsLabel}
              </p>
              <p className="text-xs text-muted-foreground" data-testid="layers-stats-stars">
                {starStats(reading)}
              </p>
            </div>
          </div>
          <div className="mt-2 flex items-center gap-2" data-testid="layers-slide">
            <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground" data-testid="layers-slide-label">
              {draws.first}–{draws.last}
              <span className="text-muted-foreground/70"> sur {draws.total}</span>
            </span>
            {view.sliding ? (
              <>
                <input
                  type="range"
                  min={0}
                  max={view.steps}
                  step={1}
                  value={view.start}
                  aria-label="Déplacer les deux fenêtres le long des tirages"
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
                  onClick={() => {
                    setStart(null)
                    setChosen(null)
                  }}
                  className="shrink-0 text-[10px] text-chart-4 disabled:text-muted-foreground"
                >
                  Au bout
                </button>
              </>
            ) : null}
          </div>
        </>
      )}
    </section>
  )
}

export const RunArcadeLayers = memo(RunArcadeLayersView)
