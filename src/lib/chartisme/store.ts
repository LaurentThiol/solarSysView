import {
  evaluateRules,
  normalizeRule,
  type ChartismeRule,
  type Firing,
  type RuleAction,
  type RuleState,
} from "./rules"

export const RULES_KEY = "synchro.chartisme.rules.v1"
export const FIRINGS_KEY = "synchro.chartisme.firings.v1"
export const LABELS_KEY = "synchro.chartisme.labels.v1"
export const CLASSES_KEY = "synchro.chartisme.classes.v1"
export const LAST_FIRING_KEY = "synchro.chartisme.lastFiring"
export const FIRING_EVENT = "synchro:chartisme-firing"

export type StoredFiring = {
  rule_id: string
  name: string
  curve_id?: string | null
  figure?: string | null
  figure_date?: string | null
  at: string
  actions: RuleAction[]
  snapshot?: RuleState
}

/** Rôle de la table placé à la main : tête, épaule gauche, ligne de cou… */
export type LabelRole = { role: string; index: number; value: number }

/**
 * Étiquette posée à la main dans l'atelier.
 *
 * Les valeurs de la fenêtre voyagent avec l'étiquette : l'entraînement doit
 * pouvoir la relire telle quelle, même si un réexport a décalé les indices.
 */
export type StoredLabel = {
  id: string
  curve_id: string
  variable?: string | null
  figure: string
  custom_label?: string | null
  from_index: number
  to_index: number
  from?: string | null
  to?: string | null
  values: number[]
  activity?: number[] | null
  roles?: LabelRole[]
  at: string
  synced?: boolean
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

export function loadRules(): ChartismeRule[] {
  const raw = readJson<unknown[]>(RULES_KEY, [])
  return raw.map((row) => normalizeRule(row as ChartismeRule))
}

export function saveRules(rules: ChartismeRule[]) {
  writeJson(RULES_KEY, rules.map(normalizeRule))
}

export function loadFirings(): StoredFiring[] {
  return readJson<StoredFiring[]>(FIRINGS_KEY, [])
}

export function persistFirings(firings: StoredFiring[]) {
  writeJson(FIRINGS_KEY, firings.slice(0, 200))
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

export function loadLabels(): StoredLabel[] {
  return readJson<StoredLabel[]>(LABELS_KEY, [])
}

export function saveLabels(labels: StoredLabel[]) {
  writeJson(LABELS_KEY, labels.slice(0, 500))
}

/** Classes libres inventées dans l'atelier, hors table de référence. */
export function loadClasses(): string[] {
  return readJson<string[]>(CLASSES_KEY, [])
}

export function saveClasses(classes: string[]) {
  writeJson(CLASSES_KEY, classes.slice(0, 60))
}

function toStored(firing: Firing, at: string): StoredFiring {
  return {
    rule_id: firing.rule_id,
    name: firing.name,
    curve_id: firing.curve_id,
    figure: firing.figure,
    figure_date: firing.figure_date,
    at,
    actions: firing.actions,
    snapshot: firing.snapshot,
  }
}

export function runRulesAgainst(state: RuleState, rules?: ChartismeRule[]) {
  const list = rules ?? loadRules()
  const firings = evaluateRules(list, state)
  if (!firings.length) return firings
  const stored = loadFirings()
  const now = new Date().toISOString()
  const added = firings.map((f) => toStored(f, now))
  persistFirings([...added, ...stored])
  publishFiring(added[0])
  return firings
}

export function recordFirings(firings: Firing[]) {
  if (!firings.length) return []
  const now = new Date().toISOString()
  const added = firings.map((f) => toStored(f, now))
  persistFirings([...added, ...loadFirings()])
  publishFiring(added[0])
  return added
}

/**
 * Synchro Neon, au mieux.
 *
 * Le navigateur reste la source de vérité : sur Netlify aucun backend Python
 * ne répond, et l'atelier doit rester utilisable. Un échec est donc silencieux
 * — la copie locale a déjà été écrite.
 */
async function post(path: string, body: unknown): Promise<boolean> {
  try {
    const response = await fetch(`/api/chartisme/${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
    return response.ok
  } catch {
    return false
  }
}

export async function syncRule(rule: ChartismeRule): Promise<boolean> {
  return post("rules", normalizeRule(rule))
}

export async function syncLabel(label: StoredLabel): Promise<boolean> {
  return post("labels", {
    id: label.id,
    curve_id: label.curve_id,
    variable: label.variable ?? null,
    figure: label.figure,
    custom_label: label.custom_label ?? null,
    from_index: label.from_index,
    to_index: label.to_index,
    from_date: label.from ?? null,
    to_date: label.to ?? null,
    values: label.values,
    activity: label.activity ?? null,
    roles: label.roles ?? [],
  })
}

export async function deleteRemote(kind: "rules" | "labels", id: string): Promise<boolean> {
  try {
    const response = await fetch(`/api/chartisme/${kind}/${encodeURIComponent(id)}`, {
      method: "DELETE",
    })
    return response.ok
  } catch {
    return false
  }
}

/** Remonte les étiquettes locales encore jamais parties vers Neon. */
export async function pushPendingLabels(): Promise<number> {
  const labels = loadLabels()
  const pending = labels.filter((label) => !label.synced)
  if (!pending.length) return 0
  let sent = 0
  for (const label of pending) {
    if (await syncLabel(label)) {
      label.synced = true
      sent += 1
    }
  }
  if (sent) saveLabels(labels)
  return sent
}
