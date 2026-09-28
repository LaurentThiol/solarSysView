import type { WeekdayScope } from "@/lib/weekday-scope"
import { weekdayApiFromBrowser, weekdayApiValue } from "@/lib/weekday-scope"

import type { TreeRule } from "./decision-tree-view"

export type DecisionDraft = {
  name: string
  target: string
  task: string
  horizon: string
  indicators: string[]
  instructions: string
  origin?: string | null
  label_phrase?: string
}

export type DecisionReading = {
  ok?: boolean
  slug: string
  question: string
  label?: string | null
  series?: string | null
  phrase?: string
  era?: string
  weekday?: string | null
  beats_independence?: boolean
  verdict?: string
  verdict_text?: string
  p?: number
  p_adjusted?: number
  q_reject?: boolean
  holdout_score?: number
  null_mean?: number
  null_scores?: number[]
  permutations?: number
  criterion?: string
  max_depth?: number
  min_samples_leaf?: number
  cv_score?: number
  train_n?: number
  holdout_n?: number
  class_names?: string[]
  feature_names?: string[]
  feature_labels?: Record<string, string>
  rules?: TreeRule[]
  drawing?: string
  drawing_error?: string | null
  tree_svg?: string | null
  case_svg?: string | null
  path_svg?: string | null
  tree_text?: string | null
  latest?: { x?: number[]; date?: string | null }
  ball_scores?: { ball: number; proba: number; leaf: number }[]
  case?: {
    leaf: number
    predicted?: number
    class_name?: string
    proba?: number[]
  } | null
  drafts?: DecisionDraft[]
  chartisme_rules?: Record<string, unknown>[]
  suggestions?: { question?: string; label?: string; series?: string; text?: string }[]
  specialists?: { slug: string; name: string; handle: string }[]
  draw_count?: number
  from_date?: string | null
  to_date?: string | null
  created_at?: string
  threshold?: number | null
  error?: string
}

export type DecisionJob = {
  ok?: boolean
  id: string
  status: string
  stage?: string
  k?: number
  n?: number
  error?: string | null
  result?: DecisionReading
}

export type DecisionStatus = {
  ok?: boolean
  sklearn?: boolean
  dtreeviz?: boolean
  dot?: boolean
  error?: string
}

export type DecisionQuestionInput = {
  question: string
  label?: string | null
  series?: string | null
  era?: "current" | "all"
  curves?: string[] | null
  max_depth?: number
  criterion?: string | null
  permutations?: number | null
  seed?: number
}

export const SPECIALIST_DRAFT_KEY = "synchro.specialist.flux-draft"
export const CHARTISME_RULE_DRAFT_KEY = "synchro.chartisme.rule-draft"

function withWeekday(path: string, scope?: WeekdayScope | null) {
  const day = scope == null ? weekdayApiFromBrowser() : weekdayApiValue(scope)
  if (!day) return path
  const join = path.includes("?") ? "&" : "?"
  return `${path}${join}weekday=${day}`
}

async function readJson(response: Response) {
  const body = (await response.json().catch(() => ({}))) as {
    ok?: boolean
    error?: string
    detail?: unknown
  }
  if (typeof body.detail === "string") body.error = body.error || body.detail
  else if (Array.isArray(body.detail)) {
    body.error = body.detail
      .map((item) => (item && typeof item === "object" && "msg" in item ? String(item.msg) : String(item)))
      .join("; ")
  }
  return body
}

export async function decisionTreeStatus(): Promise<DecisionStatus & { api: boolean }> {
  try {
    const response = await fetch("/api/brain/decision-tree/status", { cache: "no-store" })
    const body = (await readJson(response)) as DecisionStatus
    if (!response.ok) return { api: false, error: body.error || `HTTP ${response.status}` }
    return { ...body, api: true }
  } catch (error) {
    return { api: false, error: error instanceof Error ? error.message : "API injoignable" }
  }
}

export async function listDecisionReadings(): Promise<{ ok: boolean; items: DecisionReading[]; error?: string }> {
  try {
    const response = await fetch("/api/brain/decision-tree", { cache: "no-store" })
    const body = (await readJson(response)) as { items?: DecisionReading[]; error?: string }
    if (!response.ok) return { ok: false, items: [], error: body.error || `HTTP ${response.status}` }
    return { ok: true, items: Array.isArray(body.items) ? body.items : [] }
  } catch (error) {
    return { ok: false, items: [], error: error instanceof Error ? error.message : "API injoignable" }
  }
}

export async function loadDecisionReading(slug: string): Promise<DecisionReading> {
  const response = await fetch(`/api/brain/decision-tree/${encodeURIComponent(slug)}`, { cache: "no-store" })
  const body = (await readJson(response)) as DecisionReading
  if (!response.ok) throw new Error(body.error || `HTTP ${response.status}`)
  return body
}

export async function startDecisionJob(
  input: DecisionQuestionInput,
  scope?: WeekdayScope | null
): Promise<DecisionJob> {
  const response = await fetch(withWeekday("/api/brain/decision-tree", scope), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
    cache: "no-store",
  })
  const body = (await readJson(response)) as DecisionJob
  if (!response.ok) throw new Error(body.error || `HTTP ${response.status}`)
  return body
}

export async function decisionJob(id: string): Promise<DecisionJob> {
  const response = await fetch(`/api/brain/decision-tree/jobs/${encodeURIComponent(id)}`, { cache: "no-store" })
  const body = (await readJson(response)) as DecisionJob
  if (!response.ok) throw new Error(body.error || `HTTP ${response.status}`)
  return body
}

export async function cancelDecisionJob(id: string) {
  await fetch(`/api/brain/decision-tree/jobs/${encodeURIComponent(id)}`, { method: "DELETE", cache: "no-store" })
}

export async function waitDecisionJob(
  id: string,
  onProgress: (job: DecisionJob) => void,
  signal?: { cancelled: boolean }
): Promise<DecisionReading | null> {
  for (;;) {
    if (signal?.cancelled) return null
    const job = await decisionJob(id)
    onProgress(job)
    if (job.status === "done" && job.result) return job.result
    if (job.status === "cancelled") return null
    if (job.status === "error") throw new Error(job.error || "Lecture impossible")
    await new Promise((resolve) => window.setTimeout(resolve, 700))
  }
}

export function writeSpecialistDraft(draft: DecisionDraft) {
  if (typeof window === "undefined") return
  window.sessionStorage.setItem(SPECIALIST_DRAFT_KEY, JSON.stringify(draft))
}

export function readSpecialistDraft(): DecisionDraft | null {
  if (typeof window === "undefined") return null
  try {
    const raw = window.sessionStorage.getItem(SPECIALIST_DRAFT_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as DecisionDraft
    if (!parsed || typeof parsed.name !== "string" || typeof parsed.target !== "string") return null
    return parsed
  } catch {
    return null
  }
}

export function clearSpecialistDraft() {
  if (typeof window === "undefined") return
  window.sessionStorage.removeItem(SPECIALIST_DRAFT_KEY)
}
