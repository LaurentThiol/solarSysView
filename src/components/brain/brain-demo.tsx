"use client"

import { Play, RotateCcw, StopCircle } from "lucide-react"

import { HelpTip, type HelpCopy } from "@/components/help"
import { Button } from "@/components/ui/button"
import { DEMO_STEPS, type DemoStepId } from "@/lib/brain/demo"
import { cn } from "@/lib/utils"

export function DemoTourBar({
  title,
  help,
  steps,
  step,
  running,
  done,
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
            ? current
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
  onStart,
  onStop,
}: {
  step: DemoStepId | null
  running: boolean
  done: boolean
  onStart: () => void
  onStop: () => void
}) {
  return (
    <DemoTourBar
      title="Démo des fonctions"
      help={{
        title: "Démo Brain",
        body: "Parcourt vraiment l’onglet : fenêtre, épingles (@rsi, @ete, @fft, @cluster, @score), table, lecture sans modèle, suivi, mini-balayage, carnet. Les chiffres viennent des tirages chargés. Ollama n’est pas requis. Une pastille s’ouvre sur chaque étape.",
      }}
      steps={DEMO_STEPS}
      step={step}
      running={running}
      done={done}
      idleHint="Un handle par lab, lecture réelle, sans Ollama."
      doneHint="Terminée : la table, le carnet et le balayage restent sous tes yeux."
      onStart={onStart}
      onStop={onStop}
    />
  )
}
