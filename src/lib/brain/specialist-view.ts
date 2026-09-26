/** Display helpers for the Spécialistes roster. No API calls. */

export const SPECIALIST_FEATURE_READINGS: Record<string, string> = {
  lag1: "Valeur de la série au tirage t — le point le plus récent. Entrée causale, pas le futur.",
  lag2: "Valeur au tirage t−1. Mémoire courte, toujours limitée à t.",
  lag3: "Valeur au tirage t−2. Troisième retard, toujours limité à t.",
  rsi: "Force relative sur 14 tirages de la série cible. Zones 70 / 30 : régime, pas un signal de jeu.",
  macd: "Ligne MACD : écart des EMA 12 et 26. Décrit la pente récente de la série.",
  macd_hist: "Histogramme MACD : écart ligne − signal (9). Accélération de la pente, pas une prédiction.",
  bollinger: "Position dans les bandes SMA ± 2σ sur 20 (%B). 0 = bande basse, 1 = bande haute. Un extrême n’est pas un signal de jeu.",
  sma: "Moyenne simple des 20 derniers points de la série cible.",
  ema: "Moyenne exponentielle sur 20 : les tirages récents pèsent plus.",
  atr: "Moyenne des |Δ| sur 14 (ATR close-only). Mesure l’agitation de la série, pas un volume de marché.",
  stoch: "Position dans la fourchette des 14 derniers points (0–100). Zones 80 / 20.",
  cci: "Écart à la moyenne typique sur 20. Extrêmes ±100 / ±200.",
  zscore: "(valeur − moyenne) / σ sur 20 tirages. Distance à la moyenne récente de la série.",
  range8: "max − min des 8 derniers tirages. Hauteur du cycle court, à côté du z-score 20. Pas une marge de grille.",
  slope: "Pente de régression linéaire sur 10 tirages. Tendance locale, pas le prochain point.",
}

type FeatureHelpInput = {
  id: string
  label: string
  period?: number
  reading?: string
}

export const SKILL_SCALE = 0.3
export const SKILL_EPS = 0.02
export const SKILL_WINDOWS = ["20", "50", "100"] as const

export type SkillWindowKey = (typeof SKILL_WINDOWS)[number]

export type SkillSource = {
  windows?: Record<string, { skill?: number | null }>
  skill?: number | null
  skill_20?: number | null
  skill_50?: number | null
  skill_100?: number | null
  verdict?: string | null
}

export type ForecastSource = {
  value?: number | null
  sigma?: number | null
  confidence?: number | null
  abstain?: boolean
  proba?: number[] | null
}

export type VerdictKind = "beats" | "tie" | "worse" | "unknown"

export type SkillBar = {
  skill: number | null
  leftPct: number
  widthPct: number
  side: "pos" | "neg" | "zero" | "empty"
  clamped: boolean
  display: string
}

export type TargetGlyphKind =
  | "parity"
  | "sum"
  | "spread"
  | "consecutive"
  | "high_low"
  | "centroid"
  | "rank"
  | "gap"
  | "star"
  | "default"

export type FormattedForecast = {
  valueLabel: string
  sigmaLabel: string
  summary: string
  confidencePct: number | null
  abstain: boolean
  proba: number[] | null
}

export function skillOf(record: SkillSource, key: SkillWindowKey): number | null {
  const row = record.windows?.[key]
  const raw = row?.skill ?? (key === "20" ? record.skill_20 : key === "50" ? record.skill_50 : record.skill_100)
  return typeof raw === "number" && Number.isFinite(raw) ? raw : null
}

export function formatSkill(skill: number | null | undefined): string {
  if (skill == null || !Number.isFinite(skill)) return "—"
  if (Math.abs(skill) < 5e-4) return "0"
  const rounded = skill.toFixed(3).replace(/0+$/, "").replace(/\.$/, "")
  if (skill > 0) return `+${rounded}`
  return `−${rounded.slice(1)}`
}

export function skillBar(skill: number | null | undefined, scale = SKILL_SCALE): SkillBar {
  if (skill == null || !Number.isFinite(skill)) {
    return { skill: null, leftPct: 50, widthPct: 0, side: "empty", clamped: false, display: "—" }
  }
  const display = formatSkill(skill)
  if (Math.abs(skill) < 1e-9) {
    return { skill: 0, leftPct: 50, widthPct: 0, side: "zero", clamped: false, display }
  }
  const ratio = skill / (scale > 0 ? scale : SKILL_SCALE)
  const clamped = Math.abs(ratio) > 1
  const t = Math.max(-1, Math.min(1, ratio))
  if (t >= 0) {
    return { skill, leftPct: 50, widthPct: t * 50, side: "pos", clamped, display }
  }
  return { skill, leftPct: 50 + t * 50, widthPct: -t * 50, side: "neg", clamped, display }
}

export function skillWindows(record: SkillSource, scale = SKILL_SCALE) {
  return SKILL_WINDOWS.map((key) => {
    const skill = skillOf(record, key)
    return { key, skill, bar: skillBar(skill, scale) }
  })
}

export function verdictKind(verdict?: string | null): VerdictKind {
  if (verdict === "bat le nul") return "beats"
  if (verdict === "moins bon") return "worse"
  if (verdict === "à égalité") return "tie"
  return "unknown"
}

export function verdictTone(verdict?: string | null): { kind: VerdictKind; className: string } {
  const kind = verdictKind(verdict)
  const className =
    kind === "beats"
      ? "border-chart-3/40 bg-chart-3/15 text-foreground"
      : kind === "worse"
        ? "border-destructive/40 bg-destructive/10 text-destructive"
        : kind === "tie"
          ? "border-border bg-muted/40 text-muted-foreground"
          : "border-border bg-muted/30 text-muted-foreground"
  return { kind, className }
}

export function beatsChance(record: SkillSource): boolean {
  if (record.verdict === "bat le nul") return true
  if (record.verdict === "moins bon" || record.verdict === "à égalité") return false
  const skill = record.skill ?? skillOf(record, "50") ?? skillOf(record, "100") ?? skillOf(record, "20")
  return skill != null && skill > SKILL_EPS
}

export function beatsChanceCount(items: SkillSource[]): number {
  return items.filter(beatsChance).length
}

export function formatNumber(value: number | null | undefined, digits = 2): string {
  if (value == null || !Number.isFinite(value)) return "—"
  if (Math.abs(value - Math.round(value)) < 1e-6) return String(Math.round(value))
  return value.toFixed(digits).replace(/0+$/, "").replace(/\.$/, "")
}

export function formatForecast(forecast?: ForecastSource | null): FormattedForecast {
  const abstain = Boolean(forecast?.abstain)
  const valueLabel = formatNumber(forecast?.value)
  const sigma =
    forecast?.sigma != null && Number.isFinite(forecast.sigma) ? Math.abs(forecast.sigma) : null
  const sigmaLabel = sigma == null ? "" : `± ${formatNumber(sigma)}`
  const confidence =
    forecast?.confidence != null && Number.isFinite(forecast.confidence) ? forecast.confidence : null
  const confidencePct =
    confidence == null ? null : Math.max(0, Math.min(100, Math.round(confidence * 100)))
  const proba = Array.isArray(forecast?.proba) ? forecast.proba.filter((p) => typeof p === "number") : null
  let summary = valueLabel
  if (valueLabel !== "—" && sigmaLabel) summary = `${valueLabel} ${sigmaLabel}`
  if (abstain) summary = valueLabel === "—" ? "s’abstient" : `${summary} · s’abstient`
  return { valueLabel, sigmaLabel, summary, confidencePct, abstain, proba }
}

export function specialistFeatureReading(
  feature: Pick<FeatureHelpInput, "id" | "period" | "reading">
): string {
  const fromFeature = feature.reading?.trim()
  if (fromFeature) return fromFeature
  const catalog = SPECIALIST_FEATURE_READINGS[feature.id]?.trim()
  if (catalog) return catalog
  return feature.period != null
    ? `Feature causale jusqu’à t (période ${feature.period}).`
    : "Feature causale jusqu’à t."
}

export function specialistFeatureHelp(feature: FeatureHelpInput) {
  return {
    title: feature.label,
    body: specialistFeatureReading(feature),
  }
}

export function specialistFeaturesHelp(features: FeatureHelpInput[]) {
  return {
    title: "Indicateurs",
    body: "Entrées du réseau, calculées jusqu’au tirage t. Pas de fuite du futur. Au moins un indicateur. Chaque pastille a sa fiche : lags, momentum, volatilité, moyennes, tendance.",
    wide: true as const,
    items: features.map((feature) => ({
      label: feature.label,
      text: specialistFeatureReading(feature),
    })),
  }
}

export function specialistIndicatorHelpItems(ids: string[], catalog: FeatureHelpInput[]) {
  const byId = new Map(catalog.map((feature) => [feature.id, feature]))
  return ids.map((id) => {
    const feature = byId.get(id)
    return {
      label: feature?.label ?? id,
      text: feature ? specialistFeatureReading(feature) : "Indicateur causal jusqu’à t.",
    }
  })
}

export function targetGlyph(target: string): TargetGlyphKind {
  const key = target.trim().toLowerCase()
  if (key === "parity") return "parity"
  if (key === "sum") return "sum"
  if (key === "spread") return "spread"
  if (key === "consecutive") return "consecutive"
  if (key === "high_low") return "high_low"
  if (key === "centroid") return "centroid"
  if (/^n[1-5]$/.test(key)) return "rank"
  if (/^g[1-4]$/.test(key)) return "gap"
  if (key.startsWith("star_") || key === "e1" || key === "e2" || key === "star_sum") return "star"
  return "default"
}
