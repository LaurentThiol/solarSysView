import { hottest, type FrequencyItem } from "./frequency-rank.ts"
import { finiteNumbers, numbersSum } from "./gains.ts"
import { spreadOf } from "./grid-shape.ts"
import {
  filterDrawsByWeekday,
  normalizeDrawWeekday,
  type DrawWeekday,
} from "./weekday-scope.ts"

export type SynthesisDraw = {
  date: string
  weekday?: string
  numbers: number[]
  stars: number[]
  prizes?: Array<{ rank?: number; prize?: number | null }>
  winners_total_eu?: number | null
}

export type WeekdaySynthesisSide = {
  id: DrawWeekday | "combined"
  label: string
  count: number
  fromDate: string | null
  toDate: string | null
  lastDate: string | null
  meanSum: number | null
  meanSpread: number | null
  meanJackpot: number | null
  meanWinnersEu: number | null
  topNumbers: FrequencyItem[]
  topStars: FrequencyItem[]
}

export type WeekdaySynthesis = {
  mardi: WeekdaySynthesisSide
  vendredi: WeekdaySynthesisSide
  combined: WeekdaySynthesisSide
}

function meanOf(values: Array<number | null | undefined>): number | null {
  const picked = finiteNumbers(values)
  if (!picked.length) return null
  return picked.reduce((sum, value) => sum + value, 0) / picked.length
}

function jackpotOf(draw: SynthesisDraw): number | null {
  const prize = draw.prizes?.find((tier) => tier.rank === 1)?.prize
  if (prize == null || !Number.isFinite(prize)) return null
  return prize
}

function frequencyTable(
  draws: SynthesisDraw[],
  pool: number,
  pick: (draw: SynthesisDraw) => number[]
): FrequencyItem[] {
  const counts = Array.from({ length: pool + 1 }, () => 0)
  const lastDate: Array<string | null> = Array.from({ length: pool + 1 }, () => null)
  const lastIndex: Array<number | null> = Array.from({ length: pool + 1 }, () => null)
  draws.forEach((draw, index) => {
    for (const value of pick(draw)) {
      if (value < 1 || value > pool) continue
      counts[value] += 1
      lastDate[value] = draw.date
      lastIndex[value] = index
    }
  })
  const n = draws.length
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

function packSide(
  draws: SynthesisDraw[],
  id: WeekdaySynthesisSide["id"],
  label: string
): WeekdaySynthesisSide {
  const ordered = [...draws].sort((a, b) => a.date.localeCompare(b.date))
  const last = ordered.at(-1) ?? null
  return {
    id,
    label,
    count: ordered.length,
    fromDate: ordered[0]?.date ?? null,
    toDate: last?.date ?? null,
    lastDate: last?.date ?? null,
    meanSum: meanOf(ordered.map((draw) => numbersSum(draw.numbers))),
    meanSpread: meanOf(ordered.map((draw) => spreadOf(draw.numbers))),
    meanJackpot: meanOf(ordered.map((draw) => jackpotOf(draw))),
    meanWinnersEu: meanOf(ordered.map((draw) => draw.winners_total_eu)),
    topNumbers: hottest(frequencyTable(ordered, 50, (draw) => draw.numbers), 5),
    topStars: hottest(frequencyTable(ordered, 12, (draw) => draw.stars), 3),
  }
}

export function synthesizeWeekdays(draws: SynthesisDraw[]): WeekdaySynthesis {
  const mardi = filterDrawsByWeekday(draws, "mardi")
  const vendredi = filterDrawsByWeekday(draws, "vendredi")
  return {
    mardi: packSide(mardi, "mardi", "Mardi"),
    vendredi: packSide(vendredi, "vendredi", "Vendredi"),
    combined: packSide(draws, "combined", "Combiné"),
  }
}

export function weekdayCounts(draws: Array<{ weekday?: string }>) {
  let mardi = 0
  let vendredi = 0
  for (const draw of draws) {
    const day = normalizeDrawWeekday(draw.weekday)
    if (day === "mardi") mardi += 1
    else if (day === "vendredi") vendredi += 1
  }
  return { mardi, vendredi, other: draws.length - mardi - vendredi }
}
