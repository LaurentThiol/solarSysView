/**
 * Carte lissée du compteur.
 * X est l’index du tirage, pas l’écart de calendrier.
 * Y est le compteur brut.
 * Z : une case par boule. La première colonne range les compteurs.
 * Ensuite chaque compteur du jour est posé une seule fois, là où
 * la somme des écarts aux cases voisines du tirage passé est minimale.
 */

import { resolveWindow } from "@/lib/analysis-window"
import {
  NUMBER_EXPECTED_CHARGE,
  NUMBER_POOL,
  PROBA_SCALES,
  STAR_EXPECTED_CHARGE,
  STAR_POOL,
  observeBand,
  starScaleNote,
  starScaleOpen,
  type ProbaDraw,
  type ProbaKind,
  type ProbaScale,
} from "@/lib/proba-dynamic"

export const MAP_SCALES = ["tout", ...PROBA_SCALES] as const
export type MapScale = (typeof MAP_SCALES)[number]

export const MAP_SCALE_LABELS: Record<MapScale, string> = {
  tout: "Tout",
  last_50: "50",
  last_100: "100",
  last_200: "200",
  year: "Année",
  year_n1: "n−1",
  year_n2: "n−2",
}

/** En dessous, deux coûts sont le même écart. 1/50 reste un vrai écart. */
const COST_TIE = 1e-9
/** À écart égal, le plus petit numéro passe. Trop petit pour changer un vrai écart. */
const BALL_BIAS = 1e-12

export type MapSource = {
  value: number
  series: readonly number[]
}

export type MapCell = {
  ball: number
  charge: number
  /** Somme des écarts absolus aux voisines du tirage passé. 0 sur la graine. */
  cost: number
  /** Valeurs des cases voisines au tirage passé, de gauche à droite. Vide sur la graine. */
  neighbors: number[]
}

export type ProbaMap = {
  scale: MapScale
  kind: ProbaKind
  dates: string[]
  columns: MapCell[][]
  /** Série brute indexée par numéro − 1, pour la dent de scie. */
  series: number[][]
  expected: number
  pool: number
  starsHidden: boolean
  starNote: string | null
}

export function parseMapScale(value: string | null | undefined): MapScale {
  if (value === "tout") return "tout"
  if ((PROBA_SCALES as readonly string[]).includes(value ?? "")) return value as ProbaScale
  return "tout"
}

export function parseMapKind(value: string | null | undefined): ProbaKind {
  return value === "etoiles" ? "star" : "number"
}

/**
 * Affectation de coût minimum (Kuhn–Munkres).
 * `cost` est n×n, ligne = case, colonne = boule. Retourne l’index de boule par case.
 */
function minCostAssign(cost: Float64Array, n: number, slotOf: Int16Array) {
  const u = new Float64Array(n + 1)
  const v = new Float64Array(n + 1)
  const parent = new Int32Array(n + 1)
  const way = new Int32Array(n + 1)
  const minv = new Float64Array(n + 1)
  const used = new Uint8Array(n + 1)

  for (let row = 1; row <= n; row += 1) {
    parent[0] = row
    let column = 0
    minv.fill(Number.POSITIVE_INFINITY)
    used.fill(0)
    do {
      used[column] = 1
      const current = parent[column]
      let delta = Number.POSITIVE_INFINITY
      let next = 0
      for (let candidate = 1; candidate <= n; candidate += 1) {
        if (used[candidate]) continue
        const value = cost[(current - 1) * n + (candidate - 1)] - u[current] - v[candidate]
        if (value < minv[candidate]) {
          minv[candidate] = value
          way[candidate] = column
        }
        if (minv[candidate] < delta) {
          delta = minv[candidate]
          next = candidate
        }
      }
      for (let candidate = 0; candidate <= n; candidate += 1) {
        if (used[candidate]) {
          u[parent[candidate]] += delta
          v[candidate] -= delta
        } else {
          minv[candidate] -= delta
        }
      }
      column = next
    } while (parent[column] !== 0)
    do {
      const previous = way[column]
      parent[column] = parent[previous]
      column = previous
    } while (column !== 0)
  }

  for (let column = 1; column <= n; column += 1) {
    if (parent[column] !== 0) slotOf[parent[column] - 1] = column - 1
  }
}

function drawCountOf(rows: readonly MapSource[]) {
  let count = rows[0]?.series.length ?? 0
  for (const row of rows) count = Math.min(count, row.series.length)
  return count
}

/**
 * Colonnes de la carte, une par tirage, de l’ancien au récent.
 * Chaque colonne a autant de cases que de boules.
 */
export function buildCounterMap(rows: readonly MapSource[]): MapCell[][] {
  const pool = rows.length
  const draws = drawCountOf(rows)
  if (pool === 0 || draws === 0) return []

  const charge = new Float64Array(draws * pool)
  const ballOf = new Uint16Array(pool)
  for (let index = 0; index < pool; index += 1) {
    ballOf[index] = rows[index].value
    const series = rows[index].series
    for (let draw = 0; draw < draws; draw += 1) charge[draw * pool + index] = series[draw] ?? 0
  }

  const order = Array.from({ length: pool }, (_, index) => index)
  order.sort((a, b) => {
    const gap = charge[a] - charge[b]
    if (Math.abs(gap) > COST_TIE) return gap
    return ballOf[a] - ballOf[b]
  })

  const columns: MapCell[][] = []
  const previous = new Float64Array(pool)
  const first: MapCell[] = []
  for (let slot = 0; slot < pool; slot += 1) {
    const index = order[slot]
    const value = charge[index]
    previous[slot] = value
    first.push({ ball: ballOf[index], charge: value, cost: 0, neighbors: [] })
  }
  columns.push(first)

  const matrix = new Float64Array(pool * pool)
  const chosen = new Int16Array(pool)
  for (let draw = 1; draw < draws; draw += 1) {
    const base = draw * pool
    const leftOf = new Float64Array(pool)
    const rightOf = new Float64Array(pool)
    const hasLeft = new Uint8Array(pool)
    const hasRight = new Uint8Array(pool)
    for (let slot = 0; slot < pool; slot += 1) {
      if (slot > 0) {
        leftOf[slot] = previous[slot - 1]
        hasLeft[slot] = 1
      }
      if (slot + 1 < pool) {
        rightOf[slot] = previous[slot + 1]
        hasRight[slot] = 1
      }
      for (let index = 0; index < pool; index += 1) {
        const value = charge[base + index]
        let deviation = Math.abs(value - previous[slot])
        if (hasLeft[slot]) deviation += Math.abs(value - leftOf[slot])
        if (hasRight[slot]) deviation += Math.abs(value - rightOf[slot])
        matrix[slot * pool + index] = deviation + ballOf[index] * BALL_BIAS
      }
    }
    minCostAssign(matrix, pool, chosen)
    const column: MapCell[] = new Array(pool)
    // Figée : une case ne doit pas lire une voisine déjà réassignée sur ce tirage.
    const next = new Float64Array(pool)
    for (let slot = 0; slot < pool; slot += 1) {
      const index = chosen[slot]
      const value = charge[base + index]
      const neighbors = [
        hasLeft[slot] ? leftOf[slot] : null,
        previous[slot],
        hasRight[slot] ? rightOf[slot] : null,
      ].filter((item): item is number => item != null)
      let deviation = 0
      for (const neighbor of neighbors) deviation += Math.abs(value - neighbor)
      column[slot] = { ball: ballOf[index], charge: value, cost: deviation, neighbors }
      next[slot] = value
    }
    previous.set(next)
    columns.push(column)
  }

  return columns
}

function windowOf(draws: readonly ProbaDraw[], scale: MapScale) {
  const ordered = [...draws].sort((a, b) => a.date.localeCompare(b.date))
  if (scale === "tout") {
    const pools = [
      ...new Set(ordered.map((draw) => draw.star_pool).filter((pool): pool is number => pool != null)),
    ].sort((a, b) => a - b)
    return {
      history: [] as ProbaDraw[],
      work: ordered,
      pools,
      broken: pools.length > 1,
    }
  }
  const resolved = resolveWindow(ordered, { preset: scale, warmup: 0 })
  const history = resolved.fromDate ? ordered.filter((draw) => draw.date < resolved.fromDate!) : []
  return {
    history,
    work: resolved.work,
    pools: resolved.starPools,
    broken: resolved.starPoolBreak,
  }
}

export function buildProbaMap(
  draws: readonly ProbaDraw[],
  scale: MapScale,
  kind: ProbaKind
): ProbaMap {
  const { history, work, pools, broken } = windowOf(draws, scale)
  const starsHidden = !starScaleOpen(pools, broken)
  const expected = kind === "number" ? NUMBER_EXPECTED_CHARGE : STAR_EXPECTED_CHARGE
  const pool = kind === "number" ? NUMBER_POOL : STAR_POOL
  const dates = work.map((draw) => draw.date)
  if (kind === "star" && starsHidden) {
    return {
      scale,
      kind,
      dates,
      columns: [],
      series: [],
      expected,
      pool,
      starsHidden,
      starNote: starScaleNote(pools, broken),
    }
  }
  const rows = observeBand(history, work, kind)
  const series = Array.from({ length: pool }, () => [] as number[])
  for (const row of rows) series[row.value - 1] = row.series
  return {
    scale,
    kind,
    dates,
    columns: buildCounterMap(rows),
    series,
    expected,
    pool,
    starsHidden,
    starNote: starScaleNote(pools, broken),
  }
}
