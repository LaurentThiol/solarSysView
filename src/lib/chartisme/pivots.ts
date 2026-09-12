// Pivots de swing pour le chartisme.
//
// `zigzag` de `lib/ta` filtre en pourcentage du *niveau* et laisse sa direction
// indéterminée au départ : tant qu'elle l'est, l'extrême courant suit le prix
// dans les deux sens, et une oscillation entière peut être avalée en tête de
// fenêtre (une tête & épaules y perd son épaule gauche). Le seuil relatif au
// niveau n'a d'ailleurs pas de sens sur les courbes `hit` (valeurs 0/1).
//
// Ici le seuil est relatif à l'**amplitude de la fenêtre** — ce qui va de pair
// avec la normalisation dans le carré unité — et la direction initiale est levée
// en suivant simultanément le maximum et le minimum courants. Même forme de
// sortie que `zigzag` (`index`, `date`, `price`, `type`), donc `swingStructure`,
// `supportResistanceLevels` et `trendline` restent utilisables tels quels.

export const DEFAULT_PCT = 0.08

export type SwingPivot = {
  index: number
  date: string
  price: number
  type: "H" | "L"
}

export function swingThreshold(values: number[], pct: number = DEFAULT_PCT) {
  if (!values.length) return 0
  const span = Math.max(...values) - Math.min(...values)
  if (span > 0) return span * pct
  return 0
}

/** Extrêmes alternés séparés d'au moins `pct` de l'amplitude de la fenêtre. */
export function swingPivots(
  values: number[],
  dates?: string[] | null,
  pct: number = DEFAULT_PCT,
  options: { threshold?: number | null } = {}
): SwingPivot[] {
  const series = values.map(Number)
  const n = series.length
  let labels = dates ? [...dates] : []
  if (labels.length !== n) labels = series.map((_, i) => String(i))
  if (n < 2) return []
  const threshold = options.threshold
  const limit = threshold == null ? swingThreshold(series, pct) : threshold
  if (limit <= 0) return []

  const pivot = (kind: "H" | "L", index: number): SwingPivot => ({
    index,
    date: labels[index],
    price: series[index],
    type: kind,
  })

  const pivots: SwingPivot[] = []
  let hiI = 0
  let loI = 0
  let direction = 0
  for (let i = 1; i < n; i += 1) {
    const value = series[i]
    if (direction === 0) {
      if (value > series[hiI]) hiI = i
      if (value < series[loI]) loI = i
      if (series[hiI] - value >= limit) {
        // Un sommet s'est formé ; le creux qui le précède ouvre la fenêtre.
        if (loI < hiI) pivots.push(pivot("L", loI))
        pivots.push(pivot("H", hiI))
        direction = -1
        loI = i
      } else if (value - series[loI] >= limit) {
        if (hiI < loI) pivots.push(pivot("H", hiI))
        pivots.push(pivot("L", loI))
        direction = 1
        hiI = i
      }
    } else if (direction > 0) {
      if (value > series[hiI]) hiI = i
      else if (series[hiI] - value >= limit) {
        pivots.push(pivot("H", hiI))
        direction = -1
        loI = i
      }
    } else {
      if (value < series[loI]) loI = i
      else if (value - series[loI] >= limit) {
        pivots.push(pivot("L", loI))
        direction = 1
        hiI = i
      }
    }
  }

  // Dernier extrême en cours : c'est lui qui porte les figures en formation.
  if (direction > 0) pivots.push(pivot("H", hiI))
  else if (direction < 0) pivots.push(pivot("L", loI))

  const deduped: SwingPivot[] = []
  for (const item of pivots) {
    const previous = deduped[deduped.length - 1]
    if (previous && previous.index === item.index) continue
    if (previous && previous.type === item.type) {
      const better = item.type === "H" ? item.price > previous.price : item.price < previous.price
      if (better) deduped[deduped.length - 1] = item
      continue
    }
    deduped.push(item)
  }
  return deduped
}
