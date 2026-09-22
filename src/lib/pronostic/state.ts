import {
  clampInt,
  drawSize,
  normalizeSlots,
  orderBand,
  sumBounds,
  theoreticalSlots,
  type PoolKind,
  type SlotBand,
} from "./bounds.ts"

export const LAYER_IDS = ["sum", "parity", "slots"] as const
export type LayerId = (typeof LAYER_IDS)[number]

export type LayerDef = {
  id: LayerId
  label: string
  enabled: boolean
}

export type ParityMode = "observed" | "anticipated"

export const DEFAULT_LAYERS: LayerDef[] = [
  { id: "sum", label: "Somme", enabled: true },
  { id: "parity", label: "Rangs et parité", enabled: true },
  { id: "slots", label: "Espaces", enabled: true },
]

export const LAYER_HELP: Record<LayerId, { title: string; body: string }> = {
  sum: {
    title: "Somme",
    body: "Somme des statistiques d’ordre (n1+…+n5 ou e1+e2). Une bande [mini, maxi] ; un point unique est une bande fermée. Hypothèse de lecture, pas P(prochain tirage).",
  },
  parity: {
    title: "Rangs et parité",
    body: "Les rangs sont les 5 (ou 2) boules triées qui réalisent la somme. La parité est le nombre de pairs. Observé : bande lue sur la fenêtre. Anticipé : curseur, ou forecast d’un spécialiste s’il est importé.",
  },
  slots: {
    title: "Espaces",
    body: "Intervalle de chaque statistique d’ordre. Les espaces peuvent se chevaucher ; un numéro n’est pris qu’une fois (n1 < n2 < …). Bornes théoriques n_i ∈ [i, 50−5+i].",
  },
}

export type StackState = {
  kind: PoolKind
  layers: LayerDef[]
  minSum: number
  maxSum: number
  minEven: number
  maxEven: number
  slots: SlotBand[]
  parityMode: ParityMode
}

export function defaultLayers(): LayerDef[] {
  return DEFAULT_LAYERS.map((layer) => ({ ...layer }))
}

export function defaultStack(kind: PoolKind): StackState {
  const sums = sumBounds(kind)
  const draw = drawSize(kind)
  return {
    kind,
    layers: defaultLayers(),
    minSum: sums.min,
    maxSum: sums.max,
    minEven: 0,
    maxEven: draw,
    slots: theoreticalSlots(kind),
    parityMode: "observed",
  }
}

export function cloneStack(state: StackState): StackState {
  return {
    ...state,
    layers: state.layers.map((layer) => ({ ...layer })),
    slots: state.slots.map((band) => ({ ...band })),
  }
}

export function enabledLayers(state: StackState): LayerDef[] {
  return state.layers.filter((layer) => layer.enabled)
}

export function layerEnabled(state: StackState, id: LayerId) {
  return state.layers.some((layer) => layer.id === id && layer.enabled)
}

export function setLayerEnabled(state: StackState, id: LayerId, enabled: boolean): StackState {
  const next = cloneStack(state)
  next.layers = next.layers.map((layer) => (layer.id === id ? { ...layer, enabled } : layer))
  return next
}

export function moveLayer(state: StackState, id: LayerId, direction: -1 | 1): StackState {
  const next = cloneStack(state)
  const index = next.layers.findIndex((layer) => layer.id === id)
  const target = index + direction
  if (index < 0 || target < 0 || target >= next.layers.length) return next
  const swap = next.layers[index]
  next.layers[index] = next.layers[target]
  next.layers[target] = swap
  return next
}

export function clampStack(state: StackState): StackState {
  const next = cloneStack(state)
  const sums = sumBounds(next.kind)
  const draw = drawSize(next.kind)
  const sum = orderBand(next.minSum, next.maxSum, sums.min, sums.max)
  const even = orderBand(next.minEven, next.maxEven, 0, draw)
  next.minSum = sum.min
  next.maxSum = sum.max
  next.minEven = even.min
  next.maxEven = even.max
  next.slots = normalizeSlots(next.kind, next.slots)
  next.parityMode = next.parityMode === "anticipated" ? "anticipated" : "observed"
  const seen = new Set<LayerId>()
  const layers: LayerDef[] = []
  for (const layer of next.layers) {
    if (!LAYER_IDS.includes(layer.id) || seen.has(layer.id)) continue
    seen.add(layer.id)
    layers.push({
      id: layer.id,
      label: DEFAULT_LAYERS.find((item) => item.id === layer.id)?.label ?? layer.label,
      enabled: Boolean(layer.enabled),
    })
  }
  for (const fallback of DEFAULT_LAYERS) {
    if (!seen.has(fallback.id)) layers.push({ ...fallback })
  }
  next.layers = layers
  next.minEven = clampInt(next.minEven, 0, draw)
  next.maxEven = clampInt(next.maxEven, 0, draw)
  return next
}

export function unconstrained(kind: PoolKind): StackState {
  const state = defaultStack(kind)
  state.layers = state.layers.map((layer) => ({ ...layer, enabled: false }))
  return state
}
