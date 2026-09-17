/**
 * Bandeau des lectures au-dessus du tracé : quelles marques couvrent un
 * tirage, et laquelle un clic doit retenir.
 *
 * Les rectangles se chevauchent encore un peu — `collapseZones` n'avale que
 * les recouvrements francs — donc un clic ne désigne pas toujours une seule
 * lecture. On prend la plus courte d'abord : c'est celle dont la marque est
 * la plus localisée. Un second clic au même endroit passe à la suivante.
 */

export type BannerSpan = {
  from_index: number
  to_index: number
}

/** Indices des lectures qui couvrent un échantillon, la plus courte d'abord. */
export function coveringHitIndices(
  hits: ReadonlyArray<BannerSpan>,
  sample: number
): number[] {
  return hits
    .map((hit, index) => ({
      index,
      span: hit.to_index - hit.from_index,
      covers: sample >= hit.from_index && sample <= hit.to_index,
    }))
    .filter((row) => row.covers)
    .sort((a, b) => a.span - b.span || a.index - b.index)
    .map((row) => row.index)
}

/** Lecture affichée au survol : celle déjà retenue, sinon la plus courte. */
export function hoverHitIndex(
  covering: readonly number[],
  current: number
): number | null {
  if (!covering.length) return null
  if (current >= 0 && covering.includes(current)) return current
  return covering[0] ?? null
}

/** Prochaine lecture d'une liste : la suivante si on tient déjà l'une d'elles. */
export function cycleHitIndex(
  indices: readonly number[],
  current: number
): number | null {
  if (!indices.length) return null
  const pos = indices.indexOf(current)
  if (pos === -1) return indices[0] ?? null
  return indices[(pos + 1) % indices.length] ?? null
}

/** Indices des lectures d'un libellé, dans l'ordre du bandeau. */
export function hitIndicesForLabel<T extends { label: string }>(
  hits: ReadonlyArray<T>,
  label: string
): number[] {
  return hits.flatMap((hit, index) => (hit.label === label ? [index] : []))
}
