/** Bornes théoriques des statistiques d’ordre EuroMillions (n1–n5 / e1–e2). */

export type PoolKind = "numbers" | "stars"

export type SlotBand = {
  lo: number
  hi: number
}

export const NUMBER_DRAW = 5
export const STAR_DRAW = 2
export const NUMBER_POOL = 50
export const STAR_POOL = 12

export const NUMBER_SUM_MIN = 15
export const NUMBER_SUM_MAX = 240
export const STAR_SUM_MIN = 3
export const STAR_SUM_MAX = 23

export const TOTAL_NUMBER_WAYS = 2_118_760
export const TOTAL_STAR_WAYS = 66
export const TOTAL_GRIDS = TOTAL_NUMBER_WAYS * TOTAL_STAR_WAYS

export function drawSize(kind: PoolKind) {
  return kind === "numbers" ? NUMBER_DRAW : STAR_DRAW
}

export function poolSize(kind: PoolKind) {
  return kind === "numbers" ? NUMBER_POOL : STAR_POOL
}

export function sumBounds(kind: PoolKind) {
  return kind === "numbers"
    ? { min: NUMBER_SUM_MIN, max: NUMBER_SUM_MAX }
    : { min: STAR_SUM_MIN, max: STAR_SUM_MAX }
}

export function universeWays(kind: PoolKind) {
  return kind === "numbers" ? TOTAL_NUMBER_WAYS : TOTAL_STAR_WAYS
}

/** n_i ∈ [i, pool − draw + i] (i 1-based). */
export function theoreticalSlot(kind: PoolKind, index: number): SlotBand {
  const draw = drawSize(kind)
  const pool = poolSize(kind)
  const i = Math.min(draw - 1, Math.max(0, index))
  return { lo: i + 1, hi: pool - (draw - 1 - i) }
}

export function theoreticalSlots(kind: PoolKind): SlotBand[] {
  return Array.from({ length: drawSize(kind) }, (_, i) => theoreticalSlot(kind, i))
}

export function rankLabel(kind: PoolKind, index: number) {
  if (kind === "numbers") return `n${index + 1}`
  return `e${index + 1}`
}

export function rankTitle(kind: PoolKind, index: number) {
  if (kind === "numbers") {
    if (index === 0) return "Plus petit numéro"
    if (index === NUMBER_DRAW - 1) return "Plus grand numéro"
    return `${index + 1}ᵉ numéro trié`
  }
  return index === 0 ? "Plus petite étoile" : "Plus grande étoile"
}

export function clampInt(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min
  return Math.min(max, Math.max(min, Math.round(value)))
}

export function orderBand(min: number, max: number, lo: number, hi: number) {
  const a = clampInt(min, lo, hi)
  const b = clampInt(max, lo, hi)
  return a <= b ? { min: a, max: b } : { min: b, max: a }
}

export function clampSlot(kind: PoolKind, index: number, band: SlotBand): SlotBand {
  const theo = theoreticalSlot(kind, index)
  const lo = clampInt(band.lo, theo.lo, theo.hi)
  const hi = clampInt(band.hi, theo.lo, theo.hi)
  return lo <= hi ? { lo, hi } : { lo: hi, hi: lo }
}

export function normalizeSlots(kind: PoolKind, raw?: SlotBand[] | null): SlotBand[] {
  const defaults = theoreticalSlots(kind)
  if (!raw || raw.length !== defaults.length) return defaults.map((band) => ({ ...band }))
  return defaults.map((_, i) => clampSlot(kind, i, raw[i] ?? defaults[i]))
}

export function slotsEqual(a: SlotBand[], b: SlotBand[]) {
  if (a.length !== b.length) return false
  return a.every((band, i) => band.lo === b[i].lo && band.hi === b[i].hi)
}

export function slotsRestricted(kind: PoolKind, bands?: SlotBand[] | null) {
  const normalized = normalizeSlots(kind, bands)
  const defaults = theoreticalSlots(kind)
  return normalized.some((band, i) => band.lo > defaults[i].lo || band.hi < defaults[i].hi)
}

export function comboPassesSlots(combo: number[], kind: PoolKind, bands?: SlotBand[] | null) {
  if (!slotsRestricted(kind, bands)) return true
  const sorted = [...combo].sort((a, b) => a - b)
  if (sorted.length !== drawSize(kind)) return false
  const normalized = normalizeSlots(kind, bands)
  return sorted.every((value, i) => value >= normalized[i].lo && value <= normalized[i].hi)
}

export function parseSlotBands(kind: PoolKind, raw: unknown): SlotBand[] | undefined {
  if (!Array.isArray(raw) || raw.length !== drawSize(kind)) return undefined
  const out: SlotBand[] = []
  for (let i = 0; i < raw.length; i += 1) {
    const item = raw[i]
    if (Array.isArray(item) && item.length >= 2) {
      out.push(clampSlot(kind, i, { lo: Number(item[0]), hi: Number(item[1]) }))
      continue
    }
    if (item && typeof item === "object") {
      const rec = item as { lo?: unknown; hi?: unknown }
      out.push(clampSlot(kind, i, { lo: Number(rec.lo), hi: Number(rec.hi) }))
      continue
    }
    return undefined
  }
  return out
}
