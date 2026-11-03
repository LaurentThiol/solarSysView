import type { CurveKey, CurveValues, RankPoint } from "./curves"

/** Mardi et vendredi sont le même jeu. L’écart tient en 4 jours : 3 vers le vendredi, 4 vers le mardi. */
export const EVENING_GAP_DAYS = 4

export const HARMONIC_ORDERS = [1, 2, 3, 0.5, 1 / 3] as const

export type Evening = "mardi" | "vendredi"

export type SoirPoint = {
  date: string
  evening: Evening
  value: number
}

export type SoirReading = {
  evening: Evening
  other: Evening
  /** Jours entre le soir à jouer et le vis-à-vis. Vide s’il n’y en a pas. */
  days: number | null
  tip: number
}

const WEEKDAYS = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"] as const

export function weekdayOf(iso: string): Evening | null {
  const name = WEEKDAYS[new Date(`${iso.slice(0, 10)}T12:00:00Z`).getUTCDay()]
  return name === "mardi" || name === "vendredi" ? name : null
}

export function otherEvening(evening: Evening): Evening {
  return evening === "mardi" ? "vendredi" : "mardi"
}

/** Le soir qui suit un tirage : mardi puis vendredi, vendredi puis mardi. */
export function nextEvening(iso: string): Evening {
  const day = new Date(`${iso.slice(0, 10)}T12:00:00Z`).getUTCDay()
  if (day === 2) return "vendredi"
  if (day === 5) return "mardi"
  return day < 2 || day > 5 ? "mardi" : "vendredi"
}

export function eveningToPlay(lastDate: string, hiddenDate?: string | null): Evening {
  const hidden = hiddenDate ? weekdayOf(hiddenDate) : null
  if (hidden) return hidden
  return nextEvening(lastDate)
}

export function daysBetween(later: string, earlier: string) {
  const ms =
    Date.parse(`${later.slice(0, 10)}T12:00:00Z`) - Date.parse(`${earlier.slice(0, 10)}T12:00:00Z`)
  return Math.round(ms / 86_400_000)
}

/** Numéro du jour d’une date. L’écart de deux numéros est `daysBetween`, sans refaire de `Date.parse`. */
function dayNumber(iso: string) {
  return Math.round(Date.parse(`${iso.slice(0, 10)}T12:00:00Z`) / 86_400_000)
}

function pearson(left: readonly number[], right: readonly number[]) {
  const count = Math.min(left.length, right.length)
  if (count < 3) return null
  let meanLeft = 0
  let meanRight = 0
  for (let index = 0; index < count; index += 1) {
    meanLeft += left[index]
    meanRight += right[index]
  }
  meanLeft /= count
  meanRight /= count
  let num = 0
  let leftSq = 0
  let rightSq = 0
  for (let index = 0; index < count; index += 1) {
    const a = left[index] - meanLeft
    const b = right[index] - meanRight
    num += a * b
    leftSq += a * a
    rightSq += b * b
  }
  if (leftSq === 0 || rightSq === 0) return null
  return num / Math.sqrt(leftSq * rightSq)
}

/**
 * Période la plus nette, en pas de la suite.
 * Sur la série mélangée, le pas 2 est la semaine : il ne compte pas comme fondamentale.
 */
function lagScore(values: readonly number[], lag: number) {
  if (lag < 1 || values.length - lag < 3) return null
  const left: number[] = []
  const right: number[] = []
  for (let index = lag; index < values.length; index += 1) {
    left.push(values[index])
    right.push(values[index - lag])
  }
  const score = pearson(left, right)
  return score == null ? null : Math.abs(score)
}

export function fundamentalPeriod(values: readonly number[], perEvening: boolean): number | null {
  const minLag = perEvening ? 2 : 3
  const maxLag = Math.floor(values.length / 2)
  let bestLag: number | null = null
  let best = 0
  for (let lag = minLag; lag <= maxLag; lag += 1) {
    const score = lagScore(values, lag)
    if (score == null || score <= best) continue
    best = score
    bestLag = lag
  }
  if (!perEvening) {
    const week = lagScore(values, 2)
    // Deux tirages mélangés, c’est la semaine. Si elle explique la suite, ce n’est pas une fondamentale du jeu.
    if (week != null && week >= 0.3 && (bestLag == null || week >= best)) return null
  }
  return best >= 0.3 ? bestLag : null
}

function nearestOrder(ratio: number) {
  let best: (typeof HARMONIC_ORDERS)[number] = HARMONIC_ORDERS[0]
  for (const order of HARMONIC_ORDERS) {
    if (Math.abs(order - ratio) < Math.abs(best - ratio)) best = order
  }
  return Math.abs(best - ratio) <= 0.2 ? best : null
}

/**
 * Décalage en jours, de 1 à 4, qui aligne le mieux les deux soirs, et son r.
 * L’autre soir est indexé par numéro de jour : un vis-à-vis se trouve sans parcourir la série.
 * Si deux tirages tombent le même jour, le premier garde la place.
 */
export function phaseLink(play: readonly SoirPoint[], other: readonly SoirPoint[]): { days: number; r: number } | null {
  const byDay = new Map<number, SoirPoint>()
  for (const item of other) {
    const day = dayNumber(item.date)
    if (Number.isFinite(day) && !byDay.has(day)) byDay.set(day, item)
  }
  const playDays = play.map((point) => dayNumber(point.date))
  let bestLag: number | null = null
  let best = 0
  let bestR = 0
  for (let lag = 1; lag <= EVENING_GAP_DAYS; lag += 1) {
    const left: number[] = []
    const right: number[] = []
    for (let index = 0; index < play.length; index += 1) {
      const match = byDay.get(playDays[index] - lag)
      if (!match) continue
      left.push(play[index].value)
      right.push(match.value)
    }
    const score = pearson(left, right)
    if (score == null || Math.abs(score) <= best) continue
    best = Math.abs(score)
    bestLag = lag
    bestR = score
  }
  if (bestLag == null) return null
  return { days: bestLag, r: bestR }
}

/** Décalage en jours, de 1 à 4, qui aligne le mieux les deux soirs. */
export function phaseDays(play: readonly SoirPoint[], other: readonly SoirPoint[]): number | null {
  return phaseLink(play, other)?.days ?? null
}

export function sharedHarmonic(mardi: readonly number[], vendredi: readonly number[]) {
  const mardiPeriod = fundamentalPeriod(mardi, true)
  const vendrediPeriod = fundamentalPeriod(vendredi, true)
  if (mardiPeriod == null || vendrediPeriod == null) return { period: null, order: null }
  const order = nearestOrder(mardiPeriod / vendrediPeriod) ?? nearestOrder(vendrediPeriod / mardiPeriod)
  if (order == null) return { period: null, order: null }
  return { period: Math.min(mardiPeriod, vendrediPeriod), order }
}

function split(past: readonly RankPoint[], rows: readonly CurveValues[], key: CurveKey) {
  const mardi: SoirPoint[] = []
  const vendredi: SoirPoint[] = []
  const ordered = past
    .map((point, index) => ({ point, value: rows[index]?.[key] }))
    .filter((item): item is { point: RankPoint; value: number } => typeof item.value === "number" && Number.isFinite(item.value))
    .sort((a, b) => a.point.date.localeCompare(b.point.date))
  for (const item of ordered) {
    const evening = weekdayOf(item.point.date)
    if (!evening) continue
    const soir = { date: item.point.date, evening, value: item.value }
    if (evening === "mardi") mardi.push(soir)
    else vendredi.push(soir)
  }
  return { mardi, vendredi }
}

function stepTip(series: readonly SoirPoint[], index: number) {
  const value = series[index].value
  const previous = index > 0 ? series[index - 1].value : value
  return value + (value - previous)
}

/**
 * Lecture du soir à jouer. L’harmonique commune n’y est plus calculée : aucun écran ne la montre.
 * Un écran qui la montrera appellera `sharedHarmonic` à part.
 */
export function soirReading(
  past: readonly RankPoint[],
  rows: readonly CurveValues[],
  key: CurveKey,
  hiddenDate?: string | null
): SoirReading {
  const lastDate = past.reduce((latest, point) => (point.date > latest ? point.date : latest), "")
  if (!lastDate || rows.length === 0) {
    return { evening: "mardi", other: "mardi", days: null, tip: 0 }
  }
  const evening = eveningToPlay(lastDate, hiddenDate)
  const other = otherEvening(evening)
  const sides = split(past, rows, key)
  const playSeries = sides[evening]
  const otherSeries = sides[other]
  const target = hiddenDate && weekdayOf(hiddenDate) ? hiddenDate : addDays(lastDate, evening === "vendredi" ? 3 : 4)
  const targetDay = dayNumber(target)
  const otherDays = otherSeries.map((point) => dayNumber(point.date))
  let match = -1
  let days: number | null = null
  let nearest = EVENING_GAP_DAYS + 1
  for (let index = 0; index < otherDays.length; index += 1) {
    const gap = Math.abs(targetDay - otherDays[index])
    if (gap <= EVENING_GAP_DAYS && gap < nearest) {
      match = index
      days = gap
      nearest = gap
    }
  }
  const aligned = phaseDays(playSeries, otherSeries)
  if (aligned != null && match >= 0) {
    const phased = otherDays.findIndex((day) => Math.abs(targetDay - day) === aligned)
    if (phased >= 0) {
      match = phased
      days = aligned
    }
  }
  const sameStep = playSeries.length > 0 ? stepTip(playSeries, playSeries.length - 1) : null
  const tip = match >= 0 ? stepTip(otherSeries, match) : (sameStep ?? rows[rows.length - 1][key])
  return {
    evening,
    other: match >= 0 ? other : evening,
    days: match >= 0 ? days : null,
    tip,
  }
}

function addDays(iso: string, days: number) {
  const date = new Date(`${iso.slice(0, 10)}T12:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

export function formatOrder(order: number) {
  if (Math.abs(order - 1 / 3) < 0.02) return "1/3"
  if (Math.abs(order - 0.5) < 0.02) return "1/2"
  return String(order)
}
