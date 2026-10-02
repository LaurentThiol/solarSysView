/**
 * Proximité des boules 1–50 lue sur les tirages de la fenêtre,
 * du plus récent (rang 0, poids n) au plus ancien (poids 1).
 * Chaque chiffre vient des co-sorties observées.
 */

export const BALL_MIN = 1
export const BALL_MAX = 50
export const COUPLE_EDGE_LIMIT = 40

export const NEXT_WINDOW_PRESETS = [
  "last_20",
  "last_50",
  "last_100",
  "last_200",
  "year",
  "year_n1",
] as const

export type NextWindowPreset = (typeof NEXT_WINDOW_PRESETS)[number]

export function isNextWindowPreset(value: string | null | undefined): value is NextWindowPreset {
  return Boolean(value && (NEXT_WINDOW_PRESETS as readonly string[]).includes(value))
}

export type CoupleDraw = {
  date: string
  numbers: readonly number[]
}

export type CoupleLink = {
  a: number
  b: number
  count: number
  affinity: number
  /** Rang inverse de la co-sortie la plus récente. 0 = tirage le plus récent. */
  ago: number
  /** Dates de co-sortie, de la plus récente à la plus ancienne. */
  dates: string[]
}

export type BallPoint = {
  ball: number
  x: number
  y: number
  z: number
  appearances: number
}

export type CoupleReading = {
  date: string
  numbers: number[]
}

export type CoupleSchema = {
  drawCount: number
  newest: string | null
  oldest: string | null
  reading: CoupleReading[]
  links: CoupleLink[]
  edges: CoupleLink[]
  points: BallPoint[]
  stress: number | null
}

type PairAcc = {
  a: number
  b: number
  count: number
  affinity: number
  ago: number
  dates: string[]
}

/** Poids du rang inverse : le plus récent pèse n, le plus ancien pèse 1. */
export function coupleRankWeight(rank: number, drawCount: number): number {
  if (!Number.isInteger(drawCount) || drawCount <= 0) return 0
  if (!Number.isInteger(rank) || rank < 0 || rank >= drawCount) return 0
  return drawCount - rank
}

export function formatCoupleAgo(ago: number): string {
  const n = Number.isFinite(ago) ? Math.max(0, Math.trunc(ago)) : 0
  return `il y a ${n} tirage${n > 1 ? "s" : ""}`
}

export function formatCoupleReading(schema: Pick<CoupleSchema, "drawCount" | "newest" | "oldest">): string {
  if (!schema.drawCount || !schema.newest || !schema.oldest) return "Aucun tirage dans cette fenêtre."
  const noun = schema.drawCount > 1 ? "tirages" : "tirage"
  return `${schema.drawCount} ${noun} · du ${schema.newest} vers ${schema.oldest}`
}

export function linksTouching(links: readonly CoupleLink[], ball: number): CoupleLink[] {
  return links.filter((link) => link.a === ball || link.b === ball)
}

export function partnerOf(link: CoupleLink, ball: number): number {
  return link.a === ball ? link.b : link.a
}

export const COUPLE_SORT_KEYS = ["pair", "count", "weight", "ago"] as const

export type CoupleSortKey = (typeof COUPLE_SORT_KEYS)[number]
export type CoupleSortDir = "asc" | "desc"

/** Premier clic : numéros et ancienneté croissants, compte et poids décroissants. */
export function defaultCoupleSortDir(key: CoupleSortKey): CoupleSortDir {
  return key === "pair" || key === "ago" ? "asc" : "desc"
}

function coupleSortPrimary(link: CoupleLink, key: CoupleSortKey): number {
  if (key === "count") return link.count
  if (key === "weight") return link.affinity
  if (key === "ago") return link.ago
  return 0
}

/**
 * Tri d’une colonne du tableau Couples.
 * À égalité : plus fort poids, puis plus grand compte, puis plus petit couple.
 */
export function compareCoupleLinks(
  left: CoupleLink,
  right: CoupleLink,
  key: CoupleSortKey,
  dir: CoupleSortDir
): number {
  const sign = dir === "asc" ? 1 : -1
  const primary =
    key === "pair"
      ? left.a - right.a || left.b - right.b
      : coupleSortPrimary(left, key) - coupleSortPrimary(right, key)
  if (primary !== 0) return primary * sign
  return right.affinity - left.affinity || right.count - left.count || left.a - right.a || left.b - right.b
}

export function sortCoupleLinks(
  links: readonly CoupleLink[],
  key: CoupleSortKey,
  dir: CoupleSortDir
): CoupleLink[] {
  return [...links].sort((left, right) => compareCoupleLinks(left, right, key, dir))
}

function ballsOf(numbers: readonly number[] | undefined): number[] {
  if (!numbers) return []
  const seen = new Set<number>()
  const out: number[] = []
  for (const value of numbers) {
    if (!Number.isInteger(value) || value < BALL_MIN || value > BALL_MAX || seen.has(value)) continue
    seen.add(value)
    out.push(value)
  }
  out.sort((left, right) => left - right)
  return out
}

function pairKey(a: number, b: number): string {
  return a < b ? `${a}-${b}` : `${b}-${a}`
}

/**
 * MDS classique : double centrage des distances au carré, puis les axes
 * de plus grande valeur propre. `stress` est le stress de Kruskal sur ces axes.
 */
export function classicalMds(
  distances: readonly (readonly number[])[],
  dimensions = 3
): { coords: number[][]; stress: number } {
  const n = distances.length
  const dims = Math.max(1, dimensions)
  if (n === 0) return { coords: [], stress: 0 }
  if (n === 1) return { coords: [Array(dims).fill(0)], stress: 0 }

  const d2 = Array.from({ length: n }, () => Array<number>(n).fill(0))
  for (let i = 0; i < n; i += 1) {
    for (let j = i + 1; j < n; j += 1) {
      const raw = ((distances[i]?.[j] ?? 1) + (distances[j]?.[i] ?? distances[i]?.[j] ?? 1)) / 2
      const dist = Number.isFinite(raw) ? Math.max(0, raw) : 1
      const squared = dist * dist
      d2[i][j] = squared
      d2[j][i] = squared
    }
  }

  const rowMean = d2.map((row) => row.reduce((sum, value) => sum + value, 0) / n)
  const grand = rowMean.reduce((sum, value) => sum + value, 0) / n
  const gram = Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) => -0.5 * (d2[i][j] - rowMean[i] - rowMean[j] + grand))
  )

  const { values, vectors } = jacobiEigen(gram)
  const order = values
    .map((value, index) => ({ value, index }))
    .sort((left, right) => right.value - left.value)

  const coords = Array.from({ length: n }, () => Array<number>(dims).fill(0))
  for (let axis = 0; axis < dims; axis += 1) {
    const picked = order[axis]
    if (!picked || picked.value <= 1e-12) continue
    const scale = Math.sqrt(picked.value)
    let pivot = 0
    let pivotAbs = 0
    for (let row = 0; row < n; row += 1) {
      const mag = Math.abs(vectors[row][picked.index])
      if (mag > pivotAbs) {
        pivotAbs = mag
        pivot = row
      }
    }
    const sign = vectors[pivot][picked.index] < 0 ? -1 : 1
    for (let row = 0; row < n; row += 1) {
      coords[row][axis] = sign * scale * vectors[row][picked.index]
    }
  }

  return { coords, stress: kruskalStress(distances, coords) }
}

export function coupleSchema(
  draws: readonly CoupleDraw[],
  edgeLimit = COUPLE_EDGE_LIMIT
): CoupleSchema {
  const readingDraws = draws
    .map((draw, index) => ({ draw, index }))
    .sort(
      (left, right) =>
        right.draw.date.localeCompare(left.draw.date) || left.index - right.index
    )
    .map((item) => item.draw)

  const n = readingDraws.length
  const reading: CoupleReading[] = []
  const pairs = new Map<string, PairAcc>()
  const appearances = Array<number>(BALL_MAX + 1).fill(0)

  for (let rank = 0; rank < n; rank += 1) {
    const draw = readingDraws[rank]
    const numbers = ballsOf(draw.numbers)
    reading.push({ date: draw.date, numbers })
    const weight = coupleRankWeight(rank, n)
    for (const ball of numbers) appearances[ball] += 1
    for (let i = 0; i < numbers.length; i += 1) {
      for (let j = i + 1; j < numbers.length; j += 1) {
        const a = numbers[i]
        const b = numbers[j]
        const key = pairKey(a, b)
        const acc = pairs.get(key)
        if (acc) {
          acc.count += 1
          acc.affinity += weight
          acc.dates.push(draw.date)
        } else {
          pairs.set(key, {
            a,
            b,
            count: 1,
            affinity: weight,
            ago: rank,
            dates: [draw.date],
          })
        }
      }
    }
  }

  const links = sortCoupleLinks([...pairs.values()], "weight", "desc")
  const limit = Number.isFinite(edgeLimit) ? Math.max(0, Math.trunc(edgeLimit)) : COUPLE_EDGE_LIMIT
  const edges = links.slice(0, limit)

  if (n === 0) {
    return {
      drawCount: 0,
      newest: null,
      oldest: null,
      reading,
      links,
      edges,
      points: [],
      stress: null,
    }
  }

  const size = BALL_MAX - BALL_MIN + 1
  const distances = Array.from({ length: size }, () => Array<number>(size).fill(1))
  for (let i = 0; i < size; i += 1) distances[i][i] = 0
  for (const link of links) {
    const i = link.a - BALL_MIN
    const j = link.b - BALL_MIN
    const dist = 1 / (1 + link.affinity)
    distances[i][j] = dist
    distances[j][i] = dist
  }

  const embedded = classicalMds(distances, 3)
  const points: BallPoint[] = []
  for (let ball = BALL_MIN; ball <= BALL_MAX; ball += 1) {
    const coord = embedded.coords[ball - BALL_MIN] ?? [0, 0, 0]
    points.push({
      ball,
      x: coord[0] ?? 0,
      y: coord[1] ?? 0,
      z: coord[2] ?? 0,
      appearances: appearances[ball] ?? 0,
    })
  }

  return {
    drawCount: n,
    newest: reading[0]?.date ?? null,
    oldest: reading[n - 1]?.date ?? null,
    reading,
    links,
    edges,
    points,
    stress: embedded.stress,
  }
}

export function pointDistance(left: BallPoint, right: BallPoint): number {
  return Math.hypot(left.x - right.x, left.y - right.y, left.z - right.z)
}

function kruskalStress(distances: readonly (readonly number[])[], coords: readonly (readonly number[])[]): number {
  const n = Math.min(distances.length, coords.length)
  let numerator = 0
  let denominator = 0
  for (let i = 0; i < n; i += 1) {
    for (let j = i + 1; j < n; j += 1) {
      const raw = distances[i]?.[j]
      const target = Number.isFinite(raw) ? Math.max(0, raw as number) : 1
      let squared = 0
      const left = coords[i]
      const right = coords[j]
      const dims = Math.min(left?.length ?? 0, right?.length ?? 0)
      for (let axis = 0; axis < dims; axis += 1) {
        const delta = (left?.[axis] ?? 0) - (right?.[axis] ?? 0)
        squared += delta * delta
      }
      const hat = Math.sqrt(squared)
      const gap = target - hat
      numerator += gap * gap
      denominator += target * target
    }
  }
  if (denominator === 0) return 0
  return Math.sqrt(numerator / denominator)
}

/** Décomposition d’une matrice symétrique. Les colonnes de `vectors` sont les vecteurs propres. */
function jacobiEigen(matrix: number[][]): { values: number[]; vectors: number[][] } {
  const n = matrix.length
  const a = matrix.map((row) => row.slice())
  const vectors = Array.from({ length: n }, (_, row) => {
    const line = Array<number>(n).fill(0)
    line[row] = 1
    return line
  })

  const sweeps = Math.max(12, n)
  for (let sweep = 0; sweep < sweeps; sweep += 1) {
    let off = 0
    for (let p = 0; p < n; p += 1) {
      for (let q = p + 1; q < n; q += 1) off += a[p][q] * a[p][q]
    }
    if (off < 1e-18) break
    for (let p = 0; p < n - 1; p += 1) {
      for (let q = p + 1; q < n; q += 1) {
        const apq = a[p][q]
        if (Math.abs(apq) < 1e-15) continue
        const app = a[p][p]
        const aqq = a[q][q]
        const tau = (aqq - app) / (2 * apq)
        const t =
          tau === 0 ? 1 : Math.sign(tau) / (Math.abs(tau) + Math.sqrt(1 + tau * tau))
        const c = 1 / Math.sqrt(1 + t * t)
        const s = t * c
        a[p][p] = c * c * app - 2 * s * c * apq + s * s * aqq
        a[q][q] = s * s * app + 2 * s * c * apq + c * c * aqq
        a[p][q] = 0
        a[q][p] = 0
        for (let k = 0; k < n; k += 1) {
          if (k === p || k === q) continue
          const aik = a[k][p]
          const akq = a[k][q]
          const nextP = c * aik - s * akq
          const nextQ = s * aik + c * akq
          a[k][p] = nextP
          a[p][k] = nextP
          a[k][q] = nextQ
          a[q][k] = nextQ
        }
        for (let k = 0; k < n; k += 1) {
          const vip = vectors[k][p]
          const viq = vectors[k][q]
          vectors[k][p] = c * vip - s * viq
          vectors[k][q] = s * vip + c * viq
        }
      }
    }
  }

  return { values: a.map((row, index) => row[index]), vectors }
}
