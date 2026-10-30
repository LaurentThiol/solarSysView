/** Tranche d’un tour de course : Y minutes partagées entre les x tirages. */
export function sliceMs(minutes: number, draws: number) {
  if (!Number.isFinite(minutes) || minutes <= 0) return 0
  return Math.round((minutes * 60_000) / Math.max(1, Math.round(draws)))
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
