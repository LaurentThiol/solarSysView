import { MINUTES_MAX, MINUTES_MIN, MINUTES_STEP } from "./clock"
import type { RankPoint } from "./curves"
import { departBounds, maxRaceDraws, RACE_DRAWS_MIN, snapDepart } from "./depart"
import { RUNNER_MAX } from "./thought"

export const RUNNER_MIN = 1

/** Valeurs retenues des quatre champs du formulaire. `date` : le départ, calé sur un vrai tirage. */
export type FieldValues = { count: number; draws: number; minutes: number; date: string }

/** Texte tapé, pas encore corrigé. Un champ absent n’a pas été touché. */
export type FieldDrafts = Partial<Record<keyof FieldValues, string>>

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

/** Un nombre lu dans un texte. Vide, ou illisible : rien. */
function readNumber(text: string | undefined) {
  if (text == null || text.trim() === "") return null
  const value = Number(text)
  return Number.isFinite(value) ? value : null
}

/**
 * Un entier tapé, ramené entre `min` et `max`.
 * Un texte vide ou illisible garde la valeur d’avant : effacer le champ pour taper « 8 » ne donne plus « 1 » puis « 18 ».
 */
export function settleInteger(text: string | undefined, min: number, max: number, previous: number) {
  const value = readNumber(text)
  return clamp(value == null ? previous : Math.round(value), min, max)
}

/** Des minutes tapées : par demi-minute, de 0 à 120. */
export function settleMinutes(text: string | undefined, previous: number) {
  const value = readNumber(text)
  const stepped = value == null ? previous : Math.round(value / MINUTES_STEP) * MINUTES_STEP
  return clamp(stepped, MINUTES_MIN, MINUTES_MAX)
}

/** Un départ tapé : un jour complet AAAA-MM-JJ. Un champ à moitié rempli reste vide, et ne vaut pas le premier tirage. */
export function readDay(text: string | undefined) {
  return text != null && /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null
}

/**
 * Les quatre champs, corrigés d’un coup à la sortie d’un champ ou au lancement.
 * Les tirages ne dépassent jamais la piste (`maxRaceDraws`), et le départ est un tirage de l’archive gratuite
 * qui correspond à ces tirages. Une date absente ou incomplète garde le départ d’avant.
 */
export function settleFields(series: readonly RankPoint[], values: FieldValues, drafts: FieldDrafts): FieldValues {
  const count = settleInteger(drafts.count, RUNNER_MIN, RUNNER_MAX, values.count)
  const draws = settleInteger(drafts.draws, RACE_DRAWS_MIN, maxRaceDraws(series), values.draws)
  const minutes = settleMinutes(drafts.minutes, values.minutes)
  const bounds = departBounds(series, draws)
  const day = readDay(drafts.date) ?? (values.date || bounds.first)
  const date = bounds.first ? (snapDepart(bounds.free, day) ?? bounds.first) : ""
  return { count, draws, minutes, date }
}
