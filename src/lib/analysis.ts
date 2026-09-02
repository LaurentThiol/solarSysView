export type AnalysisDraw = {
  date: string
  weekday?: string
  numbers: number[]
  stars: number[]
  star_pool?: number
}

export const VARIABLE_NAMES = [
  "sum",
  "spread",
  "parity",
  "high_low",
  "consecutive",
  "star_sum",
  "centroid",
  "delay",
  "hit",
] as const

export type VariableName = (typeof VARIABLE_NAMES)[number]

export const VARIABLE_LABELS: Record<VariableName, string> = {
  sum: "Somme des numéros",
  spread: "Étendue (max − min)",
  parity: "Nombre de pairs",
  high_low: "Numéros ≥ 26",
  consecutive: "Paires consécutives",
  star_sum: "Somme des étoiles",
  centroid: "Centre de masse",
  delay: "Retard d’une boule",
  hit: "Présence d’une boule",
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
    case "star_sum":
      return draw.stars.reduce((a, b) => a + b, 0)
    case "centroid":
      return nums.reduce((a, b) => a + b, 0) / 5
    default:
      return 0
  }
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
  if (name === "hit") {
    const ball = n ?? 7
    points = rows.map((draw) => {
      const hit = draw.numbers.includes(ball)
      return { date: draw.date, value: hit ? 1 : 0, hit }
    })
  } else if (name === "delay") {
    const ball = n ?? 7
    let lastIndex: number | null = null
    points = rows.map((draw, i) => {
      const hit = draw.numbers.includes(ball)
      let delay = i + 1
      if (hit) {
        delay = 0
        lastIndex = i
      } else if (lastIndex != null) {
        delay = i - lastIndex
      }
      return { date: draw.date, value: delay, hit }
    })
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
