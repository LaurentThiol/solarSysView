// Nommer le sens d'une fenêtre : monte, baisse, stable.
//
// Jumeau de `synchro/chartisme/sense.py`. Le symbole de jambe classe un
// segment ; ce nom porte sur la fenêtre et ne le remplace pas.
//
// La droite passe par les deux bouts. L'écart-type est celui des résidus,
// rapporté à l'écart-type de la courbe entière. `05` si ce rapport ≤ 0,5,
// `1` s'il ≤ 1, `sup` au-delà. `stable` quand le déplacement net ne dépasse
// pas le nuage.

export const MIN_SENSE_LENGTH = 16

export const TIGHT = 0.5
export const USUAL = 1.0

export const SENSES = ["monte", "baisse", "stable"] as const
export const REGISTERS = ["05", "1", "sup"] as const

export type SenseName = (typeof SENSES)[number]
export type SenseRegister = (typeof REGISTERS)[number]

export type CurveSense = {
  symbol: string
  sense: SenseName
  register: SenseRegister
  sigma: number
  reference: number
  ratio: number | null
  delta: number
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

/** Aide au survol : la règle, pas une deuxième phrase de lecture. */
export const SENSE_TITLE =
  "Droite entre les deux bouts. Stable si le déplacement net ne dépasse pas l'écart-type des résidus. Registre : cet écart-type divisé par celui de toute la courbe — 05 jusqu'à 0,5, 1 jusqu'à 1, sup au-delà."

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

function readable(named: CurveSense | null): CurveSense | null {
  if (!named) return null
  if (!SENSE_GLOSS[named.sense] || !REGISTER_GLOSS[named.register] || !named.symbol) return null
  return named
}

/** Phrase lue à côté du tracé. Le symbole reste en tête. */
export function senseSentence(named: CurveSense | null): string {
  const read = readable(named)
  if (!read) return "Fenêtre trop courte pour nommer le sens."
  return `${read.symbol} — ${SENSE_GLOSS[read.sense]}, et ${REGISTER_GLOSS[read.register]}.`
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
