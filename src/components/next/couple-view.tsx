"use client"

import { useEffect, useId, useMemo, useRef, useState } from "react"

import { HelpTip } from "@/components/help"
import { Button } from "@/components/ui/button"
import {
  COUPLE_EDGE_LIMIT,
  linksTouching,
  type BallPoint,
  type CoupleLink,
  type CoupleSchema,
} from "@/lib/next/couple"
import {
  clampCamera,
  DEFAULT_CAMERA,
  projectPoint,
  zoomToward,
  type Camera,
} from "@/lib/relief/project"
import { cn } from "@/lib/utils"

type LayoutPoint = BallPoint & { px: number; py: number }

function planeLayout(points: readonly BallPoint[]): LayoutPoint[] {
  const active = points.filter((point) => point.appearances > 0)
  if (!active.length) return []
  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity
  for (const point of active) {
    minX = Math.min(minX, point.x)
    maxX = Math.max(maxX, point.x)
    minY = Math.min(minY, point.y)
    maxY = Math.max(maxY, point.y)
  }
  const spanX = Math.max(maxX - minX, 1e-9)
  const spanY = Math.max(maxY - minY, 1e-9)
  const span = Math.max(spanX, spanY)
  const pad = 8
  const size = 100 - pad * 2
  const ox = (span - spanX) / 2
  const oy = (span - spanY) / 2
  return active.map((point) => ({
    ...point,
    px: pad + ((point.x - minX + ox) / span) * size,
    py: pad + ((maxY - point.y + oy) / span) * size,
  }))
}

function worldOf(points: readonly BallPoint[]) {
  const active = points.filter((point) => point.appearances > 0)
  if (!active.length) return []
  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity
  let minZ = Infinity
  let maxZ = -Infinity
  for (const point of active) {
    minX = Math.min(minX, point.x)
    maxX = Math.max(maxX, point.x)
    minY = Math.min(minY, point.y)
    maxY = Math.max(maxY, point.y)
    minZ = Math.min(minZ, point.z)
    maxZ = Math.max(maxZ, point.z)
  }
  const span = Math.max(maxX - minX, maxY - minY, maxZ - minZ, 1e-6)
  const scale = 72 / span
  const midX = (minX + maxX) / 2
  const midY = (minY + maxY) / 2
  const midZ = (minZ + maxZ) / 2
  return active.map((point) => ({
    ...point,
    x: (point.x - midX) * scale,
    y: (point.y - midY) * scale,
    z: (point.z - midZ) * scale,
  }))
}

function edgeStrength(link: CoupleLink, maxAffinity: number) {
  if (maxAffinity <= 0) return 0.35
  return 0.28 + 0.72 * (link.affinity / maxAffinity)
}

export function CouplePlane({
  schema,
  active,
  onSelect,
}: {
  schema: CoupleSchema
  active: readonly number[]
  onSelect: (ball: number | null) => void
}) {
  const titleId = useId()
  const laid = useMemo(() => planeLayout(schema.points), [schema.points])
  const at = useMemo(() => new Map(laid.map((point) => [point.ball, point])), [laid])
  const activeSet = useMemo(() => new Set(active), [active])
  const maxAffinity = schema.edges[0]?.affinity ?? 0
  const incident = useMemo(() => {
    const keys = new Set<string>()
    for (const ball of active) {
      for (const link of linksTouching(schema.links, ball)) keys.add(`${link.a}-${link.b}`)
    }
    return keys
  }, [active, schema.links])

  return (
    <figure className="flex min-w-0 flex-col gap-2 rounded-xl border border-border bg-card/40 p-3">
      <figcaption id={titleId} className="text-sm font-medium">
        Plan
      </figcaption>
      {laid.length === 0 ? (
        <p className="py-16 text-center text-sm text-muted-foreground">Aucune boule sortie dans cette fenêtre.</p>
      ) : (
        <svg
          viewBox="0 0 100 100"
          className="h-[28rem] w-full touch-manipulation text-foreground"
          role="group"
          aria-labelledby={titleId}
        >
          <rect width="100" height="100" fill="transparent" onClick={() => onSelect(null)} />
          {schema.edges.map((link) => {
            const key = `${link.a}-${link.b}`
            if (incident.has(key)) return null
            const left = at.get(link.a)
            const right = at.get(link.b)
            if (!left || !right) return null
            return (
              <line
                key={key}
                x1={left.px}
                y1={left.py}
                x2={right.px}
                y2={right.py}
                className="stroke-foreground"
                strokeOpacity={edgeStrength(link, maxAffinity) * 0.55}
                strokeWidth={0.22 + edgeStrength(link, maxAffinity) * 0.35}
              />
            )
          })}
          {schema.links.map((link) => {
            const key = `${link.a}-${link.b}`
            if (!incident.has(key)) return null
            const left = at.get(link.a)
            const right = at.get(link.b)
            if (!left || !right) return null
            return (
              <line
                key={`hot-${key}`}
                x1={left.px}
                y1={left.py}
                x2={right.px}
                y2={right.py}
                className="stroke-primary"
                strokeOpacity={0.95}
                strokeWidth={0.7}
              />
            )
          })}
          {laid.map((point) => {
            const on = activeSet.has(point.ball)
            return (
              <g key={point.ball}>
                <circle
                  cx={point.px}
                  cy={point.py}
                  r={on ? 3.5 : 2.7}
                  className={on ? "fill-primary" : "fill-foreground"}
                />
                <text
                  x={point.px}
                  y={point.py}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fontSize={on ? 2.5 : 2.15}
                  className={cn(
                    "pointer-events-none font-medium",
                    on ? "fill-primary-foreground" : "fill-background"
                  )}
                >
                  {point.ball}
                </text>
                <circle
                  cx={point.px}
                  cy={point.py}
                  r={4.2}
                  fill="transparent"
                  className="cursor-pointer"
                  role="button"
                  tabIndex={0}
                  aria-label={`Boule ${point.ball}`}
                  aria-pressed={on}
                  onClick={(event) => {
                    event.stopPropagation()
                    onSelect(point.ball)
                  }}
                  onKeyDown={(event) => {
                    if (event.key !== "Enter" && event.key !== " ") return
                    event.preventDefault()
                    onSelect(point.ball)
                  }}
                />
              </g>
            )
          })}
        </svg>
      )}
    </figure>
  )
}

export function CoupleVolume({
  schema,
  active,
  onSelect,
}: {
  schema: CoupleSchema
  active: readonly number[]
  onSelect: (ball: number | null) => void
}) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const cameraRef = useRef<Camera>(DEFAULT_CAMERA)
  const [camera, setCamera] = useState<Camera>(DEFAULT_CAMERA)
  const world = useMemo(() => worldOf(schema.points), [schema.points])
  const hasCloud = world.length > 0

  useEffect(() => {
    cameraRef.current = camera
  }, [camera])

  useEffect(() => {
    const canvas = canvasRef.current
    const wrap = wrapRef.current
    if (!canvas || !wrap) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const paint = () => {
      const width = wrap.clientWidth
      const height = wrap.clientHeight
      if (width < 2 || height < 2) return
      const dpr = window.devicePixelRatio || 1
      canvas.width = Math.round(width * dpr)
      canvas.height = Math.round(height * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      const style = getComputedStyle(wrap)
      const fg = style.getPropertyValue("--foreground").trim() || "#f4f1e8"
      const primary = style.getPropertyValue("--primary").trim() || "#e6c56a"
      const ink = style.getPropertyValue("--background").trim() || "#1a2233"
      const primaryInk = style.getPropertyValue("--primary-foreground").trim() || ink
      ctx.clearRect(0, 0, width, height)
      ctx.fillStyle = style.getPropertyValue("--canvas").trim() || "#1c2436"
      ctx.fillRect(0, 0, width, height)

      const scale = Math.min(width, height) * 0.011
      const cx = width / 2
      const cy = height / 2
      const cam = camera
      const placed = new Map(
        world.map((point) => {
          const projected = projectPoint(point.x, point.y, point.z, cam, cx, cy, scale)
          return [point.ball, { ...point, ...projected }] as const
        })
      )
      const activeSet = new Set(active)
      const maxAffinity = schema.edges[0]?.affinity ?? 0
      const incident = new Set<string>()
      for (const ball of active) {
        for (const link of linksTouching(schema.links, ball)) incident.add(`${link.a}-${link.b}`)
      }

      const strokeEdge = (link: CoupleLink, hot: boolean) => {
        const left = placed.get(link.a)
        const right = placed.get(link.b)
        if (!left || !right) return
        ctx.beginPath()
        ctx.moveTo(left.x, left.y)
        ctx.lineTo(right.x, right.y)
        ctx.strokeStyle = hot ? primary : fg
        ctx.globalAlpha = hot ? 0.95 : edgeStrength(link, maxAffinity) * 0.45
        ctx.lineWidth = hot ? 2.2 : 0.6 + edgeStrength(link, maxAffinity) * 1.4
        ctx.stroke()
        ctx.globalAlpha = 1
      }
      for (const link of schema.edges) {
        if (!incident.has(`${link.a}-${link.b}`)) strokeEdge(link, false)
      }
      for (const link of schema.links) {
        if (incident.has(`${link.a}-${link.b}`)) strokeEdge(link, true)
      }

      const ordered = [...placed.values()].sort((left, right) => right.depth - left.depth)
      const hits: { ball: number; x: number; y: number; r: number }[] = []
      for (const point of ordered) {
        const on = activeSet.has(point.ball)
        const radius = on ? 13 : 10
        ctx.beginPath()
        ctx.arc(point.x, point.y, radius, 0, Math.PI * 2)
        ctx.fillStyle = on ? primary : fg
        ctx.fill()
        ctx.fillStyle = on ? primaryInk : ink
        ctx.font = `${on ? 11 : 10}px sans-serif`
        ctx.textAlign = "center"
        ctx.textBaseline = "middle"
        ctx.fillText(String(point.ball), point.x, point.y + 0.5)
        hits.push({ ball: point.ball, x: point.x, y: point.y, r: radius + 4 })
      }
      canvas.dataset.hits = JSON.stringify(hits)
    }

    paint()
    const observer = new ResizeObserver(paint)
    observer.observe(wrap)
    return () => observer.disconnect()
  }, [active, camera, hasCloud, schema.edges, schema.links, world])

  useEffect(() => {
    const node = canvasRef.current
    if (!node) return
    const onWheel = (event: WheelEvent) => {
      event.preventDefault()
      const rect = node.getBoundingClientRect()
      setCamera((prev) =>
        zoomToward(
          prev,
          event.deltaY < 0 ? 1.08 : 0.92,
          event.clientX - rect.left,
          event.clientY - rect.top,
          rect.width / 2,
          rect.height / 2
        )
      )
    }
    node.addEventListener("wheel", onWheel, { passive: false })
    return () => node.removeEventListener("wheel", onWheel)
  }, [hasCloud])

  const dragRef = useRef<{ x: number; y: number; yaw: number; pitch: number; moved: boolean } | null>(null)

  function pick(clientX: number, clientY: number) {
    const canvas = canvasRef.current
    if (!canvas?.dataset.hits) return null
    const rect = canvas.getBoundingClientRect()
    const x = clientX - rect.left
    const y = clientY - rect.top
    const hits = JSON.parse(canvas.dataset.hits) as { ball: number; x: number; y: number; r: number }[]
    let best: { ball: number; d: number } | null = null
    for (let index = hits.length - 1; index >= 0; index -= 1) {
      const hit = hits[index]
      const d = Math.hypot(hit.x - x, hit.y - y)
      if (d <= hit.r && (!best || d < best.d)) best = { ball: hit.ball, d }
    }
    return best?.ball ?? null
  }

  return (
    <figure className="flex min-w-0 flex-col gap-2 rounded-xl border border-border bg-card/40 p-3">
      <figcaption className="flex items-center justify-between gap-2 text-sm font-medium">
        <span>Volume</span>
        <Button
          type="button"
          size="xs"
          variant="outline"
          onClick={() => setCamera(DEFAULT_CAMERA)}
        >
          Recadrer
        </Button>
      </figcaption>
      {world.length === 0 ? (
        <p className="flex h-[28rem] items-center justify-center text-center text-sm text-muted-foreground">
          Aucune boule sortie dans cette fenêtre.
        </p>
      ) : (
        <div ref={wrapRef} className="relative h-[28rem] overflow-hidden rounded-lg bg-canvas">
        <canvas
          ref={canvasRef}
          className="absolute inset-0 block h-full w-full cursor-grab touch-none outline-none active:cursor-grabbing"
          aria-label="Schéma 3D des boules. Glisser pour tourner, molette pour zoomer."
          onContextMenu={(event) => event.preventDefault()}
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId)
            const cam = cameraRef.current
            dragRef.current = {
              x: event.clientX,
              y: event.clientY,
              yaw: cam.yaw,
              pitch: cam.pitch,
              moved: false,
            }
          }}
          onPointerMove={(event) => {
            const drag = dragRef.current
            if (!drag) return
            const dx = event.clientX - drag.x
            const dy = event.clientY - drag.y
            if (Math.hypot(dx, dy) > 4) drag.moved = true
            setCamera(
              clampCamera({
                ...cameraRef.current,
                yaw: drag.yaw + dx * 0.0075,
                pitch: drag.pitch - dy * 0.0055,
              })
            )
          }}
          onPointerUp={(event) => {
            const drag = dragRef.current
            dragRef.current = null
            if (!drag || drag.moved) return
            onSelect(pick(event.clientX, event.clientY))
          }}
          onPointerCancel={() => {
            dragRef.current = null
          }}
        />
        </div>
      )}
      <p className="text-xs text-muted-foreground">Glisser pour tourner. Molette pour zoomer.</p>
    </figure>
  )
}

export function CoupleStress({ stress }: { stress: number | null }) {
  const label =
    stress == null
      ? "—"
      : stress.toLocaleString("fr-FR", { minimumFractionDigits: 3, maximumFractionDigits: 3 })
  return (
    <p className="inline-flex items-center gap-1 text-xs tabular-nums text-muted-foreground">
      Stress {label}
      <HelpTip
        title="Stress"
        body={`Écart entre les distances du volume (3 axes) et les distances observées 1/(1+poids). 0 serait un dessin exact de cette matrice. Les ${COUPLE_EDGE_LIMIT} traits sont les couples de plus fort poids dans la fenêtre.`}
      />
    </p>
  )
}
