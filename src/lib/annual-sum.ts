/**
 * Annuel : trois années alignées, somme des 5 numéros.
 * Mois de largeur égale, jour placé dans le mois — un 1er mars bissextile
 * tombe au même x qu’un 1er mars commun. Sans alias `@/` (tests Node).
 */

export const THEORETICAL_NUMBER_SUM = 128
export const ANNUAL_YEAR_SPAN = 3
export const NUMBER_SUM_FLOOR = 15
export const NUMBER_SUM_CEILING = 240

export const ANNUAL_MONTHS = [
  { month: 1, label: "janv." },
  { month: 2, label: "févr." },
  { month: 3, label: "mars" },
  { month: 4, label: "avr." },
  { month: 5, label: "mai" },
  { month: 6, label: "juin" },
  { month: 7, label: "juil." },
  { month: 8, label: "août" },
  { month: 9, label: "sept." },
  { month: 10, label: "oct." },
  { month: 11, label: "nov." },
  { month: 12, label: "déc." },
] as const

export type AnnualRole = "n" | "n-1" | "n-2"

export type AnnualDraw = {
  date: string
  weekday?: string
  numbers: number[]
}

export type AnnualBar = {
  date: string
  weekday: string
  sum: number
  numbers: number[]
  month: number
  day: number
  /** 0 au 1er janvier, 1 au 31 décembre. Centre du jour dans un mois de hauteur égale. */
  x: number
}

export type MonthMark = {
  month: number
  label: string
  /** Position du trait de fin de mois, 0 au 1er janvier et 1 au 31 décembre. */
  x: number
  mean: number | null
  count: number
}

export type AnnualLane = {
  year: number
  role: AnnualRole
  bars: AnnualBar[]
  months: MonthMark[]
  mean: number | null
  min: number | null
  max: number | null
  /** Année n sans tirage en décembre : l’année civile n’est pas close. */
  partial: boolean
  lastDate: string | null
}

export type MonthDelta = {
  month: number
  label: string
  /** Moyenne du mois le plus récent moins moyenne du mois plus ancien. */
  delta: number | null
  newerCount: number
  olderCount: number
}

export type AnnualPants = {
  anchorYear: number
  lanes: AnnualLane[]
  yMin: number
  yMax: number
  theoretical: number
  /** n moins n−1, puis n−1 moins n−2. */
  deltas: MonthDelta[][]
}

const ROLES: AnnualRole[] = ["n", "n-1", "n-2"]

export function newestYear(draws: readonly { date: string }[], fallback = 2004): number {
  let best = 0
  for (const draw of draws) {
    const year = calendarParts(draw.date)?.year ?? 0
    if (year > best) best = year
  }
  return best || fallback
}

/** Centre du jour, mois de largeur égale. */
export function annualBarX(month: number, day: number): number {
  const m = clampMonth(month)
  const d = Math.min(31, Math.max(1, day))
  return ((m - 1) + (d - 0.5) / 31) / 12
}

/** Trait à la fin du mois (1 = janvier … 12 = décembre). */
export function monthEndX(month: number): number {
  return clampMonth(month) / 12
}

/** Même seuil que le décalage zonal : soir le plus proche, à trois jours au plus. */
export const SAME_SENSE_DAY_TOLERANCE = 3

export type SameSensePoint = {
  date: string
  weekday: string
  sum: number
  month: number
  day: number
}

/** Clé d’un segment entre deux tirages consécutifs. */
export function sameSenseSegmentKey(fromDate: string, toDate: string): string {
  return `${fromDate}>${toDate}`
}

/**
 * Segments de n et de n−1 dont la somme va dans le même sens.
 * Un tirage de n s’apparie au même soir de n−1, au jour le plus proche
 * dans le repère (mois − 1) × 31 + jour, à trois jours au plus.
 * Les deux bouts d’un segment tombent sur deux tirages consécutifs de n−1.
 * Un écart nul reste hors du vert.
 */
export function sameSenseSegmentKeys(
  newer: readonly SameSensePoint[],
  older: readonly SameSensePoint[],
  toleranceDays = SAME_SENSE_DAY_TOLERANCE
): Set<string> {
  const left = chronological(newer)
  const right = chronological(older)
  const keys = new Set<string>()
  if (left.length < 2 || right.length < 2) return keys
  const tolerance = Math.max(0, toleranceDays)
  for (let index = 0; index < left.length - 1; index += 1) {
    const from = left[index]
    const to = left[index + 1]
    const fromIndex = nearestSameEvening(from, right, tolerance)
    const toIndex = nearestSameEvening(to, right, tolerance)
    if (fromIndex == null || toIndex == null || toIndex !== fromIndex + 1) continue
    const newerDelta = to.sum - from.sum
    const olderDelta = right[toIndex].sum - right[fromIndex].sum
    if (newerDelta === 0 || olderDelta === 0 || Math.sign(newerDelta) !== Math.sign(olderDelta)) {
      continue
    }
    keys.add(sameSenseSegmentKey(from.date, to.date))
    keys.add(sameSenseSegmentKey(right[fromIndex].date, right[toIndex].date))
  }
  return keys
}

export function annualYDomain(
  sums: readonly number[],
  theoretical = THEORETICAL_NUMBER_SUM
): { min: number; max: number } {
  const finite = sums.filter((value) => Number.isFinite(value))
  if (finite.length === 0) return { min: NUMBER_SUM_FLOOR, max: NUMBER_SUM_CEILING }
  let lo = Math.min(...finite, theoretical)
  let hi = Math.max(...finite, theoretical)
  const pad = Math.max(6, Math.round((hi - lo) * 0.06))
  lo = Math.max(NUMBER_SUM_FLOOR, lo - pad)
  hi = Math.min(NUMBER_SUM_CEILING, hi + pad)
  if (hi - lo < 30) {
    const mid = (hi + lo) / 2
    lo = Math.max(NUMBER_SUM_FLOOR, Math.floor(mid - 15))
    hi = Math.min(NUMBER_SUM_CEILING, Math.ceil(mid + 15))
  }
  if (lo >= hi) return { min: NUMBER_SUM_FLOOR, max: NUMBER_SUM_CEILING }
  return { min: lo, max: hi }
}

/**
 * Moyenne des sommes d’un mois.
 * Sans `days` : tous les tirages du mois.
 * Tableau vide : aucun soir, moyenne absente.
 * Sinon : seulement les soirs nommés (mardi, vendredi).
 */
export function annualMonthMean(
  bars: readonly { month: number; sum: number; weekday?: string }[],
  month: number,
  days?: readonly string[]
): { mean: number | null; count: number } {
  const allowed = days == null ? null : new Set(days)
  const values: number[] = []
  for (const bar of bars) {
    if (bar.month !== month || !Number.isFinite(bar.sum)) continue
    if (allowed && !allowed.has(String(bar.weekday ?? ""))) continue
    values.push(bar.sum)
  }
  return { mean: average(values), count: values.length }
}

export function monthMeanDeltas(newer: AnnualLane, older: AnnualLane): MonthDelta[] {
  return ANNUAL_MONTHS.map((item, index) => {
    const left = newer.months[index]
    const right = older.months[index]
    const delta =
      left?.mean != null && right?.mean != null ? left.mean - right.mean : null
    return {
      month: item.month,
      label: item.label,
      delta,
      newerCount: left?.count ?? 0,
      olderCount: right?.count ?? 0,
    }
  })
}

export function annualPants(
  draws: readonly AnnualDraw[],
  anchor?: number
): AnnualPants {
  const anchorYear = anchor ?? newestYear(draws)
  const lanes = ROLES.map((role, index) => laneFor(draws, anchorYear - index, role, anchorYear))
  const sums = lanes.flatMap((lane) => lane.bars.map((bar) => bar.sum))
  const y = annualYDomain(sums)
  return {
    anchorYear,
    lanes,
    yMin: y.min,
    yMax: y.max,
    theoretical: THEORETICAL_NUMBER_SUM,
    deltas: [
      monthMeanDeltas(lanes[0], lanes[1]),
      monthMeanDeltas(lanes[1], lanes[2]),
    ],
  }
}

function laneFor(
  draws: readonly AnnualDraw[],
  year: number,
  role: AnnualRole,
  anchorYear: number
): AnnualLane {
  const byDate = new Map<string, AnnualDraw>()
  for (const draw of draws) {
    const parts = calendarParts(draw.date)
    if (!parts || parts.year !== year) continue
    const sum = numberSum(draw.numbers)
    if (sum == null) continue
    byDate.set(draw.date.slice(0, 10), draw)
  }
  const bars = [...byDate.values()]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((draw) => {
      const parts = calendarParts(draw.date)!
      const numbers = draw.numbers.slice(0, 5)
      return {
        date: draw.date.slice(0, 10),
        weekday: String(draw.weekday ?? ""),
        sum: numberSum(numbers)!,
        numbers,
        month: parts.month,
        day: parts.day,
        x: annualBarX(parts.month, parts.day),
      }
    })
  const months = ANNUAL_MONTHS.map((item) => {
    const values = bars.filter((bar) => bar.month === item.month).map((bar) => bar.sum)
    return {
      month: item.month,
      label: item.label,
      x: monthEndX(item.month),
      mean: average(values),
      count: values.length,
    }
  })
  const sums = bars.map((bar) => bar.sum)
  const last = bars[bars.length - 1]
  return {
    year,
    role,
    bars,
    months,
    mean: average(sums),
    min: sums.length ? Math.min(...sums) : null,
    max: sums.length ? Math.max(...sums) : null,
    partial: year === anchorYear && last != null && last.month < 12,
    lastDate: last?.date ?? null,
  }
}

function numberSum(values: readonly number[] | undefined): number | null {
  if (!values || values.length < 5) return null
  let sum = 0
  for (let i = 0; i < 5; i += 1) {
    const value = values[i]
    if (typeof value !== "number" || !Number.isFinite(value)) return null
    sum += value
  }
  return sum
}

function average(values: readonly number[]): number | null {
  if (values.length === 0) return null
  return values.reduce((total, value) => total + value, 0) / values.length
}

function chronological<T extends { date: string }>(points: readonly T[]): T[] {
  return [...points].sort((a, b) => a.date.localeCompare(b.date))
}

/** Jour dans le mois de 31 cases du graphique annuel. */
function chartSlot(month: number, day: number): number {
  return (clampMonth(month) - 1) * 31 + Math.min(31, Math.max(1, day))
}

function nearestSameEvening(
  point: SameSensePoint,
  older: readonly SameSensePoint[],
  tolerance: number
): number | null {
  if (!point.weekday) return null
  const target = chartSlot(point.month, point.day)
  let best = -1
  let bestDist = tolerance + 1
  for (let index = 0; index < older.length; index += 1) {
    const other = older[index]
    if (other.weekday !== point.weekday) continue
    const dist = Math.abs(chartSlot(other.month, other.day) - target)
    if (dist < bestDist) {
      best = index
      bestDist = dist
    }
  }
  if (best < 0 || bestDist > tolerance) return null
  return best
}

function clampMonth(month: number) {
  return Math.min(12, Math.max(1, Math.trunc(month)))
}

function calendarParts(date: string): { year: number; month: number; day: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(date)
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  if (!Number.isFinite(year) || month < 1 || month > 12 || day < 1 || day > 31) return null
  return { year, month, day }
}
