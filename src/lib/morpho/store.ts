import { evaluateRules, normalizeRule, type MorphoRule, type RuleState } from "./rules"

export const RULES_KEY = "synchro.morpho.rules.v1"
export const FIRINGS_KEY = "synchro.morpho.firings.v1"
export const LAST_FIRING_KEY = "synchro.morpho.lastFiring"
export const FIRING_EVENT = "synchro:morpho-firing"

export type StoredFiring = {
  rule_id: string
  name: string
  draw_date?: string | null
  at: string
  actions: MorphoRule["actions"]
}

function readJson<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback
  try {
    const raw = window.localStorage.getItem(key)
    if (!raw) return fallback
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

function writeJson(key: string, value: unknown) {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // quota
  }
}

export function loadRules(): MorphoRule[] {
  const raw = readJson<unknown[]>(RULES_KEY, [])
  return raw.map((row) => normalizeRule(row as MorphoRule))
}

export function saveRules(rules: MorphoRule[]) {
  writeJson(RULES_KEY, rules.map(normalizeRule))
}

export function loadFirings(): StoredFiring[] {
  return readJson<StoredFiring[]>(FIRINGS_KEY, [])
}

export function persistFirings(firings: StoredFiring[]) {
  writeJson(FIRINGS_KEY, firings.slice(0, 80))
}

export function publishFiring(firing: StoredFiring) {
  writeJson(LAST_FIRING_KEY, firing)
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(FIRING_EVENT, { detail: firing }))
  }
}

export function readLastFiring(): StoredFiring | null {
  return readJson<StoredFiring | null>(LAST_FIRING_KEY, null)
}

export function runRulesAgainst(state: RuleState, rules?: MorphoRule[]) {
  const list = rules ?? loadRules()
  const firings = evaluateRules(list, state)
  if (!firings.length) return firings
  const stored = loadFirings()
  const now = new Date().toISOString()
  const added: StoredFiring[] = firings.map((f) => ({
    rule_id: f.rule_id,
    name: f.name,
    draw_date: f.draw_date,
    at: now,
    actions: f.actions,
  }))
  persistFirings([...added, ...stored])
  publishFiring(added[0])
  return firings
}
