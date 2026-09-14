/** Teinte hypsométrique : mer → forêt → or → terre → neige. */

export type Rgb = [number, number, number]

const STOPS: Array<[number, Rgb]> = [
  [0, [42, 86, 128]],
  [0.16, [38, 132, 142]],
  [0.32, [48, 150, 92]],
  [0.48, [142, 168, 52]],
  [0.64, [212, 178, 52]],
  [0.78, [198, 102, 44]],
  [0.9, [226, 210, 188]],
  [1, [248, 250, 252]],
]

export function clamp01(t: number) {
  if (t <= 0) return 0
  if (t >= 1) return 1
  return t
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t
}

export function heightColor(t: number): Rgb {
  const u = clamp01(t)
  let i = 0
  while (i < STOPS.length - 2 && u > STOPS[i + 1][0]) i += 1
  const [t0, c0] = STOPS[i]
  const [t1, c1] = STOPS[i + 1]
  const span = t1 - t0 || 1
  const f = (u - t0) / span
  return [
    lerp(c0[0], c1[0], f),
    lerp(c0[1], c1[1], f),
    lerp(c0[2], c1[2], f),
  ]
}

export function shadeRgb(rgb: Rgb, shade: number): Rgb {
  const s = Math.max(0.18, shade)
  return [rgb[0] * s, rgb[1] * s, rgb[2] * s]
}

export function rgbCss(rgb: Rgb, alpha = 1) {
  const r = Math.round(rgb[0])
  const g = Math.round(rgb[1])
  const b = Math.round(rgb[2])
  if (alpha >= 1) return `rgb(${r}, ${g}, ${b})`
  return `rgba(${r}, ${g}, ${b}, ${clamp01(alpha)})`
}

export function contourInterval(maxH: number) {
  if (maxH <= 0) return 1
  const raw = maxH / 7
  const pow = 10 ** Math.floor(Math.log10(raw))
  const n = raw / pow
  const step = n < 1.5 ? 1 : n < 3.5 ? 2 : n < 7.5 ? 5 : 10
  return step * pow
}
