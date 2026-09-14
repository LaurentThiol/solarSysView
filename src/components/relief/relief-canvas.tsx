"use client"

import { useEffect, useMemo, useRef, useState } from "react"

import { Button } from "@/components/ui/button"
import { heightColor, rgbCss, shadeRgb } from "@/lib/relief/color"
import {
  contourEdges,
  lambert,
  quadNormal,
  type HeightField,
  type TerrainQuad,
} from "@/lib/relief/heightmap"
import type { DrawAnchor } from "@/lib/relief/layout"
import {
  DEFAULT_CAMERA,
  ZOOM_MAX,
  ZOOM_MIN,
  autoExaggeration,
  clampCamera,
  fitScale,
  projectPoint,
  type Camera,
} from "@/lib/relief/project"

type Hover = {
  owner: number
  x: number
  y: number
} | null

export function ReliefCanvas({
  field,
  quads,
  anchors,
  camera,
  onCamera,
  autoRotate,
  contours,
  wire,
  yScale,
  hoverOwner,
  onHover,
}: {
  field: HeightField | null
  quads: TerrainQuad[]
  anchors: DrawAnchor[]
  camera: Camera
  onCamera: (next: Camera | ((prev: Camera) => Camera)) => void
  autoRotate: boolean
  contours: boolean
  wire: boolean
  yScale: number
  hoverOwner: number | null
  onHover: (owner: number | null) => void
}) {
  const wrapRef = useRef<HTMLDivElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const cameraRef = useRef(camera)
  const dragRef = useRef<{ x: number; y: number; yaw: number; pitch: number } | null>(null)
  const projectedRef = useRef<Array<{ owner: number; x: number; y: number }>>([])
  const [hint, setHint] = useState<Hover>(null)
  const contour = useMemo(() => {
    if (!field || !contours) return []
    const spanX = (field.cols - 1) * field.cell
    const spanZ = (field.rows - 1) * field.cell
    return contourEdges(field, autoExaggeration(field.maxH, spanX, spanZ, yScale))
  }, [contours, field, yScale])
  const sceneRef = useRef({ field, quads, anchors, contour, hoverOwner, wire, yScale })

  useEffect(() => {
    cameraRef.current = camera
  }, [camera])

  useEffect(() => {
    sceneRef.current = { field, quads, anchors, contour, hoverOwner, wire, yScale }
  }, [anchors, contour, field, hoverOwner, quads, wire, yScale])

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
      paintScene(canvasRef.current, wrapRef.current, cameraRef.current, sceneRef.current, projectedRef)
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
    let dist = 22
    for (const item of projectedRef.current) {
      const d = Math.hypot(item.x - x, item.y - y)
      if (d < dist) {
        dist = d
        best = { owner: item.owner, x: item.x, y: item.y }
      }
    }
    return best
  }

  return (
    <div
      ref={wrapRef}
      className="relative h-full min-h-[420px] w-full overflow-hidden rounded-lg bg-[#12182a]"
    >
      <canvas
        ref={canvasRef}
        tabIndex={0}
        className="absolute inset-0 block h-full w-full cursor-grab touch-none outline-none active:cursor-grabbing"
        aria-label="Carte 3D des tirages, glisser pour tourner, molette pour zoomer"
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
        onDoubleClick={() => onCamera(DEFAULT_CAMERA)}
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
            onCamera(DEFAULT_CAMERA)
          }
        }}
      />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 p-3 text-[11px] text-white/70">
        <p>Glisser pour tourner · molette pour zoomer · double-clic pour réinitialiser</p>
        {hint ? <p className="tabular-nums">tirage #{hint.owner + 1}</p> : null}
      </div>
      <div className="absolute top-3 right-3 flex flex-col items-center gap-1">
        <Legend />
      </div>
      <div className="absolute top-3 left-3 flex gap-1">
        <Button
          size="xs"
          variant="secondary"
          type="button"
          onClick={() => onCamera(DEFAULT_CAMERA)}
        >
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

type Scene = {
  field: HeightField | null
  quads: TerrainQuad[]
  anchors: DrawAnchor[]
  contour: ReturnType<typeof contourEdges>
  hoverOwner: number | null
  wire: boolean
  yScale: number
}

function paintScene(
  canvas: HTMLCanvasElement | null,
  wrap: HTMLDivElement | null,
  cam: Camera,
  scene: Scene,
  projectedRef: { current: Array<{ owner: number; x: number; y: number }> }
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
  if (canvas.width !== bw) canvas.width = bw
  if (canvas.height !== bh) canvas.height = bh
  const ctx = canvas.getContext("2d")
  if (!ctx) return
  const { field, quads, anchors, contour, hoverOwner, wire, yScale } = scene
  try {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, cssW, cssH)

    const cx = cssW * 0.5
    const cy = cssH * 0.58
    const box = field
      ? {
          minX: field.originX,
          maxX: field.originX + (field.cols - 1) * field.cell,
          minZ: field.originZ,
          maxZ: field.originZ + (field.rows - 1) * field.cell,
        }
      : boundsFromQuads(quads)
    const scale = fitScale(box.minX, box.maxX, box.minZ, box.maxZ, cssW, cssH)
    const proj = (x: number, y: number, z: number) => projectPoint(x, y, z, cam, cx, cy, scale)

    drawBackdrop(ctx, cssW, cssH)
    drawGround(ctx, proj, box)

    if (field && quads.length === 0) {
      const spanX = (field.cols - 1) * field.cell
      const spanZ = (field.rows - 1) * field.cell
      const yMul = autoExaggeration(field.maxH, spanX, spanZ, yScale)
      paintHeightField(ctx, field, proj, cam.yaw, yMul, hoverOwner, wire)
      if (contour.length) {
        ctx.strokeStyle = "rgba(8, 12, 24, 0.28)"
        ctx.lineWidth = 1
        for (const [a, b] of contour) {
          const p = proj(a.x, a.y, a.z)
          const q = proj(b.x, b.y, b.z)
          ctx.beginPath()
          ctx.moveTo(p.x, p.y)
          ctx.lineTo(q.x, q.y)
          ctx.stroke()
        }
      }
    } else if (quads.length) {
      paintQuads(ctx, quads, proj, hoverOwner, wire)
    }

    const latest = anchors.length ? anchors[anchors.length - 1].drawIndex : -1
    const projected: Array<{ owner: number; x: number; y: number }> = []
    for (const anchor of anchors) {
      const p = proj(anchor.x, 0.08, anchor.z)
      projected.push({ owner: anchor.drawIndex, x: p.x, y: p.y })
      const isLatest = anchor.drawIndex === latest
      const active = hoverOwner === anchor.drawIndex
      ctx.beginPath()
      ctx.arc(p.x, p.y, isLatest || active ? 4.5 : 2.4, 0, Math.PI * 2)
      ctx.fillStyle = isLatest
        ? "rgb(232, 210, 96)"
        : active
          ? "rgb(220, 230, 255)"
          : "rgba(220, 230, 250, 0.35)"
      ctx.fill()
    }
    projectedRef.current = projected
    canvas.dataset.relief = `${cssW}x${cssH}`
  } catch {
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.fillStyle = "rgb(42, 86, 128)"
    ctx.fillRect(0, 0, canvas.width, canvas.height)
  }
}

function boundsFromQuads(quads: TerrainQuad[]) {
  if (!quads.length) return { minX: -2, maxX: 2, minZ: -2, maxZ: 2 }
  let minX = Infinity
  let maxX = -Infinity
  let minZ = Infinity
  let maxZ = -Infinity
  for (const q of quads) {
    for (const p of [q.a, q.b, q.c, q.d]) {
      if (p.x < minX) minX = p.x
      if (p.x > maxX) maxX = p.x
      if (p.z < minZ) minZ = p.z
      if (p.z > maxZ) maxZ = p.z
    }
  }
  return { minX, maxX, minZ, maxZ }
}

function drawBackdrop(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const g = ctx.createLinearGradient(0, 0, 0, h)
  g.addColorStop(0, "#1a2440")
  g.addColorStop(0.55, "#141b30")
  g.addColorStop(1, "#0e1322")
  ctx.fillStyle = g
  ctx.fillRect(0, 0, w, h)
}

function drawGround(
  ctx: CanvasRenderingContext2D,
  proj: (x: number, y: number, z: number) => { x: number; y: number; depth: number },
  box: { minX: number; maxX: number; minZ: number; maxZ: number }
) {
  const pad = 0.8
  const corners = [
    proj(box.minX - pad, 0, box.minZ - pad),
    proj(box.maxX + pad, 0, box.minZ - pad),
    proj(box.maxX + pad, 0, box.maxZ + pad),
    proj(box.minX - pad, 0, box.maxZ + pad),
  ]
  ctx.beginPath()
  ctx.moveTo(corners[0].x, corners[0].y)
  for (let i = 1; i < 4; i += 1) ctx.lineTo(corners[i].x, corners[i].y)
  ctx.closePath()
  ctx.fillStyle = "rgba(12, 18, 36, 0.85)"
  ctx.fill()
  ctx.strokeStyle = "rgba(120, 140, 180, 0.18)"
  ctx.stroke()
}

function fillQuad(
  ctx: CanvasRenderingContext2D,
  pts: Array<{ x: number; y: number }>,
  fill: string,
  stroke: string | null
) {
  ctx.beginPath()
  ctx.moveTo(pts[0].x, pts[0].y)
  ctx.lineTo(pts[1].x, pts[1].y)
  ctx.lineTo(pts[2].x, pts[2].y)
  ctx.lineTo(pts[3].x, pts[3].y)
  ctx.closePath()
  ctx.fillStyle = fill
  ctx.fill()
  if (stroke) {
    ctx.strokeStyle = stroke
    ctx.lineWidth = 0.6
    ctx.stroke()
  }
}

function paintHeightField(
  ctx: CanvasRenderingContext2D,
  field: HeightField,
  proj: (x: number, y: number, z: number) => { x: number; y: number; depth: number },
  yaw: number,
  yScale: number,
  hoverOwner: number | null,
  wire: boolean
) {
  const cBack = Math.sin(yaw) >= 0
  const rBack = Math.cos(yaw) >= 0
  const c0 = cBack ? field.cols - 2 : 0
  const c1 = cBack ? -1 : field.cols - 1
  const cStep = cBack ? -1 : 1
  const r0 = rBack ? field.rows - 2 : 0
  const r1 = rBack ? -1 : field.rows - 1
  const rStep = rBack ? -1 : 1
  const maxH = field.maxH || 1
  const thresh = maxH * 0.006

  for (let r = r0; r !== r1; r += rStep) {
    for (let c = c0; c !== c1; c += cStep) {
      const i00 = r * field.cols + c
      const i10 = r * field.cols + (c + 1)
      const i01 = (r + 1) * field.cols + c
      const i11 = (r + 1) * field.cols + (c + 1)
      const h = (field.heights[i00] + field.heights[i10] + field.heights[i11] + field.heights[i01]) / 4
      if (h <= thresh) continue
      const x0 = field.originX + c * field.cell
      const x1 = x0 + field.cell
      const z0 = field.originZ + r * field.cell
      const z1 = z0 + field.cell
      const a = proj(x0, field.heights[i00] * yScale, z0)
      const b = proj(x1, field.heights[i10] * yScale, z0)
      const d = proj(x0, field.heights[i01] * yScale, z1)
      const cc = proj(x1, field.heights[i11] * yScale, z1)
      const shade = lambert(
        quadNormal({
          a: { x: x0, y: field.heights[i00] * yScale, z: z0 },
          b: { x: x1, y: field.heights[i10] * yScale, z: z0 },
          c: { x: x1, y: field.heights[i11] * yScale, z: z1 },
          d: { x: x0, y: field.heights[i01] * yScale, z: z1 },
          h,
          t: h / maxH,
          owner: field.owner[i00],
        })
      )
      const lit = hoverOwner === field.owner[i00] ? Math.min(1.15, shade + 0.18) : shade
      const fill = rgbCss(shadeRgb(heightColor(h / maxH), lit))
      fillQuad(ctx, [a, b, cc, d], fill, wire ? "rgba(8,10,20,0.35)" : "rgba(8,10,20,0.12)")
    }
  }
}

function paintQuads(
  ctx: CanvasRenderingContext2D,
  quads: TerrainQuad[],
  proj: (x: number, y: number, z: number) => { x: number; y: number; depth: number },
  hoverOwner: number | null,
  wire: boolean
) {
  const ranked = quads
    .map((quad) => {
      const pa = proj(quad.a.x, quad.a.y, quad.a.z)
      return { quad, pa, depth: pa.depth }
    })
    .sort((a, b) => b.depth - a.depth)
  for (const item of ranked) {
    const { quad } = item
    const a = item.pa
    const b = proj(quad.b.x, quad.b.y, quad.b.z)
    const c = proj(quad.c.x, quad.c.y, quad.c.z)
    const d = proj(quad.d.x, quad.d.y, quad.d.z)
    const shade = lambert(quadNormal(quad))
    const lit = hoverOwner === quad.owner ? Math.min(1.15, shade + 0.18) : shade
    fillQuad(
      ctx,
      [a, b, c, d],
      rgbCss(shadeRgb(heightColor(quad.t), lit)),
      wire ? "rgba(8,10,20,0.4)" : "rgba(8,10,20,0.14)"
    )
  }
}

function Legend() {
  const stops = [0, 0.2, 0.4, 0.6, 0.8, 1]
  return (
    <div className="rounded-md border border-white/15 bg-black/30 px-2 py-2 text-[10px] text-white/80 backdrop-blur-sm">
      <p className="mb-1 text-center tracking-wide uppercase">hauteur</p>
      <div className="flex gap-2">
        <div className="flex h-28 w-2.5 flex-col-reverse overflow-hidden rounded-sm">
          {stops.map((t) => (
            <span key={t} className="flex-1" style={{ background: rgbCss(heightColor(t)) }} />
          ))}
        </div>
        <div className="flex h-28 flex-col justify-between">
          <span>haut</span>
          <span>bas</span>
        </div>
      </div>
    </div>
  )
}
