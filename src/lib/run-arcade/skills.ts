import { CURVE_KEYS, curveLabel, type CurveKey } from "./curves"
import { mix } from "./depart"
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

/** Ratio d’une skill qui n’en demande pas. Seul le geste « or » le lit ; le cercle d’or du dessin vise ce niveau. */
const DEFAULT_RATIO: GoldenRatio = 0.618

export const SPANS = ["bande", "lignes", "pas"] as const
export type SpanKind = (typeof SPANS)[number]

/** Étendues de la suite. Sur « pas », la dernière valeur est au bord de la bande : R ne compterait pas. */
export const SUITE_SPANS = ["bande", "lignes"] as const

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
  /**
   * Dernier tirage rejoué par l’examen qui a gardé la version. Absent : version venue avant ce champ.
   * Il ne sert pas à jouer (la version doit rester visible à son propre examen, voir `cutoff`),
   * seulement à la mettre de côté : la sélection a vu ce tirage.
   */
  examTo?: string
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
  if (forme === "sin" || forme === "arcsin" || forme === "arccos") {
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

/**
 * Dernière version écrite avant le tirage caché. Une version plus récente reste de côté.
 * Seul `cutoff` compte ici : avec `examTo`, une version ne jouerait plus les tirages de son propre examen.
 */
export function activeVersion(skill: Skill, hiddenDate?: string | null): SkillVersion | null {
  if (!hiddenDate) return currentVersion(skill) ?? null
  for (let index = skill.versions.length - 1; index >= 0; index -= 1) {
    const version = skill.versions[index]
    if (version.cutoff < hiddenDate) return version
  }
  return null
}

/**
 * Dernier tirage que la sélection de la version a vu : celui du prompt qui l’a écrite,
 * ou celui de l’examen qui l’a gardée, le plus tardif des deux.
 */
export function seenUntil(version: Pick<SkillVersion, "cutoff" | "examTo">) {
  const exam = version.examTo ?? ""
  return exam > version.cutoff ? exam : version.cutoff
}

/** Versions dont la sélection a vu le tirage caché ou un tirage d’après : elles restent de côté. */
export function auditCutoffs(skills: readonly Skill[], hiddenDate: string) {
  const late: { skillId: string; version: number; cutoff: string; examTo: string | null }[] = []
  for (const skill of skills) {
    for (const version of skill.versions) {
      if (seenUntil(version) >= hiddenDate) {
        late.push({ skillId: skill.id, version: version.version, cutoff: version.cutoff, examTo: version.examTo ?? null })
      }
    }
  }
  return late
}

/** Garde, pour chaque skill, les versions que la sélection a vues avant `hiddenDate`. Une skill sans version restante tombe. */
export function rollBack(skills: readonly Skill[], hiddenDate: string): Skill[] {
  return skills
    .map((skill) => ({ ...skill, versions: skill.versions.filter((version) => seenUntil(version) < hiddenDate) }))
    .filter((skill) => skill.versions.length > 0)
}

export type VersionMeta = {
  cutoff: string
  origin: SkillOrigin
  examCents: number | null
  /** Dernier tirage rejoué par l’examen qui garde la version. */
  examTo?: string | null
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
        ...(meta.examTo ? { examTo: meta.examTo } : {}),
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
        ...(meta.examTo ? { examTo: meta.examTo } : {}),
        origin: meta.origin,
        phrase: meta.phrase || describeSkill(params),
        examCents: meta.examCents,
      },
    ],
  }
}

/** Réglage absent : rien, ou un texte vide. Il prend sa valeur par défaut. */
function isAbsent(value: unknown) {
  return value == null || (typeof value === "string" && value.trim() === "")
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

/** Premier nombre d’un nombre ou d’un texte. Le signe moins compte : « -5 » vaut −5, jamais 5. */
function firstNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value !== "string") return null
  const match = value.replace(/\u2212/g, "-").match(/-?\d+(?:[.,]\d+)?/)
  if (!match) return null
  const parsed = Number(match[0].replace(",", "."))
  return Number.isFinite(parsed) ? parsed : null
}

/** Entier de min à max, arrondi de la même façon pour un nombre et pour un texte. Un signe moins refuse. */
function boundedInt(value: unknown, min: number, max: number) {
  const parsed = firstNumber(value)
  if (parsed == null || parsed < 0) return null
  const rounded = Math.round(parsed)
  return rounded >= min && rounded <= max ? rounded : null
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

/** Vide, 0 et « null » : réglage absent. undefined : valeur illisible. */
function readFigureN(value: unknown): number | null | undefined {
  if (isAbsent(value) || value === 0 || value === "0" || value === "null") return null
  const parsed = firstNumber(value)
  if (parsed == null) return undefined
  return Math.round(parsed)
}

/** Vide, 0 et « null » : pas de fenêtre longue. undefined : valeur illisible. */
function optionalDays(value: unknown): number | null | undefined {
  if (isAbsent(value) || value === 0 || value === "0" || value === "null") return null
  const days = boundedInt(value, DAYS_MIN, DAYS_MAX)
  return days == null ? undefined : days
}

/** Ratio lu dans une proposition « or » ou dans une version relue. Vide : 0,618. Plus de 0,05 d’un niveau d’or : refus. */
function readRatio(value: unknown) {
  return isAbsent(value) ? DEFAULT_RATIO : nearestGolden(firstNumber(value) ?? Number.NaN)
}

/** Forme retirée d’une version déjà écrite : « cos » se relit « sin ». À phase libre, le cosinus était le sinus. */
function storedForme(value: unknown) {
  return typeof value === "string" && value.trim() === "cos" ? "sin" : value
}

/** Jours qui contiennent toujours au moins `count` tirages, au rythme mardi puis vendredi (3 puis 4 jours). */
function daysHolding(count: number) {
  const back = Math.max(0, count - 1)
  return Math.ceil(3.5 * back + (back % 2) * 0.5) + 1
}

/**
 * Lit des réglages. `proposal` vrai : une proposition neuve, soumise aux règles de ce geste.
 * `proposal` faux : une version déjà écrite, relue telle quelle, sans règle de plus qu’avant.
 */
function readParams(raw: unknown, proposal: boolean): SkillParams | null {
  if (!raw || typeof raw !== "object") return null
  const record = raw as Record<string, unknown>
  const curve = firstAllowed<SkillTarget>(record.curve, ["*", ...CURVE_KEYS])
  const gesture = firstAllowed(record.gesture, GESTURES)
  const ratio = proposal && gesture !== "or" ? DEFAULT_RATIO : readRatio(record.ratio)
  const span = isAbsent(record.span) ? "bande" : firstAllowed(record.span, SPANS)
  const window = isAbsent(record.window) ? 8 : boundedInt(record.window, WINDOW_MIN, WINDOW_MAX)
  const days = optionalDays(record.days)
  if (!curve || !gesture || ratio == null || !span || window == null || days === undefined) return null
  if (gesture === "figure") {
    const forme = isAbsent(record.forme)
      ? "triangle"
      : firstAllowed(proposal ? record.forme : storedForme(record.forme), FORMES)
    if (!forme) return null
    const n = readFigureN(record.n)
    if (n === undefined) return null
    if (n != null && !figureNAllowed(forme, n)) return null
    const resolved = usesFigureN(forme) ? (n ?? defaultFigureN(forme)) : null
    const length = figureLength(forme, resolved)
    return {
      curve,
      gesture,
      ratio,
      span,
      window: proposal ? Math.max(window, length) : window,
      days: proposal && days != null ? Math.max(days, daysHolding(length)) : days,
      forme,
      n: resolved,
    }
  }
  if (gesture !== "suite") return { curve, gesture, ratio, span, window, days }
  const suite = isAbsent(record.suite) ? "logistique" : firstAllowed(record.suite, SUITES)
  const r = isAbsent(record.r) ? DEFAULT_LOGISTIC_R : nearestLogistic(firstNumber(record.r) ?? Number.NaN)
  if (!suite || r == null) return null
  if (proposal && !(SUITE_SPANS as readonly SpanKind[]).includes(span)) return null
  return { curve, gesture, ratio, span, window, days, suite, r }
}

/**
 * Paramètres proposés par l’IA. Une liste copiée garde la première valeur autorisée. Hors bornes : refus.
 * Un réglage vide vaut un réglage absent. Un nombre négatif est refusé.
 * Le ratio ne compte que pour « or » : ailleurs, il vaut 0,618. Une figure lit son calibre en entier :
 * sa fenêtre, ou ses jours, le rejoignent. La suite refuse l’étendue « du dernier pas ».
 */
export function parseSkillParams(raw: unknown): SkillParams | null {
  return readParams(raw, true)
}

/**
 * Réglages d’une version déjà écrite, venue de Neon ou d’un fichier. Elle se relit telle qu’elle a joué :
 * ratio gardé pour tous les gestes, suite sur « du dernier pas » permise, fenêtre de figure inchangée,
 * forme « cos » relue « sin ». Un champion écrit avant ces règles reste lisible.
 */
export function parseStoredSkillParams(raw: unknown): SkillParams | null {
  return readParams(raw, false)
}

/**
 * Gestes de départ, tous différents. Persiste, glisse, miroir, soir, la suite
 * et la figure ne paraissent qu’une fois. Le nombre d’or et la moyenne varient ensuite.
 * Un runner par geste : le plafond de runners (`RUNNER_MAX`) vaut leur nombre.
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
  const params: SkillParams = { curve: "*", ...BASE_PRESETS[index % BASE_PRESETS.length] }
  const name = params.gesture === "suite" ? "Suite numérique" : params.gesture === "figure" ? "Figure" : "Geste de base"
  return newSkill(`${runnerId}-base`, name, params, { cutoff: "", origin: "maison", examCents: null })
}

/** Sel de chaque réglage. Un réglage a son propre hachage : aucun n’est lié à un autre. */
const SALT = { curve: 1, gesture: 2, ratio: 3, span: 4, window: 5, days: 6, forme: 7, n: 8, r: 9 } as const

/** Paliers de fenêtre d’une figure : le plus petit qui contient son calibre. */
const FIGURE_WINDOWS = [...SHORT_WINDOWS, 16] as const

/**
 * Variation maison : une skill dédiée à une courbe, tirée au hasard dans l’espace des réglages.
 * Chaque réglage vient de `mix(graine, sel)`, donc la courbe, le geste, le ratio, l’étendue, la fenêtre,
 * les jours, la forme et R se combinent sans lien. Le geste est tiré hors du geste de base.
 * Une figure a une fenêtre au moins égale à son calibre. La suite n’a pas l’étendue « du dernier pas ».
 * Sans IA, elle reste une proposition.
 */
export function houseVariation(base: SkillParams, seed: number): SkillParams {
  const step = Math.abs(Math.round(seed))
  const pick = <T>(list: readonly T[], salt: number) => list[mix(step, salt) % list.length]
  const curve = pick(CURVE_KEYS, SALT.curve)
  const gesture = pick(
    GESTURES.filter((item) => item !== base.gesture),
    SALT.gesture
  )
  const ratio = pick(GOLDEN_RATIOS, SALT.ratio)
  const span = pick(gesture === "suite" ? SUITE_SPANS : SPANS, SALT.span)
  const window = pick(SHORT_WINDOWS, SALT.window)
  const days = gesture === "moyenne" ? pick(LONG_DAYS, SALT.days) : null
  if (gesture === "figure") {
    const forme = pick(FORMES, SALT.forme)
    const n =
      forme === "polygone"
        ? pick(POLYGON_SIDES, SALT.n)
        : forme === "arctan"
          ? pick(ARCTAN_TURNS, SALT.n)
          : usesFigureN(forme)
            ? pick(WAVE_PERIODS, SALT.n)
            : null
    const needed = Math.max(window, figureLength(forme, n))
    const fitted = FIGURE_WINDOWS.find((size) => size >= needed) ?? needed
    return { curve, gesture, ratio, span, window: fitted, days, forme, n }
  }
  if (gesture !== "suite") return { curve, gesture, ratio, span, window, days }
  return { curve, gesture, ratio, span, window, days, suite: "logistique", r: pick(LOGISTIC_R, SALT.r) }
}
