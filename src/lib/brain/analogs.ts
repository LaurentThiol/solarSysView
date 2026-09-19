import type { WorkingObject } from "./types.ts"
import {
  DEFAULT_TWIN_K,
  FINGERPRINT_AXES,
  buildFingerprintIndex,
  formatDeltaChip,
  isFingerprintAxis,
  parseFingerprintAxes,
  type FingerprintAxis,
  type FingerprintDraw,
  type TwinHit,
} from "../fingerprints.ts"

export type AnalogQuery = {
  date?: string | null
  numbers?: number[] | null
  stars?: number[] | null
  axes?: string[] | null
  k?: number
  era?: string
  from?: string | null
  to?: string | null
  draws?: FingerprintDraw[]
}

export type AnalogItem = TwinHit

export type AnalogsResult = {
  ok: boolean
  axes: FingerprintAxis[]
  query: {
    date: string
    numbers: number[]
    stars: number[]
    params: TwinHit["params"]
  } | null
  items: AnalogItem[]
  source?: string
  error?: string
}

function localAnalogs(input: AnalogQuery): AnalogsResult {
  const index = buildFingerprintIndex(input.draws ?? [], {
    axes: input.axes,
    queryDate: input.date,
    queryDraw:
      !input.date && input.numbers && input.stars
        ? { date: "query", numbers: input.numbers, stars: input.stars }
        : null,
    k: input.k ?? DEFAULT_TWIN_K,
  })
  return {
    ok: true,
    axes: index.axes,
    query: index.query
      ? {
          date: index.query.date,
          numbers: index.query.numbers,
          stars: index.query.stars,
          params: index.query.params,
        }
      : null,
    items: index.neighbors,
    source: "local",
  }
}

export async function retrieveAnalogs(input: AnalogQuery): Promise<AnalogsResult> {
  try {
    const response = await fetch("/api/brain/analogs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        date: input.date || undefined,
        numbers: input.numbers || undefined,
        stars: input.stars || undefined,
        axes: input.axes || undefined,
        k: input.k ?? DEFAULT_TWIN_K,
        era: input.era ?? "current",
        from_date: input.from || undefined,
        to_date: input.to || undefined,
      }),
    })
    const body = (await response.json().catch(() => null)) as
      | (AnalogsResult & { items?: AnalogItem[] })
      | null
    if (response.ok && body && Array.isArray(body.items)) {
      return {
        ok: Boolean(body.ok),
        axes: parseFingerprintAxes(body.axes),
        query: body.query,
        items: body.items,
        source: body.source ?? "api",
      }
    }
  } catch {
    /* API absente : calcul local */
  }
  return localAnalogs(input)
}

export function analogAxesFromObjects(objects: WorkingObject[]): FingerprintAxis[] {
  const seen = new Set<FingerprintAxis>()
  for (const item of objects) {
    if (item.kind === "analog" || item.fiche?.handle === "analogs") continue
    const variable = item.fiche?.params.variable
    if (isFingerprintAxis(variable)) seen.add(variable)
  }
  return seen.size ? [...seen] : [...FINGERPRINT_AXES]
}

export function wantsAnalogs(objects: WorkingObject[], question = ""): boolean {
  if (/@analogs\b|@jumeaux\b|@twins\b/i.test(question)) return true
  return objects.some((item) => {
    if (item.kind === "analog" || item.fiche?.handle === "analogs" || item.handle.includes("@analogs")) {
      return true
    }
    return item.fiche?.lab === "analyse" && isFingerprintAxis(item.fiche.handle)
  })
}

export function analogRetrieveHint(objects: WorkingObject[]): { date?: string; axes?: string[] } {
  const pack = objects.find((item) => item.kind === "analog" && item.id === "analyse/analogs")
  const query = pack?.fiche?.last.query
  const axesRaw = pack?.fiche?.last.axes
  const date = typeof query === "string" && query ? query : undefined
  const axes =
    typeof axesRaw === "string"
      ? axesRaw.split(",").map((item) => item.trim()).filter(Boolean)
      : undefined
  return { date, axes }
}

export function mergeAnalogPack(objects: WorkingObject[], pack: WorkingObject[]): WorkingObject[] {
  if (!pack.length) return objects
  const ids = new Set(pack.map((item) => item.id))
  const handles = new Set(pack.map((item) => item.handle))
  const kept = objects.filter((item) => !ids.has(item.id) && !handles.has(item.handle))
  return [...pack, ...kept]
}

export function analogWorkingObjects(result: AnalogsResult): WorkingObject[] {
  if (!result.query) return []
  const axes = result.axes
  const summaryAxes = axes.slice(0, 6).join(", ")
  const top = result.items[0]
  const objects: WorkingObject[] = [
    {
      kind: "analog",
      id: "analyse/analogs",
      handle: "@analogs",
      label: "Jumeaux",
      inPrompt: true,
      summary: top
        ? `${result.items.length} jumeaux · query ${result.query.date} · top ${top.date} · ${summaryAxes}`
        : `Aucun jumeau · query ${result.query.date}`,
      score: top?.score,
      fiche: {
        id: "analyse/analogs",
        handle: "analogs",
        lab: "analyse",
        label: "Jumeaux",
        units: "cosinus · z-score",
        reading: "Ressemblance d’archive sur les axes cités, pas un pronostic.",
        params: { variable: "sum", n: null, periodX: 20, curveId: null },
        window: {
          preset: "last_100",
          from: null,
          to: null,
          n: result.items.length,
          warmup: 0,
          banner: `${result.items.length} jumeaux`,
        },
        last: {
          query: result.query.date,
          k: result.items.length,
          axes: axes.join(", "),
          top: top?.date ?? null,
          score: top?.score ?? null,
        },
        flags: [],
        flagged: false,
        summary: top
          ? `Jumeaux · ${result.query.date} · top ${top.date} score ${top.score}`
          : `Jumeaux · ${result.query.date}`,
        disclaimer: "Les tirages sont indépendants. Un jumeau décrit l’archive.",
      },
    },
  ]
  for (const item of result.items) {
    const chips = axes
      .map((axis) => (item.delta[axis] == null ? null : formatDeltaChip(axis, item.delta[axis] as number)))
      .filter((chip): chip is string => Boolean(chip))
    objects.push({
      kind: "analog",
      id: `analog-${item.date}`,
      handle: `@analogs#${item.date}`,
      label: item.date,
      inPrompt: true,
      summary: `score ${item.score} · ${chips.slice(0, 5).join(" · ")}`,
      score: item.score,
      fiche: {
        id: `analog-${item.date}`,
        handle: "analogs",
        lab: "analyse",
        label: item.date,
        units: "unités Analyse",
        reading: "Voisin dans l’espace des variables. Delta = voisin − query.",
        params: { variable: "sum", n: null, periodX: 20, curveId: null },
        window: {
          preset: "last_100",
          from: null,
          to: null,
          n: 1,
          warmup: 0,
          banner: item.date,
        },
        last: {
          date: item.date,
          grid: `${item.numbers.join(" ")} + ${item.stars.join(" ")}`,
          score: item.score,
          delta: chips.join(" · "),
          sum: item.params.sum,
          spread: item.params.spread,
          parity: item.params.parity,
        },
        flags: [],
        flagged: false,
        summary: `${item.date} · score ${item.score}`,
        disclaimer: "Ressemblance d’archive, pas P(prochain tirage).",
      },
    })
  }
  return objects
}
