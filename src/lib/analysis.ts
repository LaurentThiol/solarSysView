export type AnalysisDraw = {
  date: string
  weekday?: string
  numbers: number[]
  stars: number[]
  star_pool?: number
}

export const NUMBER_VARIABLE_NAMES = [
  "sum",
  "spread",
  "parity",
  "high_low",
  "consecutive",
  "centroid",
  "n1",
  "n2",
  "n3",
  "n4",
  "n5",
  "g1",
  "g2",
  "g3",
  "g4",
  "delay",
  "hit",
] as const

export const STAR_VARIABLE_NAMES = [
  "star_sum",
  "e1",
  "e2",
  "star_delay",
  "star_hit",
] as const

export const VARIABLE_NAMES = [
  ...NUMBER_VARIABLE_NAMES,
  ...STAR_VARIABLE_NAMES,
] as const

export type VariableName = (typeof VARIABLE_NAMES)[number]

export const VARIABLE_LABELS: Record<VariableName, string> = {
  sum: "Somme des numéros",
  spread: "Étendue (max − min)",
  parity: "Pairs / impairs",
  high_low: "Numéros ≥ 26",
  consecutive: "Paires consécutives",
  centroid: "Centre de masse",
  n1: "Plus petit numéro",
  n2: "2ᵉ numéro trié",
  n3: "3ᵉ numéro trié",
  n4: "4ᵉ numéro trié",
  n5: "Plus grand numéro",
  g1: "Écart n2 − n1",
  g2: "Écart n3 − n2",
  g3: "Écart n4 − n3",
  g4: "Écart n5 − n4",
  delay: "Retard d’une boule",
  hit: "Présence d’une boule",
  star_sum: "Somme des étoiles",
  e1: "Plus petite étoile",
  e2: "Plus grande étoile",
  star_delay: "Retard d’une étoile",
  star_hit: "Présence d’une étoile",
}

export function variableNeedsBall(name: VariableName) {
  return name === "delay" || name === "hit"
}

export function variableNeedsStar(name: VariableName) {
  return name === "star_delay" || name === "star_hit"
}

export function seriesIndex(name: VariableName, ball: number, star: number) {
  if (variableNeedsStar(name)) return star
  return ball
}

function isoWeekKey(iso: string) {
  const d = new Date(`${iso}T12:00:00Z`)
  const tmp = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
  const dayNum = tmp.getUTCDay() || 7
  tmp.setUTCDate(tmp.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1))
  const weekNo = Math.ceil(((tmp.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
  return `${tmp.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`
}

function ordered(draws: AnalysisDraw[]) {
  return [...draws].sort((a, b) => a.date.localeCompare(b.date))
}

function consecutivePairs(numbers: number[]) {
  const set = new Set(numbers)
  let count = 0
  for (const n of set) if (set.has(n + 1)) count += 1
  return count
}

/**
 * Le k-ième plus petit d'un tirage — une statistique d'ordre, pas l'ordre de sortie.
 *
 * La FDJ publie un ensemble : l'ordre dans lequel les boules sont tombées n'est
 * pas conservé. `n3` est donc le troisième plus petit numéro du tirage, jamais
 * la troisième boule sortie. Même définition que l'onglet Évolution, qui trie
 * avant de tracer — les deux onglets doivent parler de la même chose.
 */
function orderStatistic(pool: number[], rank: number): number {
  if (!pool.length) return 0
  const ranked = [...pool].sort((a, b) => a - b)
  // Un tirage amputé rendrait `undefined`, donc NaN, et un seul trou suffit à
  // fausser toutes les fenêtres de balayage qui le contiennent.
  return ranked[Math.min(Math.max(rank, 1), ranked.length) - 1]
}

/**
 * L'écart entre deux rangs voisins : comment le tirage occupe la grille.
 *
 * Plus proche d'une variable libre que les rangs eux-mêmes. `n1` à `n5` sont
 * ordonnés par construction — `n1` bas pousse les autres vers le haut — donc
 * fortement corrélés, et une figure lue sur l'un se retrouve en partie sur les
 * autres sans rien ajouter. Les quatre écarts, eux, décrivent l'étalement : deux
 * numéros collés puis un trou de vingt ne se lisent pas comme cinq numéros
 * régulièrement espacés, et les rangs ne le disent qu'indirectement.
 *
 * Borné comme le reste : au moins 1, puisque les numéros sont distincts.
 */
function rankGap(pool: number[], rank: number): number {
  return orderStatistic(pool, rank + 1) - orderStatistic(pool, rank)
}

function scalar(draw: AnalysisDraw, name: VariableName): number {
  const nums = draw.numbers
  switch (name) {
    case "sum":
      return nums.reduce((a, b) => a + b, 0)
    case "spread":
      return Math.max(...nums) - Math.min(...nums)
    case "parity":
      return nums.filter((n) => n % 2 === 0).length
    case "high_low":
      return nums.filter((n) => n >= 26).length
    case "consecutive":
      return consecutivePairs(nums)
    case "centroid":
      return nums.reduce((a, b) => a + b, 0) / 5
    case "star_sum":
      return draw.stars.reduce((a, b) => a + b, 0)
    case "n1":
    case "n2":
    case "n3":
    case "n4":
    case "n5":
      return orderStatistic(nums, Number(name.slice(1)))
    case "g1":
    case "g2":
    case "g3":
    case "g4":
      return rankGap(nums, Number(name.slice(1)))
    case "e1":
    case "e2":
      return orderStatistic(draw.stars, Number(name.slice(1)))
    default:
      return 0
  }
}

function poolOf(draw: AnalysisDraw, stars: boolean) {
  return stars ? draw.stars : draw.numbers
}

function hitPoints(rows: AnalysisDraw[], n: number, stars: boolean): SeriesPoint[] {
  return rows.map((draw) => {
    const hit = poolOf(draw, stars).includes(n)
    return { date: draw.date, value: hit ? 1 : 0, hit }
  })
}

function delayPoints(rows: AnalysisDraw[], n: number, stars: boolean): SeriesPoint[] {
  let lastIndex: number | null = null
  return rows.map((draw, i) => {
    const hit = poolOf(draw, stars).includes(n)
    let delay = i + 1
    if (hit) {
      delay = 0
      lastIndex = i
    } else if (lastIndex != null) {
      delay = i - lastIndex
    }
    return { date: draw.date, value: delay, hit }
  })
}

export type SeriesPoint = {
  date: string
  value: number
  hit?: boolean
}

export function series(
  draws: AnalysisDraw[],
  name: VariableName,
  n?: number
): { name: VariableName; n?: number; drawCount: number; points: SeriesPoint[]; values: number[] } {
  const rows = ordered(draws)
  let points: SeriesPoint[] = []
  if (name === "hit" || name === "star_hit") {
    const stars = name === "star_hit"
    points = hitPoints(rows, n ?? (stars ? 1 : 7), stars)
  } else if (name === "delay" || name === "star_delay") {
    const stars = name === "star_delay"
    points = delayPoints(rows, n ?? (stars ? 1 : 7), stars)
  } else {
    points = rows.map((draw) => ({ date: draw.date, value: scalar(draw, name) }))
  }
  return {
    name,
    n,
    drawCount: rows.length,
    points,
    values: points.map((p) => p.value),
  }
}

function mean(values: number[]) {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0
}

function stdev(values: number[]) {
  if (values.length < 2) return 0
  const m = mean(values)
  return Math.sqrt(
    values.reduce((acc, v) => acc + (v - m) ** 2, 0) / (values.length - 1)
  )
}

export function rollingStats(
  draws: AnalysisDraw[],
  name: VariableName,
  window: number,
  n?: number
) {
  const payload = series(draws, name, n)
  const chunk = payload.values.slice(-Math.max(1, window))
  const last = chunk.at(-1) ?? null
  const mu = mean(chunk)
  const sigma = stdev(chunk)
  const z = last != null && sigma > 0 ? (last - mu) / sigma : null
  let ups = 0
  let downs = 0
  for (let i = 1; i < chunk.length; i += 1) {
    if (chunk[i] > chunk[i - 1]) ups += 1
    else if (chunk[i] < chunk[i - 1]) downs += 1
  }
  const rsi = ups + downs === 0 ? 50 : (100 * ups) / (ups + downs)
  const seen = new Set<number>()
  for (const draw of ordered(draws).slice(-Math.max(1, window))) {
    for (const v of draw.numbers) seen.add(v)
  }
  return {
    window,
    sampleSize: chunk.length,
    mean: mu,
    std: sigma,
    min: chunk.length ? Math.min(...chunk) : null,
    max: chunk.length ? Math.max(...chunk) : null,
    last,
    zscore: z,
    rsiLike: rsi,
    coverage: seen.size,
  }
}

export type Candle = {
  key: string
  from: string
  to: string
  count: number
  o: number
  h: number
  l: number
  c: number
}

export function ohlcBlocks(
  draws: AnalysisDraw[],
  name: VariableName,
  block: "month" | "week" | "window",
  window = 10,
  n?: number
): Candle[] {
  const points = series(draws, name, n).points
  const groups: { key: string; chunk: SeriesPoint[] }[] = []
  if (block === "window") {
    const size = Math.max(1, window)
    for (let i = 0; i < points.length; i += size) {
      const chunk = points.slice(i, i + size)
      groups.push({ key: chunk[0].date, chunk })
    }
  } else {
    const buckets = new Map<string, SeriesPoint[]>()
    for (const point of points) {
      const key =
        block === "month" ? point.date.slice(0, 7) : isoWeekKey(point.date)
      const list = buckets.get(key) ?? []
      list.push(point)
      buckets.set(key, list)
    }
    for (const [key, chunk] of buckets) groups.push({ key, chunk })
  }
  return groups.map(({ key, chunk }) => {
    const values = chunk.map((p) => p.value)
    return {
      key,
      from: chunk[0].date,
      to: chunk[chunk.length - 1].date,
      count: chunk.length,
      o: values[0],
      h: Math.max(...values),
      l: Math.min(...values),
      c: values[values.length - 1],
    }
  })
}

export function heikinAshi(candles: Candle[]): Candle[] {
  const out: Candle[] = []
  let prevO: number | null = null
  let prevC: number | null = null
  for (const candle of candles) {
    const haC = (candle.o + candle.h + candle.l + candle.c) / 4
    const haO: number =
      prevO == null || prevC == null ? (candle.o + candle.c) / 2 : (prevO + prevC) / 2
    out.push({
      ...candle,
      o: haO,
      h: Math.max(candle.h, haO, haC),
      l: Math.min(candle.l, haO, haC),
      c: haC,
    })
    prevO = haO
    prevC = haC
  }
  return out
}

function lastNumber(values: Array<number | null>): number | null {
  for (let i = values.length - 1; i >= 0; i -= 1) {
    const value = values[i]
    if (value != null) return value
  }
  return null
}

export function sma(values: number[], period: number): Array<number | null> {
  const p = Math.max(1, Math.floor(period))
  const out: Array<number | null> = Array(values.length).fill(null)
  if (p > values.length) return out
  let running = 0
  for (let i = 0; i < values.length; i += 1) {
    running += values[i]
    if (i >= p) running -= values[i - p]
    if (i >= p - 1) out[i] = running / p
  }
  return out
}

export function ema(values: number[], period: number): Array<number | null> {
  const p = Math.max(1, Math.floor(period))
  const out: Array<number | null> = Array(values.length).fill(null)
  if (p > values.length) return out
  let prev = values.slice(0, p).reduce((a, b) => a + b, 0) / p
  out[p - 1] = prev
  const alpha = 2 / (p + 1)
  for (let i = p; i < values.length; i += 1) {
    prev = alpha * values[i] + (1 - alpha) * prev
    out[i] = prev
  }
  return out
}

export function rsi(values: number[], period = 14): Array<number | null> {
  const p = Math.max(1, Math.floor(period))
  const out: Array<number | null> = Array(values.length).fill(null)
  if (values.length <= p) return out

  function toRsi(avgGain: number, avgLoss: number) {
    if (avgLoss === 0) return avgGain > 0 ? 100 : 50
    if (avgGain === 0) return 0
    const rs = avgGain / avgLoss
    return 100 - 100 / (1 + rs)
  }

  let avgGain = 0
  let avgLoss = 0
  for (let i = 1; i <= p; i += 1) {
    const delta = values[i] - values[i - 1]
    avgGain += Math.max(delta, 0)
    avgLoss += Math.max(-delta, 0)
  }
  avgGain /= p
  avgLoss /= p
  out[p] = toRsi(avgGain, avgLoss)
  for (let i = p + 1; i < values.length; i += 1) {
    const delta = values[i] - values[i - 1]
    avgGain = (avgGain * (p - 1) + Math.max(delta, 0)) / p
    avgLoss = (avgLoss * (p - 1) + Math.max(-delta, 0)) / p
    out[i] = toRsi(avgGain, avgLoss)
  }
  return out
}

export function macd(
  values: number[],
  fast = 12,
  slow = 26,
  signal = 9
): {
  line: Array<number | null>
  signal: Array<number | null>
  histogram: Array<number | null>
} {
  const fastLine = ema(values, fast)
  const slowLine = ema(values, slow)
  const line = fastLine.map((a, i) =>
    a == null || slowLine[i] == null ? null : a - (slowLine[i] as number)
  )
  const compact = line.filter((v): v is number => v != null)
  const signalCompact = ema(compact, signal)
  const signalLine: Array<number | null> = Array(line.length).fill(null)
  const histogram: Array<number | null> = Array(line.length).fill(null)
  let compactI = 0
  for (let i = 0; i < line.length; i += 1) {
    const value = line[i]
    if (value == null) continue
    const sig = signalCompact[compactI]
    compactI += 1
    if (sig == null) continue
    signalLine[i] = sig
    histogram[i] = value - sig
  }
  return { line, signal: signalLine, histogram }
}

function sampleStd(chunk: number[]) {
  if (chunk.length < 2) return 0
  const m = mean(chunk)
  return Math.sqrt(chunk.reduce((acc, v) => acc + (v - m) ** 2, 0) / (chunk.length - 1))
}

export function bollinger(
  values: number[],
  period = 20,
  k = 2
): {
  middle: Array<number | null>
  upper: Array<number | null>
  lower: Array<number | null>
} {
  const p = Math.max(1, Math.floor(period))
  const middle = sma(values, p)
  const upper: Array<number | null> = Array(values.length).fill(null)
  const lower: Array<number | null> = Array(values.length).fill(null)
  for (let i = 0; i < values.length; i += 1) {
    const mid = middle[i]
    if (mid == null) continue
    const sigma = sampleStd(values.slice(i - p + 1, i + 1))
    upper[i] = mid + k * sigma
    lower[i] = mid - k * sigma
  }
  return { middle, upper, lower }
}

export function atr(candles: Candle[], period = 14): Array<number | null> {
  const p = Math.max(1, Math.floor(period))
  const out: Array<number | null> = Array(candles.length).fill(null)
  if (p > candles.length) return out
  const tr: number[] = []
  let prevC: number | null = null
  for (const candle of candles) {
    let range = candle.h - candle.l
    if (prevC != null) {
      range = Math.max(range, Math.abs(candle.h - prevC), Math.abs(candle.l - prevC))
    }
    tr.push(range)
    prevC = candle.c
  }
  let prev = tr.slice(0, p).reduce((a, b) => a + b, 0) / p
  out[p - 1] = prev
  for (let i = p; i < tr.length; i += 1) {
    prev = (prev * (p - 1) + tr[i]) / p
    out[i] = prev
  }
  return out
}

export function technicalIndicators(
  values: number[],
  candles: Candle[] = [],
  periods: { window?: number; rsi?: number; atr?: number } = {}
) {
  const window = Math.max(2, Math.floor(periods.window ?? 20))
  const rsiPeriod = periods.rsi ?? 14
  const atrPeriod = Math.max(1, Math.min(periods.atr ?? 14, candles.length || 14))
  const smaLine = sma(values, window)
  const emaLine = ema(values, window)
  const rsiLine = rsi(values, rsiPeriod)
  const macdPack = macd(values)
  const bands = bollinger(values, window)
  const atrLine = atr(candles, atrPeriod)
  return {
    periods: {
      sma: window,
      ema: window,
      rsi: rsiPeriod,
      bollinger: window,
      atr: atrPeriod,
      macdFast: 12,
      macdSlow: 26,
      macdSignal: 9,
    },
    sma: smaLine,
    ema: emaLine,
    rsi: rsiLine,
    macd: macdPack,
    bollinger: bands,
    atr: atrLine,
    last: {
      sma: lastNumber(smaLine),
      ema: lastNumber(emaLine),
      rsi: lastNumber(rsiLine),
      macd: lastNumber(macdPack.line),
      macdSignal: lastNumber(macdPack.signal),
      macdHistogram: lastNumber(macdPack.histogram),
      bbMiddle: lastNumber(bands.middle),
      bbUpper: lastNumber(bands.upper),
      bbLower: lastNumber(bands.lower),
      atr: lastNumber(atrLine),
    },
  }
}

export function comb(n: number, k: number) {
  if (k < 0 || k > n) return 0
  const kk = Math.min(k, n - k)
  let r = 1
  for (let i = 1; i <= kk; i += 1) r = (r * (n - kk + i)) / i
  return Math.round(r)
}

export function hypergeometricMatch(k: number, drawn: number, pool: number, picked: number) {
  const miss = pool - picked
  const needMiss = drawn - k
  if (k < 0 || k > picked || needMiss < 0 || needMiss > miss) return 0
  return (comb(picked, k) * comb(miss, needMiss)) / comb(pool, drawn)
}

export const RANK_TABLE: [number, number, number, string][] = [
  [5, 2, 1, "5 numéros + 2 étoiles"],
  [5, 1, 2, "5 numéros + 1 étoile"],
  [5, 0, 3, "5 numéros"],
  [4, 2, 4, "4 numéros + 2 étoiles"],
  [4, 1, 5, "4 numéros + 1 étoile"],
  [3, 2, 6, "3 numéros + 2 étoiles"],
  [4, 0, 7, "4 numéros"],
  [2, 2, 8, "2 numéros + 2 étoiles"],
  [3, 1, 9, "3 numéros + 1 étoile"],
  [3, 0, 10, "3 numéros"],
  [1, 2, 11, "1 numéro + 2 étoiles"],
  [2, 1, 12, "2 numéros + 1 étoile"],
  [2, 0, 13, "2 numéros"],
]

export function rankProbabilities(starPool = 12) {
  const rows = RANK_TABLE.map(([k, s, rank, label]) => {
    const p =
      hypergeometricMatch(k, 5, 50, 5) * hypergeometricMatch(s, 2, starPool, 2)
    return { rank, k, s, label, p, oneIn: p && p < 0.5 ? Math.round(1 / p) : null }
  })
  const pWin = rows.reduce((a, r) => a + r.p, 0)
  return [
    ...rows,
    { rank: null as number | null, k: null, s: null, label: "Pas de gain", p: 1 - pWin, oneIn: null },
  ]
}

export function wilson(successes: number, n: number, z = 1.96) {
  if (n <= 0) return { p: 0, lo: 0, hi: 1 }
  const p = successes / n
  const z2 = z * z
  const denom = 1 + z2 / n
  const center = (p + z2 / (2 * n)) / denom
  const margin = (z * Math.sqrt((p * (1 - p) + z2 / (4 * n)) / n)) / denom
  return { p, lo: Math.max(0, center - margin), hi: Math.min(1, center + margin) }
}

function daysBetween(from: string, to: string) {
  const a = Date.parse(`${from.slice(0, 10)}T12:00:00Z`)
  const b = Date.parse(`${to.slice(0, 10)}T12:00:00Z`)
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null
  return Math.round((b - a) / 86_400_000)
}

export function evenCount(numbers: number[]) {
  return numbers.filter((n) => n % 2 === 0).length
}

export type ParitySplit = {
  even: number
  odd: number
  ways: number
  p: number
  label: string
}

export function parityLaw(): ParitySplit[] {
  const evenPool = 25
  const oddPool = 25
  const total = comb(50, 5)
  return Array.from({ length: 6 }, (_, k) => {
    const ways = comb(evenPool, k) * comb(oddPool, 5 - k)
    return {
      even: k,
      odd: 5 - k,
      ways,
      p: ways / total,
      label: `${k}p / ${5 - k}i`,
    }
  })
}

export type BallRow = {
  value: number
  even: boolean
  count: number
  expected: number
  rate: number
  lastSeen: string | null
  delayDraws: number
  delayDays: number | null
  p: number
  lo: number
  hi: number
}

export function ballBoard(draws: AnalysisDraw[]): {
  drawCount: number
  expected: number
  p0: number
  balls: BallRow[]
} {
  const rows = ordered(draws)
  const n = rows.length
  const counts = Array(51).fill(0)
  const lastIndex: Array<number | null> = Array(51).fill(null)
  const lastDate: Array<string | null> = Array(51).fill(null)
  for (let i = 0; i < rows.length; i += 1) {
    for (const value of rows[i].numbers) {
      counts[value] += 1
      lastIndex[value] = i
      lastDate[value] = rows[i].date
    }
  }
  const expected = n * (5 / 50)
  const lastDrawDate = rows.at(-1)?.date ?? null
  const balls: BallRow[] = Array.from({ length: 50 }, (_, i) => {
    const value = i + 1
    const hits = counts[value]
    const interval = wilson(hits, n)
    const seenAt = lastIndex[value]
    const lastSeen = lastDate[value]
    return {
      value,
      even: value % 2 === 0,
      count: hits,
      expected,
      rate: n ? hits / n : 0,
      lastSeen,
      delayDraws: seenAt == null ? n : n - 1 - seenAt,
      delayDays:
        lastSeen && lastDrawDate ? daysBetween(lastSeen, lastDrawDate) : null,
      ...interval,
    }
  })
  return { drawCount: n, expected, p0: 0.1, balls }
}

export type ParityPoint = { date: string; even: number; odd: number }

export type ParitySplitRow = ParitySplit & {
  count: number
  expected: number
}

export function parityReport(draws: AnalysisDraw[]): {
  drawCount: number
  evenBalls: number
  oddBalls: number
  expectedEvenBalls: number
  meanEven: number
  chiSquare: number
  splits: ParitySplitRow[]
  points: ParityPoint[]
} {
  const rows = ordered(draws)
  const law = parityLaw()
  const observed = Array(6).fill(0)
  const points: ParityPoint[] = []
  let evenBalls = 0
  for (const draw of rows) {
    const even = evenCount(draw.numbers)
    observed[even] += 1
    evenBalls += even
    points.push({ date: draw.date, even, odd: 5 - even })
  }
  const n = rows.length
  const splits: ParitySplitRow[] = law.map((row, k) => ({
    ...row,
    count: observed[k],
    expected: n * row.p,
  }))
  let chiSquare = 0
  for (const row of splits) {
    if (row.expected > 0) {
      chiSquare += (row.count - row.expected) ** 2 / row.expected
    }
  }
  return {
    drawCount: n,
    evenBalls,
    oddBalls: 5 * n - evenBalls,
    expectedEvenBalls: 2.5 * n,
    meanEven: n ? evenBalls / n : 0,
    chiSquare,
    splits,
    points,
  }
}

export function chiSquareUniform(draws: AnalysisDraw[]) {
  const n = draws.length
  const counts = Array(51).fill(0)
  for (const draw of draws) for (const v of draw.numbers) counts[v] += 1
  const expected = n * (5 / 50)
  let stat = 0
  for (let i = 1; i <= 50; i += 1) stat += (counts[i] - expected) ** 2 / expected
  return { stat, expected, counts }
}

export function bayesBalls(draws: AnalysisDraw[]) {
  const n = draws.length
  const counts = Array(51).fill(0)
  for (const draw of draws) for (const v of draw.numbers) counts[v] += 1
  return Array.from({ length: 50 }, (_, i) => {
    const value = i + 1
    const hits = counts[value]
    const a = 1 + hits
    const b = 1 + (n - hits)
    const meanP = a / (a + b)
    const interval = wilson(hits, n)
    let delay = 0
    for (let d = draws.length - 1; d >= 0; d -= 1) {
      if (draws[d].numbers.includes(value)) break
      delay += 1
    }
    return {
      value,
      count: hits,
      predictive: meanP,
      ...interval,
      delay,
      pDelayGe: (0.9) ** delay,
    }
  })
}

export function pairLift(draws: AnalysisDraw[], limit = 15) {
  const n = draws.length
  const single = Array(51).fill(0)
  const pair = new Map<string, { a: number; b: number; count: number }>()
  for (const draw of draws) {
    const nums = [...new Set(draw.numbers)].sort((a, b) => a - b)
    for (const a of nums) single[a] += 1
    for (let i = 0; i < nums.length; i += 1) {
      for (let j = i + 1; j < nums.length; j += 1) {
        const key = `${nums[i]}-${nums[j]}`
        const cur = pair.get(key) ?? { a: nums[i], b: nums[j], count: 0 }
        cur.count += 1
        pair.set(key, cur)
      }
    }
  }
  return [...pair.values()]
    .map((row) => {
      const pab = row.count / n
      const pa = single[row.a] / n
      const pb = single[row.b] / n
      return { ...row, lift: pa && pb ? pab / (pa * pb) : 0 }
    })
    .sort((a, b) => b.lift - a.lift || b.count - a.count)
    .slice(0, limit)
}

export function hotBacktest(draws: AnalysisDraw[], window: number) {
  const rows = ordered(draws)
  const hits: number[] = []
  for (let i = window; i < rows.length; i += 1) {
    const freq = new Map<number, number>()
    for (const draw of rows.slice(i - window, i)) {
      for (const v of draw.numbers) freq.set(v, (freq.get(v) ?? 0) + 1)
    }
    const hot = [...freq.entries()]
      .sort((a, b) => b[1] - a[1] || a[0] - b[0])
      .slice(0, 5)
      .map(([v]) => v)
    const actual = new Set(rows[i].numbers)
    hits.push(hot.filter((v) => actual.has(v)).length)
  }
  const meanHits = hits.length ? mean(hits) : 0
  return { n: hits.length, mean: meanHits, expected: 0.5 }
}

export function histogram(values: number[], binWidth = 5) {
  const map = new Map<number, number>()
  for (const value of values) {
    const bin = Math.floor(value / binWidth) * binWidth
    map.set(bin, (map.get(bin) ?? 0) + 1)
  }
  return [...map.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([bin, count]) => ({ bin, count }))
}
