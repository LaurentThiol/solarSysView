/** Overlay « 1er rang » (0 = jackpot gagné, +1 = report) sur les courbes d’évolution. */

export function modeOffersRank1(mode: string): boolean {
  return mode === "eachNumber" || mode === "sumNumbers"
}

export function appendRank1Key<K extends string>(
  mode: string,
  keys: readonly K[],
  hasRank1: boolean
): Array<K | "rank1"> {
  if (!modeOffersRank1(mode) || !hasRank1) return [...keys]
  return [...keys, "rank1"]
}

export function splitRank1Axis(mode: string, visibleKeys: readonly string[]): boolean {
  return (
    modeOffersRank1(mode) &&
    visibleKeys.includes("rank1") &&
    visibleKeys.some((key) => key !== "rank1")
  )
}

/** Première série encore affichée, hors 1er rang. Null si plus aucune : mardi / vendredi ne restent pas collés à une série masquée. */
export function weekdaySplitSeries<K extends string>(visibleKeys: readonly K[]): K | null {
  return visibleKeys.find((key) => key !== "rank1") ?? null
}

export function chartYDomain(
  mode: string,
  visibleKeys: readonly string[]
): [number, number] | [number, "auto"] {
  if (mode === "sumBoth") return [0, 100]
  if (visibleKeys.length === 1 && visibleKeys[0] === "rank1") return [0, 1]
  if (mode === "eachNumber") return [1, 50]
  if (mode === "eachStar") return [1, 12]
  if (mode === "sumStars") return [3, "auto"]
  return [15, "auto"]
}
