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
