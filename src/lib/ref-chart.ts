import { SCALES, type ScaleId, type TracePoint } from "./ref.ts"

export function scaleLabel(id: ScaleId) {
  return SCALES.find((item) => item.id === id)?.label ?? id
}

/** Moyenne de la grandeur par tranche de phase, dans l'ordre des phases. */
export function phaseMeanCurve(points: TracePoint[], scale: ScaleId, bins = 8) {
  const width = Math.max(1, bins)
  const buckets = Array.from({ length: width }, () => ({ phase: 0, total: 0, count: 0 }))
  for (const point of points) {
    const slot = Math.min(width - 1, Math.max(0, Math.floor(point.phase * width)))
    const bucket = buckets[slot]
    bucket.phase += point.phase
    bucket.total += point[scale]
    bucket.count += 1
  }
  return buckets
    .filter((bucket) => bucket.count > 0)
    .map((bucket) => ({
      phase: bucket.phase / bucket.count,
      value: bucket.total / bucket.count,
    }))
}

/**
 * Abscisse d'une date civile sur l'axe des tirages.
 * Entre deux tirages, la position suit le nombre de jours.
 * Hors de la fenêtre, pas de trait.
 */
export function calendarAnchor(
  date: string,
  drawDates: readonly string[],
  xOf: (day: string) => number | undefined,
): number | null {
  if (!drawDates.length) return null
  const target = Date.parse(`${date}T00:00:00Z`)
  if (!Number.isFinite(target)) return null
  let previous: string | null = null
  let next: string | null = null
  for (const day of drawDates) {
    const stamp = Date.parse(`${day}T00:00:00Z`)
    if (!Number.isFinite(stamp)) continue
    if (stamp <= target) previous = day
    if (stamp >= target && next == null) next = day
  }
  if (previous == null || next == null) return null
  const x0 = xOf(previous)
  const x1 = xOf(next)
  if (x0 == null || x1 == null || !Number.isFinite(x0) || !Number.isFinite(x1)) return null
  if (previous === next) return x0
  const span = Date.parse(`${next}T00:00:00Z`) - Date.parse(`${previous}T00:00:00Z`)
  if (span <= 0) return x0
  return x0 + ((target - Date.parse(`${previous}T00:00:00Z`)) / span) * (x1 - x0)
}

/**
 * Découpe le chemin chronologique quand une phase boucle (saut > 0,5).
 * Chaque morceau reste une courbe continue.
 */
export function trajectorySegments<T extends { x: number; y: number }>(points: T[], jump = 0.5) {
  const segments: T[][] = []
  let current: T[] = []
  for (const point of points) {
    const previous = current[current.length - 1]
    const wraps =
      previous != null &&
      (Math.abs(point.x - previous.x) > jump || Math.abs(point.y - previous.y) > jump)
    if (wraps) {
      if (current.length) segments.push(current)
      current = []
    }
    current.push(point)
  }
  if (current.length) segments.push(current)
  return segments
}
