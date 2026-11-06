import { reconcile } from "./coherence"
import { sincePast } from "./depart"
import { chanceBalance } from "./examen"
import {
  CURVE_KEYS,
  DECADE_KEYS,
  NUMBER_KEYS,
  RANK_KEYS,
  STAR_KEYS,
  curveLabel,
  curveMeta,
  curveValues,
  isDecadeKey,
  type CurveKey,
  type CurveValues,
  type RankKey,
  type RankPoint,
} from "./curves"
import { readFigure } from "./figure"
import { formatRatio, goldenAim, GOLDEN_RATIOS } from "./golden"
import { soirReading } from "./soir"
import {
  activeVersion,
  baseSkill,
  DEFAULT_LOGISTIC_R,
  figureClause,
  figureMark,
  gesturePhrase,
  isBaseVersion,
  newSkill,
  versionAlive,
  type Gesture,
  type GestureLife,
  type Skill,
  type SkillParams,
  type SkillTarget,
  type SkillVersion,
} from "./skills"

export { aimRatio, formatRatio, goldenAim, GOLDEN_RATIOS, type GoldenRatio } from "./golden"
export {
  buildTrack,
  CURVE_KEYS,
  curveLabel,
  RANK_KEYS,
  type CurveKey,
  type CurveValues,
  type RankKey,
  type RankPoint,
} from "./curves"

export const START_CENTS = 5000
export const TICKET_CENTS = 250
export const HIT_CENTS = 200
export const RUNNER_MAX = 18
export const RUNNER_DEFAULT = 8
export const RACE_DRAWS_DEFAULT = 25

export type RunnerMind = {
  id: string
  name: string
  /** Courbe dessinée dans l’univers. Elle ne change pas l’annonce. */
  focus: CurveKey
  skills: Skill[]
}

export type Point = { x: number; y: number }
export type Segment = { x1: number; y1: number; x2: number; y2: number }

export type RailMark = {
  key: CurveKey
  /** Case jouée, après le rappel aux totales. */
  value: number
  /** Pointe du vecteur, avant le rappel. */
  thought: number
}

export type LectureWord = "correspond" | "ecarte"

/** Cinq lectures, dans l’ordre tangente, masque, cercle, pas, vecteur. */
export type Lecture = {
  tangente: LectureWord
  masque: LectureWord
  cercle: LectureWord
  pas: LectureWord
  vecteur: LectureWord
}

export const LECTURE_KEYS = ["tangente", "masque", "cercle", "pas", "vecteur"] as const

/** Fenêtre d’une skill sur la courbe affichée. */
export type CurveMask = {
  id: string
  /** Numéro de la version qui tient cette fenêtre. */
  version: number
  name: string
  gesture: Gesture
  curve: SkillTarget
  /** Cette version pose la pensée. */
  drives: boolean
  /** Solde d’examen de la version sur ce tour. Vide : pas de concours. */
  cents: number | null
  x1: number
  x2: number
}

/** Phrase reconnue, datée du premier soir où elle a été vue, comptée ensuite. */
export type Observation = {
  phrase: string
  createdOn: string
  count: number
}

export type ThoughtDraw = {
  focus: CurveKey
  /** Série révélée entière. Le dernier point est la dernière valeur lue. */
  trail: Point[]
  masks: CurveMask[]
  lecture: Lecture
  /** Courbe, geste, fenêtre et cinq lectures. Clé du registre. */
  observation: string
  tangent: Segment
  radius: { cx: number; cy: number; r: number }
  /** Trait du centre vers le niveau d’or visé. */
  spoke: Segment
  /** Pas de t−2 vers t−1. Absent au premier point. */
  velocity: Segment | null
  /** Flèche du dernier point vers la pensée. */
  vector: Segment
  /** Trait fin de la pensée vers la case jouée, quand les totales l’ont ramenée. */
  recall: Segment | null
  /** Case jouée sur la courbe dessinée. */
  projection: Point
  thoughtValue: number
  projectedValue: number
  golden: { ratio: number; y: number; chosen: boolean }[]
  marks: RailMark[]
  phrase: string
  /** Dernier tirage du passé révélé. Le tirage caché n’y figure pas. */
  seenDate: string
  yMin: number
  yMax: number
  xMax: number
}

export type Guess = Record<RankKey, number>

export type Thought = {
  guess: Guess
  cases: CurveValues
  tips: CurveValues
  draw: ThoughtDraw
}

export type ThinkOptions = {
  /** Date du tirage caché : une version écrite ce jour-là ou après ne joue pas. */
  hiddenDate?: string | null
  /** Courbe à dessiner à la place de celle du runner. */
  focus?: CurveKey
  /**
   * Une seule passe, sans concours. L’examen s’en sert : rejouer chaque version rappellerait l’examen.
   * La dédiée pose alors la pensée, sinon la dernière « toutes les courbes ».
   */
  plain?: boolean
  /** X des gestes. Absent : les versions ne meurent pas. */
  life?: GestureLife | null
  /**
   * Allumé : chaque version encore en vie pose sa pointe.
   * Le poids est l’écart au hasard depuis la naissance. Éteint : la plus haute pose la grille.
   * Ignoré en passe simple, pour que l’examen ne se mélange pas.
   */
  blend?: boolean
}

const DEFAULT_PARAMS: SkillParams = {
  curve: "*",
  gesture: "persiste",
  ratio: 0.618,
  span: "bande",
  window: 8,
  days: null,
}

export function formatCents(cents: number) {
  const sign = cents < 0 ? "−" : ""
  const abs = Math.abs(Math.round(cents))
  const euros = Math.floor(abs / 100)
  const cent = String(abs % 100).padStart(2, "0")
  return `${sign}${euros},${cent} €`
}

function formatNum(value: number) {
  const rounded = Math.round(value * 10) / 10
  if (Number.isInteger(rounded)) return String(rounded)
  return rounded.toFixed(1).replace(".", ",")
}

function round1(value: number) {
  return Math.round(value * 10) / 10
}

/** Skill qui pilote une courbe : la skill dédiée d’abord, sinon celle de toutes les courbes. */
export function paramsFor(mind: RunnerMind, key: CurveKey, hiddenDate?: string | null): SkillParams {
  let dedicated: SkillParams | null = null
  let wildcard: SkillParams | null = null
  for (const skill of mind.skills) {
    const version = activeVersion(skill, hiddenDate)
    if (!version) continue
    if (version.curve === key) dedicated = version
    else if (version.curve === "*") wildcard = version
  }
  return dedicated ?? wildcard ?? DEFAULT_PARAMS
}

function addDays(iso: string, days: number) {
  const date = new Date(`${iso.slice(0, 10)}T12:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

function windowValues(
  params: SkillParams,
  past: readonly RankPoint[],
  rows: readonly CurveValues[],
  key: CurveKey
) {
  if (params.days && past.length > 0) {
    const from = addDays(past[past.length - 1].date, -params.days)
    const values = rows.filter((_, index) => past[index].date > from).map((row) => row[key])
    if (values.length > 0) return values
  }
  return rows.slice(-Math.max(2, params.window)).map((row) => row[key])
}

export function spanFor(params: SkillParams, rows: readonly CurveValues[], key: CurveKey) {
  const meta = curveMeta(key)
  const window = rows.slice(-Math.max(2, params.window))
  if (params.span === "bande" || window.length === 0) return { lo: meta.lo, hi: meta.hi }
  if (params.span === "lignes") {
    if (key === "e1" || key === "e2") {
      const lo = Math.min(...window.map((row) => row.e1))
      const hi = Math.max(...window.map((row) => row.e2))
      return { lo, hi: Math.max(hi, lo + 1) }
    }
    const lo = Math.min(...window.map((row) => row[key]))
    const hi = Math.max(...window.map((row) => row[key]))
    return { lo, hi: Math.max(hi, lo + 1) }
  }
  const last = window[window.length - 1][key]
  const prev = window.length > 1 ? window[window.length - 2][key] : last
  if (last === prev) return { lo: last - 0.5, hi: last + 0.5 }
  const lo = Math.min(last, prev)
  return { lo, hi: Math.max(last, prev, lo + 1) }
}

function clampUnit(value: number) {
  return Math.min(1, Math.max(0, value))
}

/** Dernière valeur ramenée entre 0 et 1 sur la bande. Hors bande : collée au bord. */
function unitOf(value: number, lo: number, hi: number) {
  const width = hi - lo
  if (width <= 0) return 0
  return clampUnit((value - lo) / width)
}

/** Un pas : X(n+1) = R·Xn·(1−Xn). L’image reste au plus R/4. */
function logisticImage(unit: number, r: number) {
  const x = clampUnit(unit)
  return r * x * (1 - x)
}

/** Écart moyen entre chaque pas de la fenêtre et un pas logistique du même R. */
function logisticDistance(values: readonly number[], lo: number, hi: number, r: number) {
  if (values.length < 2) return 0
  const width = hi - lo
  if (width <= 0) return 0
  let total = 0
  for (let index = 0; index < values.length - 1; index += 1) {
    const predicted = lo + logisticImage(unitOf(values[index], lo, hi), r) * width
    total += Math.abs(values[index + 1] - predicted)
  }
  return total / (values.length - 1)
}

/** Pointe du vecteur d’une courbe : la pensée, avant le rappel aux totales. */
export function tipFor(
  params: SkillParams,
  past: readonly RankPoint[],
  rows: readonly CurveValues[],
  key: CurveKey,
  hiddenDate?: string | null
) {
  if (rows.length === 0) return 0
  if (params.gesture === "soir") return soirReading(past, rows, key, hiddenDate).tip
  const last = rows[rows.length - 1][key]
  const prev = rows.length > 1 ? rows[rows.length - 2][key] : last
  const delta = last - prev
  if (params.gesture === "persiste") return last
  if (params.gesture === "glisse") return last + delta
  if (params.gesture === "miroir") return last - delta
  if (params.gesture === "moyenne") {
    const values = windowValues(params, past, rows, key)
    return values.reduce((total, value) => total + value, 0) / values.length
  }
  if (params.gesture === "figure") {
    const values = windowValues(params, past, rows, key)
    const tip = readFigure(values, params.forme ?? "triangle", params.n ?? null).tip
    const meta = curveMeta(key)
    return Math.min(meta.hi, Math.max(meta.lo, tip))
  }
  const span = spanFor(params, rows, key)
  if (params.gesture === "suite") {
    const image = logisticImage(unitOf(last, span.lo, span.hi), params.r ?? DEFAULT_LOGISTIC_R)
    return span.lo + image * (span.hi - span.lo)
  }
  return goldenAim(span.lo, span.hi, params.ratio)
}

/** Fenêtre déjà lue par le geste : les `window` derniers tirages, ou les jours demandés. */
function windowBounds(params: SkillParams, past: readonly RankPoint[], rows: readonly CurveValues[]) {
  const last = rows.length - 1
  if (last < 0) return { x1: 0, x2: 0 }
  if (params.days && past.length > 0) {
    const from = addDays(past[last].date, -params.days)
    for (let index = 0; index <= last; index += 1) {
      if (past[index].date > from) return { x1: index, x2: last }
    }
  }
  const count = Math.min(rows.length, Math.max(2, params.window))
  return { x1: last - count + 1, x2: last }
}

/** Skills qui visent la courbe affichée. La dédiée pose la pensée, sinon la dernière `*`. */
function masksOn(
  mind: RunnerMind,
  key: CurveKey,
  hiddenDate: string | null,
  past: readonly RankPoint[],
  rows: readonly CurveValues[]
): CurveMask[] {
  const applicable: { skill: Skill; version: SkillVersion }[] = []
  let dedicated = -1
  let wildcard = -1
  for (const skill of mind.skills) {
    const version = activeVersion(skill, hiddenDate)
    if (!version || (version.curve !== key && version.curve !== "*")) continue
    const index = applicable.length
    applicable.push({ skill, version })
    if (version.curve === key) dedicated = index
    else wildcard = index
  }
  const driver = dedicated >= 0 ? dedicated : wildcard
  return applicable.map((item, index) => {
    const bounds = windowBounds(item.version, past, rows)
    return {
      id: item.skill.id,
      version: item.version.version,
      name: item.skill.name,
      gesture: item.version.gesture,
      curve: item.version.curve,
      drives: index === driver,
      cents: null,
      x1: bounds.x1,
      x2: bounds.x2,
    }
  })
}

/** Fenêtre d’examen, la même que `examStart` : les 25 derniers tirages, au moins deux de passé. */
const CONTEST_WINDOW = 25

function contestStart(pastLength: number) {
  return Math.min(pastLength, Math.max(2, pastLength - CONTEST_WINDOW))
}

/**
 * Solde d’examen d’une seule version, sur le passé lisible.
 * Le penseur est en passe simple : le concours ne se rappelle pas.
 */
function replayVersion(version: SkillVersion, past: readonly RankPoint[]): number | null {
  const focus = version.curve === "*" ? "n1" : version.curve
  const mind: RunnerMind = {
    id: "solo",
    name: "solo",
    focus,
    skills: [
      newSkill("solo", "solo", version, {
        cutoff: version.cutoff,
        origin: version.origin === "maison" ? "maison" : "ia",
        examCents: null,
        phrase: version.phrase,
      }),
    ],
  }
  const start = contestStart(past.length)
  let cents = START_CENTS
  let turns = 0
  for (let index = start; index < past.length; index += 1) {
    if (cents < TICKET_CENTS) break
    const hidden = past[index]
    const seen = past.slice(0, index)
    if (seen.length < 2) continue
    const thought = think(mind, seen, { hiddenDate: hidden.date, plain: true })
    cents = settlePurse(cents, countHits(thought.guess, hidden))
    turns += 1
  }
  return turns > 0 ? cents : null
}

type Contender = {
  skill: Skill
  version: SkillVersion
  order: number
  cents: number | null
}

function lifeOf(version: SkillVersion, life: GestureLife | null) {
  if (!life) return null
  return life.draws[version.gesture] ?? null
}

/** Versions qui jouent encore ce tirage. Le geste de base y est toujours. */
function contenders(mind: RunnerMind, hiddenDate: string | null, life: GestureLife | null): Contender[] {
  const dates = life?.dates ?? []
  const found: Contender[] = []
  let order = 0
  for (const skill of mind.skills) {
    for (const version of skill.versions) {
      if (!versionAlive(version, hiddenDate, lifeOf(version, life), dates)) continue
      found.push({ skill, version, order, cents: null })
      order += 1
    }
  }
  return found
}

/** La plus récente : coupure la plus tardive, puis numéro, puis place dans la liste. */
function moreRecent(a: Contender, b: Contender) {
  if (a.version.cutoff !== b.version.cutoff) return a.version.cutoff > b.version.cutoff
  if (a.version.version !== b.version.version) return a.version.version > b.version.version
  return a.order > b.order
}

/** Solde le plus haut. À égalité, ou sans solde des deux côtés, la plus récente. */
function beats(a: Contender, b: Contender) {
  if (a.cents == null && b.cents == null) return moreRecent(a, b)
  if (a.cents == null) return false
  if (b.cents == null) return true
  if (a.cents !== b.cents) return a.cents > b.cents
  return moreRecent(a, b)
}

export type BlendTip = {
  tip: number
  /** Écart au hasard depuis la naissance. Nul ou négatif : cette pointe ne pèse pas. */
  weight: number
  cutoff: string
  version: number
  order: number
}

/** La plus récente : coupure la plus tardive, puis numéro, puis place dans la liste. */
function laterBlend(a: BlendTip, b: BlendTip) {
  if (a.cutoff !== b.cutoff) return a.cutoff > b.cutoff
  if (a.version !== b.version) return a.version > b.version
  return a.order > b.order
}

/**
 * Pensée : moyenne des pointes, pondérée par l’écart au hasard depuis la naissance.
 * Un écart nul ou négatif ne pèse pas. Si tous les poids sont nuls, la plus récente joue seule.
 */
export function blendTips(rows: readonly BlendTip[]): number {
  let mass = 0
  let sum = 0
  for (const row of rows) {
    if (!(row.weight > 0) || !Number.isFinite(row.tip)) continue
    mass += row.weight
    sum += row.tip * row.weight
  }
  if (mass > 0) return sum / mass
  let best: BlendTip | null = null
  for (const row of rows) {
    if (!Number.isFinite(row.tip)) continue
    if (!best || laterBlend(row, best)) best = row
  }
  return best ? best.tip : Number.NaN
}

function versionKey(version: SkillVersion) {
  return [
    version.curve,
    version.gesture,
    version.window,
    version.days ?? "",
    version.ratio,
    version.span,
    version.r ?? "",
    version.forme ?? "",
    version.n ?? "",
    version.cutoff,
    version.origin,
  ].join("|")
}

function pastStamp(past: readonly RankPoint[]) {
  const mid = past[Math.floor(past.length / 2)]
  const last = past[past.length - 1]
  return [
    past.length,
    past[0]?.date ?? "",
    mid?.date ?? "",
    mid?.n1 ?? "",
    last?.date ?? "",
    last?.n1 ?? "",
    last?.e2 ?? "",
  ].join("|")
}

const gapCache = new Map<string, number>()

function soloMind(version: SkillVersion): RunnerMind {
  const focus: CurveKey = version.curve === "*" ? "n1" : version.curve
  return {
    id: "poids",
    name: "poids",
    focus,
    skills: [
      newSkill(
        "poids",
        "poids",
        {
          curve: version.curve,
          gesture: version.gesture,
          ratio: version.ratio,
          span: version.span,
          window: version.window,
          days: version.days,
          suite: version.suite,
          r: version.r,
          forme: version.forme,
          n: version.n,
        },
        {
          cutoff: version.cutoff,
          origin: version.origin,
          examCents: null,
          phrase: version.phrase,
        }
      ),
    ],
  }
}

/**
 * Écart entre le solde de cette version et le hasard, sur les tirages révélés depuis sa naissance.
 * Le tirage caché n’est pas dans `past`. Sans tour joué, l’écart est nul.
 * En dessous du hasard, l’écart est négatif : il ne pèse pas.
 */
export function gapSinceBirth(version: SkillVersion, past: readonly RankPoint[]) {
  const key = `${versionKey(version)}|${pastStamp(past)}`
  const cached = gapCache.get(key)
  if (cached != null) return cached
  let cents = START_CENTS
  let turns = 0
  if (past.length >= 2) {
    const mind = soloMind(version)
    for (let index = 0; index < past.length; index += 1) {
      const hidden = past[index]
      if (version.cutoff && hidden.date <= version.cutoff) continue
      if (cents < TICKET_CENTS) break
      const seen = past.slice(0, index)
      if (seen.length < 2) continue
      const thought = think(mind, seen, { hiddenDate: hidden.date, plain: true })
      cents = settlePurse(cents, countHits(thought.guess, hidden))
      turns += 1
    }
  }
  const raw = turns > 0 ? cents - chanceBalance(turns).cents : 0
  const gap = Math.round(raw)
  gapCache.set(key, gap)
  return gap
}

function baseParams(mind: RunnerMind): SkillParams {
  for (const skill of mind.skills) {
    for (const version of skill.versions) {
      if (isBaseVersion(version)) return version
    }
  }
  return DEFAULT_PARAMS
}

function maskId(skill: Skill, version: SkillVersion, shared: boolean) {
  return shared ? `${skill.id}-v${version.version}` : skill.id
}

/** Par courbe, la version vivante au solde le plus haut. Les autres restent en masque, avec ce solde. */
function contest(
  mind: RunnerMind,
  past: readonly RankPoint[],
  rows: readonly CurveValues[],
  hiddenDate: string | null,
  life: GestureLife | null
) {
  const living = contenders(mind, hiddenDate, life)
  const scored =
    living.length >= 2
      ? living.map((item) => ({ ...item, cents: replayVersion(item.version, past) }))
      : living
  const counts = new Map<string, number>()
  for (const item of scored) counts.set(item.skill.id, (counts.get(item.skill.id) ?? 0) + 1)

  function paramsOf(key: CurveKey): SkillParams {
    let best: Contender | null = null
    for (const item of scored) {
      if (item.version.curve !== key && item.version.curve !== "*") continue
      if (!best || beats(item, best)) best = item
    }
    return best?.version ?? baseParams(mind)
  }

  function masksOf(key: CurveKey): CurveMask[] {
    const applicable = scored.filter((item) => item.version.curve === key || item.version.curve === "*")
    let driver = -1
    for (let index = 0; index < applicable.length; index += 1) {
      if (driver < 0 || beats(applicable[index], applicable[driver])) driver = index
    }
    return applicable.map((item, index) => {
      const bounds = windowBounds(item.version, past, rows)
      return {
        id: maskId(item.skill, item.version, (counts.get(item.skill.id) ?? 0) > 1),
        version: item.version.version,
        name: item.skill.name,
        gesture: item.version.gesture,
        curve: item.version.curve,
        drives: index === driver,
        cents: item.cents,
        x1: bounds.x1,
        x2: bounds.x2,
      }
    })
  }

  return { paramsOf, masksOf }
}

type MixSole = { skillId: string; version: number; params: SkillParams }

type CurveMix = {
  tips: CurveValues
  /** Version qui joue seule sur la courbe affichée. Vide : la pensée est une moyenne. */
  sole: MixSole | null
  averaged: boolean
}

function maskPlays(mask: CurveMask, sole: MixSole | null) {
  if (!sole || mask.version !== sole.version) return false
  return mask.id === sole.skillId || mask.id === `${sole.skillId}-v${sole.version}`
}

/** Pointes encore en vie, une moyenne par courbe. Le poids est l’écart déjà compté depuis la naissance. */
function blendedTips(
  mind: RunnerMind,
  past: readonly RankPoint[],
  curveRows: readonly CurveValues[],
  hiddenDate: string | null,
  life: GestureLife | null,
  focus: CurveKey
): CurveMix {
  const living = contenders(mind, hiddenDate, life)
  const weightOf = new Map<number, number>()
  for (const item of living) {
    const gap = gapSinceBirth(item.version, past)
    weightOf.set(item.order, gap > 0 ? gap : 0)
  }
  const tips = {} as CurveValues
  let focusRows: (BlendTip & MixSole)[] = []
  for (const key of CURVE_KEYS) {
    const ranked: (BlendTip & MixSole)[] = []
    for (const item of living) {
      if (item.version.curve !== key && item.version.curve !== "*") continue
      ranked.push({
        tip: tipFor(item.version, past, curveRows, key, hiddenDate),
        weight: weightOf.get(item.order) ?? 0,
        cutoff: item.version.cutoff,
        version: item.version.version,
        order: item.order,
        skillId: item.skill.id,
        params: item.version,
      })
    }
    tips[key] =
      ranked.length > 0
        ? blendTips(ranked)
        : tipFor(baseParams(mind), past, curveRows, key, hiddenDate)
    if (key === focus) focusRows = ranked
  }
  const pulling = focusRows.filter((row) => row.weight > 0 && Number.isFinite(row.tip))
  if (pulling.length === 1) return { tips, sole: pulling[0], averaged: false }
  if (pulling.length > 1) return { tips, sole: null, averaged: true }
  let best: (BlendTip & MixSole) | null = null
  for (const row of focusRows) {
    if (!Number.isFinite(row.tip)) continue
    if (!best || laterBlend(row, best)) best = row
  }
  return { tips, sole: best, averaged: false }
}

const FLAT_STEP = 0.05

function meanAbs(values: readonly number[], target: number) {
  if (values.length === 0) return 0
  return values.reduce((total, value) => total + Math.abs(value - target), 0) / values.length
}

function halfGap(values: readonly number[]) {
  if (values.length < 2) return 0
  const mid = Math.floor(values.length / 2)
  const mean = (slice: readonly number[]) => slice.reduce((total, value) => total + value, 0) / slice.length
  return Math.abs(mean(values.slice(0, mid)) - mean(values.slice(mid)))
}

/** Écart moyen à la droite du dernier pas. Les deux derniers points sont sur la droite. */
function tangentDistance(points: readonly Point[], last: Point, delta: number) {
  if (points.length <= 2) return 0
  const sample = points.slice(0, -2)
  const total = sample.reduce((sum, point) => {
    const predicted = last.y + delta * (point.x - last.x)
    return sum + Math.abs(point.y - predicted)
  }, 0)
  return total / sample.length
}

function word(ok: boolean): LectureWord {
  return ok ? "correspond" : "ecarte"
}

export function lectureWord(value: LectureWord) {
  return value === "correspond" ? "correspond" : "s’écarte"
}

function lectureClause(lecture: Lecture) {
  return LECTURE_KEYS.map((key) => `${key} ${lectureWord(lecture[key])}`).join(", ")
}

function windowLabel(params: SkillParams) {
  return params.days ? `${params.days} jours` : `${Math.max(2, params.window)} tirages`
}

/** Texte envoyé avec le dessin : la phrase, puis les cinq valeurs à recopier. */
export function drawingText(draw: Pick<ThoughtDraw, "observation" | "lecture">) {
  const copy = LECTURE_KEYS.map((key) => `${key} ${draw.lecture[key]}`).join(", ")
  return `${draw.observation}\nÀ recopier : ${copy}`
}

const OBSERVATION_DATE = new Intl.DateTimeFormat("fr-FR", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
})

/** Date sans jour de semaine : « 12 mars 2026 », « 1er mars 2026 ». */
export function formatObservationDate(isoDate: string) {
  return OBSERVATION_DATE.formatToParts(new Date(`${isoDate.slice(0, 10)}T12:00:00Z`))
    .map((part) => (part.type === "day" && part.value === "1" ? "1er" : part.value))
    .join("")
}

export function observationReport(item: Observation) {
  return `Observation du ${formatObservationDate(item.createdOn)}, vue ${item.count} fois.`
}

export function observationReportFor(observations: readonly Observation[], phrase: string | null | undefined) {
  if (!phrase) return null
  const found = observations.find((item) => item.phrase === phrase)
  return found ? observationReport(found) : null
}

export function noteObservation(
  observations: readonly Observation[],
  seen: ReadonlySet<string>,
  input: { runnerId: string; hiddenDate: string; phrase: string; createdOn: string }
) {
  const token = `${input.runnerId}|${input.hiddenDate}|${input.phrase}`
  if (seen.has(token)) return { observations: [...observations], seen: new Set(seen), counted: false }
  const nextSeen = new Set(seen)
  nextSeen.add(token)
  const index = observations.findIndex((item) => item.phrase === input.phrase)
  if (index < 0) {
    return {
      observations: [...observations, { phrase: input.phrase, createdOn: input.createdOn, count: 1 }],
      seen: nextSeen,
      counted: true,
    }
  }
  return {
    observations: observations.map((item, itemIndex) =>
      itemIndex === index ? { ...item, count: item.count + 1 } : item
    ),
    seen: nextSeen,
    counted: true,
  }
}

/** Une reconnaissance par runner, par tirage caché, par phrase. Le même jeton ne recompte pas. */
export function noteRace(
  observations: readonly Observation[],
  seen: ReadonlySet<string>,
  race: Race,
  hiddenDate: string
) {
  let next = observations
  let tokens = seen
  for (const runner of race.runners) {
    if (!runner.alive || !runner.thought) continue
    const noted = noteObservation(next, tokens, {
      runnerId: runner.mind.id,
      hiddenDate,
      phrase: runner.thought.observation,
      createdOn: runner.thought.seenDate,
    })
    next = noted.observations
    tokens = noted.seen
  }
  return { observations: next, seen: tokens }
}

function guessOf(numbers: readonly number[], stars: readonly number[]): Guess {
  return {
    n1: numbers[0],
    n2: numbers[1],
    n3: numbers[2],
    n4: numbers[3],
    n5: numbers[4],
    e1: stars[0],
    e2: stars[1],
  }
}

export function think(mind: RunnerMind, past: readonly RankPoint[], options: ThinkOptions = {}): Thought {
  if (past.length === 0) throw new Error("think : passé vide")
  const hiddenDate = options.hiddenDate ?? null
  const rows = past.map(curveValues)
  for (const row of rows) {
    for (const key of CURVE_KEYS) {
      if (!Number.isFinite(row[key])) throw new Error("think : valeur non finie dans le passé")
    }
  }
  const picked = options.plain ? null : contest(mind, past, rows, hiddenDate, options.life ?? null)
  const focus = options.focus ?? mind.focus
  const mix =
    options.blend === true && !options.plain
      ? blendedTips(mind, past, rows, hiddenDate, options.life ?? null, focus)
      : null
  const tips = {} as CurveValues
  if (mix) {
    for (const key of CURVE_KEYS) tips[key] = mix.tips[key]
  } else {
    for (const key of CURVE_KEYS) {
      tips[key] = tipFor(picked ? picked.paramsOf(key) : paramsFor(mind, key, hiddenDate), past, rows, key, hiddenDate)
    }
  }
  const reconciled = reconcile(tips)
  const guess = guessOf(reconciled.numbers, reconciled.stars)

  const params = mix?.sole ? mix.sole.params : picked ? picked.paramsOf(focus) : paramsFor(mind, focus, hiddenDate)
  const trail = rows.map((row, index) => ({ x: index, y: row[focus] }))
  const rawMasks = picked ? picked.masksOf(focus) : masksOn(mind, focus, hiddenDate, past, rows)
  const masks = mix ? rawMasks.map((mask) => ({ ...mask, drives: maskPlays(mask, mix.sole) })) : rawMasks
  const driver = masks.find((mask) => mask.drives)
  const bounds = driver ? { x1: driver.x1, x2: driver.x2 } : windowBounds(params, past, rows)
  const maskPoints = trail.filter((point) => point.x >= bounds.x1 && point.x <= bounds.x2)
  const last = trail[trail.length - 1]
  const prev = trail.length > 1 ? trail[trail.length - 2] : last
  const prev2 = trail.length > 2 ? trail[trail.length - 3] : null
  const delta = last.y - prev.y
  const deltaPrev = prev2 ? prev.y - prev2.y : null
  const span = spanFor(params, rows, focus)
  const spanWidth = Math.max(1, span.hi - span.lo)
  const aimY = goldenAim(span.lo, span.hi, params.ratio)
  const levels = GOLDEN_RATIOS.map((ratio) => ({
    ratio,
    y: goldenAim(span.lo, span.hi, ratio),
    chosen: ratio === params.ratio,
  }))
  const rawR = Math.abs(last.y - aimY)
  const radius = Math.min(Math.max(rawR, 0.8), Math.max(1.5, spanWidth * 0.45))
  const reach = 1.25
  const tangent: Segment = {
    x1: last.x - reach,
    y1: last.y - delta * reach,
    x2: last.x + reach,
    y2: last.y + delta * reach,
  }
  const tip = tips[focus]
  const projected = reconciled.cases[focus]
  const ahead = last.x + 1
  const recalled = Math.abs(projected - tip) >= 0.5
  const visible = levels.filter((level) => {
    const low = Math.min(span.lo, last.y, projected, tip) - spanWidth * 0.35
    const high = Math.max(span.hi, last.y, projected, tip) + spanWidth * 0.75
    return level.y >= low && level.y <= high
  })
  const slopeWord = delta > FLAT_STEP ? "montante" : delta < -FLAT_STEP ? "descendante" : "plate"
  const reading = params.gesture === "soir" ? soirReading(past, rows, focus, hiddenDate) : null
  const figureValues = params.gesture === "figure" ? windowValues(params, past, rows, focus) : null
  const figureRead = figureValues ? readFigure(figureValues, params.forme ?? "triangle", params.n ?? null) : null
  const figureUnread = figureValues != null && figureRead != null && figureValues.length < figureRead.length
  const tol = Math.max(0.5, spanWidth / 4)
  const maskValues = maskPoints.map((point) => point.y)
  const tangentGap = tangentDistance(maskPoints, last, delta)
  const tangente = word(tangentGap <= tol)
  const masque = word(
    params.gesture === "figure"
      ? Boolean(figureRead?.correspond)
      : params.gesture === "glisse"
      ? tangentGap <= tol
      : params.gesture === "soir"
        ? reading?.days != null
        : params.gesture === "miroir"
          ? deltaPrev != null && Math.abs(delta + deltaPrev) <= tol
          : params.gesture === "moyenne"
            ? halfGap(maskValues) <= tol
          : params.gesture === "or"
            ? meanAbs(maskValues, aimY) <= tol
            : params.gesture === "suite"
              ? logisticDistance(maskValues, span.lo, span.hi, params.r ?? DEFAULT_LOGISTIC_R) <= tol
              : meanAbs(maskValues, last.y) <= tol
  )
  const pas = word(
    deltaPrev != null &&
      ((Math.abs(delta) <= FLAT_STEP && Math.abs(deltaPrev) <= FLAT_STEP) ||
        (delta * deltaPrev > 0 && Math.abs(delta - deltaPrev) <= tol))
  )
  const lecture: Lecture = {
    tangente,
    masque,
    cercle: word(meanAbs(maskValues, aimY) <= tol),
    pas,
    vecteur: word(Math.abs(projected - tip) < 0.5),
  }
  const clause = mix?.averaged
    ? "moyenne les pointes encore en vie"
    : reading
      ? reading.days == null
        ? `reprend le pas du ${reading.evening}`
        : `${reading.evening} suit le ${reading.other} à ${reading.days} ${reading.days > 1 ? "jours" : "jour"}`
      : params.gesture === "figure"
        ? figureUnread
          ? `${figureClause(params)}, figure non lue, reste sur place`
          : figureClause(params)
        : params.gesture === "suite"
          ? `${gesturePhrase(params.gesture)}, R ${formatRatio(params.r ?? DEFAULT_LOGISTIC_R)}`
          : gesturePhrase(params.gesture)
  const words = lectureClause(lecture)
  const windowText =
    params.gesture === "suite"
      ? `R ${formatRatio(params.r ?? DEFAULT_LOGISTIC_R)} · ${windowLabel(params)}`
      : windowLabel(params)
  const observation = mix?.averaged
    ? `${curveLabel(focus)} · mélange · ${windowLabel(params)} · ${words}`
    : params.gesture === "figure"
      ? `${curveLabel(focus)} · ${figureMark(params)} · ${windowLabel(params)} · ${words}`
      : `${curveLabel(focus)} · ${params.gesture} · ${windowText} · ${words}`
  const phrase = mix?.averaged
    ? `${curveLabel(focus)} moyenne les pointes encore en vie : tangente ${slopeWord}, vecteur ${formatNum(tip)}, projection ${projected}${recalled ? ", ramenée par les totales" : ""}. Lecture : ${words}.`
    : params.gesture === "figure"
      ? `${curveLabel(focus)} ${clause} : vecteur ${formatNum(tip)}, projection ${projected}${recalled ? ", ramenée par les totales" : ""}. Lecture : ${words}.`
      : `${curveLabel(focus)} ${clause} : tangente ${slopeWord}, rayon ${formatNum(radius)} vers ${formatRatio(params.ratio)}, vecteur ${formatNum(tip)}, projection ${projected}${recalled ? ", ramenée par les totales" : ""}. Lecture : ${words}.`
  const ys = [
    ...trail.map((point) => point.y),
    tangent.y1,
    tangent.y2,
    tip,
    projected,
    last.y - radius,
    last.y + radius,
    aimY,
    ...visible.map((level) => level.y),
  ]
  let yMin = Math.min(...ys)
  let yMax = Math.max(...ys)
  if (yMin === yMax) {
    yMin -= 1
    yMax += 1
  }
  const pad = Math.max(0.8, (yMax - yMin) * 0.08)
  return {
    guess,
    cases: reconciled.cases,
    tips,
    draw: {
      focus,
      trail,
      masks,
      lecture,
      observation,
      tangent,
      radius: { cx: last.x, cy: last.y, r: radius },
      spoke: { x1: last.x, y1: last.y, x2: last.x, y2: aimY },
      velocity: trail.length > 1 ? { x1: prev.x, y1: prev.y, x2: last.x, y2: last.y } : null,
      vector: { x1: last.x, y1: last.y, x2: ahead, y2: tip },
      recall: recalled ? { x1: ahead, y1: tip, x2: ahead, y2: projected } : null,
      projection: { x: ahead, y: projected },
      thoughtValue: tip,
      projectedValue: projected,
      golden: visible,
      marks: CURVE_KEYS.map((key) => ({ key, value: reconciled.cases[key], thought: round1(tips[key]) })),
      phrase,
      seenDate: past[past.length - 1].date,
      yMin: yMin - pad,
      yMax: yMax + pad,
      xMax: ahead,
    },
  }
}

/** Un numéro trouvé parmi les cinq boules, une étoile trouvée parmi les deux étoiles. Sans logique de rang. */
export function countHits(guess: Guess, actual: RankPoint) {
  const numbers = new Set(NUMBER_KEYS.map((key) => actual[key]))
  const stars = new Set(STAR_KEYS.map((key) => actual[key]))
  const playedNumbers = new Set(NUMBER_KEYS.map((key) => guess[key]))
  const playedStars = new Set(STAR_KEYS.map((key) => guess[key]))
  let hits = 0
  for (const value of playedNumbers) if (numbers.has(value)) hits += 1
  for (const value of playedStars) if (stars.has(value)) hits += 1
  return hits
}

/** Cases payées : n et e dont la valeur est sortie dans le même pool. */
export function matchedKeys(cases: CurveValues, actual: RankPoint): CurveKey[] {
  const numbers = new Set(NUMBER_KEYS.map((key) => actual[key]))
  const stars = new Set(STAR_KEYS.map((key) => actual[key]))
  return RANK_KEYS.filter((key) =>
    key === "e1" || key === "e2" ? stars.has(cases[key]) : numbers.has(cases[key])
  )
}

/** Sommes et décennies tombées juste. Elles ne versent rien. */
export function exactKeys(cases: CurveValues, actual: RankPoint): CurveKey[] {
  const values = curveValues(actual)
  return CURVE_KEYS.filter(
    (key) => (key === "sumNumbers" || key === "sumStars" || isDecadeKey(key)) && cases[key] === values[key]
  )
}

export function settlePurse(cents: number, hits: number) {
  return cents - TICKET_CENTS + hits * HIT_CENTS
}

const FOCUS_ORDER: readonly CurveKey[] = CURVE_KEYS

export function createMinds(count: number): RunnerMind[] {
  const n = Math.min(RUNNER_MAX, Math.max(1, Math.round(count)))
  return Array.from({ length: n }, (_, index) => {
    const id = `r${index + 1}`
    return {
      id,
      name: `R${index + 1}`,
      focus: FOCUS_ORDER[index % FOCUS_ORDER.length],
      skills: [baseSkill(id, index)],
    }
  })
}

export type RunnerLive = {
  mind: RunnerMind
  cents: number
  alive: boolean
  turns: number
  hits: number
  lastHits: number
  thought: ThoughtDraw | null
  guess: Guess | null
  cases: CurveValues | null
  /** Cases payées, posées par l’arbitre après le dessin. */
  matched: CurveKey[]
  /** Sommes et décennies justes, posées par l’arbitre après le dessin. */
  exact: CurveKey[]
  /** Solde d’examen des skills en place, sur l’archive lisible. Vide : aucun tirage à rejouer. */
  examCents: number | null
  /** Fenêtre de l’examen qui a donné ce solde : premier et dernier tirage rejoués, et nombre de tours. */
  examFrom: string | null
  examTo: string | null
  examTurns: number
  /** Tour de course où cet examen a été rejoué. Vide : au lancement, avant le premier tour. */
  examAt: number | null
  /** Premier tirage que ce runner a le droit de lire. Vide : toute l’archive. */
  since: string
  /** Appels à l’IA locale et à Brave depuis le lancement. */
  calls: number
  /** Skills nouvelles ajoutées pendant ce lancement. */
  added: number
}

export type Race = {
  runners: RunnerLive[]
  cursor: number
  start: number
  end: number
  revealed: RankPoint | null
  /** Date du dernier tirage lisible au moment du dessin. */
  seenDate: string | null
  done: boolean
  /** X des gestes pour cette course. Absent : les versions ne meurent pas. */
  life?: GestureLife | null
  /** Allumé au lancement : les pointes encore en vie se moyennent. */
  blend: boolean
}

export function newRunner(mind: RunnerMind): RunnerLive {
  return {
    mind,
    cents: START_CENTS,
    alive: true,
    turns: 0,
    hits: 0,
    lastHits: 0,
    thought: null,
    guess: null,
    cases: null,
    matched: [],
    exact: [],
    examCents: null,
    examFrom: null,
    examTo: null,
    examTurns: 0,
    examAt: null,
    since: "",
    calls: 0,
    added: 0,
  }
}

/** Le tronçon payant est les `x` derniers tirages de la piste. Deux tirages gratuits au moins le précèdent. */
export function createRace(field: number | RunnerMind[], trackLength: number, x: number): Race {
  const minds = typeof field === "number" ? createMinds(field) : field
  const end = Math.max(0, trackLength)
  const span = Math.max(1, Math.round(x))
  const start = Math.min(end, Math.max(2, end - span))
  return {
    runners: minds.map(newRunner),
    cursor: start,
    start,
    end,
    revealed: null,
    seenDate: null,
    done: start >= end,
    blend: false,
  }
}

/** Copie des tirages strictement avant `cursor`. `cursor` est le tirage caché. */
export function revealedPast(series: readonly RankPoint[], cursor: number): RankPoint[] {
  const end = Math.max(0, Math.min(cursor, series.length))
  return series.slice(0, end).map((point) => ({
    date: point.date,
    n1: point.n1,
    n2: point.n2,
    n3: point.n3,
    n4: point.n4,
    n5: point.n5,
    e1: point.e1,
    e2: point.e2,
  }))
}

/** Pensée de chaque runner vivant pour le tirage caché, sans le jouer. Mêmes gardes que `playTurn`. */
export function previewTurn(race: Race, series: readonly RankPoint[]): Race {
  if (race.done || race.cursor >= race.end || race.cursor >= series.length || race.cursor < 2) return race
  const past = revealedPast(series, race.cursor)
  const hiddenDate = series[race.cursor].date
  return {
    ...race,
    runners: race.runners.map((runner) => {
      if (!runner.alive || runner.cents < TICKET_CENTS) return runner
      const history = sincePast(past, runner.since)
      if (history.length < 2) return runner
      const thought = think(runner.mind, history, { hiddenDate, life: race.life ?? null, blend: race.blend })
      return { ...runner, thought: thought.draw, guess: thought.guess, cases: thought.cases, matched: [], exact: [] }
    }),
  }
}

export function playTurn(race: Race, series: readonly RankPoint[]): Race {
  if (race.done || race.cursor >= race.end || race.cursor >= series.length || race.cursor < 2) {
    return { ...race, done: true }
  }
  const past = revealedPast(series, race.cursor)
  const actual = series[race.cursor]
  if (past.length < 2 || past[past.length - 1].date === actual.date) {
    return { ...race, done: true }
  }
  const runners = race.runners.map((runner) => {
    if (!runner.alive || runner.cents < TICKET_CENTS) {
      return runner.alive ? { ...runner, alive: false, matched: [], exact: [] } : runner
    }
    const history = sincePast(past, runner.since)
    if (history.length < 2) return runner
    const thought = think(runner.mind, history, { hiddenDate: actual.date, life: race.life ?? null, blend: race.blend })
    const hits = countHits(thought.guess, actual)
    const cents = settlePurse(runner.cents, hits)
    return {
      ...runner,
      cents,
      alive: cents >= TICKET_CENTS,
      turns: runner.turns + 1,
      hits: runner.hits + hits,
      lastHits: hits,
      thought: thought.draw,
      guess: thought.guess,
      cases: thought.cases,
      matched: matchedKeys(thought.cases, actual),
      exact: exactKeys(thought.cases, actual),
    }
  })
  const cursor = race.cursor + 1
  return {
    ...race,
    runners,
    cursor,
    revealed: { ...actual },
    seenDate: past[past.length - 1].date,
    done: cursor >= race.end || runners.every((runner) => !runner.alive),
  }
}

export function leaderOf(runners: readonly RunnerLive[]): RunnerLive | null {
  if (runners.length === 0) return null
  return runners.reduce((best, runner) => (runner.cents > best.cents ? runner : best))
}

export { DECADE_KEYS, NUMBER_KEYS, STAR_KEYS }
