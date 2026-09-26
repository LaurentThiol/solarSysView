import {
  DEFAULT_EPS,
  DEFAULT_MAX_OVERLAP,
  DEFAULT_ZIGZAG_PCT,
  dedupe,
  detectFigures,
  rankKey,
  summarize,
  targetReached,
  type FigureHit,
  type FigureSummary,
  type TargetOutcome,
} from "./figures"
import type { Curve } from "./curves"
import { activityConfirms } from "../ta"
import { SHORT_CYCLE_MAX, SHORT_CYCLE_MIN } from "../short-cycle"
import { swingPivots } from "./pivots"

/**
 * Jumeau TS de `synchro/chartisme/scan.py`.
 *
 * Les détecteurs regardent une fenêtre ; le balayage la déplace. Sans lui on ne
 * verrait qu'une lecture de la courbe entière, alors qu'une figure courte et un
 * range annuel ne vivent pas à la même échelle.
 */

export const DEFAULT_SCALES = [30, 60, 120] as const
export const DEFAULT_STRIDE_RATIO = 0.25
export const MIN_WINDOW = 16

function shortArches(
  values: number[],
  dates: Array<string | null>,
  activity: number[],
  zigzagPct: number
): FigureHit[] {
  const pivots = swingPivots(values, dates, zigzagPct)
  const found: FigureHit[] = []
  for (let slot = 0; slot < pivots.length - 1; slot += 1) {
    const left = pivots[slot]
    const right = pivots[slot + 1]
    const span = right.index - left.index
    if (span < SHORT_CYCLE_MIN || span > SHORT_CYCLE_MAX) continue
    const segment = values.slice(left.index, right.index + 1)
    if (!segment.length) continue
    const height = Math.max(...segment) - Math.min(...segment)
    if (height <= 0) continue
    let stepSum = 0
    for (let index = 1; index < segment.length; index += 1) stepSum += Math.abs(segment[index] - segment[index - 1])
    const highFirst = left.price >= right.price
    found.push({
      figure: "arche" as FigureHit["figure"],
      label: "Arche courte",
      kind: "range",
      signal: "—",
      confidence: Math.round((span / SHORT_CYCLE_MAX) * 10000) / 10000,
      from_index: left.index,
      to_index: right.index,
      from: dates[left.index] ?? null,
      to: dates[right.index] ?? null,
      pivots: [
        {
          index: left.index,
          date: left.date,
          value: left.price,
          role: highFirst ? "top" : "bottom",
        },
        {
          index: right.index,
          date: right.date,
          value: right.price,
          role: highFirst ? "bottom" : "top",
        },
      ],
      guides: [],
      breakout: null,
      target: null,
      detector: "short",
      range: height,
      activity_period: SHORT_CYCLE_MAX,
      mean_step: segment.length > 1 ? stepSum / (segment.length - 1) : 0,
      volume_ok: activity.length > 0 && activityConfirms(activity, right.index, SHORT_CYCLE_MAX),
    } as FigureHit)
  }
  return found
}
/**
 * Plancher du balayage géométrique.
 *
 * La rareté n'est plus un seuil de scan : on lit d'abord toutes les formes
 * que les détecteurs voient, puis on badge celles que le hasard produit trop
 * souvent. Scanner à 0.6 — ou au seuil inversé, souvent 0.65 — vidait le
 * tracé alors que les détecteurs avaient déjà trouvé la figure.
 */
export const GEOMETRIC_FLOOR = 0

/** Lectures affichées d'un coup. Au-delà, la liste le dit au lieu de couper en silence. */
export const HIT_LIST_CAP = 40

/** « 40 premières sur N », ou rien quand la liste tient entière. */
export function hitListCaption(total: number, cap = HIT_LIST_CAP): string | null {
  if (total <= cap) return null
  return `${Math.min(cap, total)} premières sur ${total}`
}

/**
 * Indices des lectures montrées : les `cap` premières, plus la sélection
 * si les flèches l'ont emmenée plus loin.
 */
export function visibleHitIndices(total: number, selected: number, cap = HIT_LIST_CAP): number[] {
  const count = Math.min(cap, Math.max(0, total))
  const indices = Array.from({ length: count }, (_, index) => index)
  if (selected >= cap && selected < total) indices.push(selected)
  return indices
}

/** Statut d'objectif, avec le nombre de tirages quand la mesure en a un. */
export function outcomePhrase(
  outcome?: { status?: string | null; bars?: number | null } | null
): string {
  const status = outcome?.status ?? "no_breakout"
  const bars = outcome?.bars
  const count =
    bars == null ? "" : ` en ${bars} tirage${bars > 1 ? "s" : ""}`
  if (status === "reached") return `objectif atteint${count}`
  if (status === "invalidated") return `invalidée${count}`
  if (status === "open") return bars == null ? "en cours" : `en cours depuis ${bars} tirage${bars > 1 ? "s" : ""}`
  return "pas de cassure"
}

/** Figure d'un balayage : indices dans le repère de la courbe entière. */
export type ScanHit = FigureHit & {
  curve_id?: string | null
  variable?: string | null
  n?: number | null
  scale: number
  window_start: number
  outcome: TargetOutcome
  alternatives?: Array<{ figure: string; label: string; confidence: number }>
}

export type ScanOptions = {
  scales?: ReadonlyArray<number> | null
  strideRatio?: number
  zigzagPct?: number
  eps?: number
  minConfidence?: number
  /**
   * Seuil propre à chaque échelle, `minConfidence` pour les autres.
   *
   * Un seuil unique ne veut pas dire la même chose d'une échelle à l'autre : la
   * confiance est escomptée selon la part de fenêtre couverte, donc une figure
   * courte, qui couvre presque tout son tracé, la gagne sans rien gagner en
   * substance. Régler l'onglet en rareté visée demande donc un seuil par échelle
   * — c'est ce qui rend les figures de deux échelles comparables entre elles.
   *
   * Une échelle absente de la carte est balayée au seuil commun ; une échelle
   * dont le seuil vaut `null` n'est pas balayée du tout, parce que la rareté
   * demandée y est hors d'atteinte et qu'aucun seuil ne la trierait.
   */
  minConfidenceByScale?: Readonly<Record<number, number | null>> | null
  maxOverlap?: number
  topPerZone?: boolean
  motifs?: boolean
}

export function windowStarts(length: number, size: number, stride: number): number[] {
  if (length < size) return []
  const step = Math.max(1, stride)
  const starts: number[] = []
  for (let start = 0; start <= length - size; start += step) starts.push(start)
  const tail = length - size
  if (starts.length && starts[starts.length - 1] !== tail) starts.push(tail)
  return starts.length ? starts : [0]
}

function dateAt(dates: string[], index: number): string | null {
  return index >= 0 && index < dates.length ? dates[index] : null
}

function rebase(
  hit: FigureHit,
  options: {
    offset: number
    scale: number
    curve: Partial<Curve>
    values: number[]
    dates: string[]
  }
): ScanHit {
  const { offset, scale, curve, values, dates } = options
  const fromIndex = hit.from_index + offset
  const toIndex = hit.to_index + offset
  const out: ScanHit = {
    ...hit,
    curve_id: curve.id ?? null,
    variable: curve.variable ?? null,
    n: curve.n ?? null,
    scale,
    window_start: offset,
    from_index: fromIndex,
    to_index: toIndex,
    from: dateAt(dates, fromIndex),
    to: dateAt(dates, toIndex),
    pivots: hit.pivots.map((pivot) => ({
      ...pivot,
      index: pivot.index + offset,
      date: dateAt(dates, pivot.index + offset),
    })),
    guides: hit.guides.map((guide) => ({
      ...guide,
      points: guide.points.map((point) => ({ ...point, index: point.index + offset })),
    })),
    breakout: hit.breakout
      ? {
          ...hit.breakout,
          index: hit.breakout.index + offset,
          date: dateAt(dates, hit.breakout.index + offset),
        }
      : null,
    outcome: { status: "no_breakout", reached: null, bars: null },
  }
  out.outcome = targetReached(values, out)
  return out
}

export function scanCurve(curve: Partial<Curve>, options: ScanOptions = {}): ScanHit[] {
  const {
    scales = DEFAULT_SCALES,
    strideRatio = DEFAULT_STRIDE_RATIO,
    zigzagPct = DEFAULT_ZIGZAG_PCT,
    eps = DEFAULT_EPS,
    minConfidence = 0.5,
    minConfidenceByScale = null,
    maxOverlap = DEFAULT_MAX_OVERLAP,
    topPerZone = false,
    motifs = true,
  } = options
  const values = (curve.values ?? []).map(Number)
  const dates = [...(curve.dates ?? [])]
  const activity = (curve.activity ?? []).map(Number)
  if (values.length < SHORT_CYCLE_MIN) return []

  const found: ScanHit[] = []
  for (const size of scales ?? DEFAULT_SCALES) {
    if (size > values.length) continue
    const bar =
      minConfidenceByScale && size in minConfidenceByScale
        ? minConfidenceByScale[size]
        : minConfidence
    if (bar === null) continue
    if (size >= SHORT_CYCLE_MIN && size <= SHORT_CYCLE_MAX) {
      const stride = Math.max(1, Math.trunc(size * strideRatio))
      for (const start of windowStarts(values.length, size, stride)) {
        const stop = start + size
        for (const hit of shortArches(
          values.slice(start, stop),
          dates.slice(start, stop),
          activity.slice(start, stop),
          zigzagPct
        )) {
          if (hit.confidence < bar) continue
          found.push(rebase(hit, { offset: start, scale: size, curve, values, dates }))
        }
      }
      continue
    }
    if (size < MIN_WINDOW) continue
    const stride = Math.max(1, Math.trunc(size * strideRatio))
    for (const start of windowStarts(values.length, size, stride)) {
      const stop = start + size
      const hits = detectFigures(
        values.slice(start, stop),
        dates.slice(start, stop),
        activity.slice(start, stop),
        { zigzagPct, eps, minConfidence: bar, maxOverlap, motifs }
      )
      for (const hit of hits) {
        found.push(rebase(hit, { offset: start, scale: size, curve, values, dates }))
      }
    }
  }
  const kept = dedupe(found, { maxOverlap }) as ScanHit[]
  return topPerZone ? collapseZones(kept, { maxOverlap }) : kept
}

function spanOverlap(a: FigureHit, b: FigureHit) {
  const lo = Math.max(a.from_index, b.from_index)
  const hi = Math.min(a.to_index, b.to_index)
  if (hi <= lo) return 0
  const shortest = Math.min(a.to_index - a.from_index, b.to_index - b.from_index)
  return shortest > 0 ? (hi - lo) / shortest : 0
}

function compareRank(a: FigureHit, b: FigureHit) {
  const left = rankKey(a)
  const right = rankKey(b)
  for (let i = 0; i < left.length; i += 1) {
    if (left[i] !== right[i]) return left[i] - right[i]
  }
  return 0
}

/** Une seule figure par zone, la mieux classée ; les autres en `alternatives`. */
export function collapseZones<T extends ScanHit>(
  hits: T[],
  options: {
    maxOverlap?: number
    compare?: (a: T, b: T) => number
  } = {}
): T[] {
  const { maxOverlap = DEFAULT_MAX_OVERLAP, compare = compareRank as (a: T, b: T) => number } =
    options
  const kept: T[] = []
  for (const hit of [...hits].sort(compare)) {
    const host = kept.find((k) => spanOverlap(k, hit) > maxOverlap)
    if (!host) {
      kept.push({ ...hit, alternatives: [] })
      continue
    }
    host.alternatives?.push({
      figure: hit.figure,
      label: hit.label,
      confidence: hit.confidence,
    })
  }
  return kept
}

export function sortByRank(hits: ScanHit[]): ScanHit[] {
  return [...hits].sort(compareRank)
}

export type ScanWindow = {
  curve_id?: string | null
  variable?: string | null
  label?: string | null
  from_index: number
  to_index: number
  from: string | null
  to: string | null
  values: number[]
}

/** Toutes les fenêtres d'une courbe, sans détection — pour la recherche. */
export function windowsOf(
  curves: Array<Partial<Curve>>,
  options: { size?: number; stride?: number; curve?: string | null; limit?: number } = {}
): ScanWindow[] {
  const { size = 60, stride = 15, curve = null, limit = 4000 } = options
  const out: ScanWindow[] = []
  for (const entry of curves) {
    if (curve !== null && entry.id !== curve) continue
    const values = (entry.values ?? []).map(Number)
    const dates = [...(entry.dates ?? [])]
    if (values.length < size) continue
    for (const start of windowStarts(values.length, size, stride)) {
      const stop = start + size
      out.push({
        curve_id: entry.id ?? null,
        variable: entry.variable ?? null,
        label: entry.label ?? null,
        from_index: start,
        to_index: stop - 1,
        from: dateAt(dates, start),
        to: dateAt(dates, stop - 1),
        values: values.slice(start, stop),
      })
      if (out.length >= limit) return out
    }
  }
  return out
}

/** Part des objectifs atteints, par figure — la base du rétro-test. */
export function outcomeStats(hits: ScanHit[]) {
  const perFigure: Record<
    string,
    {
      reached: number
      invalidated: number
      open: number
      no_breakout: number
      settled: number
      hit_rate: number | null
    }
  > = {}
  for (const hit of hits) {
    const row =
      perFigure[hit.figure] ??
      (perFigure[hit.figure] = {
        reached: 0,
        invalidated: 0,
        open: 0,
        no_breakout: 0,
        settled: 0,
        hit_rate: null,
      })
    const status = hit.outcome?.status ?? "no_breakout"
    if (status in row) row[status] += 1
  }
  for (const row of Object.values(perFigure)) {
    row.settled = row.reached + row.invalidated
    row.hit_rate = row.settled ? Math.round((row.reached / row.settled) * 1e4) / 1e4 : null
  }
  return perFigure
}

export function scanSummary(hits: ScanHit[]): FigureSummary {
  return summarize(hits)
}
