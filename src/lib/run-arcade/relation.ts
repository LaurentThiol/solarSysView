import { annualLagZones, pearson, type LagPoint } from "@/lib/annual-lag"
import { CURVE_KEYS, curveLabel, curveValues, DECADE_KEYS, NUMBER_KEYS, type CurveKey, type RankPoint } from "./curves"
import { phaseLink, weekdayOf, type SoirPoint } from "./soir"

/** Même barre que la période du soir : en dessous, la relation ne se cherche pas. */
export const RELATION_BAR = 0.3

export type MeasuredRelation = {
  /** |r| de la relation. */
  score: number
  phrase: string
}

function steps(values: readonly number[]) {
  const out: number[] = []
  for (let index = 1; index < values.length; index += 1) out.push(values[index] - values[index - 1])
  return out
}

/** r des pas. `lag` retard de la seconde série, en tirages. */
function stepCorrelation(lead: readonly number[], late: readonly number[], lag: number) {
  const left = steps(lead)
  const right = steps(late)
  if (left.length <= lag || right.length <= lag) return null
  return pearson(left.slice(0, left.length - lag), right.slice(lag))
}

function sameDrawIdentity(left: CurveKey, right: CurveKey) {
  const numbers = NUMBER_KEYS as readonly string[]
  const decades = DECADE_KEYS as readonly string[]
  if (left === "sumNumbers" && numbers.includes(right)) return true
  if (right === "sumNumbers" && numbers.includes(left)) return true
  if (left === "sumStars" && (right === "e1" || right === "e2")) return true
  if (right === "sumStars" && (left === "e1" || left === "e2")) return true
  return decades.includes(left) && decades.includes(right)
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
  if (count === 1) return `${word} d’un jour`
  return `${word} de ${count} jours`
}

function keep(score: number | null, phrase: string): MeasuredRelation | null {
  if (score == null || Math.abs(score) < RELATION_BAR) return null
  return { score: Math.abs(score), phrase }
}

function column(past: readonly RankPoint[], key: CurveKey) {
  return past.map((point) => curveValues(point)[key])
}

/** Deux courbes, au même pas ou avec un retard d’un ou deux tirages. */
function curveRelations(past: readonly RankPoint[]) {
  const found: MeasuredRelation[] = []
  const values = new Map(CURVE_KEYS.map((key) => [key, column(past, key)]))
  for (let leftIndex = 0; leftIndex < CURVE_KEYS.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < CURVE_KEYS.length; rightIndex += 1) {
      const left = CURVE_KEYS[leftIndex]
      const right = CURVE_KEYS[rightIndex]
      const leftValues = values.get(left) ?? []
      const rightValues = values.get(right) ?? []
      const pairs: { lead: CurveKey; late: CurveKey; lag: number }[] = []
      if (!sameDrawIdentity(left, right)) pairs.push({ lead: left, late: right, lag: 0 })
      for (const lag of [1, 2]) {
        pairs.push({ lead: left, late: right, lag }, { lead: right, late: left, lag })
      }
      for (const pair of pairs) {
        const leadValues = pair.lead === left ? leftValues : rightValues
        const lateValues = pair.late === left ? leftValues : rightValues
        const score = stepCorrelation(leadValues, lateValues, pair.lag)
        const phrase = `${curveLabel(pair.lead)} et ${curveLabel(pair.late)}, ${sens(score ?? 0)}, ${delayPhrase(pair.late, pair.lag)}`
        const relation = keep(score, phrase)
        if (relation) found.push(relation)
      }
    }
  }
  return found
}

function evenings(past: readonly RankPoint[], key: CurveKey) {
  const mardi: SoirPoint[] = []
  const vendredi: SoirPoint[] = []
  for (const point of past) {
    const evening = weekdayOf(point.date)
    if (!evening) continue
    const item = { date: point.date, evening, value: curveValues(point)[key] }
    if (evening === "mardi") mardi.push(item)
    else vendredi.push(item)
  }
  return { mardi, vendredi }
}

/** La même courbe, mardi contre vendredi, écart de 1 à 4 jours. */
function eveningRelations(past: readonly RankPoint[]) {
  const found: MeasuredRelation[] = []
  for (const key of CURVE_KEYS) {
    const sides = evenings(past, key)
    const links = [phaseLink(sides.mardi, sides.vendredi), phaseLink(sides.vendredi, sides.mardi)]
    for (const link of links) {
      if (!link) continue
      const relation = keep(link.r, `${curveLabel(key)}, mardi et vendredi, ${dayCount(link.days, "écart")}`)
      if (relation) found.push(relation)
    }
  }
  return found
}

function lagPoint(date: string, sum: number): LagPoint {
  return {
    date: date.slice(0, 10),
    sum,
    month: Number(date.slice(5, 7)),
    day: Number(date.slice(8, 10)),
  }
}

/** La même courbe, l’année n contre n−1, avec le décalage retenu par Annuel. */
function yearRelations(past: readonly RankPoint[]) {
  const found: MeasuredRelation[] = []
  if (past.length === 0) return found
  const newest = Number(past[past.length - 1].date.slice(0, 4))
  for (const key of CURVE_KEYS) {
    const newer: LagPoint[] = []
    const older: LagPoint[] = []
    for (const point of past) {
      const year = Number(point.date.slice(0, 4))
      const item = lagPoint(point.date, curveValues(point)[key])
      if (year === newest) newer.push(item)
      else if (year === newest - 1) older.push(item)
    }
    if (newer.length < 8 || older.length < 8) continue
    for (const zone of annualLagZones(newer, older)) {
      if (!zone.kept || zone.tau == null || zone.rTau == null) continue
      const days = Math.abs(zone.tau)
      const relation = keep(
        zone.rTau,
        `${curveLabel(key)}, d’une année sur l’autre, ${sens(zone.rTau)}, ${dayCount(days, "décalage")}`
      )
      if (relation) found.push(relation)
    }
  }
  return found
}

/** Toutes les relations au-dessus du seuil, de la plus forte à la plus faible. */
export function measuredRelations(past: readonly RankPoint[]): MeasuredRelation[] {
  const ordered = [...past].sort((left, right) => left.date.localeCompare(right.date))
  return [...curveRelations(ordered), ...eveningRelations(ordered), ...yearRelations(ordered)].sort(
    (left, right) => right.score - left.score || left.phrase.localeCompare(right.phrase, "fr")
  )
}

/** La relation la plus forte. Vide si aucune ne passe le seuil. */
export function strongestRelation(past: readonly RankPoint[]): MeasuredRelation | null {
  return measuredRelations(past)[0] ?? null
}
