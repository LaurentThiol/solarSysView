"use client"

import { useEffect, useRef, useState } from "react"

import { Button } from "@/components/ui/button"
import { heightColor, rgbCss, shadeRgb } from "@/lib/relief/color"
import type { ViewStyle } from "@/lib/relief/layout"
import {
  DEFAULT_CAMERA,
  PLAN_CAMERA,
  ZOOM_MAX,
  ZOOM_MIN,
  clampCamera,
  fitScale,
  projectPoint,
  type Camera,
} from "@/lib/relief/project"
import {
  plateCorners,
  stampBounds,
  type Stamp,
  type StampMap,
} from "@/lib/relief/stamps"

type Hover = {
  owner: number
  x: number
  y: number
} | null

type Scene = {
  map: StampMap | null
  style: ViewStyle
  yScale: number
  hoverOwner: number | null
  labels: boolean
}

export function ReliefCanvas({
  map,
  style,
  camera,
  onCamera,
  autoRotate,
  yScale,
  hoverOwner,
  onHover,
  labels,
}: {
  map: StampMap | null
  style: ViewStyle
  camera: Camera
  onCamera: (next: Camera | ((prev: Camera) => Camera)) => void
  autoRotate: boolean
  yScale: number
  hoverOwner: number | null
  onHover: (owner: number | null) => void
  labels: boolean
}) {
  const wrapRef = useRef<HTMLDivElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const cameraRef = useRef(camera)
  const dragRef = useRef<{ x: number; y: number; yaw: number; pitch: number } | null>(null)
  const projectedRef = useRef<Array<{ owner: number; x: number; y: number; r: number }>>([])
  const [hint, setHint] = useState<Hover>(null)
  const sceneRef = useRef<Scene>({ map, style, yScale, hoverOwner, labels })
  const lastKeyRef = useRef("")
  const home = style === "plan" ? PLAN_CAMERA : DEFAULT_CAMERA

  useEffect(() => {
    cameraRef.current = camera
  }, [camera])

  useEffect(() => {
    sceneRef.current = { map, style, yScale, hoverOwner, labels }
  }, [hoverOwner, labels, map, style, yScale])

  useEffect(() => {
    if (!autoRotate) return
    let frame = 0
    const tick = () => {
      if (!dragRef.current) {
        onCamera((prev) => clampCamera({ ...prev, yaw: prev.yaw + 0.0042 }))
      }
      frame = window.requestAnimationFrame(tick)
    }
    frame = window.requestAnimationFrame(tick)
    return () => window.cancelAnimationFrame(frame)
  }, [autoRotate, onCamera])

  useEffect(() => {
    let frame = 0
    let alive = true
    const loop = () => {
      if (!alive) return
      paintScene(
        canvasRef.current,
        wrapRef.current,
        cameraRef.current,
        sceneRef.current,
        projectedRef,
        lastKeyRef
      )
      frame = window.requestAnimationFrame(loop)
    }
    frame = window.requestAnimationFrame(loop)
    return () => {
      alive = false
      window.cancelAnimationFrame(frame)
    }
  }, [])

  useEffect(() => {
    const node = wrapRef.current
    if (!node) return
    const onWheel = (event: WheelEvent) => {
      event.preventDefault()
      const factor = event.deltaY > 0 ? 0.94 : 1.06
      onCamera((prev) =>
        clampCamera({
          ...prev,
          zoom: Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, prev.zoom * factor)),
        })
      )
    }
    node.addEventListener("wheel", onWheel, { passive: false })
    return () => node.removeEventListener("wheel", onWheel)
  }, [onCamera])

  function pick(clientX: number, clientY: number) {
    const canvas = canvasRef.current
    if (!canvas) return null
    const box = canvas.getBoundingClientRect()
    const x = clientX - box.left
    const y = clientY - box.top
    let best: Hover = null
    let dist = 28
    for (const item of projectedRef.current) {
      const d = Math.hypot(item.x - x, item.y - y)
      const limit = Math.max(18, item.r)
      if (d < limit && d < dist) {
        dist = d
        best = { owner: item.owner, x: item.x, y: item.y }
      }
    }
    return best
  }

  return (
    <div
      ref={wrapRef}
      className="relative h-full min-h-[400px] w-full overflow-hidden rounded-lg bg-[#12182a]"
    >
      <canvas
        ref={canvasRef}
        tabIndex={0}
        className="absolute inset-0 block h-full w-full cursor-grab touch-none outline-none active:cursor-grabbing"
        aria-label="Carte des glyphes 5×10, glisser pour tourner, molette pour zoomer"
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId)
          dragRef.current = {
            x: event.clientX,
            y: event.clientY,
            yaw: cameraRef.current.yaw,
            pitch: cameraRef.current.pitch,
          }
        }}
        onPointerMove={(event) => {
          const drag = dragRef.current
          if (drag) {
            const dx = event.clientX - drag.x
            const dy = event.clientY - drag.y
            onCamera(
              clampCamera({
                yaw: drag.yaw + dx * 0.0075,
                pitch: drag.pitch - dy * 0.0055,
                zoom: cameraRef.current.zoom,
              })
            )
            return
          }
          const hit = pick(event.clientX, event.clientY)
          setHint(hit)
          onHover(hit?.owner ?? null)
        }}
        onPointerUp={() => {
          dragRef.current = null
        }}
        onPointerCancel={() => {
          dragRef.current = null
        }}
        onPointerLeave={() => {
          if (!dragRef.current) {
            setHint(null)
            onHover(null)
          }
        }}
        onDoubleClick={() => onCamera(home)}
        onKeyDown={(event) => {
          const step = event.shiftKey ? 0.14 : 0.07
          if (event.key === "ArrowLeft") {
            event.preventDefault()
            onCamera((prev) => clampCamera({ ...prev, yaw: prev.yaw - step }))
          } else if (event.key === "ArrowRight") {
            event.preventDefault()
            onCamera((prev) => clampCamera({ ...prev, yaw: prev.yaw + step }))
          } else if (event.key === "ArrowUp") {
            event.preventDefault()
            onCamera((prev) => clampCamera({ ...prev, pitch: prev.pitch + step }))
          } else if (event.key === "ArrowDown") {
            event.preventDefault()
            onCamera((prev) => clampCamera({ ...prev, pitch: prev.pitch - step }))
          } else if (event.key === "+" || event.key === "=") {
            onCamera((prev) => clampCamera({ ...prev, zoom: prev.zoom * 1.08 }))
          } else if (event.key === "-" || event.key === "_") {
            onCamera((prev) => clampCamera({ ...prev, zoom: prev.zoom * 0.92 }))
          } else if (event.key === "0") {
            onCamera(home)
          }
        }}
      />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 p-3 text-[11px] text-white/75">
        <p>Une plaque = un tirage · cinq cases = les cinq boules · glisser pour tourner</p>
        {hint ? <p className="tabular-nums">tirage #{hint.owner + 1}</p> : null}
      </div>
      <div className="pointer-events-none absolute top-3 right-3 flex flex-col items-center gap-1">
        <Legend />
      </div>
      <div className="absolute top-3 left-3 flex gap-1">
        <Button size="xs" variant="secondary" type="button" onClick={() => onCamera(home)}>
          Vue
        </Button>
        <Button
          size="xs"
          variant="secondary"
          type="button"
          onClick={() => onCamera((prev) => clampCamera({ ...prev, yaw: prev.yaw + Math.PI / 2 }))}
        >
          90°
        </Button>
      </div>
    </div>
  )
}

function projectPlan(
  x: number,
  y: number,
  z: number,
  cam: Camera,
  cx: number,
  cy: number,
  scale: number
) {
  const cosY = Math.cos(cam.yaw)
  const sinY = Math.sin(cam.yaw)
  const x1 = x * cosY - z * sinY
  const z1 = x * sinY + z * cosY
  const s = scale * cam.zoom
  return { x: cx + x1 * s, y: cy + z1 * s, depth: z1 - y * 0.02 }
}

function paintScene(
  canvas: HTMLCanvasElement | null,
  wrap: HTMLDivElement | null,
  cam: Camera,
  scene: Scene,
  projectedRef: { current: Array<{ owner: number; x: number; y: number; r: number }> },
  lastKeyRef: { current: string }
) {
  if (!canvas) return
  const host = wrap ?? canvas.parentElement
  if (!host) return
  const rect = host.getBoundingClientRect()
  const cssW = Math.max(1, Math.round(rect.width))
  const cssH = Math.max(1, Math.round(rect.height))
  if (cssW < 2 || cssH < 2) return
  const dpr = Math.min(2, typeof window === "undefined" ? 1 : window.devicePixelRatio || 1)
  const bw = Math.max(1, Math.round(cssW * dpr))
  const bh = Math.max(1, Math.round(cssH * dpr))
  const { map, style, yScale, hoverOwner, labels } = scene
  const key = [
    cssW,
    cssH,
    cam.yaw.toFixed(4),
    cam.pitch.toFixed(4),
    cam.zoom.toFixed(3),
    map?.stamps.length ?? 0,
    map?.maxH.toFixed(4) ?? "0",
    style,
    hoverOwner ?? -1,
    yScale.toFixed(3),
    labels ? 1 : 0,
  ].join("|")
  if (
    key === lastKeyRef.current &&
    canvas.dataset.relief &&
    canvas.width === bw &&
    canvas.height === bh
  ) {
    return
  }
  lastKeyRef.current = key
  if (canvas.width !== bw) canvas.width = bw
  if (canvas.height !== bh) canvas.height = bh
  const ctx = canvas.getContext("2d")
  if (!ctx) return
  try {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, cssW, cssH)
    drawBackdrop(ctx, cssW, cssH)
    if (!map || map.stamps.length === 0) {
      canvas.dataset.relief = `${cssW}x${cssH}`
      return
    }
    const box = stampBounds(map)
    const scale = fitScale(box.minX, box.maxX, box.minZ, box.maxZ, cssW, cssH)
    const cx = cssW * 0.5
    const cy = cssH * 0.5
    const midX = (box.minX + box.maxX) / 2
    const midZ = (box.minZ + box.maxZ) / 2
    const plan = style === "plan"
    const proj = (x: number, y: number, z: number) =>
      plan
        ? projectPlan(x - midX, y, z - midZ, cam, cx, cy, scale)
        : projectPoint(x - midX, y, z - midZ, cam, cx, cy, scale)
    const ranked = [...map.stamps].sort((a, b) => {
      const da = proj(a.x, 0, a.z).depth
      const db = proj(b.x, 0, b.z).depth
      return db - da
    })
    const hits: Array<{ owner: number; x: number; y: number; r: number }> = []
    for (const stamp of ranked) {
      paintStamp(ctx, stamp, map, proj, plan, yScale, hoverOwner, labels)
      const p = proj(stamp.x, 0, stamp.z)
      const edge = proj(stamp.x + 5 * map.cell, 0, stamp.z)
      hits.push({
        owner: stamp.drawIndex,
        x: p.x,
        y: p.y,
        r: Math.hypot(edge.x - p.x, edge.y - p.y) * 0.85,
      })
    }
    projectedRef.current = hits
    canvas.dataset.relief = `${cssW}x${cssH}`
  } catch {
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.fillStyle = "rgb(42, 86, 128)"
    ctx.fillRect(0, 0, canvas.width, canvas.height)
  }
}

function paintStamp(
  ctx: CanvasRenderingContext2D,
  stamp: Stamp,
  map: StampMap,
  proj: (x: number, y: number, z: number) => { x: number; y: number; depth: number },
  plan: boolean,
  yScale: number,
  hoverOwner: number | null,
  labels: boolean
) {
  const plate = plateCorners(stamp, map.cell)
  const active = hoverOwner === stamp.drawIndex
  const a = proj(plate.minX, 0, plate.minZ)
  const b = proj(plate.maxX, 0, plate.minZ)
  const c = proj(plate.maxX, 0, plate.maxZ)
  const d = proj(plate.minX, 0, plate.maxZ)
  ctx.beginPath()
  ctx.moveTo(a.x, a.y)
  ctx.lineTo(b.x, b.y)
  ctx.lineTo(c.x, c.y)
  ctx.lineTo(d.x, d.y)
  ctx.closePath()
  ctx.fillStyle = stamp.latest ? "rgba(40, 48, 28, 0.95)" : "rgba(18, 24, 40, 0.92)"
  ctx.fill()
  ctx.strokeStyle = stamp.latest
    ? "rgba(232, 210, 96, 0.95)"
    : active
      ? "rgba(220, 230, 255, 0.85)"
      : "rgba(120, 140, 180, 0.35)"
  ctx.lineWidth = stamp.latest || active ? 1.8 : 0.8
  ctx.stroke()

  const cell = map.cell
  ctx.strokeStyle = "rgba(140, 160, 200, 0.22)"
  ctx.lineWidth = 0.6
  for (let col = 0; col <= 10; col += 1) {
    const x = stamp.x + (col - 5) * cell
    const p = proj(x, 0, plate.minZ)
    const q = proj(x, 0, plate.maxZ)
    ctx.beginPath()
    ctx.moveTo(p.x, p.y)
    ctx.lineTo(q.x, q.y)
    ctx.stroke()
  }
  for (let row = 0; row <= 5; row += 1) {
    const z = stamp.z + (row - 2.5) * cell
    const p = proj(plate.minX, 0, z)
    const q = proj(plate.maxX, 0, z)
    ctx.beginPath()
    ctx.moveTo(p.x, p.y)
    ctx.lineTo(q.x, q.y)
    ctx.stroke()
  }

  const half = cell * 0.44
  const maxH = map.maxH || 1
  const lift = plan ? 0 : cell * 1.35 * yScale
  const sample = proj(stamp.x, 0, stamp.z)
  const neighbor = proj(stamp.x + cell, 0, stamp.z)
  const cellPx = Math.hypot(neighbor.x - sample.x, neighbor.y - sample.y)
  const showNum = labels && cellPx >= 8
  const showDate = labels && map.stamps.length <= 24 && cellPx >= 7 && !map.aggregated

  const rankedCells = [...stamp.cells].sort(
    (u, v) => proj(v.x, 0, v.z).depth - proj(u.x, 0, u.z).depth
  )
  for (const cellData of rankedCells) {
    const y = (cellData.h / maxH) * lift
    const fill = rgbCss(shadeRgb(heightColor(cellData.t), active ? 1.05 : 0.92))
    const pad = cellData.star ? half * 0.72 : half
    if (plan || y < cell * 0.04) {
      paintFlatCell(ctx, proj, cellData.x, cellData.z, pad, fill)
    } else {
      paintBox(ctx, proj, cellData.x, cellData.z, pad, y, fill)
    }
    if (showNum) {
      const top = proj(cellData.x, y, cellData.z)
      ctx.font = `600 ${Math.max(9, Math.min(14, cellPx * 0.55))}px ui-sans-serif, system-ui, sans-serif`
      ctx.textAlign = "center"
      ctx.textBaseline = "middle"
      ctx.fillStyle = cellData.t > 0.62 ? "rgba(20, 16, 8, 0.95)" : "rgba(248, 250, 252, 0.95)"
      ctx.fillText(cellData.star ? `★${cellData.n}` : String(cellData.n), top.x, top.y)
    }
  }

  if (showDate) {
    const foot = proj(stamp.x, 0, plate.maxZ + cell * 0.55)
    ctx.font = "10px ui-sans-serif, system-ui, sans-serif"
    ctx.textAlign = "center"
    ctx.textBaseline = "top"
    ctx.fillStyle = stamp.latest ? "rgb(232, 210, 96)" : "rgba(200, 210, 230, 0.7)"
    const label = stamp.date.slice(5).replace("-", "/")
    ctx.fillText(label, foot.x, foot.y)
  }
}

function paintFlatCell(
  ctx: CanvasRenderingContext2D,
  proj: (x: number, y: number, z: number) => { x: number; y: number },
  x: number,
  z: number,
  half: number,
  fill: string
) {
  const a = proj(x - half, 0, z - half)
  const b = proj(x + half, 0, z - half)
  const c = proj(x + half, 0, z + half)
  const d = proj(x - half, 0, z + half)
  ctx.beginPath()
  ctx.moveTo(a.x, a.y)
  ctx.lineTo(b.x, b.y)
  ctx.lineTo(c.x, c.y)
  ctx.lineTo(d.x, d.y)
  ctx.closePath()
  ctx.fillStyle = fill
  ctx.fill()
  ctx.strokeStyle = "rgba(8, 12, 24, 0.35)"
  ctx.lineWidth = 0.7
  ctx.stroke()
}

function paintBox(
  ctx: CanvasRenderingContext2D,
  proj: (x: number, y: number, z: number) => { x: number; y: number },
  x: number,
  z: number,
  half: number,
  y: number,
  fill: string
) {
  const x0 = x - half
  const x1 = x + half
  const z0 = z - half
  const z1 = z + half
  const t00 = proj(x0, y, z0)
  const t10 = proj(x1, y, z0)
  const t11 = proj(x1, y, z1)
  const t01 = proj(x0, y, z1)
  const b00 = proj(x0, 0, z0)
  const b10 = proj(x1, 0, z0)
  const b11 = proj(x1, 0, z1)
  const b01 = proj(x0, 0, z1)
  const faces = [
    [b10, b11, t11, t10],
    [b01, b00, t00, t01],
    [b00, b10, t10, t00],
    [b11, b01, t01, t11],
  ]
  ctx.fillStyle = "rgba(16, 22, 36, 0.88)"
  for (const face of faces) {
    ctx.beginPath()
    ctx.moveTo(face[0].x, face[0].y)
    ctx.lineTo(face[1].x, face[1].y)
    ctx.lineTo(face[2].x, face[2].y)
    ctx.lineTo(face[3].x, face[3].y)
    ctx.closePath()
    ctx.fill()
  }
  ctx.beginPath()
  ctx.moveTo(t00.x, t00.y)
  ctx.lineTo(t10.x, t10.y)
  ctx.lineTo(t11.x, t11.y)
  ctx.lineTo(t01.x, t01.y)
  ctx.closePath()
  ctx.fillStyle = fill
  ctx.fill()
  ctx.strokeStyle = "rgba(8, 12, 24, 0.4)"
  ctx.lineWidth = 0.7
  ctx.stroke()
}

function drawBackdrop(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const g = ctx.createLinearGradient(0, 0, 0, h)
  g.addColorStop(0, "#1a2440")
  g.addColorStop(0.55, "#141b30")
  g.addColorStop(1, "#0e1322")
  ctx.fillStyle = g
  ctx.fillRect(0, 0, w, h)
}

function Legend() {
  const stops = [0, 0.2, 0.4, 0.6, 0.8, 1]
  return (
    <div className="rounded-md border border-white/15 bg-black/30 px-2 py-2 text-[10px] text-white/80 backdrop-blur-sm">
      <p className="mb-1 text-center tracking-wide uppercase">couleur</p>
      <div className="flex gap-2">
        <div className="flex h-28 w-2.5 flex-col-reverse overflow-hidden rounded-sm">
          {stops.map((t) => (
            <span key={t} className="flex-1" style={{ background: rgbCss(heightColor(t)) }} />
          ))}
        </div>
        <div className="flex h-28 flex-col justify-between">
          <span>récent</span>
          <span>ancien</span>
        </div>
      </div>
    </div>
  )
}
