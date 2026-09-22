import {
  drawSize,
  poolSize,
  universeWays,
  type PoolKind,
  type SlotBand,
} from "./bounds.ts"
import { tighten, isImpossible } from "./propagate.ts"
import {
  clampStack,
  unconstrained,
  type LayerId,
  type StackState,
} from "./state.ts"

function emptyDp(maxK: number, maxSum: number, maxEven: number) {
  return Array.from({ length: maxK + 1 }, () =>
    Array.from({ length: maxSum + 1 }, () => new Int32Array(maxEven + 1))
  )
}

export function countOrdered(input: {
  kind: PoolKind
  minSum: number
  maxSum: number
  minEven: number
  maxEven: number
  slots: SlotBand[]
}): number {
  const draw = drawSize(input.kind)
  const pool = poolSize(input.kind)
  if (input.slots.length !== draw) return 0
  if (input.minSum > input.maxSum || input.minEven > input.maxEven) return 0
  const maxK = draw
  const maxSum = Math.max(0, input.maxSum)
  const maxEven = Math.max(0, Math.min(draw, input.maxEven))
  if (maxSum < input.minSum || maxEven < input.minEven) return 0
  const dp = emptyDp(maxK, maxSum, maxEven)
  dp[0][0][0] = 1
  for (let value = 1; value <= pool; value += 1) {
    const even = value % 2 === 0 ? 1 : 0
    for (let k = maxK; k >= 1; k -= 1) {
      const band = input.slots[k - 1]
      if (value < band.lo || value > band.hi) continue
      for (let s = maxSum; s >= value; s -= 1) {
        for (let e = maxEven; e >= even; e -= 1) {
          const prev = dp[k - 1][s - value][e - even]
          if (prev) dp[k][s][e] += prev
        }
      }
    }
  }
  let total = 0
  const sLo = Math.max(0, input.minSum)
  const sHi = Math.min(maxSum, input.maxSum)
  const eLo = Math.max(0, input.minEven)
  const eHi = Math.min(maxEven, input.maxEven)
  for (let s = sLo; s <= sHi; s += 1) {
    for (let e = eLo; e <= eHi; e += 1) {
      total += dp[draw][s][e]
    }
  }
  return total
}

export function countStack(state: StackState) {
  const tight = tighten(state).state
  if (isImpossible(tight)) return 0
  return countOrdered({
    kind: tight.kind,
    minSum: tight.minSum,
    maxSum: tight.maxSum,
    minEven: tight.minEven,
    maxEven: tight.maxEven,
    slots: tight.slots,
  })
}

export type CascadeStep = {
  id: "universe" | LayerId
  label: string
  count: number
}

const LAYER_LABELS: Record<LayerId, string> = {
  sum: "Somme",
  parity: "Parité",
  slots: "Espaces",
}

function copyLayerConstraints(from: StackState, id: LayerId, into: StackState) {
  if (id === "sum") {
    into.minSum = from.minSum
    into.maxSum = from.maxSum
  } else if (id === "parity") {
    into.minEven = from.minEven
    into.maxEven = from.maxEven
    into.parityMode = from.parityMode
  } else {
    into.slots = from.slots.map((band) => ({ ...band }))
  }
}

export function cascadeCounts(state: StackState): CascadeStep[] {
  const source = clampStack(state)
  const steps: CascadeStep[] = [
    {
      id: "universe",
      label: "Univers",
      count: universeWays(source.kind),
    },
  ]
  const acc = unconstrained(source.kind)
  acc.kind = source.kind
  for (const layer of source.layers) {
    if (!layer.enabled) continue
    acc.layers = acc.layers.map((item) =>
      item.id === layer.id ? { ...item, enabled: true } : item
    )
    copyLayerConstraints(source, layer.id, acc)
    steps.push({
      id: layer.id,
      label: LAYER_LABELS[layer.id],
      count: countStack(acc),
    })
  }
  return steps
}

export function remainingFraction(kind: PoolKind, count: number) {
  const universe = universeWays(kind)
  if (!universe) return 0
  return count / universe
}
