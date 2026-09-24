export type CycleChannel = {
  id: string
  label: string
  module: string
  kind: string
  role: string
  period_days?: number | null
  period_draws?: number | null
  group?: string | null
  phase?: number | null
  note?: string | null
}

export type CycleRegistry = {
  ok: boolean
  error?: string
  variable?: string
  draw_count?: number
  from_date?: string | null
  to_date?: string | null
  channels?: CycleChannel[]
  notes?: { id: string; level: string; text: string }[]
}

export type CyclePanel = {
  ok: boolean
  error?: string
  dates?: string[]
  series?: Record<string, Array<number | null>>
  notes?: { id: string; level: string; text: string }[]
}

export type CycleAblation = {
  id: string
  label: string
  loss: number
  delta: number
  wins: boolean
}

export type CycleNull = {
  id: string
  label: string
  loss: number
  delta: number
  better: boolean
}

export type CycleSignature = {
  variable: string
  n?: number | null
  known_ids: string[]
  past_ids: string[]
  vsn_known: number[]
  vsn_past: number[]
  attention: Record<string, { mass: number[]; flatness: number; locked: boolean }>
  ablation: CycleAblation[]
  nulls: CycleNull[]
  beats_nulls: boolean
}

export type CycleFit = {
  ok: boolean
  error?: string
  torch?: boolean
  train_loss?: number
  test_loss?: number
  harmo_period_draws?: number | null
  signature?: CycleSignature
  ribbon?: { date: string; q10: number; q50: number; q90: number; y: number }[]
  notes?: { id: string; level: string; text: string }[]
  disclaimer?: string
}

export type CycleStatus = {
  ok?: boolean
  torch?: boolean
  torch_version?: string | null
  error?: string
  disclaimer?: string
}

export function cyclesQuery(params: Record<string, string | number | boolean | null | undefined>) {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value == null || value === "") continue
    search.set(key, String(value))
  }
  return search
}

async function readJson<T>(response: Response): Promise<T> {
  const text = await response.text()
  let body = { ok: false, error: "réponse invalide" } as unknown as T & { error?: string; detail?: unknown }
  if (text) {
    try {
      body = JSON.parse(text) as T & { error?: string; detail?: unknown }
    } catch {
      body.error = text.replace(/\s+/g, " ").trim().slice(0, 200) || "réponse invalide"
    }
  }
  if (!response.ok && !body.error) {
    body.error = typeof body.detail === "string" ? body.detail : `HTTP ${response.status}`
  }
  return body
}

export async function fetchCycles<T>(path: string, params: URLSearchParams, method = "GET"): Promise<T> {
  const response = await fetch(`/api/cycles/${path}?${params}`, {
    method,
    cache: "no-store",
  })
  return readJson<T>(response)
}

export function cosine(left: number[], right: number[]) {
  const n = Math.min(left.length, right.length)
  let dot = 0
  let a = 0
  let b = 0
  for (let i = 0; i < n; i += 1) {
    dot += left[i] * right[i]
    a += left[i] * left[i]
    b += right[i] * right[i]
  }
  const denom = Math.sqrt(a) * Math.sqrt(b)
  return denom < 1e-12 ? 0 : dot / denom
}
