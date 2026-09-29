/** Phase synodique locale, mêmes constantes que `synchro/ref/cycles.py` (midi UTC). */

export const SYNODIC_DAYS = 29.530588861
export const NEW_MOON_JD = 2451550.09766

const UNIX_EPOCH_JD = 2440587.5
const DAY_MS = 86_400_000

const PHASE_BANDS: ReadonlyArray<readonly [number, string]> = [
  [0.03, "Nouvelle lune"],
  [0.22, "Premier croissant"],
  [0.28, "Premier quartier"],
  [0.47, "Gibbeuse croissante"],
  [0.53, "Pleine lune"],
  [0.72, "Gibbeuse décroissante"],
  [0.78, "Dernier quartier"],
  [0.97, "Dernier croissant"],
]

export function julianDayNoon(isoDate: string): number {
  const [year, month, day] = isoDate.slice(0, 10).split("-").map(Number)
  return Date.UTC(year, month - 1, day, 12) / DAY_MS + UNIX_EPOCH_JD
}

/** 0 = nouvelle lune, 0,25 = premier quartier, 0,5 = pleine lune. */
export function lunarFraction(isoDate: string): number {
  const age = (julianDayNoon(isoDate) - NEW_MOON_JD) % SYNODIC_DAYS
  const wrapped = age < 0 ? age + SYNODIC_DAYS : age
  return wrapped / SYNODIC_DAYS
}

export function lunarPhaseLabel(fraction: number): string {
  const wrapped = ((fraction % 1) + 1) % 1
  for (const [limit, label] of PHASE_BANDS) {
    if (wrapped < limit) return label
  }
  return "Nouvelle lune"
}

export function lunarIllumination(fraction: number): number {
  return (1 - Math.cos(2 * Math.PI * fraction)) / 2
}

/**
 * Deux lectures de la phase θ = 2π·fraction.
 * `tide` = cos 2θ : +1 aux syzygies (vive-eau), −1 aux quartiers (morte-eau).
 * `drift` = sin θ : positif en lune croissante, négatif en décroissante.
 */
export function lunarVector(fraction: number) {
  const theta = 2 * Math.PI * fraction
  return { tide: Math.cos(2 * theta), drift: Math.sin(theta) }
}
