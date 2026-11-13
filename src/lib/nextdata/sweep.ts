/** Méga : tableau des effets principaux, trié par MAE, verdict après Holm. */

import { blockCaption } from "@/lib/nextdata/blocks"
import { formatDecimal } from "@/lib/nextdata/compare"
import { formatGap, versusText, type PairedGap, type Verdict } from "@/lib/nextdata/uncertainty"

export type SweepLoad = {
  cpu: number | null
  memory_free: number | null
  allowed: number
  cap: number
  parallel: boolean
}

export type SweepHolm = {
  p: number
  p_holm: number
  reject: boolean
  retained?: boolean
}

export type SweepGap = PairedGap & { raw_verdict?: Verdict }

export type SweepSummaryEntry = {
  mae_sum: number | null
  mae_sum_ci?: { value: number | null; lo: number | null; hi: number | null; count: number }
  hits_numbers: number | null
  etages?: { sommes?: { sum?: number | null; star_sum?: number | null }; rangs?: Record<string, number | null> }
  versus?: Record<string, PairedGap>
  count: number
}

export type SweepRow = {
  id: string
  role: string
  label: string
  anchor: boolean
  focus: number
  years: string[]
  years_present?: string[]
  covariates: string[]
  dropped: string | null
  block: string | null
  with_chronos: boolean
  status: string
  detail: string | null
  shifts_ready: number
  shifts_total: number
  summary: Record<string, SweepSummaryEntry>
  versus_anchor: { corpus?: SweepGap } | null
  holm: SweepHolm | null
}

export type SweepPayload = {
  ok: boolean
  error?: string
  weekday?: string
  estimators?: number
  reading?: string
  dates?: string[]
  rows?: SweepRow[]
  leader?: { id: string; label: string; reading: string } | null
  held?: boolean
  load?: SweepLoad
  progress?: { ready: number; total: number; complete: boolean }
  wave?: number
  note?: string
}

export const SWEEP_READINGS = [
  { id: "corpus", label: "LightGBM · trois ans", short: "LGB · 3 ans" },
  { id: "fenetre", label: "LightGBM · fenêtre", short: "LGB · fenêtre" },
  { id: "corpus_catboost", label: "CatBoost · trois ans", short: "CB · 3 ans" },
  { id: "fenetre_catboost", label: "CatBoost · fenêtre", short: "CB · fenêtre" },
] as const

const FAMILY_LABELS: Record<string, string> = {
  calendrier: "Calendrier",
  lune: "Lune",
  forme: "Forme",
  decennies: "Décennies",
  delta: "Delta",
  repetitions: "Répétitions",
  couples: "Couples",
  triples: "Triples",
  pulse: "Pulse",
}

/** n, n−1, n−2, dans l’ordre reçu. */
export function yearLabel(years: string[]) {
  return years.map((year) => year.replaceAll("-", "−")).join(", ")
}

/** « celles des boutons », « sans Pulse », ou « sans les retards » pour une ligne de bloc. */
export function covariateCaption(row: { anchor?: boolean; dropped?: string | null; block?: string | null; role?: string }) {
  if (row.role === "block" && row.block) return blockCaption(row.block)
  if (row.dropped) return `sans ${FAMILY_LABELS[row.dropped] ?? row.dropped}`
  return "celles des boutons"
}

/** MAE de somme d’une lecture, ou un tiret. */
export function maeCell(summary: Record<string, SweepSummaryEntry> | undefined, id: string) {
  const value = summary?.[id]?.mae_sum
  if (value == null || !Number.isFinite(value)) return "—"
  return formatDecimal(value)
}

/** Le réglage affiché d’abord, puis les variantes par MAE Corpus croissante. */
export function sortSweepRows(rows: SweepRow[]) {
  const anchor = rows.filter((row) => row.anchor)
  const rest = rows.filter((row) => !row.anchor)
  rest.sort((a, b) => {
    const left = a.summary?.corpus?.mae_sum
    const right = b.summary?.corpus?.mae_sum
    if (left == null && right == null) return a.label.localeCompare(b.label, "fr")
    if (left == null) return 1
    if (right == null) return -1
    return left - right || a.label.localeCompare(b.label, "fr")
  })
  return [...anchor, ...rest]
}

/** Verdict Corpus contre le réglage affiché. Holm non concluant reste non tranché. */
export function anchorVerdict(row: SweepRow) {
  if (row.anchor) return "—"
  const gap = row.versus_anchor?.corpus
  if (!gap?.verdict && !gap?.raw_verdict) return "—"
  if (row.holm?.retained) return versusText(gap)
  if (gap?.raw_verdict === "lower" || gap?.raw_verdict === "higher") {
    return `non tranché après Holm (${formatGap(gap)})`
  }
  return versusText(gap)
}

/** Phrase du bandeau. Tant que les décalages manquent, pas de gagnant annoncé. */
export function sweepBanner(report: SweepPayload | null) {
  if (!report) return ""
  if (!report.progress?.complete) return "Comparaison en cours. Le verdict attend les décalages encore en calcul."
  if (report.leader) {
    return `${report.leader.label} se trompe moins que le réglage affiché, lecture Corpus, après correction de Holm.`
  }
  return "Le réglage affiché tient : aucune variante ne se détache après correction de Holm."
}

/** « charge 42 % · 3 processus sur 6 », ou « 1 processus » quand le pool reste dans l’API. */
export function loadLabel(load: SweepLoad | null | undefined) {
  if (!load) return ""
  const cpu = load.cpu == null ? "charge —" : `charge ${Math.round(load.cpu * 100)} %`
  const processes = load.parallel ? `${load.allowed} processus sur ${load.cap}` : "1 processus"
  return `${cpu} · ${processes}`
}
