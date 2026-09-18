/** Full clock = 2× expected when known; otherwise the grid peak (delay mode). */
export function clockScale(peak: number, expected?: number): number {
  if (Number.isFinite(expected) && (expected as number) > 0) return 2 * (expected as number)
  if (Number.isFinite(peak) && peak > 0) return peak
  return 0
}

/** Past a full turn (strictly above 2× expected). */
export function clockOverheat(value: number, expected?: number): boolean {
  if (!Number.isFinite(value) || !Number.isFinite(expected) || (expected as number) <= 0) {
    return false
  }
  return value > 2 * (expected as number)
}

/** Ratio 0–1 of a grid metric against the clock scale. */
export function clockRatio(value: number, scale: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(scale) || scale <= 0 || value <= 0) {
    return 0
  }
  return Math.min(1, value / scale)
}

/** Integer percent for `conic-gradient` stops. */
export function clockPercent(value: number, scale: number): number {
  return Math.round(clockRatio(value, scale) * 100)
}

/** Degrees clockwise from 12 o’clock. */
export function clockDegrees(value: number, scale: number): number {
  return clockRatio(value, scale) * 360
}

/**
 * Expected-value tick, only when it sits strictly inside the clock.
 * On the 2× scale that is always 6 o’clock.
 */
export function clockMarkRatio(expected: number, scale: number): number | null {
  const t = clockRatio(expected, scale)
  if (t <= 0 || t >= 1) return null
  return t
}

export function heatClockFace(value: number, scale: number, overheat = false): string {
  if (overheat) return "var(--heat-clock-hot)"
  const pct = clockPercent(value, scale)
  if (pct <= 0) return "var(--heat-clock-well)"
  if (pct >= 100) return "var(--heat-clock-pie)"
  return `conic-gradient(from -90deg, var(--heat-clock-pie) ${pct}%, var(--heat-clock-well) 0)`
}

export function heatClockRim(even: boolean): string {
  return even ? "var(--chart-1)" : "var(--chart-2)"
}
