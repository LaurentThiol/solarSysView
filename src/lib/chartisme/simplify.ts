// Réduction du tracé qui garde l'esprit du mouvement.
//
// Jumeau de `synchro/chartisme/simplify.py`. Mêmes indices d'origine, mêmes
// départages (plus petite aire, puis plus petit indice), même demi-fenêtre
// entière pour l'étendue locale. Visvalingam–Whyatt construit la pyramide,
// Ramer–Douglas–Peucker sert les polylignes, LTTB ne sert que l'affichage.

export const DEFAULT_TAUS = [0.015, 0.04, 0.09] as const
export const DEFAULT_TAU = 0.04

export const FLAT_GRADE = 0.12
export const STEEP_GRADE = 0.35

export type SpinePivot = {
  index: number
  date: string | null
  price: number
  type: "H" | "L"
  saliency: number
}

export type SpineLevel = {
  tau: number
  variable: boolean
  indices: number[]
  areas: number[]
  pivots: SpinePivot[]
}

export function seriesSpan(values: number[]) {
  if (!values.length) return 0
  return Math.max(...values) - Math.min(...values)
}

/** Aire de la fenêtre : amplitude × durée, en indices d'origine. */
export function windowArea(values: number[]) {
  if (values.length < 2) return 0
  return seriesSpan(values) * (values.length - 1)
}

/** Demi-fenêtre de l'étendue locale. Entière, pour que les deux jumeaux coïncident. */
export function localRadius(count: number) {
  if (count < 2) return 0
  return Math.max(2, Math.floor((count - 1) / 8))
}

export function localExtent(values: number[], index: number, radius?: number) {
  if (!values.length) return 0
  const rad = radius ?? localRadius(values.length)
  const lo = Math.max(0, index - rad)
  const hi = Math.min(values.length, index + rad + 1)
  let loV = values[lo]
  let hiV = values[lo]
  for (let cursor = lo + 1; cursor < hi; cursor += 1) {
    const value = values[cursor]
    if (value < loV) loV = value
    if (value > hiV) hiV = value
  }
  return hiV - loV
}

function triangleArea(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number
) {
  return Math.abs((ax - bx) * (cy - by) - (cx - bx) * (ay - by)) * 0.5
}

/**
 * Aire effective de chaque point. Les extrémités ne partent pas.
 * L'aire retirée est reportée sur les voisins s'ils paraîtraient moins
 * importants : la pyramide reste monotone.
 */
export function visvalingamAreas(values: number[]): number[] {
  const ys = values.map(Number)
  const count = ys.length
  if (count === 0) return []
  const areas = ys.map(() => Number.POSITIVE_INFINITY)
  if (count < 3) return areas
  const prev = [-1, ...ys.slice(0, -1).map((_, index) => index)]
  const next = [...ys.slice(1).map((_, index) => index + 1), -1]

  const tri = (index: number) => {
    const left = prev[index]
    const right = next[index]
    if (left < 0 || right < 0) return Number.POSITIVE_INFINITY
    return triangleArea(left, ys[left], index, ys[index], right, ys[right])
  }

  for (let index = 1; index < count - 1; index += 1) areas[index] = tri(index)

  let alive = count
  while (alive > 2) {
    let best = -1
    let bestArea = Number.POSITIVE_INFINITY
    for (let index = 1; index < count - 1; index += 1) {
      if (prev[index] < 0 || next[index] < 0) continue
      const area = areas[index]
      if (area < bestArea || (area === bestArea && (best < 0 || index < best))) {
        best = index
        bestArea = area
      }
    }
    if (best < 0) break
    const removed = areas[best]
    const left = prev[best]
    const right = next[best]
    next[left] = right
    prev[right] = left
    prev[best] = -1
    next[best] = -1
    alive -= 1
    for (const neighbor of [left, right]) {
      if (neighbor <= 0 || neighbor >= count - 1) continue
      if (prev[neighbor] < 0 || next[neighbor] < 0) continue
      let recomputed = tri(neighbor)
      if (recomputed < removed) recomputed = removed
      areas[neighbor] = recomputed
    }
  }
  areas[0] = Number.POSITIVE_INFINITY
  areas[count - 1] = Number.POSITIVE_INFINITY
  return areas
}

function requiredArea(
  values: number[],
  index: number,
  tau: number,
  variable: boolean,
  area: number,
  span: number
) {
  if (!variable || span <= 0) return tau * area
  const ratio = localExtent(values, index) / span
  return tau * area * ratio * ratio
}

/** Indices survivant à la coupe `τ`. Les bouts restent. */
export function cutIndices(
  values: number[],
  areas?: number[] | null,
  tau = DEFAULT_TAU,
  options: { variable?: boolean } = {}
) {
  const ys = values.map(Number)
  const count = ys.length
  if (count === 0) return []
  if (count <= 2) return ys.map((_, index) => index)
  const span = seriesSpan(ys)
  if (span <= 0) return [0, count - 1]
  const computed = areas ?? visvalingamAreas(ys)
  const variable = options.variable ?? true
  const total = windowArea(ys)
  const kept: number[] = []
  for (let index = 0; index < count; index += 1) {
    const importance = computed[index]
    if (index === 0 || index === count - 1 || !Number.isFinite(importance)) {
      kept.push(index)
      continue
    }
    if (importance >= requiredArea(ys, index, tau, variable, total, span)) kept.push(index)
  }
  return kept
}

/** Aire effective rapportée à l'aire de la fenêtre. Les bouts valent 1. */
export function saliencyOf(values: number[], areas?: number[] | null) {
  const ys = values.map(Number)
  if (!ys.length) return []
  const computed = areas ?? visvalingamAreas(ys)
  const total = windowArea(ys)
  return computed.map((importance) =>
    total <= 0 || !Number.isFinite(importance) ? 1 : importance / total
  )
}

function alternate(values: number[], indices: number[]) {
  const chosen = indices.map((index) => index)
  const labeled: Array<[number, "H" | "L"]> = []
  const last = chosen.length - 1
  for (let pos = 0; pos < chosen.length; pos += 1) {
    const index = chosen[pos]
    const y = values[index]
    let kind: "H" | "L" | null
    if (pos === 0) kind = last < 0 || y >= values[chosen[1]] ? "H" : "L"
    else if (pos === last) kind = y >= values[chosen[pos - 1]] ? "H" : "L"
    else {
      const left = values[chosen[pos - 1]]
      const right = values[chosen[pos + 1]]
      if (y >= left && y >= right && (y > left || y > right)) kind = "H"
      else if (y <= left && y <= right && (y < left || y < right)) kind = "L"
      else kind = null
    }
    if (kind == null) continue
    const previous = labeled[labeled.length - 1]
    if (previous && previous[1] === kind) {
      const prev = previous[0]
      if (kind === "H" && y >= values[prev]) labeled[labeled.length - 1] = [index, kind]
      else if (kind === "L" && y <= values[prev]) labeled[labeled.length - 1] = [index, kind]
      continue
    }
    labeled.push([index, kind])
  }
  return labeled
}

export function spinePivots(
  values: number[],
  indices: number[],
  options: { saliency?: number[] | null; dates?: Array<string | null> | null } = {}
): SpinePivot[] {
  const ys = values.map(Number)
  const weights = options.saliency ?? saliencyOf(ys)
  let labels = options.dates ? [...options.dates] : ys.map(() => null)
  if (labels.length !== ys.length) labels = ys.map(() => null)
  return alternate(ys, indices).map(([index, kind]) => ({
    index,
    date: labels[index],
    price: ys[index],
    type: kind,
    saliency: index < weights.length ? weights[index] : 0,
  }))
}

export function simplify(
  values: number[],
  tau = DEFAULT_TAU,
  options: { variable?: boolean; dates?: Array<string | null> | null } = {}
): SpineLevel {
  const ys = values.map(Number)
  const areas = visvalingamAreas(ys)
  const variable = options.variable ?? true
  const indices = cutIndices(ys, areas, tau, { variable })
  const weights = saliencyOf(ys, areas)
  return {
    tau,
    variable,
    indices,
    areas: weights,
    pivots: spinePivots(ys, indices, { saliency: weights, dates: options.dates }),
  }
}

/** La même élimination, coupée à chaque tolérance. */
export function pyramid(
  values: number[],
  taus: ArrayLike<number> = DEFAULT_TAUS,
  options: { variable?: boolean; dates?: Array<string | null> | null } = {}
): SpineLevel[] {
  const ys = values.map(Number)
  const areas = visvalingamAreas(ys)
  const weights = saliencyOf(ys, areas)
  const variable = options.variable ?? true
  const levels: SpineLevel[] = []
  for (const tau of Array.from(taus)) {
    const indices = cutIndices(ys, areas, tau, { variable })
    levels.push({
      tau,
      variable,
      indices,
      areas: weights,
      pivots: spinePivots(ys, indices, { saliency: weights, dates: options.dates }),
    })
  }
  return levels
}

function perpDistance(
  index: number,
  y: number,
  left: number,
  yLeft: number,
  right: number,
  yRight: number
) {
  const dx = right - left
  const dy = yRight - yLeft
  const denom = Math.hypot(dx, dy)
  if (denom === 0) return Math.abs(y - yLeft)
  return Math.abs(dy * index - dx * y + right * yLeft - yRight * left) / denom
}

/** Ramer–Douglas–Peucker. `τ` est une fraction de l'amplitude. */
export function rdpIndices(values: number[], tau = DEFAULT_TAU) {
  const ys = values.map(Number)
  const count = ys.length
  if (count === 0) return []
  if (count <= 2) return ys.map((_, index) => index)
  const span = seriesSpan(ys)
  if (span <= 0) return [0, count - 1]
  const epsilon = tau * span
  const keep = ys.map(() => false)
  keep[0] = true
  keep[count - 1] = true
  const recurse = (left: number, right: number) => {
    if (right <= left + 1) return
    let best = -1
    let bestDist = -1
    for (let index = left + 1; index < right; index += 1) {
      const dist = perpDistance(index, ys[index], left, ys[left], right, ys[right])
      if (dist > bestDist) {
        bestDist = dist
        best = index
      }
    }
    if (best >= 0 && bestDist > epsilon) {
      recurse(left, best)
      keep[best] = true
      recurse(best, right)
    }
  }
  recurse(0, count - 1)
  return keep.flatMap((flagged, index) => (flagged ? [index] : []))
}

/**
 * Largest-Triangle-Three-Buckets, pour un affichage à budget fixe.
 * L'alternance sommet/creux n'y est pas garantie : ce n'est pas l'épine
 * de reconnaissance.
 */
export function lttbIndices(values: number[], k = 15) {
  const ys = values.map(Number)
  const count = ys.length
  if (count === 0 || k <= 0) return []
  if (k >= count || count < 3 || k < 3) {
    if (k >= count) return ys.map((_, index) => index)
    return count > 1 ? [0, count - 1].slice(0, Math.max(k, 1)) : [0]
  }
  const sampled = [0]
  const every = (count - 2) / (k - 2)
  let anchor = 0
  for (let bucket = 0; bucket < k - 2; bucket += 1) {
    let avgStart = Math.floor((bucket + 1) * every) + 1
    let avgEnd = Math.floor((bucket + 2) * every) + 1
    if (avgEnd > count) avgEnd = count
    if (avgStart >= avgEnd) avgStart = Math.max(0, avgEnd - 1)
    const length = avgEnd - avgStart
    if (length <= 0) break
    let avgX = 0
    let avgY = 0
    for (let index = avgStart; index < avgEnd; index += 1) {
      avgX += index
      avgY += ys[index]
    }
    avgX /= length
    avgY /= length
    let rangeStart = Math.floor(bucket * every) + 1
    let rangeEnd = Math.floor((bucket + 1) * every) + 1
    if (rangeEnd > count - 1) rangeEnd = count - 1
    if (rangeStart >= rangeEnd) rangeStart = Math.max(1, rangeEnd - 1)
    let maxArea = -1
    let chosen = rangeStart
    const ax = anchor
    const ay = ys[anchor]
    for (let index = rangeStart; index < rangeEnd; index += 1) {
      const area = Math.abs((ax - avgX) * (ys[index] - ay) - (ax - index) * (avgY - ay))
      if (area > maxArea) {
        maxArea = area
        chosen = index
      }
    }
    if (sampled[sampled.length - 1] !== chosen) sampled.push(chosen)
    anchor = chosen
  }
  if (sampled[sampled.length - 1] !== count - 1) sampled.push(count - 1)
  return sampled
}
