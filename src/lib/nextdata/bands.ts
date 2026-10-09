/** Bandes 10–90 de nextData : couverture brute et calibrée, avancement du retour. */

export type BandCoverage = {
  raw: number | null
  raw_count: number
  calibrated: number | null
  calibrated_count: number
}

export type Calibration = {
  steps: number
  calibrated: boolean
  edges?: Record<string, { down: number; up: number }>
}

export type StepProgress = { ready: number; total: number; complete: boolean }

export const BAND_FIELDS = [
  { key: "sum", label: "Somme" },
  { key: "n1", label: "n1" },
  { key: "n2", label: "n2" },
  { key: "n3", label: "n3" },
  { key: "n4", label: "n4" },
  { key: "n5", label: "n5" },
  { key: "parity", label: "Pairs" },
  { key: "spread", label: "Étendue" },
  { key: "consecutive", label: "Consécutifs" },
  { key: "star_sum", label: "Somme ★" },
  { key: "e1", label: "e1" },
  { key: "e2", label: "e2" },
  { key: "star_spread", label: "Étendue ★" },
  { key: "star_consecutive", label: "Consécutifs ★" },
] as const

/** Part entière en pour cent. */
export function formatShare(rate: number | null | undefined) {
  if (rate == null || !Number.isFinite(rate)) return "—"
  return `${Math.round(rate * 100)} %`
}

export function progressPercent(progress: StepProgress | null | undefined) {
  if (!progress || progress.total <= 0) return 0
  return Math.round((Math.min(progress.ready, progress.total) / progress.total) * 100)
}

/** Temps passé depuis le lancement, à côté du pourcentage. Pas une estimation du reste. */
export function formatRunClock(seconds: number) {
  const whole = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0))
  const hours = Math.floor(whole / 3600)
  const minutes = Math.floor((whole % 3600) / 60)
  const rest = whole % 60
  if (hours > 0) return `${hours} h ${String(minutes).padStart(2, "0")} min`
  if (minutes > 0) return `${minutes} min ${String(rest).padStart(2, "0")} s`
  return `${rest} s`
}

/** Phrase sous les grilles : bandes calibrées, ou pourquoi elles ne le sont pas encore. */
export function calibrationCaption(calibration: Calibration | null | undefined) {
  if (!calibration) return ""
  if (calibration.calibrated) {
    const word = calibration.steps > 1 ? "tirages" : "tirage"
    return `Bandes 10–90 calibrées sur ${calibration.steps} ${word} du retour.`
  }
  return "Bandes 10–90 brutes : le calibrage attend neuf tirages du retour."
}
