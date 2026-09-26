/** Cycle court : une arche de 4 à 8 tirages, mesurée par son étendue.

Jumeau de `synchro/short_cycle.py`. L'étendue est max − min. Elle remplace
l'écart-type quand la variation tient dans ces quelques tirages.
*/

export const SHORT_CYCLE_MIN = 4
export const SHORT_CYCLE_MAX = 8

/** max − min de la fenêtre qui finit à `end` (inclus), sur au plus `span` tirages. */
export function localRange(values: ArrayLike<number>, end: number, span = SHORT_CYCLE_MAX): number {
  const count = values.length
  if (count === 0) return 0
  const last = Math.min(Math.max(Math.trunc(end), 0), count - 1)
  const start = Math.max(0, last - Math.max(Math.trunc(span), 1) + 1)
  let lo = Number(values[start])
  let hi = lo
  for (let index = start + 1; index <= last; index += 1) {
    const value = Number(values[index])
    if (value < lo) lo = value
    if (value > hi) hi = value
  }
  return hi - lo
}
