"use client"

import { useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { Pin, PinOff } from "lucide-react"

import { formatDrawDate } from "@/lib/draws"
import type { ChartAnchor, LiveCursor, SketchReading } from "@/lib/chart-draw"
import { cn } from "@/lib/utils"

function formatValue(value: number) {
  return value.toLocaleString("fr-FR", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 0,
  })
}

function magnetLabel(point: LiveCursor) {
  if (point.offCurve) return "hors courbe · Alt"
  if (!point.snapped) return "libre — approche la courbe"
  if (point.kind === "extrema") return "aimant · pivot"
  return "aimant · tirage"
}

function AnchorRow({
  label,
  anchor,
  total,
}: {
  label: string
  anchor: ChartAnchor | null
  total: number
}) {
  if (!anchor) {
    return (
      <p className="text-muted-foreground">
        {label} : <span className="text-foreground/80">à poser</span>
      </p>
    )
  }
  return (
    <p>
      {label} :{" "}
      <span className="font-medium text-foreground">{formatDrawDate(anchor.date)}</span>
      <span className="text-muted-foreground">
        {" "}
        · {anchor.index + 1}/{total} · {formatValue(anchor.actual)}
        {anchor.snapped ? "" : " · hors courbe"}
      </span>
    </p>
  )
}

export function CoordHud({
  live,
  start,
  end,
  figureLabel,
  seriesLabel,
  reading,
  drawCount,
  hint,
}: {
  live: LiveCursor | null
  start: ChartAnchor | null
  end?: ChartAnchor | null
  figureLabel: string
  seriesLabel: string
  reading: SketchReading | null
  drawCount: number
  hint?: string | null
}) {
  const [mounted, setMounted] = useState(false)
  const [pinned, setPinned] = useState(false)
  const [dragged, setDragged] = useState<{ x: number; y: number } | null>(null)
  const dragRef = useRef<{ dx: number; dy: number } | null>(null)

  useEffect(() => {
    // Portail : le document n'existe pas au rendu serveur.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true)
  }, [])

  useEffect(() => {
    function onMove(event: PointerEvent) {
      if (!dragRef.current) return
      setDragged({
        x: event.clientX - dragRef.current.dx,
        y: event.clientY - dragRef.current.dy,
      })
    }
    function onUp() {
      dragRef.current = null
    }
    window.addEventListener("pointermove", onMove)
    window.addEventListener("pointerup", onUp)
    return () => {
      window.removeEventListener("pointermove", onMove)
      window.removeEventListener("pointerup", onUp)
    }
  }, [])

  if (!mounted) return null

  const follow = !pinned && !dragged && live
  const left = dragged
    ? dragged.x
    : follow
      ? Math.min(window.innerWidth - 280, Math.max(8, live.clientX + 18))
      : window.innerWidth - 288
  const top = dragged
    ? dragged.y
    : follow
      ? Math.min(window.innerHeight - 220, Math.max(8, live.clientY + 18))
      : 96

  const point = live

  return createPortal(
    <aside
      data-capture-ui
      role="status"
      aria-live="polite"
      className="fixed z-40 w-64 rounded-xl border border-border bg-card/95 p-3 text-xs shadow-2xl backdrop-blur-sm"
      style={{ left, top }}
    >
      <div
        className="mb-2 flex cursor-grab items-center justify-between gap-2 active:cursor-grabbing"
        onPointerDown={(event) => {
          const box = (event.currentTarget.parentElement as HTMLElement).getBoundingClientRect()
          dragRef.current = { dx: event.clientX - box.left, dy: event.clientY - box.top }
          setDragged({ x: box.left, y: box.top })
        }}
      >
        <p className="font-medium tracking-tight">Coordonnées</p>
        <button
          type="button"
          className="rounded-md border border-border p-1 text-muted-foreground hover:text-foreground"
          title={pinned ? "Suivre le curseur" : "Épingler"}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={() => {
            setPinned((current) => !current)
            setDragged(null)
          }}
        >
          {pinned ? <PinOff className="size-3.5" /> : <Pin className="size-3.5" />}
        </button>
      </div>
      <p className="text-muted-foreground">
        {figureLabel} · {seriesLabel}
      </p>
      {point ? (
        <div className="mt-2 space-y-0.5 font-mono tabular-nums">
          <p className="font-sans font-medium">{formatDrawDate(point.date)}</p>
          <p>
            tirage {point.index + 1}/{drawCount || "—"}
          </p>
          <p>valeur {formatValue(point.actual)}</p>
          <p
            className={cn(
              "font-sans",
              point.snapped ? "text-emerald-300" : "text-amber-200"
            )}
          >
            {magnetLabel(point)}
            {point.distancePx != null
              ? ` · ${point.distancePx.toLocaleString("fr-FR", { maximumFractionDigits: 0 })} px`
              : ""}
          </p>
        </div>
      ) : (
        <p className="mt-2 text-muted-foreground">Survole la courbe pour lire un point.</p>
      )}
      <div className="mt-2 space-y-0.5 border-t border-border pt-2">
        <AnchorRow label="Départ" anchor={start} total={drawCount} />
        <AnchorRow label="Arrivée" anchor={end ?? null} total={drawCount} />
      </div>
      {reading ? (
        <p className="mt-2 text-[11px] leading-4 text-muted-foreground">
          Détecteur : {reading.label} ({reading.confidence.toFixed(2)}). Aide à
          dessiner, pas une prédiction.
        </p>
      ) : null}
      {hint ? <p className="mt-2 text-[11px] leading-4 text-amber-200">{hint}</p> : null}
    </aside>,
    document.body
  )
}
