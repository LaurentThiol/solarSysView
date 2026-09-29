/**
 * Section elliptique dans le plan (somme, étendue) ou (somme, parité).
 *
 * La covariance nominale est celle d'un tirage autour de la SMA.
 * La déformation est une matrice 2×2 dans la base principale :
 * les valeurs propres portent l'étirement et la compression (produit 1),
 * le terme croisé porte le cisaillement.
 */

import type { TubeLevel, TubePlaneSlot, TubeSection } from "./model"

export type TubePlane = "etendue" | "parite"

export type TubeEllipse = {
  plane: TubePlane
  y: number
  yCenter: number
  /** Centre somme : axe nominal, ou axe après cisaillement. */
  sumCenter: number
  c00: number
  c01: number
  c11: number
  /** Demi-grand axe, demi-petit axe, angle de la base propre (radians, repère y vers le haut). */
  major: number
  minor: number
  angle: number
  det: number
}

export type TubeEllipsePair = {
  nominal: TubeEllipse
  deformed: TubeEllipse
  mahalanobisNominal: number
  mahalanobisDeformed: number
  chi2: number
  insideNominal: boolean
  insideDeformed: boolean
  /** Dawid–Sebastiani : log dét + distance. Plus bas = mieux. */
  dssNominal: number
  dssDeformed: number
}

/** Quantile χ² à 2 degrés de liberté : −2 ln(1 − niveau). */
export function chi2Level(level: number) {
  return -2 * Math.log(1 - level)
}

function eigen2(c00: number, c01: number, c11: number) {
  const trace = c00 + c11
  const det = c00 * c11 - c01 * c01
  const half = Math.sqrt(Math.max(0, (trace * trace) / 4 - det))
  const l1 = Math.max(trace / 2 + half, 1e-9)
  const l2 = Math.max(trace / 2 - half, 1e-9)
  let x = 1
  let y = 0
  if (Math.abs(c01) > 1e-12) {
    x = l1 - c11
    y = c01
  } else if (c11 > c00) {
    x = 0
    y = 1
  }
  const norm = Math.hypot(x, y) || 1
  const r00 = x / norm
  const r10 = y / norm
  return { l1, l2, r00, r10, r01: -r10, r11: r00 }
}

function deformCov(c00: number, c01: number, c11: number, widthFactor: number, cross: number) {
  const { l1, l2, r00, r10, r01, r11 } = eigen2(c00, c01, c11)
  const s1 = widthFactor
  const s2 = 1 / widthFactor
  const gamma = cross
  const p00 = s1 * s1 * l1 + gamma * gamma * l2
  const p01 = gamma * (s1 * l1 + s2 * l2)
  const p11 = gamma * gamma * l1 + s2 * s2 * l2
  const o00 = r00 * (p00 * r00 + p01 * r01) + r01 * (p01 * r00 + p11 * r01)
  const o01 = r00 * (p00 * r10 + p01 * r11) + r01 * (p01 * r10 + p11 * r11)
  const o11 = r10 * (p00 * r10 + p01 * r11) + r11 * (p01 * r10 + p11 * r11)
  return { c00: o00, c01: o01, c11: o11 }
}

function axes(c00: number, c01: number, c11: number, chi2: number) {
  const { l1, l2, r00, r10 } = eigen2(c00, c01, c11)
  return {
    major: Math.sqrt(l1 * chi2),
    minor: Math.sqrt(l2 * chi2),
    angle: Math.atan2(r10, r00),
    det: c00 * c11 - c01 * c01,
  }
}

function mahalanobis(c00: number, c01: number, c11: number, dx: number, dy: number) {
  const det = c00 * c11 - c01 * c01
  if (det <= 1e-12) return Number.POSITIVE_INFINITY
  return (c11 * dx * dx - 2 * c01 * dx * dy + c00 * dy * dy) / det
}

function shape(
  plane: TubePlane,
  slot: TubePlaneSlot,
  sumCenter: number,
  c00: number,
  c01: number,
  c11: number,
  chi2: number
): TubeEllipse {
  const axis = axes(c00, c01, c11, chi2)
  return {
    plane,
    y: slot.y,
    yCenter: slot.center,
    sumCenter,
    c00,
    c01,
    c11,
    major: axis.major,
    minor: axis.minor,
    angle: axis.angle,
    det: axis.det,
  }
}

export function sectionEllipse(section: TubeSection, plane: TubePlane, level: TubeLevel): TubeEllipsePair {
  const slot = plane === "etendue" ? section.spreadPlane : section.parityPlane
  const chi2 = chi2Level(level)
  const nominal = shape(plane, slot, section.center, slot.vxx, slot.vxy, slot.vyy, chi2)
  const deformedCov = deformCov(slot.vxx, slot.vxy, slot.vyy, section.widthFactor, section.cross)
  const deformed = shape(plane, slot, section.deformedCenter, deformedCov.c00, deformedCov.c01, deformedCov.c11, chi2)
  const dx0 = section.sum - section.center
  const dy = slot.y - slot.center
  const dx1 = section.sum - section.deformedCenter
  const m0 = mahalanobis(nominal.c00, nominal.c01, nominal.c11, dx0, dy)
  const m1 = mahalanobis(deformed.c00, deformed.c01, deformed.c11, dx1, dy)
  return {
    nominal,
    deformed,
    mahalanobisNominal: m0,
    mahalanobisDeformed: m1,
    chi2,
    insideNominal: m0 <= chi2,
    insideDeformed: m1 <= chi2,
    dssNominal: Math.log(Math.max(nominal.det, 1e-12)) + m0,
    dssDeformed: Math.log(Math.max(deformed.det, 1e-12)) + m1,
  }
}

export type EllipseScore = {
  n: number
  coverageNominal: number | null
  coverageDeformed: number | null
  dssNominal: number | null
  dssDeformed: number | null
}

export function ellipseScore(pairs: readonly TubeEllipsePair[]): EllipseScore {
  const n = pairs.length
  if (!n) return { n, coverageNominal: null, coverageDeformed: null, dssNominal: null, dssDeformed: null }
  let in0 = 0
  let in1 = 0
  let dss0 = 0
  let dss1 = 0
  for (const pair of pairs) {
    if (pair.insideNominal) in0 += 1
    if (pair.insideDeformed) in1 += 1
    dss0 += pair.dssNominal
    dss1 += pair.dssDeformed
  }
  return {
    n,
    coverageNominal: in0 / n,
    coverageDeformed: in1 / n,
    dssNominal: dss0 / n,
    dssDeformed: dss1 / n,
  }
}
