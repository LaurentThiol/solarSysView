export const INDEPENDENCE_DISCLAIMER =
  "Chaque tirage EuroMillions est indépendant. Les indicateurs, figures et spectres décrivent l’archive dans la fenêtre choisie. Ils ne prédisent pas le prochain tirage et ne recommandent aucune grille."

export const JSON_BUDGET = 80_000
export const SERIES_MAX_POINTS = 400
export const IMAGE_MAX_CHARS = 1_800_000

export type LabId =
  | "tirage"
  | "evolution"
  | "analyse"
  | "combinaisons"
  | "morpho"
  | "chartisme"
  | "harmo"
  | "admin"
  | "ia"
  | "other"

export type SeriesPoint = { date: string; value: number }

export type SnapshotArchive = {
  n: number | null
  from: string | null
  to: string | null
  latest: string | null
  stale: boolean | null
  source: string | null
}

export type CaptureContext = {
  lab: LabId
  tab?: string | null
  summary: string[]
  tech: Record<string, unknown>
  blocked?: { reason: string } | null
  captureRoot?: HTMLElement | null
  archive?: Partial<SnapshotArchive>
}

export type DiagnosticSnapshot = {
  id: string
  capturedAt: string
  route: string
  lab: LabId
  tab: string | null
  gitSha: string | null
  archive: SnapshotArchive
  question: string
  imageDataUrl: string | null
  summary: string[]
  tech: Record<string, unknown>
  blocked: { reason: string } | null
  disclaimer: string
}

export function newSnapshotId() {
  return `cap-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

export function labFromPath(pathname: string): LabId {
  if (pathname.startsWith("/tirage")) return "tirage"
  if (pathname.startsWith("/evolution")) return "evolution"
  if (pathname.startsWith("/analyse")) return "analyse"
  if (pathname.startsWith("/combinaisons")) return "combinaisons"
  if (pathname.startsWith("/morpho")) return "morpho"
  if (pathname.startsWith("/chartisme")) return "chartisme"
  if (pathname.startsWith("/harmo")) return "harmo"
  if (pathname.startsWith("/admin")) return "admin"
  if (pathname.startsWith("/ia")) return "ia"
  return "other"
}

export function labLabel(lab: LabId) {
  const labels: Record<LabId, string> = {
    tirage: "Tirage",
    evolution: "Évolution",
    analyse: "Analyse",
    combinaisons: "Combinaisons",
    morpho: "Morpho",
    chartisme: "Chartisme",
    harmo: "Harmo",
    admin: "Admin",
    ia: "IA",
    other: "Synchro",
  }
  return labels[lab]
}

export function lastFinite(values: Array<number | null | undefined>): number | null {
  for (let i = values.length - 1; i >= 0; i -= 1) {
    const value = values[i]
    if (typeof value === "number" && Number.isFinite(value)) return value
  }
  return null
}

export function lastFlag(values: Array<boolean | null | undefined>): boolean | null {
  for (let i = values.length - 1; i >= 0; i -= 1) {
    const value = values[i]
    if (typeof value === "boolean") return value
  }
  return null
}

export function roundish(value: number | null | undefined, digits = 4): number | null {
  if (value == null || !Number.isFinite(value)) return null
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

export function downsampleSeries<T>(points: T[], maxPoints = SERIES_MAX_POINTS): T[] {
  if (points.length <= maxPoints) return points
  const last = points.length - 1
  const out: T[] = []
  let prev = -1
  for (let i = 0; i < maxPoints; i += 1) {
    const idx = i === maxPoints - 1 ? last : Math.round((i * last) / (maxPoints - 1))
    if (idx === prev) continue
    out.push(points[idx])
    prev = idx
  }
  return out
}

export function seriesStats(points: SeriesPoint[]) {
  if (!points.length) return null
  const values = points.map((point) => point.value)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length
  return {
    n: values.length,
    min: roundish(min),
    max: roundish(max),
    mean: roundish(mean),
    first: points[0],
    last: points[points.length - 1],
  }
}

export function withinBudget(
  value: Record<string, unknown>,
  budget = JSON_BUDGET
): Record<string, unknown> {
  if (JSON.stringify(value).length <= budget) return value
  const stripped: Record<string, unknown> = { ...value, seriesOmitted: true }
  delete stripped.series
  if (JSON.stringify(stripped).length <= budget) return stripped
  return {
    truncated: true,
    seriesOmitted: true,
    window: stripped.window,
    last: stripped.last,
    hits: Array.isArray(stripped.hits) ? stripped.hits.slice(0, 4) : undefined,
    peaks: Array.isArray(stripped.peaks) ? stripped.peaks.slice(0, 6) : undefined,
    summary: stripped.summary,
    note: stripped.note ?? stripped.baseRateNote,
  }
}

export function defaultCollector(pathname: string): CaptureContext {
  if (pathname.startsWith("/admin")) {
    return {
      lab: "admin",
      summary: [],
      tech: {},
      blocked: {
        reason:
          "La page Admin affiche des secrets (URI Neon, clés API). La capture y est désactivée.",
      },
    }
  }
  const lab = labFromPath(pathname)
  return {
    lab,
    tab: null,
    summary: [`Page ${pathname || "/"}`],
    tech: { route: pathname || "/" },
  }
}

export function emptyArchive(): SnapshotArchive {
  return {
    n: null,
    from: null,
    to: null,
    latest: null,
    stale: null,
    source: null,
  }
}
