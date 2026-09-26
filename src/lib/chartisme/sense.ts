// Nommer le sens d'une fenêtre : monte, baisse, stable.
//
// Jumeau de `synchro/chartisme/sense.py`. Le symbole de jambe classe un
// segment ; ce nom porte sur la fenêtre et ne le remplace pas.
//
// La droite passe par les deux bouts. L'écart-type est celui des résidus,
// rapporté à l'écart-type de la courbe entière. `05` si ce rapport ≤ 0,5,
// `1` s'il ≤ 1, `sup` au-delà. `stable` quand le déplacement net ne dépasse
// pas le nuage.
//
// La corde reste un résumé. Le découpage cherche le plus court tronçon d'au
// moins trois tirages dont le déplacement dépasse la référence et dont le
// nuage tient dans cette référence, puis le prolonge. Le nuage est l'écart-type
// des résidus, ou leur étendue pour une arche courte. Il ferme aussi le
// tronçon quand les trois derniers tirages forment une autre droite, dont le
// coefficient directeur s'écarte de plus que l'habitude des pentes — l'écart-type
// des pentes à trois tirages sur toute la courbe.

import { SHORT_CYCLE_MAX, SHORT_CYCLE_MIN } from "../short-cycle"

export const MIN_SENSE_LENGTH = 16

/** Un tronçon confirme une tendance à partir de trois tirages. */
export const MIN_SEGMENT_LENGTH = 3

export const TIGHT = 0.5
export const USUAL = 1.0

export const SENSES = ["monte", "baisse", "stable"] as const
export const REGISTERS = ["05", "1", "sup"] as const
export const SLOPE_SHIFTS = ["tourne", "accélère", "fatigue", "tient"] as const
export const SLOPE_HABITS = ["vive", "ordinaire"] as const

export type SenseName = (typeof SENSES)[number]
export type SenseRegister = (typeof REGISTERS)[number]
export type SlopeShift = (typeof SLOPE_SHIFTS)[number]
export type SlopeHabit = (typeof SLOPE_HABITS)[number]
export type CloudMeasure = "sigma" | "extent"

export type SenseSegment = {
  fromIndex: number
  toIndex: number
  symbol: string
  sense: SenseName
  register: SenseRegister
  sigma: number
  reference: number
  ratio: number | null
  delta: number
  slope: number
  slopeHabit: SlopeHabit | null
  slopeShift: SlopeShift | null
  /** Présent quand le nuage mesuré est l'étendue des résidus. */
  extent?: number
}

export type CurveSense = {
  symbol: string
  sense: SenseName
  register: SenseRegister
  sigma: number
  reference: number
  ratio: number | null
  delta: number
  /** Présent sur une arche de 4 à 8 tirages : le nuage est une étendue. */
  band?: "court"
  extent?: number
}

const SENSE_GLOSS: Record<SenseName, string> = {
  monte: "la fenêtre monte",
  baisse: "la fenêtre baisse",
  stable: "la fenêtre reste stable",
}

const REGISTER_GLOSS: Record<SenseRegister, string> = {
  "05": "le nuage autour de la droite tient dans la moitié de l'écart-type habituel",
  "1": "le nuage autour de la droite est de l'ordre de l'écart-type habituel",
  sup: "le nuage autour de la droite dépasse l'écart-type habituel",
}

const REGISTER_GLOSS_RANGE: Record<SenseRegister, string> = {
  "05": "le nuage autour de la droite tient dans la moitié de l'étendue habituelle",
  "1": "le nuage autour de la droite est de l'ordre de l'étendue habituelle",
  sup: "le nuage autour de la droite dépasse l'étendue habituelle",
}

const SLOPE_SHIFT_GLOSS: Record<SlopeShift, string> = {
  tourne: "la pente tourne",
  accélère: "la pente accélère",
  fatigue: "la pente fatigue",
  tient: "la pente tient",
}

const SLOPE_HABIT_GLOSS: Record<SlopeHabit, string> = {
  vive: "vive pour cette courbe",
  ordinaire: "ordinaire pour cette courbe",
}

function extentOf(values: number[]) {
  if (!values.length) return 0
  let lo = values[0]
  let hi = lo
  for (const value of values) {
    if (value < lo) lo = value
    if (value > hi) hi = value
  }
  return hi - lo
}

/** Aide au survol : la règle, pas une deuxième phrase de lecture. */
export const SENSE_TITLE =
  "La corde joint les deux bouts de la fenêtre. Les tronçons sont les plus courts bouts d'au moins trois tirages dont le déplacement dépasse le σ habituel et dont le nuage y tient. Leur coefficient directeur se compare au tronçon précédent et à l'écart-type des pentes à trois tirages de toute la courbe."

/** Écart-type de la série, divisé par n. Même définition que le jumeau Python. */
export function seriesSigma(values: number[]): number {
  const count = values.length
  if (count === 0) return 0
  let mean = 0
  for (const value of values) mean += value
  mean /= count
  let varSum = 0
  for (const value of values) {
    const delta = value - mean
    varSum += delta * delta
  }
  return Math.sqrt(varSum / count)
}

function scaleOf(value: number | null): number | null {
  if (value === null || !Number.isFinite(value) || value < 0) return null
  return value
}

/** Déplacement, coefficient directeur et nuage des résidus de la droite des bouts. */
function chord(
  values: number[],
  measure: CloudMeasure = "sigma"
): { delta: number; slope: number; cloud: number } {
  const count = values.length
  if (count < 2) return { delta: 0, slope: 0, cloud: 0 }
  const delta = values[count - 1] - values[0]
  const slope = delta / (count - 1)
  const residuals: number[] = []
  for (let index = 0; index < count; index += 1) {
    residuals.push(values[index] - (values[0] + slope * index))
  }
  return { delta, slope, cloud: measure === "extent" ? extentOf(residuals) : seriesSigma(residuals) }
}

/** Le nuage tient dans le σ habituel. Une habitude nulle n'accepte qu'une droite parfaite. */
function cloudHolds(sigma: number, reference: number): boolean {
  if (reference === 0) return sigma === 0
  return sigma <= reference
}

/**
 * Écart-type des coefficients directeurs à trois tirages.
 *
 * Pour chaque indice `i`, `m = (y[i + 2] - y[i]) / 2`. Moins de trois tirages :
 * aucune pente, l'écart-type est nul.
 */
export function seriesSlopeSigma(values: number[]): number {
  if (values.length < MIN_SEGMENT_LENGTH) return 0
  const slopes: number[] = []
  for (let index = 0; index < values.length - 2; index += 1) {
    slopes.push((values[index + 2] - values[index]) / 2)
  }
  return seriesSigma(slopes)
}

/** Coefficient directeur signé, quatre décimales au plus. */
export function formatSlope(value: number): string {
  if (!Number.isFinite(value)) return "∞"
  const rounded = Math.round(value * 10000) / 10000
  if (rounded === 0) return "0"
  const magnitude = Math.abs(rounded)
  const text = Number.isInteger(magnitude) ? String(magnitude) : magnitude.toFixed(4).replace(/0+$/, "").replace(/\.$/, "")
  return rounded < 0 ? `-${text}` : `+${text}`
}

/** `05` ≤ 0,5, `1` ≤ 1, `sup` au-delà. Les bornes sont inclusives. */
export function registerOf(ratio: number): SenseRegister {
  if (ratio <= TIGHT) return "05"
  if (ratio <= USUAL) return "1"
  return "sup"
}

/**
 * Symbole `monte:05` / `baisse:1` / `stable:sup`, ou `null` si on s'abstient.
 *
 * Sous `MIN_SENSE_LENGTH` points, ou sans écart-type de référence fini et
 * positif ou nul. Une référence nulle nomme quand même : nuage vide → `05`,
 * nuage non nul → `sup`.
 */
export function nameSense(values: number[], referenceSigma: number | null): CurveSense | null {
  const count = values.length
  if (count < MIN_SENSE_LENGTH) return null
  if (referenceSigma === null || !Number.isFinite(referenceSigma) || referenceSigma < 0) return null

  const delta = values[count - 1] - values[0]
  const slope = delta / (count - 1)
  const residuals: number[] = []
  for (let index = 0; index < count; index += 1) {
    residuals.push(values[index] - (values[0] + slope * index))
  }
  const sigma = seriesSigma(residuals)
  const ratio = referenceSigma === 0 ? (sigma === 0 ? 0 : Number.POSITIVE_INFINITY) : sigma / referenceSigma
  const sense: SenseName = Math.abs(delta) <= sigma ? "stable" : delta > 0 ? "monte" : "baisse"
  const register = registerOf(ratio)
  return {
    symbol: `${sense}:${register}`,
    sense,
    register,
    sigma,
    reference: referenceSigma,
    ratio: Number.isFinite(ratio) ? ratio : null,
    delta,
  }
}

function isTrend(chunk: number[], reference: number, measure: CloudMeasure): boolean {
  if (chunk.length < MIN_SEGMENT_LENGTH) return false
  const { delta, cloud } = chord(chunk, measure)
  if (reference === 0) return delta !== 0 && cloud === 0
  return Math.abs(delta) > reference && cloudHolds(cloud, reference)
}

function trendEnd(values: number[], start: number, reference: number, measure: CloudMeasure): number | null {
  for (let end = start + MIN_SEGMENT_LENGTH - 1; end < values.length; end += 1) {
    if (isTrend(values.slice(start, end + 1), reference, measure)) return end
  }
  return null
}

function tailBreaks(chunk: number[], reference: number, slopeSigma: number, measure: CloudMeasure): boolean {
  if (chunk.length < MIN_SEGMENT_LENGTH + 1) return false
  const { slope } = chord(chunk, measure)
  const tail = chord(chunk.slice(-MIN_SEGMENT_LENGTH), measure)
  if (!cloudHolds(tail.cloud, reference)) return false
  return Math.abs(tail.slope - slope) > slopeSigma
}

function slopeHabit(slope: number, slopeSigma: number | null): SlopeHabit | null {
  if (slopeSigma === null) return null
  if (slopeSigma === 0) return slope !== 0 ? "vive" : "ordinaire"
  return Math.abs(slope) > slopeSigma ? "vive" : "ordinaire"
}

function slopeShift(slope: number, previous: number | null, slopeSigma: number | null): SlopeShift | null {
  if (previous === null || slopeSigma === null) return null
  const opposite = (previous > 0 && slope < 0) || (previous < 0 && slope > 0)
  if (opposite) return "tourne"
  const gap = Math.abs(slope) - Math.abs(previous)
  if (gap > slopeSigma) return "accélère"
  if (-gap > slopeSigma) return "fatigue"
  return "tient"
}

function segmentOf(
  values: number[],
  start: number,
  end: number,
  reference: number,
  slopeSigma: number | null,
  previousSlope: number | null,
  stable: boolean,
  measure: CloudMeasure
): SenseSegment {
  const chunk = values.slice(start, end + 1)
  const { delta, slope, cloud } = chord(chunk, measure)
  const ratio = reference === 0 ? (cloud === 0 ? 0 : Number.POSITIVE_INFINITY) : cloud / reference
  const sense: SenseName = stable || delta === 0 ? "stable" : delta > 0 ? "monte" : "baisse"
  const register = registerOf(ratio)
  return {
    fromIndex: start,
    toIndex: end,
    symbol: `${sense}:${register}`,
    sense,
    register,
    sigma: cloud,
    reference,
    ratio: Number.isFinite(ratio) ? ratio : null,
    delta,
    slope,
    slopeHabit: slopeHabit(slope, slopeSigma),
    slopeShift: slopeShift(slope, previousSlope, slopeSigma),
    ...(measure === "extent" ? { extent: cloud } : {}),
  }
}

/**
 * Chaîne de tronçons. Le dernier point de l'un est le premier du suivant.
 *
 * On s'abstient si la référence manque ou n'est pas une échelle. `measure`
 * vaut `sigma` (écart-type des résidus) ou `extent` (max − min). Sans σ des
 * pentes, le nuage découpe quand même, et la comparaison des coefficients
 * s'abstient. Un σ de pentes nul coupe au moindre écart et nomme `vive`
 * toute pente non nulle.
 */
export function senseSegments(
  values: number[],
  referenceSigma: number | null,
  slopeSigma: number | null = null,
  measure: CloudMeasure = "sigma"
): SenseSegment[] | null {
  const cloudMeasure: CloudMeasure = measure === "extent" ? "extent" : "sigma"
  const reference = scaleOf(referenceSigma)
  if (reference === null) return null
  const slopeScale = scaleOf(slopeSigma)
  if (values.length === 0) return []

  const segments: SenseSegment[] = []
  let start = 0
  while (start < values.length) {
    const confirmed = trendEnd(values, start, reference, cloudMeasure)
    if (confirmed === null) {
      let stableEnd = values.length - 1
      for (let cursor = start + 1; cursor <= values.length - MIN_SEGMENT_LENGTH; cursor += 1) {
        if (trendEnd(values, cursor, reference, cloudMeasure) !== null) {
          stableEnd = cursor
          break
        }
      }
      segments.push(
        segmentOf(
          values,
          start,
          stableEnd,
          reference,
          slopeScale,
          segments.length ? segments[segments.length - 1].slope : null,
          true,
          cloudMeasure
        )
      )
      if (stableEnd >= values.length - 1) break
      start = stableEnd
      continue
    }

    let end = confirmed
    while (end + 1 < values.length) {
      const grown = values.slice(start, end + 2)
      if (!cloudHolds(chord(grown, cloudMeasure).cloud, reference)) break
      if (slopeScale !== null && tailBreaks(grown, reference, slopeScale, cloudMeasure)) break
      end += 1
    }
    segments.push(
      segmentOf(
        values,
        start,
        end,
        reference,
        slopeScale,
        segments.length ? segments[segments.length - 1].slope : null,
        false,
        cloudMeasure
      )
    )
    if (end >= values.length - 1) break
    start = end
  }
  return segments
}

/** Un tronçon : symbole, pente, rapport au précédent, rapport à l'habitude. */
export function segmentClause(segment: SenseSegment): string {
  let text = `${segment.symbol}, pente ${formatSlope(segment.slope)}`
  if (segment.slopeShift) text += `, ${SLOPE_SHIFT_GLOSS[segment.slopeShift]}`
  if (segment.slopeHabit) text += `, ${SLOPE_HABIT_GLOSS[segment.slopeHabit]}`
  return text
}

/** La chaîne lue sous le tracé. L'ordre est celui des tirages. */
export function segmentsSentence(segments: SenseSegment[] | null): string {
  if (!segments) return "L'écart-type habituel manque pour découper le sens."
  if (segments.length === 0) return "Pas de tirage à découper."
  const clauses = segments.map(segmentClause)
  if (clauses.length === 1) return `${clauses[0]}.`
  return `${clauses[0]}${clauses.slice(1).map((clause) => ` ; puis ${clause}`).join("")}.`
}

function readable(named: CurveSense | null): CurveSense | null {
  if (!named) return null
  if (!SENSE_GLOSS[named.sense] || !REGISTER_GLOSS[named.register] || !named.symbol) return null
  return named
}

/**
 * Sens d'une arche de 4 à 8 tirages.
 *
 * Le nuage est l'étendue des résidus, rapportée à l'étendue de référence.
 * Les registres restent 0,5 et 1. Le σ de toute la courbe n'est pas le dénominateur.
 */
export function nameShortSense(values: number[], referenceRange: number | null): CurveSense | null {
  const count = values.length
  if (count < SHORT_CYCLE_MIN || count > SHORT_CYCLE_MAX) return null
  if (referenceRange === null || !Number.isFinite(referenceRange) || referenceRange < 0) return null

  const delta = values[count - 1] - values[0]
  const slope = delta / (count - 1)
  const residuals: number[] = []
  for (let index = 0; index < count; index += 1) {
    residuals.push(values[index] - (values[0] + slope * index))
  }
  const cloud = extentOf(residuals)
  const ratio = referenceRange === 0 ? (cloud === 0 ? 0 : Number.POSITIVE_INFINITY) : cloud / referenceRange
  const sense: SenseName = Math.abs(delta) <= cloud ? "stable" : delta > 0 ? "monte" : "baisse"
  const register = registerOf(ratio)
  return {
    symbol: `${sense}:${register}`,
    sense,
    register,
    sigma: cloud,
    extent: cloud,
    reference: referenceRange,
    ratio: Number.isFinite(ratio) ? ratio : null,
    delta,
    band: "court",
  }
}

/**
 * Tronçons d'une arche de 4 à 8 tirages.
 *
 * Même boucle que `senseSegments`, avec l'étendue des résidus à la place du σ.
 * `nameShortSense` reste la corde. Sous trois tirages, rien à découper.
 */
export function shortSenseSegments(
  values: number[],
  referenceRange: number | null,
  slopeSigma: number | null = null
): SenseSegment[] | null {
  const count = values.length
  if (count < MIN_SEGMENT_LENGTH || count < SHORT_CYCLE_MIN || count > SHORT_CYCLE_MAX) return null
  return senseSegments(values, referenceRange, slopeSigma, "extent")
}

/** Phrase lue à côté du tracé. Le symbole reste en tête. */
export function senseSentence(named: CurveSense | null): string {
  const read = readable(named)
  if (!read) return "Fenêtre trop courte pour nommer le sens."
  const gloss = read.band === "court" ? REGISTER_GLOSS_RANGE : REGISTER_GLOSS
  return `${read.symbol} — ${SENSE_GLOSS[read.sense]}, et ${gloss[read.register]}.`
}

/**
 * Ce que devient le sens entre la fenêtre précédente et celle qu'on étudie.
 *
 * L'ordre est chronologique : la précédente d'abord. Le registre qui change
 * sans le sens reste un maintien. Sans fenêtre antérieure de même longueur,
 * la comparaison s'abstient.
 */
export function senseShiftSentence(
  current: CurveSense | null,
  previous: CurveSense | null,
  hasPrevious: boolean
): string {
  if (!hasPrevious) return "Pas de fenêtre antérieure de même longueur."
  const now = readable(current)
  const before = readable(previous)
  if (!now && !before) return "Les deux fenêtres sont trop courtes pour comparer le sens."
  if (!now || !before) return "L'une des deux fenêtres est trop courte pour comparer le sens."
  if (now.sense === before.sense && now.register === before.register) {
    return `Le sens tient : les deux fenêtres sont ${now.symbol}.`
  }
  if (now.sense === before.sense) {
    return `Le sens tient (${now.sense}), le registre passe de ${before.register} à ${now.register}.`
  }
  return `Le sens change : ${before.symbol}, puis ${now.symbol}.`
}
