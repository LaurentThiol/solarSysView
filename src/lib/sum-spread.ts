/** Nuage somme × étendue : axes et cellules, sans alias `@/` (tests Node). */

import { NUMBER_SPREAD_MAX, NUMBER_SPREAD_MIN, spreadOf } from "./grid-shape.ts"

/** Bornes de la somme des 5 numéros — mêmes constantes que Jeux / Combinaisons. */
export const NUMBER_SUM_AXIS = {
  min: 15,
  max: 240,
  mean: 128,
} as const

export const NUMBER_SPREAD_AXIS = {
  min: NUMBER_SPREAD_MIN,
  max: NUMBER_SPREAD_MAX,
} as const

export type SumSpreadScale = "universe" | "window"

export type SumSpreadDraw = {
  date: string
  weekday?: string
  numbers: number[]
}

export type SumSpreadCell = {
  sum: number
  spread: number
  count: number
  dates: string[]
  lastDate: string
  weekday: string | undefined
  /** 0 = plus ancien de la fenêtre, 1 = plus récent. */
  recency: number
}

export type SumSpreadCloud = {
  cells: SumSpreadCell[]
  last: SumSpreadCell | null
  drawCount: number
  fromDate: string | null
  toDate: string | null
  meanSum: number | null
  meanSpread: number | null
}

export type SumSpreadEnvelopePoint = {
  sum: number
  spreadMax: number
}

/**
 * Enveloppe extérieure : à somme S, l’étendue ne peut pas dépasser
 * min(49, S − 11, 244 − S). 11 = 15 − 4, 244 = 240 + 4.
 */
export function maxReachableSpread(sum: number) {
  const fromLow = sum - (NUMBER_SUM_AXIS.min - NUMBER_SPREAD_AXIS.min)
  const fromHigh = NUMBER_SUM_AXIS.max + NUMBER_SPREAD_AXIS.min - sum
  return Math.min(NUMBER_SPREAD_AXIS.max, fromLow, fromHigh)
}

/** Sommes où l’enveloppe change de pente : 15, 60, 195, 240. */
export function sumSpreadEnvelopeCorners(): number[] {
  const rise = NUMBER_SUM_AXIS.min + (NUMBER_SPREAD_AXIS.max - NUMBER_SPREAD_AXIS.min)
  const fall = NUMBER_SUM_AXIS.max - (NUMBER_SPREAD_AXIS.max - NUMBER_SPREAD_AXIS.min)
  return [...new Set([NUMBER_SUM_AXIS.min, rise, fall, NUMBER_SUM_AXIS.max])].sort((a, b) => a - b)
}

export function sumSpreadEnvelope(xDomain?: [number, number]): SumSpreadEnvelopePoint[] {
  const corners = sumSpreadEnvelopeCorners()
  const sums = new Set(corners)
  if (xDomain) {
    sums.add(xDomain[0])
    sums.add(xDomain[1])
  }
  const lo = xDomain?.[0] ?? NUMBER_SUM_AXIS.min
  const hi = xDomain?.[1] ?? NUMBER_SUM_AXIS.max
  return [...sums]
    .filter((sum) => sum >= lo && sum <= hi)
    .sort((a, b) => a - b)
    .map((sum) => ({ sum, spreadMax: maxReachableSpread(sum) }))
}

export function recencyUnit(date: string, fromDate: string, toDate: string) {
  if (!fromDate || !toDate || fromDate === toDate) return 1
  const start = Date.parse(`${fromDate}T12:00:00Z`)
  const end = Date.parse(`${toDate}T12:00:00Z`)
  const at = Date.parse(`${date}T12:00:00Z`)
  if (!Number.isFinite(start) || !Number.isFinite(end) || end === start) return 1
  return Math.min(1, Math.max(0, (at - start) / (end - start)))
}

export function weekdayHue(weekday: string | undefined) {
  if (weekday === "vendredi") return "var(--chart-4)"
  if (weekday === "mardi") return "var(--chart-2)"
  return "var(--chart-3)"
}

/** Teinte du jour, délavée vers muted pour les tirages anciens. */
export function recencyFill(recency: number, weekday?: string) {
  const t = Math.min(1, Math.max(0, recency))
  const pct = Math.round(16 + t * 84)
  return `color-mix(in oklab, ${weekdayHue(weekday)} ${pct}%, var(--muted))`
}

export function padDomain(
  values: number[],
  theoretical: { min: number; max: number },
  pad: number
): [number, number] {
  if (!values.length) return [theoretical.min, theoretical.max]
  const lo = Math.min(...values)
  const hi = Math.max(...values)
  let min = Math.max(theoretical.min, lo - pad)
  let max = Math.min(theoretical.max, hi + pad)
  if (min >= max) {
    min = Math.max(theoretical.min, min - pad)
    max = Math.min(theoretical.max, max + pad)
  }
  if (min >= max) return [theoretical.min, theoretical.max]
  return [min, max]
}

export function sumSpreadDomains(
  cells: SumSpreadCell[],
  scale: SumSpreadScale
): { x: [number, number]; y: [number, number] } {
  if (scale === "universe" || cells.length === 0) {
    return {
      x: [NUMBER_SUM_AXIS.min, NUMBER_SUM_AXIS.max],
      y: [NUMBER_SPREAD_AXIS.min, NUMBER_SPREAD_AXIS.max],
    }
  }
  return {
    x: padDomain(
      cells.map((cell) => cell.sum),
      NUMBER_SUM_AXIS,
      8
    ),
    y: padDomain(
      cells.map((cell) => cell.spread),
      NUMBER_SPREAD_AXIS,
      2
    ),
  }
}

export function domainContains(domain: [number, number], value: number) {
  return domain[0] <= value && value <= domain[1]
}

export function sumSpreadCloud(draws: SumSpreadDraw[]): SumSpreadCloud {
  const map = new Map<string, SumSpreadCell>()
  let sumAcc = 0
  let spreadAcc = 0
  let drawCount = 0
  let firstDate = ""
  let lastDate = ""
  let lastKey = ""

  for (const draw of draws) {
    if (draw.numbers.length < 2) continue
    const sum = draw.numbers.reduce((a, b) => a + b, 0)
    const spread = spreadOf(draw.numbers)
    const weekday = draw.weekday
    const key = `${sum}:${spread}:${weekday ?? ""}`
    const cur = map.get(key)
    if (cur) {
      cur.count += 1
      cur.dates.push(draw.date)
      if (draw.date >= cur.lastDate) cur.lastDate = draw.date
    } else {
      map.set(key, {
        sum,
        spread,
        count: 1,
        dates: [draw.date],
        lastDate: draw.date,
        weekday,
        recency: 1,
      })
    }
    sumAcc += sum
    spreadAcc += spread
    drawCount += 1
    if (!firstDate || draw.date < firstDate) firstDate = draw.date
    if (draw.date >= lastDate) {
      lastDate = draw.date
      lastKey = key
    }
  }

  const cells = [...map.values()]
    .map((cell) => ({
      ...cell,
      recency: recencyUnit(cell.lastDate, firstDate, lastDate),
    }))
    .sort(
      (a, b) => a.sum - b.sum || a.spread - b.spread || (a.weekday ?? "").localeCompare(b.weekday ?? "")
    )
  const last =
    cells.find((cell) => `${cell.sum}:${cell.spread}:${cell.weekday ?? ""}` === lastKey) ?? null
  return {
    cells,
    last,
    drawCount,
    fromDate: firstDate || null,
    toDate: lastDate || null,
    meanSum: drawCount ? sumAcc / drawCount : null,
    meanSpread: drawCount ? spreadAcc / drawCount : null,
  }
}

export function cellsByWeekday(cells: SumSpreadCell[]) {
  const mardi: SumSpreadCell[] = []
  const vendredi: SumSpreadCell[] = []
  const other: SumSpreadCell[] = []
  for (const cell of cells) {
    if (cell.weekday === "mardi") mardi.push(cell)
    else if (cell.weekday === "vendredi") vendredi.push(cell)
    else other.push(cell)
  }
  return { mardi, vendredi, other }
}
