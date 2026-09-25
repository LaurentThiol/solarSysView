/** Ce que la lecture en trois couches a produit sur une fenêtre, et ce qui bouge. */

export type PulseHit = {
  figure: string
  detector?: string
  agreed?: boolean
}

export type ReadingPulse = {
  total: number
  agreed: number
  motifOnly: number
  shared: number | null
  appeared: number | null
  gone: number | null
}

function plural(count: number, one: string, many: string) {
  return `${count} ${count === 1 ? one : many}`
}

/** Effectifs de la fenêtre courante, et écart avec la fenêtre précédente. */
export function readingPulse(hits: PulseHit[], previous: PulseHit[] | null): ReadingPulse {
  const agreed = hits.filter((hit) => hit.agreed).length
  const motifOnly = hits.filter((hit) => hit.detector === "motif").length
  if (!previous) {
    return { total: hits.length, agreed, motifOnly, shared: null, appeared: null, gone: null }
  }
  const now = new Set(hits.map((hit) => hit.figure))
  const before = new Set(previous.map((hit) => hit.figure))
  let shared = 0
  let appeared = 0
  for (const figure of now) {
    if (before.has(figure)) shared += 1
    else appeared += 1
  }
  let gone = 0
  for (const figure of before) {
    if (!now.has(figure)) gone += 1
  }
  return { total: hits.length, agreed, motifOnly, shared, appeared, gone }
}

/** Phrase affichée sous l'état du module. */
export function pulseSentence(pulse: ReadingPulse, hasCurve: boolean) {
  if (!hasCurve) {
    return "Les trois couches sont prêtes : épines, graphe de visibilité, motifs. Elles liront dès que les tirages seront chargés."
  }
  const figures = plural(pulse.total, "figure", "figures")
  const confirmed =
    pulse.agreed > 0
      ? plural(pulse.agreed, "confirmée par le graphe", "confirmées par le graphe")
      : "graphe lu, sans recouvrement avec la géométrie"
  const motif =
    pulse.motifOnly > 0
      ? plural(pulse.motifOnly, "lue seulement comme motif", "lues seulement comme motif")
      : null
  let evolution = ""
  if (pulse.shared != null && pulse.appeared != null && pulse.gone != null) {
    const back = pulse.shared === 1 ? "revient" : "reviennent"
    evolution = ` D'une fenêtre à l'autre, ${plural(pulse.shared, "figure", "figures")} ${back}`
    if (pulse.appeared > 0) {
      evolution += `, ${plural(pulse.appeared, "apparaît", "apparaissent")}`
    }
    if (pulse.gone > 0) {
      evolution += `, ${plural(pulse.gone, "disparaît", "disparaissent")}`
    }
    evolution += "."
  }
  return `Lecture active : ${figures}, ${confirmed}${motif ? `, ${motif}` : ""}.${evolution}`
}
