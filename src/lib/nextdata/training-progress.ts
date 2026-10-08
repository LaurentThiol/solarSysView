/** Avancement de nextDataTraining : un dixième par décalage réellement mesuré. */

export const TRAINING_SHIFT_TOTAL = 10

export type ShiftReading = {
  errors: { sum?: number | null }
  in_band?: Record<string, boolean | null>
  hits_numbers?: number | null
}

export type ShiftSlice = {
  readings: Record<string, ShiftReading | undefined>
}

export type ShiftSummary = Record<
  string,
  { mae_sum: number | null; hits_numbers: number | null; count: number }
>

/** Écart de chaque point avec le décalage d’avant. Le premier point n’a pas de précédent. */
export function deltaNumbers(rows: (number | null)[][]): (number | null)[][] {
  return rows.map((row, index) => {
    if (index === 0) return row.map(() => null)
    const previous = rows[index - 1]
    return row.map((value, column) => {
      const prior = previous[column]
      if (value == null || prior == null || !Number.isFinite(value) || !Number.isFinite(prior)) return null
      return Math.round((value - prior) * 100) / 100
    })
  })
}

export function trainingPercent(done: number, total = TRAINING_SHIFT_TOTAL): number {
  if (total <= 0) return 0
  const finished = Math.max(0, Math.min(done, total))
  return Math.round((finished / total) * 100)
}

/** Décalage affiché par la figure des rangs.
 *  Sans épingle, c’est le dernier décalage reçu : la figure suit l’évaluation.
 *  Une épingle reste sur ce décalage tant qu’il est dans la liste.
 */
export function visibleTrainingShift<T extends { x: number }>(shifts: T[], pinned: number | null): T | null {
  if (!shifts.length) return null
  if (pinned != null) {
    const chosen = shifts.find((shift) => shift.x === pinned)
    if (chosen) return chosen
  }
  return shifts[shifts.length - 1]
}

function round4(value: number): number {
  return Math.round(value * 10000) / 10000
}

/** Tirages tombés dans la bande 10–90, sur les décalages où la lecture en donne une. */
export function bandCoverage(shifts: ShiftSlice[], reading: string, field: string): { inside: number; total: number } {
  let inside = 0
  let total = 0
  for (const shift of shifts) {
    const covered = shift.readings[reading]?.in_band?.[field]
    if (covered == null) continue
    total += 1
    if (covered) inside += 1
  }
  return { inside, total }
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
