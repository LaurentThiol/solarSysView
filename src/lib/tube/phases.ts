/** Horloges locales du registre Cycles, mêmes formules que `synchro/ref/phases.py`. */

import { julianDayNoon, lunarFraction } from "./lunar"

const J2000 = 2451545.0
const CARRINGTON_JD0 = 2398166.5
const CARRINGTON_DAYS = 27.2753

function sunDays(isoDate: string) {
  return julianDayNoon(isoDate) - J2000
}

function positiveMod(value: number, period: number) {
  const wrapped = value % period
  return wrapped < 0 ? wrapped + period : wrapped
}

function fracDeg(degrees: number) {
  return positiveMod(degrees, 360) / 360
}

/** Anomalie moyenne. 0 = périgée, 0,5 = apogée. */
export function anomalisticFraction(isoDate: string) {
  return fracDeg(134.9633964 + 13.0649929509 * sunDays(isoDate))
}

/** Argument de latitude. 0 = nœud ascendant, 0,5 = nœud descendant. */
export function draconicFraction(isoDate: string) {
  return fracDeg(93.2720950 + 13.2293500610 * sunDays(isoDate))
}

/** 0 aux syzygies (vive-eau), 0,5 aux quartiers (morte-eau). */
export function fortnightFraction(isoDate: string) {
  return positiveMod(lunarFraction(isoDate) * 2, 1)
}

/** Longitude écliptique du Soleil. 0 = équinoxe de mars. */
export function tropicalFraction(isoDate: string) {
  const elapsed = sunDays(isoDate)
  const mean = 280.46646 + 0.98564736 * elapsed
  const anomaly = (positiveMod(357.52911 + 0.98560028 * elapsed, 360) * Math.PI) / 180
  const longitude = mean + 1.9148 * Math.sin(anomaly) + 0.02 * Math.sin(2 * anomaly)
  return fracDeg(longitude)
}

/** Longitude moyenne du nœud ascendant, en marche arrière. */
export function nodalFraction(isoDate: string) {
  return fracDeg(125.04452 - 0.05295376 * sunDays(isoDate))
}

/** Rotation de Carrington. 0 = début de rotation. */
export function carringtonFraction(isoDate: string) {
  const elapsed = (julianDayNoon(isoDate) - CARRINGTON_JD0) / CARRINGTON_DAYS
  return elapsed - Math.floor(elapsed)
}

/**
 * Lecture commune d'une phase f ∈ [0, 1).
 * `tide` = cos 2πf : +1 au zéro de phase, −1 à l'opposé.
 * `drift` = sin 2πf : le sens de parcours. Convention, pas une mesure.
 */
export function phaseVector(fraction: number) {
  const theta = 2 * Math.PI * positiveMod(fraction, 1)
  return { tide: Math.cos(theta), drift: Math.sin(theta) }
}
