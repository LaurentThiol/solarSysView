/** nextDataTraining : décalages reçus, couverture des bandes, figure des rangs. */

export const TRAINING_SHIFT_TOTAL = 10

export type ShiftReading = {
  in_band?: Record<string, boolean | null>
  in_band_raw?: Record<string, boolean | null>
  calibrated?: boolean
}

export type ShiftSlice = {
  readings: Record<string, ShiftReading | undefined>
}

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

/** Tirages tombés dans la bande 10–90 brute, ou calibrée, sur les décalages qui en ont une. */
export function bandCoverage(
  shifts: ShiftSlice[],
  reading: string,
  field: string,
  kind: "raw" | "calibrated" = "calibrated"
): { inside: number; total: number } {
  let inside = 0
  let total = 0
  for (const shift of shifts) {
    const side = shift.readings[reading]
    if (!side) continue
    if (kind === "calibrated" && side.calibrated === false) continue
    const covered = kind === "raw" ? (side.in_band_raw ?? side.in_band)?.[field] : side.in_band?.[field]
    if (covered == null) continue
    total += 1
    if (covered) inside += 1
  }
  return { inside, total }
}
