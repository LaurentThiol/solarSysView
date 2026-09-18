/** Ratio 0–1 of a grid metric against the current peak (hottest / longest delay). */
export function clockRatio(value: number, peak: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(peak) || peak <= 0 || value <= 0) {
    return 0
  }
  return Math.min(1, value / peak)
}

/** Integer percent for `conic-gradient` stops. */
export function clockPercent(value: number, peak: number): number {
  return Math.round(clockRatio(value, peak) * 100)
}

/** Degrees clockwise from 12 o’clock. */
export function clockDegrees(value: number, peak: number): number {
  return clockRatio(value, peak) * 360
}

/**
 * Expected-value tick, only when it sits strictly inside the clock.
 * A tick at 0 or 12 o’clock would be invisible or look like a full fill.
 */
export function clockMarkRatio(expected: number, peak: number): number | null {
  const t = clockRatio(expected, peak)
  if (t <= 0 || t >= 1) return null
  return t
}

export function heatClockFace(value: number, peak: number): string {
  const pct = clockPercent(value, peak)
  if (pct <= 0) return "var(--heat-clock-well)"
  if (pct >= 100) return "var(--heat-clock-pie)"
  return `conic-gradient(from -90deg, var(--heat-clock-pie) ${pct}%, var(--heat-clock-well) 0)`
}

export function heatClockRim(even: boolean): string {
  return even ? "var(--chart-1)" : "var(--chart-2)"
}
