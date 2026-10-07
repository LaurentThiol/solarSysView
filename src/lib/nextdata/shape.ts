/** Étendue et consécutifs, mêmes comptes que la page Évolution. */

import { consecutiveCount, spreadOf } from "@/lib/grid-shape"

export type GridShape = {
  spread: number
  consecutive: number
  starSpread: number
  starConsecutive: number
}

export function gridShape(numbers: number[], stars: number[]): GridShape {
  return {
    spread: spreadOf(numbers),
    consecutive: consecutiveCount(numbers),
    starSpread: spreadOf(stars),
    starConsecutive: consecutiveCount(stars),
  }
}

export function shapeCaption(numbers: number[], stars: number[]) {
  const shape = gridShape(numbers, stars)
  return `Étendue ${shape.spread} · consécutifs ${shape.consecutive} · étendue ★ ${shape.starSpread} · consécutifs ★ ${shape.starConsecutive}`
}
