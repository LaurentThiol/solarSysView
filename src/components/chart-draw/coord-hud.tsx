"use client"

import { useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { PanelTop, PictureInPicture2 } from "lucide-react"

import { formatDrawDate } from "@/lib/draws"
import { clampHudPosition, type ChartAnchor, type LiveCursor, type SketchReading } from "@/lib/chart-draw"
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
  mid,
  end,
  rails,
  figureLabel,
  seriesLabel,
  reading,
  drawCount,
  hint,
}: {
  live: LiveCursor | null
  start: ChartAnchor | null
  mid?: ChartAnchor | null
  end?: ChartAnchor | null
  rails?: boolean
  figureLabel: string
  seriesLabel: string
  reading: SketchReading | null
  drawCount: number
  hint?: string | null
}) {
  const [mounted, setMounted] = useState(false)
  const [detached, setDetached] = useState(false)
  const [dragged, setDragged] = useState<{ x: number; y: number } | null>(null)
  const [size, setSize] = useState({ width: 288, height: 200 })
  const boxRef = useRef<HTMLElement | null>(null)
  const dragRef = useRef<{ dx: number; dy: number } | null>(null)

  useEffect(() => {
    // Portail : le document n'existe pas au rendu serveur.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true)
  }, [])

  useEffect(() => {
    if (!detached) return
    function onMove(event: PointerEvent) {
      if (!dragRef.current) return
      setDragged(
        clampHudPosition({
          x: event.clientX - dragRef.current.dx,
          y: event.clientY - dragRef.current.dy,
          width: size.width,
          height: size.height,
          viewW: window.innerWidth,
          viewH: window.innerHeight,
        })
      )
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
  }, [detached, size.height, size.width])

  useEffect(() => {
    if (!detached || !boxRef.current) return
    const box = boxRef.current.getBoundingClientRect()
    setSize({ width: box.width, height: box.height })
  }, [detached, live, start, mid, end, reading, hint])

  const point = live
  const parked = dragged
    ? clampHudPosition({
        x: dragged.x,
        y: dragged.y,
        width: size.width,
        height: size.height,
        viewW: typeof window === "undefined" ? 1280 : window.innerWidth,
        viewH: typeof window === "undefined" ? 800 : window.innerHeight,
      })
    : null
  const floatStyle =
    detached && parked ? { left: parked.x, top: parked.y } : undefined

  function detach() {
    const box = boxRef.current?.getBoundingClientRect()
    const next = clampHudPosition({
      x: box?.left ?? 16,
      y: box?.top ?? 96,
      width: box?.width ?? size.width,
      height: box?.height ?? size.height,
      viewW: window.innerWidth,
      viewH: window.innerHeight,
    })
    if (box) setSize({ width: box.width, height: box.height })
    setDragged(next)
    setDetached(true)
  }

  function redock() {
    dragRef.current = null
    setDragged(null)
    setDetached(false)
  }

  const panel = (
    <aside
      ref={boxRef}
      data-capture-ui
      data-coord-hud={detached ? "float" : "docked"}
      role="status"
      aria-live="polite"
      className={cn(
        "text-xs",
        detached
          ? "fixed z-40 w-72 rounded-xl border border-border bg-card/95 p-3 shadow-2xl backdrop-blur-sm"
          : "rounded-lg border border-border bg-muted/30 px-3 py-2"
      )}
      style={floatStyle}
    >
      <div
        className={cn(
          "mb-1.5 flex items-start justify-between gap-2",
          detached && "cursor-grab active:cursor-grabbing"
        )}
        onPointerDown={
          detached
            ? (event) => {
                const box = (event.currentTarget.parentElement as HTMLElement).getBoundingClientRect()
                dragRef.current = { dx: event.clientX - box.left, dy: event.clientY - box.top }
                setDragged({ x: box.left, y: box.top })
              }
            : undefined
        }
      >
        <p>
          <span className="font-medium tracking-tight">Coordonnées</span>
          <span className="text-muted-foreground">
            {" "}
            · {figureLabel} · {seriesLabel}
          </span>
        </p>
        <button
          type="button"
          className="rounded-md border border-border p-1 text-muted-foreground hover:text-foreground"
          title={detached ? "Réancrer au-dessus du graphique" : "Détacher et glisser hors du graphique"}
          aria-label={detached ? "Réancrer les coordonnées" : "Détacher les coordonnées"}
          aria-pressed={detached}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={() => (detached ? redock() : detach())}
        >
          {detached ? <PanelTop className="size-3.5" /> : <PictureInPicture2 className="size-3.5" />}
        </button>
      </div>
      {hint ? <p className="mb-1 text-[11px] leading-4 text-amber-200">{hint}</p> : null}
      {point ? (
        <p className="font-mono tabular-nums">
          <span className="font-sans font-medium">{formatDrawDate(point.date)}</span>
          <span className="text-muted-foreground">
            {" "}
            · tirage {point.index + 1}/{drawCount || "—"} · valeur {formatValue(point.actual)}
            {point.axis != null ? ` · axe ${formatValue(point.axis)} %` : ""}
            {point.sma != null
              ? ` · SMA ${formatValue(point.sma)}${
                  point.smaAxis != null ? ` · axe ${formatValue(point.smaAxis)} %` : ""
                }`
              : ""}
          </span>
          <span
            className={cn(
              "font-sans",
              point.snapped ? "text-emerald-300" : "text-amber-200"
            )}
          >
            {" "}
            · {magnetLabel(point)}
            {point.distancePx != null
              ? ` · ${point.distancePx.toLocaleString("fr-FR", { maximumFractionDigits: 0 })} px`
              : ""}
          </span>
        </p>
      ) : (
        <p className="text-muted-foreground">Survole la courbe pour lire un point.</p>
      )}
      <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5">
        <AnchorRow label={rails ? "Borne 1" : "Départ"} anchor={start} total={drawCount} />
        {rails ? <AnchorRow label="Borne 1 · 2" anchor={mid ?? null} total={drawCount} /> : null}
        <AnchorRow
          label={rails ? "Contact opposé" : "Arrivée"}
          anchor={end ?? null}
          total={drawCount}
        />
      </div>
      {reading ? (
        <p className="mt-1 text-[11px] leading-4 text-muted-foreground">
          Détecteur : {reading.label} ({reading.confidence.toFixed(2)}). Aide à
          dessiner, pas une prédiction.
        </p>
      ) : null}
    </aside>
  )

  if (detached && mounted) {
    return (
      <>
        <div
          aria-hidden
          data-capture-ui
          data-coord-hud-slot
          className="flex items-center rounded-lg border border-dashed border-border/70 px-3 py-2 text-xs text-muted-foreground"
          style={{ minHeight: size.height }}
        >
          Carte détachée — glisse-la hors du graphique, ou réancre-la.
        </div>
        {createPortal(panel, document.body)}
      </>
    )
  }
  return panel
}
