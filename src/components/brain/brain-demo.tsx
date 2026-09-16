"use client"

import { Play, RotateCcw, StopCircle } from "lucide-react"

import { HelpTip } from "@/components/help"
import { Button } from "@/components/ui/button"
import { DEMO_STEPS, type DemoStepId } from "@/lib/brain/demo"
import { cn } from "@/lib/utils"

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
  const current = DEMO_STEPS.find((item) => item.id === step)
  return (
    <div
      data-demo="bar"
      className="rounded-2xl border border-primary/30 bg-primary/8 px-3 py-3 sm:px-4"
    >
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm font-medium">Démo des fonctions</p>
        <HelpTip
          title="Démo Brain"
          body="Parcourt vraiment l’onglet : fenêtre, épingles (@rsi, @ete, @fft, @cluster, @score), table, lecture sans modèle, suivi, mini-balayage, carnet. Les chiffres viennent des tirages chargés. Ollama n’est pas requis."
        />
        <span className="text-[11px] text-muted-foreground">
          {running
            ? current
              ? `${current.label} — ${current.hint}`
              : "en cours…"
            : done
              ? "Terminée : la table, le carnet et le balayage restent sous tes yeux."
              : "Un handle par lab, lecture réelle, sans Ollama."}
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
          const passed =
            step != null && DEMO_STEPS.findIndex((row) => row.id === step) > index
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
