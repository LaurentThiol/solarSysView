import { WINDOW_PRESET_LABELS, type WindowPreset } from "@/lib/analysis-window"
import { weekdayApiValue, type WeekdayScope } from "@/lib/weekday-scope"

export const PULSE_PRESETS = [
  "last_20",
  "last_50",
  "last_100",
  "last_200",
  "year",
  "year_n1",
  "year_n2",
] as const satisfies readonly WindowPreset[]

export type PulsePreset = (typeof PULSE_PRESETS)[number]

export const PULSE_FAMILIES = ["simple", "double", "pair", "triplet"] as const

export type PulseFamily = (typeof PULSE_FAMILIES)[number]

export const PULSE_FAMILY_LABELS: Record<PulseFamily, string> = {
  simple: "Cycle simple",
  double: "Double cycle",
  pair: "Rotation de paire",
  triplet: "Rotation de triplet",
}

export const PULSE_PRESET_LABELS: Record<PulsePreset, string> = {
  last_20: WINDOW_PRESET_LABELS.last_20,
  last_50: WINDOW_PRESET_LABELS.last_50,
  last_100: WINDOW_PRESET_LABELS.last_100,
  last_200: WINDOW_PRESET_LABELS.last_200,
  year: WINDOW_PRESET_LABELS.year,
  year_n1: WINDOW_PRESET_LABELS.year_n1,
  year_n2: WINDOW_PRESET_LABELS.year_n2,
}

export type PulseKind = "ball" | "star"

export type PulseSlice = {
  id: string
  preset: PulsePreset | string
  from: string | null
  to: string | null
  period: number | null
  phase: number | null
  period2: number | null
  phase2: number | null
  generator: string
  concordance: number
  lobe_rate: number
  r: number
  p: number
  hits: number
  draws: number
}

export type PulseNumber = {
  kind: PulseKind
  n: number
  generator: string
  period: number | null
  phase: number | null
  period2: number | null
  phase2: number | null
  concordance: number
  lobe_rate: number
  r: number
  p: number
  group_ids: string[]
  slices: PulseSlice[]
}

export type PulseMember = {
  kind: PulseKind
  n: number
  phase: number | null
}

export type PulseGroup = {
  id: string
  generator: "pair" | "triplet" | string
  preset: string
  period: number
  period2: number
  phase2: number | null
  concordance: number
  from: string | null
  to: string | null
  members: PulseMember[]
}

export type PulseWindow = {
  preset: string
  from: string | null
  to: string | null
  draw_count: number
}

export type PulseScan = {
  ok: boolean
  error?: string
  disclaimer?: string
  archive_source?: string
  families?: string[]
  presets?: string[]
  windows?: PulseWindow[]
  numbers?: PulseNumber[]
  groups?: PulseGroup[]
}

export type PulsePoint = {
  date: string
  hit: number
  wave: number
  phase: number
}

export type PulseDetail = {
  ok: boolean
  error?: string
  disclaimer?: string
  kind?: PulseKind
  n?: number
  slice?: PulseSlice
  points?: PulsePoint[]
}

export function pulsePercent(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "—"
  return `${Math.round(value * 100)} %`
}

export function pulseGeneratorLabel(generator: string | null | undefined) {
  if (generator === "double") return "Double cycle"
  if (generator === "pair") return "Paire"
  if (generator === "triplet") return "Triplet"
  return "Cycle simple"
}

export function pulseChannelLabel(kind: PulseKind, n: number) {
  return kind === "star" ? `Étoile ${n}` : `Boule ${n}`
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
  const text = await response.text()
  if (!text) return { ok: false, error: `HTTP ${response.status}` }
  try {
    const parsed = JSON.parse(text) as unknown
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>
    }
    return { ok: false, error: "réponse invalide" }
  } catch {
    return { ok: false, error: "réponse invalide" }
  }
}

export async function scanPulse(input: {
  presets: readonly PulsePreset[]
  families: readonly PulseFamily[]
  weekday: WeekdayScope
}): Promise<PulseScan> {
  const response = await fetch("/api/pulse/scan", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      presets: input.presets,
      families: input.families,
      weekday: weekdayApiValue(input.weekday) ?? null,
    }),
  })
  const body = await readJson(response)
  if (!response.ok || body.ok === false) {
    return {
      ok: false,
      error: typeof body.error === "string" ? body.error : `HTTP ${response.status}`,
    }
  }
  return body as PulseScan
}

export async function fetchPulseDetail(input: {
  kind: PulseKind
  n: number
  preset: string
  sliceId: string
  families: readonly PulseFamily[]
  weekday: WeekdayScope
}): Promise<PulseDetail> {
  const params = new URLSearchParams({
    kind: input.kind,
    n: String(input.n),
    preset: input.preset,
    slice: input.sliceId,
    families: input.families.join(","),
  })
  const day = weekdayApiValue(input.weekday)
  if (day) params.set("weekday", day)
  const response = await fetch(`/api/pulse/detail?${params.toString()}`, { cache: "no-store" })
  const body = await readJson(response)
  if (!response.ok || body.ok === false) {
    return {
      ok: false,
      error: typeof body.error === "string" ? body.error : `HTTP ${response.status}`,
    }
  }
  return body as PulseDetail
}
