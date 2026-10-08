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

/** Phrase sous les grilles : bandes calibrées, ou pourquoi elles ne le sont pas encore. */
export function calibrationCaption(calibration: Calibration | null | undefined) {
  if (!calibration) return ""
  if (calibration.calibrated) {
    const word = calibration.steps > 1 ? "tirages" : "tirage"
    return `Bandes 10–90 calibrées sur ${calibration.steps} ${word} du retour.`
  }
  return "Bandes 10–90 brutes : le calibrage attend neuf tirages du retour."
}
