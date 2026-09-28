"use client"

import { useEffect, useMemo, useRef, useState } from "react"

import { Button } from "@/components/ui/button"
import { nullHistogram } from "@/lib/brain/decision-tree-view"
import { cn } from "@/lib/utils"

const STAGES = [
  { id: "tableau", label: "Tableau" },
  { id: "recherche", label: "Recherche" },
  { id: "remaniements", label: "Remaniements" },
  { id: "dessin", label: "Dessin" },
] as const

export function stageIndex(stage: string | null | undefined) {
  if (stage === "fait") return STAGES.length
  const index = STAGES.findIndex((item) => item.id === stage)
  return index < 0 ? 0 : index
}

export function ReadingProgress({
  stage,
  k,
  n,
  running,
}: {
  stage?: string | null
  k?: number
  n?: number
  running?: boolean
}) {
  const index = stageIndex(stage)
  const perm = stage === "remaniements" && n ? `${k ?? 0}/${n}` : null
  return (
    <ol data-demo="tree-progress" className="grid gap-2 sm:grid-cols-4" aria-label="Étapes de la lecture">
      {STAGES.map((item, itemIndex) => {
        const done = index > itemIndex || stage === "fait"
        const current = running && item.id === stage
        return (
          <li
            key={item.id}
            className={cn(
              "rounded-xl border px-3 py-2 text-xs",
              done ? "border-chart-3/40 bg-chart-3/10" : current ? "border-primary/50 bg-primary/10" : "border-border text-muted-foreground"
            )}
          >
            <p className="font-medium text-foreground">{item.label}</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              {current && perm ? perm : done ? "fait" : current ? "en cours" : "en attente"}
            </p>
          </li>
        )
      })}
    </ol>
  )
}

export function NullScoreHistogram({ scores, real }: { scores: number[]; real: number }) {
  const hist = useMemo(() => nullHistogram(scores, real, 12), [scores, real])
  const max = Math.max(1, ...hist.bins.map((bin) => bin.count))
  return (
    <div className="flex flex-col gap-2">
      <div className="flex h-28 items-end gap-1" aria-hidden>
        {hist.bins.map((bin, index) => (
          <div key={index} className="flex h-full min-w-0 flex-1 flex-col justify-end">
            <div
              className={cn("rounded-t-sm", index === hist.realAt ? "bg-primary" : "bg-muted-foreground/35")}
              style={{ height: `${Math.max(6, (bin.count / max) * 100)}%` }}
            />
          </div>
        ))}
      </div>
      <p className="text-[11px] text-muted-foreground">
        Histogramme des {scores.length} scores sur l’ordre détruit. La barre marquée est celle du score réel ({real.toFixed(2)}).
      </p>
    </div>
  )
}

function viewBoxOf(svg: string) {
  const match = svg.match(/viewBox="\s*([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s*"/)
  if (!match) return { width: 900, height: 640 }
  return { width: Number(match[3]) || 900, height: Number(match[4]) || 640 }
}

function safeSvg(svg: string) {
  return svg.replace(/<script[\s\S]*?<\/script>/gi, "")
}

export function TreeViewport({
  svg,
  text,
  label,
  compact = false,
  fallbackHint = true,
}: {
  svg?: string | null
  text?: string | null
  label: string
  compact?: boolean
  fallbackHint?: boolean
}) {
  const frame = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(1)
  const [offset, setOffset] = useState({ x: 16, y: 16 })
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null)
  const box = svg ? viewBoxOf(svg) : { width: 640, height: 360 }

  const fit = () => {
    const node = frame.current
    if (!node) return
    const next = Math.min((node.clientWidth - 24) / box.width, (node.clientHeight - 24) / box.height)
    setScale(Number.isFinite(next) && next > 0 ? next : 1)
    setOffset({ x: 12, y: 12 })
  }

  useEffect(() => {
    fit()
    // Recalcule quand le dessin change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [svg])

  if (!svg) {
    return (
      <div className="flex flex-col gap-2">
        <pre className="max-h-[28rem] overflow-auto rounded-xl bg-[#f4f1ea] p-3 font-mono text-[12px] leading-5 text-[#2a2824]">
          {text || "Arbre indisponible."}
        </pre>
        {fallbackHint ? (
          <p className="text-[11px] text-muted-foreground">
            Sans <span className="font-mono">dot</span>, le dessin dtreeviz n’est pas possible. Relance <span className="font-mono">./launch</span> : il tente d’installer Graphviz. Réparation : <span className="font-mono">./launch install-decision-tree</span>.
          </p>
        ) : null}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      {compact ? null : (
      <div className="flex flex-wrap gap-1.5">
        <Button size="xs" variant="outline" type="button" onClick={fit}>
          Ajuster
        </Button>
        <Button size="xs" variant="outline" type="button" onClick={() => setScale(1)}>
          100 %
        </Button>
        <Button
          size="xs"
          variant="outline"
          type="button"
          onClick={() => {
            const node = frame.current
            if (!node) return
            if (document.fullscreenElement) void document.exitFullscreen()
            else void node.requestFullscreen()
          }}
        >
          Plein écran
        </Button>
      </div>
      )}
      <div
        ref={frame}
        className={cn(
          "relative overflow-hidden rounded-2xl bg-[#f4f1ea]",
          compact ? "h-36" : "h-[28rem]"
        )}
        aria-label={label}
        role="img"
        onWheel={(event) => {
          if (!event.ctrlKey && !event.metaKey) return
          event.preventDefault()
          const factor = event.deltaY < 0 ? 1.08 : 0.92
          setScale((prev) => Math.min(4, Math.max(0.15, prev * factor)))
        }}
        onPointerDown={(event) => {
          if (event.button !== 0) return
          drag.current = { x: event.clientX, y: event.clientY, ox: offset.x, oy: offset.y }
          event.currentTarget.setPointerCapture(event.pointerId)
        }}
        onPointerMove={(event) => {
          const start = drag.current
          if (!start) return
          setOffset({ x: start.ox + event.clientX - start.x, y: start.oy + event.clientY - start.y })
        }}
        onPointerUp={() => {
          drag.current = null
        }}
      >
        <div
          className="absolute top-0 left-0 origin-top-left"
          style={{ transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})` }}
          dangerouslySetInnerHTML={{ __html: safeSvg(svg) }}
        />
      </div>
      {compact ? null : (
        <p className="text-[11px] text-muted-foreground">
          Glisser pour déplacer, Ctrl + molette pour zoomer. Les histogrammes montrent l’apprentissage. Le contrôle est dans la liste, feuille par feuille.
        </p>
      )}
    </div>
  )
}
