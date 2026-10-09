"use client"

import { useEffect, useState } from "react"

import { formatRunClock } from "@/lib/nextdata/bands"
import { cn } from "@/lib/utils"

/** Barre d’un calcul long. Le pourcentage ne bouge qu’à chaque pas rendu :
 *  entre deux réponses, le trait défile et le temps écoulé avance. */
export function StepMeter({
  percent,
  label,
  ariaLabel,
}: {
  percent: number
  label: string
  ariaLabel: string
}) {
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    const started = Date.now()
    const id = window.setInterval(() => {
      setElapsed(Math.floor((Date.now() - started) / 1000))
    }, 1000)
    return () => window.clearInterval(id)
  }, [])

  const indeterminate = percent <= 0

  return (
    <div className="flex max-w-md flex-col gap-2" data-step-meter>
      <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
        <span className="inline-flex min-w-0 items-center gap-2">
          <span className="relative flex size-2 shrink-0" aria-hidden>
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary opacity-75" />
            <span className="relative inline-flex size-2 rounded-full bg-primary" />
          </span>
          <span aria-live="polite" className="min-w-0">
            {label}
            <span className="train-dots" aria-hidden>
              <span />
              <span />
              <span />
            </span>
          </span>
        </span>
        <span className="shrink-0 tabular-nums" title="Temps écoulé depuis le lancement">
          {percent} % · depuis {formatRunClock(elapsed)}
        </span>
      </div>
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        aria-label={ariaLabel}
        aria-busy="true"
        className="relative h-2 overflow-hidden rounded-full bg-muted"
      >
        <div
          className={cn(
            "h-full rounded-full bg-primary",
            indeterminate ? "train-travel" : "transition-[width] duration-500 ease-out"
          )}
          style={indeterminate ? undefined : { width: `${percent}%` }}
        />
        {indeterminate ? null : <span className="train-sheen" aria-hidden />}
      </div>
    </div>
  )
}
