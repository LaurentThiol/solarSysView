/**
 * Compteur d’observateur.
 * Chaque tirage sans la boule ajoute 1/pool. La sortie remet la case à 0
 * sur la colonne de ce tirage. La mémoire commence avant la fenêtre.
 * Les étoiles ne comptent que les tirages du pool 12 ★.
 */

import { resolveWindow, type WindowPreset } from "@/lib/analysis-window"
import { decadeIndex } from "@/lib/grid-shape"

export const NUMBER_POOL = 50
export const STAR_POOL = 12
export const NUMBER_STEP = 1 / NUMBER_POOL
export const STAR_STEP = 1 / STAR_POOL
/** Écart moyen sous la loi uniforme, exprimé dans l’unité du compteur. */
export const NUMBER_EXPECTED_CHARGE = 9 / NUMBER_POOL
export const STAR_EXPECTED_CHARGE = 5 / STAR_POOL
/** Probabilité de manquer la boule à un tirage. */
export const NUMBER_MISS_RATE = (NUMBER_POOL - 5) / NUMBER_POOL
export const STAR_MISS_RATE = (STAR_POOL - 2) / STAR_POOL

export const PROBA_SCALES = [
  "last_50",
  "last_100",
  "last_200",
  "year",
  "year_n1",
  "year_n2",
] as const

export type ProbaScale = (typeof PROBA_SCALES)[number]

export const PROBA_SCALE_LABELS: Record<ProbaScale, string> = {
  last_50: "50",
  last_100: "100",
  last_200: "200",
  year: "Année",
  year_n1: "n−1",
  year_n2: "n−2",
}

export const PROBA_SORTS = ["dizaines", "unites", "compteur"] as const
export type ProbaSort = (typeof PROBA_SORTS)[number]
export type ProbaDir = "asc" | "desc"
export type ProbaKind = "number" | "star"

export type ProbaDraw = {
  date: string
  numbers: readonly number[]
  stars: readonly number[]
  star_pool?: number
  weekday?: string
}

export type ChargeRow = {
  value: number
  /** Compteur après chaque tirage de la fenêtre, ancien à gauche. */
  series: number[]
  /** Absences depuis la dernière sortie, mémoire d’avant comprise. */
  delay: number
  /** (taux de manque) ^ retard. 1 quand la boule vient de sortir. */
  rarity: number
  /** Aucune sortie dans la fenêtre : la fenêtre seule ne voit qu’un plancher. */
  censored: boolean
  /** Plancher connu de la fenêtre seule, en unité de compteur. */
  windowFloor: number
}

export type ProbaBand = {
  kind: ProbaKind
  pool: number
  step: number
  expected: number
  missRate: number
  rows: ChargeRow[]
}

export type ProbaScaleBoard = {
  preset: ProbaScale
  label: string
  fromDate: string | null
  toDate: string | null
  dates: string[]
  drawCount: number
  starsHidden: boolean
  starNote: string | null
  numbers: ProbaBand
  stars: ProbaBand | null
}

export type ProbaBoards = {
  boards: ProbaScaleBoard[]
  /** Retard au bord droit des 50 derniers tirages, indexé par valeur − 1. */
  referenceDelay: { number: number[]; star: number[] }
}

const SCALE_PRESET: Record<ProbaScale, WindowPreset> = {
  last_50: "last_50",
  last_100: "last_100",
  last_200: "last_200",
  year: "year",
  year_n1: "year_n1",
  year_n2: "year_n2",
}

function specOf(kind: ProbaKind) {
  if (kind === "number") {
    return {
      pool: NUMBER_POOL,
      step: NUMBER_STEP,
      expected: NUMBER_EXPECTED_CHARGE,
      missRate: NUMBER_MISS_RATE,
      pick: (draw: ProbaDraw) => draw.numbers,
      accepts: () => true,
    }
  }
  return {
    pool: STAR_POOL,
    step: STAR_STEP,
    expected: STAR_EXPECTED_CHARGE,
    missRate: STAR_MISS_RATE,
    pick: (draw: ProbaDraw) => draw.stars,
    accepts: (draw: ProbaDraw) => (draw.star_pool ?? STAR_POOL) >= STAR_POOL,
  }
}

/**
 * Le curseur est l’index du tirage accepté. On le pose sur la sortie
 * avant d’avancer, pour que la colonne de la sortie vaille 0.
 */
export function observeBand(
  history: readonly ProbaDraw[],
  work: readonly ProbaDraw[],
  kind: ProbaKind
): ChargeRow[] {
  const { pool, step, missRate, pick, accepts } = specOf(kind)
  const lastSeen = Array<number>(pool + 1).fill(-1)
  let cursor = 0

  for (const draw of history) {
    if (!accepts(draw)) continue
    for (const value of pick(draw)) {
      if (value >= 1 && value <= pool) lastSeen[value] = cursor
    }
    cursor += 1
  }

  const series = Array.from({ length: pool }, () => [] as number[])
  const hit = Array<boolean>(pool + 1).fill(false)
  const windowMisses = Array<number>(pool + 1).fill(0)

  for (const draw of work) {
    if (!accepts(draw)) {
      for (let value = 1; value <= pool; value += 1) {
        const seen = lastSeen[value]
        const delay = seen < 0 ? cursor : cursor - 1 - seen
        series[value - 1].push(delay / pool)
      }
      continue
    }
    const present = new Set<number>()
    for (const value of pick(draw)) {
      if (value >= 1 && value <= pool) present.add(value)
    }
    for (const value of present) {
      lastSeen[value] = cursor
      hit[value] = true
    }
    cursor += 1
    for (let value = 1; value <= pool; value += 1) {
      if (!present.has(value)) windowMisses[value] += 1
      const seen = lastSeen[value]
      const delay = seen < 0 ? cursor : cursor - 1 - seen
      series[value - 1].push(delay / pool)
    }
  }

  return Array.from({ length: pool }, (_, index) => {
    const value = index + 1
    const seen = lastSeen[value]
    const delay = seen < 0 ? cursor : cursor - 1 - seen
    const censored = work.length > 0 && !hit[value]
    const end = series[index].at(-1) ?? delay / pool
    return {
      value,
      series: series[index],
      delay,
      rarity: missRate ** delay,
      censored,
      windowFloor: censored ? windowMisses[value] * step : end,
    }
  })
}

export function starScaleOpen(pools: readonly number[], broken: boolean) {
  if (broken) return false
  return pools.every((pool) => pool >= STAR_POOL)
}

export function starScaleNote(pools: readonly number[], broken: boolean): string | null {
  if (starScaleOpen(pools, broken)) return null
  if (broken) {
    const listed = pools.join(" / ")
    return `Rupture de pool d’étoiles (${listed}). Les étoiles ne sont pas dessinées.`
  }
  const listed = pools.join(", ")
  return `Cette échelle sort du pool 12 ★ (${listed}). Les étoiles ne sont pas dessinées.`
}

function band(history: readonly ProbaDraw[], work: readonly ProbaDraw[], kind: ProbaKind): ProbaBand {
  const { pool, step, expected, missRate } = specOf(kind)
  return {
    kind,
    pool,
    step,
    expected,
    missRate,
    rows: observeBand(history, work, kind),
  }
}

function delaysOf(rows: ChargeRow[] | undefined, pool: number) {
  const delays = Array<number>(pool).fill(0)
  if (!rows) return delays
  for (const row of rows) delays[row.value - 1] = row.delay
  return delays
}

export function buildProbaBoards(draws: readonly ProbaDraw[]): ProbaBoards {
  const ordered = [...draws].sort((a, b) => a.date.localeCompare(b.date))
  const boards = PROBA_SCALES.map((preset) => {
    const resolved = resolveWindow(ordered, { preset: SCALE_PRESET[preset], warmup: 0 })
    const history = resolved.fromDate
      ? ordered.filter((draw) => draw.date < resolved.fromDate!)
      : []
    const open = starScaleOpen(resolved.starPools, resolved.starPoolBreak)
    return {
      preset,
      label: PROBA_SCALE_LABELS[preset],
      fromDate: resolved.fromDate,
      toDate: resolved.toDate,
      dates: resolved.work.map((draw) => draw.date),
      drawCount: resolved.drawCount,
      starsHidden: !open,
      starNote: starScaleNote(resolved.starPools, resolved.starPoolBreak),
      numbers: band(history, resolved.work, "number"),
      stars: open ? band(history, resolved.work, "star") : null,
    }
  })
  const reference = boards.find((board) => board.preset === "last_50")
  return {
    boards,
    referenceDelay: {
      number: delaysOf(reference?.numbers.rows, NUMBER_POOL),
      star: delaysOf(reference?.stars?.rows, STAR_POOL),
    },
  }
}

/** Chiffre des unités : 1, 2, …, 9, puis 0. */
export function unitRank(value: number) {
  const digit = value % 10
  return digit === 0 ? 9 : digit - 1
}

export function orderBalls(
  values: readonly number[],
  delayOf: (value: number) => number,
  sort: ProbaSort,
  dir: ProbaDir
): number[] {
  return [...values].sort((a, b) => {
    if (sort === "dizaines") return decadeIndex(a) - decadeIndex(b) || a - b
    if (sort === "unites") return unitRank(a) - unitRank(b) || a - b
    const primary = dir === "asc" ? delayOf(a) - delayOf(b) : delayOf(b) - delayOf(a)
    return primary || a - b
  })
}

export function ballValues(pool: number) {
  return Array.from({ length: pool }, (_, index) => index + 1)
}

export function parseProbaSort(value: string | null | undefined): ProbaSort {
  if (value === "unites" || value === "compteur" || value === "dizaines") return value
  return "dizaines"
}

export function parseProbaDir(value: string | null | undefined): ProbaDir {
  return value === "asc" ? "asc" : "desc"
}

export function parsePinned(value: string | null | undefined, max: number): number | null {
  if (!value) return null
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > max) return null
  return parsed
}
