"use client"

import { useEffect, useRef, useState } from "react"

import { Button } from "@/components/ui/button"
import { markerRadius, type MarkerStyle, type ViewStyle } from "@/lib/relief/layout"
import {
  RANK_LABELS,
  RANK_RGB,
  STAR_RGB,
  distToSegment,
  profileFitBounds,
  profilePaintKey,
  rankTimeLinks,
  rgbCssOf,
  type DrawProfile,
  type ProfileMap,
} from "@/lib/relief/profiles"
import {
  clampCamera,
  fitScale,
  focusPoint,
  projectPoint,
  zoomToward,
  type Camera,
} from "@/lib/relief/project"

const VALUE_RAILS = [10, 25, 40, 50]

type Hover = {
  owner: number
  x: number
  y: number
} | null

type Hit = {
  owner: number
  x: number
  y: number
  r: number
}

type Seg = {
  owner: number
  ax: number
  ay: number
  bx: number
  by: number
}

type Drag =
  | { kind: "orbit"; x: number; y: number; yaw: number; pitch: number }
  | { kind: "pan"; x: number; y: number; panX: number; panY: number }

type Scene = {
  map: ProfileMap | null
  style: ViewStyle
  yScale: number
  hoverOwner: number | null
  labels: boolean
  stars: boolean
  rankTime: boolean
  stems: boolean
  marker: MarkerStyle
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
  stars,
  rankTime,
  stems,
  marker,
  home,
}: {
  map: ProfileMap | null
  style: ViewStyle
  camera: Camera
  onCamera: (next: Camera | ((prev: Camera) => Camera)) => void
  autoRotate: boolean
  yScale: number
  hoverOwner: number | null
  onHover: (owner: number | null) => void
  labels: boolean
  stars: boolean
  rankTime: boolean
  stems: boolean
  marker: MarkerStyle
  home: Camera
}) {
  const wrapRef = useRef<HTMLDivElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const cameraRef = useRef(camera)
  const dragRef = useRef<Drag | null>(null)
  const hitsRef = useRef<Hit[]>([])
  const segsRef = useRef<Seg[]>([])
  const [hint, setHint] = useState<Hover>(null)
  const sceneRef = useRef<Scene>({
    map,
    style,
    yScale,
    hoverOwner,
    labels,
    stars,
    rankTime,
    stems,
    marker,
  })
  const lastKeyRef = useRef("")

  useEffect(() => {
    cameraRef.current = camera
  }, [camera])

  useEffect(() => {
    sceneRef.current = { map, style, yScale, hoverOwner, labels, stars, rankTime, stems, marker }
  }, [hoverOwner, labels, map, marker, rankTime, stars, stems, style, yScale])

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
        hitsRef,
        segsRef,
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
      const box = node.getBoundingClientRect()
      const factor = Math.exp(-event.deltaY * 0.0017)
      onCamera((prev) =>
        zoomToward(
          prev,
          factor,
          event.clientX - box.left,
          event.clientY - box.top,
          box.width * 0.5,
          box.height * 0.58
        )
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
    let dist = 18
    for (const item of hitsRef.current) {
      const d = Math.hypot(item.x - x, item.y - y)
      const limit = Math.max(12, item.r)
      if (d < limit && d < dist) {
        dist = d
        best = { owner: item.owner, x: item.x, y: item.y }
      }
    }
    for (const seg of segsRef.current) {
      const d = distToSegment(x, y, seg.ax, seg.ay, seg.bx, seg.by)
      if (d < 10 && d < dist) {
        dist = d
        best = { owner: seg.owner, x, y }
      }
    }
    return best
  }

  return (
    <div
      ref={wrapRef}
      className="relative h-full min-h-0 w-full overflow-hidden rounded-lg bg-[#12182a]"
    >
      <canvas
        ref={canvasRef}
        tabIndex={0}
        className="absolute inset-0 block h-full w-full cursor-grab touch-none outline-none active:cursor-grabbing"
        aria-label="Profils n1 à n5 des tirages, glisser pour tourner, Maj+glisser pour déplacer, molette pour zoomer"
        onContextMenu={(event) => event.preventDefault()}
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId)
          const pan =
            event.shiftKey || event.altKey || event.button === 1 || event.button === 2
          if (pan) {
            dragRef.current = {
              kind: "pan",
              x: event.clientX,
              y: event.clientY,
              panX: cameraRef.current.panX,
              panY: cameraRef.current.panY,
            }
            return
          }
          dragRef.current = {
            kind: "orbit",
            x: event.clientX,
            y: event.clientY,
            yaw: cameraRef.current.yaw,
            pitch: cameraRef.current.pitch,
          }
        }}
        onPointerMove={(event) => {
          const drag = dragRef.current
          if (drag?.kind === "orbit") {
            const dx = event.clientX - drag.x
            const dy = event.clientY - drag.y
            onCamera(
              clampCamera({
                ...cameraRef.current,
                yaw: drag.yaw + dx * 0.0075,
                pitch: drag.pitch - dy * 0.0055,
              })
            )
            return
          }
          if (drag?.kind === "pan") {
            onCamera(
              clampCamera({
                ...cameraRef.current,
                panX: drag.panX + (event.clientX - drag.x),
                panY: drag.panY + (event.clientY - drag.y),
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
            onCamera((prev) => clampCamera({ ...prev, zoom: prev.zoom * 1.12 }))
          } else if (event.key === "-" || event.key === "_") {
            onCamera((prev) => clampCamera({ ...prev, zoom: prev.zoom * 0.89 }))
          } else if (event.key === "0") {
            onCamera(home)
          }
        }}
      />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 p-3 text-[11px] text-white/75">
        <p>
          Un trait = un tirage · {marker === "point" ? "points" : "boules"} n1→n5 ·
          hauteur = 1–50
          {rankTime ? " · calque rangs dans le temps" : ""}
          <span className="text-white/45"> · Maj+glisser pour déplacer</span>
        </p>
        {hint ? <p className="tabular-nums">tirage #{hint.owner + 1}</p> : null}
      </div>
      <div className="pointer-events-none absolute top-3 right-3 flex flex-col items-center gap-1">
        <RankLegend />
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

function paintScene(
  canvas: HTMLCanvasElement | null,
  wrap: HTMLDivElement | null,
  cam: Camera,
  scene: Scene,
  hitsRef: { current: Hit[] },
  segsRef: { current: Seg[] },
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
  const { map, style, yScale, hoverOwner, labels, stars, rankTime, stems, marker } = scene
  const key = [
    cssW,
    cssH,
    cam.yaw.toFixed(4),
    cam.pitch.toFixed(4),
    cam.zoom.toFixed(3),
    (cam.panX ?? 0).toFixed(1),
    (cam.panY ?? 0).toFixed(1),
    map?.profiles.length ?? 0,
    map?.connected ? 1 : 0,
    profilePaintKey(map, stars),
    style,
    hoverOwner ?? -1,
    yScale.toFixed(3),
    labels ? 1 : 0,
    stars ? 1 : 0,
    rankTime ? 1 : 0,
    stems ? 1 : 0,
    marker,
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
    if (!map || map.profiles.length === 0) {
      canvas.dataset.relief = `${cssW}x${cssH}`
      return
    }
    const box = profileFitBounds(map, stars)
    const scale = fitScale(box.minX, box.maxX, box.minZ, box.maxZ, cssW, cssH)
    const cx = cssW * 0.5
    const cy = cssH * 0.58
    const focus = focusPoint(box.minX, box.maxX, box.minZ, box.maxZ, scale, cssH)
    const panX = cam.panX ?? 0
    const panY = cam.panY ?? 0
    const proj = (x: number, y: number, z: number) => {
      const p = projectPoint(x - focus.midX, y * yScale, z - focus.midZ, cam, cx, cy, scale)
      return { x: p.x + panX, y: p.y + panY, depth: p.depth }
    }

    const g0 = proj(box.minX, 0, box.minZ)
    const g1 = proj(box.maxX, 0, box.minZ)
    const g2 = proj(box.maxX, 0, box.maxZ)
    const g3 = proj(box.minX, 0, box.maxZ)
    ctx.beginPath()
    ctx.moveTo(g0.x, g0.y)
    ctx.lineTo(g1.x, g1.y)
    ctx.lineTo(g2.x, g2.y)
    ctx.lineTo(g3.x, g3.y)
    ctx.closePath()
    ctx.fillStyle = "rgba(18, 24, 42, 0.55)"
    ctx.fill()
    ctx.strokeStyle = "rgba(160, 180, 220, 0.18)"
    ctx.lineWidth = 1
    ctx.stroke()

    if (map.connected) {
      paintAxes(ctx, map, proj, stars)
    }

    const ranked = [...map.profiles].sort((a, b) => {
      const za = a.points.reduce((s, p) => s + p.z, 0) / 5
      const zb = b.points.reduce((s, p) => s + p.z, 0) / 5
      return proj(0, 0, zb).depth - proj(0, 0, za).depth
    })

    const hits: Hit[] = []
    const segs: Seg[] = []
    const labelAll = labels && map.profiles.length <= 20
    if (rankTime) {
      paintRankTime(ctx, map, proj, hoverOwner, segs)
    }
    const count = map.profiles.length
    for (const profile of ranked) {
      paintProfile(ctx, profile, proj, hoverOwner, labelAll, stars, stems, marker, count, hits, segs)
    }
    hitsRef.current = hits
    segsRef.current = segs
    canvas.dataset.relief = `${cssW}x${cssH}`
  } catch {
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.fillStyle = "rgb(42, 86, 128)"
    ctx.fillRect(0, 0, canvas.width, canvas.height)
  }
}

function paintAxes(
  ctx: CanvasRenderingContext2D,
  map: ProfileMap,
  proj: (x: number, y: number, z: number) => { x: number; y: number },
  stars: boolean
) {
  const zs = map.profiles.map((p) => p.points[0]?.z ?? 0)
  const z0 = Math.min(...zs)
  const z1 = Math.max(...zs)
  const ranks = stars ? [0, 1, 2, 3, 4, 5.15, 5.7] : [0, 1, 2, 3, 4]
  for (const x of ranks) {
    const a = proj(x, 0, z0)
    const c = proj(x, 0, z1)
    ctx.beginPath()
    ctx.moveTo(a.x, a.y)
    ctx.lineTo(c.x, c.y)
    ctx.strokeStyle = "rgba(160, 180, 220, 0.16)"
    ctx.lineWidth = 1
    ctx.stroke()
  }
  for (let r = 0; r < 5; r++) {
    const lab = proj(r, 0, z0 - 0.28)
    ctx.fillStyle = rgbCssOf(RANK_RGB[r], 0.9)
    ctx.font = "11px ui-sans-serif, system-ui, sans-serif"
    ctx.textAlign = "center"
    ctx.textBaseline = "top"
    ctx.fillText(RANK_LABELS[r], lab.x, lab.y + 6)
  }
  if (stars) {
    const lab = proj(5.4, 0, z0 - 0.28)
    ctx.fillStyle = rgbCssOf(STAR_RGB, 0.9)
    ctx.font = "11px ui-sans-serif, system-ui, sans-serif"
    ctx.textAlign = "center"
    ctx.textBaseline = "top"
    ctx.fillText("e1 e2", lab.x, lab.y + 6)
  }
  for (const n of VALUE_RAILS) {
    const y = (n / 50) * map.yWorld
    const a = proj(0, y, z0)
    const c = proj(4, y, z0)
    ctx.beginPath()
    ctx.moveTo(a.x, a.y)
    ctx.lineTo(c.x, c.y)
    ctx.strokeStyle = "rgba(160, 180, 220, 0.14)"
    ctx.setLineDash([3, 4])
    ctx.stroke()
    ctx.setLineDash([])
    ctx.fillStyle = "rgba(200, 210, 230, 0.55)"
    ctx.font = "9px ui-sans-serif, system-ui, sans-serif"
    ctx.textAlign = "right"
    ctx.textBaseline = "middle"
    ctx.fillText(String(n), a.x - 6, a.y)
  }
}

function paintRankTime(
  ctx: CanvasRenderingContext2D,
  map: ProfileMap,
  proj: (x: number, y: number, z: number) => { x: number; y: number },
  hoverOwner: number | null,
  segs: Seg[]
) {
  const links = rankTimeLinks(map)
  for (const link of links) {
    const a = proj(link.ax, link.ay, link.az)
    const b = proj(link.bx, link.by, link.bz)
    const hot = hoverOwner === link.fromIndex || hoverOwner === link.toIndex
    ctx.beginPath()
    ctx.moveTo(a.x, a.y)
    ctx.lineTo(b.x, b.y)
    ctx.strokeStyle = rgbCssOf(RANK_RGB[link.rank], hot ? 0.72 : 0.32)
    ctx.lineWidth = hot ? 2.2 : 1.35
    ctx.setLineDash(hot ? [] : [5, 4])
    ctx.lineCap = "round"
    ctx.stroke()
    ctx.setLineDash([])
    segs.push({
      owner: link.toIndex,
      ax: a.x,
      ay: a.y,
      bx: b.x,
      by: b.y,
    })
  }
}

function paintProfile(
  ctx: CanvasRenderingContext2D,
  profile: DrawProfile,
  proj: (x: number, y: number, z: number) => { x: number; y: number },
  hoverOwner: number | null,
  labelAll: boolean,
  stars: boolean,
  stems: boolean,
  marker: MarkerStyle,
  count: number,
  hits: Hit[],
  segs: Seg[]
) {
  const hovered = hoverOwner === profile.drawIndex
  const latest = profile.latest
  const rec = profile.recency
  const emphasis = hovered || latest
  const alpha = hovered ? 0.98 : latest ? 0.92 : 0.18 + rec * 0.62
  const dense = count >= 100
  const pts = profile.points.map((p) => proj(p.x, p.y, p.z))

  if (latest) {
    ctx.beginPath()
    ctx.moveTo(pts[0].x, pts[0].y)
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y)
    ctx.strokeStyle = "rgba(232, 210, 96, 0.45)"
    ctx.lineWidth = marker === "point" ? 2.8 : 5
    ctx.lineJoin = "round"
    ctx.lineCap = "round"
    ctx.stroke()
  }

  if (stems && (hovered || latest || rec > 0.35)) {
    for (let i = 0; i < 5; i++) {
      const foot = proj(profile.points[i].x, 0, profile.points[i].z)
      ctx.beginPath()
      ctx.moveTo(foot.x, foot.y)
      ctx.lineTo(pts[i].x, pts[i].y)
      ctx.strokeStyle = rgbCssOf(RANK_RGB[i], hovered || latest ? 0.28 : 0.08 + rec * 0.12)
      ctx.lineWidth = 1
      ctx.stroke()
    }
  }

  const strokeW = emphasis ? (marker === "point" ? 1.8 : 2.6) : dense ? 0.7 + rec * 0.45 : 1.1 + rec * 1.1
  for (let i = 0; i < 4; i++) {
    ctx.beginPath()
    ctx.moveTo(pts[i].x, pts[i].y)
    ctx.lineTo(pts[i + 1].x, pts[i + 1].y)
    ctx.strokeStyle = rgbCssOf(RANK_RGB[i], alpha)
    ctx.lineWidth = strokeW
    ctx.lineJoin = "round"
    ctx.lineCap = "round"
    ctx.stroke()
    segs.push({
      owner: profile.drawIndex,
      ax: pts[i].x,
      ay: pts[i].y,
      bx: pts[i + 1].x,
      by: pts[i + 1].y,
    })
  }

  const showNum = labelAll || hovered || latest
  for (let i = 0; i < 5; i++) {
    const p = pts[i]
    const r = markerRadius(marker, count, rec, emphasis)
    ctx.beginPath()
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2)
    ctx.fillStyle = rgbCssOf(RANK_RGB[i], emphasis ? 1 : 0.4 + rec * 0.55)
    ctx.fill()
    if (marker === "boule" || emphasis) {
      ctx.strokeStyle = latest ? "rgba(232, 210, 96, 0.95)" : "rgba(8, 12, 24, 0.55)"
      ctx.lineWidth = emphasis ? (marker === "point" ? 1.05 : 1.5) : 0.7
      ctx.stroke()
    }
    hits.push({ owner: profile.drawIndex, x: p.x, y: p.y, r: r + (marker === "point" ? 6 : 8) })
    if (showNum) {
      ctx.fillStyle = "rgba(248, 250, 252, 0.95)"
      ctx.font = `${hovered || latest ? 10 : 9}px ui-sans-serif, system-ui, sans-serif`
      ctx.textAlign = "center"
      ctx.textBaseline = "bottom"
      ctx.fillText(String(profile.ranks[i]), p.x, p.y - r - 2)
    }
  }

  if (stars) {
    const starPts = profile.starPoints.map((p) => proj(p.x, p.y, p.z))
    if (starPts.length === 2) {
      ctx.beginPath()
      ctx.moveTo(starPts[0].x, starPts[0].y)
      ctx.lineTo(starPts[1].x, starPts[1].y)
      ctx.strokeStyle = rgbCssOf(STAR_RGB, alpha * 0.85)
      ctx.lineWidth = emphasis ? 2 : marker === "point" ? 0.8 : 1
      ctx.stroke()
      segs.push({
        owner: profile.drawIndex,
        ax: starPts[0].x,
        ay: starPts[0].y,
        bx: starPts[1].x,
        by: starPts[1].y,
      })
    }
    for (let i = 0; i < starPts.length; i++) {
      const p = starPts[i]
      const r = marker === "point" ? (emphasis ? 2.1 : 1.15) : emphasis ? 4.4 : 3
      ctx.beginPath()
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2)
      ctx.fillStyle = rgbCssOf(STAR_RGB, emphasis ? 1 : 0.45 + rec * 0.4)
      ctx.fill()
      if (marker === "boule" || emphasis) {
        ctx.strokeStyle = "rgba(8, 12, 24, 0.55)"
        ctx.lineWidth = 0.8
        ctx.stroke()
      }
      hits.push({ owner: profile.drawIndex, x: p.x, y: p.y, r: r + 8 })
      if (showNum) {
        ctx.fillStyle = "rgba(248, 250, 252, 0.9)"
        ctx.font = "9px ui-sans-serif, system-ui, sans-serif"
        ctx.textAlign = "center"
        ctx.textBaseline = "bottom"
        ctx.fillText(`★${profile.starPoints[i].n}`, p.x, p.y - r - 2)
      }
    }
  }

  if (hovered || latest || labelAll) {
    const foot = proj(profile.points[0].x - 0.35, 0, profile.points[0].z)
    ctx.font = "10px ui-sans-serif, system-ui, sans-serif"
    ctx.textAlign = "right"
    ctx.textBaseline = "middle"
    ctx.fillStyle = latest ? "rgb(232, 210, 96)" : "rgba(200, 210, 230, 0.55)"
    ctx.fillText(profile.date.slice(5).replace("-", "/"), foot.x, foot.y)
  }
}

function drawBackdrop(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const g = ctx.createLinearGradient(0, 0, 0, h)
  g.addColorStop(0, "#1a2440")
  g.addColorStop(0.55, "#141b30")
  g.addColorStop(1, "#0e1322")
  ctx.fillStyle = g
  ctx.fillRect(0, 0, w, h)
}

function RankLegend() {
  return (
    <div className="rounded-md border border-white/15 bg-black/30 px-2 py-2 text-[10px] text-white/80 backdrop-blur-sm">
      <p className="mb-1.5 text-center tracking-wide uppercase">n1 → n5</p>
      <div className="flex flex-col gap-1">
        {RANK_LABELS.map((label, i) => (
          <div key={label} className="flex items-center gap-1.5">
            <span
              className="size-2.5 rounded-full"
              style={{ background: rgbCssOf(RANK_RGB[i]) }}
            />
            <span>{label}</span>
          </div>
        ))}
      </div>
      <p className="mt-2 text-center text-white/55">hauteur = 1–50</p>
    </div>
  )
}
