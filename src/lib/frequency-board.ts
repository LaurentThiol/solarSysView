import type { FrequencyItem } from "./frequency-rank.ts"

/** Sous ce rapport, la barre est « sous l’attendu ». Au-dessus de 1,15, « au-dessus ». */
export const METER_QUIET = 0.85
export const METER_LOUD = 1.15

export type MeterReading = {
  span: number
  /** 0–100, part de la piste occupée par la valeur. */
  valuePct: number
  /** Position du trait de loi, ou null s’il n’y a pas de loi. */
  expectedPct: number | null
  /** Valeur / attendu. */
  ratio: number | null
  /** Strictement au-delà de 2× l’attendu. */
  over: boolean
}

/**
 * Barre contre une loi.
 * Tant que la valeur reste ≤ 2× l’attendu, le trait est à 50 % de la piste
 * (la même place que l’ancienne marque à 6 h). Au-delà, la barre remplit
 * la piste et le trait recule vers la gauche.
 */
export function meterReading(value: number, expected: number): MeterReading {
  const safeValue = Number.isFinite(value) ? Math.max(0, value) : 0
  const hasLaw = Number.isFinite(expected) && expected > 0
  const span = Math.max(hasLaw ? expected * 2 : 0, safeValue, 1)
  return {
    span,
    valuePct: Math.min(100, (safeValue / span) * 100),
    expectedPct: hasLaw ? (expected / span) * 100 : null,
    ratio: hasLaw ? safeValue / expected : null,
    over: hasLaw && value > expected * 2,
  }
}

export function meterPhrase(ratio: number | null): string {
  if (ratio == null || !Number.isFinite(ratio)) return "—"
  if (ratio < METER_QUIET) return "sous l’attendu"
  if (ratio > METER_LOUD) return "au-dessus de l’attendu"
  return "proche de l’attendu"
}

export function formatFr(value: number, digits = 1): string {
  if (!Number.isFinite(value)) return "—"
  return value.toLocaleString("fr-FR", {
    maximumFractionDigits: digits,
    minimumFractionDigits: 0,
  })
}

export function formatSignedFr(value: number, digits = 1): string {
  if (!Number.isFinite(value)) return "—"
  const rounded = Number(value.toFixed(digits))
  const normalized = rounded === 0 ? 0 : rounded
  return normalized.toLocaleString("fr-FR", {
    maximumFractionDigits: digits,
    minimumFractionDigits: 0,
    signDisplay: "exceptZero",
  })
}

export function formatMeterRatio(ratio: number | null): string {
  if (ratio == null || !Number.isFinite(ratio)) return "—"
  return `${ratio.toLocaleString("fr-FR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} ×`
}

export const FREQUENCY_SORT_KEYS = [
  "value",
  "parity",
  "count",
  "delta",
  "delay",
  "ratio",
] as const

export type FrequencySortKey = (typeof FREQUENCY_SORT_KEYS)[number]
export type SortDir = "asc" | "desc"

export function defaultSortDir(key: FrequencySortKey): SortDir {
  return key === "value" || key === "parity" ? "asc" : "desc"
}

function parityRank(value: number) {
  return value % 2 === 0 ? 0 : 1
}

function rowDelta(count: number, expected: number) {
  return Number.isFinite(expected) ? count - expected : count
}

function rowRatio(count: number, expected: number) {
  if (!Number.isFinite(expected) || expected <= 0) return count
  return count / expected
}

export function compareFrequencyRows(
  a: Pick<FrequencyItem, "value" | "count" | "delayDraws">,
  b: Pick<FrequencyItem, "value" | "count" | "delayDraws">,
  key: FrequencySortKey,
  dir: SortDir,
  expected: number
): number {
  const sign = dir === "asc" ? 1 : -1
  let primary = 0
  if (key === "value") primary = a.value - b.value
  else if (key === "parity") primary = parityRank(a.value) - parityRank(b.value)
  else if (key === "count") primary = a.count - b.count
  else if (key === "delay") primary = a.delayDraws - b.delayDraws
  else if (key === "delta") primary = rowDelta(a.count, expected) - rowDelta(b.count, expected)
  else primary = rowRatio(a.count, expected) - rowRatio(b.count, expected)
  if (primary !== 0) return primary * sign
  return a.value - b.value
}

export function sortFrequencyRows<T extends Pick<FrequencyItem, "value" | "count" | "delayDraws">>(
  items: readonly T[],
  key: FrequencySortKey,
  dir: SortDir,
  expected: number
): T[] {
  return [...items].sort((a, b) => compareFrequencyRows(a, b, key, dir, expected))
}

export type BoardDigest = {
  above: number
  over: number
  medianDelay: number | null
}

export function boardDigest(
  items: readonly Pick<FrequencyItem, "count" | "delayDraws">[],
  expected: number
): BoardDigest {
  let above = 0
  let over = 0
  const delays: number[] = []
  for (const item of items) {
    if (expected > 0 && item.count > expected) above += 1
    if (expected > 0 && item.count > expected * 2) over += 1
    if (Number.isFinite(item.delayDraws)) delays.push(item.delayDraws)
  }
  delays.sort((a, b) => a - b)
  return { above, over, medianDelay: median(delays) }
}

function median(values: number[]): number | null {
  if (values.length === 0) return null
  const mid = Math.floor(values.length / 2)
  if (values.length % 2 === 1) return values[mid]
  return (values[mid - 1] + values[mid]) / 2
}

export function boardSummary(digest: BoardDigest, expected: number): string {
  if (!(expected > 0)) return "Pas d’attendu sur une fenêtre vide."
  const hot = digest.over > 0 ? ` · ${digest.over} au-delà de 2×` : ""
  const median =
    digest.medianDelay == null ? "" : ` · retard médian ${formatFr(digest.medianDelay, 1)}`
  return `Attendu ${formatFr(expected, 1)}× · ${digest.above} au-dessus${hot}${median}`
}
