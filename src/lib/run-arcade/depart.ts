import { buildTrack, type RankPoint } from "./curves"
import { EXAM_WINDOW, examStart } from "./examen"

export type DepartMode = "fixe" | "aleatoire"

export type DepartChoice = { mode: "fixe"; date: string } | { mode: "aleatoire" }

export const RACE_DRAWS_MIN = 4
export const RACE_DRAWS_MAX = 120

/**
 * Plus grand nombre de tirages de course : la piste (années n−1 et n), moins deux tirages gratuits.
 * L’archive entière ne compte pas : ses années plus anciennes ne sont ni lues ni courues.
 */
export function maxRaceDraws(series: readonly RankPoint[]) {
  return Math.max(RACE_DRAWS_MIN, Math.min(RACE_DRAWS_MAX, buildTrack(series).length - 2))
}

/** Premier index de course : les tirages d’avant sont gratuits. */
export function raceStartIndex(trackLength: number, draws: number) {
  const span = Math.max(1, Math.round(draws))
  const end = Math.max(0, trackLength)
  return Math.min(end, Math.max(2, end - span))
}

/** Archive gratuite : la piste, jusqu’au tirage d’avant la course. */
export function freeBeforeRace(track: readonly RankPoint[], draws: number): RankPoint[] {
  return track.slice(0, raceStartIndex(track.length, draws)).map((point) => ({ ...point }))
}

/**
 * Dates de départ valides, du premier tirage au dernier qui laisse encore deux tirages lus.
 * L’examen, les 25 derniers de cette archive, n’en fait pas partie.
 */
export function departDates(free: readonly RankPoint[], size = EXAM_WINDOW): string[] {
  const last = examStart(free.length, size) - 2
  if (last < 0) return []
  const dates: string[] = []
  for (let index = 0; index <= last; index += 1) dates.push(free[index].date)
  return dates
}

/**
 * Cale un jour sur un vrai tirage.
 * Un jour vide prend le tirage suivant.
 * Avant la piste : le premier tirage.
 * Dans l’examen, pendant la course, ou après : le dernier départ qui laisse deux tirages lus.
 */
export function snapDepart(free: readonly RankPoint[], date: string, size = EXAM_WINDOW): string | null {
  const dates = departDates(free, size)
  if (dates.length === 0) return null
  const day = date.slice(0, 10)
  if (day <= dates[0]) return dates[0]
  for (const item of dates) {
    if (item >= day) return item
  }
  return dates[dates.length - 1]
}

/** Tirages de la zone lue écartés parce qu’ils sont avant le départ. */
export function droppedBefore(free: readonly RankPoint[], since: string, size = EXAM_WINDOW) {
  if (!since) return 0
  const learned = free.slice(0, examStart(free.length, size))
  return learned.filter((point) => point.date < since).length
}

/** Passé autorisé : les tirages à partir du départ. Une date vide ne coupe rien. */
export function sincePast<T extends { date: string }>(past: readonly T[], since: string): T[] {
  const kept = since ? past.filter((point) => point.date >= since) : past
  return kept.map((point) => ({ ...point }))
}

export function departBounds(series: readonly RankPoint[], draws: number) {
  const track = buildTrack(series)
  const free = freeBeforeRace(track, draws)
  const dates = departDates(free)
  return { first: dates[0] ?? "", last: dates[dates.length - 1] ?? "", free }
}

/** Phrase de l’appel : la date, les tirages lus, ceux écartés avant. */
export function departSentence(since: string, read: number, dropped: number) {
  const lus = read > 1 ? `${read} tirages lus` : `${read} tirage lu`
  const ecartes = dropped > 1 ? `${dropped} tirages écartés avant ce départ` : `${dropped} tirage écarté avant ce départ`
  return `Départ ${since}. ${lus}. ${ecartes}.`
}

export function droppedLabel(dropped: number) {
  if (dropped > 1) return `${dropped} écartés`
  return `${dropped} écarté`
}

/** Mélange deux entiers en un entier de 32 bits sans signe. Une graine et un sel donnent toujours le même nombre. */
export function mix(seed: number, salt: number) {
  let x = (Math.imul(seed ^ salt, 0x9e3779b1) + 0x85ebca6b) >>> 0
  x = Math.imul(x ^ (x >>> 16), 0x7feb352d) >>> 0
  x = Math.imul(x ^ (x >>> 15), 0x846ca68b) >>> 0
  return (x ^ (x >>> 16)) >>> 0
}

/**
 * Une date par runner.
 * Fixe : la même, calée sur un tirage.
 * Aléatoire : un tirage différent par runner tant qu’il y a assez de départs, à partir de la graine.
 */
export function assignDeparts(
  free: readonly RankPoint[],
  count: number,
  choice: DepartChoice,
  seed: number,
  size = EXAM_WINDOW
): string[] {
  const dates = departDates(free, size)
  const n = Math.max(0, Math.round(count))
  if (dates.length === 0) return Array.from({ length: n }, () => "")
  if (choice.mode === "fixe") {
    const snapped = snapDepart(free, choice.date, size) ?? dates[0]
    return Array.from({ length: n }, () => snapped)
  }
  if (n <= dates.length) {
    const bag = dates.slice()
    for (let index = 0; index < n; index += 1) {
      const swap = index + (mix(seed, index + 1) % (bag.length - index))
      const hold = bag[index]
      bag[index] = bag[swap]
      bag[swap] = hold
    }
    return bag.slice(0, n)
  }
  return Array.from({ length: n }, (_, index) => dates[mix(seed, index + 1) % dates.length])
}
