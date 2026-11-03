import { CURVE_KEYS, curveLabel, type CurveKey } from "./curves"
import {
  ARCTAN_TURNS,
  defaultFigureN,
  figureLength,
  figureNAllowed,
  FORMES,
  POLYGON_SIDES,
  WAVE_PERIODS,
  type Forme,
  usesFigureN,
} from "./figure"
import { formatRatio, GOLDEN_RATIOS, nearestGolden, type GoldenRatio } from "./golden"

export const GESTURES = ["persiste", "glisse", "miroir", "or", "moyenne", "soir", "suite", "figure"] as const
export type Gesture = (typeof GESTURES)[number]

/** Première suite : un pas de X(n+1) = R·Xn·(1−Xn). */
export const SUITES = ["logistique"] as const
export type SuiteId = (typeof SUITES)[number]

/** R du pas logistique. Au-dessus de 3,2, le pas traverse la bande. */
export const LOGISTIC_R = [1, 1.5, 2, 2.8, 3.2] as const
export type LogisticR = (typeof LOGISTIC_R)[number]
export const DEFAULT_LOGISTIC_R: LogisticR = 2

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
  /** Formule, seulement pour le geste suite. */
  suite?: SuiteId | null
  /** Paramètre R, seulement pour le geste suite. */
  r?: LogisticR | null
  /** Forme, seulement pour le geste figure. */
  forme?: Forme | null
  /** Côtés, période ou tour, seulement pour le geste figure. */
  n?: number | null
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
  suite: "suit la suite logistique",
  figure: "trace une figure",
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

export function figureClause(params: SkillParams) {
  const forme = params.forme ?? "triangle"
  const n = params.n ?? defaultFigureN(forme)
  const length = figureLength(forme, n)
  if (forme === "cercle") return `trace un cercle, calibre ${length}`
  if (forme === "polygone") return `trace un polygone à ${n} côtés, calibre ${length}`
  if (forme === "pythagore") return `suit l’hypoténuse, calibre ${length}`
  if (forme === "sin") return `suit un sinus de période ${n}, calibre ${length}`
  if (forme === "cos") return `suit un cosinus de période ${n}, calibre ${length}`
  if (forme === "tan") return `prolonge la tangente, calibre ${length}`
  if (forme === "arcsin") return `suit l’arcsinus de période ${n}, calibre ${length}`
  if (forme === "arccos") return `suit l’arccosinus de période ${n}, calibre ${length}`
  if (forme === "arctan") return `tourne l’arc tangente de ${n} degrés, calibre ${length}`
  return `trace un triangle, calibre ${length}`
}

/** Forme, réglage et calibre, pour ne pas confondre deux figures dans l’observation. */
export function figureMark(params: SkillParams) {
  const forme = params.forme ?? "triangle"
  const n = params.n ?? defaultFigureN(forme)
  const length = figureLength(forme, n)
  if (forme === "polygone") return `figure · polygone · ${n} côtés · calibre ${length}`
  if (forme === "sin" || forme === "cos" || forme === "arcsin" || forme === "arccos") {
    return `figure · ${forme} · période ${n} · calibre ${length}`
  }
  if (forme === "arctan") return `figure · arctan · tour ${n} · calibre ${length}`
  if (forme === "tan") return `figure · tan · calibre ${length}`
  return `figure · ${forme} · calibre ${length}`
}

export function describeSkill(params: SkillParams) {
  if (params.gesture === "soir") return `${targetLabel(params.curve)} suit l’autre soir, à 4 jours au plus.`
  if (params.gesture === "figure") {
    const scale = params.days ? `sur ${params.days} jours` : `sur ${params.window} tirages`
    return `${targetLabel(params.curve)} ${figureClause(params)}, ${scale}.`
  }
  if (params.gesture === "suite") {
    const r = params.r ?? DEFAULT_LOGISTIC_R
    return `${targetLabel(params.curve)} suit la suite logistique, R ${formatRatio(r)}, ${SPAN_PHRASE[params.span]}, sur ${params.window} tirages.`
  }
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

/** R le plus proche, à 0,05 près. Plus loin : refus. */
export function nearestLogistic(value: number): LogisticR | null {
  if (!Number.isFinite(value)) return null
  let best: LogisticR = LOGISTIC_R[0]
  for (const r of LOGISTIC_R) {
    if (Math.abs(r - value) < Math.abs(best - value)) best = r
  }
  return Math.abs(best - value) <= 0.05 ? best : null
}

/** 0 et « null » : réglage absent. undefined : valeur illisible. */
function readFigureN(value: unknown): number | null | undefined {
  if (value == null || value === "" || value === 0 || value === "0" || value === "null") return null
  const parsed = firstNumber(value)
  if (parsed == null) return undefined
  return Math.round(parsed)
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
  if (gesture === "figure") {
    const forme = record.forme == null || record.forme === "" ? "triangle" : firstAllowed(record.forme, FORMES)
    if (!forme) return null
    const n = readFigureN(record.n)
    if (n === undefined) return null
    if (n != null && !figureNAllowed(forme, n)) return null
    const resolved = usesFigureN(forme) ? (n ?? defaultFigureN(forme)) : null
    return { curve, gesture, ratio, span, window, days, forme, n: resolved }
  }
  if (gesture !== "suite") return { curve, gesture, ratio, span, window, days }
  const suite = record.suite == null || record.suite === "" ? "logistique" : firstAllowed(record.suite, SUITES)
  const r =
    record.r == null || record.r === ""
      ? DEFAULT_LOGISTIC_R
      : nearestLogistic(firstNumber(record.r) ?? Number.NaN)
  if (!suite || r == null) return null
  return { curve, gesture, ratio, span, window, days, suite, r }
}

/**
 * Gestes de départ, tous différents. Persiste, glisse, miroir, soir, la suite
 * et la figure ne paraissent qu’une fois. Le nombre d’or et la moyenne varient ensuite.
 */
const BASE_PRESETS: Omit<SkillParams, "curve">[] = [
  { gesture: "persiste", ratio: 0.618, span: "bande", window: 8, days: null },
  { gesture: "glisse", ratio: 0.618, span: "bande", window: 8, days: null },
  { gesture: "miroir", ratio: 0.618, span: "bande", window: 8, days: null },
  { gesture: "or", ratio: 0.618, span: "bande", window: 8, days: null },
  { gesture: "moyenne", ratio: 0.618, span: "bande", window: 5, days: null },
  { gesture: "or", ratio: 0.382, span: "lignes", window: 10, days: null },
  { gesture: "moyenne", ratio: 0.618, span: "bande", window: 10, days: 60 },
  { gesture: "suite", suite: "logistique", r: DEFAULT_LOGISTIC_R, ratio: 0.618, span: "bande", window: 8, days: null },
  { gesture: "or", ratio: 1.272, span: "pas", window: 5, days: null },
  { gesture: "moyenne", ratio: 0.618, span: "bande", window: 3, days: null },
  { gesture: "or", ratio: 0.618, span: "lignes", window: 16, days: null },
  { gesture: "moyenne", ratio: 0.618, span: "bande", window: 10, days: 30 },
  { gesture: "or", ratio: 0.382, span: "pas", window: 8, days: null },
  { gesture: "moyenne", ratio: 0.618, span: "bande", window: 10, days: 90 },
  { gesture: "or", ratio: 1.272, span: "bande", window: 8, days: null },
  { gesture: "moyenne", ratio: 0.618, span: "bande", window: 16, days: null },
  { gesture: "soir", ratio: 0.618, span: "pas", window: 3, days: null },
  { gesture: "figure", forme: "triangle", n: null, ratio: 0.618, span: "bande", window: 8, days: null },
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
  const name = params.gesture === "suite" ? "Suite numérique" : params.gesture === "figure" ? "Figure" : "Geste de base"
  return newSkill(`${runnerId}-base`, name, params, { cutoff: "", origin: "maison", examCents: null })
}

const CLASSIC_GESTURES = ["persiste", "glisse", "miroir", "or", "moyenne", "soir"] as const

/** Même cycle qu’avant la suite. La suite garde son pas sur sept. La figure prend le pas suivant. */
function variedGesture(base: Gesture, step: number): Gesture {
  if (step % (CLASSIC_GESTURES.length + 1) === CLASSIC_GESTURES.length) return "suite"
  if (step % (CLASSIC_GESTURES.length + 2) === CLASSIC_GESTURES.length + 1) return "figure"
  const origin = CLASSIC_GESTURES.indexOf(base as (typeof CLASSIC_GESTURES)[number])
  const from = origin < 0 ? 0 : origin
  return CLASSIC_GESTURES[(from + 1 + (step % (CLASSIC_GESTURES.length - 1))) % CLASSIC_GESTURES.length]
}

/** Variation maison : une skill dédiée à une courbe, tirée de la skill de base. Sans IA, elle reste une proposition. */
export function houseVariation(base: SkillParams, seed: number): SkillParams {
  const step = Math.abs(Math.round(seed))
  const curve = CURVE_KEYS[step % CURVE_KEYS.length]
  const gesture = variedGesture(base.gesture, step)
  const ratio = GOLDEN_RATIOS[(GOLDEN_RATIOS.indexOf(base.ratio) + 1 + step) % GOLDEN_RATIOS.length]
  const window = SHORT_WINDOWS[step % SHORT_WINDOWS.length]
  const days = gesture === "moyenne" ? LONG_DAYS[step % LONG_DAYS.length] : null
  if (gesture === "figure") {
    const forme = FORMES[step % FORMES.length]
    const n =
      forme === "polygone"
        ? POLYGON_SIDES[step % POLYGON_SIDES.length]
        : forme === "arctan"
          ? ARCTAN_TURNS[step % ARCTAN_TURNS.length]
          : forme === "sin" || forme === "cos" || forme === "tan" || forme === "arcsin" || forme === "arccos"
            ? WAVE_PERIODS[step % WAVE_PERIODS.length]
            : null
    return { curve, gesture, ratio, span: base.span, window, days, forme, n }
  }
  if (gesture !== "suite") return { curve, gesture, ratio, span: base.span, window, days }
  return {
    curve,
    gesture,
    ratio,
    span: base.span,
    window,
    days,
    suite: "logistique",
    r: LOGISTIC_R[step % LOGISTIC_R.length],
  }
}
