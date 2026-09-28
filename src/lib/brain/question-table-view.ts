/** Mise en forme du tableau que `build_question` fabrique. */

export type QuestionFeature = {
  name: string
  label: string
  group: string
  measure: string
}

export type QuestionBand = {
  start: number
  end: number
  n: number
  from: string
  to: string
  holdout: boolean
  y: number | null
  values: (number | null)[]
}

export type QuestionTail = {
  index: number
  date: string
  ball?: number | null
  y: number | null
  raw: number | null
  holdout: boolean
  values: (number | null)[]
}

export type QuestionTable = {
  ok?: boolean
  question: string
  label?: string | null
  series?: string | null
  phrase: string
  class_names: string[]
  rows: number
  columns: number
  train_n: number
  holdout_n: number
  threshold?: number | null
  sense?: string | null
  from_date?: string | null
  to_date?: string | null
  features: QuestionFeature[]
  bands: QuestionBand[]
  cut_band: number | null
  tail: QuestionTail[]
  open?: { rows: { ball: number; values: (number | null)[] }[] } | null
  source?: string
  era?: string
  weekday?: string | null
  draw_count?: number
  error?: string
}

export type ColumnGroup = { label: string; span: number }

export function columnGroups(features: QuestionFeature[]): ColumnGroup[] {
  const groups: ColumnGroup[] = []
  for (const feature of features) {
    const last = groups[groups.length - 1]
    if (last && last.label === feature.group) last.span += 1
    else groups.push({ label: feature.group, span: 1 })
  }
  return groups
}

export function columnExtent(
  rows: { values: (number | null)[] }[],
  index: number
): { min: number; max: number } | null {
  let min = Infinity
  let max = -Infinity
  for (const row of rows) {
    const value = row.values[index]
    if (value == null || !Number.isFinite(value)) continue
    if (value < min) min = value
    if (value > max) max = value
  }
  if (!Number.isFinite(min) || !Number.isFinite(max)) return null
  return { min, max }
}

/** 0 au minimum de la colonne, 1 au maximum. Une colonne plate vaut 0,5. */
export function unitScale(value: number | null, extent: { min: number; max: number } | null): number | null {
  if (value == null || extent == null || !Number.isFinite(value)) return null
  if (extent.max === extent.min) return 0.5
  return (value - extent.min) / (extent.max - extent.min)
}

export function formatCell(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return "—"
  const abs = Math.abs(value)
  if (abs >= 1) return value.toFixed(2)
  return value.toFixed(3)
}

export function tableSummary(table: QuestionTable): string {
  const span =
    table.from_date && table.to_date ? ` De ${table.from_date} à ${table.to_date}.` : ""
  const cut = table.holdout_n
    ? ` Le contrôle occupe les ${table.holdout_n} dernières lignes.`
    : ""
  return `${table.phrase} ${table.rows} lignes, ${table.columns} colonnes.${span}${cut}`
}

export function bandCaption(table: QuestionTable, bandIndex: number, column: number): string {
  const band = table.bands[bandIndex]
  if (!band) return ""
  const when = band.from && band.to && band.from !== band.to ? `${band.from} → ${band.to}` : band.from || band.to
  const rows = `${band.n} ligne${band.n > 1 ? "s" : ""}`
  const place = band.holdout ? "contrôle" : "apprentissage"
  if (column < 0) {
    const name = table.class_names[1] || "étiquette"
    const rate = band.y == null ? "—" : `${Math.round(band.y * 100)} %`
    return `${when}\n${rows} · ${place}\n${name} · ${rate}`
  }
  const feature = table.features[column]
  return `${feature?.label ?? ""}\n${when}\n${rows} · ${place}\n${formatCell(band.values[column] ?? null)}`
}
