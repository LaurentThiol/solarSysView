import {
  type Candle,
  atr,
  bollinger,
  ema,
  rsi,
  sma,
} from "@/lib/analysis"

export const FIB_RETR = [0.236, 0.382, 0.5, 0.618, 0.786]
export const FIB_EXTEND = [1.272, 1.618, 2.0, 2.618]

function lastNumber(values: Array<number | null | undefined>): number | null {
  for (let i = values.length - 1; i >= 0; i -= 1) {
    const value = values[i]
    if (value != null) return value
  }
  return null
}

function closes(candles: Candle[]) {
  return candles.map((c) => c.c)
}

function highs(candles: Candle[]) {
  return candles.map((c) => c.h)
}

function lows(candles: Candle[]) {
  return candles.map((c) => c.l)
}

export function trueRange(candles: Candle[]) {
  const out: number[] = []
  let prevC: number | null = null
  for (const candle of candles) {
    let tr = candle.h - candle.l
    if (prevC != null) tr = Math.max(tr, Math.abs(candle.h - prevC), Math.abs(candle.l - prevC))
    out.push(tr)
    prevC = candle.c
  }
  return out
}

export function activity(candles: Candle[]) {
  return trueRange(candles).map((tr, i) => tr * Math.max(1, candles[i].count || 1))
}

export function activityFromClose(values: number[]) {
  if (!values.length) return []
  const out = values.map((v, i) => (i ? Math.abs(v - values[i - 1]) : 0))
  if (out.length > 1) out[0] = out[1]
  else out[0] = 1
  return out
}

function asUnitCandles(values: number[], dates: string[]): Candle[] {
  return values.map((value, i) => {
    const prev = i ? values[i - 1] : value
    return {
      key: dates[i],
      from: dates[i],
      to: dates[i],
      count: 1,
      o: prev,
      h: Math.max(prev, value),
      l: Math.min(prev, value),
      c: value,
    }
  })
}

export function wma(values: number[], period: number) {
  const p = Math.max(1, Math.floor(period))
  const out: Array<number | null> = Array(values.length).fill(null)
  if (p > values.length) return out
  const weights = Array.from({ length: p }, (_, i) => i + 1)
  const denom = weights.reduce((a, b) => a + b, 0)
  for (let i = p - 1; i < values.length; i += 1) {
    let num = 0
    for (let k = 0; k < p; k += 1) num += values[i - p + 1 + k] * weights[k]
    out[i] = num / denom
  }
  return out
}

export function hma(values: number[], period: number) {
  const p = Math.max(1, Math.floor(period))
  const half = Math.max(1, Math.floor(p / 2))
  const sqrtN = Math.max(1, Math.floor(Math.sqrt(p)))
  const wmaHalf = wma(values, half)
  const wmaFull = wma(values, p)
  const raw: number[] = []
  const rawIdx: number[] = []
  for (let i = 0; i < values.length; i += 1) {
    const a = wmaHalf[i]
    const b = wmaFull[i]
    if (a == null || b == null) continue
    raw.push(2 * a - b)
    rawIdx.push(i)
  }
  const hull = wma(raw, sqrtN)
  const out: Array<number | null> = Array(values.length).fill(null)
  rawIdx.forEach((pos, i) => {
    out[pos] = hull[i]
  })
  return out
}

export function vwma(price: number[], volume: number[], period: number) {
  const p = Math.max(1, Math.floor(period))
  const out: Array<number | null> = Array(price.length).fill(null)
  if (p > price.length || price.length !== volume.length) return out
  for (let i = p - 1; i < price.length; i += 1) {
    let num = 0
    let den = 0
    for (let j = i - p + 1; j <= i; j += 1) {
      num += price[j] * volume[j]
      den += volume[j]
    }
    out[i] = den ? num / den : null
  }
  return out
}

export function maCrosses(fast: Array<number | null>, slow: Array<number | null>) {
  const events: { index: number; kind: "golden" | "death" }[] = []
  let prev = 0
  for (let i = 0; i < fast.length; i += 1) {
    const a = fast[i]
    const b = slow[i]
    if (a == null || b == null) continue
    const side = a > b ? 1 : a < b ? -1 : 0
    if (prev && side && side !== prev) {
      events.push({ index: i, kind: side > 0 ? "golden" : "death" })
    }
    if (side) prev = side
  }
  return events
}

export function stochastic(candles: Candle[], n = 14, d = 3) {
  const p = Math.max(1, n)
  const hs = highs(candles)
  const ls = lows(candles)
  const cs = closes(candles)
  const k: Array<number | null> = Array(candles.length).fill(null)
  for (let i = p - 1; i < candles.length; i += 1) {
    const hh = Math.max(...hs.slice(i - p + 1, i + 1))
    const ll = Math.min(...ls.slice(i - p + 1, i + 1))
    k[i] = hh === ll ? 50 : (100 * (cs[i] - ll)) / (hh - ll)
  }
  const compact = k.filter((v): v is number => v != null)
  const dCompact = sma(compact, d)
  const dLine: Array<number | null> = Array(k.length).fill(null)
  let ci = 0
  for (let i = 0; i < k.length; i += 1) {
    if (k[i] == null) continue
    dLine[i] = dCompact[ci]
    ci += 1
  }
  return { k, d: dLine }
}

export function cci(candles: Candle[], n = 20) {
  const p = Math.max(1, n)
  const tp = candles.map((c) => (c.h + c.l + c.c) / 3)
  const out: Array<number | null> = Array(candles.length).fill(null)
  for (let i = p - 1; i < tp.length; i += 1) {
    const chunk = tp.slice(i - p + 1, i + 1)
    const mu = chunk.reduce((a, b) => a + b, 0) / p
    const mad = chunk.reduce((a, x) => a + Math.abs(x - mu), 0) / p
    out[i] = mad ? (tp[i] - mu) / (0.015 * mad) : 0
  }
  return out
}

export function williamsR(candles: Candle[], n = 14) {
  const p = Math.max(1, n)
  const hs = highs(candles)
  const ls = lows(candles)
  const cs = closes(candles)
  const out: Array<number | null> = Array(candles.length).fill(null)
  for (let i = p - 1; i < candles.length; i += 1) {
    const hh = Math.max(...hs.slice(i - p + 1, i + 1))
    const ll = Math.min(...ls.slice(i - p + 1, i + 1))
    out[i] = hh === ll ? -50 : (-100 * (hh - cs[i])) / (hh - ll)
  }
  return out
}

export type Pivot = { index: number; date: string; price: number; type: "H" | "L" }

export function zigzag(prices: number[], dates: string[] = [], pct = 0.03): Pivot[] {
  if (!prices.length) return []
  const labels = dates.length === prices.length ? dates : prices.map((_, i) => String(i))
  const pivots: Pivot[] = []
  let lastPrice = prices[0]
  let lastIdx = 0
  let direction = 0
  prices.forEach((price, idx) => {
    const change = lastPrice === 0 ? 0 : (price - lastPrice) / Math.abs(lastPrice)
    if (direction >= 0 && change <= -pct) {
      pivots.push({ index: lastIdx, date: labels[lastIdx], price: lastPrice, type: "H" })
      lastIdx = idx
      lastPrice = price
      direction = -1
    } else if (direction <= 0 && change >= pct) {
      pivots.push({ index: lastIdx, date: labels[lastIdx], price: lastPrice, type: "L" })
      lastIdx = idx
      lastPrice = price
      direction = 1
    } else if ((direction >= 0 && price > lastPrice) || (direction <= 0 && price < lastPrice)) {
      lastIdx = idx
      lastPrice = price
    }
  })
  pivots.push({
    index: lastIdx,
    date: labels[lastIdx],
    price: lastPrice,
    type: direction >= 0 ? "H" : "L",
  })
  return pivots
}

export function swingStructure(pivots: Pivot[]) {
  const highsP = pivots.filter((p) => p.type === "H")
  const lowsP = pivots.filter((p) => p.type === "L")
  function seq(points: Pivot[], rising: string, falling: string) {
    if (points.length < 2) return null
    const a = points[points.length - 2].price
    const b = points[points.length - 1].price
    if (b > a) return rising
    if (b < a) return falling
    return "flat"
  }
  const hh = seq(highsP, "HH", "LH")
  const hl = seq(lowsP, "HL", "LL")
  let trend: "up" | "down" | "range" = "range"
  if (hh === "HH" && hl === "HL") trend = "up"
  else if (hh === "LH" && hl === "LL") trend = "down"
  return { highs: hh, lows: hl, trend, pivotCount: pivots.length }
}

export function supportResistanceLevels(pivots: Pivot[], epsPct = 0.01) {
  if (!pivots.length) return []
  const prices = pivots.map((p) => p.price).sort((a, b) => a - b)
  const mu = prices.reduce((a, b) => a + b, 0) / prices.length
  const eps = Math.abs(mu) * epsPct || epsPct
  const clusters: number[][] = []
  for (const price of prices) {
    const cluster = clusters.find((c) => Math.abs(price - c.reduce((a, b) => a + b, 0) / c.length) <= eps)
    if (cluster) cluster.push(price)
    else clusters.push([price])
  }
  return clusters
    .filter((c) => c.length >= 2)
    .map((cluster) => {
      const center = cluster.reduce((a, b) => a + b, 0) / cluster.length
      const nearest = pivots.reduce((best, p) =>
        Math.abs(p.price - center) < Math.abs(best.price - center) ? p : best
      )
      return { price: center, hits: cluster.length, type: nearest.type }
    })
    .sort((a, b) => b.hits - a.hits)
}

export function trendline(pivots: Pivot[], kind: "support" | "resistance" = "support") {
  const wanted = kind === "support" ? "L" : "H"
  const sub = pivots.filter((p) => p.type === wanted)
  if (sub.length < 2) return null
  const xs = sub.map((_, i) => i)
  const ys = sub.map((p) => p.price)
  const xbar = xs.reduce((a, b) => a + b, 0) / xs.length
  const ybar = ys.reduce((a, b) => a + b, 0) / ys.length
  const den = xs.reduce((acc, x) => acc + (x - xbar) ** 2, 0)
  if (!den) return null
  const a = xs.reduce((acc, x, i) => acc + (x - xbar) * (ys[i] - ybar), 0) / den
  return { kind, slope: a, intercept: ybar - a * xbar, dates: sub.map((p) => p.date), prices: ys }
}

export function adx(candles: Candle[], n = 14) {
  const p = Math.max(1, n)
  const plusDi: Array<number | null> = Array(candles.length).fill(null)
  const minusDi: Array<number | null> = Array(candles.length).fill(null)
  const adxLine: Array<number | null> = Array(candles.length).fill(null)
  if (candles.length < p + 1) return { plusDi, minusDi, adx: adxLine }
  const plusDm = Array(candles.length).fill(0)
  const minusDm = Array(candles.length).fill(0)
  for (let i = 1; i < candles.length; i += 1) {
    const up = candles[i].h - candles[i - 1].h
    const down = candles[i - 1].l - candles[i].l
    plusDm[i] = up > down && up > 0 ? up : 0
    minusDm[i] = down > up && down > 0 ? down : 0
  }
  const tr = trueRange(candles)
  let atrS = tr.slice(1, p + 1).reduce((a, b) => a + b, 0) / p
  let plusS = plusDm.slice(1, p + 1).reduce((a: number, b: number) => a + b, 0) / p
  let minusS = minusDm.slice(1, p + 1).reduce((a: number, b: number) => a + b, 0) / p
  const dxSeed: number[] = []
  if (atrS) {
    const pdi = (100 * plusS) / atrS
    const mdi = (100 * minusS) / atrS
    plusDi[p] = pdi
    minusDi[p] = mdi
    const denom = pdi + mdi
    dxSeed.push(denom ? (100 * Math.abs(pdi - mdi)) / denom : 0)
  }
  for (let i = p + 1; i < candles.length; i += 1) {
    atrS = (atrS * (p - 1) + tr[i]) / p
    plusS = (plusS * (p - 1) + plusDm[i]) / p
    minusS = (minusS * (p - 1) + minusDm[i]) / p
    const pdi = atrS ? (100 * plusS) / atrS : 0
    const mdi = atrS ? (100 * minusS) / atrS : 0
    plusDi[i] = pdi
    minusDi[i] = mdi
    const denom = pdi + mdi
    dxSeed.push(denom ? (100 * Math.abs(pdi - mdi)) / denom : 0)
  }
  if (dxSeed.length < p) return { plusDi, minusDi, adx: adxLine }
  let adxPrev = dxSeed.slice(0, p).reduce((a, b) => a + b, 0) / p
  const first = p + p - 1
  if (first < candles.length) {
    adxLine[first] = adxPrev
    dxSeed.slice(p).forEach((dx, offset) => {
      adxPrev = (adxPrev * (p - 1) + dx) / p
      const i = first + 1 + offset
      if (i < candles.length) adxLine[i] = adxPrev
    })
  }
  return { plusDi, minusDi, adx: adxLine }
}

export function adxRegime(value: number | null) {
  if (value == null) return "inconnu"
  if (value < 20) return "range"
  if (value < 25) return "naissant"
  if (value < 40) return "établi"
  return "fort"
}

export function aroon(candles: Candle[], n = 25) {
  const p = Math.max(1, n)
  const hs = highs(candles)
  const ls = lows(candles)
  const up: Array<number | null> = Array(candles.length).fill(null)
  const down: Array<number | null> = Array(candles.length).fill(null)
  const osc: Array<number | null> = Array(candles.length).fill(null)
  for (let i = p; i < candles.length; i += 1) {
    const windowH = hs.slice(i - p, i + 1)
    const windowL = ls.slice(i - p, i + 1)
    const hi = Math.max(...windowH)
    const lo = Math.min(...windowL)
    let sinceH = 0
    let sinceL = 0
    for (let j = p; j >= 0; j -= 1) {
      if (windowH[j] === hi) {
        sinceH = j
        break
      }
    }
    for (let j = p; j >= 0; j -= 1) {
      if (windowL[j] === lo) {
        sinceL = j
        break
      }
    }
    up[i] = (100 * sinceH) / p
    down[i] = (100 * sinceL) / p
    osc[i] = (up[i] as number) - (down[i] as number)
  }
  return { aroonUp: up, aroonDown: down, aroonOsc: osc }
}

export function supertrend(candles: Candle[], n = 10, mult = 3) {
  const atrLine = atr(candles, n)
  const line: Array<number | null> = Array(candles.length).fill(null)
  const direction: Array<number | null> = Array(candles.length).fill(null)
  const finalUpper: Array<number | null> = Array(candles.length).fill(null)
  const finalLower: Array<number | null> = Array(candles.length).fill(null)
  let prevDir = 1
  candles.forEach((candle, i) => {
    const atrI = atrLine[i]
    if (atrI == null) return
    const hl2 = (candle.h + candle.l) / 2
    const basicUpper = hl2 + mult * atrI
    const basicLower = hl2 - mult * atrI
    const prevU = i ? finalUpper[i - 1] : null
    const prevL = i ? finalLower[i - 1] : null
    const prevC = i ? candles[i - 1].c : candle.c
    finalUpper[i] = prevU == null || prevC > prevU ? basicUpper : Math.min(basicUpper, prevU)
    finalLower[i] = prevL == null || prevC < prevL ? basicLower : Math.max(basicLower, prevL)
    if (prevU != null && candle.c > prevU) prevDir = 1
    else if (prevL != null && candle.c < prevL) prevDir = -1
    direction[i] = prevDir
    line[i] = prevDir === 1 ? finalLower[i] : finalUpper[i]
  })
  return { supertrend: line, dir: direction }
}

export function parabolicSar(candles: Candle[], step = 0.02, maxAf = 0.2) {
  const out: Array<number | null> = Array(candles.length).fill(null)
  if (candles.length < 2) return out
  let bull = candles[1].c >= candles[0].c
  let sar = bull ? candles[0].l : candles[0].h
  let ep = bull ? candles[0].h : candles[0].l
  let af = step
  out[0] = sar
  for (let i = 1; i < candles.length; i += 1) {
    const { h, l } = candles[i]
    sar += af * (ep - sar)
    if (bull) {
      sar = i >= 2 ? Math.min(sar, candles[i - 1].l, candles[i - 2].l) : Math.min(sar, candles[i - 1].l)
      if (l < sar) {
        bull = false
        sar = ep
        ep = l
        af = step
      } else if (h > ep) {
        ep = h
        af = Math.min(maxAf, af + step)
      }
    } else {
      sar = i >= 2 ? Math.max(sar, candles[i - 1].h, candles[i - 2].h) : Math.max(sar, candles[i - 1].h)
      if (h > sar) {
        bull = true
        sar = ep
        ep = h
        af = step
      } else if (l < ep) {
        ep = l
        af = Math.min(maxAf, af + step)
      }
    }
    out[i] = sar
  }
  return out
}

export function bollingerFull(values: number[], period = 20, k = 2) {
  const bands = bollinger(values, period, k)
  const percentB: Array<number | null> = Array(values.length).fill(null)
  const width: Array<number | null> = Array(values.length).fill(null)
  bands.middle.forEach((mid, i) => {
    const up = bands.upper[i]
    const lo = bands.lower[i]
    if (mid == null || up == null || lo == null) return
    const span = up - lo
    percentB[i] = span ? (values[i] - lo) / span : 0.5
    width[i] = mid ? span / mid : null
  })
  return { ...bands, percentB, width }
}

export function keltner(candles: Candle[], n = 20, k = 2) {
  const mid = ema(closes(candles), n)
  const atrLine = atr(candles, n)
  const upper: Array<number | null> = Array(candles.length).fill(null)
  const lower: Array<number | null> = Array(candles.length).fill(null)
  mid.forEach((m, i) => {
    const a = atrLine[i]
    if (m == null || a == null) return
    upper[i] = m + k * a
    lower[i] = m - k * a
  })
  return { middle: mid, upper, lower }
}

export function donchian(candles: Candle[], n = 20) {
  const p = Math.max(1, n)
  const hs = highs(candles)
  const ls = lows(candles)
  const upper: Array<number | null> = Array(candles.length).fill(null)
  const lower: Array<number | null> = Array(candles.length).fill(null)
  const middle: Array<number | null> = Array(candles.length).fill(null)
  for (let i = p - 1; i < candles.length; i += 1) {
    const uh = Math.max(...hs.slice(i - p + 1, i + 1))
    const ll = Math.min(...ls.slice(i - p + 1, i + 1))
    upper[i] = uh
    lower[i] = ll
    middle[i] = (uh + ll) / 2
  }
  return { upper, lower, middle }
}

export function squeeze(
  bb: { upper: Array<number | null>; lower: Array<number | null> },
  kc: { upper: Array<number | null>; lower: Array<number | null> }
) {
  return bb.upper.map((bu, i) => {
    const bl = bb.lower[i]
    const ku = kc.upper[i]
    const kl = kc.lower[i]
    if (bu == null || bl == null || ku == null || kl == null) return null
    return bu <= ku && bl >= kl
  })
}

export function ichimoku(candles: Candle[], tenkan = 9, kijun = 26, senkou = 52) {
  const hs = highs(candles)
  const ls = lows(candles)
  const cs = closes(candles)
  const n = candles.length
  const tLine: Array<number | null> = Array(n).fill(null)
  const kLine: Array<number | null> = Array(n).fill(null)
  const senkouBRaw: Array<number | null> = Array(n).fill(null)
  for (let i = 0; i < n; i += 1) {
    if (i + 1 >= tenkan) {
      tLine[i] =
        (Math.max(...hs.slice(i + 1 - tenkan, i + 1)) + Math.min(...ls.slice(i + 1 - tenkan, i + 1))) / 2
    }
    if (i + 1 >= kijun) {
      kLine[i] =
        (Math.max(...hs.slice(i + 1 - kijun, i + 1)) + Math.min(...ls.slice(i + 1 - kijun, i + 1))) / 2
    }
    if (i + 1 >= senkou) {
      senkouBRaw[i] =
        (Math.max(...hs.slice(i + 1 - senkou, i + 1)) + Math.min(...ls.slice(i + 1 - senkou, i + 1))) / 2
    }
  }
  const senkouA: Array<number | null> = Array(n).fill(null)
  const senkouB: Array<number | null> = Array(n).fill(null)
  const chikou: Array<number | null> = Array(n).fill(null)
  for (let i = 0; i < n; i += 1) {
    if (tLine[i] != null && kLine[i] != null && i + kijun < n) {
      senkouA[i + kijun] = ((tLine[i] as number) + (kLine[i] as number)) / 2
    }
    if (senkouBRaw[i] != null && i + kijun < n) senkouB[i + kijun] = senkouBRaw[i]
    if (i + kijun < n) chikou[i] = cs[i + kijun]
  }
  return { tenkan: tLine, kijun: kLine, senkouA, senkouB, chikou }
}

export function fibLevels(swingLow: number, swingHigh: number, bullish = true) {
  const rng = swingHigh - swingLow
  if (bullish) {
    return {
      retracements: Object.fromEntries(FIB_RETR.map((r) => [String(r), swingHigh - r * rng])),
      extensions: Object.fromEntries(FIB_EXTEND.map((r) => [String(r), swingHigh + (r - 1) * rng])),
    }
  }
  return {
    retracements: Object.fromEntries(FIB_RETR.map((r) => [String(r), swingLow + r * rng])),
    extensions: Object.fromEntries(FIB_EXTEND.map((r) => [String(r), swingLow - (r - 1) * rng])),
  }
}

export function fibFromPivots(pivots: Pivot[]) {
  if (pivots.length < 2) return null
  const last = pivots[pivots.length - 1]
  const prev = pivots[pivots.length - 2]
  const high = Math.max(last.price, prev.price)
  const low = Math.min(last.price, prev.price)
  const bullish = last.type === "L"
  return {
    ...fibLevels(low, high, bullish),
    swingLow: low,
    swingHigh: high,
    bullish,
    from: prev.date,
    to: last.date,
  }
}

export function pivotsClassic(h: number, l: number, c: number) {
  const p = (h + l + c) / 3
  return {
    P: p,
    R1: 2 * p - l,
    S1: 2 * p - h,
    R2: p + (h - l),
    S2: p - (h - l),
    R3: h + 2 * (p - l),
    S3: l - 2 * (h - p),
  }
}

export function pivotsFibonacci(h: number, l: number, c: number) {
  const p = (h + l + c) / 3
  const rng = h - l
  return {
    P: p,
    R1: p + 0.382 * rng,
    R2: p + 0.618 * rng,
    R3: p + rng,
    S1: p - 0.382 * rng,
    S2: p - 0.618 * rng,
    S3: p - rng,
  }
}

export function pivotsCamarilla(h: number, l: number, c: number) {
  const rng = h - l
  return {
    P: c,
    H4: c + (1.1 * rng) / 2,
    H3: c + (1.1 * rng) / 4,
    L3: c - (1.1 * rng) / 4,
    L4: c - (1.1 * rng) / 2,
  }
}

export function pivotsWoodie(h: number, l: number, c: number) {
  const p = (h + l + 2 * c) / 4
  return {
    P: p,
    R1: 2 * p - l,
    S1: 2 * p - h,
    R2: p + (h - l),
    S2: p - (h - l),
  }
}

export function pivotsFromPrevCandle(candle: Candle | undefined | null) {
  if (!candle) return null
  return {
    classic: pivotsClassic(candle.h, candle.l, candle.c),
    fibonacci: pivotsFibonacci(candle.h, candle.l, candle.c),
    camarilla: pivotsCamarilla(candle.h, candle.l, candle.c),
    woodie: pivotsWoodie(candle.h, candle.l, candle.c),
    source: { from: candle.from, to: candle.to, key: candle.key },
  }
}

export function breakoutTargets(support: number, resistance: number, breakout: number, bullish = true) {
  const height = Math.abs(resistance - support)
  return {
    measuredMove: bullish ? breakout + height : breakout - height,
    fib1618Leg: bullish ? breakout + 0.618 * height : breakout - 0.618 * height,
    height,
  }
}

export function obv(closeValues: number[], volume: number[]) {
  const out: number[] = []
  let acc = 0
  let prev = closeValues[0] ?? 0
  closeValues.forEach((close, i) => {
    const vol = volume[i] ?? 0
    if (close > prev) acc += vol
    else if (close < prev) acc -= vol
    out.push(acc)
    prev = close
  })
  return out
}

export function adl(candles: Candle[], volume: number[]) {
  let acc = 0
  return candles.map((candle, i) => {
    const denom = candle.h - candle.l
    const mfm = denom ? (candle.c - candle.l - (candle.h - candle.c)) / denom : 0
    acc += mfm * (volume[i] ?? 0)
    return acc
  })
}

export function mfi(candles: Candle[], volume: number[], n = 14) {
  const p = Math.max(1, n)
  const tp = candles.map((c) => (c.h + c.l + c.c) / 3)
  const mf = tp.map((t, i) => t * (volume[i] ?? 0))
  const out: Array<number | null> = Array(candles.length).fill(null)
  for (let i = p; i < candles.length; i += 1) {
    let pos = 0
    let neg = 0
    for (let j = i - p + 1; j <= i; j += 1) {
      if (tp[j] > tp[j - 1]) pos += mf[j]
      else if (tp[j] < tp[j - 1]) neg += mf[j]
    }
    out[i] = neg === 0 ? (pos ? 100 : 50) : 100 - 100 / (1 + pos / neg)
  }
  return out
}

export function vwap(candles: Candle[], volume: number[]) {
  let num = 0
  let den = 0
  return candles.map((candle, i) => {
    const tp = (candle.h + candle.l + candle.c) / 3
    const vol = volume[i] ?? 0
    num += tp * vol
    den += vol
    return den ? num / den : null
  })
}

export function renko(closeValues: number[], dates: string[], brick: number) {
  const size = Math.abs(brick) || 1
  if (!closeValues.length) return []
  const labels = dates.length === closeValues.length ? dates : closeValues.map((_, i) => String(i))
  let level = closeValues[0]
  const bricks: Array<Candle & { dir: number }> = []
  closeValues.forEach((price, idx) => {
    const label = labels[idx]
    while (price >= level + size) {
      const prev = level
      level += size
      bricks.push({ from: label, to: label, key: label, count: 1, o: prev, h: level, l: prev, c: level, dir: 1 })
    }
    while (price <= level - size) {
      const prev = level
      level -= size
      bricks.push({ from: label, to: label, key: label, count: 1, o: prev, h: prev, l: level, c: level, dir: -1 })
    }
  })
  return bricks
}

export function kagi(closeValues: number[], dates: string[], threshold: number) {
  if (!closeValues.length) return []
  const labels = dates.length === closeValues.length ? dates : closeValues.map((_, i) => String(i))
  const lines: Array<{ from: string; to: string; yang: boolean; price: number } & Candle> = []
  let extreme = closeValues[0]
  let direction = 0
  let start = 0
  closeValues.forEach((price, i) => {
    if (direction === 0) {
      if (Math.abs(price - extreme) >= threshold) {
        direction = price > extreme ? 1 : -1
        extreme = price
      }
      return
    }
    if (direction === 1) {
      if (price > extreme) extreme = price
      else if (extreme - price >= threshold) {
        lines.push({
          from: labels[start],
          to: labels[i],
          key: labels[i],
          count: 1,
          yang: true,
          price: extreme,
          o: closeValues[start],
          c: extreme,
          h: extreme,
          l: Math.min(closeValues[start], extreme),
        })
        start = i
        direction = -1
        extreme = price
      }
    } else if (price < extreme) extreme = price
    else if (price - extreme >= threshold) {
      lines.push({
        from: labels[start],
        to: labels[i],
        key: labels[i],
        count: 1,
        yang: false,
        price: extreme,
        o: closeValues[start],
        c: extreme,
        h: Math.max(closeValues[start], extreme),
        l: extreme,
      })
      start = i
      direction = 1
      extreme = price
    }
  })
  return lines
}

export function pointAndFigure(closeValues: number[], box: number, reversal = 3) {
  const size = Math.abs(box) || 1
  if (!closeValues.length) return []
  const columns: { type: "X" | "O"; price: number; boxes: number }[] = []
  let direction = 0
  let current = Math.round(closeValues[0] / size) * size
  let height = 1
  for (const price of closeValues.slice(1)) {
    if (direction >= 0 && price >= current + size) {
      const steps = Math.floor((price - current) / size)
      height += steps
      current += steps * size
      direction = 1
    } else if (direction <= 0 && price <= current - size) {
      const steps = Math.floor((current - price) / size)
      height += steps
      current -= steps * size
      direction = -1
    } else if (direction > 0 && current - price >= reversal * size) {
      columns.push({ type: "X", price: current, boxes: height })
      direction = -1
      height = reversal
      current -= reversal * size
    } else if (direction < 0 && price - current >= reversal * size) {
      columns.push({ type: "O", price: current, boxes: height })
      direction = 1
      height = reversal
      current += reversal * size
    }
  }
  if (direction) columns.push({ type: direction > 0 ? "X" : "O", price: current, boxes: height })
  return columns
}

function body(o: number, c: number) {
  return Math.abs(c - o)
}

export function isDoji(o: number, h: number, l: number, c: number, tol = 0.1) {
  return body(o, c) <= tol * (h - l + 1e-9)
}

export function isHammer(o: number, h: number, l: number, c: number) {
  const b = body(o, c)
  return b > 0 && Math.min(o, c) - l > 2 * b && h - Math.max(o, c) < b
}

export function isShootingStar(o: number, h: number, l: number, c: number) {
  const b = body(o, c)
  return b > 0 && h - Math.max(o, c) > 2 * b && Math.min(o, c) - l < b
}

export function isBullishEngulfing(prev: Candle, cur: Candle) {
  return prev.c < prev.o && cur.c > cur.o && cur.c >= prev.o && cur.o <= prev.c
}

export function isBearishEngulfing(prev: Candle, cur: Candle) {
  return prev.c > prev.o && cur.c < cur.o && cur.c <= prev.o && cur.o >= prev.c
}

export function isMorningStar(bars: Candle[]) {
  if (bars.length < 3) return false
  const [b1, b2, b3] = bars.slice(-3)
  return (
    b1.c < b1.o &&
    body(b2.o, b2.c) < 0.3 * (b1.o - b1.c + 1e-9) &&
    b3.c > b3.o &&
    b3.c > (b1.o + b1.c) / 2
  )
}

export function detectCandles(candles: Candle[]) {
  const found: { index: number; key: string; from: string; to: string; name: string }[] = []
  candles.forEach((candle, i) => {
    const labels: string[] = []
    if (isDoji(candle.o, candle.h, candle.l, candle.c)) labels.push("doji")
    if (isHammer(candle.o, candle.h, candle.l, candle.c)) labels.push("marteau")
    if (isShootingStar(candle.o, candle.h, candle.l, candle.c)) labels.push("étoile filante")
    if (i > 0 && isBullishEngulfing(candles[i - 1], candle)) labels.push("avalement haussier")
    if (i > 0 && isBearishEngulfing(candles[i - 1], candle)) labels.push("avalement baissier")
    if (i >= 2 && isMorningStar(candles.slice(0, i + 1))) labels.push("étoile du matin")
    for (const name of labels) {
      found.push({ index: i, key: candle.key, from: candle.from, to: candle.to, name })
    }
  })
  return found
}

function near(a: number, b: number, eps: number) {
  return Math.abs(a - b) <= eps * Math.max(Math.abs(a), Math.abs(b), 1)
}

export function detectChartPatterns(pivots: Pivot[], eps = 0.03) {
  const patterns: Array<{
    name: string
    kind: string
    from: string
    to: string
    target?: number
    targetUp?: number
    targetDown?: number
    neck?: number
  }> = []
  const hs = pivots.filter((p) => p.type === "H")
  const ls = pivots.filter((p) => p.type === "L")
  if (hs.length >= 2) {
    const a = hs[hs.length - 2]
    const b = hs[hs.length - 1]
    if (near(a.price, b.price, eps)) {
      const troughs = ls.filter((p) => a.index < p.index && p.index < b.index)
      const neck = troughs.length ? troughs[troughs.length - 1].price : Math.min(a.price, b.price)
      patterns.push({
        name: "double sommet",
        kind: "reversal_down",
        from: a.date,
        to: b.date,
        target: neck - Math.abs(a.price - neck),
        neck,
      })
    }
  }
  if (ls.length >= 2) {
    const a = ls[ls.length - 2]
    const b = ls[ls.length - 1]
    if (near(a.price, b.price, eps)) {
      const peaks = hs.filter((p) => a.index < p.index && p.index < b.index)
      const neck = peaks.length ? peaks[peaks.length - 1].price : Math.max(a.price, b.price)
      patterns.push({
        name: "double creux",
        kind: "reversal_up",
        from: a.date,
        to: b.date,
        target: neck + Math.abs(neck - a.price),
        neck,
      })
    }
  }
  if (hs.length >= 3) {
    const h1 = hs[hs.length - 3]
    const h2 = hs[hs.length - 2]
    const h3 = hs[hs.length - 1]
    if (h2.price > h1.price && h2.price > h3.price && near(h1.price, h3.price, eps)) {
      const neckLows = ls.filter((p) => h1.index < p.index && p.index < h3.index)
      if (neckLows.length >= 2) {
        const neck = (neckLows[0].price + neckLows[neckLows.length - 1].price) / 2
        patterns.push({
          name: "tête et épaules",
          kind: "reversal_down",
          from: h1.date,
          to: h3.date,
          target: neck - (h2.price - neck),
          neck,
        })
      }
    }
  }
  return patterns
}

export function activityConfirms(volume: number[], index: number, period = 20) {
  if (index < 0 || index >= volume.length) return false
  const chunk = volume.slice(Math.max(0, index - period), index)
  if (!chunk.length) return false
  return volume[index] > chunk.reduce((a, b) => a + b, 0) / chunk.length
}

export function positionSize(capital: number, riskPct: number, entry: number, stop: number, contractSize = 1) {
  const perUnit = Math.abs(entry - stop) * contractSize
  if (perUnit <= 0) return 0
  return Math.floor((capital * riskPct) / perUnit)
}

export function kellyFraction(winRate: number, payoff: number, fraction = 0.5) {
  if (payoff <= 0) return 0
  return Math.max(0, (winRate - (1 - winRate) / payoff) * fraction)
}

export function backtest(closeValues: number[], entry: boolean[], exit_: boolean[], fee = 0.001) {
  const n = closeValues.length
  const position = Array(n).fill(0)
  let inPos = false
  for (let i = 0; i < n; i += 1) {
    if (!inPos && entry[i]) inPos = true
    else if (inPos && exit_[i]) inPos = false
    position[i] = inPos ? 1 : 0
  }
  const returns = [0]
  for (let i = 1; i < n; i += 1) {
    returns.push(closeValues[i - 1] === 0 ? 0 : closeValues[i] / closeValues[i - 1] - 1)
  }
  const strat = Array(n).fill(0)
  for (let i = 1; i < n; i += 1) {
    const prev = position[i - 1]
    strat[i] = returns[i] * prev - Math.abs(position[i] - prev) * fee
  }
  const equity: number[] = []
  let acc = 1
  for (const r of strat) {
    acc *= 1 + r
    equity.push(acc)
  }
  return { equity, returns: strat, position }
}

export function metrics(returns: number[], periodsPerYear = 104, rf = 0) {
  const n = returns.length
  if (!n) {
    return {
      cagr: null as number | null,
      sharpe: null as number | null,
      sortino: null as number | null,
      maxDd: null as number | null,
      calmar: null as number | null,
      hit: null as number | null,
      profitFactor: null as number | null,
      expectancy: null as number | null,
    }
  }
  const avg = returns.reduce((a, b) => a + b, 0) / n
  const mu = avg * periodsPerYear
  const sd = Math.sqrt(returns.reduce((acc, r) => acc + (r - avg) ** 2, 0) / n) * Math.sqrt(periodsPerYear)
  const downs = returns.filter((r) => r < 0)
  const downside = downs.length
    ? Math.sqrt(downs.reduce((acc, r) => acc + r * r, 0) / downs.length) * Math.sqrt(periodsPerYear)
    : 0
  let equity = 1
  let peak = 1
  let maxDd = 0
  for (const r of returns) {
    equity *= 1 + r
    peak = Math.max(peak, equity)
    maxDd = Math.min(maxDd, equity / peak - 1)
  }
  const gains = returns.filter((r) => r > 0)
  const losses = returns.filter((r) => r < 0)
  const pf = losses.length && losses.reduce((a, b) => a + b, 0) !== 0
    ? gains.reduce((a, b) => a + b, 0) / Math.abs(losses.reduce((a, b) => a + b, 0))
    : null
  const expectancy =
    (gains.length / n) * (gains.length ? gains.reduce((a, b) => a + b, 0) / gains.length : 0) +
    (losses.length / n) * (losses.length ? losses.reduce((a, b) => a + b, 0) / losses.length : 0)
  return {
    cagr: equity > 0 ? equity ** (periodsPerYear / n) - 1 : null,
    sharpe: sd ? (mu - rf) / sd : null,
    sortino: downside ? (mu - rf) / downside : null,
    maxDd,
    calmar: maxDd ? (mu - rf) / Math.abs(maxDd) : null,
    hit: returns.filter((r) => r > 0).length / n,
    profitFactor: pf,
    expectancy,
  }
}

export function donchianAdxSignals(candles: Candle[], donchianN = 20, adxN = 14, adxMin = 25) {
  const dc = donchian(candles, donchianN)
  const pack = adx(candles, adxN)
  const entry = Array(candles.length).fill(false)
  const exit_ = Array(candles.length).fill(false)
  for (let i = 1; i < candles.length; i += 1) {
    const prevUp = dc.upper[i - 1]
    const prevMid = dc.middle[i - 1]
    const adxNow = pack.adx[i]
    if (prevUp != null && adxNow != null && candles[i].c > prevUp && adxNow > adxMin) entry[i] = true
    if (prevMid != null && candles[i].c < prevMid) exit_[i] = true
    if (adxNow != null && adxNow < 20) exit_[i] = true
  }
  return { entry, exit: exit_ }
}

export function walkForward(candles: Candle[], window: number, step?: number, fee = 0.001) {
  const w = Math.max(10, window)
  const s = Math.max(1, step ?? w)
  const rows: { from: string; to: string; n: number; metrics: ReturnType<typeof metrics> }[] = []
  for (let start = 0; start <= candles.length - w; start += s) {
    const chunk = candles.slice(start, start + w)
    if (chunk.length < 10) continue
    const sig = donchianAdxSignals(chunk)
    const bt = backtest(closes(chunk), sig.entry, sig.exit, fee)
    rows.push({
      from: chunk[0].from,
      to: chunk[chunk.length - 1].to,
      n: chunk.length,
      metrics: metrics(bt.returns),
    })
  }
  return rows
}

export function divergences(oscillator: Array<number | null>, pivots: Pivot[]) {
  const found: { kind: "bearish" | "bullish"; from: string; to: string }[] = []
  const hs = pivots.filter((p) => p.type === "H")
  const ls = pivots.filter((p) => p.type === "L")
  if (hs.length >= 2) {
    const a = hs[hs.length - 2]
    const b = hs[hs.length - 1]
    const oa = oscillator[a.index]
    const ob = oscillator[b.index]
    if (oa != null && ob != null && b.price > a.price && ob < oa) {
      found.push({ kind: "bearish", from: a.date, to: b.date })
    }
  }
  if (ls.length >= 2) {
    const a = ls[ls.length - 2]
    const b = ls[ls.length - 1]
    const oa = oscillator[a.index]
    const ob = oscillator[b.index]
    if (oa != null && ob != null && b.price < a.price && ob > oa) {
      found.push({ kind: "bullish", from: a.date, to: b.date })
    }
  }
  return found
}

function stdSimple(values: number[]) {
  if (values.length < 2) return 0
  const mu = values.reduce((a, b) => a + b, 0) / values.length
  return Math.sqrt(values.reduce((acc, v) => acc + (v - mu) ** 2, 0) / (values.length - 1))
}

export function techPack(
  values: number[],
  candles: Candle[],
  dates: string[] = [],
  options: { smaPeriod?: number; zigzagPct?: number; warmupCount?: number } = {}
) {
  const smaPeriod = options.smaPeriod ?? 20
  const zigzagPct = options.zigzagPct ?? 0.03
  const warmupCount = options.warmupCount ?? 0
  const labels = dates.length === values.length ? dates : values.map((_, i) => String(i))
  const useCandles =
    candles.length === values.length ? candles : asUnitCandles(values, labels)
  const act =
    candles.length === values.length ? activity(useCandles) : activityFromClose(values)
  const wmaLine = wma(values, smaPeriod)
  const hmaLine = hma(values, smaPeriod)
  const vwmaLine = vwma(values, act, smaPeriod)
  const stoch = stochastic(useCandles)
  const cciLine = cci(useCandles)
  const wr = williamsR(useCandles)
  const adxPack = adx(useCandles)
  const aroonPack = aroon(useCandles)
  const stPack = supertrend(useCandles)
  const sar = parabolicSar(useCandles)
  const bb = bollingerFull(values, smaPeriod)
  const kc = keltner(useCandles, smaPeriod)
  const dc = donchian(useCandles, smaPeriod)
  const ichi = ichimoku(useCandles)
  const piv = zigzag(values, labels, zigzagPct)
  const workCandles = useCandles.slice(warmupCount)
  const workAct = act.slice(warmupCount)
  const rsiValues = rsi(values, 14)
  const sig = workCandles.length ? donchianAdxSignals(workCandles) : { entry: [], exit: [] }
  const bt = workCandles.length
    ? backtest(
        workCandles.map((c) => c.c),
        sig.entry,
        sig.exit
      )
    : { equity: [] as number[], returns: [] as number[], position: [] as number[] }
  const met = metrics(bt.returns)
  const brick = lastNumber(atr(useCandles, 14)) || stdSimple(values) || 1
  const smaFast = sma(values, Math.min(50, Math.max(5, smaPeriod)))
  const smaSlow = sma(values, Math.min(200, Math.max(10, smaPeriod * 4)))
  const lastAdx = lastNumber(adxPack.adx)
  return {
    disclaimer:
      "Chaque tirage est indépendant. Ces indicateurs décrivent la série observée dans la fenêtre choisie. Chikou est affiché, pas un signal temps réel. L’activité n’est pas un volume de marché.",
    zigzag: piv,
    structure: swingStructure(piv),
    supportResistance: supportResistanceLevels(piv),
    trendlineSupport: trendline(piv, "support"),
    trendlineResistance: trendline(piv, "resistance"),
    wma: wmaLine,
    hma: hmaLine,
    vwma: vwmaLine,
    crosses: maCrosses(smaFast, smaSlow),
    stochastic: stoch,
    cci: cciLine,
    williamsR: wr,
    adx: adxPack,
    adxRegime: adxRegime(lastAdx),
    aroon: aroonPack,
    supertrend: stPack,
    psar: sar,
    bollinger: bb,
    keltner: kc,
    donchian: dc,
    squeeze: squeeze(bb, kc),
    ichimoku: ichi,
    fibonacci: fibFromPivots(piv),
    pivots: pivotsFromPrevCandle(workCandles.at(-2) ?? workCandles.at(-1)),
    candlestickPatterns: detectCandles(useCandles),
    chartPatterns: detectChartPatterns(piv),
    divergences: divergences(rsiValues, piv),
    activity: act,
    obv: obv(values, act),
    adl: adl(useCandles, act),
    mfi: mfi(useCandles, act),
    vwap: vwap(workCandles, workAct),
    renko: renko(values, labels, brick / 2),
    kagi: kagi(values, labels, Math.abs(brick)),
    pnf: pointAndFigure(values, brick / 4 || 1),
    system: {
      signals: sig,
      backtest: { equity: bt.equity, returns: bt.returns },
      metrics: met,
      walkForward: workCandles.length >= 20 ? walkForward(workCandles, Math.max(20, smaPeriod * 2)) : [],
      positionSizeExample: positionSize(20000, 0.01, 100, 96),
      kellyHalf: kellyFraction(met.hit ?? 0.4, 2, 0.5),
    },
    last: {
      wma: lastNumber(wmaLine),
      hma: lastNumber(hmaLine),
      adx: lastAdx,
      cci: lastNumber(cciLine),
      stochK: lastNumber(stoch.k),
      mfi: lastNumber(mfi(useCandles, act)),
      vwap: lastNumber(vwap(workCandles, workAct)),
      percentB: lastNumber(bb.percentB),
      atr: lastNumber(atr(useCandles, 14)),
    },
  }
}
