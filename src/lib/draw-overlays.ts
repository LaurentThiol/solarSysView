import { bollinger } from "./analysis"

/** SMA / Bollinger window used on the Évolution chart. */
export function overlayPeriodFor(length: number): number {
  if (length >= 40) return 10
  if (length >= 10) return 5
  return 0
}

export type OverlayKind =
  | "sma"
  | "bbUpper"
  | "bbLower"
  | "bbBase"
  | "bbSpan"
  | "pctB"
  | "smaAbs"
  | "bbUpperAbs"
  | "bbLowerAbs"

export function overlayField(seriesKey: string, kind: OverlayKind): string {
  return `${kind}_${seriesKey}`
}

export function isOverlayDataKey(dataKey: string): boolean {
  return /^(smaAbs|sma|bbUpperAbs|bbLowerAbs|bbUpper|bbLower|bbBase|bbSpan|pctB)_/.test(
    dataKey
  )
}

export type BandPoint = {
  sma: number | null
  upper: number | null
  lower: number | null
  percentB: number | null
}

export function overlayBands(
  values: number[],
  period: number,
  k = 2
): BandPoint[] {
  const empty = (): BandPoint => ({
    sma: null,
    upper: null,
    lower: null,
    percentB: null,
  })
  if (period <= 0 || period > values.length) {
    return values.map(empty)
  }
  const bands = bollinger(values, period, k)
  return values.map((value, i) => {
    const sma = bands.middle[i]
    const upper = bands.upper[i]
    const lower = bands.lower[i]
    let percentB: number | null = null
    if (upper != null && lower != null) {
      const span = upper - lower
      percentB = span === 0 ? 0.5 : (value - lower) / span
    }
    return { sma: sma ?? null, upper, lower, percentB }
  })
}

export function mapBandPoint(
  band: BandPoint,
  map: (value: number) => number
): BandPoint {
  return {
    sma: band.sma == null ? null : map(band.sma),
    upper: band.upper == null ? null : map(band.upper),
    lower: band.lower == null ? null : map(band.lower),
    percentB: band.percentB,
  }
}

export function overlayRecord(
  seriesKey: string,
  chartBand: BandPoint,
  absBand: BandPoint = chartBand
): Record<string, number | null> {
  const lower = chartBand.lower
  const upper = chartBand.upper
  return {
    [overlayField(seriesKey, "sma")]: chartBand.sma,
    [overlayField(seriesKey, "bbUpper")]: upper,
    [overlayField(seriesKey, "bbLower")]: lower,
    [overlayField(seriesKey, "bbBase")]: lower,
    [overlayField(seriesKey, "bbSpan")]:
      upper == null || lower == null ? null : upper - lower,
    [overlayField(seriesKey, "pctB")]: absBand.percentB,
    [overlayField(seriesKey, "smaAbs")]: absBand.sma,
    [overlayField(seriesKey, "bbUpperAbs")]: absBand.upper,
    [overlayField(seriesKey, "bbLowerAbs")]: absBand.lower,
  }
}

export function bandExcursions(
  values: number[],
  bands: BandPoint[]
): { outside: number; ready: number } {
  let outside = 0
  let ready = 0
  for (let i = 0; i < values.length; i += 1) {
    const band = bands[i]
    if (band.upper == null || band.lower == null) continue
    ready += 1
    if (values[i] > band.upper || values[i] < band.lower) outside += 1
  }
  return { outside, ready }
}

export function readOverlay(
  point: Record<string, unknown> | undefined,
  seriesKey: string,
  kind: OverlayKind
): number | null {
  if (!point) return null
  const value = point[overlayField(seriesKey, kind)]
  return typeof value === "number" && Number.isFinite(value) ? value : null
}
