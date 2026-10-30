import { CURVE_KEYS, curveLabel, type CurveKey } from "./curves"
import { formatRatio, GOLDEN_RATIOS, nearestGolden, type GoldenRatio } from "./golden"

export const GESTURES = ["persiste", "glisse", "miroir", "or", "moyenne", "soir"] as const
export type Gesture = (typeof GESTURES)[number]

export const SPANS = ["bande", "lignes", "pas"] as const
export type SpanKind = (typeof SPANS)[number]

/** Tendance courte, en tirages. */
export const SHORT_WINDOWS = [3, 5, 10] as const
/** Tendance longue, en jours. */
export const LONG_DAYS = [30, 60, 90] as const

export const WINDOW_MIN = 2
export const WINDOW_MAX = 60
export const DAYS_MIN = 7
export const DAYS_MAX = 365

export type SkillTarget = CurveKey | "*"

export type SkillParams = {
  curve: SkillTarget
  gesture: Gesture
  ratio: GoldenRatio
  span: SpanKind
  /** Fenêtre courte, en tirages. */
  window: number
  /** Fenêtre longue, en jours. Facultative. */
  days: number | null
}

export type SkillOrigin = "maison" | "ia" | "variation"

export type SkillVersion = SkillParams & {
  version: number
  parent: number | null
  /** Date du dernier tirage révélé lu pour écrire cette version. Vide : écrite sans lire de tirage. */
  cutoff: string
  origin: SkillOrigin
  phrase: string
  examCents: number | null
}

export type Skill = {
  id: string
  name: string
  versions: SkillVersion[]
}

const GESTURE_PHRASE: Record<Gesture, string> = {
  persiste: "reste sur place",
  glisse: "poursuit le pas",
  miroir: "inverse le pas",
  or: "vise le nombre d’or",
  moyenne: "rejoint sa moyenne",
  soir: "suit l’autre soir",
}

export function gesturePhrase(gesture: Gesture) {
  return GESTURE_PHRASE[gesture]
}

export function targetLabel(curve: SkillTarget) {
  return curve === "*" ? "toutes les courbes" : curveLabel(curve)
}

const SPAN_PHRASE: Record<SpanKind, string> = {
  bande: "de la bande",
  lignes: "entre les lignes",
  pas: "du dernier pas",
}

export function describeSkill(params: SkillParams) {
  if (params.gesture === "soir") return `${targetLabel(params.curve)} suit l’autre soir, à 4 jours au plus.`
  const scale =
    params.gesture === "moyenne" && params.days
      ? `sur ${params.days} jours`
      : `sur ${params.window} tirages`
  const golden = params.gesture === "or" ? ` ${formatRatio(params.ratio)} ${SPAN_PHRASE[params.span]}` : ""
  return `${targetLabel(params.curve)} ${GESTURE_PHRASE[params.gesture]}${golden} ${scale}.`
}

export function currentVersion(skill: Skill): SkillVersion {
  return skill.versions[skill.versions.length - 1]
}

/** Dernière version écrite avant le tirage caché. Une version plus récente reste de côté. */
export function activeVersion(skill: Skill, hiddenDate?: string | null): SkillVersion | null {
  if (!hiddenDate) return currentVersion(skill) ?? null
  for (let index = skill.versions.length - 1; index >= 0; index -= 1) {
    const version = skill.versions[index]
    if (version.cutoff < hiddenDate) return version
  }
  return null
}

/** Versions écrites le jour du tirage caché ou après : elles ne jouent pas ce tirage. */
export function auditCutoffs(skills: readonly Skill[], hiddenDate: string) {
  const late: { skillId: string; version: number; cutoff: string }[] = []
  for (const skill of skills) {
    for (const version of skill.versions) {
      if (version.cutoff >= hiddenDate) late.push({ skillId: skill.id, version: version.version, cutoff: version.cutoff })
    }
  }
  return late
}

/** Garde, pour chaque skill, les versions écrites avant `hiddenDate`. Une skill sans version restante tombe. */
export function rollBack(skills: readonly Skill[], hiddenDate: string): Skill[] {
  return skills
    .map((skill) => ({ ...skill, versions: skill.versions.filter((version) => version.cutoff < hiddenDate) }))
    .filter((skill) => skill.versions.length > 0)
}

export type VersionMeta = {
  cutoff: string
  origin: SkillOrigin
  examCents: number | null
  phrase?: string
}

export function newSkill(id: string, name: string, params: SkillParams, meta: VersionMeta): Skill {
  return {
    id,
    name,
    versions: [
      {
        ...params,
        version: 1,
        parent: null,
        cutoff: meta.cutoff,
        origin: meta.origin,
        phrase: meta.phrase || describeSkill(params),
        examCents: meta.examCents,
      },
    ],
  }
}

export function addVersion(skill: Skill, params: SkillParams, meta: VersionMeta): Skill {
  const last = currentVersion(skill)
  return {
    ...skill,
    versions: [
      ...skill.versions,
      {
        ...params,
        version: last.version + 1,
        parent: last.version,
        cutoff: meta.cutoff,
        origin: meta.origin,
        phrase: meta.phrase || describeSkill(params),
        examCents: meta.examCents,
      },
    ],
  }
}

function intIn(value: unknown, min: number, max: number) {
  const n = typeof value === "string" ? Number(value) : value
  if (typeof n !== "number" || !Number.isFinite(n)) return null
  const rounded = Math.round(n)
  return rounded >= min && rounded <= max ? rounded : null
}

/** Première valeur autorisée. Une liste copiée du modèle (« a|b ») garde le premier jeton connu. */
function firstAllowed<T extends string>(value: unknown, allowed: readonly T[]): T | null {
  if (typeof value !== "string") return null
  const text = value.trim()
  if ((allowed as readonly string[]).includes(text)) return text as T
  for (const piece of text.split(/[^a-zA-Z0-9*.]+/)) {
    if ((allowed as readonly string[]).includes(piece)) return piece as T
  }
  return null
}

function firstNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value !== "string") return null
  const match = value.match(/-?\d+(?:[.,]\d+)?/)
  if (!match) return null
  const parsed = Number(match[0].replace(",", "."))
  return Number.isFinite(parsed) ? parsed : null
}

function boundedInt(value: unknown, min: number, max: number) {
  const direct = typeof value === "string" && /[^\d-]/.test(value) ? null : intIn(value, min, max)
  if (direct != null) return direct
  if (typeof value !== "string") return null
  const match = value.match(/\d+/)
  return match ? intIn(Number(match[0]), min, max) : null
}

/** 0 et « null » : pas de fenêtre longue. undefined : valeur illisible. */
function optionalDays(value: unknown): number | null | undefined {
  if (value == null || value === 0 || value === "0" || value === "null") return null
  const days = boundedInt(value, DAYS_MIN, DAYS_MAX)
  return days == null ? undefined : days
}

/** Paramètres proposés par l’IA. Une liste copiée garde la première valeur autorisée. Hors bornes : refus. */
export function parseSkillParams(raw: unknown): SkillParams | null {
  if (!raw || typeof raw !== "object") return null
  const record = raw as Record<string, unknown>
  const curve = firstAllowed<SkillTarget>(record.curve, ["*", ...CURVE_KEYS])
  const gesture = firstAllowed(record.gesture, GESTURES)
  const ratio = record.ratio == null ? 0.618 : nearestGolden(firstNumber(record.ratio) ?? Number.NaN)
  const span = record.span == null ? "bande" : firstAllowed(record.span, SPANS)
  const window = record.window == null ? 8 : boundedInt(record.window, WINDOW_MIN, WINDOW_MAX)
  const days = optionalDays(record.days)
  if (!curve || !gesture || ratio == null || !span || window == null || days === undefined) return null
  return { curve, gesture, ratio, span, window, days }
}

/**
 * Gestes de départ, tous différents. Persiste, glisse, miroir et soir n’ont pas de réglage :
 * ils ne paraissent qu’une fois, le nombre d’or et la moyenne varient ensuite.
 */
const BASE_PRESETS: Omit<SkillParams, "curve">[] = [
  { gesture: "persiste", ratio: 0.618, span: "bande", window: 8, days: null },
  { gesture: "glisse", ratio: 0.618, span: "bande", window: 8, days: null },
  { gesture: "miroir", ratio: 0.618, span: "bande", window: 8, days: null },
  { gesture: "or", ratio: 0.618, span: "bande", window: 8, days: null },
  { gesture: "moyenne", ratio: 0.618, span: "bande", window: 5, days: null },
  { gesture: "or", ratio: 0.382, span: "lignes", window: 10, days: null },
  { gesture: "moyenne", ratio: 0.618, span: "bande", window: 10, days: 60 },
  { gesture: "or", ratio: 1.272, span: "pas", window: 5, days: null },
  { gesture: "moyenne", ratio: 0.618, span: "bande", window: 3, days: null },
  { gesture: "or", ratio: 0.618, span: "lignes", window: 16, days: null },
  { gesture: "moyenne", ratio: 0.618, span: "bande", window: 10, days: 30 },
  { gesture: "or", ratio: 0.382, span: "pas", window: 8, days: null },
  { gesture: "moyenne", ratio: 0.618, span: "bande", window: 10, days: 90 },
  { gesture: "or", ratio: 1.272, span: "bande", window: 8, days: null },
  { gesture: "moyenne", ratio: 0.618, span: "bande", window: 16, days: null },
  { gesture: "soir", ratio: 0.618, span: "pas", window: 3, days: null },
]

/** Skill de départ d’un runner : un geste pour toutes les courbes. */
export function baseSkill(runnerId: string, index: number): Skill {
  const preset = BASE_PRESETS[index % BASE_PRESETS.length]
  const lap = Math.floor(index / BASE_PRESETS.length)
  const params: SkillParams = {
    curve: "*",
    ...preset,
    window: Math.min(WINDOW_MAX, preset.window + lap * 2),
  }
  return newSkill(`${runnerId}-base`, "Geste de base", params, { cutoff: "", origin: "maison", examCents: null })
}

/** Variation maison : une skill dédiée à une courbe, tirée de la skill de base. Sans IA, elle reste une proposition. */
export function houseVariation(base: SkillParams, seed: number): SkillParams {
  const step = Math.abs(Math.round(seed))
  const curve = CURVE_KEYS[step % CURVE_KEYS.length]
  const gesture = GESTURES[(GESTURES.indexOf(base.gesture) + 1 + (step % (GESTURES.length - 1))) % GESTURES.length]
  const ratio = GOLDEN_RATIOS[(GOLDEN_RATIOS.indexOf(base.ratio) + 1 + step) % GOLDEN_RATIOS.length]
  const window = SHORT_WINDOWS[step % SHORT_WINDOWS.length]
  const days = gesture === "moyenne" ? LONG_DAYS[step % LONG_DAYS.length] : null
  return { curve, gesture, ratio, span: base.span, window, days }
}
