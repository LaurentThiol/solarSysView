/** Le champ « Minutes » : de 0 à 120, par demi-minute, 10 au départ. */
export const MINUTES_MIN = 0
export const MINUTES_MAX = 120
export const MINUTES_DEFAULT = 10
export const MINUTES_STEP = 0.5

/** Tranche d’un tour de course : Y minutes partagées entre les x tirages. */
export function sliceMs(minutes: number, draws: number) {
  if (!Number.isFinite(minutes) || minutes <= 0) return 0
  return Math.round((minutes * 60_000) / Math.max(1, Math.round(draws)))
}

/**
 * Tranche que la session joue vraiment : celle de `sliceMs`, mais jamais sous le plancher `floor`.
 * `floored` : le plancher a remplacé la tranche calculée, la course dure alors plus que Y minutes.
 * À zéro minute : pas de tranche d’appel, les tours s’enchaînent.
 */
export function playedSlice(minutes: number, calculatedMs: number, floor: number) {
  if (!Number.isFinite(minutes) || minutes <= 0) return { ms: 0, floored: false }
  const floored = calculatedMs < floor
  return { ms: floored ? floor : calculatedMs, floored }
}

/** Ordre de passage du tour : il tourne d’un cran à chaque tour. */
export function rotate<T>(items: readonly T[], round: number): T[] {
  if (items.length === 0) return []
  const shift = ((Math.round(round) % items.length) + items.length) % items.length
  return [...items.slice(shift), ...items.slice(0, shift)]
}

export function median(values: readonly number[]): number | null {
  const finite = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b)
  if (finite.length === 0) return null
  const mid = Math.floor(finite.length / 2)
  return finite.length % 2 === 1 ? finite[mid] : (finite[mid - 1] + finite[mid]) / 2
}

/** Runners servis par tranche, à la durée médiane d’un appel. */
export function servedPerSlice(slice: number, medianMs: number | null, parallel = 1) {
  if (!medianMs || medianMs <= 0 || slice <= 0) return null
  return Math.floor((slice / medianMs) * Math.max(1, parallel))
}

export function raceDurationMs(draws: number, slice: number) {
  return Math.max(0, Math.round(draws)) * Math.max(0, slice)
}

export function formatDuration(ms: number) {
  const seconds = Math.max(0, Math.round(ms / 1000))
  if (seconds < 60) return `${seconds} s`
  const minutes = Math.floor(seconds / 60)
  const rest = seconds % 60
  if (minutes < 60) return rest ? `${minutes} min ${rest} s` : `${minutes} min`
  const hours = Math.floor(minutes / 60)
  const left = minutes % 60
  return left ? `${hours} h ${left} min` : `${hours} h`
}

/** Une tranche : une décimale sous dix secondes, pour ne pas écrire « 0 s » ou « 1 s » à 0,7 s. */
export function formatSlice(ms: number) {
  if (ms >= 10_000) return formatDuration(ms)
  const tenths = Math.max(0, Math.round(ms / 100))
  return `${String(tenths / 10).replace(".", ",")} s`
}
