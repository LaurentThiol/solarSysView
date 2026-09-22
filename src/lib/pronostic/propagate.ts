import {
  clampInt,
  drawSize,
  poolSize,
  sumBounds,
  theoreticalSlots,
  type PoolKind,
  type SlotBand,
} from "./bounds.ts"
import {
  clampStack,
  cloneStack,
  layerEnabled,
  type StackState,
} from "./state.ts"

export type TightResult = {
  state: StackState
  diagnostics: string[]
}

function rangeHasParity(lo: number, hi: number, even: boolean) {
  if (lo > hi) return false
  if (even) return hi >= lo + (lo % 2 === 0 ? 0 : 1)
  return hi >= lo + (lo % 2 === 1 ? 0 : 1)
}

function clipParity(lo: number, hi: number, even: boolean) {
  let a = lo
  let b = hi
  if (even) {
    if (a % 2 !== 0) a += 1
    if (b % 2 !== 0) b -= 1
  } else {
    if (a % 2 === 0) a += 1
    if (b % 2 === 0) b -= 1
  }
  return { lo: a, hi: b }
}

export function evenRangeOfSlots(slots: SlotBand[]): { min: number; max: number } | null {
  let min = 0
  let max = 0
  for (const slot of slots) {
    if (slot.lo > slot.hi) return null
    const hasEven = rangeHasParity(slot.lo, slot.hi, true)
    const hasOdd = rangeHasParity(slot.lo, slot.hi, false)
    if (!hasEven && !hasOdd) return null
    if (!hasOdd) min += 1
    if (hasEven) max += 1
  }
  return { min, max }
}

export function minIncreasingSum(slots: SlotBand[]): number | null {
  let prev = 0
  let sum = 0
  for (const slot of slots) {
    const value = Math.max(slot.lo, prev + 1)
    if (value > slot.hi) return null
    sum += value
    prev = value
  }
  return sum
}

export function maxIncreasingSum(slots: SlotBand[], pool: number): number | null {
  let next = pool + 1
  let sum = 0
  for (let i = slots.length - 1; i >= 0; i -= 1) {
    const value = Math.min(slots[i].hi, next - 1)
    if (value < slots[i].lo) return null
    sum += value
    next = value
  }
  return sum
}

export function applyMonotonic(kind: PoolKind, slots: SlotBand[]): SlotBand[] | null {
  const theo = theoreticalSlots(kind)
  const out = slots.map((band, i) => ({
    lo: clampInt(band.lo, theo[i].lo, theo[i].hi),
    hi: clampInt(band.hi, theo[i].lo, theo[i].hi),
  }))
  for (let i = 0; i < out.length; i += 1) {
    if (out[i].lo > out[i].hi) {
      const swap = out[i].lo
      out[i].lo = out[i].hi
      out[i].hi = swap
    }
  }
  for (let i = 1; i < out.length; i += 1) {
    out[i].lo = Math.max(out[i].lo, out[i - 1].lo + 1)
  }
  for (let i = out.length - 2; i >= 0; i -= 1) {
    out[i].hi = Math.min(out[i].hi, out[i + 1].hi - 1)
  }
  if (out.some((band) => band.lo > band.hi)) return null
  return out
}

function slotWithValue(slots: SlotBand[], index: number, value: number): SlotBand[] {
  return slots.map((band, i) => (i === index ? { lo: value, hi: value } : { ...band }))
}

function slotFeasible(
  kind: PoolKind,
  slots: SlotBand[],
  index: number,
  value: number,
  minSum: number,
  maxSum: number,
  minEven: number,
  maxEven: number
) {
  const mono = applyMonotonic(kind, slotWithValue(slots, index, value))
  if (!mono) return false
  const pool = poolSize(kind)
  const minS = minIncreasingSum(mono)
  const maxS = maxIncreasingSum(mono, pool)
  if (minS == null || maxS == null) return false
  if (maxS < minSum || minS > maxSum) return false
  const evens = evenRangeOfSlots(mono)
  if (!evens) return false
  if (evens.max < minEven || evens.min > maxEven) return false
  return true
}

function tightenSlotsBySumParity(state: StackState): SlotBand[] | null {
  const slots = state.slots
  const next: SlotBand[] = []
  for (let i = 0; i < slots.length; i += 1) {
    let lo = slots[i].hi + 1
    let hi = slots[i].lo - 1
    for (let value = slots[i].lo; value <= slots[i].hi; value += 1) {
      if (
        slotFeasible(
          state.kind,
          slots,
          i,
          value,
          state.minSum,
          state.maxSum,
          state.minEven,
          state.maxEven
        )
      ) {
        if (value < lo) lo = value
        if (value > hi) hi = value
      }
    }
    if (lo > hi) return null
    next.push({ lo, hi })
  }
  return applyMonotonic(state.kind, next)
}

function clipAllEvenOrOdd(slots: SlotBand[], wantEven: boolean): SlotBand[] | null {
  const next: SlotBand[] = []
  for (const slot of slots) {
    const clipped = clipParity(slot.lo, slot.hi, wantEven)
    if (clipped.lo > clipped.hi) return null
    next.push(clipped)
  }
  return next
}

function sameSlots(a: SlotBand[], b: SlotBand[]) {
  return a.length === b.length && a.every((band, i) => band.lo === b[i].lo && band.hi === b[i].hi)
}

/**
 * Resserrage mutuel : n1 < n2 < …, somme des rangs ∈ bande, parité compatible.
 * Ne fait qu’étreindre les contraintes déjà posées.
 */
export function tighten(state: StackState): TightResult {
  const diagnostics: string[] = []
  const current = clampStack(state)
  const sums = sumBounds(current.kind)
  const draw = drawSize(current.kind)
  const pool = poolSize(current.kind)
  const labels = current.kind === "numbers" ? "n" : "e"

  if (!layerEnabled(current, "sum")) {
    current.minSum = sums.min
    current.maxSum = sums.max
  }
  if (!layerEnabled(current, "parity")) {
    current.minEven = 0
    current.maxEven = draw
  }
  if (!layerEnabled(current, "slots")) {
    current.slots = theoreticalSlots(current.kind)
  }

  for (let pass = 0; pass < 12; pass += 1) {
    const before = cloneStack(current)
    const mono = applyMonotonic(current.kind, current.slots)
    if (!mono) {
      diagnostics.push("Espaces : aucun ordre n1 < n2 < … n’est possible.")
      current.minSum = 1
      current.maxSum = 0
      return { state: current, diagnostics }
    }
    current.slots = mono

    if (current.minEven === draw && current.maxEven === draw) {
      const clipped = clipAllEvenOrOdd(current.slots, true)
      if (!clipped) {
        diagnostics.push("Parité : 100 % pairs est incompatible avec les espaces.")
        current.minEven = 1
        current.maxEven = 0
        return { state: current, diagnostics }
      }
      current.slots = clipped
    } else if (current.minEven === 0 && current.maxEven === 0) {
      const clipped = clipAllEvenOrOdd(current.slots, false)
      if (!clipped) {
        diagnostics.push("Parité : 0 pair est incompatible avec les espaces.")
        current.minEven = 1
        current.maxEven = 0
        return { state: current, diagnostics }
      }
      current.slots = clipped
    }

    const minS = minIncreasingSum(current.slots)
    const maxS = maxIncreasingSum(current.slots, pool)
    if (minS == null || maxS == null) {
      diagnostics.push("Espaces : aucune combinaison croissante.")
      current.minSum = 1
      current.maxSum = 0
      return { state: current, diagnostics }
    }
    if (minS > current.maxSum || maxS < current.minSum) {
      diagnostics.push(
        `Somme vs espaces : les rangs ne peuvent sommer que ${minS}–${maxS}, hors bande ${current.minSum}–${current.maxSum}.`
      )
      current.minSum = 1
      current.maxSum = 0
      return { state: current, diagnostics }
    }
    current.minSum = Math.max(current.minSum, minS)
    current.maxSum = Math.min(current.maxSum, maxS)

    const evens = evenRangeOfSlots(current.slots)
    if (!evens) {
      diagnostics.push("Parité : un espace ne contient ni pair ni impair.")
      current.minEven = 1
      current.maxEven = 0
      return { state: current, diagnostics }
    }
    if (evens.max < current.minEven || evens.min > current.maxEven) {
      diagnostics.push(
        `Parité vs espaces : les rangs n’offrent que ${evens.min}–${evens.max} pairs, hors bande ${current.minEven}–${current.maxEven}.`
      )
      current.minEven = 1
      current.maxEven = 0
      return { state: current, diagnostics }
    }
    current.minEven = Math.max(current.minEven, evens.min)
    current.maxEven = Math.min(current.maxEven, evens.max)

    const clipped = tightenSlotsBySumParity(current)
    if (!clipped) {
      const empty = current.slots.findIndex((band) => band.lo > band.hi)
      const rank = empty >= 0 ? `${labels}${empty + 1}` : "un rang"
      diagnostics.push(`Somme vs ${rank} : plus aucune valeur compatible.`)
      current.minSum = 1
      current.maxSum = 0
      return { state: current, diagnostics }
    }
    current.slots = clipped

    if (
      before.minSum === current.minSum &&
      before.maxSum === current.maxSum &&
      before.minEven === current.minEven &&
      before.maxEven === current.maxEven &&
      sameSlots(before.slots, current.slots)
    ) {
      break
    }
  }

  if (current.minSum > current.maxSum) {
    diagnostics.push("Somme : bande vide après resserrage.")
  }
  if (current.minEven > current.maxEven) {
    diagnostics.push("Parité : bande vide après resserrage.")
  }
  current.slots.forEach((band, i) => {
    if (band.lo > band.hi) {
      diagnostics.push(`${labels}${i + 1} : intervalle vide après resserrage.`)
    }
  })
  return { state: current, diagnostics }
}

export function isImpossible(state: StackState) {
  return (
    state.minSum > state.maxSum ||
    state.minEven > state.maxEven ||
    state.slots.some((band) => band.lo > band.hi)
  )
}
