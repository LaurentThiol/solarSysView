import { formatDuration } from "./clock"
import type { SessionPhase } from "./session"

export type ControlVariant = "default" | "secondary" | "outline"

export type RaceControl = {
  label: string
  variant: ControlVariant
  disabled: boolean
}

export type RaceBadge = "Avant-course" | "En course" | "En pause" | "Finie"

export type RaceBand = {
  badge: RaceBadge
  generation: number
  /** « tour 5 / 25 » en course. Absent en avant-course et à la fin. */
  tour: string | null
  /** Temps restant de l’avant-course ou de la tranche. Absent sans horloge, et à la fin. */
  remaining: string | null
  /** 0–1. Absent à la fin, ou tant que le temps restant n’est pas connu. */
  fraction: number | null
  barLabel: string | null
  barNow: number | null
  barMax: number | null
}

export type RaceChrome = {
  launch: RaceControl
  pause: RaceControl
  step: RaceControl
  /** Phrase de premier plan quand il n’y a pas de bande : attente, ou erreur. */
  lead: string | null
  band: RaceBand | null
}

export type RaceChromeInput = {
  phase: SessionPhase
  paused: boolean
  error: string | null
  /** Archive assez longue pour ouvrir une génération. */
  canLaunch: boolean
  generation: number
  race: { cursor: number; start: number; end: number } | null
  minutes: number
  remainingMs: number | null
}

const IDLE_LEAD =
  "Choisissez le nombre de runners, les tirages de course et les minutes d’avant-course. Rayons X, avant de lancer, montre la préparation et chaque tour."

function control(label: string, tone: ControlVariant, enabled: boolean): RaceControl {
  return { label, variant: enabled ? tone : "outline", disabled: !enabled }
}

function clamp01(value: number) {
  if (!Number.isFinite(value)) return 0
  return Math.min(1, Math.max(0, value))
}

function leftLabel(remainingMs: number | null) {
  return remainingMs != null && Number.isFinite(remainingMs) ? formatDuration(remainingMs) : "—"
}

function courseBand(input: RaceChromeInput, paused: boolean): RaceBand {
  const race = input.race
  const total = race ? Math.max(0, race.end - race.start) : 0
  const index = race ? race.cursor - race.start + 1 : 0
  const tour = total > 0 ? Math.min(total, Math.max(1, index)) : 0
  return {
    badge: paused ? "En pause" : "En course",
    generation: input.generation,
    tour: total > 0 ? `tour ${tour} / ${total}` : null,
    remaining: input.minutes > 0 ? leftLabel(input.remainingMs) : null,
    fraction: total > 0 ? tour / total : null,
    barLabel: total > 0 ? "Tour de course" : null,
    barNow: total > 0 ? tour : null,
    barMax: total > 0 ? total : null,
  }
}

function avantBand(input: RaceChromeInput, paused: boolean): RaceBand {
  const total = Math.round(input.minutes * 60_000)
  const remaining = input.remainingMs
  const known = total > 0 && remaining != null && Number.isFinite(remaining)
  const elapsed = known ? Math.min(total, Math.max(0, total - remaining)) : 0
  return {
    badge: paused ? "En pause" : "Avant-course",
    generation: input.generation,
    tour: null,
    remaining: leftLabel(remaining),
    fraction: known ? clamp01(elapsed / total) : null,
    barLabel: known ? "Avant-course" : null,
    barNow: known ? elapsed : null,
    barMax: known ? total : null,
  }
}

/** Libellés, variantes et barre, sans rendu. Le bouton or est le geste du moment. */
export function raceChrome(input: RaceChromeInput): RaceChrome {
  const running = input.phase === "avant" || input.phase === "course"
  const paused = running && input.paused
  const launch = control(running ? "Relancer" : "Lancer", running ? "secondary" : "default", input.canLaunch)
  const pause = control(paused ? "Reprendre" : "Pause", "default", running)
  const step = control(input.phase === "avant" ? "Passer à la course" : "Jouer le tour", "secondary", running)

  if (input.error) return { launch, pause, step, lead: input.error, band: null }
  if (input.phase === "avant") return { launch, pause, step, lead: null, band: avantBand(input, paused) }
  if (input.phase === "course") return { launch, pause, step, lead: null, band: courseBand(input, paused) }
  if (input.phase === "fin") {
    return {
      launch,
      pause,
      step,
      lead: null,
      band: {
        badge: "Finie",
        generation: input.generation,
        tour: null,
        remaining: null,
        fraction: null,
        barLabel: null,
        barNow: null,
        barMax: null,
      },
    }
  }
  return { launch, pause, step, lead: IDLE_LEAD, band: null }
}
