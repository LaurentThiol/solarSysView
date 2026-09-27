import { isRailFigure } from "../chartisme/catalog"

import { MIN_SKETCH_BARS, windowTooShort } from "./place"
import { isFreeFigure, type LiveCursor, type SketchHandle } from "./types"

export const FREE_PARALLEL_HINT =
  "Segment fixé. Clique pour poser la droite parallèle. Échap garde le segment seul."

export const FREE_SEGMENT_TOO_SHORT_HINT =
  "Choisis un autre tirage pour fermer le segment."

export const FIGURE_TOO_SHORT_HINT = "Au moins 8 tirages pour refermer la figure."

export function tooShortHint(figure: string) {
  return isFreeFigure(figure) ? FREE_SEGMENT_TOO_SHORT_HINT : FIGURE_TOO_SHORT_HINT
}

export const FREE_SEGMENT_KEPT_HINT =
  "Segment conservé. Clique un nouveau départ, ou un point pour le reprendre."

export const FREE_PARALLEL_DONE_HINT =
  "Parallèles posées. Clique un nouveau départ, ou un point pour le reprendre."

export const FREE_PARALLEL_TOO_CLOSE_HINT =
  "Écarte le curseur de la première droite pour poser la parallèle."

export function drawingStartHint(figure: string) {
  if (isRailFigure(figure)) return "Clique le premier point de la borne, ou un point déjà posé."
  if (isFreeFigure(figure)) {
    return "Clique le départ. Le clic d’après le segment pose la parallèle."
  }
  return "Clique le départ, ou un point déjà posé pour le reprendre."
}

export function placementHint(options: {
  live: LiveCursor | null
  startIndex: number | null
  midIndex?: number | null
  rails?: boolean
  free?: boolean
  parallel?: boolean
  moving?: SketchHandle | null
  hoverHandle?: SketchHandle | null
  shortWindow?: boolean
  minBars?: number
}) {
  const { live, startIndex, midIndex, rails, free, parallel, moving, hoverHandle, shortWindow } =
    options
  const minBars = options.minBars ?? MIN_SKETCH_BARS
  const hasStart = startIndex != null
  const hasMid = midIndex != null
  if (moving === "start") {
    if (!live) return "Reprise du départ — survole la courbe."
    if (shortWindow) return free ? FREE_SEGMENT_TOO_SHORT_HINT : FIGURE_TOO_SHORT_HINT
    if (!live.snapped) {
      return rails
        ? "Approche un pivot pour reposer le départ."
        : "Approche la courbe pour reposer le départ."
    }
    return "Clique pour reposer le départ."
  }
  if (moving === "mid") {
    if (!live) return "Reprise du second point de la borne — survole la courbe."
    if (shortWindow) return FIGURE_TOO_SHORT_HINT
    if (!live.snapped) return "Approche un pivot pour reposer le second point."
    return "Clique pour reposer le second point de la borne."
  }
  if (moving === "end") {
    if (parallel) {
      if (!live) return "Reprise de la parallèle — survole le graphique."
      if (shortWindow) return free ? FREE_SEGMENT_TOO_SHORT_HINT : FIGURE_TOO_SHORT_HINT
      return "Clique pour reposer la parallèle. L’ordonnée suit le curseur."
    }
    if (!live) {
      return rails
        ? "Reprise du contact opposé — survole la courbe."
        : "Reprise de l’arrivée — survole la courbe."
    }
    if (shortWindow) return free ? FREE_SEGMENT_TOO_SHORT_HINT : FIGURE_TOO_SHORT_HINT
    if (live.offCurve) return "Point hors courbe — clique pour reposer."
    if (!live.snapped) {
      return "Approche un pivot de touche, ou Hors courbe (⌥), pour poser hors courbe."
    }
    return rails
      ? "Clique pour reposer le contact opposé. Hors courbe ou ⌥."
      : "Clique pour reposer l’arrivée. Hors courbe ou ⌥."
  }
  if (hoverHandle && !hasStart) {
    return "Clique ou glisse ce point pour le déplacer."
  }
  if (!live) return "Survole la courbe."
  if (parallel && hasStart && hasMid) return FREE_PARALLEL_HINT
  if (live.offCurve) {
    if (
      startIndex != null &&
      live.index !== startIndex &&
      windowTooShort(startIndex, live.index, minBars)
    ) {
      return minBars <= 2
        ? FREE_SEGMENT_TOO_SHORT_HINT
        : "Au moins 8 tirages entre le premier point et celui-ci."
    }
    return "Point hors courbe — clique pour poser."
  }
  if (!live.snapped) {
    if (hasStart) {
      return free
        ? "Clique pour fixer le segment. Hors courbe ou ⌥ : l’ordonnée suit le curseur."
        : "Clique pour fixer l’arrivée. Hors courbe ou ⌥ : l’ordonnée suit le curseur."
    }
    return "Approche un pivot pour ancrer la borne."
  }
  if (
    startIndex != null &&
    live.index !== startIndex &&
    windowTooShort(startIndex, live.index, minBars) &&
    !hasMid
  ) {
    return minBars <= 2 ? FREE_SEGMENT_TOO_SHORT_HINT : FIGURE_TOO_SHORT_HINT
  }
  if (rails && hasStart && !hasMid) return "Clique le second point de la borne."
  if (rails && hasMid) return "Clique le contact opposé — le parallèle (ou la seconde borne)."
  if (hasStart && free) {
    return "Clique l’arrivée. Le clic suivant pose la parallèle. Hors courbe ou ⌥."
  }
  if (hasStart) return "Clique l’arrivée. Hors courbe ou ⌥ : l’ordonnée suit le curseur."
  return rails
    ? "Clique le premier point de la borne, ou un point déjà posé."
    : "Clique le départ, ou un point déjà posé pour le reprendre."
}
