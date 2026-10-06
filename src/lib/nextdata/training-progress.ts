/** Avancement de nextDataTraining : un dixième par décalage réellement mesuré. */

export const TRAINING_SHIFT_TOTAL = 10

export type ShiftReading = {
  errors: { sum?: number | null }
  hits_numbers?: number | null
}

export type ShiftSlice = {
  readings: Record<string, ShiftReading | undefined>
}

export type ShiftSummary = Record<
  string,
  { mae_sum: number | null; hits_numbers: number | null; count: number }
>

export function trainingPercent(done: number, total = TRAINING_SHIFT_TOTAL): number {
  if (total <= 0) return 0
  const finished = Math.max(0, Math.min(done, total))
  return Math.round((finished / total) * 100)
}

function round4(value: number): number {
  return Math.round(value * 10000) / 10000
}

/** MAE de la somme et moyenne des numéros communs, sur les décalages déjà reçus. */
export function summarizeShifts(shifts: ShiftSlice[]): ShiftSummary {
  const keys = new Set<string>()
  for (const shift of shifts) {
    for (const key of Object.keys(shift.readings)) keys.add(key)
  }
  const summary: ShiftSummary = {}
  for (const key of [...keys].sort()) {
    const sumErrors: number[] = []
    const hits: number[] = []
    for (const shift of shifts) {
      const side = shift.readings[key]
      if (!side) continue
      const error = side.errors.sum
      if (error != null && Number.isFinite(error)) sumErrors.push(error)
      const hit = side.hits_numbers
      if (hit != null && Number.isFinite(hit)) hits.push(hit)
    }
    summary[key] = {
      mae_sum: sumErrors.length ? round4(sumErrors.reduce((total, value) => total + Math.abs(value), 0) / sumErrors.length) : null,
      hits_numbers: hits.length ? round4(hits.reduce((total, value) => total + value, 0) / hits.length) : null,
      count: sumErrors.length,
    }
  }
  return summary
}
