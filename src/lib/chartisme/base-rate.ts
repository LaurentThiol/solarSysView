import { wilson } from "@/lib/analysis"
import { activityFromClose } from "@/lib/ta"

import { labelOf } from "./catalog"
import { detectFigures } from "./figures"

/**
 * Taux de base : combien de hasard porte la même figure ?
 *
 * Une figure n'a de valeur que par écart au bruit. Si les trois quarts des
 * marches aléatoires de la même longueur portent une tête & épaules, en voir
 * une n'apprend rien — la mesure inconfortable est celle qui compte.
 *
 * Le jumeau Python (`synchro/chartisme/backtest.py`) fait le même calcul sur
 * l'archive. Celui-ci tourne dans le navigateur, à l'échelle et au seuil
 * affichés, parce qu'un taux de base écrit en dur ne suit ni l'un ni l'autre :
 * il croît avec la longueur balayée et se lit contre le seuil courant.
 *
 * L'échantillonnage ignore le seuil et retient toutes les confiances : bouger
 * le curseur relit alors le même échantillon au lieu de le refaire.
 */

/** Générateur déterministe : le même bandeau ne doit pas changer d'un rendu à l'autre. */
function mulberry32(seed: number) {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Box-Muller : deux uniformes donnent une normale centrée réduite. */
function gauss(random: () => number) {
  const u = Math.max(random(), Number.EPSILON)
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * random())
}

export function randomWalk(length: number, random: () => number, step = 1): number[] {
  const values = [100]
  for (let i = 1; i < length; i += 1) values.push(values[i - 1] + gauss(random) * step)
  return values
}

/** Nombre de marches par échantillon — assez pour un ordre de grandeur, pas plus. */
export const DEFAULT_TRIALS = 120

export type BaseRateSample = {
  length: number
  trials: number
  /** Par marche : la meilleure confiance obtenue par chaque figure trouvée. */
  perWalk: Array<Record<string, number>>
}

/**
 * Figures trouvées sur `trials` marches aléatoires de `length` points.
 *
 * Une seule fenêtre par marche, comme le jumeau Python : le taux mesuré est
 * celui d'une fenêtre de balayage, pas celui d'une courbe entière — sur
 * laquelle le balayage multiplie les occasions.
 */
export function sampleBaseRate(
  length: number,
  options: { trials?: number; seed?: number } = {}
): BaseRateSample {
  const { trials = DEFAULT_TRIALS, seed = 1 } = options
  const random = mulberry32(seed)
  const perWalk: Array<Record<string, number>> = []
  for (let trial = 0; trial < trials; trial += 1) {
    const values = randomWalk(length, random)
    const best: Record<string, number> = {}
    for (const hit of detectFigures(values, null, activityFromClose(values), {
      minConfidence: 0,
    })) {
      const seen = best[hit.figure]
      if (seen === undefined || hit.confidence > seen) best[hit.figure] = hit.confidence
    }
    perWalk.push(best)
  }
  return { length, trials, perWalk }
}

export type BaseRate = {
  length: number
  trials: number
  /** Part des marches portant au moins une figure au-dessus du seuil. */
  carrying: number
  /** Intervalle de Wilson sur cette part : à 120 marches, il reste large. */
  interval: [number, number]
  /** Médiane de la meilleure confiance obtenue, marches sans figure exclues. */
  medianBest: number | null
  figures: Array<{ figure: string; label: string; rate: number }>
}

/** Relecture d'un échantillon à un seuil donné — sans le refaire. */
export function baseRateAbove(sample: BaseRateSample, minConfidence: number): BaseRate {
  const counts = new Map<string, number>()
  const bests: number[] = []
  let carrying = 0
  for (const walk of sample.perWalk) {
    let best = 0
    for (const [figure, confidence] of Object.entries(walk)) {
      if (confidence < minConfidence) continue
      counts.set(figure, (counts.get(figure) ?? 0) + 1)
      if (confidence > best) best = confidence
    }
    if (best > 0) {
      carrying += 1
      bests.push(best)
    }
  }
  bests.sort((a, b) => a - b)
  const middle = Math.floor(bests.length / 2)
  const interval = wilson(carrying, sample.trials)
  return {
    length: sample.length,
    trials: sample.trials,
    carrying: sample.trials ? carrying / sample.trials : 0,
    interval: [interval.lo, interval.hi],
    medianBest: bests.length
      ? bests.length % 2
        ? bests[middle]
        : (bests[middle - 1] + bests[middle]) / 2
      : null,
    figures: [...counts.entries()]
      .map(([figure, count]) => ({
        figure,
        label: labelOf(figure),
        rate: count / sample.trials,
      }))
      .sort((a, b) => b.rate - a.rate),
  }
}

function pct(value: number) {
  return `${Math.round(value * 100)} %`
}

/**
 * Ce qu'une échelle fait à la lecture, chiffré au lieu d'illustré.
 *
 * Deux effets se cumulent et jouent en sens contraire, ce qui interdit de
 * comparer un seuil de confiance d'une échelle à l'autre. La confiance est
 * escomptée selon la part de fenêtre couverte, donc une figure courte, qui
 * couvre presque tout son tracé, la gagne sans rien gagner en substance. Mais
 * une fenêtre courte offre moins de pivots, donc moins d'occasions qu'une forme
 * s'ajuste : la figure y est plus rare, donc moins banale.
 *
 * Les deux nombres sont mesurés à l'instant sur du bruit, aux échelles
 * réellement balayées. C'est le seul point de comparaison honnête pour la
 * confiance affichée à côté.
 */
export function baseRateNote(rates: ReadonlyArray<BaseRate>, minConfidence: number): string | null {
  const measured = rates.filter((rate) => rate.trials > 0)
  if (!measured.length) return null
  const parts = measured
    .map(
      (rate) =>
        `échelle ${rate.length} : ${pct(rate.carrying)} (${pct(rate.interval[0])} – ${pct(
          rate.interval[1]
        )})${rate.medianBest == null ? "" : `, confiance médiane ${rate.medianBest.toFixed(2)}`}`
    )
    .join(" · ")
  const trials = measured[0].trials
  return `Part des fenêtres de bruit portant une figure au-dessus de ${minConfidence.toFixed(
    2
  )} — ${parts}. Mesuré à l'instant sur ${trials} marches aléatoires par échelle ; l'intervalle dit ce que ce nombre de marches permet d'affirmer. Un seuil de confiance ne veut donc pas dire la même chose d'une échelle à l'autre : elle est escomptée selon la part de fenêtre couverte, et une figure courte couvre presque tout son tracé. En contrepartie une fenêtre courte offre moins de pivots, donc moins d'occasions qu'une forme s'ajuste.`
}
