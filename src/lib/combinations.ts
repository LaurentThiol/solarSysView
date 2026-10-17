import {
  RANK_TABLE,
  evenCount,
  rankProbabilities,
  wilson,
} from "@/lib/analysis"
import {
  type Draw,
  type FrequencyItem,
  expectedNumberHits,
  expectedStarHits,
  prizeAtRank,
} from "@/lib/draws"

export type CombinationGrid = {
  numbers: number[]
  stars: number[]
}

export const STRATEGIES = [
  "balanced",
  "overdue",
  "hot",
  "cold",
  "uniform",
] as const

export type CombinationStrategy = (typeof STRATEGIES)[number]

export const STRATEGY_LABELS: Record<CombinationStrategy, string> = {
  balanced: "Équilibré",
  overdue: "Retards longs",
  hot: "Totaux élevés",
  cold: "Totaux faibles",
  uniform: "Aléatoire",
}

const RANK_BY_MATCH = new Map(
  RANK_TABLE.map(([k, s, rank]) => [`${k}:${s}`, rank] as const)
)
const RANK_LABELS = Object.fromEntries(
  RANK_TABLE.map(([, , rank, label]) => [rank, label])
) as Record<number, string>

export function sortedGrid(grid: CombinationGrid): CombinationGrid {
  return {
    numbers: [...grid.numbers].sort((a, b) => a - b),
    stars: [...grid.stars].sort((a, b) => a - b),
  }
}

export function isCompleteGrid(grid: CombinationGrid): boolean {
  const numbers = new Set(grid.numbers)
  const stars = new Set(grid.stars)
  if (numbers.size !== 5 || stars.size !== 2) return false
  for (const value of numbers) {
    if (!Number.isInteger(value) || value < 1 || value > 50) return false
  }
  for (const value of stars) {
    if (!Number.isInteger(value) || value < 1 || value > 12) return false
  }
  return true
}

export const DEFAULT_GRID_LABEL = "Grille"
export const MAX_GRID_LABEL = 80

export function normalizeGridLabel(label: string | null | undefined): string {
  const text = (label ?? "").trim().replace(/\s+/g, " ")
  if (!text) return DEFAULT_GRID_LABEL
  return text.length > MAX_GRID_LABEL ? text.slice(0, MAX_GRID_LABEL) : text
}

export function renameSavedGridIn<T extends { id: number | string; label: string }>(
  grids: T[],
  id: T["id"],
  label: string
): T[] | null {
  if (!grids.some((item) => item.id === id)) return null
  const nextLabel = normalizeGridLabel(label)
  return grids.map((item) => (item.id === id ? { ...item, label: nextLabel } : item))
}

export function gridKey(grid: CombinationGrid): string {
  const sorted = sortedGrid(grid)
  return `${sorted.numbers.join(",")}|${sorted.stars.join(",")}`
}

export const PROPOSALS_KEY = "synchro.combinaisons.proposals"
export const PROPOSALS_EVENT = "synchro-proposals"
export const MAX_PROPOSALS = 20

export function readStoredProposals(): CombinationGrid[] {
  if (typeof window === "undefined") return []
  try {
    const raw = sessionStorage.getItem(PROPOSALS_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as { grids?: CombinationGrid[] } | CombinationGrid[]
    const grids = Array.isArray(parsed) ? parsed : parsed.grids
    if (!Array.isArray(grids)) return []
    return grids.filter(isCompleteGrid).map(sortedGrid).slice(0, MAX_PROPOSALS)
  } catch {
    return []
  }
}

export function writeStoredProposals(grids: CombinationGrid[]) {
  if (typeof window === "undefined") return
  try {
    sessionStorage.setItem(
      PROPOSALS_KEY,
      JSON.stringify({ grids: grids.map(sortedGrid).slice(0, MAX_PROPOSALS) })
    )
    window.dispatchEvent(new Event(PROPOSALS_EVENT))
  } catch {
    /* quota / private mode */
  }
}

export function matchCounts(
  grid: CombinationGrid,
  draw: Pick<Draw, "numbers" | "stars">
) {
  const numbers = new Set(grid.numbers)
  const stars = new Set(grid.stars)
  let matchedNumbers = 0
  let matchedStars = 0
  const winningNumbers: number[] = []
  const winningStars: number[] = []
  for (const value of draw.numbers) {
    if (numbers.has(value)) {
      matchedNumbers += 1
      winningNumbers.push(value)
    }
  }
  for (const value of draw.stars) {
    if (stars.has(value)) {
      matchedStars += 1
      winningStars.push(value)
    }
  }
  return {
    matchedNumbers,
    matchedStars,
    winningNumbers: winningNumbers.sort((a, b) => a - b),
    winningStars: winningStars.sort((a, b) => a - b),
  }
}

export function prizeRank(matchedNumbers: number, matchedStars: number) {
  return RANK_BY_MATCH.get(`${matchedNumbers}:${matchedStars}`) ?? null
}

export function evaluateGrid(
  grid: CombinationGrid,
  draw: Pick<Draw, "numbers" | "stars">
) {
  const matched = matchCounts(grid, draw)
  const rank = prizeRank(matched.matchedNumbers, matched.matchedStars)
  return {
    ...matched,
    rank,
    label: rank == null ? "Pas de gain" : RANK_LABELS[rank],
  }
}

export function officialWinProbability(starPool = 12) {
  const ranks = rankProbabilities(starPool)
  const pWin = ranks
    .filter((row) => row.rank != null)
    .reduce((sum, row) => sum + row.p, 0)
  return { ranks, pWin, pLose: 1 - pWin }
}

export type CheckRow = {
  date: string
  matchedNumbers: number
  matchedStars: number
  rank: number | null
  label: string
  winningNumbers: number[]
  winningStars: number[]
  prize: number | null
}

export function checkGridAgainstDraws(
  grid: CombinationGrid,
  draws: Array<Pick<Draw, "date" | "numbers" | "stars" | "prizes">>
): CheckRow[] {
  return [...draws]
    .sort((a, b) => b.date.localeCompare(a.date))
    .map((draw) => {
      const result = evaluateGrid(grid, draw)
      return {
        date: draw.date,
        ...result,
        prize: prizeAtRank(draw, result.rank),
      }
    })
}

export function empiricalWinRate(
  grid: CombinationGrid,
  draws: Array<Pick<Draw, "date" | "numbers" | "stars" | "prizes">>
) {
  const results = checkGridAgainstDraws(grid, draws)
  const n = results.length
  const wins = results.filter((row) => row.rank != null).length
  const winsTop10 = results.filter(
    (row) => row.rank != null && row.rank <= 10
  ).length
  const byRank: Record<string, number> = {}
  for (const row of results) {
    const key = row.rank == null ? "none" : String(row.rank)
    byRank[key] = (byRank[key] ?? 0) + 1
  }
  const priced = results.filter((row) => row.prize != null)
  const prizeTotal = priced.reduce((sum, row) => sum + (row.prize ?? 0), 0)
  return {
    n,
    wins,
    p: n > 0 ? wins / n : 0,
    wilson: wilson(wins, n),
    winsTop10,
    pTop10: n > 0 ? winsTop10 / n : 0,
    byRank,
    results,
    prizeTotal,
    prizeKnown: priced.length,
  }
}

function mean(values: number[]) {
  if (values.length === 0) return null
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function extent(values: number[]) {
  if (values.length === 0) return { min: null, max: null }
  return { min: Math.min(...values), max: Math.max(...values) }
}

export function percentileRank(values: number[], x: number) {
  if (values.length === 0) return null
  let below = 0
  let equal = 0
  for (const value of values) {
    if (value < x) below += 1
    else if (value === x) equal += 1
  }
  return (below + 0.5 * equal) / values.length
}

/** 1+2+3+4+5 … 46+47+48+49+50 */
export const NUMBER_SUM_MIN = 15
export const NUMBER_SUM_MAX = 240
export const AUTO_SUM_MIN_QUANTILE = 0.25
export const AUTO_SUM_MAX_QUANTILE = 0.75
export const AUTO_SUM_QUANTILE = AUTO_SUM_MAX_QUANTILE
/** 5 × (1+50)/2, arrondi. */
export const THEORETICAL_NUMBER_SUM_MEAN = 128

export const SUM_BOUND_MODES = ["auto", "manual"] as const
export type SumBoundMode = (typeof SUM_BOUND_MODES)[number]
export const SUM_BOUND_MODE_LABELS: Record<SumBoundMode, string> = {
  auto: "Auto",
  manual: "Manuel",
}

export function numberSum(grid: Pick<CombinationGrid, "numbers">) {
  return grid.numbers.reduce((total, value) => total + value, 0)
}

export function drawNumberSums(
  draws: Array<Pick<Draw, "numbers">>
): number[] {
  return draws.map((draw) =>
    draw.numbers.reduce((total, value) => total + value, 0)
  )
}

export function quantile(values: number[], q: number) {
  if (values.length === 0) return null
  const p = Math.min(1, Math.max(0, q))
  const ordered = [...values].sort((a, b) => a - b)
  const index = (ordered.length - 1) * p
  const lo = Math.floor(index)
  const hi = Math.ceil(index)
  if (lo === hi) return ordered[lo]
  return ordered[lo] + (ordered[hi] - ordered[lo]) * (index - lo)
}

export function clampNumberSum(value: number) {
  if (!Number.isFinite(value)) return THEORETICAL_NUMBER_SUM_MEAN
  return Math.min(NUMBER_SUM_MAX, Math.max(NUMBER_SUM_MIN, Math.round(value)))
}

export function windowSumExtent(draws: Array<Pick<Draw, "numbers">>) {
  const sums = drawNumberSums(draws)
  if (sums.length === 0) {
    return { min: null, max: null, mean: null, p25: null, p75: null }
  }
  return {
    min: Math.min(...sums),
    max: Math.max(...sums),
    mean: mean(sums),
    p25: quantile(sums, AUTO_SUM_MIN_QUANTILE),
    p75: quantile(sums, AUTO_SUM_MAX_QUANTILE),
  }
}

function autoSumAtQuantile(
  draws: Array<Pick<Draw, "numbers">>,
  q: number
) {
  const resolved = quantile(drawNumberSums(draws), q)
  if (resolved == null) return THEORETICAL_NUMBER_SUM_MEAN
  return clampNumberSum(resolved)
}

export function autoMinSum(
  draws: Array<Pick<Draw, "numbers">>,
  q = AUTO_SUM_MIN_QUANTILE
) {
  return autoSumAtQuantile(draws, q)
}

export function autoMaxSum(
  draws: Array<Pick<Draw, "numbers">>,
  q = AUTO_SUM_MAX_QUANTILE
) {
  return autoSumAtQuantile(draws, q)
}

function parseManualSum(manual?: string | number | null) {
  const parsed =
    typeof manual === "number" ? manual : Number.parseInt(String(manual ?? ""), 10)
  return Number.isFinite(parsed) ? clampNumberSum(parsed) : null
}

export function resolveMinSum({
  mode,
  manual,
  draws,
}: {
  mode: SumBoundMode
  manual?: string | number | null
  draws: Array<Pick<Draw, "numbers">>
}) {
  if (mode === "manual") {
    const parsed = parseManualSum(manual)
    if (parsed != null) return parsed
  }
  return autoMinSum(draws)
}

export function resolveMaxSum({
  mode,
  manual,
  draws,
}: {
  mode: SumBoundMode
  manual?: string | number | null
  draws: Array<Pick<Draw, "numbers">>
}) {
  if (mode === "manual") {
    const parsed = parseManualSum(manual)
    if (parsed != null) return parsed
  }
  return autoMaxSum(draws)
}

export function orderSumBand(minSum: number, maxSum: number) {
  const min = clampNumberSum(minSum)
  const max = clampNumberSum(maxSum)
  if (min <= max) return { min, max, swapped: false }
  return { min: max, max: min, swapped: true }
}

export function inNumberSumBand(sum: number, minSum: number, maxSum: number) {
  const band = orderSumBand(minSum, maxSum)
  return sum >= band.min && sum <= band.max
}

export function resolveSumBand({
  minMode,
  minManual,
  maxMode,
  maxManual,
  draws,
}: {
  minMode: SumBoundMode
  minManual?: string | number | null
  maxMode: SumBoundMode
  maxManual?: string | number | null
  draws: Array<Pick<Draw, "numbers">>
}) {
  const autoMin = autoMinSum(draws)
  const autoMax = autoMaxSum(draws)
  const rawMin = resolveMinSum({ mode: minMode, manual: minManual, draws })
  const rawMax = resolveMaxSum({ mode: maxMode, manual: maxManual, draws })
  const band = orderSumBand(rawMin, rawMax)
  return { ...band, autoMin, autoMax }
}

function seedFiveNumbers(
  numbers: number[],
  pool: number[]
): { current: number[]; remaining: Set<number> } | null {
  const current: number[] = []
  const used = new Set<number>()
  for (const value of numbers) {
    if (!Number.isInteger(value) || value < 1 || value > 50) continue
    if (used.has(value)) continue
    used.add(value)
    current.push(value)
  }
  const unused = pool.filter((value) => !used.has(value)).sort((a, b) => a - b)
  while (current.length < 5 && unused.length > 0) {
    const next = unused.shift()
    if (next == null) break
    current.push(next)
    used.add(next)
  }
  if (current.length !== 5) return null
  return {
    current,
    remaining: new Set(pool.filter((value) => !used.has(value))),
  }
}

function replaceBall(
  current: number[],
  remaining: Set<number>,
  fromIndex: number,
  replacement: number
) {
  remaining.delete(replacement)
  remaining.add(current[fromIndex])
  current[fromIndex] = replacement
}

/**
 * Ajuste les extrêmes pour entrer dans [minSum, maxSum] en changeant
 * le moins possible le tirage d’origine.
 */
export function fitNumberSumBand(
  numbers: number[],
  minSum: number,
  maxSum: number,
  pool: number[] = Array.from({ length: 50 }, (_, index) => index + 1)
): number[] | null {
  const band = orderSumBand(minSum, maxSum)
  const seeded = seedFiveNumbers(numbers, pool)
  if (seeded == null) return null
  const { current, remaining } = seeded

  for (let step = 0; step < 50; step += 1) {
    const sum = current.reduce((total, value) => total + value, 0)
    if (sum >= band.min && sum <= band.max) {
      return [...current].sort((a, b) => a - b)
    }
    if (sum > band.max) {
      let largestIndex = 0
      for (let i = 1; i < current.length; i += 1) {
        if (current[i] > current[largestIndex]) largestIndex = i
      }
      const largest = current[largestIndex]
      const deficit = sum - band.max
      const smaller: number[] = []
      for (const value of remaining) {
        if (value < largest) smaller.push(value)
      }
      if (smaller.length === 0) return null
      const oneShot = smaller.filter((value) => largest - value >= deficit)
      replaceBall(
        current,
        remaining,
        largestIndex,
        oneShot.length ? Math.max(...oneShot) : Math.min(...smaller)
      )
      continue
    }
    let smallestIndex = 0
    for (let i = 1; i < current.length; i += 1) {
      if (current[i] < current[smallestIndex]) smallestIndex = i
    }
    const smallest = current[smallestIndex]
    const need = band.min - sum
    const larger: number[] = []
    for (const value of remaining) {
      if (value > smallest) larger.push(value)
    }
    if (larger.length === 0) return null
    const oneShot = larger.filter((value) => value - smallest >= need)
    replaceBall(
      current,
      remaining,
      smallestIndex,
      oneShot.length ? Math.min(...oneShot) : Math.max(...larger)
    )
  }
  return null
}

export function fitNumberSum(
  numbers: number[],
  maxSum: number,
  pool: number[] = Array.from({ length: 50 }, (_, index) => index + 1)
): number[] | null {
  return fitNumberSumBand(numbers, NUMBER_SUM_MIN, maxSum, pool)
}

function itemsFor(
  values: number[],
  table: FrequencyItem[]
): FrequencyItem[] {
  const byValue = new Map(table.map((item) => [item.value, item]))
  return values
    .map((value) => byValue.get(value))
    .filter((item): item is FrequencyItem => item != null)
}

export type GridBallRead = {
  n: number
  delay: number
  count: number
}

export type GridProfile = {
  numberReads: GridBallRead[]
  starReads: GridBallRead[]
  numberDelays: number[]
  starDelays: number[]
  numberDelayMean: number | null
  starDelayMean: number | null
  numberDelayExtent: { min: number | null; max: number | null }
  starDelayExtent: { min: number | null; max: number | null }
  numberCountMean: number | null
  starCountMean: number | null
  expectedNumbers: number
  expectedStars: number
  sum: number
  starSum: number
  windowSumMean: number | null
  sumPercentile: number | null
  even: number
  odd: number
  spread: number
  official: ReturnType<typeof officialWinProbability>
  empirical: ReturnType<typeof empiricalWinRate>
}

export function profileGrid(
  grid: CombinationGrid,
  draws: Array<Pick<Draw, "date" | "numbers" | "stars" | "prizes">>,
  numberStats: FrequencyItem[],
  starStats: FrequencyItem[]
): GridProfile {
  const numbers = itemsFor(grid.numbers, numberStats)
  const stars = itemsFor(grid.stars, starStats)
  const numberReads = numbers.map((item) => ({
    n: item.value,
    delay: item.delayDraws,
    count: item.count,
  }))
  const starReads = stars.map((item) => ({
    n: item.value,
    delay: item.delayDraws,
    count: item.count,
  }))
  const numberDelays = numberReads.map((item) => item.delay)
  const starDelays = starReads.map((item) => item.delay)
  const sums = draws.map((draw) =>
    draw.numbers.reduce((total, value) => total + value, 0)
  )
  const sum = grid.numbers.reduce((total, value) => total + value, 0)
  const starSum = grid.stars.reduce((total, value) => total + value, 0)
  const even = evenCount(grid.numbers)
  return {
    numberReads,
    starReads,
    numberDelays,
    starDelays,
    numberDelayMean: mean(numberDelays),
    starDelayMean: mean(starDelays),
    numberDelayExtent: extent(numberDelays),
    starDelayExtent: extent(starDelays),
    numberCountMean: mean(numbers.map((item) => item.count)),
    starCountMean: mean(stars.map((item) => item.count)),
    expectedNumbers: expectedNumberHits(draws.length),
    expectedStars: expectedStarHits(draws.length),
    sum,
    starSum,
    windowSumMean: mean(sums),
    sumPercentile: percentileRank(sums, sum),
    even,
    odd: grid.numbers.length - even,
    spread:
      grid.numbers.length > 0
        ? Math.max(...grid.numbers) - Math.min(...grid.numbers)
        : 0,
    official: officialWinProbability(),
    empirical: empiricalWinRate(grid, draws),
  }
}

export function mulberry32(seed: number) {
  let state = seed >>> 0
  return () => {
    state += 0x6d2b79f5
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function ballWeight(
  item: FrequencyItem,
  expected: number,
  strategy: CombinationStrategy
) {
  if (strategy === "overdue") return Math.max(item.delayDraws, 0.01)
  if (strategy === "hot") return Math.max(item.count, 0.01)
  if (strategy === "cold") return Math.max(expected - item.count, 0.01)
  return 1
}

export function pickWeighted<T>(
  items: T[],
  weights: number[],
  k: number,
  rand: () => number
): T[] {
  const pool = items.map((item, index) => ({
    item,
    weight: Math.max(weights[index] ?? 0, 0),
  }))
  const picked: T[] = []
  const take = Math.min(k, pool.length)
  for (let n = 0; n < take; n += 1) {
    const total = pool.reduce((sum, row) => sum + row.weight, 0)
    let index = 0
    if (total <= 0) {
      index = Math.min(pool.length - 1, Math.floor(rand() * pool.length))
    } else {
      let cursor = rand() * total
      for (let i = 0; i < pool.length; i += 1) {
        cursor -= pool[i].weight
        index = i
        if (cursor <= 0) break
      }
    }
    picked.push(pool[index].item)
    pool.splice(index, 1)
  }
  return picked
}

function takeFromTop(
  list: FrequencyItem[],
  n: number,
  chosen: Set<number>,
  rand: () => number,
  poolSize: number
) {
  const left = n
  if (left <= 0) return
  const candidates = list
    .filter((item) => !chosen.has(item.value))
    .slice(0, Math.max(poolSize, left))
  for (const item of pickWeighted(
    candidates,
    candidates.map(() => 1),
    left,
    rand
  )) {
    chosen.add(item.value)
  }
}

function pickBalanced(
  items: FrequencyItem[],
  k: number,
  expected: number,
  rand: () => number
): number[] {
  const overdue = [...items].sort(
    (a, b) => b.delayDraws - a.delayDraws || a.value - b.value
  )
  const hot = [...items].sort((a, b) => b.count - a.count || a.value - b.value)
  const near = [...items].sort(
    (a, b) =>
      Math.abs(a.count - expected) - Math.abs(b.count - expected) ||
      a.value - b.value
  )
  const chosen = new Set<number>()
  const overdueN = k >= 5 ? 2 : 1
  const hotN = k >= 2 ? 1 : 0
  takeFromTop(overdue, overdueN, chosen, rand, Math.min(items.length, 12))
  takeFromTop(hot, hotN, chosen, rand, Math.min(items.length, 12))
  takeFromTop(near, k - chosen.size, chosen, rand, Math.min(items.length, 20))
  takeFromTop(items, k - chosen.size, chosen, rand, items.length)
  return [...chosen].slice(0, k)
}

export function proposeGrids({
  numberStats,
  starStats,
  draws,
  strategy,
  count,
  seed = 1,
  minSum = null,
  maxSum = null,
}: {
  numberStats: FrequencyItem[]
  starStats: FrequencyItem[]
  draws: Array<Pick<Draw, "date" | "numbers" | "stars" | "prizes">>
  strategy: CombinationStrategy
  count: number
  seed?: number
  minSum?: number | null
  maxSum?: number | null
}): CombinationGrid[] {
  const rand = mulberry32(seed)
  const expectedNumbers = expectedNumberHits(draws.length)
  const expectedStars = expectedStarHits(draws.length)
  const seen = new Set<string>()
  const grids: CombinationGrid[] = []
  const target = Math.max(0, Math.min(MAX_PROPOSALS, Math.floor(count)))
  const constrained = minSum != null || maxSum != null
  const band = orderSumBand(
    minSum == null ? NUMBER_SUM_MIN : minSum,
    maxSum == null ? NUMBER_SUM_MAX : maxSum
  )
  const rejectAttempts = Math.max(target * 40, 40)
  const fitAttempts = constrained ? Math.max(target * 40, 40) : 0
  const maxAttempts = rejectAttempts + fitAttempts

  for (let attempt = 0; attempt < maxAttempts && grids.length < target; attempt += 1) {
    let numbers =
      strategy === "balanced"
        ? pickBalanced(numberStats, 5, expectedNumbers, rand)
        : pickWeighted(
            numberStats,
            numberStats.map((item) => ballWeight(item, expectedNumbers, strategy)),
            5,
            rand
          ).map((item) => item.value)
    if (constrained && !inNumberSumBand(numberSum({ numbers }), band.min, band.max)) {
      if (attempt < rejectAttempts) continue
      const fitted = fitNumberSumBand(numbers, band.min, band.max)
      if (fitted == null) continue
      numbers = fitted
    }
    const stars =
      strategy === "balanced"
        ? pickBalanced(starStats, 2, expectedStars, rand)
        : pickWeighted(
            starStats,
            starStats.map((item) => ballWeight(item, expectedStars, strategy)),
            2,
            rand
          ).map((item) => item.value)
    const grid = sortedGrid({ numbers, stars })
    if (!isCompleteGrid(grid)) continue
    if (constrained && !inNumberSumBand(numberSum(grid), band.min, band.max)) continue
    const key = gridKey(grid)
    if (seen.has(key)) continue
    seen.add(key)
    grids.push(grid)
  }

  return grids
    .map((grid) => ({ grid, p: empiricalWinRate(grid, draws).p }))
    .sort(
      (a, b) => b.p - a.p || gridKey(a.grid).localeCompare(gridKey(b.grid))
    )
    .map((row) => row.grid)
}
