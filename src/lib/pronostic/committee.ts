import { drawSize, sumBounds, theoreticalSlot, type PoolKind } from "./bounds.ts"
import { countStack } from "./count.ts"
import {
  DEFAULT_MARGIN,
  ERROR_AXES,
  MARGIN_STEPS,
  bandFromMoments,
  constrainedStack,
  playHistoric,
  type ErrorAxisId,
  type HistoricLayers,
  type HistoricLookbackChoice,
  type HistoricPrepared,
  type MarginStep,
} from "./historic.ts"
import { coversPoint, type StackProposal, type WindowPoint } from "./learn.ts"
import { type StackState } from "./state.ts"

/** Au moins trois tirages contenus avant de préférer une marge à 1 σ. */
export const AUTO_MIN_HITS = 3

export const COMMITTEE_SCOPES = ["mixte", "mardi", "vendredi"] as const
export type CommitteeScopeId = (typeof COMMITTEE_SCOPES)[number]

export const COMMITTEE_SCOPE_LABEL: Record<CommitteeScopeId, string> = {
  mixte: "Mardi + vendredi",
  mardi: "Mardi",
  vendredi: "Vendredi",
}

export const PYTHON_ABSENT =
  "Python est absent. Le comité n’est pas calculé. La marge et la mise ci-dessus sont celles de la moyenne des tirages d’avant."

export const COMMITTEE_LOADING = "Comité en cours de calcul."

export const COMMITTEE_OFF = "Calcul arrêté. La page reste disponible : allumez le calcul pour lancer le comité."

export const COMMITTEE_SCORING = "Décompte des grilles du comité, par petites étapes."

export const COMMITTEE_MEAN_BANNER = "Le comité reprend la moyenne."

export const COMMITTEE_NO_REPLY = "Le comité n’a pas répondu."

export const COMMITTEE_API_LATE = "L’API n’a pas répondu à temps. Le comité n’est pas calculé."

function finiteInts(value: unknown): number[] | null {
  if (!Array.isArray(value)) return null
  const out: number[] = []
  for (const item of value) {
    if (typeof item !== "number" || !Number.isInteger(item)) return null
    out.push(item)
  }
  return out
}

/** Ne transmet que des grilles entières. Un champ nul ne doit pas faire refuser toute la requête. */
export function committeeRequestDraws(
  draws: Array<{ date?: unknown; numbers?: unknown; stars?: unknown; weekday?: unknown }>
) {
  const sent: Array<{ date: string; numbers: number[]; stars: number[]; weekday: string | null }> = []
  for (const draw of draws) {
    const numbers = finiteInts(draw.numbers)
    const stars = finiteInts(draw.stars)
    if (!numbers || numbers.length !== 5 || !stars || stars.length !== 2) continue
    sent.push({
      date: typeof draw.date === "string" ? draw.date : "",
      numbers,
      stars,
      weekday: typeof draw.weekday === "string" ? draw.weekday : null,
    })
  }
  return sent
}

function readableFailure(message: string) {
  const text = message.trim()
  if (!text) return COMMITTEE_NO_REPLY
  if (/aborted due to timeout|\btimeout\b/i.test(text)) return COMMITTEE_API_LATE
  return text
}

export function committeeErrorMessage(body: unknown) {
  if (!body || typeof body !== "object") return COMMITTEE_NO_REPLY
  const raw = body as { error?: unknown; detail?: unknown }
  if (typeof raw.error === "string" && raw.error.trim()) return readableFailure(raw.error)
  if (typeof raw.detail === "string" && raw.detail.trim()) return readableFailure(raw.detail)
  if (Array.isArray(raw.detail)) {
    const parts = raw.detail
      .map((item) => {
        if (!item || typeof item !== "object") return ""
        const msg = (item as { msg?: unknown }).msg
        return typeof msg === "string" ? msg.trim() : ""
      })
      .filter(Boolean)
    if (parts.length > 0) return readableFailure(parts.slice(0, 3).join(" "))
  }
  return COMMITTEE_NO_REPLY
}

const API_UNREACHABLE =
  /ECONNREFUSED|ENOTFOUND|EHOSTUNREACH|EAI_AGAIN|fetch failed|ECONNRESET|injoignable|non configur/i

/** Vrai seulement quand l’API n’est pas là. Un délai n’est pas une absence de Python. */
export function committeeApiDown(body: unknown) {
  const message = committeeErrorMessage(body)
  if (message === COMMITTEE_API_LATE) return false
  if (message === COMMITTEE_NO_REPLY) return true
  return API_UNREACHABLE.test(message)
}

export type CommitteeAxis = {
  id: ErrorAxisId
  mu: number
  sigma: number
  baselineMu: number
  baselineSigma: number
  fellBack: boolean
  actual?: number
}

export type CommitteeMomentRow = {
  date: string
  weekday?: string | null
  fellBackAll: boolean
  numbers: number[]
  stars: number[]
  axes: CommitteeAxis[]
}

export type CommitteeNext = {
  fellBackAll: boolean
  axes: CommitteeAxis[]
}

export type CommitteeScopePayload = {
  available: number
  rows: CommitteeMomentRow[]
  next: CommitteeNext | null
}

export type CommitteePayload = {
  ok: boolean
  lookback: 20 | 50
  draws?: number
  trainCap?: number
  elapsedMs?: number
  workers?: number
  scopes: Record<CommitteeScopeId, CommitteeScopePayload>
}

export type MarginCell = {
  margin: MarginStep
  hit: boolean
  grids: number
}

export type AutoRow = {
  cells: MarginCell[]
}

export type AutoChoice = {
  margin: MarginStep
  /** Vrai quand aucune marge n’a trois tirages contenus : on reste à 1 σ. */
  fallback: boolean
}

export type RateSummary = {
  n: number
  hits: number
  rate: number
  meanGrids: number | null
  totalGrids: number
  gridsPerHit: number | null
}

export type ScoredForecast = {
  margin: MarginStep
  numbers: StackProposal
  stars: StackProposal
  numberState: StackState
  starState: StackState
  grids: number
}

export type ScoredCommitteeRow = AutoRow & {
  date: string
  fellBackAll: boolean
  numbers: number[]
  stars: number[]
  baseline: MarginCell[]
}

export type ScoredScope = {
  available: number
  rows: ScoredCommitteeRow[]
  next: CommitteeNext | null
  forecasts: ScoredForecast[]
  postHoc: AutoChoice
  postHocSummary: RateSummary
  played: RateSummary
}

export type ScoredCommittee = {
  lookback: 20 | 50
  scopes: Record<CommitteeScopeId, ScoredScope>
}

export function committeeLookback(choice: HistoricLookbackChoice): 20 | 50 {
  return choice === 50 ? 50 : 20
}

export function chooseAutoMargin(rows: AutoRow[]): AutoChoice {
  let best: MarginStep | null = null
  let bestRatio = Number.POSITIVE_INFINITY
  for (let step = 0; step < MARGIN_STEPS.length; step += 1) {
    let hits = 0
    let grids = 0
    for (const row of rows) {
      const cell = row.cells[step]
      if (!cell?.hit) continue
      hits += 1
      grids += cell.grids
    }
    if (hits < AUTO_MIN_HITS) continue
    const ratio = grids / hits
    const margin = MARGIN_STEPS[step]
    if (best == null || ratio < bestRatio) {
      best = margin
      bestRatio = ratio
    }
  }
  if (best == null) return { margin: DEFAULT_MARGIN, fallback: true }
  return { margin: best, fallback: false }
}

/** Marge gelée pour chaque tirage, choisie seulement sur les tirages d’avant. */
export function playedMargins(rows: AutoRow[]): MarginStep[] {
  return rows.map((_, index) => chooseAutoMargin(rows.slice(0, index)).margin)
}

export function summarizeAt(rows: AutoRow[], margin: MarginStep): RateSummary {
  const step = MARGIN_STEPS.indexOf(margin)
  let hits = 0
  let totalGrids = 0
  for (const row of rows) {
    const cell = row.cells[step]
    if (!cell) continue
    if (cell.hit) hits += 1
    totalGrids += cell.grids
  }
  return rateOf(rows.length, hits, totalGrids)
}

export function playedSummary(rows: AutoRow[]): RateSummary {
  const margins = playedMargins(rows)
  let hits = 0
  let totalGrids = 0
  margins.forEach((margin, index) => {
    const cell = rows[index].cells[MARGIN_STEPS.indexOf(margin)]
    if (!cell) return
    if (cell.hit) hits += 1
    totalGrids += cell.grids
  })
  return rateOf(rows.length, hits, totalGrids)
}

function rateOf(n: number, hits: number, totalGrids: number): RateSummary {
  return {
    n,
    hits,
    rate: n > 0 ? hits / n : 0,
    meanGrids: n > 0 ? totalGrids / n : null,
    totalGrids,
    gridsPerHit: hits > 0 ? totalGrids / hits : null,
  }
}

export function historicAutoRows(prepared: HistoricPrepared): AutoRow[] {
  const games = MARGIN_STEPS.map((step) => playHistoric(prepared, step))
  const count = games[0]?.rows.length ?? 0
  const rows: AutoRow[] = []
  for (let index = 0; index < count; index += 1) {
    rows.push({
      cells: MARGIN_STEPS.map((margin, step) => ({
        margin,
        hit: games[step].rows[index].hit,
        grids: games[step].rows[index].grids,
      })),
    })
  }
  return rows
}

type AxisSpec = (typeof ERROR_AXES)[number]

function theoreticalOf(axis: AxisSpec) {
  if (axis.layer === "sum") {
    const bounds = sumBounds(axis.pool)
    return { lo: bounds.min, hi: bounds.max }
  }
  if (axis.layer === "parity") return { lo: 0, hi: drawSize(axis.pool) }
  return theoreticalSlot(axis.pool, "slot" in axis ? axis.slot : 0)
}

function finite(value: unknown, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback
}

function asAxis(value: unknown): CommitteeAxis | null {
  if (!value || typeof value !== "object") return null
  const raw = value as Record<string, unknown>
  const id = ERROR_AXES.find((axis) => axis.id === raw.id)?.id
  if (!id) return null
  const baselineMu = finite(raw.baselineMu)
  const baselineSigma = Math.max(0, finite(raw.baselineSigma))
  return {
    id,
    mu: finite(raw.mu, baselineMu),
    sigma: Math.max(0, finite(raw.sigma, baselineSigma)),
    baselineMu,
    baselineSigma,
    fellBack: raw.fellBack === true,
    actual: raw.actual == null ? undefined : finite(raw.actual),
  }
}

function asRow(value: unknown): CommitteeMomentRow | null {
  if (!value || typeof value !== "object") return null
  const raw = value as Record<string, unknown>
  if (!Array.isArray(raw.axes)) return null
  const axes = raw.axes.map(asAxis)
  if (axes.some((axis) => axis == null) || axes.length !== ERROR_AXES.length) return null
  const numbers = Array.isArray(raw.numbers) ? raw.numbers.map((item) => finite(item)) : []
  const stars = Array.isArray(raw.stars) ? raw.stars.map((item) => finite(item)) : []
  return {
    date: typeof raw.date === "string" ? raw.date : "",
    weekday: typeof raw.weekday === "string" ? raw.weekday : null,
    fellBackAll: raw.fellBackAll === true,
    numbers,
    stars,
    axes: axes as CommitteeAxis[],
  }
}

function asNext(value: unknown): CommitteeNext | null {
  if (value == null) return null
  if (!value || typeof value !== "object") return null
  const raw = value as Record<string, unknown>
  if (!Array.isArray(raw.axes)) return null
  const axes = raw.axes.map(asAxis)
  if (axes.some((axis) => axis == null) || axes.length !== ERROR_AXES.length) return null
  return { fellBackAll: raw.fellBackAll === true, axes: axes as CommitteeAxis[] }
}

function asScope(value: unknown): CommitteeScopePayload | null {
  if (!value || typeof value !== "object") return null
  const raw = value as Record<string, unknown>
  if (!Array.isArray(raw.rows)) return null
  const rows = raw.rows.map(asRow)
  if (rows.some((row) => row == null)) return null
  return {
    available: finite(raw.available),
    rows: rows as CommitteeMomentRow[],
    next: asNext(raw.next),
  }
}

export function parseCommitteePayload(value: unknown): CommitteePayload | null {
  if (!value || typeof value !== "object") return null
  const raw = value as Record<string, unknown>
  if (raw.ok !== true) return null
  if (raw.lookback !== 20 && raw.lookback !== 50) return null
  if (!raw.scopes || typeof raw.scopes !== "object") return null
  const scopes = raw.scopes as Record<string, unknown>
  const parsed = {} as Record<CommitteeScopeId, CommitteeScopePayload>
  for (const id of COMMITTEE_SCOPES) {
    const scope = asScope(scopes[id])
    if (!scope) return null
    parsed[id] = scope
  }
  const draws = finite(raw.draws, Number.NaN)
  const trainCap = finite(raw.trainCap, Number.NaN)
  const elapsedMs = finite(raw.elapsedMs, Number.NaN)
  const workers = finite(raw.workers, Number.NaN)
  return {
    ok: true,
    lookback: raw.lookback,
    draws: Number.isFinite(draws) ? draws : undefined,
    trainCap: Number.isFinite(trainCap) ? trainCap : undefined,
    elapsedMs: Number.isFinite(elapsedMs) ? elapsedMs : undefined,
    workers: Number.isFinite(workers) ? workers : undefined,
    scopes: parsed,
  }
}

export type CommitteeHeadLine = {
  id: ErrorAxisId
  label: string
  fellBack: boolean
  mu: number
  sigma: number
  baselineMu: number
  baselineSigma: number
  kept: number
  scored: number
}

/** Ce que chaque tête a fait : reprise de la moyenne, ou réseau gardé. */
export function committeeHeads(scope: CommitteeScopePayload | null | undefined): CommitteeHeadLine[] {
  if (!scope?.next) return []
  return ERROR_AXES.map((spec) => {
    const next = scope.next?.axes.find((axis) => axis.id === spec.id)
    let kept = 0
    for (const row of scope.rows) {
      const axis = row.axes.find((item) => item.id === spec.id)
      if (axis && !axis.fellBack) kept += 1
    }
    return {
      id: spec.id,
      label: spec.label,
      fellBack: next?.fellBack !== false,
      mu: next?.mu ?? 0,
      sigma: next?.sigma ?? 0,
      baselineMu: next?.baselineMu ?? 0,
      baselineSigma: next?.baselineSigma ?? 0,
      kept,
      scored: scope.rows.length,
    }
  })
}

function axisById(axes: CommitteeAxis[]) {
  return new Map(axes.map((axis) => [axis.id, axis]))
}

function bandFor(axes: CommitteeAxis[], id: ErrorAxisId, k: number, source: "committee" | "baseline") {
  const spec = ERROR_AXES.find((axis) => axis.id === id)
  const axis = axisById(axes).get(id)
  if (!spec || !axis) return { lo: 0, hi: 0 }
  const mean = source === "baseline" ? axis.baselineMu : axis.mu
  const sigma = source === "baseline" ? axis.baselineSigma : axis.sigma
  return bandFromMoments(mean, sigma, k, theoreticalOf(spec))
}

export function proposalFromAxes(
  axes: CommitteeAxis[],
  pool: PoolKind,
  k: number,
  source: "committee" | "baseline"
): StackProposal {
  const sumId: ErrorAxisId = pool === "numbers" ? "sum" : "starSum"
  const evenId: ErrorAxisId = pool === "numbers" ? "parity" : "starParity"
  const slotIds: ErrorAxisId[] = pool === "numbers" ? ["n1", "n2", "n3", "n4", "n5"] : ["e1", "e2"]
  const sum = bandFor(axes, sumId, k, source)
  const even = bandFor(axes, evenId, k, source)
  return {
    minSum: sum.lo,
    maxSum: sum.hi,
    minEven: even.lo,
    maxEven: even.hi,
    slots: slotIds.map((id) => bandFor(axes, id, k, source)),
    parityMode: "observed",
    observedEvenMode: null,
  }
}

function pointFromAxes(axes: CommitteeAxis[], pool: PoolKind): WindowPoint {
  const found = axisById(axes)
  const sumId: ErrorAxisId = pool === "numbers" ? "sum" : "starSum"
  const evenId: ErrorAxisId = pool === "numbers" ? "parity" : "starParity"
  const slotIds: ErrorAxisId[] = pool === "numbers" ? ["n1", "n2", "n3", "n4", "n5"] : ["e1", "e2"]
  return {
    date: "",
    sum: found.get(sumId)?.actual ?? 0,
    even: found.get(evenId)?.actual ?? 0,
    ranks: slotIds.map((id) => found.get(id)?.actual ?? 0),
  }
}

function stackKey(state: StackState) {
  const layers = state.layers.map((layer) => (layer.enabled ? "1" : "0")).join("")
  const slots = state.slots.map((band) => `${band.lo}:${band.hi}`).join(",")
  return `${state.kind}|${layers}|${state.minSum}:${state.maxSum}|${state.minEven}:${state.maxEven}|${slots}`
}

function countCached(cache: Map<string, number>, state: StackState) {
  const key = stackKey(state)
  const found = cache.get(key)
  if (found != null) return found
  const count = countStack(state)
  cache.set(key, count)
  return count
}

function cellAt(
  cache: Map<string, number>,
  axes: CommitteeAxis[],
  k: MarginStep,
  layers: HistoricLayers,
  source: "committee" | "baseline"
): MarginCell {
  const numbers = proposalFromAxes(axes, "numbers", k, source)
  const stars = proposalFromAxes(axes, "stars", k, source)
  const numberHit = coversPoint(pointFromAxes(axes, "numbers"), numbers, layers)
  const starHit = coversPoint(pointFromAxes(axes, "stars"), stars, layers)
  const grids =
    countCached(cache, constrainedStack("numbers", numbers, layers)) *
    countCached(cache, constrainedStack("stars", stars, layers))
  return { margin: k, hit: numberHit && starHit, grids }
}

type ScoreJob =
  | {
      kind: "cell"
      scope: CommitteeScopeId
      row: number
      margin: MarginStep
      source: "committee" | "baseline"
    }
  | { kind: "forecast"; scope: CommitteeScopeId; margin: MarginStep }

export type CommitteeScorer = {
  /** Une bande. `true` quand les trois séries sont notées. */
  step(): boolean
  result(): ScoredCommittee | null
}

function blankRow(row: CommitteeMomentRow): ScoredCommitteeRow {
  return {
    date: row.date,
    fellBackAll: row.fellBackAll,
    numbers: row.numbers,
    stars: row.stars,
    cells: [],
    baseline: [],
  }
}

function finishScope(
  scope: CommitteeScopePayload,
  rows: ScoredCommitteeRow[],
  forecasts: ScoredForecast[]
): ScoredScope {
  const postHoc = chooseAutoMargin(rows)
  return {
    available: scope.available,
    rows,
    next: scope.next,
    forecasts,
    postHoc,
    postHocSummary: summarizeAt(rows, postHoc.margin),
    played: playedSummary(rows),
  }
}

/** Le décompte des grilles se fait une bande à la fois, pour ne pas figer le navigateur. */
export function createCommitteeScorer(payload: CommitteePayload, layers: HistoricLayers): CommitteeScorer {
  const cache = new Map<string, number>()
  const rows: Record<CommitteeScopeId, ScoredCommitteeRow[]> = {
    mixte: payload.scopes.mixte.rows.map(blankRow),
    mardi: payload.scopes.mardi.rows.map(blankRow),
    vendredi: payload.scopes.vendredi.rows.map(blankRow),
  }
  const forecasts: Record<CommitteeScopeId, ScoredForecast[]> = {
    mixte: [],
    mardi: [],
    vendredi: [],
  }
  const jobs: ScoreJob[] = []
  for (const scope of COMMITTEE_SCOPES) {
    payload.scopes[scope].rows.forEach((_, row) => {
      for (const margin of MARGIN_STEPS) {
        jobs.push({ kind: "cell", scope, row, margin, source: "committee" })
        jobs.push({ kind: "cell", scope, row, margin, source: "baseline" })
      }
    })
    if (payload.scopes[scope].next) {
      for (const margin of MARGIN_STEPS) jobs.push({ kind: "forecast", scope, margin })
    }
  }
  let cursor = 0
  let done: ScoredCommittee | null = null

  return {
    step() {
      if (done) return true
      if (cursor < jobs.length) {
        const job = jobs[cursor]
        cursor += 1
        if (job.kind === "cell") {
          const source = payload.scopes[job.scope].rows[job.row]
          const cell = cellAt(cache, source.axes, job.margin, layers, job.source)
          const target = rows[job.scope][job.row]
          if (job.source === "committee") target.cells.push(cell)
          else target.baseline.push(cell)
        } else {
          const next = payload.scopes[job.scope].next
          if (next) {
            const numbers = proposalFromAxes(next.axes, "numbers", job.margin, "committee")
            const stars = proposalFromAxes(next.axes, "stars", job.margin, "committee")
            const numberState = constrainedStack("numbers", numbers, layers)
            const starState = constrainedStack("stars", stars, layers)
            forecasts[job.scope].push({
              margin: job.margin,
              numbers,
              stars,
              numberState,
              starState,
              grids: countCached(cache, numberState) * countCached(cache, starState),
            })
          }
        }
        if (cursor < jobs.length) return false
      }
      done = {
        lookback: payload.lookback,
        scopes: {
          mixte: finishScope(payload.scopes.mixte, rows.mixte, forecasts.mixte),
          mardi: finishScope(payload.scopes.mardi, rows.mardi, forecasts.mardi),
          vendredi: finishScope(payload.scopes.vendredi, rows.vendredi, forecasts.vendredi),
        },
      }
      return true
    },
    result() {
      return done
    },
  }
}

export function scoreCommittee(payload: CommitteePayload, layers: HistoricLayers): ScoredCommittee {
  const scorer = createCommitteeScorer(payload, layers)
  while (!scorer.step()) {
    /* le fil de test n’a pas à rendre la main */
  }
  const scored = scorer.result()
  if (!scored) throw new Error("comité incomplet")
  return scored
}

export function baselineSummary(scope: ScoredScope, margin: MarginStep): RateSummary {
  const step = MARGIN_STEPS.indexOf(margin)
  let hits = 0
  let totalGrids = 0
  for (const row of scope.rows) {
    const cell = row.baseline[step]
    if (!cell) continue
    if (cell.hit) hits += 1
    totalGrids += cell.grids
  }
  return rateOf(scope.rows.length, hits, totalGrids)
}

function gridsText(value: number | null) {
  if (value == null) return "—"
  return Math.round(value).toLocaleString("fr-FR")
}

export function confrontationSentence(
  scored: ScoredCommittee,
  margin: MarginStep
): string {
  const marginLabel = margin.toLocaleString("fr-FR", { maximumFractionDigits: 2 })
  const parts = (["mardi", "vendredi"] as const).map((id) => {
    const scope = scored.scopes[id]
    const label = id === "mardi" ? "mardi" : "vendredi"
    if (scope.rows.length === 0) {
      return `Pas assez de tirages du ${label} pour une fenêtre de ${scored.lookback}.`
    }
    const committee = summarizeAt(scope.rows, margin)
    const baseline = baselineSummary(scope, margin)
    if (
      committee.meanGrids != null &&
      baseline.meanGrids != null &&
      committee.meanGrids < baseline.meanGrids
    ) {
      return `Le ${label} baisse la mise du comité (${gridsText(committee.meanGrids)} grilles) sous la moyenne de fenêtre (${gridsText(baseline.meanGrids)}).`
    }
    return `Le ${label} ne baisse pas la mise du comité sous la moyenne de fenêtre (${gridsText(committee.meanGrids)} contre ${gridsText(baseline.meanGrids)}).`
  })
  return `À ${marginLabel} σ, ${parts.join(" ")} Mardi + vendredi mélange les deux soirs.`
}

export function mixWindowSentence(lookback: number) {
  return `La fenêtre de ${lookback} mélange les mardis et les vendredis. Le filtre du jour n’est pas posé : les deux soirs restent dans la même série.`
}

export function committeeWindowSentence() {
  return "Le comité lit une fenêtre de 20. Choisi avant et la fenêtre 100 ne sont pas une fenêtre de comité."
}
