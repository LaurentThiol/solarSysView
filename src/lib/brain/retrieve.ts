export function cosine(a: number[], b: number[]) {
  const n = Math.min(a.length, b.length)
  if (!n) return 0
  let num = 0
  let na = 0
  let nb = 0
  for (let i = 0; i < n; i += 1) {
    num += a[i] * b[i]
    na += a[i] * a[i]
    nb += b[i] * b[i]
  }
  if (!na || !nb) return 0
  return num / (Math.sqrt(na) * Math.sqrt(nb))
}

export function embedText(fiche: {
  handle: string
  label?: string
  summary?: string
  last?: Record<string, unknown>
  window?: { banner?: string }
  notes?: string[]
}) {
  const last = fiche.last
    ? Object.entries(fiche.last)
        .filter(([, value]) => value != null && value !== "")
        .map(([key, value]) => `${key}=${value}`)
        .join(" ")
    : ""
  const notes = (fiche.notes ?? []).join(" ")
  return [fiche.handle, fiche.label, fiche.window?.banner, last, notes].filter(Boolean).join(" · ")
}

export function topK<T extends { embedding?: number[] | null }>(
  query: number[],
  items: T[],
  k = 8
): Array<T & { score: number }> {
  return items
    .filter((item) => Array.isArray(item.embedding) && item.embedding.length)
    .map((item) => ({ ...item, score: cosine(query, item.embedding as number[]) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, k)
}

export function sameEmbeddingModel(a?: string | null, b?: string | null) {
  if (!a || !b) return false
  return a === b
}
