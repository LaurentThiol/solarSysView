"use client"

import { useEffect, useLayoutEffect, useState } from "react"
import { createPortal } from "react-dom"
import { Play, RotateCcw, StopCircle } from "lucide-react"

import { BrainMascot } from "@/components/brain/brain-mascot"
import { HelpTip, type HelpCopy } from "@/components/help"
import { Button } from "@/components/ui/button"
import { DEMO_STEPS, type DemoStepId } from "@/lib/brain/demo"
import { DEMO_SPECIALIST_STEPS, type SpecialistDemoStepId } from "@/lib/brain/specialist-demo"
import { cn } from "@/lib/utils"

export function DemoTourBar({
  title,
  help,
  steps,
  step,
  running,
  done,
  waiting,
  idleHint,
  doneHint,
  onStart,
  onStop,
  startLabel = "Lancer la démo",
  replayLabel = "Rejouer",
  dataDemo = "bar",
}: {
  title: string
  help: HelpCopy
  steps: readonly { id: string; label: string; hint: string }[]
  step: string | null
  running: boolean
  done: boolean
  waiting?: boolean
  idleHint: string
  doneHint: string
  onStart: () => void
  onStop: () => void
  startLabel?: string
  replayLabel?: string
  dataDemo?: string
}) {
  const current = steps.find((item) => item.id === step)
  return (
    <div
      data-demo={dataDemo}
      className="rounded-2xl border border-primary/30 bg-primary/8 px-3 py-3 sm:px-4"
    >
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm font-medium">{title}</p>
        <HelpTip {...help} />
        <span className="text-[11px] text-muted-foreground">
          {running
            ? waiting && current
              ? `${current.label} — lis le pop-up, puis Suivant.`
              : current
                ? `${current.label} — ${current.hint}`
                : "en cours…"
            : done
              ? doneHint
              : idleHint}
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
              {done ? replayLabel : startLabel}
            </Button>
          )}
        </div>
      </div>
      <ol className="mt-3 flex flex-wrap gap-1.5">
        {steps.map((item, index) => {
          const active = item.id === step
          const passed = step != null && steps.findIndex((row) => row.id === step) > index
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
  return (
    <DemoTourBar
      title="Démo des fonctions"
      help={{
        title: "Démo Brain",
        body: "Parcourt vraiment l’onglet : fenêtre, épingles (@rsi, @ete, @fft, @cluster, @score), table, lecture sans modèle, suivi, mini-balayage, carnet. Un pop-up vous arrête après chaque phase : Suivant ou Annuler. Les chiffres viennent des tirages chargés. Ollama n’est pas requis.",
      }}
      steps={DEMO_STEPS}
      step={step}
      running={running}
      done={done}
      waiting={waiting}
      idleHint="Un handle par lab, lecture réelle, sans Ollama. Vous avancez à votre rythme."
      doneHint="Terminée : la table, le carnet et le balayage restent sous vos yeux."
      onStart={onStart}
      onStop={onStop}
    />
  )
}

export type DemoPopupStep = {
  id: string
  label: string
  title: string
  body: string
  target: string
}

export function DemoPopup({
  step,
  steps,
  open,
  onNext,
  onCancel,
  titleId = "demo-popup-title",
  nextId = "demo-next",
}: {
  step: string | null
  steps: readonly DemoPopupStep[]
  open: boolean
  onNext: () => void
  onCancel: () => void
  titleId?: string
  nextId?: string
}) {
  const [mounted, setMounted] = useState(false)
  const [placement, setPlacement] = useState<"top" | "bottom">("bottom")
  const current = step ? steps.find((item) => item.id === step) : undefined
  const index = step ? steps.findIndex((item) => item.id === step) : -1
  const last = index >= 0 && index === steps.length - 1

  useEffect(() => {
    setMounted(true)
  }, [])

  useLayoutEffect(() => {
    if (!open || !current) return
    const node = document.querySelector(`[data-demo="${current.target}"]`)
    const rect = node?.getBoundingClientRect()
    const mid = (rect?.top ?? 0) + (rect?.height ?? 0) / 2
    setPlacement(mid > window.innerHeight * 0.48 ? "top" : "bottom")
  }, [open, current])

  useEffect(() => {
    if (!open) return
    const timer = window.setTimeout(() => {
      document.getElementById(nextId)?.focus()
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
  }, [open, onCancel, onNext, nextId])

  if (!mounted || !open || !current) return null

  return createPortal(
    <div className="pointer-events-none fixed inset-0 z-[80]">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        data-demo="popup"
        className={cn(
          "pointer-events-auto absolute left-1/2 w-[min(28rem,calc(100vw-1.5rem))] -translate-x-1/2 rounded-2xl border border-primary/40 bg-popover p-4 text-popover-foreground shadow-2xl ring-1 ring-primary/20",
          placement === "top" ? "top-16 sm:top-20" : "bottom-4 sm:bottom-6"
        )}
      >
        <div className="flex items-start gap-3">
          <BrainMascot mood="talk" size="sm" className="mt-0.5" />
          <div className="min-w-0 flex-1">
            <p className="text-[11px] tracking-wide text-muted-foreground uppercase">
              Étape {index + 1} / {steps.length} · {current.label}
            </p>
            <h2 id={titleId} className="mt-0.5 text-base font-medium">
              {current.title}
            </h2>
            <p className="mt-1.5 text-sm leading-6 text-muted-foreground">{current.body}</p>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
          <Button type="button" size="sm" variant="outline" onClick={onCancel}>
            Annuler
          </Button>
          <Button id={nextId} type="button" size="sm" onClick={onNext}>
            {last ? "Terminer" : "Suivant"}
          </Button>
        </div>
      </div>
    </div>,
    document.body
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
  return (
    <DemoPopup
      step={step}
      steps={DEMO_STEPS}
      open={open}
      onNext={onNext}
      onCancel={onCancel}
      titleId="brain-demo-popup-title"
      nextId="brain-demo-next"
    />
  )
}

export function SpecialistDemoPopup({
  step,
  open,
  onNext,
  onCancel,
}: {
  step: SpecialistDemoStepId | null
  open: boolean
  onNext: () => void
  onCancel: () => void
}) {
  return (
    <DemoPopup
      step={step}
      steps={DEMO_SPECIALIST_STEPS}
      open={open}
      onNext={onNext}
      onCancel={onCancel}
      titleId="specialist-demo-popup-title"
      nextId="specialist-demo-next"
    />
  )
}
