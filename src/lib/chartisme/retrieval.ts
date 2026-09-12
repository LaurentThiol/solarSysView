import { normalizeWindow, resampleValues } from "./svgpath"

/**
 * Jumeau TS de `synchro/chartisme/retrieval.py`.
 *
 * Le point de cette voie est qu'elle marche **avant** tout entraînement : tu
 * dessines une forme, et l'appariement temporel élastique remonte les fenêtres
 * passées qui lui ressemblent, sans un seul poids appris.
 */

export const DEFAULT_LENGTH = 48
export const DEFAULT_BAND = 0.25
export const DEFAULT_TOP = 12

export type IndexEntry = {
  values: number[]
  figure?: string | null
  [key: string]: unknown
}

export type Profiled = IndexEntry & { profile: number[] }

export type Match = Omit<IndexEntry, "profile"> & {
  distance: number
  similarity: number
}

/**
 * Fenêtre → profil comparable : longueur fixe, amplitude ramenée à [0, 1].
 *
 * Sans cette double normalisation, DTW comparerait des niveaux et des durées
 * au lieu de comparer des formes.
 */
export function profile(values: number[], length = DEFAULT_LENGTH): number[] {
  const cleaned = values.filter((v) => v !== null && v !== undefined).map(Number)
  if (cleaned.length < 2) return []
  const resampled = resampleValues(cleaned, length)
  const low = Math.min(...resampled)
  const high = Math.max(...resampled)
  const span = high - low
  if (span <= 0) return new Array(length).fill(0.5)
  return resampled.map((v) => (v - low) / span)
}

/**
 * Distance DTW normalisée, avec bande de Sakoe-Chiba.
 *
 * La bande borne le décalage temporel admis : sans elle, DTW apparie un sommet
 * du début avec un creux de la fin et trouve des ressemblances qui n'en sont
 * pas.
 */
export function dtwDistance(left: number[], right: number[], band = DEFAULT_BAND): number {
  const n = left.length
  const m = right.length
  if (!n || !m) return Infinity
  const width = Math.max(1, Math.trunc(Math.max(n, m) * band))
  let previous = new Array<number>(m + 1).fill(Infinity)
  previous[0] = 0
  for (let i = 1; i <= n; i += 1) {
    const current = new Array<number>(m + 1).fill(Infinity)
    const low = Math.max(1, i - width)
    const high = Math.min(m, i + width)
    for (let j = low; j <= high; j += 1) {
      const cost = Math.abs(left[i - 1] - right[j - 1])
      current[j] = cost + Math.min(previous[j], current[j - 1], previous[j - 1])
    }
    previous = current
  }
  const total = previous[m]
  return Number.isFinite(total) ? total / (n + m) : Infinity
}

export function cosine(left: number[], right: number[]): number {
  let dot = 0
  let leftNorm = 0
  let rightNorm = 0
  const size = Math.min(left.length, right.length)
  for (let i = 0; i < size; i += 1) {
    dot += left[i] * right[i]
    leftNorm += left[i] * left[i]
    rightNorm += right[i] * right[i]
  }
  const norm = Math.sqrt(leftNorm) * Math.sqrt(rightNorm)
  return norm <= 0 ? 0 : dot / norm
}

function round(value: number, digits: number) {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

/** Profils précalculés des fenêtres candidates. */
export function buildIndex(windows: IndexEntry[], length = DEFAULT_LENGTH): Profiled[] {
  const index: Profiled[] = []
  for (const window of windows) {
    const shape = profile(window.values ?? [], length)
    if (!shape.length) continue
    index.push({ ...window, profile: shape })
  }
  return index
}

/** Fenêtres les plus proches du croquis, par DTW. */
export function search(
  query: number[],
  index: Profiled[],
  options: { top?: number; length?: number; band?: number; figure?: string | null } = {}
): Match[] {
  const { top = DEFAULT_TOP, length = DEFAULT_LENGTH, band = DEFAULT_BAND, figure = null } = options
  const shape = profile(query, length)
  if (!shape.length) return []
  const scored: Match[] = []
  for (const entry of index) {
    if (figure !== null && entry.figure !== figure) continue
    const distance = dtwDistance(shape, entry.profile, band)
    if (!Number.isFinite(distance)) continue
    const { profile: _drop, ...rest } = entry
    scored.push({
      ...rest,
      distance: round(distance, 5),
      // Similarité lisible, sans prétention probabiliste.
      similarity: round(1 / (1 + 8 * distance), 4),
    })
  }
  scored.sort((a, b) => a.distance - b.distance)
  return scored.slice(0, top)
}

/**
 * Classement au plus proche voisin — la référence à battre.
 *
 * C'est le classifieur le plus bête qui soit : il ne fait que retrouver les
 * fenêtres semblables et voter. Tout réseau doit faire mieux.
 */
export function classifyByNeighbours(
  query: number[],
  index: Profiled[],
  options: { k?: number; length?: number; band?: number } = {}
) {
  const { k = 5, length = DEFAULT_LENGTH, band = DEFAULT_BAND } = options
  const neighbours = search(query, index, { top: k, length, band })
  if (!neighbours.length) {
    return { figure: null as string | null, confidence: 0, votes: {}, neighbours }
  }
  const votes: Record<string, number> = {}
  neighbours.forEach((neighbour, rank) => {
    const name = String(neighbour.figure ?? "none")
    votes[name] = (votes[name] ?? 0) + 1 / (1 + rank)
  })
  const total = Object.values(votes).reduce((a, b) => a + b, 0) || 1
  const [figure, score] = Object.entries(votes).sort((a, b) => b[1] - a[1])[0]
  return {
    figure,
    confidence: round(score / total, 4),
    votes: Object.fromEntries(
      Object.entries(votes)
        .sort((a, b) => b[1] - a[1])
        .map(([name, v]) => [name, round(v / total, 4)])
    ),
    neighbours,
  }
}

/**
 * Croquis à la souris → série régulière.
 *
 * Le tracé arrive comme une suite de points `(x, y)` non régulièrement
 * espacés, en coordonnées écran où `y` croît vers le bas. On rééchantillonne
 * en abscisse et on retourne l'axe.
 */
export function sketchToValues(points: number[][], length = DEFAULT_LENGTH): number[] {
  const cleaned = points
    .filter((p) => p.length >= 2)
    .map((p) => [Number(p[0]), Number(p[1])] as [number, number])
  if (cleaned.length < 2) return []
  cleaned.sort((a, b) => a[0] - b[0])
  const x0 = cleaned[0][0]
  const x1 = cleaned[cleaned.length - 1][0]
  if (x1 - x0 <= 0) return []
  const out: number[] = []
  let cursor = 0
  for (let i = 0; i < length; i += 1) {
    const x = x0 + ((x1 - x0) * i) / (length - 1)
    while (cursor < cleaned.length - 2 && cleaned[cursor + 1][0] < x) cursor += 1
    const left = cleaned[cursor]
    const right = cleaned[cursor + 1]
    const width = right[0] - left[0]
    const frac = width <= 0 ? 0 : (x - left[0]) / width
    out.push(-(left[1] + (right[1] - left[1]) * frac))
  }
  return out
}

/** Croquis ramené au carré unité, comme une fenêtre de courbe. */
export function normalizeSketch(values: number[]): number[] {
  return normalizeWindow(values).map(([, y]) => y)
}
