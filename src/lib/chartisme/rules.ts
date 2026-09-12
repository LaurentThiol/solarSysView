import { FIGURE_IDS, labelOf, type FigureId, type FigureKind } from "./catalog"
import type { FigureHit } from "./figures"

export const ACTION_TYPES = ["tag", "alert", "note", "hypothesize", "watch"] as const

export type ActionType = (typeof ACTION_TYPES)[number]

export const BREAKOUT_STATES = ["any", "confirmed", "fake", "pending"] as const

export type BreakoutState = (typeof BREAKOUT_STATES)[number]

export const DIRECTIONS = ["any", "up", "down"] as const

export type Direction = (typeof DIRECTIONS)[number]

export const TRENDS = ["any", "up", "down", "range"] as const

export type Trend = (typeof TRENDS)[number]

export const KINDS = ["reversal_down", "reversal_up", "continuation", "range"] as const

export type RuleCondition = {
  figures: string[]
  any_figures: string[]
  kinds: string[]
  curves: string[]
  variables: string[]
  min_confidence: number | null
  breakout: BreakoutState
  direction: Direction
  trend: Trend
  weekday: string | null
  min_activity_ratio: number | null
}

export type RuleAction = { type: ActionType; payload: Record<string, unknown> }

export type ChartismeRule = {
  id: string
  name: string
  condition: RuleCondition
  actions: RuleAction[]
  active: boolean
}

/** Une figure et son contexte, sous la forme que les conditions interrogent. */
export type RuleState = {
  figure?: string | null
  label?: string | null
  kind?: FigureKind | string | null
  signal?: string | null
  confidence?: number | null
  curve_id?: string | null
  variable?: string | null
  curve_label?: string | null
  breakout_state?: BreakoutState
  direction?: "up" | "down" | null
  activity_ratio?: number | null
  trend?: string | null
  weekday?: string | null
  from?: string | null
  to?: string | null
  from_index?: number | null
  to_index?: number | null
  target?: FigureHit["target"] | null
  detector?: string | null
}

export type Firing = {
  rule_id: string
  name: string
  actions: RuleAction[]
  curve_id?: string | null
  figure?: string | null
  figure_date?: string | null
  snapshot: RuleState
}

function newId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID()
  return `rule-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function cleanList(raw: unknown, allowed?: ReadonlyArray<string>): string[] {
  const items = Array.isArray(raw) ? raw : []
  const allow = allowed ? new Set<string>(allowed) : null
  const out: string[] = []
  for (const item of items) {
    const text = String(item ?? "").trim()
    if (!text) continue
    if (allow && !allow.has(text)) continue
    if (!out.includes(text)) out.push(text)
  }
  return out
}

function optionalFloat(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === "") return null
  const value = Number(raw)
  return Number.isFinite(value) ? value : null
}

function oneOf<T extends string>(raw: unknown, allowed: ReadonlyArray<T>, fallback: T): T {
  const text = String(raw ?? "")
    .trim()
    .toLowerCase()
  return (allowed as ReadonlyArray<string>).includes(text) ? (text as T) : fallback
}

export function normalizeCondition(raw?: Partial<RuleCondition> | null): RuleCondition {
  const src = (raw ?? {}) as Record<string, unknown>
  return {
    // `figures` exige toutes les figures citées, `any_figures` au moins une.
    figures: cleanList(src.figures, FIGURE_IDS),
    any_figures: cleanList(src.any_figures, FIGURE_IDS),
    kinds: cleanList(src.kinds, KINDS),
    curves: cleanList(src.curves),
    variables: cleanList(src.variables),
    min_confidence: optionalFloat(src.min_confidence),
    breakout: oneOf(src.breakout, BREAKOUT_STATES, "any"),
    direction: oneOf(src.direction, DIRECTIONS, "any"),
    trend: oneOf(src.trend, TRENDS, "any"),
    weekday:
      String(src.weekday ?? "")
        .trim()
        .toLowerCase() || null,
    min_activity_ratio: optionalFloat(src.min_activity_ratio),
  }
}

export function normalizeActions(raw?: unknown): RuleAction[] {
  const items = Array.isArray(raw) ? raw : []
  const out: RuleAction[] = []
  for (const item of items) {
    if (!item || typeof item !== "object") continue
    const kind = String((item as RuleAction).type ?? "")
    if (!(ACTION_TYPES as ReadonlyArray<string>).includes(kind)) continue
    const rawPayload = (item as RuleAction).payload
    const payload =
      rawPayload && typeof rawPayload === "object" ? (rawPayload as Record<string, unknown>) : {}
    out.push({ type: kind as ActionType, payload })
  }
  return out.length ? out : [{ type: "note", payload: {} }]
}

export function normalizeRule(raw: Partial<ChartismeRule> | Record<string, unknown>): ChartismeRule {
  const src = (raw ?? {}) as Record<string, unknown>
  return {
    id: String(src.id ?? "") || newId(),
    name: String(src.name ?? "Règle").trim() || "Règle",
    condition: normalizeCondition(src.condition as Partial<RuleCondition> | null),
    actions: normalizeActions(src.actions),
    active: src.active === undefined ? true : Boolean(src.active),
  }
}

export function breakoutStateOf(hit: FigureHit): BreakoutState {
  if (!hit.breakout) return "pending"
  return hit.breakout.confirmed ? "confirmed" : "fake"
}

/**
 * La fenêtre satisfait-elle la condition ?
 *
 * `state` réunit la figure détectée et son contexte : courbe, tendance de
 * fond, jour de tirage.
 */
export function matchCondition(condition: RuleCondition, state: RuleState): boolean {
  const cond = normalizeCondition(condition)
  const figure = String(state.figure ?? "")
  const figures = new Set(figure ? [figure] : [])
  for (const wanted of cond.figures) {
    if (!figures.has(wanted)) return false
  }
  if (cond.any_figures.length && !cond.any_figures.some((f) => figures.has(f))) return false
  if (cond.kinds.length && !cond.kinds.includes(String(state.kind ?? ""))) return false
  if (cond.curves.length && !cond.curves.includes(String(state.curve_id ?? ""))) return false
  if (cond.variables.length && !cond.variables.includes(String(state.variable ?? ""))) return false
  if (cond.min_confidence !== null) {
    if (state.confidence == null || Number(state.confidence) < cond.min_confidence) return false
  }
  if (cond.breakout !== "any" && String(state.breakout_state ?? "") !== cond.breakout) return false
  if (cond.direction !== "any" && String(state.direction ?? "") !== cond.direction) return false
  if (cond.trend !== "any" && String(state.trend ?? "") !== cond.trend) return false
  if (cond.weekday && String(state.weekday ?? "").toLowerCase() !== cond.weekday) return false
  if (cond.min_activity_ratio !== null) {
    if (state.activity_ratio == null || Number(state.activity_ratio) < cond.min_activity_ratio) {
      return false
    }
  }
  return true
}

/** Figure détectée → état interrogeable par les règles. */
export function stateFromHit(
  hit: FigureHit,
  options: {
    curve?: { id?: string; variable?: string; label?: string } | null
    trend?: string | null
    weekday?: string | null
  } = {}
): RuleState {
  const { curve = null, trend = null, weekday = null } = options
  const breakout = hit.breakout ?? null
  const extra = hit as FigureHit & { curve_id?: string; variable?: string }
  return {
    figure: hit.figure,
    label: hit.label,
    kind: hit.kind,
    signal: hit.signal,
    confidence: hit.confidence,
    curve_id: extra.curve_id ?? curve?.id ?? null,
    variable: extra.variable ?? curve?.variable ?? null,
    curve_label: curve?.label ?? null,
    breakout_state: breakoutStateOf(hit),
    direction: breakout?.direction ?? null,
    activity_ratio: breakout?.activity_ratio ?? null,
    trend: trend ?? "any",
    weekday,
    from: hit.from,
    to: hit.to,
    from_index: hit.from_index,
    to_index: hit.to_index,
    target: hit.target,
    detector: hit.detector,
  }
}

/** Déclenchements d'une fenêtre — des lignes de journal, rien de plus. */
export function evaluateRules(rules: ChartismeRule[], state: RuleState): Firing[] {
  const firings: Firing[] = []
  for (const raw of rules) {
    const rule = normalizeRule(raw)
    if (!rule.active || !matchCondition(rule.condition, state)) continue
    firings.push({
      rule_id: rule.id,
      name: rule.name,
      actions: rule.actions,
      curve_id: state.curve_id,
      figure: state.figure,
      figure_date: state.to,
      snapshot: { ...state },
    })
  }
  return firings
}

/** Le journal complet sur un balayage d'archive. */
export function evaluateAll(
  rules: ChartismeRule[],
  hits: FigureHit[],
  options: {
    curves?: Record<string, { id?: string; variable?: string; label?: string }>
    trends?: Record<string, string>
  } = {}
): Firing[] {
  const out: Firing[] = []
  for (const hit of hits) {
    const curveId = String((hit as FigureHit & { curve_id?: string }).curve_id ?? "")
    const state = stateFromHit(hit, {
      curve: options.curves?.[curveId] ?? null,
      trend: options.trends?.[curveId] ?? null,
    })
    out.push(...evaluateRules(rules, state))
  }
  return out
}

function breakoutLabel(state: string) {
  if (state === "confirmed") return "cassure confirmée"
  if (state === "fake") return "fake breakout"
  if (state === "pending") return "en formation"
  return "toute cassure"
}

/** Règle brouillon tirée d'une figure repérée — un clic depuis l'annotation. */
export function draftRuleFromHit(hit: FigureHit): ChartismeRule {
  const figure = String(hit.figure ?? "none") as FigureId
  const breakout = breakoutStateOf(hit)
  const confidence = hit.confidence
  const floor =
    confidence == null ? null : Math.round(Math.max(0.3, Number(confidence) - 0.1) * 100) / 100
  return normalizeRule({
    name: `${labelOf(figure)} · ${breakoutLabel(breakout)}`,
    condition: {
      figures: [figure],
      breakout: breakout === "pending" ? "any" : breakout,
      min_confidence: floor,
    } as Partial<RuleCondition>,
    actions: [
      {
        type: "hypothesize",
        payload: {
          figure,
          expectation: "target_reached",
          basis: hit.target?.basis,
        },
      },
    ],
    active: true,
  })
}

/** Condition en une phrase française — pour l'affichage et le journal. */
export function describeCondition(condition: RuleCondition): string {
  const cond = normalizeCondition(condition)
  const parts: string[] = []
  if (cond.figures.length) parts.push(cond.figures.map(labelOf).join(" et "))
  if (cond.any_figures.length) parts.push(`une de ${cond.any_figures.map(labelOf).join(", ")}`)
  if (cond.kinds.length) parts.push(`type ${cond.kinds.join(", ")}`)
  if (cond.variables.length) parts.push(`variable ${cond.variables.join(", ")}`)
  if (cond.curves.length) parts.push(`courbe ${cond.curves.join(", ")}`)
  if (cond.min_confidence !== null) parts.push(`confiance ≥ ${cond.min_confidence.toFixed(2)}`)
  if (cond.breakout !== "any") parts.push(breakoutLabel(cond.breakout))
  if (cond.direction !== "any") {
    parts.push(`sens ${cond.direction === "up" ? "haussier" : "baissier"}`)
  }
  if (cond.trend !== "any") parts.push(`tendance de fond ${cond.trend}`)
  if (cond.weekday) parts.push(`tirage du ${cond.weekday}`)
  if (cond.min_activity_ratio !== null) {
    parts.push(`activité ≥ ${cond.min_activity_ratio.toFixed(1)}× la MM20`)
  }
  return `QUAND ${parts.length ? parts.join(" ∧ ") : "toute figure"}`
}

const ACTION_LABELS: Record<string, string> = {
  tag: "étiqueter",
  alert: "remonter en tête",
  note: "annoter",
  hypothesize: "formuler une attente",
  watch: "surveiller",
}

export function describeActions(actions: RuleAction[]): string {
  const kinds = actions.map((a) => ACTION_LABELS[a.type] ?? a.type)
  return `ALORS ${kinds.length ? kinds.join(", ") : "annoter"}`
}

export function describe(rule: ChartismeRule): string {
  const normalized = normalizeRule(rule)
  return `${describeCondition(normalized.condition)} ${describeActions(normalized.actions)}`
}

export type FiringSummary = {
  count: number
  by_rule: Record<string, number>
  by_figure: Record<string, number>
  by_curve: Record<string, number>
}

function sortedCounts(counts: Record<string, number>, limit?: number) {
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1])
  return Object.fromEntries(limit === undefined ? entries : entries.slice(0, limit))
}

export function summarizeFirings(firings: Firing[]): FiringSummary {
  const perRule: Record<string, number> = {}
  const perFigure: Record<string, number> = {}
  const perCurve: Record<string, number> = {}
  for (const firing of firings) {
    const name = String(firing.name)
    perRule[name] = (perRule[name] ?? 0) + 1
    const figure = String(firing.figure ?? "none")
    perFigure[figure] = (perFigure[figure] ?? 0) + 1
    const curve = String(firing.curve_id ?? "?")
    perCurve[curve] = (perCurve[curve] ?? 0) + 1
  }
  return {
    count: firings.length,
    by_rule: sortedCounts(perRule),
    by_figure: sortedCounts(perFigure),
    by_curve: sortedCounts(perCurve, 20),
  }
}
