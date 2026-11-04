import { LAG_LIMIT_DAYS, PAIR_TOLERANCE_DAYS, pearson } from "@/lib/annual-lag"
import { CURVE_KEYS, curveLabel, curveValues, type CurveKey, type CurveValues, type RankPoint } from "./curves"
import { EVENING_GAP_DAYS, otherEvening, weekdayOf } from "./soir"

/**
 * Risque de garder une relation de trop, toutes les mesures d’une archive comptées ensemble.
 * Sur une archive de hasard, la chance qu’une relation passe la barre est au plus de 1 %.
 */
export const RELATION_ALPHA = 0.01

/** Au moins autant de paires pour mesurer une corrélation : en dessous, la loi de r s’éloigne trop de la loi normale. */
export const RELATION_MIN_PAIRS = 20

export type MeasuredRelation = {
  /** z de Fisher : atanh(|r|)·√(n−3). Il range les relations entre elles, et la barre le juge. */
  score: number
  /** Corrélation mesurée, avec son signe. */
  r: number
  /** Paires de tirages mesurées. */
  n: number
  phrase: string
}

type Trial = { r: number; n: number; phrase: string }

const DAY_MS = 86_400_000
/** r = ±1 donnerait un z infini : la copie parfaite garde un z très grand, mais fini. */
const R_MAX = 1 - 1e-9

/**
 * z de Fisher d’un r mesuré sur n paires : atanh(|r|)·√(n−3).
 * Sans lien, il suit à peu près une loi normale réduite, quel que soit n : c’est ce qui permet de comparer
 * une corrélation de 140 tirages et une de 40.
 */
export function fisherZ(r: number, n: number) {
  return Math.abs(Math.atanh(Math.max(-R_MAX, Math.min(R_MAX, r)))) * Math.sqrt(Math.max(0, n - 3))
}

const TAIL_C = [
  -7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734, 4.374664141464968,
  2.938163982698783,
]
const TAIL_D = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416]

/** z tel que P(Z > z) = p, pour une loi normale réduite et p < 0,02 (algorithme d’Acklam, erreur relative < 2e-9). */
function upperTail(p: number) {
  const q = Math.sqrt(-2 * Math.log(p))
  const top = ((((TAIL_C[0] * q + TAIL_C[1]) * q + TAIL_C[2]) * q + TAIL_C[3]) * q + TAIL_C[4]) * q + TAIL_C[5]
  const bottom = (((TAIL_D[0] * q + TAIL_D[1]) * q + TAIL_D[2]) * q + TAIL_D[3]) * q + 1
  return -top / bottom
}

/**
 * La barre en z quand on a mesuré `tests` relations : celle de Bonferroni, au risque RELATION_ALPHA pour l’ensemble.
 * Plus on a cherché, plus la barre monte : 4,3 pour 600 mesures, 2,6 pour une seule.
 */
export function relationBar(tests: number) {
  return upperTail(Math.min(0.02, RELATION_ALPHA / (2 * Math.max(1, tests))))
}

function sens(score: number) {
  return score >= 0 ? "même sens" : "sens opposé"
}

function delayPhrase(late: CurveKey, lag: number) {
  if (lag <= 0) return "même pas"
  if (lag === 1) return `${curveLabel(late)} en retard d’un pas`
  return `${curveLabel(late)} en retard de deux pas`
}

function dayCount(count: number, word: "écart" | "décalage") {
  if (count === 0) return "sans décalage"
  if (count === 1) return `${word} d’un jour`
  return `${word} de ${count} jours`
}

/** Les deux étoiles et leur somme viennent d’un seul tirage de deux boules ; tout le reste, de celui des cinq numéros. */
const STAR_CURVES: ReadonlySet<CurveKey> = new Set<CurveKey>(["sumStars", "e1", "e2"])

/**
 * Deux courbes qui viennent des mêmes boules (n1 et n2, un numéro et une dizaine, Σn et d0, e1 et e2) se déduisent
 * l’une de l’autre au même tirage : leur lien est mécanique, il ne dit rien. D’un tirage à l’autre, il n’y en a pas.
 */
function sameBalls(left: CurveKey, right: CurveKey) {
  return STAR_CURVES.has(left) === STAR_CURVES.has(right)
}

/** Corrélation des valeurs, pas des pas : un pas d’une série au hasard est lié au pas d’avant, ce qui invente des retards. */
function measure(left: readonly number[], right: readonly number[], phrase: (r: number) => string): Trial | null {
  if (left.length < RELATION_MIN_PAIRS || left.length !== right.length) return null
  const r = pearson(left, right)
  return r == null ? null : { r, n: left.length, phrase: phrase(r) }
}

/** Deux courbes, au même tirage (hors boules communes), ou l’une en retard d’un ou deux tirages. */
function curveTrials(rows: readonly CurveValues[]) {
  const trials: Trial[] = []
  const keep = (trial: Trial | null) => {
    if (trial) trials.push(trial)
  }
  const columns = new Map(CURVE_KEYS.map((key) => [key, rows.map((row) => row[key])]))
  for (let leftIndex = 0; leftIndex < CURVE_KEYS.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < CURVE_KEYS.length; rightIndex += 1) {
      const left = CURVE_KEYS[leftIndex]
      const right = CURVE_KEYS[rightIndex]
      const leftValues = columns.get(left) ?? []
      const rightValues = columns.get(right) ?? []
      if (!sameBalls(left, right)) {
        keep(
          measure(leftValues, rightValues, (r) => `${curveLabel(left)} et ${curveLabel(right)}, ${sens(r)}, ${delayPhrase(right, 0)}`)
        )
      }
      for (const lag of [1, 2]) {
        keep(
          measure(
            leftValues.slice(0, -lag),
            rightValues.slice(lag),
            (r) => `${curveLabel(left)} et ${curveLabel(right)}, ${sens(r)}, ${delayPhrase(right, lag)}`
          )
        )
        keep(
          measure(
            rightValues.slice(0, -lag),
            leftValues.slice(lag),
            (r) => `${curveLabel(right)} et ${curveLabel(left)}, ${sens(r)}, ${delayPhrase(left, lag)}`
          )
        )
      }
    }
  }
  return trials
}

function utcOf(date: string) {
  return Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10)))
}

function addDays(date: string, days: number) {
  return new Date(utcOf(date) + days * DAY_MS).toISOString().slice(0, 10)
}

/** La même courbe, un soir contre l’autre : un mardi et le vendredi qui le précède, ou l’inverse. */
function eveningTrials(ordered: readonly RankPoint[], rows: readonly CurveValues[]) {
  const trials: Trial[] = []
  const where = new Map(ordered.map((point, index) => [point.date.slice(0, 10), index]))
  for (const evening of ["mardi", "vendredi"] as const) {
    for (let gap = 1; gap <= EVENING_GAP_DAYS; gap += 1) {
      const later: number[] = []
      const earlier: number[] = []
      ordered.forEach((point, index) => {
        if (weekdayOf(point.date) !== evening) return
        const other = where.get(addDays(point.date.slice(0, 10), -gap))
        if (other == null || weekdayOf(ordered[other].date) !== otherEvening(evening)) return
        later.push(index)
        earlier.push(other)
      })
      if (later.length < RELATION_MIN_PAIRS) continue
      for (const key of CURVE_KEYS) {
        const found = measure(
          later.map((index) => rows[index][key]),
          earlier.map((index) => rows[index][key]),
          (r) => `${curveLabel(key)}, mardi et vendredi, ${sens(r)}, ${dayCount(gap, "écart")}`
        )
        if (found) trials.push(found)
      }
    }
  }
  return trials
}

/** Le tirage de l’année n−1 le plus proche de `target`, à trois jours au plus. */
function nearestIndex(utc: readonly number[], target: number) {
  let low = 0
  let high = utc.length
  while (low < high) {
    const middle = (low + high) >> 1
    if (utc[middle] < target) low = middle + 1
    else high = middle
  }
  let best: number | null = null
  let bestGap = PAIR_TOLERANCE_DAYS * DAY_MS + 1
  for (const index of [low - 1, low]) {
    if (index < 0 || index >= utc.length) continue
    const gap = Math.abs(utc[index] - target)
    if (gap < bestGap) {
      best = index
      bestGap = gap
    }
  }
  return best
}

/** 0, −1, +1, −2, +2… : le plus petit décalage d’abord. */
function shiftsByReach() {
  const shifts = [0]
  for (let reach = 1; reach <= LAG_LIMIT_DAYS; reach += 1) shifts.push(-reach, reach)
  return shifts
}

/**
 * La même courbe, l’année n contre l’année n−1, tirage contre tirage de la même date décalée de −21 à +21 jours.
 * Deux décalages qui forment les mêmes paires ne font qu’une mesure : le plus petit est gardé.
 */
function yearTrials(ordered: readonly RankPoint[], rows: readonly CurveValues[]) {
  const trials: Trial[] = []
  if (ordered.length === 0) return trials
  const newest = Number(ordered[ordered.length - 1].date.slice(0, 4))
  const newer: number[] = []
  const older: number[] = []
  ordered.forEach((point, index) => {
    const year = Number(point.date.slice(0, 4))
    if (year === newest) newer.push(index)
    else if (year === newest - 1) older.push(index)
  })
  if (newer.length < RELATION_MIN_PAIRS || older.length < RELATION_MIN_PAIRS) return trials
  const olderUtc = older.map((index) => utcOf(ordered[index].date))
  const seen = new Set<string>()
  for (const shift of shiftsByReach()) {
    const now: number[] = []
    const before: number[] = []
    let previous = -1
    for (const index of newer) {
      const { date } = ordered[index]
      const target = Date.UTC(newest - 1, Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10)) + shift)
      const found = nearestIndex(olderUtc, target)
      if (found == null || found <= previous) continue
      previous = found
      now.push(index)
      before.push(older[found])
    }
    if (now.length < RELATION_MIN_PAIRS) continue
    const pairing = `${now.join(",")}/${before.join(",")}`
    if (seen.has(pairing)) continue
    seen.add(pairing)
    for (const key of CURVE_KEYS) {
      const found = measure(
        now.map((index) => rows[index][key]),
        before.map((index) => rows[index][key]),
        (r) => `${curveLabel(key)}, d’une année sur l’autre, ${sens(r)}, ${dayCount(Math.abs(shift), "décalage")}`
      )
      if (found) trials.push(found)
    }
  }
  return trials
}

/**
 * Les relations qui passent la barre, de la plus forte à la plus faible, rangées par z.
 * La barre dépend du nombre de mesures faites sur cette archive : plus on cherche, plus elle monte.
 */
export function measuredRelations(past: readonly RankPoint[]): MeasuredRelation[] {
  const ordered = [...past].sort((left, right) => left.date.localeCompare(right.date))
  const rows = ordered.map((point) => curveValues(point))
  const trials = [...curveTrials(rows), ...eveningTrials(ordered, rows), ...yearTrials(ordered, rows)]
  const bar = relationBar(trials.length)
  return trials
    .map((item) => ({ score: fisherZ(item.r, item.n), r: item.r, n: item.n, phrase: item.phrase }))
    .filter((item) => item.score >= bar)
    .sort((left, right) => right.score - left.score || left.phrase.localeCompare(right.phrase, "fr"))
}

/** La relation la plus forte. Vide si aucune ne passe la barre. */
export function strongestRelation(past: readonly RankPoint[]): MeasuredRelation | null {
  return measuredRelations(past)[0] ?? null
}
