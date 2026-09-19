/** Calculs de gains EuroMillions, sans archive : EU FDJ comprend la France. */

export function winnersOutsideFrance(
  winnersFr: number | null | undefined,
  winnersEu: number | null | undefined
): number | null {
  if (winnersFr == null || winnersEu == null) return null
  if (!Number.isFinite(winnersFr) || !Number.isFinite(winnersEu)) return null
  return Math.max(0, winnersEu - winnersFr)
}

export function shareFrPercent(
  winnersFr: number | null | undefined,
  winnersEu: number | null | undefined
): number | null {
  if (winnersFr == null || winnersEu == null) return null
  if (!Number.isFinite(winnersFr) || !Number.isFinite(winnersEu) || winnersEu === 0) {
    return null
  }
  return (winnersFr / winnersEu) * 100
}

export function numbersSum(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0)
}

export function finiteNumbers(
  values: Array<number | null | undefined>
): number[] {
  return values.filter(
    (value): value is number => typeof value === "number" && Number.isFinite(value)
  )
}

export function pairedFinite(
  xs: Array<number | null | undefined>,
  ys: Array<number | null | undefined>
): { xs: number[]; ys: number[] } {
  const outX: number[] = []
  const outY: number[] = []
  const n = Math.min(xs.length, ys.length)
  for (let i = 0; i < n; i += 1) {
    const x = xs[i]
    const y = ys[i]
    if (
      typeof x === "number" &&
      Number.isFinite(x) &&
      typeof y === "number" &&
      Number.isFinite(y)
    ) {
      outX.push(x)
      outY.push(y)
    }
  }
  return { xs: outX, ys: outY }
}

export function isPrizeRank(value: number): boolean {
  return Number.isInteger(value) && value >= 1 && value <= 13
}

export function formatCompactCount(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—"
  const abs = Math.abs(value)
  if (abs >= 1_000_000) {
    return `${(value / 1_000_000).toLocaleString("fr-FR", {
      maximumFractionDigits: 1,
    })} M`
  }
  if (abs >= 10_000) {
    return `${(value / 1_000).toLocaleString("fr-FR", {
      maximumFractionDigits: 0,
    })} k`
  }
  return value.toLocaleString("fr-FR", { maximumFractionDigits: 0 })
}

export function formatCompactEuro(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—"
  const abs = Math.abs(value)
  if (abs >= 1_000_000) {
    return `${(value / 1_000_000).toLocaleString("fr-FR", {
      maximumFractionDigits: 1,
    })} M€`
  }
  if (abs >= 10_000) {
    return `${(value / 1_000).toLocaleString("fr-FR", {
      maximumFractionDigits: 0,
    })} k€`
  }
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)
}

export function prizeMass(
  winners: number | null | undefined,
  prize: number | null | undefined
): number | null {
  if (winners == null || prize == null) return null
  if (!Number.isFinite(winners) || !Number.isFinite(prize)) return null
  return winners * prize
}

export const PRIZE_RANKS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13] as const

export type GainsWeekday = "all" | "mardi" | "vendredi"

export function normalizeDrawWeekday(
  value: string | null | undefined
): "mardi" | "vendredi" | null {
  const day = String(value ?? "").toLowerCase()
  if (day === "mardi" || day === "vendredi") return day
  return null
}

export function filterDrawsByWeekday<T extends { weekday?: string }>(
  draws: T[],
  weekday: GainsWeekday
): T[] {
  if (weekday === "all") return draws
  return draws.filter((draw) => normalizeDrawWeekday(draw.weekday) === weekday)
}

export function weekdayMean(
  values: Array<{ weekday?: string; value: number | null | undefined }>,
  weekday: "mardi" | "vendredi"
): number | null {
  const picked = finiteNumbers(
    values
      .filter((item) => normalizeDrawWeekday(item.weekday) === weekday)
      .map((item) => item.value)
  )
  if (!picked.length) return null
  return picked.reduce((sum, value) => sum + value, 0) / picked.length
}

/** Clé plate Recharts pour la masse EU d’un rang (R1 = jackpot). */
export function massRankKey(rank: number): string {
  return `massR${rank}`
}

/** 0 et les négatifs n’ont pas de place sur une échelle log. */
export function logPlotValue(value: number | null | undefined): number | null {
  if (value == null || !Number.isFinite(value) || value <= 0) return null
  return value
}

export function logDomain(
  values: Array<number | null | undefined>
): [number, number] | null {
  const positives = finiteNumbers(values).filter((value) => value > 0)
  if (!positives.length) return null
  const min = Math.min(...positives)
  const max = Math.max(...positives)
  const floor = min >= 1 ? Math.max(1, min / 2) : min / 2
  return [floor, max]
}

/**
 * Longueur de report : nombre de tirages consécutifs sans gagnant du jackpot.
 * `steps` est chronologique : 1 = report, 0 = gagnant, null = inconnu.
 * Un inconnu n’allonge ni ne casse la série (le compteur reste).
 */
export function reportLengthsFromSteps(
  steps: Array<number | null | undefined>
): Array<number | null> {
  let streak = 0
  return steps.map((step) => {
    if (step == null || !Number.isFinite(step)) return null
    if (step > 0) {
      streak += 1
      return streak
    }
    streak = 0
    return 0
  })
}
