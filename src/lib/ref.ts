export type LunarDay = {
  date: string
  age_days: number
  fraction: number
  illumination: number
  phase: string
  phase_label: string
  next: Record<string, string>
  synodic_days: number
}

export type LunarReport = {
  ok: boolean
  title: string
  period_days: number
  note: string
  today: LunarDay
  month: LunarDay[]
  error?: string
}

export type CarringtonState = {
  number: number
  fraction: number
  period_days: number
  rotation_start: string
  rotation_end: string
}

export type SchwabeState = {
  cycle: number | null
  fraction: number | null
  minimum?: string
  next_minimum_estimate?: string
  bounded_by_observed_minimum?: boolean
  mean_years?: number
  note?: string
}

export type SolarReport = {
  ok: boolean
  title: string
  note: string
  date: string
  carrington: CarringtonState
  schwabe: SchwabeState
  sunpy: { available: boolean; version?: string | null; hint?: string }
  error?: string
}

export type CatalogItem = {
  id: string
  label: string
  period: string
  kind: string
  source: string
  why: string
}

export type CatalogReport = {
  ok: boolean
  note: string
  active: string[]
  items: CatalogItem[]
  error?: string
}

export type GoesBlock = {
  rows: number
  columns: string[]
  preview: Record<string, string>[]
}

export type GoesReport = {
  ok: boolean
  kind: string
  label: string
  file_num: number | null
  blocks: GoesBlock[]
  note: string
  error?: string
}

async function readJson<T>(response: Response): Promise<T> {
  const text = await response.text()
  const parsed = text ? (JSON.parse(text) as T & { detail?: unknown; error?: string }) : ({} as T)
  if (!response.ok) {
    const detail = (parsed as { detail?: unknown }).detail
    const message =
      typeof detail === "string"
        ? detail
        : (parsed as { error?: string }).error || `HTTP ${response.status}`
    throw new Error(message)
  }
  return parsed
}

export function fetchLunar(day: string) {
  const query = new URLSearchParams({ date: day })
  return fetch(`/api/ref/lunar?${query}`, { cache: "no-store" }).then((response) =>
    readJson<LunarReport>(response)
  )
}

export function fetchSolar(day: string) {
  const query = new URLSearchParams({ date: day })
  return fetch(`/api/ref/solar?${query}`, { cache: "no-store" }).then((response) =>
    readJson<SolarReport>(response)
  )
}

export function fetchCatalog() {
  return fetch("/api/ref/catalog", { cache: "no-store" }).then((response) =>
    readJson<CatalogReport>(response)
  )
}

export function fetchGoes(start: string, end: string, kind: "xrs" | "flares") {
  const query = new URLSearchParams({ start, end, kind })
  return fetch(`/api/ref/solar/goes?${query}`, { cache: "no-store" }).then((response) =>
    readJson<GoesReport>(response)
  )
}
