"use client"

import { useEffect, useId, useMemo, useRef, useState } from "react"

import { HelpWrap, TitleHelp, type HelpCopy } from "@/components/help"
import { Button } from "@/components/ui/button"
import { type BallPoint } from "@/lib/next/couple"
import {
  clampCamera,
  DEFAULT_CAMERA,
  projectPoint,
  zoomToward,
  type Camera,
} from "@/lib/relief/project"

export type VolumeSegment = {
  a: number
  b: number
  affinity: number
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

function edgeStrength(link: VolumeSegment, maxAffinity: number) {
  if (maxAffinity <= 0) return 0.35
  return 0.28 + 0.72 * (link.affinity / maxAffinity)
}

export function BallVolume({
  points,
  active,
  dim,
  hot,
  maxAffinity,
  volumeHelp,
  frameHelp,
  onSelect,
}: {
  points: readonly BallPoint[]
  active: readonly number[]
  dim: readonly VolumeSegment[]
  hot: readonly VolumeSegment[]
  maxAffinity: number
  volumeHelp: HelpCopy
  frameHelp: HelpCopy
  onSelect: (ball: number | null) => void
}) {
  const titleId = useId()
  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const cameraRef = useRef<Camera>(DEFAULT_CAMERA)
  const [camera, setCamera] = useState<Camera>(DEFAULT_CAMERA)
  const world = useMemo(() => worldOf(points), [points])
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

      const strokeEdge = (link: VolumeSegment, marked: boolean) => {
        const left = placed.get(link.a)
        const right = placed.get(link.b)
        if (!left || !right) return
        ctx.beginPath()
        ctx.moveTo(left.x, left.y)
        ctx.lineTo(right.x, right.y)
        ctx.strokeStyle = marked ? primary : fg
        ctx.globalAlpha = marked ? 0.95 : edgeStrength(link, maxAffinity) * 0.45
        ctx.lineWidth = marked ? 2.2 : 0.6 + edgeStrength(link, maxAffinity) * 1.4
        ctx.stroke()
        ctx.globalAlpha = 1
      }
      for (const link of dim) strokeEdge(link, false)
      for (const link of hot) strokeEdge(link, true)

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
  }, [active, camera, dim, hasCloud, hot, maxAffinity, world])

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
    <figure
      aria-labelledby={titleId}
      className="flex min-w-0 flex-col gap-2 rounded-xl border border-border bg-card/40 p-3"
    >
      <figcaption className="flex items-center justify-between gap-2 text-sm font-medium">
        <TitleHelp help={volumeHelp}>
          <span id={titleId}>Volume</span>
        </TitleHelp>
        <HelpWrap help={frameHelp}>
          <Button
            type="button"
            size="xs"
            variant="outline"
            onClick={() => setCamera(DEFAULT_CAMERA)}
          >
            Recadrer
          </Button>
        </HelpWrap>
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
