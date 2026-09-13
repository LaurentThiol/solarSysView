import {
  WINDOW_PRESET_LABELS,
  resolveWindow,
  type ResolvedWindow,
  type WindowPreset,
} from "@/lib/analysis-window"

import { ACTIVITY_PERIOD } from "./figures"
import { MIN_WINDOW, type ScanHit } from "./scan"

/**
 * Fenêtre d'étude du chartisme : la zone regardée, et le contexte devant elle.
 *
 * Deux longueurs se ressemblent et ne veulent pas dire la même chose. La
 * **fenêtre d'étude** dit quels tirages t'intéressent — les 20 derniers, l'année,
 * tout. L'**échelle** dit sur combien de tirages une figure a le droit de se
 * dérouler. Chercher une tête & épaules de 120 tirages dans une fenêtre de 20
 * n'a pas de sens ; l'inverse — une figure de 20 tirages lue sur toute l'archive
 * — en a, mais ce n'est pas la même question.
 *
 * D'où le **contexte** : les tirages qui précèdent la fenêtre, calculés mais
 * pas étudiés. Sans lui, trois choses cassent en silence sur une fenêtre courte.
 * `delay` repart de zéro au premier tirage découpé et raconte un retard qui n'a
 * pas eu lieu. L'activité, dérivée de la courbe, perd son premier pas. Et la
 * MM20 de la règle d'or n'a plus vingt points devant elle. Le contexte les
 * alimente ; la fenêtre reste ce qu'on lit.
 */

/** Bornes proposées, dans le vocabulaire d'Analyse — sans les dates libres. */
export const STUDY_PRESETS = [
  "last_20",
  "last_50",
  "last_100",
  "last_200",
  "months_3",
  "months_6",
  "months_12",
  "year",
  "formula",
  "all",
] as const satisfies ReadonlyArray<WindowPreset>

export type StudyPreset = (typeof STUDY_PRESETS)[number]

export const STUDY_PRESET_LABELS = WINDOW_PRESET_LABELS

export const DEFAULT_STUDY_PRESET: StudyPreset = "all"

/** Échelles de balayage, de la plus courte à la plus longue. */
export const SCALE_LADDER = [20, 30, 60, 120] as const

/** Trois échelles suffisent : au-delà, les lectures d'une même zone se noient. */
export const MAX_AUTO_SCALES = 3

/** Contexte minimal : la MM20 de la règle d'or. */
export const CONTEXT_MIN = ACTIVITY_PERIOD

/**
 * Fenêtre d'étude la plus courte qui ait un sens.
 *
 * C'est la longueur du plus petit balayage : sous ce seuil, aucune figure ne
 * tient entièrement dans la fenêtre. Les deux nombres se confondent parce
 * qu'ils mesurent la même chose de deux côtés — la place qu'il faut à une
 * figure pour se dérouler.
 */
export const MIN_STUDY_DRAWS = MIN_WINDOW

export type ScaleChoice = "auto" | number

/**
 * Échelles retenues pour une fenêtre de `length` tirages.
 *
 * En `auto`, on ne garde que les échelles qui tiennent dans la fenêtre : une
 * figure plus longue que la zone étudiée se lirait entièrement dans le
 * contexte. L'utilisateur peut forcer une échelle plus longue — c'est alors une
 * autre question, « quelle figure longue s'achève dans ma fenêtre ».
 */
export function scalesFor(length: number, choice: ScaleChoice = "auto"): number[] {
  if (choice !== "auto") return [Math.max(MIN_WINDOW, Math.trunc(choice))]
  const fit = SCALE_LADDER.filter((size) => size <= length)
  if (!fit.length) return [Math.max(MIN_WINDOW, length)]
  return fit.slice(-MAX_AUTO_SCALES)
}

/** Tirages de contexte réclamés devant la fenêtre pour ces échelles. */
export function contextFor(scales: ReadonlyArray<number>): number {
  return Math.max(CONTEXT_MIN, ...scales.map((size) => size - 1))
}

/**
 * La figure vit-elle dans la fenêtre étudiée ?
 *
 * Une figure entièrement contenue dans le contexte appartient au passé qu'on a
 * calculé sans le lire. Une figure qui s'achève — ou qui casse — dans la
 * fenêtre est au contraire exactement ce qu'on cherche, même si son épaule
 * gauche est en amont.
 */
export function liveInWindow(hit: ScanHit, contextCount: number): boolean {
  if (contextCount <= 0) return true
  const end = Math.max(hit.to_index, hit.breakout?.index ?? hit.to_index)
  return end >= contextCount
}

export type StudyWindow<T extends { date: string }> = {
  /** Fenêtre étudiée, contexte en `warmup`. */
  window: ResolvedWindow<T>
  /** Tirages étudiés (hors contexte). */
  drawCount: number
  /** Tirages de contexte réellement disponibles. */
  contextCount: number
  /** Contexte demandé par les échelles — plus grand que le précédent en début d'archive. */
  contextWanted: number
  scales: number[]
}

/**
 * Fenêtre d'étude, contexte compris.
 *
 * Deux passes : la longueur de la fenêtre décide des échelles, qui décident du
 * contexte à réclamer. Une seule passe aurait à choisir un contexte avant de
 * savoir quelles figures on cherche.
 */
export function resolveStudyWindow<T extends { date: string; star_pool?: number }>(
  draws: T[],
  spec: { preset: StudyPreset; lastN?: number; scale?: ScaleChoice }
): StudyWindow<T> {
  const bare = resolveWindow(draws, {
    preset: spec.preset,
    lastN: spec.lastN,
    warmup: 0,
  })
  const scales = scalesFor(bare.drawCount, spec.scale ?? "auto")
  const contextWanted = contextFor(scales)
  const window = resolveWindow(draws, {
    preset: spec.preset,
    lastN: spec.lastN,
    warmup: contextWanted,
  })
  return {
    window,
    drawCount: window.drawCount,
    contextCount: window.warmupCount,
    contextWanted,
    scales,
  }
}

/** Bandeau de la fenêtre : ce qui est lu, ce qui n'est que calculé. */
export function studyBanner(study: StudyWindow<{ date: string }>): string {
  const { window, scales } = study
  if (!window.drawCount) return "Aucun tirage dans cette fenêtre."
  const context = study.contextCount
    ? `${study.contextCount} tirages de contexte en amont (calculés, pas lus)`
    : "aucun contexte disponible en amont"
  const pools = window.starPoolBreak
    ? ` · rupture star_pool (${window.starPools.join(" / ")})`
    : ""
  return `Du ${window.fromDate} au ${window.toDate} · ${window.drawCount} tirages étudiés · ${context} · échelles ${scales.join(" · ")}${pools}`
}

/**
 * Échelle plus longue que tout ce qu'on a sous la main.
 *
 * `scanCurve` ignore silencieusement une échelle plus longue que la courbe. Le
 * cas se produit en forçant 120 sur une archive courte — le repli JSON du
 * navigateur en compte moins de cent : l'onglet répondrait « aucune figure »
 * alors que rien n'a été balayé.
 */
export function scaleFitNote(
  scales: ReadonlyArray<number>,
  curveLength: number
): string | null {
  if (scales.some((size) => size <= curveLength)) return null
  const shortest = Math.min(...scales)
  return `Échelle ${shortest} : rien n'a été balayé. Il faut ${shortest} tirages consécutifs et la courbe n'en compte que ${curveLength}, contexte inclus. Repasse en « auto » ou choisis une échelle plus courte.`
}

/**
 * Fenêtre plus courte que la plus courte des figures.
 *
 * Une figure de seize tirages ne tient pas dans une fenêtre de dix. Le
 * balayage continue pourtant d'en trouver, à cheval sur le contexte : ce qu'on
 * lit alors n'est pas une figure de la fenêtre, c'en est la fin.
 */
export function shortWindowNote(drawCount: number): string | null {
  if (!drawCount || drawCount >= MIN_STUDY_DRAWS) return null
  return `Fenêtre de ${drawCount} tirages, plus courte que la plus courte des figures (${MIN_STUDY_DRAWS} tirages) : aucune ne tient entièrement dedans. Celles qui sont listées commencent dans le contexte et seule leur fin est étudiée.`
}

/**
 * Ce qu'une échelle courte fait à la lecture, dit avant de la croire.
 *
 * `weigh()` escompte la confiance selon la part de fenêtre couverte : la même
 * forme couvre toute une fenêtre de 20 et un tiers d'une fenêtre de 60. Elle y
 * gagne donc de la confiance sans rien gagner en substance — mesuré sur une
 * marche aléatoire, 0.62 à l'échelle 20 contre 0.49 à l'échelle 60 pour les
 * mêmes vingt points. Un seuil de confiance ne veut donc pas dire la même chose
 * d'une échelle à l'autre.
 *
 * La MM20, elle, ne voit que les points de la fenêtre de balayage qui précèdent
 * la cassure : sous vingt, la règle d'or compare l'activité à une moyenne de
 * quelques points.
 */
export function shortScaleCaveat(scales: ReadonlyArray<number>): string | null {
  const shortest = Math.min(...scales)
  if (shortest >= 30) return null
  return `Échelle ${shortest} : la confiance n'est pas comparable à celle d'une échelle longue. Elle est escomptée selon la part de fenêtre que la figure couvre, et une figure courte couvre presque tout son tracé — les mêmes vingt points d'une marche aléatoire valent 0.62 ici contre 0.49 à l'échelle 60. La MM20 de la règle d'or n'a pas non plus ses vingt points avant la cassure. En contrepartie une figure y est moins banale (64 % des marches aléatoires de 20 tirages en portent une, contre 83 % à 60) : le rétro-test mesure le taux de base à la longueur balayée, comparez-y.`
}
