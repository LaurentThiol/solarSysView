import { BRAIN_CATALOG, catalogEntry, type CatalogEntry } from "@/lib/brain/catalog"
import { parseCurveId, curveSpecs } from "@/lib/chartisme/curves"
import { resolveEntry } from "@/lib/brain/resolve"
import type { ResolveContext, WalkerJob, WalkerState } from "@/lib/brain/types"

export type WalkerMode = "catalog" | "curves" | "demo"

export function newWalkerId() {
  return `walk-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
}

export function catalogJobs(): WalkerJob[] {
  return BRAIN_CATALOG.map((entry) => ({
    id: entry.id,
    catalogId: entry.id,
    handle: `@${entry.handle}`,
    label: entry.label,
    lab: entry.lab,
    mode: "catalog",
    status: "queued",
  }))
}

export function curveJobs(): WalkerJob[] {
  return curveSpecs().map((spec) => {
    const id = spec.n == null ? spec.variable : `${spec.variable}:${spec.n}`
    return {
      id: `curve/${id}`,
      catalogId: "chartisme/ete",
      handle: `@curve:${id}`,
      label: id,
      lab: "chartisme",
      mode: "curves" as const,
      curveId: id,
      status: "queued" as const,
    }
  })
}

export function createWalker(mode: WalkerMode, cloudLots = false): WalkerState {
  return {
    id: newWalkerId(),
    mode,
    status: "idle",
    index: 0,
    jobs: mode === "curves" ? curveJobs() : catalogJobs(),
    flagged: [],
    localCalls: 0,
    cloudCalls: 0,
    notes: 0,
    tokensApprox: 0,
    startedAt: null,
    cloudLots,
  }
}

export async function runJob(
  job: WalkerJob,
  ctx: Omit<ResolveContext, "entry">,
  entryFor = catalogEntry
): Promise<WalkerJob> {
  const startedAt = new Date().toISOString()
  try {
    if (job.mode === "curves" && job.curveId) {
      const figures = BRAIN_CATALOG.filter((item) => item.lab === "chartisme")
      const spec = parseCurveId(job.curveId)
      const fiches = []
      for (const entry of figures) {
        const fiche = await resolveEntry({
          ...ctx,
          entry,
          curveId: job.curveId,
          variableOverride: spec.variable as ResolveContext["variable"],
          nOverride: spec.n,
        })
        fiches.push(fiche)
      }
      const flagged = fiches.filter((item) => item.flagged)
      const merged = flagged[0] ?? fiches[0]
      const summary = flagged.length
        ? `${job.curveId} · ${flagged.map((item) => item.handle).join(", ")}`
        : `${job.curveId} · aucune figure flaggée`
      const fiche = merged
        ? {
            ...merged,
            id: job.id,
            handle: job.handle,
            label: job.label,
            flagged: flagged.length > 0,
            flags: flagged.flatMap((item) => item.flags),
            summary,
            last: {
              curve: job.curveId,
              figures: flagged.map((item) => item.handle).join(",") || "—",
              hits: flagged.length,
            },
          }
        : undefined
      return {
        ...job,
        status: flagged.length ? "flagged" : "resolved",
        fiche,
        startedAt,
        finishedAt: new Date().toISOString(),
      }
    }
    const entry: CatalogEntry | undefined = entryFor(job.catalogId)
    if (!entry) {
      return { ...job, status: "error", error: "entrée inconnue", startedAt, finishedAt: new Date().toISOString() }
    }
    const fiche = await resolveEntry({ ...ctx, entry })
    return {
      ...job,
      status: fiche.error ? "error" : fiche.flagged ? "flagged" : "resolved",
      fiche,
      error: fiche.error ?? null,
      startedAt,
      finishedAt: new Date().toISOString(),
    }
  } catch (error) {
    return {
      ...job,
      status: "error",
      error: error instanceof Error ? error.message : "échec",
      startedAt,
      finishedAt: new Date().toISOString(),
    }
  }
}

export const LLM_LOT_SIZE = 10
export const CLOUD_LOT_CONFIRM = 3

export function nextLot(jobs: WalkerJob[], size = LLM_LOT_SIZE) {
  return jobs.filter((job) => job.status === "flagged" && job.fiche).slice(0, size)
}

export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

export function flaggedLots(jobs: WalkerJob[], size = LLM_LOT_SIZE) {
  return chunk(nextLot(jobs, jobs.length), size)
}

export function approxTokens(text: string) {
  return Math.max(1, Math.ceil(text.length / 4))
}
