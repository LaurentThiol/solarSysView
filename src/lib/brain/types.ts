import type { VariableName } from "@/lib/analysis"
import type { WindowPreset } from "@/lib/analysis-window"
import type { CombinationGrid } from "@/lib/combinations"
import type { AnalysisDraw } from "@/lib/analysis"
import type { CatalogEntry } from "@/lib/brain/catalog"
import type { HarmoReport } from "@/lib/harmo"

export type BrainWindowMeta = {
  preset: WindowPreset
  from: string | null
  to: string | null
  n: number
  warmup: number
  banner: string
}

export type BrainFiche = {
  id: string
  handle: string
  lab: string
  label: string
  units: string
  reading: string
  params: {
    variable: VariableName | null
    n: number | null
    periodX: number
    curveId: string | null
  }
  window: BrainWindowMeta
  last: Record<string, number | string | boolean | null>
  stats?: Record<string, number | null>
  flags: string[]
  flagged: boolean
  summary: string
  disclaimer: string
  error?: string | null
}

export type ResolveContext = {
  archive: AnalysisDraw[]
  work: AnalysisDraw[]
  withWarmup: AnalysisDraw[]
  warmupCount: number
  variable: VariableName
  ball: number
  star: number
  curveId: string
  periodX: number
  window: BrainWindowMeta
  era: string
  source: string
  grid: CombinationGrid | null
  entry: CatalogEntry
  nOverride?: number | null
  variableOverride?: VariableName | null
  fetchHarmo?: (path: string, params: URLSearchParams) => Promise<HarmoReport>
}

export type WalkerJobStatus = "queued" | "running" | "resolved" | "skipped" | "flagged" | "error"

export type WalkerJob = {
  id: string
  catalogId: string
  handle: string
  label: string
  lab: string
  mode: "catalog" | "curves" | "demo"
  curveId?: string
  status: WalkerJobStatus
  fiche?: BrainFiche
  readingId?: number | string
  error?: string | null
  startedAt?: string
  finishedAt?: string
}

export type WalkerState = {
  id: string
  mode: "catalog" | "curves" | "demo"
  status: "idle" | "running" | "paused" | "done" | "error"
  index: number
  jobs: WalkerJob[]
  flagged: BrainFiche[]
  localCalls: number
  cloudCalls: number
  notes: number
  tokensApprox: number
  error?: string | null
  startedAt: string | null
  cloudLots: boolean
}

export type WorkingKind = "pin" | "current" | "lot" | "memory" | "shortlist"

export type WorkingObject = {
  kind: WorkingKind
  id: string
  handle: string
  label: string
  inPrompt: boolean
  summary: string
  fiche?: BrainFiche
  score?: number
}
