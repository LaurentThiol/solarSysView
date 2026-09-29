"use client"

import { useCallback, useEffect, useId, useRef, useState } from "react"

import { Button } from "@/components/ui/button"
import { isTypingTarget } from "@/lib/help-overlay"
import { liftDiagramContrast, prepareDiagramSource, SCHEMA_CANVAS, SCHEMA_MERMAID } from "@/lib/schemas/contrast"
import { figureFromSource } from "@/lib/schemas/parse"
import { refineSchemaSvg } from "@/lib/schemas/refine"
import { cn } from "@/lib/utils"

let queue: Promise<void> = Promise.resolve()

function enqueue<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(task, task)
  queue = run.then(
    () => undefined,
    () => undefined
  )
  return run
}

function clampScale(value: number) {
  return Math.min(5, Math.max(0.15, value))
}

export function SchemaDiagram({ source, label }: { source: string; label: string }) {
  const reactId = useId().replace(/[^a-zA-Z0-9]/g, "")
  const figure = figureFromSource(0, label, source)
  const stageRef = useRef<HTMLDivElement>(null)
  const frameRef = useRef<HTMLDivElement>(null)
  const fullButtonRef = useRef<HTMLButtonElement>(null)
  const scaleRef = useRef(1)
  const offsetRef = useRef({ x: 16, y: 16 })
  const interacted = useRef(false)
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null)
  const [markup, setMarkup] = useState<string | null>(null)
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading")
  const [error, setError] = useState<string | null>(null)
  const [scale, setScale] = useState(1)
  const [offset, setOffset] = useState({ x: 16, y: 16 })
  const [nativeFull, setNativeFull] = useState(false)
  const [fallbackFull, setFallbackFull] = useState(false)
  const [linksOpen, setLinksOpen] = useState(figure.links.length > 0)
  const [trackedSource, setTrackedSource] = useState(source)
  const full = nativeFull || fallbackFull

  if (trackedSource !== source) {
    setTrackedSource(source)
    setStatus("loading")
    setError(null)
    setMarkup(null)
  }

  const commit = useCallback((nextScale: number, nextOffset: { x: number; y: number }) => {
    scaleRef.current = nextScale
    offsetRef.current = nextOffset
    setScale(nextScale)
    setOffset(nextOffset)
  }, [])

  const fitNow = useCallback(() => {
    const frame = frameRef.current
    const svg = frame?.querySelector("svg")
    if (!frame || !svg) return
    refineSchemaSvg(svg)
    const box = svg.viewBox.baseVal
    const width = box?.width || svg.width.baseVal.value || 1
    const height = box?.height || svg.height.baseVal.value || 1
    const pad = 28
    const contain = Math.min((frame.clientWidth - pad) / width, (frame.clientHeight - pad) / height)
    const readable = 0.55
    const next = contain >= readable ? contain : Math.min((frame.clientWidth - pad) / width, 1.35)
    const fitted = clampScale(Number.isFinite(next) && next > 0 ? next : 1)
    const drawnHeight = height * fitted
    commit(fitted, {
      x: (frame.clientWidth - width * fitted) / 2,
      y: drawnHeight + pad <= frame.clientHeight ? (frame.clientHeight - drawnHeight) / 2 : 16,
    })
  }, [commit])

  const zoomBy = useCallback(
    (factor: number) => {
      const frame = frameRef.current
      if (!frame) return
      interacted.current = true
      const prev = scaleRef.current
      const next = clampScale(prev * factor)
      const px = frame.clientWidth / 2
      const py = frame.clientHeight / 2
      const origin = offsetRef.current
      commit(next, {
        x: px - ((px - origin.x) / prev) * next,
        y: py - ((py - origin.y) / prev) * next,
      })
    },
    [commit]
  )

  const actualSize = () => {
    const frame = frameRef.current
    const svg = frame?.querySelector("svg")
    if (!frame || !svg) return
    interacted.current = true
    const width = svg.viewBox.baseVal.width || svg.width.baseVal.value
    const height = svg.viewBox.baseVal.height || svg.height.baseVal.value
    commit(1, {
      x: (frame.clientWidth - width) / 2,
      y: (frame.clientHeight - height) / 2,
    })
  }

  const toggleFull = useCallback(async () => {
    const node = stageRef.current
    if (!node) return
    interacted.current = false
    if (document.fullscreenElement === node || fallbackFull) {
      if (document.fullscreenElement) await document.exitFullscreen().catch(() => undefined)
      setFallbackFull(false)
      return
    }
    try {
      await node.requestFullscreen()
      fullButtonRef.current?.focus()
    } catch {
      setFallbackFull(true)
      fullButtonRef.current?.focus()
    }
  }, [fallbackFull])

  useEffect(() => {
    let cancel = false
    const id = `synchroSchema${reactId}${Date.now().toString(36)}`
    enqueue(async () => {
      const mermaid = (await import("mermaid")).default
      const fontFamily = getComputedStyle(document.body).fontFamily || SCHEMA_MERMAID.fontFamily
      mermaid.initialize({ ...SCHEMA_MERMAID, fontFamily })
      const prepared = prepareDiagramSource(source)
      try {
        return (await mermaid.render(id, prepared)).svg
      } catch (renderError) {
        if (prepared === source.trim()) throw renderError
        return (await mermaid.render(`${id}b`, source)).svg
      }
    })
      .then((svg) => {
        if (cancel) return
        if (/<script/i.test(svg)) {
          setMarkup(null)
          setStatus("error")
          setError("Schéma refusé.")
          return
        }
        setMarkup(liftDiagramContrast(svg))
        setStatus("ready")
      })
      .catch((reason: unknown) => {
        if (cancel) return
        setMarkup(null)
        setStatus("error")
        setError(reason instanceof Error ? reason.message : "Schéma illisible.")
      })
    return () => {
      cancel = true
    }
  }, [reactId, source])

  useEffect(() => {
    interacted.current = false
  }, [markup])

  useEffect(() => {
    if (!markup) return
    const id = requestAnimationFrame(() => fitNow())
    return () => cancelAnimationFrame(id)
  }, [markup, nativeFull, fallbackFull, fitNow])

  useEffect(() => {
    const frame = frameRef.current
    if (!frame || !markup) return
    const observer = new ResizeObserver(() => {
      if (!interacted.current) fitNow()
    })
    observer.observe(frame)
    return () => observer.disconnect()
  }, [markup, fitNow])

  useEffect(() => {
    const onChange = () => {
      const active = document.fullscreenElement === stageRef.current
      setNativeFull(active)
      if (active) setFallbackFull(false)
    }
    document.addEventListener("fullscreenchange", onChange)
    return () => document.removeEventListener("fullscreenchange", onChange)
  }, [])

  useEffect(() => {
    if (!fallbackFull) return
    const previous = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = previous
    }
  }, [fallbackFull])

  useEffect(() => {
    const frame = frameRef.current
    if (!frame) return
    const onWheel = (event: WheelEvent) => {
      if (!full && !event.ctrlKey && !event.metaKey) return
      event.preventDefault()
      interacted.current = true
      const prev = scaleRef.current
      const next = clampScale(prev * (event.deltaY < 0 ? 1.08 : 0.92))
      const rect = frame.getBoundingClientRect()
      const px = event.clientX - rect.left
      const py = event.clientY - rect.top
      const origin = offsetRef.current
      commit(next, {
        x: px - ((px - origin.x) / prev) * next,
        y: py - ((py - origin.y) / prev) * next,
      })
    }
    frame.addEventListener("wheel", onWheel, { passive: false })
    return () => frame.removeEventListener("wheel", onWheel)
  }, [commit, full, markup])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const node = stageRef.current
      if (!node) return
      const owns = document.fullscreenElement === node || fallbackFull || node.contains(document.activeElement)
      if (!owns) return
      if (event.altKey || event.ctrlKey || event.metaKey) return
      if (isTypingTarget(event.target)) return
      if (event.key === "f" || event.key === "F") {
        event.preventDefault()
        void toggleFull()
      } else if (event.key === "+" || event.key === "=") {
        event.preventDefault()
        zoomBy(1.12)
      } else if (event.key === "-" || event.key === "_") {
        event.preventDefault()
        zoomBy(1 / 1.12)
      } else if (event.key === "0") {
        event.preventDefault()
        interacted.current = false
        fitNow()
      } else if (event.key === "Escape" && fallbackFull) {
        setFallbackFull(false)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [fallbackFull, fitNow, toggleFull, zoomBy])

  return (
    <figure className="my-6" aria-label={label}>
      <div
        ref={stageRef}
        tabIndex={0}
        className={cn(
          "flex flex-col overflow-hidden rounded-2xl border border-border text-foreground outline-none",
          "[&:fullscreen]:h-full [&:fullscreen]:w-full [&:fullscreen]:rounded-none [&:fullscreen]:border-0",
          fallbackFull && "fixed inset-0 z-[80] h-auto min-h-0 rounded-none"
        )}
        style={{ background: SCHEMA_CANVAS }}
      >
        <div className="flex flex-wrap items-center gap-1.5 border-b border-white/15 px-3 py-2">
          <figcaption className="min-w-0 flex-1 truncate px-1 text-sm font-semibold text-foreground">{label}</figcaption>
          <Button
            size="xs"
            variant="outline"
            type="button"
            onClick={() => {
              interacted.current = false
              fitNow()
            }}
          >
            Ajuster
          </Button>
          <Button size="xs" variant="outline" type="button" onClick={actualSize}>
            100 %
          </Button>
          <Button size="xs" variant="outline" type="button" onClick={() => zoomBy(1 / 1.12)} aria-label="Réduire">
            −
          </Button>
          <span className="w-12 text-center text-sm font-medium tabular-nums text-foreground">{Math.round(scale * 100)} %</span>
          <Button size="xs" variant="outline" type="button" onClick={() => zoomBy(1.12)} aria-label="Agrandir">
            +
          </Button>
          <Button
            ref={fullButtonRef}
            size="xs"
            variant="outline"
            type="button"
            aria-pressed={full}
            onClick={() => void toggleFull()}
          >
            {full ? "Quitter le plein écran" : "Plein écran"}
          </Button>
          <Button
            size="xs"
            variant="outline"
            type="button"
            aria-expanded={linksOpen}
            onClick={() => setLinksOpen((open) => !open)}
          >
            Liens{figure.links.length ? ` · ${figure.links.length}` : ""}
          </Button>
        </div>
        <div
          ref={frameRef}
          className={cn("relative touch-none overflow-hidden", full ? "min-h-0 flex-1" : "h-[min(68vh,36rem)]")}
          onDoubleClick={() => {
            interacted.current = false
            fitNow()
          }}
          onPointerDown={(event) => {
            if (event.button !== 0) return
            drag.current = {
              x: event.clientX,
              y: event.clientY,
              ox: offsetRef.current.x,
              oy: offsetRef.current.y,
            }
            event.currentTarget.setPointerCapture(event.pointerId)
          }}
          onPointerMove={(event) => {
            const start = drag.current
            if (!start) return
            if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > 3) interacted.current = true
            commit(scaleRef.current, {
              x: start.ox + event.clientX - start.x,
              y: start.oy + event.clientY - start.y,
            })
          }}
          onPointerUp={() => {
            drag.current = null
          }}
        >
          {status === "loading" ? <p className="p-4 text-sm text-foreground">Tracé du schéma…</p> : null}
          {status === "error" ? (
            <div className="flex h-full flex-col gap-3 overflow-auto p-4">
              <p className="text-sm text-foreground" role="alert">
                Le dessin n’a pas pu être tracé. {error}
              </p>
              <pre className="font-mono text-sm leading-6 whitespace-pre-wrap text-foreground">{source}</pre>
            </div>
          ) : null}
          {markup ? (
            <div
              className="absolute top-0 left-0 origin-top-left"
              style={{ transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})` }}
              dangerouslySetInnerHTML={{ __html: markup }}
            />
          ) : null}
        </div>
        {linksOpen ? (
          <div className={cn("overflow-auto border-t border-white/15 px-4 py-3", full ? "max-h-[34%]" : "max-h-56")}>
            <h3 className="text-sm font-semibold text-foreground">Liens</h3>
            {figure.links.length ? (
              <ol className="mt-2 flex flex-col gap-1.5">
                {figure.links.map((link, index) => (
                  <li key={`${link.from}-${link.to}-${index}`} className="text-sm leading-6 text-foreground">
                    <span className="font-semibold">{link.fromLabel}</span>
                    <span className="px-1.5" aria-hidden>
                      →
                    </span>
                    <span className="font-semibold">{link.toLabel}</span>
                    {link.label ? <span> — {link.label}</span> : null}
                    {link.technology ? <span className="font-mono text-[0.92em]"> · {link.technology}</span> : null}
                  </li>
                ))}
              </ol>
            ) : (
              <p className="mt-2 text-sm text-foreground">Ce dessin n’a pas de lien nommé.</p>
            )}
          </div>
        ) : null}
      </div>
    </figure>
  )
}
