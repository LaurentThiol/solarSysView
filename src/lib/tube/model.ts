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
import {
  anomalisticFraction,
  carringtonFraction,
  draconicFraction,
  fortnightFraction,
  nodalFraction,
  phaseVector,
  tropicalFraction,
} from "./phases"

const BALLS = 50
const PICKS = 5

/** Somme de 5 numéros tirés sans remise dans 1–50. */
export const SUM_MEAN = (PICKS * (BALLS + 1)) / 2
export const SUM_VARIANCE = (PICKS * (BALLS + 1) * (BALLS - PICKS)) / 12
export const SUM_SIGMA = Math.sqrt(SUM_VARIANCE)
export const SUM_BOUNDS = { min: 15, max: 240 } as const

export const TUBE_RANKS = ["n1", "n2", "n3", "n4", "n5"] as const
export type TubeRank = (typeof TUBE_RANKS)[number]

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

/**
 * N3 contre les extrêmes (N1 et N5). Positif quand N3 est haut par rapport à N1 et N5.
 * Troisième mode des rangs, à côté de la translation et de l'ouverture.
 */
export const SKEW_WEIGHTS = [-1, 0, 2, 0, -1] as const
export const SKEW_SIGMA = linearModeSigma(SKEW_WEIGHTS)

/** Étendue n5 − n1, combinaison linéaire des rangs. */
export const SPREAD_WEIGHTS = [-1, 0, 0, 0, 1] as const
export const SPREAD_MEAN = ((PICKS - 1) * (BALLS + 1)) / (PICKS + 1)
export const SPREAD_VARIANCE = linearModeSigma(SPREAD_WEIGHTS) ** 2

function covarianceWithSum(weights: readonly number[]) {
  let total = 0
  for (let i = 0; i < weights.length; i += 1) {
    for (let j = 0; j < weights.length; j += 1) {
      total += weights[j] * rankCovariance(i + 1, j + 1)
    }
  }
  return total
}

export const COV_SUM_SPREAD = covarianceWithSum(SPREAD_WEIGHTS)

/**
 * Parité = (#pairs) − (#impairs), hypergéométrique 5 boules dans 25 pairs / 25 impairs.
 * score = 5 − 2P, P = nombre d'impairs. Var(P) = n·(K/N)·(1−K/N)·(N−n)/(N−1).
 */
const ODD_HIT_VARIANCE = 0.1 * 0.9
const ODD_SUM = 25 * 25
const NUMBER_SUM = (BALLS * (BALLS + 1)) / 2
const COV_SUM_ODD =
  ODD_HIT_VARIANCE * ODD_SUM +
  (-ODD_HIT_VARIANCE / (BALLS - 1)) * (25 * NUMBER_SUM - ODD_SUM)
export const PARITY_MEAN = 0
export const PARITY_VARIANCE = 4 * ((PICKS * 0.5 * 0.5 * (BALLS - PICKS)) / (BALLS - 1))
export const COV_SUM_PARITY = -2 * COV_SUM_ODD

export const TUBE_PHASES = ["vive-eau", "anomalistique", "draconitique", "tropique", "nodal", "carrington"] as const
export type TubePhase = (typeof TUBE_PHASES)[number]
export type TubeExtra = "retards" | "etoiles"
export type TubeSource = TubeRank | "lune" | TubePhase | TubeExtra
export const TUBE_SOURCES: readonly TubeSource[] = [...TUBE_RANKS, "lune", ...TUBE_PHASES, "retards", "etoiles"]
export const TUBE_SOURCE_LABELS: Record<TubeSource, string> = {
  n1: "N1",
  n2: "N2",
  n3: "N3",
  n4: "N4",
  n5: "N5",
  lune: "Lune",
  "vive-eau": "Vive-eau",
  anomalistique: "Anomalistique",
  draconitique: "Draconitique",
  tropique: "Tropique",
  nodal: "Nodal",
  carrington: "Carrington",
  retards: "Retards",
  etoiles: "Étoiles",
}

const PHASE_FRACTION: Record<TubePhase, (isoDate: string) => number> = {
  "vive-eau": fortnightFraction,
  anomalistique: anomalisticFraction,
  draconitique: draconicFraction,
  tropique: tropicalFraction,
  nodal: nodalFraction,
  carrington: carringtonFraction,
}

export const TUBE_FAMILIES = ["etirement", "cisaillement", "compression", "asymetrie"] as const
export type TubeFamily = (typeof TUBE_FAMILIES)[number]
export const TUBE_FAMILY_LABELS: Record<TubeFamily, string> = {
  etirement: "Étirement",
  cisaillement: "Cisaillement",
  compression: "Compression",
  asymetrie: "Asymétrie",
}

/** À gain 1 et force ±1, une demi-largeur vaut 1,75 et l'autre 0,25 : la largeur totale ne change pas. */
export const ASYM_REACH = 0.75
/** Terme croisé de la matrice 2×2, borné pour que son déterminant reste positif. */
export const SHEAR_CROSS = 0.75
/** Échelle (en tirages) d'un écart de retards moyens entre deux moitiés de grille. */
export const DELAY_SCALE = 4
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
  sources: [...TUBE_RANKS, "lune"],
  gains: { etirement: 0.5, cisaillement: 0.5, compression: 0.5, asymetrie: 0 },
}

export const ZERO_GAINS: TubeGains = { etirement: 0, cisaillement: 0, compression: 0, asymetrie: 0 }

export type TubeDraw = {
  date: string
  weekday?: string
  numbers: number[]
  stars?: number[]
}

export type TubePlaneSlot = {
  /** Valeur du tirage t sur le second axe. */
  y: number
  /** SMA des p valeurs qui précèdent t. */
  center: number
  /** Covariance de prévision (somme, second axe), déjà × (1 + 1/p). */
  vxx: number
  vxy: number
  vyy: number
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
  /** Part de chaque rang dans N3 contre les extrêmes, réduite par σ du mode. */
  skew: Record<TubeRank, number>
  moonFraction: number
  tide: number
  drift: number
  phases: Record<TubePhase, { fraction: number; tide: number; drift: number }>
  /** Retards connus avant le tirage t : haut contre bas, extrêmes contre le milieu. */
  delayShear: number
  delayStrain: number
  /** Étoiles lues en veille ou le jour même, réduites par l'écart-type de leur fenêtre. */
  starShear: number
  starStrain: number
  spreadPlane: TubePlaneSlot
  parityPlane: TubePlaneSlot
}

export type TubeFrame = {
  options: TubeFrameOptions
  sections: TubeFrameSection[]
  warmup: number
}

export type TubeSection = TubeFrameSection & {
  shearDriver: number
  strainDriver: number
  skewDriver: number
  shift: number
  widthFactor: number
  /** Demi-largeurs après étirement et asymétrie. Leur somme est la largeur déformée. */
  lowerHalf: number
  upperHalf: number
  /** Terme croisé de la matrice de déformation, dans la base principale de la covariance. */
  cross: number
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

function sampleMoments(xs: number[], ys: number[], from: number, to: number) {
  const n = to - from + 1
  const mx = mean(xs, from, to)
  const my = mean(ys, from, to)
  let c00 = 0
  let c01 = 0
  let c11 = 0
  for (let i = from; i <= to; i += 1) {
    const dx = xs[i] - mx
    const dy = ys[i] - my
    c00 += dx * dx
    c01 += dx * dy
    c11 += dy * dy
  }
  const denom = Math.max(1, n - 1)
  return { meanX: mx, meanY: my, c00: c00 / denom, c01: c01 / denom, c11: c11 / denom }
}

function parityScore(ranks: readonly number[]) {
  let even = 0
  for (const n of ranks) if (n % 2 === 0) even += 1
  return even - (ranks.length - even)
}

function starMetrics(stars: readonly number[] | undefined) {
  if (!stars || stars.length !== 2) return null
  const [a, b] = [...stars].sort((x, y) => x - y)
  if (!Number.isInteger(a) || !Number.isInteger(b) || a < 1 || b > 12 || a >= b) return null
  return { sum: a + b, spread: b - a }
}

function delayField(rows: readonly { ranks: number[] }[]) {
  const last = new Int32Array(BALLS + 1).fill(-1)
  const shear = new Array<number>(rows.length)
  const strain = new Array<number>(rows.length)
  for (let t = 0; t < rows.length; t += 1) {
    let low = 0
    let high = 0
    let outer = 0
    let inner = 0
    for (let ball = 1; ball <= BALLS; ball += 1) {
      const delay = last[ball] < 0 ? t : t - last[ball]
      if (ball <= 25) low += delay
      else high += delay
      if (ball <= 10 || ball >= 41) outer += delay
      if (ball >= 16 && ball <= 35) inner += delay
    }
    shear[t] = Math.tanh((high / 25 - low / 25) / DELAY_SCALE)
    strain[t] = Math.tanh((outer / 20 - inner / 20) / DELAY_SCALE)
    for (const n of rows[t].ranks) last[n] = t
  }
  return { shear, strain }
}

function starDrivers(
  values: readonly ({ sum: number; spread: number } | null)[],
  read: number,
  period: number
) {
  const from = read - period + 1
  if (from < 0) return { shear: 0, strain: 0 }
  const sums: number[] = []
  const spreads: number[] = []
  for (let i = from; i <= read; i += 1) {
    const value = values[i]
    if (value == null) return { shear: 0, strain: 0 }
    sums.push(value.sum)
    spreads.push(value.spread)
  }
  const meanOf = (items: number[]) => items.reduce((a, b) => a + b, 0) / items.length
  const sdOf = (items: number[], m: number) => {
    if (items.length < 2) return 0
    let acc = 0
    for (const item of items) acc += (item - m) ** 2
    return Math.sqrt(acc / (items.length - 1))
  }
  const current = values[read]
  if (current == null) return { shear: 0, strain: 0 }
  const sumMean = meanOf(sums)
  const spreadMean = meanOf(spreads)
  const reduced = (value: number, m: number, sd: number) => Math.tanh((value - m) / Math.max(1, sd))
  return {
    shear: reduced(current.sum, sumMean, sdOf(sums, sumMean)),
    strain: reduced(current.spread, spreadMean, sdOf(spreads, spreadMean)),
  }
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
  const spreads = rows.map((row) => row.ranks[4] - row.ranks[0])
  const parities = rows.map((row) => parityScore(row.ranks))
  const stars = rows.map((row) => starMetrics(row.draw.stars))
  const rankSeries = TUBE_RANKS.map((_, k) => rows.map((row) => row.ranks[k]))
  const delays = delayField(rows)
  const z = zForLevel(options.level)
  const prediction = Math.sqrt(1 + 1 / period)
  const covScale = 1 + 1 / period
  const deviationScale = Math.sqrt(1 - 1 / period)
  const hasardSpread: TubePlaneSlot = {
    y: 0,
    center: SPREAD_MEAN,
    vxx: SUM_VARIANCE * covScale,
    vxy: COV_SUM_SPREAD * covScale,
    vyy: SPREAD_VARIANCE * covScale,
  }
  const hasardParity: TubePlaneSlot = {
    y: 0,
    center: PARITY_MEAN,
    vxx: SUM_VARIANCE * covScale,
    vxy: COV_SUM_PARITY * covScale,
    vyy: PARITY_VARIANCE * covScale,
  }
  const sections: TubeFrameSection[] = []
  let previousCenter: number | null = null

  for (let t = period; t < rows.length; t += 1) {
    const center = mean(sums, t - period, t - 1)
    const sigma =
      options.envelope === "hasard" ? SUM_SIGMA : Math.max(1, sampleSd(sums, t - period, t - 1))
    const halfWidth = z * sigma * prediction
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
    const skew = perRank((k) => (SKEW_WEIGHTS[k] * deviations[k]) / (SKEW_SIGMA * deviationScale))
    const moonFraction = lunarFraction(rows[t].draw.date)
    const { tide, drift } = lunarVector(moonFraction)
    const phases = Object.fromEntries(
      TUBE_PHASES.map((id) => {
        const fraction = PHASE_FRACTION[id](rows[t].draw.date)
        return [id, { fraction, ...phaseVector(fraction) }]
      })
    ) as TubeFrameSection["phases"]
    const star = starDrivers(stars, read, period)
    const spreadMoments = sampleMoments(sums, spreads, t - period, t - 1)
    const parityMoments = sampleMoments(sums, parities, t - period, t - 1)
    const planeOf = (
      y: number,
      moments: ReturnType<typeof sampleMoments>,
      hasard: TubePlaneSlot
    ): TubePlaneSlot => {
      if (options.envelope === "hasard") return { ...hasard, y, center: moments.meanY }
      const det = moments.c00 * moments.c11 - moments.c01 * moments.c01
      if (det <= 1e-6 || moments.c00 <= 0 || moments.c11 <= 0) {
        return { ...hasard, y, center: moments.meanY }
      }
      return {
        y,
        center: moments.meanY,
        vxx: moments.c00 * covScale,
        vxy: moments.c01 * covScale,
        vyy: moments.c11 * covScale,
      }
    }
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
      skew,
      moonFraction,
      tide,
      drift,
      phases,
      delayShear: delays.shear[t],
      delayStrain: delays.strain[t],
      starShear: star.shear,
      starStrain: star.strain,
      spreadPlane: planeOf(spreads[t], spreadMoments, hasardSpread),
      parityPlane: planeOf(parities[t], parityMoments, hasardParity),
    })
    previousCenter = center
  }
  return { options: { ...options, period }, sections, warmup: period }
}

export type TubeDrivers = { shear: number; strain: number; skew: number }

/**
 * Modes des rangs actifs, puis chaque horloge, les retards et les étoiles.
 * Translation → cisaillement. Ouverture → étirement ou compression.
 * N3 contre les extrêmes → asymétrie, et elle seule : les autres forces ne votent pas,
 * pour ne pas diluer ce mode en le moyennant avec des zéros.
 * Cisaillement et étirement : moyenne des groupes actifs, pour rester dans [−1, 1].
 */
export function sectionDrivers(section: TubeFrameSection, sources: readonly TubeSource[]): TubeDrivers {
  const active = new Set(sources)
  const ranks = TUBE_RANKS.filter((rank) => active.has(rank))
  const shear: number[] = []
  const strain: number[] = []
  let skew = 0
  if (ranks.length) {
    let translation = 0
    let opening = 0
    let skewRaw = 0
    for (const rank of ranks) {
      translation += section.translation[rank]
      opening += section.opening[rank]
      skewRaw += section.skew[rank]
    }
    shear.push(Math.tanh(translation))
    strain.push(Math.tanh(opening))
    skew = Math.tanh(skewRaw)
  }
  if (active.has("lune")) {
    shear.push(section.drift)
    strain.push(section.tide)
  }
  for (const id of TUBE_PHASES) {
    if (!active.has(id)) continue
    shear.push(section.phases[id].drift)
    strain.push(section.phases[id].tide)
  }
  if (active.has("retards")) {
    shear.push(section.delayShear)
    strain.push(section.delayStrain)
  }
  if (active.has("etoiles")) {
    shear.push(section.starShear)
    strain.push(section.starStrain)
  }
  const avg = (values: number[]) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0)
  return { shear: avg(shear), strain: avg(strain), skew }
}

export function applyGains(section: TubeFrameSection, drivers: TubeDrivers, gains: TubeGains): TubeSection {
  const shift = gains.cisaillement * drivers.shear * section.halfWidth
  const log2Factor =
    gains.etirement * Math.max(drivers.strain, 0) - gains.compression * Math.max(-drivers.strain, 0)
  const widthFactor = 2 ** log2Factor
  const bias = ASYM_REACH * (gains.asymetrie ?? 0) * drivers.skew
  const half = section.halfWidth * widthFactor
  const lowerHalf = half * (1 - bias)
  const upperHalf = half * (1 + bias)
  const deformedCenter = section.center + shift
  const deformedLower = deformedCenter - lowerHalf
  const deformedUpper = deformedCenter + upperHalf
  return {
    ...section,
    shearDriver: drivers.shear,
    strainDriver: drivers.strain,
    skewDriver: drivers.skew,
    shift,
    widthFactor,
    lowerHalf,
    upperHalf,
    cross: SHEAR_CROSS * gains.cisaillement * drivers.shear,
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
