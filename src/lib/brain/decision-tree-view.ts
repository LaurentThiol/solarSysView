/** Mise en forme des règles : mêmes libellés et mêmes seuils que le dessin. */

export type TreeSplit = {
  node?: number
  feature?: string
  label: string
  sense: string
  threshold: number
  text?: string
}

export type TreeRule = {
  node: number
  path: TreeSplit[]
  class_name: string
  train_n: number
  train_rate: number | null
  holdout_n: number
  holdout_rate: number | null
  weak?: boolean
  positive?: boolean
}

export type ReadingStamp = {
  era?: string | null
  weekday?: string | null
  draw_count?: number | null
}

const SERIES_FR: Record<string, string> = {
  sum: "somme",
  spread: "étendue",
  parity: "parité",
  n1: "n1",
  n2: "n2",
  n3: "n3",
  n4: "n4",
  n5: "n5",
  g1: "g1",
  g2: "g2",
  g3: "g3",
  g4: "g4",
}

const MEASURE_FR: Record<string, string> = {
  last: "dernière",
  step: "pas",
  slope: "pente",
  z20: "z20",
}

const BALL_FR: Record<string, string> = {
  delay: "retard",
  hit20: "sorties 20",
  hit50: "sorties 50",
  last: "dernière",
  rsi: "RSI",
  z20: "z20",
}

/** « retard » est réservé au retard d'une boule. Un lag s'appelle « dernière ». */
export function featureLabel(name: string): string {
  if (name.startsWith("ball.")) {
    const measure = BALL_FR[name.slice(5)] ?? name.slice(5)
    return `boule · ${measure}`
  }
  if (name.includes(".") && !name.startsWith("curve_") && !name.startsWith("figure_")) {
    const [series, measure] = name.split(".", 2)
    return `${SERIES_FR[series] ?? series} · ${MEASURE_FR[measure] ?? measure}`
  }
  return name
}

/** Seuil à deux décimales, point décimal, identique au dessin (`162.50`). */
export function formatThreshold(value: number): string {
  return Number(value).toFixed(2)
}

export function splitText(split: TreeSplit): string {
  if (split.text) return split.text
  const op = split.sense === "le" ? "≤" : ">"
  return `${split.label} ${op} ${formatThreshold(split.threshold)}`
}

export function ruleCuts(rule: { path?: TreeSplit[] | null }): string[] {
  return (rule.path ?? []).map((split) => splitText(split))
}

export function formatShare(rate: number | null | undefined): string {
  if (rate == null || Number.isNaN(rate)) return "—"
  return `${Math.round(rate * 100)} %`
}

export function leafLine(rule: Pick<TreeRule, "train_n" | "train_rate" | "holdout_n" | "holdout_rate">): string {
  return `apprentissage ${formatShare(rule.train_rate)} · n ${rule.train_n} / contrôle ${formatShare(rule.holdout_rate)} · n ${rule.holdout_n}`
}

export function sortRules<T extends TreeRule>(rules: T[]): T[] {
  return [...rules].sort((a, b) => {
    if (Boolean(a.positive) !== Boolean(b.positive)) return a.positive ? -1 : 1
    return (b.holdout_rate ?? -1) - (a.holdout_rate ?? -1)
  })
}

export function ariaTreeLabel(rules: TreeRule[]): string {
  if (!rules.length) return "Arbre de décision, aucune feuille."
  const parts = sortRules(rules).map((rule) => {
    const path = ruleCuts(rule).join(", ")
    return `Feuille ${rule.node} : ${path || "racine"} vers ${rule.class_name}`
  })
  return `Arbre de décision. ${parts.join(". ")}`
}

export function formatP(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "—"
  return value.toFixed(2).replace(".", ",")
}

export function nullHistogram(scores: number[], real: number, bins = 10) {
  const values = scores.filter((score) => Number.isFinite(score))
  if (!values.length) return { bins: [] as { from: number; to: number; count: number }[], realAt: 0, min: real, max: real }
  const min = Math.min(...values, real)
  const max = Math.max(...values, real)
  const span = max - min || 1
  const width = span / bins
  const rows = Array.from({ length: bins }, (_, index) => ({
    from: min + index * width,
    to: min + (index + 1) * width,
    count: 0,
  }))
  for (const score of values) {
    let index = Math.floor((score - min) / width)
    if (index >= bins) index = bins - 1
    if (index < 0) index = 0
    rows[index].count += 1
  }
  const realAt = Math.min(bins - 1, Math.max(0, Math.floor((real - min) / width)))
  return { bins: rows, realAt, min, max }
}

function scopeKey(value: string | null | undefined) {
  if (!value || value === "all" || value === "tous" || value === "synthese") return null
  return value
}

export function readingStale(reading: ReadingStamp, now: ReadingStamp & { drawCount?: number | null }) {
  const stored = typeof reading.draw_count === "number" ? reading.draw_count : null
  const current = typeof now.drawCount === "number" ? now.drawCount : typeof now.draw_count === "number" ? now.draw_count : null
  if (stored != null && current != null && current > stored) {
    const gap = current - stored
    return { stale: true, label: `${gap} tirage${gap > 1 ? "s" : ""} depuis` }
  }
  if (reading.era && now.era && reading.era !== now.era) return { stale: true, label: "ère différente" }
  if (scopeKey(reading.weekday) !== scopeKey(now.weekday)) return { stale: true, label: "jour différent" }
  return { stale: false, label: null as string | null }
}

export type FollowUpId = "retry" | "train" | "train-many" | "jeux" | "rule"

export function primaryFollowUp(question: string, beats: boolean): FollowUpId {
  if (!beats) return "retry"
  if (question === "series") return "train"
  if (question === "shape") return "train-many"
  if (question === "balls") return "jeux"
  return "rule"
}

export function expectedDuration(question: string, permutations: number | null): string {
  if (question === "balls") return "souvent une à deux minutes"
  if (question === "chartisme") return "souvent une minute"
  if ((permutations ?? 99) >= 99) return "souvent moins d'une minute"
  return "quelques secondes"
}

export function ballChanceRow(
  scores: { ball: number; proba: number }[],
  size = 50,
  fallback = 100
): number[] {
  const chances = Array.from({ length: size }, () => fallback)
  for (const row of scores) {
    if (row.ball < 1 || row.ball > size) continue
    const proba = Number(row.proba)
    if (!Number.isFinite(proba)) continue
    chances[row.ball - 1] = Math.round(Math.min(100, Math.max(0, proba * 100)))
  }
  return chances
}

export function nodeIdsFromSvg(svg: string | null | undefined): number[] {
  if (!svg) return []
  const match = svg.match(/id="decision-tree-nodes">([^<]*)</)
  if (!match) return []
  return match[1]
    .split(/\s+/)
    .map((item) => Number(item))
    .filter((item) => Number.isInteger(item))
}
