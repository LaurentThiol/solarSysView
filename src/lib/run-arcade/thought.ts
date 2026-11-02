import { reconcile } from "./coherence"
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
import { formatRatio, goldenAim, goldenLevel, GOLDEN_RATIOS } from "./golden"
import { soirReading } from "./soir"
import {
  activeVersion,
  baseSkill,
  gesturePhrase,
  type Gesture,
  type Skill,
  type SkillParams,
  type SkillTarget,
} from "./skills"

export { aimRatio, formatRatio, goldenAim, goldenLevel, GOLDEN_RATIOS, type GoldenRatio } from "./golden"
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
export const RUNNER_MAX = 50
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
  name: string
  gesture: Gesture
  curve: SkillTarget
  /** Cette skill pose la pensée. */
  drives: boolean
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
  const lo = Math.min(last, prev)
  return { lo, hi: Math.max(last, prev, lo + 1) }
}

/** Pointe du vecteur d’une courbe : la pensée, avant le rappel aux totales. */
export function tipFor(
  params: SkillParams,
  past: readonly RankPoint[],
  rows: readonly CurveValues[],
  key: CurveKey,
  hiddenDate?: string | null
) {
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
  const span = spanFor(params, rows, key)
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
  const applicable: { skill: Skill; version: SkillParams }[] = []
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
      name: item.skill.name,
      gesture: item.version.gesture,
      curve: item.version.curve,
      drives: index === driver,
      x1: bounds.x1,
      x2: bounds.x2,
    }
  })
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
  const hiddenDate = options.hiddenDate ?? null
  const rows = past.map(curveValues)
  const tips = {} as CurveValues
  for (const key of CURVE_KEYS) tips[key] = tipFor(paramsFor(mind, key, hiddenDate), past, rows, key, hiddenDate)
  const reconciled = reconcile(tips)
  const guess = guessOf(reconciled.numbers, reconciled.stars)

  const focus = options.focus ?? mind.focus
  const params = paramsFor(mind, focus, hiddenDate)
  const trail = rows.map((row, index) => ({ x: index, y: row[focus] }))
  const masks = masksOn(mind, focus, hiddenDate, past, rows)
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
    y: ratio === params.ratio ? aimY : goldenLevel(span.lo, span.hi, ratio),
    chosen: ratio === params.ratio,
  })).reduce<{ ratio: number; y: number; chosen: boolean }[]>((kept, level) => {
    const twin = kept.find((item) => Math.abs(item.y - level.y) < 0.05)
    if (!twin) kept.push(level)
    else if (level.chosen) {
      twin.ratio = level.ratio
      twin.y = level.y
      twin.chosen = true
    }
    return kept
  }, [])
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
  const tol = Math.max(0.5, spanWidth / 4)
  const maskValues = maskPoints.map((point) => point.y)
  const tangentGap = tangentDistance(maskPoints, last, delta)
  const tangente = word(tangentGap <= tol)
  const masque = word(
    params.gesture === "glisse"
      ? tangentGap <= tol
      : params.gesture === "soir"
        ? reading?.days != null
        : params.gesture === "miroir"
          ? deltaPrev != null && Math.abs(delta + deltaPrev) <= tol
          : params.gesture === "moyenne"
            ? halfGap(maskValues) <= tol
            : params.gesture === "or"
              ? meanAbs(maskValues, aimY) <= tol
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
  const clause = reading
    ? reading.days == null
      ? `reprend le pas du ${reading.evening}`
      : `${reading.evening} suit le ${reading.other} à ${reading.days} ${reading.days > 1 ? "jours" : "jour"}`
    : gesturePhrase(params.gesture)
  const words = lectureClause(lecture)
  const observation = `${curveLabel(focus)} · ${params.gesture} · ${windowLabel(params)} · ${words}`
  const phrase = `${curveLabel(focus)} ${clause} : tangente ${slopeWord}, rayon ${formatNum(radius)} vers ${formatRatio(params.ratio)}, vecteur ${formatNum(tip)}, projection ${projected}${recalled ? ", ramenée par les totales" : ""}. Lecture : ${words}.`
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
  /** Solde d’examen des skills en place, sur l’archive lisible. */
  examCents: number | null
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

/** Pensée de chaque runner vivant pour le tirage caché, sans le jouer. */
export function previewTurn(race: Race, series: readonly RankPoint[]): Race {
  if (race.done || race.cursor >= series.length || race.cursor < 2) return race
  const past = revealedPast(series, race.cursor)
  const hiddenDate = series[race.cursor].date
  return {
    ...race,
    runners: race.runners.map((runner) => {
      if (!runner.alive) return runner
      const thought = think(runner.mind, past, { hiddenDate })
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
    const thought = think(runner.mind, past, { hiddenDate: actual.date })
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

export function leaderOf(runners: readonly RunnerLive[]) {
  return runners.reduce((best, runner) => (runner.cents > best.cents ? runner : best))
}

export { DECADE_KEYS, NUMBER_KEYS, STAR_KEYS }
