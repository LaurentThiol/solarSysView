import { series, wilson, type AnalysisDraw, type VariableName } from "@/lib/analysis"
import { activityFromClose } from "@/lib/ta"

import { labelOf } from "./catalog"
import { detectFigures } from "./figures"

/**
 * Taux de base : combien de hasard porte la même figure ?
 *
 * Une figure n'a de valeur que par écart au bruit. Si les trois quarts des
 * fenêtres de bruit de la même longueur portent une tête & épaules, en voir une
 * n'apprend rien — la mesure inconfortable est celle qui compte.
 *
 * Le hasard est tiré des tirages eux-mêmes, remis dans un ordre quelconque,
 * plutôt que d'une marche gaussienne. Une marche est non bornée et sans lien
 * avec la courbe lue, si bien qu'elle sous-estimait le bruit partout où la
 * courbe est bornée — et la plupart le sont. `n1` ne descend pas sous 1 et passe
 * l'essentiel de son temps entre 1 et 10 : deux passages sur le plancher ne
 * forment pas un double creux, ils forment un plancher. La parité tient dans
 * 0–5 avec des ex æquo à chaque tirage, et une marche continue n'en produit
 * jamais. Le remaniement, lui, garde exactement les bornes, les paliers et les
 * ex æquo de la courbe qu'on regarde, puisque ce sont les mêmes valeurs.
 *
 * Ce que la mesure teste est alors exactement la prétention du chartisme : que
 * l'ordre des tirages porte une forme. Ce qu'elle ne teste pas : que les
 * tirages soient équiprobables — elle les prend comme ils sont.
 *
 * Le jumeau Python (`synchro/chartisme/backtest.py`) fait le même calcul sur
 * l'archive. Celui-ci tourne dans le navigateur, sur la courbe, l'échelle et le
 * seuil affichés, parce qu'un taux de base écrit en dur n'en suit aucun.
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

/** Nombre de remaniements par échantillon — assez pour un ordre de grandeur, pas plus. */
export const DEFAULT_TRIALS = 120

/**
 * Tirages de contexte gardés devant la fenêtre simulée.
 *
 * Le retard d'une boule a besoin d'avoir vu passer cette boule au moins une
 * fois, faute de quoi ses premiers points ne sont qu'une rampe « jamais sortie »
 * qu'aucune vraie fenêtre ne montre ; la MM20 a besoin de ses vingt points.
 * Deux cents tirages couvrent largement les deux. Au-delà, chaque remaniement
 * paierait un tri de toute l'archive sans rien changer à la fenêtre lue.
 */
const SIMULATED_CONTEXT = 200

/**
 * Fisher-Yates sur les tirages, dates réattribuées dans l'ordre croissant.
 *
 * La réattribution n'est pas cosmétique : `series` retrie ses tirages par date,
 * donc un mélange qui garderait les dates d'origine serait défait aussitôt.
 */
function shuffled(draws: AnalysisDraw[], random: () => number): AnalysisDraw[] {
  const dates = draws.map((draw) => draw.date).sort((a, b) => a.localeCompare(b))
  const picks = draws.slice()
  for (let i = picks.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1))
    const swap = picks[i]
    picks[i] = picks[j]
    picks[j] = swap
  }
  return picks.map((pick, index) => ({ ...pick, date: dates[index] }))
}

export type BaseRateSample = {
  length: number
  trials: number
  /** Par remaniement : la meilleure confiance obtenue par chaque figure trouvée. */
  perWindow: Array<Record<string, number>>
}

/**
 * Figures trouvées sur `trials` remaniements, dans une fenêtre de `length` points.
 *
 * Une seule fenêtre par remaniement, comme le jumeau Python : le taux mesuré est
 * celui d'une fenêtre de balayage, pas celui d'une courbe entière — sur
 * laquelle le balayage multiplie les occasions.
 *
 * La courbe est recalculée à chaque fois plutôt que ses valeurs mélangées : sur
 * `delay`, mélanger les valeurs donnerait une série qu'aucun ordre de tirages ne
 * peut produire — le retard monte de un en un entre deux sorties — et le bruit
 * simulé serait plus sage que le vrai.
 */
export function sampleBaseRate(
  draws: AnalysisDraw[],
  variable: string,
  n: number | null,
  length: number,
  options: { trials?: number; seed?: number } = {}
): BaseRateSample {
  const { trials = DEFAULT_TRIALS, seed = 1 } = options
  // Moins de tirages que l'échelle demandée : il n'y a pas de fenêtre à simuler,
  // et `scaleFitNote` le dit déjà à côté.
  if (length < 2 || draws.length < length) return { length, trials: 0, perWindow: [] }
  const pool = draws.slice(-(length + SIMULATED_CONTEXT))
  const random = mulberry32(seed)
  const perWindow: Array<Record<string, number>> = []
  for (let trial = 0; trial < trials; trial += 1) {
    const payload = series(shuffled(pool, random), variable as VariableName, n ?? undefined)
    const values = payload.values.slice(-length)
    const best: Record<string, number> = {}
    // Seuil zéro et dédoublonnage désactivé. Le second n'est pas un détail : la
    // hiérarchie de `dedupe` place une cassure confirmée devant une figure plus
    // confiante de même nom, si bien qu'à seuil zéro une cassure peu confiante
    // évincerait une figure que le seuil aurait gardée — le taux relu tomberait
    // sous le taux réel, et le taux de base se tromperait en sa faveur. Sans
    // dédoublonnage, une figure est présente au seuil `b` exactement quand sa
    // meilleure confiance atteint `b` : la relecture est alors exacte.
    for (const hit of detectFigures(values, null, activityFromClose(values), {
      minConfidence: 0,
      maxOverlap: 1,
    })) {
      const seen = best[hit.figure]
      if (seen === undefined || hit.confidence > seen) best[hit.figure] = hit.confidence
    }
    perWindow.push(best)
  }
  return { length, trials, perWindow }
}

export type BaseRate = {
  length: number
  trials: number
  /** Part des remaniements portant au moins une figure au-dessus du seuil. */
  carrying: number
  /** Intervalle de Wilson sur cette part : à 120 remaniements, il reste large. */
  interval: [number, number]
  /** Médiane de la meilleure confiance obtenue, fenêtres sans figure exclues. */
  medianBest: number | null
  figures: Array<{ figure: string; label: string; rate: number }>
}

/** Relecture d'un échantillon à un seuil donné — sans le refaire. */
export function baseRateAbove(sample: BaseRateSample, minConfidence: number): BaseRate {
  const counts = new Map<string, number>()
  const bests: number[] = []
  let carrying = 0
  for (const window of sample.perWindow) {
    let best = 0
    for (const [figure, confidence] of Object.entries(window)) {
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

/**
 * Plafond au-delà duquel un seuil ne trie plus rien.
 *
 * C'est celui du curseur de confiance, et il ne s'arrête pas là par hasard : une
 * confiance de 0.95 exige un ajustement géométrique quasi parfait, que presque
 * aucune figure réelle n'atteint. Au-dessus, le seuil ne sépare plus le bruit de
 * la figure — il rejette les deux. Une rareté qui demande davantage est donc
 * hors d'atteinte sur cette courbe, et le dire vaut mieux que rendre un seuil
 * qui vide le tracé en laissant croire qu'on a réglé quelque chose.
 */
export const MAX_THRESHOLD = 0.95

/** Pas du seuil rendu : plus fin, il afficherait une précision qu'il n'a pas. */
const THRESHOLD_STEP = 0.01

/** Meilleure confiance par remaniement, 0 quand la fenêtre n'a rien porté. */
function bestPerWindow(sample: BaseRateSample): number[] {
  return sample.perWindow.map((window) => {
    let best = 0
    for (const confidence of Object.values(window)) if (confidence > best) best = confidence
    return best
  })
}

export type BaseRateThreshold = {
  length: number
  trials: number
  /** Rareté visée : part des fenêtres de bruit qu'on accepte de voir porter une figure. */
  target: number
  /** Seuil qui tient la cible, `null` quand aucun seuil lisible n'y parvient. */
  threshold: number | null
  /** Ce que ce seuil obtient vraiment : le pas de 0.01 ne tombe jamais pile. */
  achieved: number
  /** Seuil qu'il aurait fallu, même hors d'atteinte — pour dire de combien on manque. */
  required: number
}

/**
 * L'inverse du taux de base : quel seuil de confiance obtient la rareté visée ?
 *
 * Le taux de base décroît quand le seuil monte, donc l'inversion se lit
 * directement dans la distribution des meilleures confiances obtenues sur le
 * bruit. Pour n'accepter qu'une part `p` de fenêtres de bruit porteuses, le
 * seuil doit dépasser la (p·N + 1)-ième meilleure confiance : au-dessus d'elle,
 * il n'en reste au plus que p·N.
 *
 * L'intérêt du renversement est qu'un seuil de confiance ne veut pas dire la
 * même chose d'une courbe à l'autre ni d'une échelle à l'autre — à l'échelle 60,
 * 0.60 laisse passer tout le bruit sur « paires consécutives » et les deux tiers
 * sur la somme. Une rareté visée, elle, dit la même chose partout : c'est le seul
 * réglage de l'onglet qui se compare.
 */
export function thresholdForBaseRate(
  sample: BaseRateSample,
  target: number
): BaseRateThreshold {
  const base = { length: sample.length, trials: sample.trials, target }
  if (!sample.trials) return { ...base, threshold: null, achieved: 0, required: 1 }
  const bests = bestPerWindow(sample).sort((a, b) => b - a)
  // Nombre de fenêtres de bruit porteuses qu'on tolère. Tronqué, jamais arrondi :
  // viser 20 % sur 120 remaniements autorise 24 fenêtres, pas 24,4.
  const allowed = Math.floor(target * sample.trials)
  const rate = (bar: number) => bests.filter((best) => best >= bar).length / sample.trials
  if (allowed >= sample.trials) return { ...base, threshold: 0, achieved: rate(0), required: 0 }
  // La valeur qu'il faut dépasser, et le premier cran de la grille qui la dépasse.
  const floorValue = bests[allowed] ?? 0
  const steps = Math.floor(floorValue / THRESHOLD_STEP + 1e-9) + 1
  const required = Math.min(1, Math.round(steps * THRESHOLD_STEP * 100) / 100)
  if (required > MAX_THRESHOLD) return { ...base, threshold: null, achieved: rate(required), required }
  return { ...base, threshold: required, achieved: rate(required), required }
}

/**
 * Même inversion, pour une figure nommée plutôt que pour « n'importe laquelle ».
 *
 * Le seuil d'ensemble est dicté par le motif le plus bruyant : sur une somme,
 * les triangles passent à 0.65 dans la moitié du hasard, donc un double creux
 * à 0.40 — que ce même hasard produit à peine — disparaissait avec eux. Juger
 * chaque figure à son propre taux rend le badge « rare » comparable d'un motif
 * à l'autre, et surtout ne fait plus payer aux lectures discrètes le bavardage
 * des bornes.
 *
 * Une figure absente de l'échantillon a un seuil de 0.01 : le hasard ne l'a
 * pas produite, n'importe quelle occurrence réelle est donc distinctive.
 */
export function thresholdForFigure(
  sample: BaseRateSample,
  figure: string,
  target: number
): BaseRateThreshold {
  return thresholdForBaseRate(
    {
      ...sample,
      perWindow: sample.perWindow.map((window) => {
        const confidence = window[figure]
        return confidence == null ? {} : { [figure]: confidence }
      }),
    },
    target
  )
}

/** Seuil de rareté de chaque figure vue (ou non) dans l'échantillon. */
export function figureThresholds(
  sample: BaseRateSample,
  target: number
): Record<string, BaseRateThreshold> {
  const names = new Set<string>()
  for (const window of sample.perWindow) {
    for (const figure of Object.keys(window)) names.add(figure)
  }
  const out: Record<string, BaseRateThreshold> = {}
  for (const figure of names) out[figure] = thresholdForFigure(sample, figure, target)
  return out
}

/**
 * Cette lecture est-elle rare, à la rareté visée, pour *sa* figure ?
 *
 * `undefined` dans la carte : le hasard n'a jamais produit ce motif à cette
 * échelle, donc n'importe quelle occurrence réelle est distinctive. `null` :
 * aucun seuil lisible ne sépare ce motif du bruit — il n'est jamais rare.
 */
export function hitIsRare(
  hit: { figure: string; scale: number; confidence: number },
  bars: Readonly<Record<number, Readonly<Record<string, BaseRateThreshold>>>> | null,
  fallback: number
): boolean {
  if (!bars) return hit.confidence >= fallback
  const row = bars[hit.scale]?.[hit.figure]
  if (row == null) return true
  if (row.threshold == null) return false
  return hit.confidence >= row.threshold
}

function pct(value: number) {
  return `${Math.round(value * 100)} %`
}

/**
 * Ce que la rareté visée exige, échelle par échelle.
 *
 * Le nombre affiché n'est plus un réglage mais un résultat : le seuil est
 * cherché, pas choisi. C'est ce renversement qui rend la lecture comparable —
 * d'une échelle à l'autre, et surtout d'une courbe à l'autre, ce qu'un seuil de
 * confiance n'a jamais permis.
 */
export function rarityNote(
  thresholds: ReadonlyArray<BaseRateThreshold>,
  target: number
): string | null {
  const measured = thresholds.filter((entry) => entry.trials > 0)
  if (!measured.length) return null
  const parts = measured
    .map((entry) =>
      entry.threshold === null
        ? `échelle ${entry.length} : hors d'atteinte (il faudrait ${entry.required.toFixed(
            2
          )}), écartée du balayage`
        : `échelle ${entry.length} : seuil ${entry.threshold.toFixed(2)}, obtenu ${pct(
            entry.achieved
          )}`
    )
    .join(" · ")
  const trials = measured[0].trials
  const reachable = measured.filter((entry) => entry.threshold !== null)
  const note = `Lu en rareté visée ${pct(
    target
  )} : le seuil de confiance n'est plus choisi mais cherché sur cette courbe, pour que le hasard ne produise plus qu'une fenêtre porteuse sur ${
    target > 0 ? Math.round(1 / target) : 1
  } — ${parts}. Le bruit est fait des mêmes tirages remis dans un ordre quelconque, ${trials} fois par échelle, et l'obtenu s'écarte de la cible parce qu'un seuil ne se règle qu'au centième. C'est le seul réglage de l'onglet qui dise la même chose partout : à ${pct(
    target
  )}, une figure sur la somme et une figure sur « paires consécutives » sont également peu banales, là où un seuil de 0.60 laissait passer les deux tiers du bruit de l'une et la totalité de celui de l'autre.`
  if (reachable.length === measured.length) return note
  const lost = measured.length - reachable.length
  return `${note} ${
    reachable.length
      ? `${lost} échelle${lost > 1 ? "s" : ""} sur ${measured.length} est écartée`
      : "Aucune échelle ne l'atteint"
  } : au-delà de ${MAX_THRESHOLD.toFixed(
    2
  )} un seuil ne sépare plus le bruit de la figure, il rejette les deux. Sur cette courbe et à cette échelle, le chartisme n'a rien à dire à cette rareté — viser plus large, ou changer de courbe.`
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
 * Les deux nombres sont mesurés à l'instant sur la courbe affichée, aux échelles
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
  )} — ${parts}. Le bruit est fait des mêmes tirages remis dans un ordre quelconque, ${trials} fois par échelle : le taux garde donc les bornes, les paliers et les ex æquo de cette courbe-ci, ce qu'une marche gaussienne ignorait. Il teste exactement la prétention du chartisme — que l'ordre des tirages porte une forme — et rien d'autre : l'équiprobabilité des tirages n'est pas mise en cause, ils sont pris comme ils sont. L'intervalle dit ce que ce nombre de remaniements permet d'affirmer. Un seuil de confiance ne veut pas dire la même chose d'une échelle à l'autre : il est escompté selon la part de fenêtre couverte, et une figure courte couvre presque tout son tracé. En contrepartie une fenêtre courte offre moins de pivots, donc moins d'occasions qu'une forme s'ajuste.`
}
