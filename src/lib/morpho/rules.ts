import { MOTIF_IDS, labelOf } from "./lexicon"

export const ACTION_TYPES = [
  "tag",
  "alert",
  "filter",
  "montecarlo",
  "navigate",
  "hypothesize",
  "draft_rule",
] as const

export type ActionType = (typeof ACTION_TYPES)[number]

export type RuleCondition = {
  motifs: string[]
  any_motifs: string[]
  query_labels: Record<string, string>
  weekday: string | null
  caption_contains: string | null
  min_grounding: number | null
}

export type RuleAction = { type: ActionType; payload: Record<string, unknown> }

export type MorphoRule = {
  id: string
  name: string
  condition: RuleCondition
  actions: RuleAction[]
  active: boolean
}

export type RuleState = {
  date?: string | null
  weekday?: string
  motifs?: string[]
  caption?: string
  queries?: Record<string, string>
  grounding_score?: number | null
  numbers?: number[]
  stars?: number[]
}

function newId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID()
  return `rule-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

export function normalizeCondition(raw?: Partial<RuleCondition> | null): RuleCondition {
  const src = raw ?? {}
  const allow = new Set<string>(MOTIF_IDS)
  return {
    motifs: (src.motifs ?? []).filter((m) => allow.has(m)),
    any_motifs: (src.any_motifs ?? []).filter((m) => allow.has(m)),
    query_labels: Object.fromEntries(
      Object.entries(src.query_labels ?? {}).filter(([, v]) => String(v).trim())
    ),
    weekday: src.weekday?.trim().toLowerCase() || null,
    caption_contains: src.caption_contains?.trim() || null,
    min_grounding:
      src.min_grounding == null || src.min_grounding === ("" as unknown)
        ? null
        : Number(src.min_grounding),
  }
}

export function normalizeActions(raw?: unknown): RuleAction[] {
  const items = Array.isArray(raw) ? raw : []
  const out: RuleAction[] = []
  for (const item of items) {
    if (!item || typeof item !== "object") continue
    const type = (item as RuleAction).type
    if (!ACTION_TYPES.includes(type)) continue
    const payload =
      typeof (item as RuleAction).payload === "object" && (item as RuleAction).payload
        ? (item as RuleAction).payload
        : {}
    out.push({ type, payload })
  }
  return out.length ? out : [{ type: "alert", payload: {} }]
}

export function normalizeRule(raw: Partial<MorphoRule> & { id?: string }): MorphoRule {
  return {
    id: raw.id || newId(),
    name: (raw.name || "Règle").trim() || "Règle",
    condition: normalizeCondition(raw.condition),
    actions: normalizeActions(raw.actions),
    active: raw.active !== false,
  }
}

export function matchCondition(condition: RuleCondition, state: RuleState) {
  const cond = normalizeCondition(condition)
  const motifs = new Set(state.motifs ?? [])
  for (const motif of cond.motifs) if (!motifs.has(motif)) return false
  if (cond.any_motifs.length && !cond.any_motifs.some((m) => motifs.has(m))) return false
  if (cond.weekday && (state.weekday || "").toLowerCase() !== cond.weekday) return false
  const queries = state.queries ?? {}
  for (const [key, expected] of Object.entries(cond.query_labels)) {
    if (String(queries[key] || "").toLowerCase() !== expected.toLowerCase()) return false
  }
  if (cond.caption_contains && !String(state.caption || "").toLowerCase().includes(cond.caption_contains.toLowerCase())) {
    return false
  }
  if (cond.min_grounding != null) {
    if (state.grounding_score == null || state.grounding_score < cond.min_grounding) return false
  }
  return true
}

export function evaluateRules(rules: MorphoRule[], state: RuleState) {
  const firings: {
    rule_id: string
    name: string
    actions: RuleAction[]
    draw_date: string | null | undefined
    motif_snapshot: RuleState
  }[] = []
  for (const raw of rules) {
    const rule = normalizeRule(raw)
    if (!rule.active || !matchCondition(rule.condition, state)) continue
    firings.push({
      rule_id: rule.id,
      name: rule.name,
      actions: rule.actions,
      draw_date: state.date,
      motif_snapshot: {
        motifs: state.motifs ?? [],
        caption: state.caption,
        queries: state.queries ?? {},
        weekday: state.weekday,
        numbers: state.numbers,
        stars: state.stars,
      },
    })
  }
  return firings
}

export function draftRuleFromState(state: RuleState): MorphoRule {
  const motifs = (state.motifs ?? []).slice(0, 4)
  return normalizeRule({
    name: "Persistance · " + (motifs.map(labelOf).join(", ") || "glyphe"),
    condition: {
      motifs,
      any_motifs: [],
      query_labels: {},
      weekday: null,
      caption_contains: null,
      min_grounding: null,
    },
    actions: [{ type: "hypothesize", payload: { motifs, constraint: "same_motifs" } }],
    active: true,
  })
}
