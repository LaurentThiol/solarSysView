import { defaultNumberShape, defaultStarShape } from "@/lib/grid-shape"
import {
  defaultChance,
  defaultStoredSpec,
  type PoolSpec,
  type StoredSpec,
} from "@/lib/jeux"
import { tighten, type StackState } from "@/lib/pronostic"

export const PRONOSTIC_SESSION_KEY = "synchro.pronostic.v1"

export function stackToPoolSpec(state: StackState): PoolSpec {
  const tight = tighten(state).state
  const shape = tight.kind === "numbers" ? defaultNumberShape() : defaultStarShape()
  return {
    kind: tight.kind,
    chance: defaultChance(tight.kind),
    threshold: 1,
    forced: [],
    minSum: tight.minSum,
    maxSum: tight.maxSum,
    minEven: tight.minEven,
    maxEven: tight.maxEven,
    minSpread: shape.minSpread,
    maxSpread: shape.maxSpread,
    minConsecutive: shape.minConsecutive,
    maxConsecutive: shape.maxConsecutive,
    decadeMin: [...shape.decadeMin],
    decadeMax: [...shape.decadeMax],
    slotBands: tight.slots,
  }
}

export function stacksToStoredSpec(numbers: StackState, stars: StackState): StoredSpec {
  const numberSpec = stackToPoolSpec({ ...numbers, kind: "numbers" })
  const starSpec = stackToPoolSpec({ ...stars, kind: "stars" })
  const chanceNumbers = numberSpec.chance.slice(1)
  const chanceStars = starSpec.chance.slice(1)
  return {
    ...defaultStoredSpec(),
    numberChance: chanceNumbers,
    starChance: chanceStars,
    numberMinSum: numberSpec.minSum,
    numberMaxSum: numberSpec.maxSum,
    numberMinEven: numberSpec.minEven,
    numberMaxEven: numberSpec.maxEven,
    starMinSum: starSpec.minSum,
    starMaxSum: starSpec.maxSum,
    starMinEven: starSpec.minEven,
    starMaxEven: starSpec.maxEven,
    numberSlotBands: numberSpec.slotBands,
    starSlotBands: starSpec.slotBands,
  }
}
