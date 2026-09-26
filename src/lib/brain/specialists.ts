import type { VariableName } from "@/lib/analysis"
import type { CatalogEntry } from "@/lib/brain/catalog"
import {
  weekdayApiFromBrowser,
  weekdayApiValue,
  type WeekdayScope,
} from "../weekday-scope.ts"
import { SPECIALIST_FEATURE_READINGS } from "./specialist-view"

export { SPECIALIST_FEATURE_READINGS }

export type SpecialistTask = "regression" | "classes" | "binary"
export type SpecialistHorizon = "value" | "delta"

export type SpecialistFeature = {
  id: string
  label: string
  family: string
  period: number
  reading?: string
}

export type SpecialistWindowScore = {
  n?: number
  skill?: number | null
  sigma?: number
  hit_rate?: number
  hit_rate_std?: number
  verdict?: string
  [key: string]: unknown
}

export type SpecialistForecast = {
  ok?: boolean
  as_of?: string
  horizon?: string
  value?: number | null
  sigma?: number | null
  confidence?: number | null
  abstain?: boolean
  class_id?: number | null
  proba?: number[] | null
  error?: string
}

export type SpecialistRecord = {
  ok?: boolean
  slug: string
  name: string
  handle: string
  target: string
  task: SpecialistTask | string
  horizon: SpecialistHorizon | string
  indicators: string[]
  instructions: string
  windows?: Record<string, SpecialistWindowScore>
  skill?: number | null
  skill_20?: number | null
  skill_50?: number | null
  skill_100?: number | null
  verdict?: string | null
  saved?: boolean
  reason?: string | null
  last_forecast?: SpecialistForecast | null
  forecast?: SpecialistForecast | null
  disclaimer?: string
  from_date?: string | null
  to_date?: string | null
  error?: string
}

export type SpecialistTrainInput = {
  name: string
  target: string
  indicators: string[]
  instructions: string
  task?: SpecialistTask | null
  horizon?: SpecialistHorizon
  n?: number | null
  force?: boolean
  era?: "current" | "all"
  hidden?: number
  epochs?: number
}

const DEFAULT_FEATURES: SpecialistFeature[] = [
  { id: "lag1", label: "Lag 1 (dernière valeur)", family: "lags", period: 1, reading: SPECIALIST_FEATURE_READINGS.lag1 },
  { id: "lag2", label: "Lag 2", family: "lags", period: 2, reading: SPECIALIST_FEATURE_READINGS.lag2 },
  { id: "lag3", label: "Lag 3", family: "lags", period: 3, reading: SPECIALIST_FEATURE_READINGS.lag3 },
  { id: "rsi", label: "RSI 14", family: "momentum", period: 14, reading: SPECIALIST_FEATURE_READINGS.rsi },
  { id: "macd", label: "MACD ligne", family: "momentum", period: 26, reading: SPECIALIST_FEATURE_READINGS.macd },
  { id: "macd_hist", label: "MACD histogramme", family: "momentum", period: 35, reading: SPECIALIST_FEATURE_READINGS.macd_hist },
  { id: "bollinger", label: "Bollinger %B", family: "volatilite", period: 20, reading: SPECIALIST_FEATURE_READINGS.bollinger },
  { id: "sma", label: "SMA 20", family: "moyennes", period: 20, reading: SPECIALIST_FEATURE_READINGS.sma },
  { id: "ema", label: "EMA 20", family: "moyennes", period: 20, reading: SPECIALIST_FEATURE_READINGS.ema },
  { id: "atr", label: "Étendue moyenne |Δ|", family: "volatilite", period: 14, reading: SPECIALIST_FEATURE_READINGS.atr },
  { id: "stoch", label: "Stochastique %K", family: "momentum", period: 14, reading: SPECIALIST_FEATURE_READINGS.stoch },
  { id: "cci", label: "CCI", family: "momentum", period: 20, reading: SPECIALIST_FEATURE_READINGS.cci },
  { id: "zscore", label: "Z-score 20", family: "volatilite", period: 20, reading: SPECIALIST_FEATURE_READINGS.zscore },
  { id: "range8", label: "Étendue 8", family: "volatilite", period: 8, reading: SPECIALIST_FEATURE_READINGS.range8 },
  { id: "slope", label: "Pente 10", family: "tendance", period: 10, reading: SPECIALIST_FEATURE_READINGS.slope },
]

function hydrateFeatures(items: SpecialistFeature[]): SpecialistFeature[] {
  const fallbacks = new Map(DEFAULT_FEATURES.map((item) => [item.id, item]))
  return items.map((item) => {
    const fallback = fallbacks.get(item.id)
    const reading =
      (typeof item.reading === "string" && item.reading.trim()) ||
      fallback?.reading ||
      SPECIALIST_FEATURE_READINGS[item.id]
    return {
      id: item.id,
      label: item.label || fallback?.label || item.id,
      family: item.family || fallback?.family || "autres",
      period: typeof item.period === "number" ? item.period : (fallback?.period ?? 1),
      reading,
    }
  })
}

let index: SpecialistRecord[] = []
let featuresCache: SpecialistFeature[] = DEFAULT_FEATURES

export function specialistIndex() {
  return index
}

export function setSpecialistIndex(items: SpecialistRecord[]) {
  index = items
}

export function specialistFeatures() {
  return featuresCache
}

export function specialistToEntry(item: SpecialistRecord): CatalogEntry {
  const handle = item.slug || item.handle.replace(/^specialist\./, "")
  const aliases = [item.handle.replace(/^@/, ""), `specialist.${handle}`]
  if (handle === "paire-impair") {
    aliases.push("specialist.pere-impair", "pere-impair")
  }
  return {
    id: `specialist/${handle}`,
    handle,
    aliases,
    lab: "specialist",
    family: "specialiste",
    kind: "specialist",
    label: item.name,
    units: "forecast t+1",
    reading: item.instructions,
    defaults: { variable: (item.target as VariableName) || "sum" },
  }
}

export function specialistEntries(): CatalogEntry[] {
  return index.map(specialistToEntry)
}

export function specialistCatalogEntry(id: string): CatalogEntry | undefined {
  return specialistEntries().find((entry) => entry.id === id)
}

export function specialistByHandle(handle: string): SpecialistRecord | undefined {
  const key = handle.replace(/^@/, "").replace(/^specialist\./, "").toLowerCase()
  return index.find((item) => item.slug === key || item.handle.replace(/^specialist\./, "") === key)
}

function failMessage(body: { error?: string; detail?: unknown; reason?: string | null }, fallback: string) {
  if (typeof body.error === "string" && body.error) return body.error
  if (typeof body.detail === "string" && body.detail) return body.detail
  if (typeof body.reason === "string" && body.reason) return body.reason
  return fallback
}

async function parsePayload(response: Response) {
  const body = (await response.json().catch(() => ({}))) as SpecialistRecord & {
    items?: SpecialistRecord[]
    error?: string
    detail?: unknown
    ok?: boolean
  }
  if (typeof body.detail === "string") body.error = body.error || body.detail
  else if (Array.isArray(body.detail)) {
    const msgs = body.detail.map((item) => (item && typeof item === "object" && "msg" in item ? String(item.msg) : String(item)))
    body.error = body.error || msgs.join("; ")
  }
  return body
}

export async function listSpecialists() {
  try {
    const response = await fetch("/api/brain/specialists", { cache: "no-store" })
    const body = await parsePayload(response)
    const items = Array.isArray(body.items) ? body.items : []
    setSpecialistIndex(items)
    return { ok: response.ok, items, error: typeof body.error === "string" ? body.error : undefined }
  } catch (error) {
    return { ok: false, items: [] as SpecialistRecord[], error: error instanceof Error ? error.message : "API injoignable" }
  }
}

export async function listSpecialistFeatures() {
  try {
    const response = await fetch("/api/brain/specialists/features", { cache: "no-store" })
    const body = (await response.json().catch(() => ({}))) as { items?: SpecialistFeature[] }
    if (Array.isArray(body.items) && body.items.length) {
      featuresCache = hydrateFeatures(body.items)
    }
    return featuresCache
  } catch {
    return featuresCache
  }
}

function weekdayQuerySuffix(scope?: WeekdayScope | null) {
  const day = scope == null ? weekdayApiFromBrowser() : weekdayApiValue(scope)
  return day ? `&weekday=${day}` : ""
}

export async function trainSpecialist(
  input: SpecialistTrainInput,
  scope?: WeekdayScope | null
) {
  const response = await fetch(`/api/brain/specialists?era=${input.era ?? "current"}${weekdayQuerySuffix(scope)}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
    cache: "no-store",
  })
  const body = await parsePayload(response)
  if (!response.ok) {
    throw new Error(failMessage(body, `HTTP ${response.status}`))
  }
  return body as SpecialistRecord
}

export async function inferSpecialist(
  slug: string,
  era: "current" | "all" = "current",
  scope?: WeekdayScope | null
) {
  const response = await fetch(
    `/api/brain/specialists/${encodeURIComponent(slug)}/infer?era=${era}${weekdayQuerySuffix(scope)}`,
    {
    method: "POST",
    headers: { "content-type": "application/json" },
    cache: "no-store",
  })
  const body = await parsePayload(response)
  if (!response.ok) {
    throw new Error(failMessage(body, `HTTP ${response.status}`))
  }
  return body as SpecialistRecord
}

export async function deleteSpecialist(slug: string) {
  const response = await fetch(`/api/brain/specialists/${encodeURIComponent(slug)}`, { method: "DELETE", cache: "no-store" })
  if (!response.ok && response.status !== 404) {
    const body = await parsePayload(response)
    throw new Error(failMessage(body, `HTTP ${response.status}`))
  }
  return true
}

export function formatSpecialistHandle(slug: string) {
  return `@specialist.${slug.replace(/^@/, "").replace(/^specialist\./, "")}`
}
