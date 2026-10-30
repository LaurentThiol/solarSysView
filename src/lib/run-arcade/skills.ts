import { CURVE_KEYS, curveLabel, isCurveKey, type CurveKey } from "./curves"
import { formatRatio, GOLDEN_RATIOS, nearestGolden, type GoldenRatio } from "./golden"

export const GESTURES = ["persiste", "glisse", "miroir", "or", "moyenne"] as const
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

/** Paramètres proposés par l’IA. Un champ inconnu ou hors bornes refuse la proposition. */
export function parseSkillParams(raw: unknown): SkillParams | null {
  if (!raw || typeof raw !== "object") return null
  const record = raw as Record<string, unknown>
  const curve = record.curve === "*" || isCurveKey(record.curve) ? (record.curve as SkillTarget) : null
  const gesture = (GESTURES as readonly string[]).includes(String(record.gesture)) ? (record.gesture as Gesture) : null
  const ratio = record.ratio == null ? 0.618 : nearestGolden(Number(record.ratio))
  const span = record.span == null ? "bande" : (SPANS as readonly string[]).includes(String(record.span)) ? (record.span as SpanKind) : null
  const window = record.window == null ? 8 : intIn(record.window, WINDOW_MIN, WINDOW_MAX)
  const days = record.days == null || record.days === 0 ? null : intIn(record.days, DAYS_MIN, DAYS_MAX)
  if (!curve || !gesture || ratio == null || !span || window == null) return null
  if (record.days != null && record.days !== 0 && days == null) return null
  return { curve, gesture, ratio, span, window, days }
}

const BASE_WINDOWS = [5, 8, 10, 3, 16] as const
const BASE_DAYS = [null, 30, 60, 90] as const

/** Skill de départ d’un runner : un geste pour toutes les courbes. */
export function baseSkill(runnerId: string, index: number): Skill {
  const gesture = GESTURES[index % GESTURES.length]
  const params: SkillParams = {
    curve: "*",
    gesture,
    ratio: GOLDEN_RATIOS[index % GOLDEN_RATIOS.length],
    span: SPANS[index % SPANS.length],
    window: BASE_WINDOWS[index % BASE_WINDOWS.length],
    days: gesture === "moyenne" ? BASE_DAYS[(index % (BASE_DAYS.length - 1)) + 1] : null,
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
