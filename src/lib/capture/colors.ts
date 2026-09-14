export const UNSAFE_COLOR = /oklch|oklab|lab\(|lch\(|color\(/i

export function isUnsafeColor(value: string) {
  return UNSAFE_COLOR.test(value)
}

/**
 * Pick a canvas-safe paint value. Never fall back to the page background:
 * that used to paint Recharts strokes in the same colour as the card, so the
 * curve vanished from the capture.
 */
export function resolvePaintColor(
  specified: string,
  used: string | undefined,
  toRgb: (css: string) => string | null
): string | null {
  const tryOne = (value: string | undefined): string | null => {
    if (!value) return null
    const trimmed = value.trim()
    if (!trimmed) return null
    if (trimmed === "none" || trimmed === "transparent" || trimmed.startsWith("url(")) {
      return trimmed
    }
    if (!isUnsafeColor(trimmed) && !trimmed.includes("var(")) return trimmed
    const rgb = toRgb(trimmed)
    if (rgb && !isUnsafeColor(rgb) && !rgb.includes("var(")) return rgb
    return null
  }
  return tryOne(used) ?? tryOne(specified)
}
