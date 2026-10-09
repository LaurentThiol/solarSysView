/** Marges à 95 % du retour et des décalages : IC de Student, écarts appariés, communs du hasard, Wilson. */

import { wilson } from "@/lib/analysis"
import { formatDecimal } from "@/lib/nextdata/compare"

export type MeanInterval = { value: number | null; lo: number | null; hi: number | null; count: number }

/** lower : la lecture se trompe moins que sa rivale sur tout l’intervalle. higher : plus. undecided : l’intervalle contient 0. */
export type Verdict = "lower" | "higher" | "undecided"

export type PairedGap = MeanInterval & { p: number | null; verdict: Verdict | null }

export type ChanceHits = {
  observed: number | null
  expected: number
  lo: number | null
  hi: number | null
  p: number | null
  count: number
}

export type HitsChance = { numbers: ChanceHits | null; stars: ChanceHits | null }

function finite(value: number | null | undefined): value is number {
  return value != null && Number.isFinite(value)
}

/** « 17,8 à 27,9 », une décimale. Sans bornes, un tiret. */
export function formatInterval(interval: { lo: number | null; hi: number | null } | null | undefined) {
  if (!interval || !finite(interval.lo) || !finite(interval.hi)) return "—"
  return `${formatDecimal(interval.lo)} à ${formatDecimal(interval.hi)}`
}

/** « IC 95 % : 17,8 à 27,9 ». Rien sous deux tirages. */
export function maeInterval(interval: MeanInterval | null | undefined) {
  const range = formatInterval(interval)
  return range === "—" ? "" : `IC 95 % : ${range}`
}

const VERDICT_LABEL: Record<Verdict, string> = {
  lower: "erreur plus basse",
  higher: "erreur plus haute",
  undecided: "non tranché",
}

export function verdictLabel(verdict: Verdict | null | undefined) {
  return verdict ? VERDICT_LABEL[verdict] : "—"
}

/** Écart moyen d’erreur absolue, lecture moins rivale, et son intervalle : « -1,2 ; IC -4,4 à 2,1 ». */
export function formatGap(gap: PairedGap | null | undefined) {
  if (!gap || !finite(gap.value)) return "—"
  const value = formatDecimal(gap.value, true)
  return finite(gap.lo) && finite(gap.hi) ? `${value} ; IC ${formatInterval(gap)}` : `${value} ; un seul tirage`
}

/** « non tranché (-1,2 ; IC -4,4 à 2,1) » : le verdict apparié, puis ses nombres. */
export function versusText(gap: PairedGap | null | undefined) {
  if (!gap?.verdict) return "—"
  return `${verdictLabel(gap.verdict)} (${formatGap(gap)})`
}

/** Communs moyens, deux décimales : « 0,58 ». */
export function formatHits(value: number | null | undefined) {
  if (!finite(value)) return "—"
  return value.toFixed(2).replace(".", ",")
}

/** « 0,58 numéro », « 2,00 numéros » : singulier sous 2. */
export function hitsWord(value: number, one: string, many: string) {
  return `${formatHits(value)} ${Math.abs(value) < 2 ? one : many}`
}

/** « 0,50 (0,10 à 0,90) » : moyenne du hasard et sa plage à 95 %. */
export function chanceRange(chance: ChanceHits | null | undefined) {
  if (!chance || !finite(chance.lo) || !finite(chance.hi)) return "—"
  return `${formatHits(chance.expected)} (${formatHits(chance.lo)} à ${formatHits(chance.hi)})`
}

/** « le hasard donne 0,50, entre 0,10 et 0,90 sur 10 tirages ». */
export function chanceText(chance: ChanceHits | null | undefined) {
  if (!chance || !finite(chance.lo) || !finite(chance.hi)) return ""
  const word = chance.count > 1 ? "tirages" : "tirage"
  return `le hasard donne ${formatHits(chance.expected)}, entre ${formatHits(chance.lo)} et ${formatHits(chance.hi)} sur ${chance.count} ${word}`
}

/** Le p unilatéral en clair : combien de fois sur 100 une grille au hasard fait au moins autant. */
export function chanceOdds(chance: ChanceHits | null | undefined) {
  if (!chance || !finite(chance.p)) return ""
  const times = Math.round(chance.p * 100)
  return times < 1
    ? "une grille au hasard fait au moins autant moins d’une fois sur 100"
    : `une grille au hasard fait au moins autant ${times} fois sur 100`
}

/** « 49 à 94 % » : bornes d’une part, en pour cent entiers. */
export function formatShareInterval(lo: number | null | undefined, hi: number | null | undefined) {
  if (!finite(lo) || !finite(hi)) return "—"
  return `${Math.round(lo * 100)} à ${Math.round(hi * 100)} %`
}

/** Bornes de Wilson à 95 % de inside/total, « 49 à 94 % ». */
export function coverageRange(inside: number, total: number) {
  if (total <= 0) return "—"
  const { lo, hi } = wilson(inside, total)
  return formatShareInterval(lo, hi)
}

/** « 8/10 (49 à 94 %) ». */
export function formatCoverage(inside: number, total: number) {
  if (total <= 0) return "—"
  return `${inside}/${total} (${coverageRange(inside, total)})`
}
