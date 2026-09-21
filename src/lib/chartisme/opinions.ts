/**
 * Lecture des réseaux sur la tranche d'une figure, à côté de la géométrie.
 *
 * Le backend renvoie `annotate()` sous `models`. Sans poids, ou sans Python,
 * le bloc est vide : la fiche le dit et garde la géométrie et le DTW.
 */

export type ModelOpinion = {
  detector: string
  figure: string | null
  label: string | null
  confidence: number
  abstained: boolean
  candidates: Array<{ figure: string; label: string }>
}

export type DetectModels = {
  status: "ready" | "absent"
  geometric: string | null
  opinions: ModelOpinion[]
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object") return null
  return value as Record<string, unknown>
}

/** Ce que `POST /api/chartisme/detect` avec `models: true` donne à afficher. */
export function interpretDetectResponse(payload: unknown): DetectModels {
  const absent = { status: "absent" as const, geometric: null, opinions: [] }
  const body = asRecord(payload)
  if (!body || body.ok === false) return absent
  const block = asRecord(body.models)
  if (!block) return absent
  const geometric = typeof block.geometric === "string" ? block.geometric : null
  const models = asRecord(block.models)
  if (!models) return { status: "absent", geometric, opinions: [] }
  const opinions: ModelOpinion[] = []
  for (const [name, value] of Object.entries(models)) {
    const row = asRecord(value)
    if (!row) continue
    const candidates = Array.isArray(row.candidates)
      ? row.candidates.flatMap((item) => {
          const candidate = asRecord(item)
          if (!candidate) return []
          return [
            {
              figure: String(candidate.figure ?? ""),
              label: String(candidate.label ?? candidate.figure ?? ""),
            },
          ]
        })
      : []
    opinions.push({
      detector: String(row.detector ?? name),
      figure: row.figure == null ? null : String(row.figure),
      label: row.label == null ? null : String(row.label),
      confidence: Number(row.confidence ?? 0),
      abstained: Boolean(row.abstained) || row.figure == null,
      candidates,
    })
  }
  if (!opinions.length) return { status: "absent", geometric, opinions: [] }
  return { status: "ready", geometric, opinions }
}

/** Une ligne de fiche : le réseau, son abstention, et l'accord avec la géométrie. */
export function opinionSentence(opinion: ModelOpinion, geometric: string): string {
  const name = opinion.detector
  if (opinion.abstained || !opinion.figure) {
    const extra = opinion.candidates
      .map((candidate) => candidate.label)
      .filter(Boolean)
      .slice(0, 3)
      .join(", ")
    return extra ? `${name} s'abstient · candidats ${extra}` : `${name} s'abstient`
  }
  const label = opinion.label || opinion.figure
  const agree =
    opinion.figure === geometric
      ? " · d'accord avec la géométrie"
      : " · autre lecture que la géométrie"
  return `${name} : ${label} · ${opinion.confidence.toFixed(2)}${agree}`
}
