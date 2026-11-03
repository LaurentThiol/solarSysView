"use client"

import { useSyncExternalStore } from "react"

import { HelpTip } from "@/components/help"
import { Badge } from "@/components/ui/badge"
import { raceChrome, type RaceChromeInput } from "@/lib/run-arcade/chrome"
import { balanceWithChance } from "@/lib/run-arcade/examen"
import { RUN_ARCADE_HELP } from "@/lib/run-arcade/help"
import type { SessionSnapshot } from "@/lib/run-arcade/session"
import type { RunnerLive } from "@/lib/run-arcade/thought"

const clock = (() => {
  let value = 0
  let timer: number | null = null
  const listeners = new Set<() => void>()
  return {
    subscribe(listener: () => void) {
      listeners.add(listener)
      if (timer == null) {
        value = Date.now()
        timer = window.setInterval(() => {
          value = Date.now()
          for (const item of listeners) item()
        }, 500)
      }
      return () => {
        listeners.delete(listener)
        if (listeners.size === 0 && timer != null) {
          window.clearInterval(timer)
          timer = null
        }
      }
    },
    get: () => value,
    server: () => 0,
  }
})()

const idleSubscribe = () => () => {}
const idleNow = () => 0

/** L’heure, rafraîchie deux fois par seconde. Éteinte : aucun abonnement, aucun rendu. */
function useClock(active: boolean) {
  return useSyncExternalStore(active ? clock.subscribe : idleSubscribe, active ? clock.get : idleNow, clock.server)
}

/**
 * La bande de la course : phase, génération, tour, temps qui reste, meilleur solde, barre.
 * Elle seule suit l’horloge, et seulement quand un décompte tourne : le reste du lab ne se redessine pas.
 */
export function LiveBand({
  snapshot,
  input,
  leader,
  championTurns,
}: {
  snapshot: SessionSnapshot
  input: Omit<RaceChromeInput, "remainingMs">
  leader: RunnerLive | null
  championTurns: number
}) {
  const endsAt = snapshot.phaseEndsAt
  const counting = endsAt != null && snapshot.pausedLeftMs == null && snapshot.minutes > 0
  const now = useClock(counting)
  const remainingMs = snapshot.pausedLeftMs ?? (counting && now > 0 ? Math.max(0, endsAt - now) : null)
  const band = raceChrome({ ...input, remainingMs }).band
  if (!band) return null
  return (
    <div className="flex flex-col gap-2 text-foreground" data-testid="run-arcade-live">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <Badge variant="secondary">{band.badge}</Badge>
        <span>Génération {band.generation}</span>
        {band.tour ? <span>{band.tour}</span> : null}
        {band.remaining ? <span className="font-medium tabular-nums">{band.remaining}</span> : null}
        {leader && snapshot.phase === "course" ? (
          <span>
            meilleur {leader.mind.name} {balanceWithChance(leader.cents, leader.turns)}
          </span>
        ) : null}
        {snapshot.phase === "fin" && snapshot.champion ? (
          <span>
            champion {snapshot.champion.runner} {balanceWithChance(snapshot.champion.cents, championTurns)}
          </span>
        ) : null}
        <HelpTip {...RUN_ARCADE_HELP.statut} />
      </div>
      {band.fraction != null && band.barNow != null && band.barMax != null ? (
        <div
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={band.barMax}
          aria-valuenow={band.barNow}
          aria-label={band.barLabel ?? "Avancement"}
          className="h-2 overflow-hidden rounded-full bg-muted"
        >
          <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${band.fraction * 100}%` }} />
        </div>
      ) : null}
    </div>
  )
}
