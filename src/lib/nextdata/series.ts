/** Courbes de nextData : niveaux ou DeltaEvol, et la bande du prochain tirage. */

export type SeriesRow = Record<string, string | number | null | undefined>

function finite(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null
}

function gap(current: unknown, prior: unknown): number | null {
  const now = finite(current)
  const before = finite(prior)
  if (now == null || before == null) return null
  return Math.round((now - before) * 100) / 100
}

/**
 * En DeltaEvol, chaque trait devient l’écart à son pas d’avant. La bande du
 * prochain tirage se lit contre le dernier tirage sorti, comme le trait Sorti.
 * Dans les deux lectures, la bande part du dernier point sorti.
 */
export function seriesRows(rows: SeriesRow[], dataKey: string, primary: string, delta: boolean): SeriesRow[] {
  const keys = [
    dataKey,
    `${dataKey}_corpus`,
    `${dataKey}_fenetre`,
    `${dataKey}_corpus_catboost`,
    `${dataKey}_fenetre_catboost`,
  ]
  const loKey = `${dataKey}_${primary}_lo`
  const hiKey = `${dataKey}_${primary}_hi`
  const data = rows.map((row, index) => {
    const next = { ...row }
    if (!delta) return next
    const previous = rows[index - 1]
    for (const key of keys) next[key] = gap(row[key], previous?.[key])
    if (row.kind === "forecast") {
      next[loKey] = gap(row[loKey], previous?.[dataKey])
      next[hiKey] = gap(row[hiKey], previous?.[dataKey])
    }
    return next
  })
  const last = data[data.length - 1]
  const prev = data[data.length - 2]
  if (last?.kind === "forecast" && prev) {
    prev[loKey] = prev[dataKey]
    prev[hiKey] = prev[dataKey]
  }
  return data
}
