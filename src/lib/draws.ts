import rawDraws from "@/data/euromillions-2026.json"
import {
  consecutiveCount,
  decadeCounts,
  decadeOccupied,
  decadePeak,
  spreadOf,
} from "@/lib/grid-shape"
import {
  expectedNumberDelay,
  expectedStarDelay,
  hottest,
  overdue,
  type FrequencyItem,
} from "@/lib/frequency-rank"
import {
  massRankKey,
  numbersSum,
  PRIZE_RANKS,
  prizeMass,
  reportLengthsFromSteps,
  shareFrPercent,
  winnersOutsideFrance,
} from "@/lib/gains"

export {
  expectedNumberDelay,
  expectedStarDelay,
  hottest,
  overdue,
  type FrequencyItem,
}

export {
  filterDrawsByWeekday,
  finiteNumbers,
  formatCompactCount,
  formatCompactEuro,
  isPrizeRank,
  logDomain,
  logPlotValue,
  massRankKey,
  normalizeDrawWeekday,
  numbersSum,
  pairedFinite,
  PRIZE_RANKS,
  prizeMass,
  reportLengthsFromSteps,
  shareFrPercent,
  weekdayMean,
  winnersOutsideFrance,
  type GainsWeekday,
  type WeekdayScope,
} from "@/lib/gains"

export type PrizeTier = {
  rank: number
  winners_fr: number | null
  winners_eu: number | null
  winners_total?: number | null
  prize: number | null
}

export type Draw = {
  id: number
  date: string
  weekday: "mardi" | "vendredi" | string
  numbers: number[]
  stars: number[]
  star_pool?: number
  prizes?: PrizeTier[]
  winners_total_fr?: number | null
  winners_total_eu?: number | null
}

export const PRIZE_RANK_LABELS: Record<number, string> = {
  1: "5 numéros + 2 étoiles",
  2: "5 numéros + 1 étoile",
  3: "5 numéros",
  4: "4 numéros + 2 étoiles",
  5: "4 numéros + 1 étoile",
  6: "3 numéros + 2 étoiles",
  7: "4 numéros",
  8: "2 numéros + 2 étoiles",
  9: "3 numéros + 1 étoile",
  10: "3 numéros",
  11: "1 numéro + 2 étoiles",
  12: "2 numéros + 1 étoile",
  13: "2 numéros",
}

export function parsePrizeTiers(raw: unknown): PrizeTier[] | undefined {
  if (!Array.isArray(raw) || raw.length === 0) return undefined
  const tiers: PrizeTier[] = []
  for (const item of raw) {
    if (!item || typeof item !== "object") continue
    const row = item as Record<string, unknown>
    const rank = Number(row.rank)
    if (!Number.isInteger(rank) || rank < 1 || rank > 13) continue
    const prizeRaw = row.prize
    const prizeNum =
      prizeRaw == null || prizeRaw === "" ? NaN : Number(prizeRaw)
    const winnersFr = toOptionalInt(row.winners_fr)
    const winnersEu = toOptionalInt(row.winners_eu)
    const winnersTotal = toOptionalInt(row.winners_total)
    tiers.push({
      rank,
      winners_fr: winnersFr,
      winners_eu: winnersEu,
      winners_total:
        winnersTotal ?? rankWinnersTotal(winnersFr, winnersEu),
      prize: Number.isFinite(prizeNum) ? prizeNum : null,
    })
  }
  return tiers.length > 0 ? tiers : undefined
}

function toOptionalInt(value: unknown): number | null {
  if (value == null || value === "") return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

/** Total d’un rang : la colonne FDJ « en Europe » inclut la France. */
export function rankWinnersTotal(
  winnersFr: number | null | undefined,
  winnersEu: number | null | undefined
): number | null {
  if (winnersEu != null && Number.isFinite(winnersEu)) return winnersEu
  if (winnersFr != null && Number.isFinite(winnersFr)) return winnersFr
  return null
}

export function totalWinners(
  draw: Pick<Draw, "prizes" | "winners_total_fr" | "winners_total_eu"> | null | undefined
): { fr: number | null; eu: number | null } {
  if (draw?.winners_total_fr != null || draw?.winners_total_eu != null) {
    return {
      fr: draw.winners_total_fr ?? null,
      eu: draw.winners_total_eu ?? null,
    }
  }
  let fr = 0
  let eu = 0
  let hasFr = false
  let hasEu = false
  for (const tier of draw?.prizes ?? []) {
    if (tier.winners_fr != null && Number.isFinite(tier.winners_fr)) {
      fr += tier.winners_fr
      hasFr = true
    }
    if (tier.winners_eu != null && Number.isFinite(tier.winners_eu)) {
      eu += tier.winners_eu
      hasEu = true
    }
  }
  return { fr: hasFr ? fr : null, eu: hasEu ? eu : null }
}

export function formatCount(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—"
  return value.toLocaleString("fr-FR")
}

export function formatWinnerTotals(
  draw: Pick<Draw, "prizes" | "winners_total_fr" | "winners_total_eu"> | null | undefined
): string {
  const { fr, eu } = totalWinners(draw)
  if (fr == null && eu == null) return "n.d."
  if (fr == null) return `${formatCount(eu)} EU`
  if (eu == null) return `${formatCount(fr)} FR`
  return `${formatCount(fr)} FR · ${formatCount(eu)} EU`
}

export function prizeTierAtRank(
  draw: Pick<Draw, "prizes"> | null | undefined,
  rank: number | null | undefined
): PrizeTier | null {
  if (rank == null || !draw?.prizes?.length) return null
  return draw.prizes.find((item) => item.rank === rank) ?? null
}

export function prizeAtRank(
  draw: Pick<Draw, "prizes"> | null | undefined,
  rank: number | null | undefined
): number | null {
  const tier = prizeTierAtRank(draw, rank)
  if (!tier || tier.prize == null || !Number.isFinite(tier.prize)) return null
  return tier.prize
}

/**
 * Pas de la ligne « gagnant 1er rang » : 0 s’il y a au moins un gagnant
 * du jackpot (total Europe, France comprise), +1 sinon (report).
 */
export function rank1WinnerStep(
  draw: Pick<Draw, "prizes"> | null | undefined
): number | null {
  const tier = prizeTierAtRank(draw, 1)
  if (!tier) return null
  const winners =
    tier.winners_total ?? rankWinnersTotal(tier.winners_fr, tier.winners_eu)
  if (winners == null || !Number.isFinite(winners)) return null
  return winners > 0 ? 0 : 1
}

export function formatRank1Step(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—"
  return value === 0 ? "0 · gagnant" : "+1 · pas gagnant"
}

export function formatEuro(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "n.d."
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)
}

export function formatJackpot(draw: Pick<Draw, "prizes"> | null | undefined): string {
  const tier = draw?.prizes?.find((item) => item.rank === 1)
  if (!tier || tier.prize == null || !Number.isFinite(tier.prize)) return "n.d."
  const winners = tier.winners_eu ?? tier.winners_fr
  if (tier.prize === 0 && (winners == null || winners === 0)) return "Report"
  return formatEuro(tier.prize)
}

export function meanPrizeByRank(
  draws: Array<Pick<Draw, "prizes">>
): Map<number, number | null> {
  const sums = new Map<number, { total: number; n: number }>()
  for (const draw of draws) {
    for (const tier of draw.prizes ?? []) {
      if (tier.prize == null || !Number.isFinite(tier.prize)) continue
      const slot = sums.get(tier.rank) ?? { total: 0, n: 0 }
      slot.total += tier.prize
      slot.n += 1
      sums.set(tier.rank, slot)
    }
  }
  const out = new Map<number, number | null>()
  for (const [rank, slot] of sums) {
    out.set(rank, slot.n > 0 ? slot.total / slot.n : null)
  }
  return out
}

export type GainsScope = "totals" | number

export function winnersForScope(
  draw: Pick<Draw, "prizes" | "winners_total_fr" | "winners_total_eu">,
  scope: GainsScope
): { fr: number | null; eu: number | null; exFr: number | null } {
  if (scope === "totals") {
    const totals = totalWinners(draw)
    return {
      fr: totals.fr,
      eu: totals.eu,
      exFr: winnersOutsideFrance(totals.fr, totals.eu),
    }
  }
  const tier = prizeTierAtRank(draw, scope)
  if (!tier) return { fr: null, eu: null, exFr: null }
  const eu = rankWinnersTotal(tier.winners_fr, tier.winners_eu)
  return {
    fr: tier.winners_fr,
    eu,
    exFr: winnersOutsideFrance(tier.winners_fr, eu),
  }
}

export function jackpotAmount(
  draw: Pick<Draw, "prizes"> | null | undefined
): number | null {
  const tier = prizeTierAtRank(draw, 1)
  if (!tier || tier.prize == null || !Number.isFinite(tier.prize)) return null
  return tier.prize
}

export function payoutMass(
  draw: Pick<Draw, "prizes">,
  scope: GainsScope
): { fr: number | null; eu: number | null } {
  if (scope === "totals") {
    let fr = 0
    let eu = 0
    let hasFr = false
    let hasEu = false
    for (const tier of draw.prizes ?? []) {
      if (tier.prize == null || !Number.isFinite(tier.prize)) continue
      const frMass = prizeMass(tier.winners_fr, tier.prize)
      if (frMass != null) {
        fr += frMass
        hasFr = true
      }
      const winnersEu = rankWinnersTotal(tier.winners_fr, tier.winners_eu)
      const euMass = prizeMass(winnersEu, tier.prize)
      if (euMass != null) {
        eu += euMass
        hasEu = true
      }
    }
    return { fr: hasFr ? fr : null, eu: hasEu ? eu : null }
  }
  const tier = prizeTierAtRank(draw, scope)
  if (!tier || tier.prize == null || !Number.isFinite(tier.prize)) {
    return { fr: null, eu: null }
  }
  const eu = rankWinnersTotal(tier.winners_fr, tier.winners_eu)
  return {
    fr: prizeMass(tier.winners_fr, tier.prize),
    eu: prizeMass(eu, tier.prize),
  }
}

export type GainsChartPoint = {
  date: string
  id: number
  weekday: string
  sumNumbers: number
  winnersFr: number | null
  winnersEu: number | null
  winnersExFr: number | null
  winnersR1: number | null
  winnersR13: number | null
  shareFr: number | null
  jackpot: number | null
  prizeR13: number | null
  massFr: number | null
  massEu: number | null
  massR1: number | null
  massR13: number | null
  rank1: number | null
  reportLength: number | null
} & Record<string, number | string | null>

export function payoutMassAtRank(
  draw: Pick<Draw, "prizes">,
  rank: number,
  side: "fr" | "eu" = "eu"
): number | null {
  const tier = prizeTierAtRank(draw, rank)
  if (!tier || tier.prize == null || !Number.isFinite(tier.prize)) return null
  if (side === "fr") return prizeMass(tier.winners_fr, tier.prize)
  const eu = rankWinnersTotal(tier.winners_fr, tier.winners_eu)
  return prizeMass(eu, tier.prize)
}

export function reportLengthByDate(
  history: Array<Pick<Draw, "date" | "prizes">>
): Map<string, number | null> {
  const newest = new Map<string, Pick<Draw, "date" | "prizes">>()
  for (const draw of history) newest.set(draw.date, draw)
  const ordered = [...newest.values()].sort((a, b) => a.date.localeCompare(b.date))
  const lengths = reportLengthsFromSteps(ordered.map((draw) => rank1WinnerStep(draw)))
  return new Map(ordered.map((draw, index) => [draw.date, lengths[index] ?? null]))
}

export function toGainsChart(
  draws: Draw[],
  scope: GainsScope = "totals",
  history: Array<Pick<Draw, "date" | "prizes">> = draws
): GainsChartPoint[] {
  const reports = reportLengthByDate(history.length ? history : draws)
  return [...draws]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((draw) => {
      const winners = winnersForScope(draw, scope)
      const mass = payoutMass(draw, scope)
      const rank1 = winnersForScope(draw, 1)
      const rank13 = winnersForScope(draw, 13)
      const masses: Record<string, number | null> = {}
      for (const rank of PRIZE_RANKS) {
        masses[massRankKey(rank)] = payoutMassAtRank(draw, rank, "eu")
      }
      return {
        date: draw.date,
        id: draw.id,
        weekday: draw.weekday,
        sumNumbers: numbersSum(draw.numbers),
        winnersFr: winners.fr,
        winnersEu: winners.eu,
        winnersExFr: winners.exFr,
        winnersR1: rank1.eu,
        winnersR13: rank13.eu,
        shareFr: shareFrPercent(winners.fr, winners.eu),
        jackpot: jackpotAmount(draw),
        prizeR13: prizeAtRank(draw, 13),
        massFr: mass.fr,
        massEu: mass.eu,
        massR1: masses.massR1 ?? null,
        massR13: masses.massR13 ?? null,
        rank1: rank1WinnerStep(draw),
        reportLength: reports.get(draw.date) ?? null,
        ...masses,
      }
    })
}

export const DRAWS: Draw[] = [...rawDraws].sort((a, b) =>
  b.date.localeCompare(a.date)
)

export const MONTHS = [
  { value: "all", label: "Tous les mois" },
  { value: "01", label: "Janvier" },
  { value: "02", label: "Février" },
  { value: "03", label: "Mars" },
  { value: "04", label: "Avril" },
  { value: "05", label: "Mai" },
  { value: "06", label: "Juin" },
  { value: "07", label: "Juillet" },
  { value: "08", label: "Août" },
  { value: "09", label: "Septembre" },
  { value: "10", label: "Octobre" },
  { value: "11", label: "Novembre" },
  { value: "12", label: "Décembre" },
] as const

export const FIRST_DRAW = DRAWS[DRAWS.length - 1]
export const LAST_DRAW = DRAWS[0]

export function monthsPresent(draws: Draw[]) {
  const present = new Set(draws.map((draw) => monthOf(draw.date)))
  return [
    { value: "all", label: "Tous les mois" },
    ...MONTHS.filter((item) => item.value !== "all" && present.has(item.value)),
  ]
}

export function archiveSummary(draws: Draw[]) {
  if (draws.length === 0) {
    return "Historique des tirages EuroMillions."
  }
  const sorted = [...draws].sort((a, b) => a.date.localeCompare(b.date))
  const first = sorted[0]
  const last = sorted[sorted.length - 1]
  const year = first.date.slice(0, 4)
  const sameYear = year === last.date.slice(0, 4)
  if (sameYear) {
    return `Les ${draws.length} tirages de ${year}, du ${first.weekday} ${first.date} au ${last.weekday} ${last.date}.`
  }
  return `Les ${draws.length} tirages, du ${first.weekday} ${first.date} au ${last.weekday} ${last.date}.`
}

export function formatSyncStamp(iso: string | null | undefined): string | null {
  if (!iso) return null
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return null
  return new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date)
}

export function formatDrawDate(isoDate: string) {
  return new Intl.DateTimeFormat("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(`${isoDate}T12:00:00`))
}

export function formatShortDate(isoDate: string) {
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "2-digit",
  }).format(new Date(`${isoDate}T12:00:00`))
}

export function monthOf(isoDate: string) {
  return isoDate.slice(5, 7)
}

export function parseQueryNumbers(query: string): number[] {
  return [
    ...new Set(
      query
        .split(/[\s,;+]+/)
        .map((token) => Number.parseInt(token, 10))
        .filter((n) => Number.isInteger(n) && n >= 1 && n <= 50)
    ),
  ]
}

export function drawMatchesQuery(draw: Draw, wanted: number[]) {
  if (wanted.length === 0) return true
  const pool = new Set([...draw.numbers, ...draw.stars])
  return wanted.every((n) => pool.has(n))
}

export function toCsv(draws: Draw[]) {
  const ranks = Array.from({ length: 13 }, (_, i) => i + 1)
  const header = [
    "date",
    "jour",
    "tirage",
    "n1",
    "n2",
    "n3",
    "n4",
    "n5",
    "etoile1",
    "etoile2",
    "jackpot",
    "gagnants_fr",
    "gagnants_eu",
    ...ranks.slice(1).map((rank) => `r${rank}`),
  ].join(",")
  const rows = [...draws]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((draw) => {
      const totals = totalWinners(draw)
      return [
        draw.date,
        draw.weekday,
        draw.id,
        ...draw.numbers,
        ...draw.stars,
        prizeAtRank(draw, 1) == null ? "" : String(prizeAtRank(draw, 1)),
        totals.fr == null ? "" : String(totals.fr),
        totals.eu == null ? "" : String(totals.eu),
        ...ranks.slice(1).map((rank) => {
          const value = prizeAtRank(draw, rank)
          return value == null ? "" : String(value)
        }),
      ].join(",")
    })
  return `${header}\n${rows.join("\n")}\n`
}

export function mergeDraws(primary: Draw[], fallback: Draw[]) {
  const byDate = new Map<string, Draw>()
  for (const draw of fallback) byDate.set(draw.date, draw)
  for (const draw of primary) byDate.set(draw.date, draw)
  return [...byDate.values()].sort((a, b) => b.date.localeCompare(a.date))
}

export function takeLastDraws(draws: Draw[], n: number) {
  return [...draws]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, Math.max(0, n))
}

function frequencyTable(
  draws: Draw[],
  pool: number,
  pick: (draw: Draw) => number[],
  history?: Draw[]
): FrequencyItem[] {
  const ordered = [...draws].sort((a, b) => a.date.localeCompare(b.date))
  const counts = Array(pool + 1).fill(0)
  for (const draw of ordered) {
    for (const value of pick(draw)) {
      if (value < 1 || value > pool) continue
      counts[value] += 1
    }
  }

  const asOf = ordered[ordered.length - 1]?.date
  const lookback = [...(history ?? draws)]
    .filter((draw) => !asOf || draw.date <= asOf)
    .sort((a, b) => a.date.localeCompare(b.date))
  const lastIndex: Array<number | null> = Array(pool + 1).fill(null)
  const lastDate: Array<string | null> = Array(pool + 1).fill(null)
  for (let i = 0; i < lookback.length; i += 1) {
    for (const value of pick(lookback[i])) {
      if (value < 1 || value > pool) continue
      lastIndex[value] = i
      lastDate[value] = lookback[i].date
    }
  }

  const n = lookback.length
  return Array.from({ length: pool }, (_, i) => {
    const value = i + 1
    const seenAt = lastIndex[value]
    return {
      value,
      count: counts[value] as number,
      lastSeen: lastDate[value],
      delayDraws: seenAt == null ? n : n - 1 - seenAt,
    }
  })
}

export function numberFrequencyTable(draws: Draw[], history?: Draw[]) {
  return frequencyTable(draws, 50, (draw) => draw.numbers, history)
}

export function starFrequencyTable(
  draws: Draw[],
  pool = 12,
  history?: Draw[]
) {
  return frequencyTable(draws, pool, (draw) => draw.stars, history)
}

export function expectedNumberHits(drawCount: number) {
  return drawCount * (5 / 50)
}

export function expectedStarHits(drawCount: number, pool = 12) {
  return pool > 0 ? drawCount * (2 / pool) : 0
}

export function numberCoverage(draws: Draw[]) {
  const seen = new Set<number>()
  for (const draw of draws) {
    for (const n of draw.numbers) seen.add(n)
  }
  return seen.size
}

export function numberFrequencies(draws: Draw[]) {
  return hottest(numberFrequencyTable(draws), 10).map(
    (item) => [item.value, item.count] as [number, number]
  )
}

export function starFrequencies(draws: Draw[]) {
  return hottest(starFrequencyTable(draws), 6).map(
    (item) => [item.value, item.count] as [number, number]
  )
}

export type ParityCounts = {
  even: number
  odd: number
  score: number
}

/** Pair = +1, impair = −1. Score = (#pairs) − (#impairs). */
export function parityCounts(values: number[]): ParityCounts {
  let even = 0
  for (const n of values) {
    if (n % 2 === 0) even += 1
  }
  const odd = values.length - even
  return { even, odd, score: even - odd }
}

export function formatParitySplit(even: number, odd: number) {
  return `${even}p / ${odd}i`
}

export function cumulativeSum(values: number[]): number[] {
  const out = Array<number>(values.length)
  let acc = 0
  for (let i = 0; i < values.length; i += 1) {
    acc += values[i]
    out[i] = acc
  }
  return out
}

/**
 * Écart-type du score pair/impair d’un tirage 5/50 (25 pairs, 25 impairs).
 * Var = 4 × Hypergeom(n=5, K=25, N=50) = 225/49, σ = 15/7.
 */
export const NUMBER_PARITY_SIGMA = 15 / 7

/**
 * Écart-type du score pair/impair de 2 étoiles parmi 6 pairs / 6 impairs.
 * Var = 4 × Hypergeom(n=2, K=6, N=12) = 20/11.
 */
export const STAR_PARITY_SIGMA = Math.sqrt(20 / 11)

/** Demi-largeur d’une bande ±z σ √t (t = rang du tirage dans la fenêtre, dès 1). */
export function parityBand(sigma: number, index: number, z = 1.96): number {
  return z * sigma * Math.sqrt(index + 1)
}

export function signedStreak(
  values: number[]
): { sign: -1 | 0 | 1; length: number } {
  if (values.length === 0) return { sign: 0, length: 0 }
  let i = values.length - 1
  while (i >= 0 && values[i] === 0) i -= 1
  if (i < 0) return { sign: 0, length: 0 }
  const sign = values[i] > 0 ? 1 : -1
  let length = 0
  for (let j = i; j >= 0; j -= 1) {
    const value = values[j]
    if (value === 0 || Math.sign(value) !== sign) break
    length += 1
  }
  return { sign, length }
}

export type DrawSeriesPoint = {
  date: string
  weekday?: string
  id: number
  n1: number
  n2: number
  n3: number
  n4: number
  n5: number
  sumNumbers: number
  evenNumbers: number
  oddNumbers: number
  parityNumbers: number
  spread: number
  consecutive: number
  d0: number
  d1: number
  d2: number
  d3: number
  d4: number
  decadePeak: number
  decadeOccupied: number
  e1: number
  e2: number
  sumStars: number
  evenStars: number
  oddStars: number
  parityStars: number
  starSpread: number
  starConsecutive: number
  /** 0 = gagnant rang 1, 1 = pas de gagnant. `null` si l’archive n’a pas le rang. */
  rank1: number | null
}

export function toDrawSeries(draws: Draw[]): DrawSeriesPoint[] {
  return [...draws]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((draw) => {
      const numbers = [...draw.numbers].sort((a, b) => a - b)
      const stars = [...draw.stars].sort((a, b) => a - b)
      const [n1, n2, n3, n4, n5] = numbers
      const [e1, e2] = stars
      const numbersParity = parityCounts(numbers)
      const starsParity = parityCounts(stars)
      const decades = decadeCounts(numbers)
      return {
        date: draw.date,
        weekday: draw.weekday,
        id: draw.id,
        n1,
        n2,
        n3,
        n4,
        n5,
        sumNumbers: n1 + n2 + n3 + n4 + n5,
        evenNumbers: numbersParity.even,
        oddNumbers: numbersParity.odd,
        parityNumbers: numbersParity.score,
        spread: spreadOf(numbers),
        consecutive: consecutiveCount(numbers),
        d0: decades[0],
        d1: decades[1],
        d2: decades[2],
        d3: decades[3],
        d4: decades[4],
        decadePeak: decadePeak(decades),
        decadeOccupied: decadeOccupied(decades),
        e1,
        e2,
        sumStars: e1 + e2,
        evenStars: starsParity.even,
        oddStars: starsParity.odd,
        parityStars: starsParity.score,
        starSpread: spreadOf(stars),
        starConsecutive: consecutiveCount(stars),
        rank1: rank1WinnerStep(draw),
      }
    })
}

export type ParityChartPoint = {
  date: string
  weekday?: string
  id: number
  evenNumbers: number
  oddNumbers: number
  parityNumbers: number
  evenStars: number
  oddStars: number
  parityStars: number
  walkNumbers: number
  walkStars: number
  bandHiNumbers: number
  bandLoNumbers: number
  bandHiStars: number
  bandLoStars: number
}

export function toParityChart(draws: Draw[]): ParityChartPoint[] {
  const series = toDrawSeries(draws)
  const walkNumbers = cumulativeSum(series.map((point) => point.parityNumbers))
  const walkStars = cumulativeSum(series.map((point) => point.parityStars))
  return series.map((point, i) => {
    const bandN = parityBand(NUMBER_PARITY_SIGMA, i)
    const bandS = parityBand(STAR_PARITY_SIGMA, i)
    return {
      date: point.date,
      weekday: point.weekday,
      id: point.id,
      evenNumbers: point.evenNumbers,
      oddNumbers: point.oddNumbers,
      parityNumbers: point.parityNumbers,
      evenStars: point.evenStars,
      oddStars: point.oddStars,
      parityStars: point.parityStars,
      walkNumbers: walkNumbers[i] ?? 0,
      walkStars: walkStars[i] ?? 0,
      bandHiNumbers: bandN,
      bandLoNumbers: -bandN,
      bandHiStars: bandS,
      bandLoStars: -bandS,
    }
  })
}

export type ParitySeriesStats = {
  lastStep: number
  lastWalk: number
  minWalk: number
  maxWalk: number
  meanStep: number
  evenTotal: number
  oddTotal: number
  expectedEven: number
  aboveZero: number
  aboveZeroShare: number
  plusCount: number
  minusCount: number
  zeroCount: number
  streak: { sign: -1 | 0 | 1; length: number }
}

export function summarizeParitySeries(
  points: ParityChartPoint[],
  kind: "numbers" | "stars"
): ParitySeriesStats | null {
  if (points.length === 0) return null
  const stepKey = kind === "numbers" ? "parityNumbers" : "parityStars"
  const walkKey = kind === "numbers" ? "walkNumbers" : "walkStars"
  const evenKey = kind === "numbers" ? "evenNumbers" : "evenStars"
  const oddKey = kind === "numbers" ? "oddNumbers" : "oddStars"
  const steps = points.map((point) => point[stepKey])
  const walks = points.map((point) => point[walkKey])
  const evenTotal = points.reduce((sum, point) => sum + point[evenKey], 0)
  const oddTotal = points.reduce((sum, point) => sum + point[oddKey], 0)
  const last = points[points.length - 1]
  const aboveZero = walks.filter((value) => value > 0).length
  return {
    lastStep: last[stepKey],
    lastWalk: last[walkKey],
    minWalk: Math.min(...walks),
    maxWalk: Math.max(...walks),
    meanStep: steps.reduce((sum, value) => sum + value, 0) / steps.length,
    evenTotal,
    oddTotal,
    expectedEven: kind === "numbers" ? 2.5 * points.length : points.length,
    aboveZero,
    aboveZeroShare: aboveZero / points.length,
    plusCount: steps.filter((value) => value > 0).length,
    minusCount: steps.filter((value) => value < 0).length,
    zeroCount: steps.filter((value) => value === 0).length,
    streak: signedStreak(steps),
  }
}

export type SeriesSummary = {
  min: number
  max: number
  avg: number
}

export function summarizeValues(values: number[]): SeriesSummary | null {
  if (values.length === 0) return null
  const min = Math.min(...values)
  const max = Math.max(...values)
  const avg = values.reduce((sum, value) => sum + value, 0) / values.length
  return { min, max, avg }
}

/** 5 distincts dans 1–50 : 1+2+3+4+5 … 46+47+48+49+50. Moyenne théorique 127,5 = 50 %. */
export const NUMBER_SUM_RANGE = { min: 15, max: 240 } as const

/** 2 distincts dans 1–12 : 1+2 … 11+12. Moyenne théorique 13 = 50 %. */
export const STAR_SUM_RANGE = { min: 3, max: 23 } as const

export type ValueRange = { min: number; max: number }

export function relativeToRange(value: number, range: ValueRange): number {
  const span = range.max - range.min
  if (span <= 0) return 50
  return ((value - range.min) / span) * 100
}

export function fromRelativeRange(pct: number, range: ValueRange): number {
  const span = range.max - range.min
  if (span <= 0) return range.min
  return range.min + (pct / 100) * span
}

export function rangeFromValues(values: number[]): ValueRange | null {
  if (values.length === 0) return null
  const min = Math.min(...values)
  const max = Math.max(...values)
  if (min === max) return { min: min - 1, max: max + 1 }
  return { min, max }
}

/** Pearson r. `null` si moins de 3 points ou variance nulle. */
export function pearsonCorrelation(xs: number[], ys: number[]): number | null {
  const n = Math.min(xs.length, ys.length)
  if (n < 3) return null
  let sumX = 0
  let sumY = 0
  for (let i = 0; i < n; i += 1) {
    sumX += xs[i]
    sumY += ys[i]
  }
  const meanX = sumX / n
  const meanY = sumY / n
  let num = 0
  let dx = 0
  let dy = 0
  for (let i = 0; i < n; i += 1) {
    const a = xs[i] - meanX
    const b = ys[i] - meanY
    num += a * b
    dx += a * a
    dy += b * b
  }
  if (dx === 0 || dy === 0) return null
  return num / Math.sqrt(dx * dy)
}
