import { windowTooShort } from "./place"
import type { LiveCursor, SketchHandle } from "./types"

export function placementHint(options: {
  live: LiveCursor | null
  startIndex: number | null
  midIndex?: number | null
  rails?: boolean
  moving?: SketchHandle | null
  hoverHandle?: SketchHandle | null
  shortWindow?: boolean
}) {
  const { live, startIndex, midIndex, rails, moving, hoverHandle, shortWindow } = options
  const hasStart = startIndex != null
  const hasMid = midIndex != null
  if (moving === "start") {
    if (!live) return "Reprise du départ — survole la courbe."
    if (shortWindow) return "Au moins 8 tirages pour refermer la figure."
    if (!live.snapped) {
      return rails
        ? "Approche un pivot pour reposer le départ."
        : "Approche la courbe pour reposer le départ."
    }
    return "Clique pour reposer le départ."
  }
  if (moving === "mid") {
    if (!live) return "Reprise du second point de la borne — survole la courbe."
    if (shortWindow) return "Au moins 8 tirages pour refermer la figure."
    if (!live.snapped) return "Approche un pivot pour reposer le second point."
    return "Clique pour reposer le second point de la borne."
  }
  if (moving === "end") {
    if (!live) {
      return rails
        ? "Reprise du contact opposé — survole la courbe."
        : "Reprise de l’arrivée — survole la courbe."
    }
    if (shortWindow) return "Au moins 8 tirages pour refermer la figure."
    if (live.offCurve) return "Point hors courbe — clique pour reposer."
    if (!live.snapped) {
      return "Approche un pivot de touche, ou Alt (⌥) pour poser hors courbe."
    }
    return rails
      ? "Clique pour reposer le contact opposé. Alt (⌥) : hors courbe."
      : "Clique pour reposer l’arrivée. Alt (⌥) : hors courbe."
  }
  if (hoverHandle && !hasStart) {
    return "Clique ou glisse ce point pour le déplacer."
  }
  if (!live) return "Survole la courbe."
  if (live.offCurve) {
    if (
      startIndex != null &&
      live.index !== startIndex &&
      windowTooShort(startIndex, live.index)
    ) {
      return "Au moins 8 tirages entre le premier point et celui-ci."
    }
    return "Point hors courbe — clique pour poser."
  }
  if (!live.snapped) {
    if (hasStart) return "Approche un pivot de touche, ou Alt (⌥) pour poser hors courbe."
    return "Approche un pivot pour ancrer la borne."
  }
  if (
    startIndex != null &&
    live.index !== startIndex &&
    windowTooShort(startIndex, live.index) &&
    !hasMid
  ) {
    return "Au moins 8 tirages pour refermer la figure."
  }
  if (rails && hasStart && !hasMid) return "Clique le second point de la borne."
  if (rails && hasMid) return "Clique le contact opposé — le parallèle (ou la seconde borne)."
  if (hasStart) return "Clique l’arrivée. Alt (⌥) : hors courbe."
  return rails
    ? "Clique le premier point de la borne, ou un point déjà posé."
    : "Clique le départ, ou un point déjà posé pour le reprendre."
}
