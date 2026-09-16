"use client"

import { useEffect, useLayoutEffect, useState } from "react"
import { createPortal } from "react-dom"
import { Play, RotateCcw, StopCircle } from "lucide-react"

import { BrainMascot } from "@/components/brain/brain-mascot"
import { HelpTip } from "@/components/help"
import { Button } from "@/components/ui/button"
import {
  DEMO_STEPS,
  demoStepIndex,
  demoStepOf,
  isLastDemoStep,
  type DemoStepId,
} from "@/lib/brain/demo"
import { cn } from "@/lib/utils"

export function BrainDemoBar({
  step,
  running,
  done,
  waiting,
  onStart,
  onStop,
}: {
  step: DemoStepId | null
  running: boolean
  done: boolean
  waiting?: boolean
  onStart: () => void
  onStop: () => void
}) {
  const current = step ? demoStepOf(step) : null
  return (
    <div
      data-demo="bar"
      className="rounded-2xl border border-primary/30 bg-primary/8 px-3 py-3 sm:px-4"
    >
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm font-medium">Démo des fonctions</p>
        <HelpTip
          title="Démo Brain"
          body="Parcourt vraiment l’onglet : fenêtre, épingles (@rsi, @ete, @fft, @cluster, @score), table, lecture sans modèle, suivi, mini-balayage, carnet. Un pop-up t’arrête après chaque phase : Suivant ou Annuler. Les chiffres viennent des tirages chargés. Ollama n’est pas requis."
        />
        <span className="text-[11px] text-muted-foreground">
          {running
            ? waiting && current
              ? `${current.label} — lis le pop-up, puis Suivant.`
              : current
                ? `${current.label} — ${current.hint}`
                : "en cours…"
            : done
              ? "Terminée : la table, le carnet et le balayage restent sous tes yeux."
              : "Un handle par lab, lecture réelle, sans Ollama. Tu avances à ton rythme."}
        </span>
        <div className="ml-auto flex gap-1.5">
          {running ? (
            <Button size="sm" variant="outline" onClick={onStop}>
              <StopCircle />
              Arrêter
            </Button>
          ) : (
            <Button size="sm" onClick={onStart}>
              {done ? <RotateCcw /> : <Play />}
              {done ? "Rejouer" : "Lancer la démo"}
            </Button>
          )}
        </div>
      </div>
      <ol className="mt-3 flex flex-wrap gap-1.5">
        {DEMO_STEPS.map((item, index) => {
          const active = item.id === step
          const passed = step != null && demoStepIndex(step) > index
          return (
            <li
              key={item.id}
              className={cn(
                "rounded-full border px-2.5 py-0.5 text-[11px]",
                active
                  ? "border-primary bg-primary/20 text-foreground"
                  : passed
                    ? "border-primary/35 bg-background/50 text-foreground"
                    : "border-border/70 text-muted-foreground"
              )}
            >
              {index + 1}. {item.label}
            </li>
          )
        })}
      </ol>
    </div>
  )
}

export function BrainDemoPopup({
  step,
  open,
  onNext,
  onCancel,
}: {
  step: DemoStepId | null
  open: boolean
  onNext: () => void
  onCancel: () => void
}) {
  const [mounted, setMounted] = useState(false)
  const [placement, setPlacement] = useState<"top" | "bottom">("bottom")

  useEffect(() => {
    setMounted(true)
  }, [])

  useLayoutEffect(() => {
    if (!open || !step) return
    const target = demoStepOf(step).target
    const node = document.querySelector(`[data-demo="${target}"]`)
    const rect = node?.getBoundingClientRect()
    const mid = (rect?.top ?? 0) + (rect?.height ?? 0) / 2
    setPlacement(mid > window.innerHeight * 0.48 ? "top" : "bottom")
  }, [open, step])

  useEffect(() => {
    if (!open) return
    const timer = window.setTimeout(() => {
      document.getElementById("brain-demo-next")?.focus()
    }, 30)
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault()
        onCancel()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener("keydown", onKey)
    }
  }, [open, onCancel, onNext])

  if (!mounted || !open || !step) return null
  const current = demoStepOf(step)
  const index = demoStepIndex(step)
  const last = isLastDemoStep(step)

  return createPortal(
    <div className="pointer-events-none fixed inset-0 z-[80]">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="brain-demo-popup-title"
        data-demo="popup"
        className={cn(
          "pointer-events-auto absolute left-1/2 w-[min(28rem,calc(100vw-1.5rem))] -translate-x-1/2 rounded-2xl border border-primary/40 bg-popover p-4 text-popover-foreground shadow-2xl ring-1 ring-primary/20",
          placement === "top" ? "top-4 sm:top-6" : "bottom-4 sm:bottom-6"
        )}
      >
        <div className="flex items-start gap-3">
          <BrainMascot mood="talk" size="sm" className="mt-0.5" />
          <div className="min-w-0 flex-1">
            <p className="text-[11px] tracking-wide text-muted-foreground uppercase">
              Étape {index + 1} / {DEMO_STEPS.length} · {current.label}
            </p>
            <h2 id="brain-demo-popup-title" className="mt-0.5 text-base font-medium">
              {current.title}
            </h2>
            <p className="mt-1.5 text-sm leading-6 text-muted-foreground">{current.body}</p>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
          <Button type="button" size="sm" variant="outline" onClick={onCancel}>
            Annuler
          </Button>
          <Button id="brain-demo-next" type="button" size="sm" onClick={onNext}>
            {last ? "Terminer" : "Suivant"}
          </Button>
        </div>
      </div>
    </div>,
    document.body
  )
}
