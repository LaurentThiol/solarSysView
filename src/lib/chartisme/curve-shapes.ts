/**
 * Gabarits d'école des *types* de courbe (somme, retard, n1…), pour les
 * miniatures à côté des sélecteurs. Ce n'est pas la série réelle : juste
 * la forme typique, figée, pour reconnaître le régime d'un coup d'œil.
 */

const COUNT = 20

function sample(fn: (t: number, i: number) => number, count = COUNT): number[] {
  return Array.from({ length: count }, (_, i) => fn(i / Math.max(1, count - 1), i))
}

function wander(base: number, amp: number, phase = 0, count = COUNT): number[] {
  return sample(
    (t) =>
      base +
      amp * Math.sin((t + phase) * Math.PI * 2) +
      amp * 0.28 * Math.sin(t * Math.PI * 5 + phase * 2),
    count
  )
}

function saw(period: number, count = COUNT): number[] {
  return sample((_, i) => i % period, count)
}

function pulses(gap: number, count = COUNT): number[] {
  return sample((_, i) => (i % gap === 0 ? 1 : 0), count)
}

function steps(values: number[], count = COUNT): number[] {
  return sample((_, i) => values[i % values.length] ?? 0, count)
}

const ALIASES: Record<string, string> = {
  sumNumbers: "sum",
  relNumbers: "sum",
  sumStars: "star_sum",
  relStars: "star_sum",
}

/** Identifiant de régime : `delay:7`, `curve:sum`, `family:hit` → `delay` / `sum` / `hit`. */
export function curveKind(raw: string): string {
  const trimmed = raw.trim()
  if (!trimmed || trimmed === "any") return ""
  const stripped = trimmed.replace(/^(curve|family):/, "")
  const base = stripped.includes(":") ? stripped.slice(0, stripped.indexOf(":")) : stripped
  return ALIASES[base] ?? base
}

const SERIES: Record<string, () => number[][]> = {
  sum: () => [wander(130, 18, 0.08)],
  spread: () => [wander(28, 10, 0.22)],
  parity: () => [steps([1, 3, 2, 4, 2, 3, 1, 2, 3, 2])],
  high_low: () => [wander(2.4, 1.3, 0.18)],
  consecutive: () => [steps([0, 0, 1, 0, 0, 0, 2, 0, 1, 0, 0, 0])],
  centroid: () => [wander(25.5, 5.5, 0.12)],
  n1: () => [wander(7, 3, 0)],
  n2: () => [wander(16, 3.2, 0.05)],
  n3: () => [wander(25, 3.6, 0.1)],
  n4: () => [wander(34, 3.2, 0.15)],
  n5: () => [wander(43, 3, 0.2)],
  g1: () => [wander(8, 3.5, 0.3)],
  g2: () => [wander(9, 3.5, 0.35)],
  g3: () => [wander(9, 3.5, 0.4)],
  g4: () => [wander(8, 3.5, 0.45)],
  delay: () => [saw(6)],
  hit: () => [pulses(4)],
  star_sum: () => [wander(13, 4, 0.16)],
  e1: () => [wander(3.4, 1.4, 0)],
  e2: () => [wander(8.8, 1.7, 0.2)],
  star_delay: () => [saw(5)],
  star_hit: () => [pulses(5)],
  eachNumber: () => [
    wander(7, 3, 0),
    wander(16, 3.2, 0.05),
    wander(25, 3.6, 0.1),
    wander(34, 3.2, 0.15),
    wander(43, 3, 0.2),
  ],
  eachStar: () => [wander(3.4, 1.4, 0), wander(8.8, 1.7, 0.2)],
  sumBoth: () => [wander(55, 18, 0.08), wander(48, 14, 0.4)],
}

/** Plage d'école : n1 reste bas, n5 haut, plutôt que de tout étirer à la même hauteur. */
const BOX: Record<string, { min: number; max: number }> = {
  n1: { min: 1, max: 50 },
  n2: { min: 1, max: 50 },
  n3: { min: 1, max: 50 },
  n4: { min: 1, max: 50 },
  n5: { min: 1, max: 50 },
  e1: { min: 1, max: 12 },
  e2: { min: 1, max: 12 },
  g1: { min: 0, max: 20 },
  g2: { min: 0, max: 20 },
  g3: { min: 0, max: 20 },
  g4: { min: 0, max: 20 },
  delay: { min: 0, max: 8 },
  star_delay: { min: 0, max: 8 },
  hit: { min: 0, max: 1 },
  star_hit: { min: 0, max: 1 },
  parity: { min: 0, max: 5 },
  consecutive: { min: 0, max: 3 },
  high_low: { min: 0, max: 5 },
}

export function curveSparkSeries(kindOrId: string): number[][] {
  const kind = curveKind(kindOrId)
  if (!kind) return []
  return SERIES[kind]?.() ?? []
}

export function curveSparkBounds(kindOrId: string): { min: number; max: number } | undefined {
  const kind = curveKind(kindOrId)
  if (!kind) return undefined
  return BOX[kind]
}
