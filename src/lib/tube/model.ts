/**
 * Tube de flux 2D sur la somme des cinq numéros.
 *
 * Axe (vecteur central) : SMA des p sommes qui précèdent le tirage t.
 * Section : segment vertical [axe − w, axe + w] à la date du tirage. En 2D
 * temps × somme, une normale « orthogonale » dépendrait du rapport d'échelle
 * entre un tirage et un point de somme ; la section à date fixe n'en dépend pas.
 * Déformations : cisaillement = glissement de la section, étirement et
 * compression = largeur multipliée ou divisée (au plus par 2).
 */

import { lunarFraction, lunarVector } from "./lunar"

const BALLS = 50
const PICKS = 5

/** Somme de 5 numéros tirés sans remise dans 1–50. */
export const SUM_MEAN = (PICKS * (BALLS + 1)) / 2
export const SUM_VARIANCE = (PICKS * (BALLS + 1) * (BALLS - PICKS)) / 12
export const SUM_SIGMA = Math.sqrt(SUM_VARIANCE)
export const SUM_BOUNDS = { min: 15, max: 240 } as const

export const TUBE_RANKS = ["n1", "n2", "n3", "n4", "n5"] as const
export type TubeRank = (typeof TUBE_RANKS)[number]
export type TubeSource = TubeRank | "lune"
export const TUBE_SOURCES: readonly TubeSource[] = [...TUBE_RANKS, "lune"]
export const TUBE_SOURCE_LABELS: Record<TubeSource, string> = {
  n1: "N1",
  n2: "N2",
  n3: "N3",
  n4: "N4",
  n5: "N5",
  lune: "Lune",
}

/** Place de chaque rang dans la section : n1 en bas, n5 en haut. */
export const RANK_POSITIONS = [-1, -0.5, 0, 0.5, 1] as const

/** Covariance exacte des statistiques d'ordre (rangs 1-indexés) d'un tirage 5/50. */
export function rankCovariance(i: number, j: number): number {
  const lo = Math.min(i, j)
  const hi = Math.max(i, j)
  return (lo * (PICKS + 1 - hi) * (BALLS + 1) * (BALLS - PICKS)) / ((PICKS + 1) ** 2 * (PICKS + 2))
}

export const RANK_MEANS = TUBE_RANKS.map((_, k) => ((k + 1) * (BALLS + 1)) / (PICKS + 1))
export const RANK_SIGMAS = TUBE_RANKS.map((_, k) => Math.sqrt(rankCovariance(k + 1, k + 1)))

function linearModeSigma(weights: readonly number[]) {
  let variance = 0
  for (let i = 0; i < weights.length; i += 1) {
    for (let j = 0; j < weights.length; j += 1) {
      variance += weights[i] * weights[j] * rankCovariance(i + 1, j + 1)
    }
  }
  return Math.sqrt(variance)
}

/** Écart-type de Σ u_k·n_k : l'ouverture de la grille (n5 et n4 contre n1 et n2). */
export const OPENING_SIGMA = linearModeSigma(RANK_POSITIONS)

export const TUBE_FAMILIES = ["etirement", "cisaillement", "compression"] as const
export type TubeFamily = (typeof TUBE_FAMILIES)[number]
export const TUBE_FAMILY_LABELS: Record<TubeFamily, string> = {
  etirement: "Étirement",
  cisaillement: "Cisaillement",
  compression: "Compression",
}
export type TubeGains = Record<TubeFamily, number>

export const TUBE_PERIODS = [5, 10, 20] as const
export const TUBE_SAMPLES = [50, 100, 200, 400] as const
export type TubeSample = (typeof TUBE_SAMPLES)[number]

export const TUBE_LEVELS = [0.8, 0.9, 0.95] as const
export type TubeLevel = (typeof TUBE_LEVELS)[number]
const LEVEL_Z: Record<TubeLevel, number> = { 0.8: 1.2816, 0.9: 1.6449, 0.95: 1.96 }

export function zForLevel(level: TubeLevel): number {
  return LEVEL_Z[level]
}

/** `hasard` : largeur de la loi uniforme. `glissante` : écart-type des p sommes précédentes. */
export type TubeEnvelope = "hasard" | "glissante"
/** `veille` : forces lues au tirage t − 1. `jour` : forces lues au tirage t lui-même. */
export type TubeTiming = "veille" | "jour"

export type TubeFrameOptions = {
  period: number
  level: TubeLevel
  envelope: TubeEnvelope
  timing: TubeTiming
}

export type TubeOptions = TubeFrameOptions & {
  sources: readonly TubeSource[]
  gains: TubeGains
}

export const DEFAULT_TUBE_OPTIONS: TubeOptions = {
  period: 10,
  level: 0.9,
  envelope: "hasard",
  timing: "veille",
  sources: TUBE_SOURCES,
  gains: { etirement: 0.5, cisaillement: 0.5, compression: 0.5 },
}

export type TubeDraw = {
  date: string
  weekday?: string
  numbers: number[]
}

export type TubeFrameSection = {
  /** Position dans la fenêtre chronologique des tirages (warm-up compris). */
  index: number
  date: string
  weekday?: string
  sum: number
  ranks: number[]
  /** Vecteur central : niveau de l'axe et pente depuis la section précédente. */
  center: number
  slope: number
  halfWidth: number
  lower: number
  upper: number
  /** Écart n_k − SMA(n_k), en points, au tirage lu (t − 1 ou t). */
  deviations: number[]
  /** Mêmes écarts réduits par l'écart-type théorique du rang. */
  forces: number[]
  /** Part de chaque rang dans le mode translation (Σ d_k), réduite par σ de la somme. */
  translation: Record<TubeRank, number>
  /** Part de chaque rang dans le mode ouverture (Σ u_k·d_k), réduite par σ de l'ouverture. */
  opening: Record<TubeRank, number>
  moonFraction: number
  tide: number
  drift: number
}

export type TubeFrame = {
  options: TubeFrameOptions
  sections: TubeFrameSection[]
  warmup: number
}

export type TubeSection = TubeFrameSection & {
  shearDriver: number
  strainDriver: number
  shift: number
  widthFactor: number
  deformedCenter: number
  deformedLower: number
  deformedUpper: number
  insideNominal: boolean
  insideDeformed: boolean
}

function mean(values: number[], from: number, to: number) {
  let total = 0
  for (let i = from; i <= to; i += 1) total += values[i]
  return total / (to - from + 1)
}

function sampleSd(values: number[], from: number, to: number) {
  const n = to - from + 1
  if (n < 2) return 0
  const m = mean(values, from, to)
  let acc = 0
  for (let i = from; i <= to; i += 1) acc += (values[i] - m) ** 2
  return Math.sqrt(acc / (n - 1))
}

export function sortedRanks(numbers: number[]): number[] | null {
  if (numbers.length !== PICKS) return null
  const ranks = [...numbers].sort((a, b) => a - b)
  return ranks.every((n) => Number.isInteger(n) && n >= 1 && n <= BALLS) ? ranks : null
}

/**
 * Sections nominales et forces, sans les gains. Chaque section t ne lit que
 * les tirages avant t, sauf les écarts en lecture `jour` (circulaire, voulu).
 */
export function tubeFrame(draws: readonly TubeDraw[], options: TubeFrameOptions): TubeFrame {
  const period = Math.max(2, Math.floor(options.period))
  const rows = [...draws]
    .map((draw) => ({ draw, ranks: sortedRanks(draw.numbers) }))
    .filter((row): row is { draw: TubeDraw; ranks: number[] } => row.ranks != null)
    .sort((a, b) => a.draw.date.localeCompare(b.draw.date))
  const sums = rows.map((row) => row.ranks.reduce((a, b) => a + b, 0))
  const rankSeries = TUBE_RANKS.map((_, k) => rows.map((row) => row.ranks[k]))
  const z = zForLevel(options.level)
  const spread = Math.sqrt(1 + 1 / period)
  const deviationScale = Math.sqrt(1 - 1 / period)
  const sections: TubeFrameSection[] = []
  let previousCenter: number | null = null

  for (let t = period; t < rows.length; t += 1) {
    const center = mean(sums, t - period, t - 1)
    const sigma =
      options.envelope === "hasard" ? SUM_SIGMA : Math.max(1, sampleSd(sums, t - period, t - 1))
    const halfWidth = z * sigma * spread
    const read = options.timing === "jour" ? t : t - 1
    const deviations = rankSeries.map(
      (series) => series[read] - mean(series, read - period + 1, read)
    )
    const forces = deviations.map((d, k) => d / (RANK_SIGMAS[k] * deviationScale))
    const perRank = (value: (k: number) => number) =>
      Object.fromEntries(TUBE_RANKS.map((rank, k) => [rank, value(k)])) as Record<TubeRank, number>
    const translation = perRank((k) => deviations[k] / (SUM_SIGMA * deviationScale))
    const opening = perRank(
      (k) => (RANK_POSITIONS[k] * deviations[k]) / (OPENING_SIGMA * deviationScale)
    )
    const moonFraction = lunarFraction(rows[t].draw.date)
    const { tide, drift } = lunarVector(moonFraction)
    sections.push({
      index: t,
      date: rows[t].draw.date,
      weekday: rows[t].draw.weekday,
      sum: sums[t],
      ranks: rows[t].ranks,
      center,
      slope: previousCenter == null ? 0 : center - previousCenter,
      halfWidth,
      lower: center - halfWidth,
      upper: center + halfWidth,
      deviations,
      forces,
      translation,
      opening,
      moonFraction,
      tide,
      drift,
    })
    previousCenter = center
  }
  return { options: { ...options, period }, sections, warmup: period }
}

export type TubeDrivers = { shear: number; strain: number }

/**
 * Deux modes sur les rangs actifs, puis la lune.
 * Translation Σ d_k → cisaillement. Ouverture Σ u_k·d_k → étirement (> 0) ou compression (< 0).
 * Rangs et lune actifs ensemble : moyenne des deux groupes, pour rester dans [−1, 1].
 */
export function sectionDrivers(section: TubeFrameSection, sources: readonly TubeSource[]): TubeDrivers {
  const active = new Set(sources)
  const ranks = TUBE_RANKS.filter((rank) => active.has(rank))
  const shear: number[] = []
  const strain: number[] = []
  if (ranks.length) {
    let translation = 0
    let opening = 0
    for (const rank of ranks) {
      translation += section.translation[rank]
      opening += section.opening[rank]
    }
    shear.push(Math.tanh(translation))
    strain.push(Math.tanh(opening))
  }
  if (active.has("lune")) {
    shear.push(section.drift)
    strain.push(section.tide)
  }
  const avg = (values: number[]) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0)
  return { shear: avg(shear), strain: avg(strain) }
}

export function applyGains(section: TubeFrameSection, drivers: TubeDrivers, gains: TubeGains): TubeSection {
  const shift = gains.cisaillement * drivers.shear * section.halfWidth
  const log2Factor =
    gains.etirement * Math.max(drivers.strain, 0) - gains.compression * Math.max(-drivers.strain, 0)
  const widthFactor = 2 ** log2Factor
  const deformedCenter = section.center + shift
  const half = section.halfWidth * widthFactor
  const deformedLower = deformedCenter - half
  const deformedUpper = deformedCenter + half
  return {
    ...section,
    shearDriver: drivers.shear,
    strainDriver: drivers.strain,
    shift,
    widthFactor,
    deformedCenter,
    deformedLower,
    deformedUpper,
    insideNominal: section.lower <= section.sum && section.sum <= section.upper,
    insideDeformed: deformedLower <= section.sum && section.sum <= deformedUpper,
  }
}

export function deformTube(frame: TubeFrame, sources: readonly TubeSource[], gains: TubeGains): TubeSection[] {
  return frame.sections.map((section) => applyGains(section, sectionDrivers(section, sources), gains))
}

export function buildTube(draws: readonly TubeDraw[], options: TubeOptions) {
  const frame = tubeFrame(draws, options)
  return { frame, sections: deformTube(frame, options.sources, options.gains) }
}
