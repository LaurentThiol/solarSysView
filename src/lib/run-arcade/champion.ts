import { buildTrack, CURVE_KEYS, NUMBER_KEYS, STAR_KEYS, type CurveKey, type RankPoint } from "./curves"
import {
  auditCutoffs,
  baseSkill,
  parseStoredSkillParams,
  rollBack,
  type Skill,
  type SkillOrigin,
  type SkillVersion,
} from "./skills"
import { sincePast } from "./depart"
import { chanceBalance } from "./examen"
import {
  countHits,
  formatCents,
  HIT_CENTS,
  RUNNER_MAX,
  START_CENTS,
  think,
  TICKET_CENTS,
  type Guess,
  type RunnerLive,
  type RunnerMind,
  type Thought,
} from "./thought"

export type JournalKind = "ia" | "brave" | "skill" | "refus" | "erreur"

export type JournalEntry = {
  at: string
  runner: string
  kind: JournalKind
  /** Dernier tirage révélé lu par la requête. */
  cutoff: string
  turn: number | null
  detail: string
}

/**
 * Pronostic du champion pour le tirage qui suit le dernier lu. Champ libre du `payload`, sans colonne Neon.
 * `targetDate` est le prochain mardi ou vendredi après `seenDate`. Vide quand il ne se connaît pas.
 */
export type ChampionForecast = {
  numbers: number[]
  stars: number[]
  /** Date du dernier tirage lu pour ce pronostic. */
  seenDate: string
  /** Date du tirage visé. */
  targetDate: string | null
}

export type ChampionRecord = {
  /** Numéro de la ligne dans Neon. Facultatif : un champion qui vient de finir, ou d’un fichier, n’en a pas. */
  id?: number
  generation: number
  runner: string
  cents: number
  examCents: number | null
  /**
   * Fenêtre de l’examen qui a donné `examCents` : premier et dernier tirage rejoués, nombre de tours.
   * Facultatifs : un champion écrit avant ces champs ne les porte pas.
   */
  examFrom?: string | null
  examTo?: string | null
  examTurns?: number | null
  calls: number
  raceFrom: string | null
  raceTo: string | null
  /**
   * Départ du runner (`since`) : premier tirage qu’il a pu lire. Champ libre du payload, sans colonne Neon.
   * Facultatif : un champion écrit avant ce champ ne le porte pas, et son passé relu n’est pas coupé.
   */
  depart?: string | null
  /**
   * Tours de course joués par ce runner, pas les tirages de la course entière. Champ libre du payload.
   * Facultatif : un champion écrit avant ce champ retombe sur le compte des tirages de sa plage.
   */
  raceTurns?: number | null
  /**
   * Pronostic pour le tirage suivant le dernier lu à la fin de la course. Champ libre du payload.
   * Facultatif : un champion écrit avant ce champ ne le porte pas, et il n’est pas noté.
   */
  forecast?: ChampionForecast | null
  skills: Skill[]
  journal: JournalEntry[]
  savedAt: string
}

export const JOURNAL_KEEP = 200

/** Écart d’un examen au hasard, en écarts-types : comparable entre nombres de tours différents. */
function examGap(runner: RunnerLive): number | null {
  if (runner.examCents == null || !(runner.examTurns > 0)) return null
  const chance = chanceBalance(runner.examTurns)
  return chance.spreadCents > 0 ? (runner.examCents - chance.cents) / chance.spreadCents : null
}

/** Négatif si `a` passe devant `b` sur l’examen. Un examen vide reste derrière tout examen joué. */
function compareExam(a: RunnerLive, b: RunnerLive): number {
  if (a.examCents == null && b.examCents == null) return 0
  if (a.examCents == null) return 1
  if (b.examCents == null) return -1
  const gapA = examGap(a)
  const gapB = examGap(b)
  if (gapA != null && gapB != null) return gapB - gapA
  // Un seul examen a un nombre de tours connu : lui seul dit un écart au hasard.
  if (gapA != null) return -1
  if (gapB != null) return 1
  return b.examCents - a.examCents
}

/** Le solde de course d’abord, puis l’écart au hasard de l’examen, puis le moins d’appels. */
export function pickChampion(runners: readonly RunnerLive[]): RunnerLive | null {
  if (runners.length === 0) return null
  return [...runners].sort(
    (a, b) =>
      b.cents - a.cents ||
      compareExam(a, b) ||
      a.calls - b.calls ||
      a.mind.id.localeCompare(b.mind.id, "fr", { numeric: true })
  )[0]
}

export function championRecord(input: {
  runner: RunnerLive
  generation: number
  raceFrom: string | null
  raceTo: string | null
  journal: readonly JournalEntry[]
  savedAt: string
  /** Archive connue à la fin de la course. Quand elle est là, le pronostic du tirage suivant est écrit. */
  series?: readonly RankPoint[]
}): ChampionRecord {
  const { runner } = input
  const record: ChampionRecord = {
    generation: input.generation,
    runner: runner.mind.name,
    cents: runner.cents,
    examCents: runner.examCents,
    examFrom: runner.examFrom,
    examTo: runner.examTo,
    examTurns: runner.examTurns,
    calls: runner.calls,
    raceFrom: input.raceFrom,
    raceTo: input.raceTo,
    depart: runner.since || null,
    raceTurns: runner.turns,
    forecast: null,
    skills: runner.mind.skills.map((skill) => ({ ...skill, versions: skill.versions.map((version) => ({ ...version })) })),
    journal: input.journal.filter((entry) => entry.runner === runner.mind.id).slice(-JOURNAL_KEEP),
    savedAt: input.savedAt,
  }
  if (input.series) record.forecast = forecastFor(record, input.series)
  return record
}

const ORIGINS: SkillOrigin[] = ["maison", "ia", "variation"]

/**
 * Un vrai jour AAAA-MM-JJ du calendrier, ou rien. Le motif seul laisserait passer « 2025-13-40 »,
 * qui fait ensuite jeter le formatage des dates à l’écran. Une date illisible devient donc `null`.
 */
function isoDay(value: unknown): string | null {
  if (typeof value !== "string") return null
  const match = /^(\d{4})-(\d{2})-(\d{2})(?!\d)/.exec(value)
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  if (month < 1 || month > 12 || day < 1) return null
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
  const daysInMonth = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1]
  return day <= daysInMonth ? value.slice(0, 10) : null
}

/** `savedAt` garde son heure quand son jour est un vrai jour ; sinon il vaut vide, comme absent. */
function savedAtDay(value: unknown): string {
  return typeof value === "string" && isoDay(value) ? value : ""
}

function parseVersion(raw: unknown): SkillVersion | null {
  const params = parseStoredSkillParams(raw)
  if (!params || !raw || typeof raw !== "object") return null
  const record = raw as Record<string, unknown>
  const version = Number(record.version)
  if (!Number.isInteger(version) || version < 1) return null
  const parent = record.parent == null ? null : Number(record.parent)
  if (parent != null && !Number.isInteger(parent)) return null
  const origin = ORIGINS.includes(record.origin as SkillOrigin) ? (record.origin as SkillOrigin) : "ia"
  const examCents = record.examCents == null ? null : Number(record.examCents)
  const examTo = isoDay(record.examTo)
  return {
    ...params,
    version,
    parent,
    cutoff: isoDay(record.cutoff) ?? "",
    ...(examTo ? { examTo } : {}),
    origin,
    phrase: typeof record.phrase === "string" ? record.phrase.slice(0, 280) : "",
    examCents: examCents != null && Number.isFinite(examCents) ? examCents : null,
  }
}

function parseSkill(raw: unknown): Skill | null {
  if (!raw || typeof raw !== "object") return null
  const record = raw as Record<string, unknown>
  if (typeof record.id !== "string" || !Array.isArray(record.versions)) return null
  const versions = record.versions.map(parseVersion)
  if (versions.length === 0 || versions.some((version) => version == null)) return null
  return {
    id: record.id.slice(0, 80),
    name: typeof record.name === "string" ? record.name.slice(0, 80) : record.id,
    versions: versions as SkillVersion[],
  }
}

const JOURNAL_KINDS: JournalKind[] = ["ia", "brave", "skill", "refus", "erreur"]

/** Une ligne de journal relue, ou rien : un journal mal formé refuse le champion entier. */
function parseJournalEntry(raw: unknown): JournalEntry | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null
  const record = raw as Record<string, unknown>
  if (typeof record.runner !== "string" || !record.runner) return null
  if (!JOURNAL_KINDS.includes(record.kind as JournalKind)) return null
  if (typeof record.cutoff !== "string") return null
  if (typeof record.detail !== "string") return null
  if (record.turn !== null && !Number.isInteger(record.turn)) return null
  return {
    at: typeof record.at === "string" ? record.at : "",
    runner: record.runner,
    kind: record.kind as JournalKind,
    cutoff: record.cutoff,
    turn: record.turn as number | null,
    detail: record.detail,
  }
}

/** Boules d’un pronostic relu : le bon compte, des entiers dans la borne, sans doublon. Sinon rien. */
function ballList(raw: unknown, count: number, max: number): number[] | null {
  if (!Array.isArray(raw) || raw.length !== count) return null
  if (raw.some((value) => typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > max)) return null
  const values = raw as number[]
  return new Set(values).size === count ? [...values].sort((a, b) => a - b) : null
}

/** Pronostic relu, ou rien : un pronostic illisible laisse le champion lisible, sans note. */
function parseForecast(raw: unknown): ChampionForecast | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null
  const record = raw as Record<string, unknown>
  const numbers = ballList(record.numbers, 5, 50)
  const stars = ballList(record.stars, 2, 12)
  const seenDate = isoDay(record.seenDate)
  if (!numbers || !stars || !seenDate) return null
  return { numbers, stars, seenDate, targetDate: isoDay(record.targetDate) }
}

/** Relit un champion venu de Neon ou du navigateur. Un champ invalide l’écarte. */
export function parseChampion(raw: unknown): ChampionRecord | null {
  if (!raw || typeof raw !== "object") return null
  const record = raw as Record<string, unknown>
  const generation = Number(record.generation)
  const cents = Number(record.cents)
  if (!Number.isInteger(generation) || generation < 1 || !Number.isFinite(cents)) return null
  if (!Array.isArray(record.skills)) return null
  const skills = record.skills.map(parseSkill)
  if (skills.length === 0 || skills.some((skill) => skill == null)) return null
  const examCents = record.examCents == null ? null : Number(record.examCents)
  const examTurns = Number(record.examTurns)
  const raceTurns = Number(record.raceTurns)
  if (record.journal != null && !Array.isArray(record.journal)) return null
  const journal = (record.journal ?? []).map(parseJournalEntry)
  if (journal.some((entry) => entry == null)) return null
  const id = record.id
  return {
    ...(typeof id === "number" && Number.isInteger(id) && id > 0 ? { id } : {}),
    generation,
    runner: typeof record.runner === "string" ? record.runner : "?",
    cents,
    examCents: examCents != null && Number.isFinite(examCents) ? examCents : null,
    examFrom: isoDay(record.examFrom),
    examTo: isoDay(record.examTo),
    examTurns: record.examTurns != null && Number.isInteger(examTurns) && examTurns >= 0 ? examTurns : null,
    calls: Number.isFinite(Number(record.calls)) ? Number(record.calls) : 0,
    raceFrom: isoDay(record.raceFrom),
    raceTo: isoDay(record.raceTo),
    depart: isoDay(record.depart),
    raceTurns: record.raceTurns != null && Number.isInteger(raceTurns) && raceTurns >= 0 ? raceTurns : null,
    forecast: parseForecast(record.forecast),
    skills: skills as Skill[],
    journal: (journal as JournalEntry[]).slice(-JOURNAL_KEEP),
    savedAt: savedAtDay(record.savedAt),
  }
}

export type ChampionLineage = {
  /** Du plus ancien au plus récent : génération n, puis n+1. */
  champions: ChampionRecord[]
}

function writeOrder(
  a: Pick<ChampionRecord, "savedAt" | "generation" | "id" | "runner">,
  b: Pick<ChampionRecord, "savedAt" | "generation" | "id" | "runner">
) {
  if (a.savedAt !== b.savedAt) return a.savedAt < b.savedAt ? -1 : 1
  if (a.generation !== b.generation) return a.generation - b.generation
  const idA = a.id ?? 0
  const idB = b.id ?? 0
  if (idA !== idB) return idA - idB
  return a.runner < b.runner ? -1 : a.runner > b.runner ? 1 : 0
}

/**
 * Lignées : chaînes de générations qui se suivent (n, puis n+1) par date d’écriture.
 * Deux générations 1 font deux lignées. Une génération 1 suivie d’une génération 2 font une lignée.
 * Un nouveau départ, une génération 1 écrite après, ouvre une autre lignée.
 * Les champions d’une lignée vont du plus ancien au plus récent. Les lignées, de la plus récente à la plus ancienne.
 */
export function championLineages(champions: readonly ChampionRecord[]): ChampionLineage[] {
  const seen = new Set<string>()
  const chains: ChampionRecord[][] = []
  for (const champion of [...champions].sort(writeOrder)) {
    const key = `${champion.generation}\0${champion.runner}\0${champion.savedAt}`
    if (seen.has(key)) continue
    seen.add(key)
    const chain = chains[chains.length - 1]
    const tip = chain?.[chain.length - 1]
    if (chain && tip && champion.generation === tip.generation + 1) chain.push(champion)
    else chains.push([champion])
  }
  return chains
    .map((items) => ({ champions: items }))
    .sort((a, b) => writeOrder(b.champions[b.champions.length - 1], a.champions[a.champions.length - 1]))
}

/**
 * Une génération est un lancement. Les enfants reçoivent les skills du champion,
 * dans la dernière version dont la sélection (prompt et examen) a fini avant le premier tirage caché.
 */
export function childrenOf(champion: ChampionRecord, count: number, hiddenDate: string): RunnerMind[] {
  const inherited = rollBack(champion.skills, hiddenDate)
  return Array.from({ length: Math.min(RUNNER_MAX, Math.max(1, Math.round(count))) }, (_, index) => {
    const id = `r${index + 1}`
    const skills = inherited.length
      ? inherited.map((skill) => ({ ...skill, versions: skill.versions.map((version) => ({ ...version })) }))
      : [baseSkill(id, index)]
    return { id, name: `R${index + 1}`, focus: CURVE_KEYS[index % CURVE_KEYS.length], skills }
  })
}

/** Versions du champion écrites, ou gardées par un examen, le jour du premier tirage caché ou après. */
export function setAsideCount(champion: ChampionRecord, hiddenDate: string) {
  return auditCutoffs(champion.skills, hiddenDate).length
}

/**
 * Tours qui font le repère du hasard d’un champion écrit : ses tours à lui quand ils sont écrits,
 * sinon les tirages de sa plage de course (champions anciens).
 */
export function championRaceTurns(
  champion: Pick<ChampionRecord, "raceTurns" | "raceFrom" | "raceTo">,
  points: readonly { date: string }[]
) {
  return champion.raceTurns ?? drawsInRange(points, champion.raceFrom, champion.raceTo)
}

/** Tirages de la liste dont la date tombe dans la plage `from`–`to`, bornes comprises. Plage ouverte : 0. */
export function drawsInRange(points: readonly { date: string }[], from: string | null, to: string | null) {
  if (!from || !to) return 0
  const first = from.slice(0, 10)
  const last = to.slice(0, 10)
  return points.filter((point) => point.date >= first && point.date <= last).length
}

/**
 * Tirages de la course (de `start` inclus à `end` exclu dans la piste) déjà dans la plage de course du parent.
 * Le parent a été choisi sur ces tirages : plus il y en a, plus le solde de l’enfant est facile.
 * Vide : pas de parent, ou un parent dont la plage n’est pas écrite.
 */
export function sharedWithParent(
  track: readonly { date: string }[],
  start: number,
  end: number,
  parent: Pick<ChampionRecord, "raceFrom" | "raceTo"> | null
) {
  if (!parent || !parent.raceFrom || !parent.raceTo) return null
  return drawsInRange(track.slice(start, end), parent.raceFrom, parent.raceTo)
}

function dayAfter(iso: string) {
  const date = new Date(`${iso.slice(0, 10)}T12:00:00Z`)
  date.setUTCDate(date.getUTCDate() + 1)
  return date.toISOString().slice(0, 10)
}

/**
 * Le champion propose le tirage qui vient après le dernier de l’archive.
 * Tout le passé est révélé. La date cachée est le lendemain, pour que les versions
 * écrites jusqu’au dernier tirage jouent encore.
 */
export function proposeNextDraw(
  champion: ChampionRecord,
  series: readonly RankPoint[],
  focus: CurveKey = "sumNumbers"
): Thought | null {
  const track = buildTrack(series)
  if (track.length < 2 || champion.skills.length === 0) return null
  const mind: RunnerMind = {
    id: "champion",
    name: champion.runner,
    focus,
    skills: champion.skills,
  }
  return think(mind, track, { hiddenDate: dayAfter(track[track.length - 1].date), focus })
}

/** Prochain mardi ou vendredi après ce jour, en jours réels. Vide si le jour est illisible. */
export function nextDrawDate(seenDate: string): string | null {
  const seen = isoDay(seenDate)
  if (!seen) return null
  const date = new Date(`${seen}T12:00:00Z`)
  for (let step = 0; step < 7; step += 1) {
    date.setUTCDate(date.getUTCDate() + 1)
    const weekday = date.getUTCDay()
    if (weekday === 2 || weekday === 5) return date.toISOString().slice(0, 10)
  }
  return null
}

/** Le pronostic à écrire dans le champion : la grille de `proposeNextDraw`, le dernier tirage lu et le tirage visé. */
export function forecastFor(champion: ChampionRecord, series: readonly RankPoint[]): ChampionForecast | null {
  const proposal = proposeNextDraw(champion, series)
  if (!proposal) return null
  const seenDate = isoDay(proposal.draw.seenDate)
  if (!seenDate) return null
  return {
    numbers: NUMBER_KEYS.map((key) => proposal.guess[key]),
    stars: STAR_KEYS.map((key) => proposal.guess[key]),
    seenDate,
    targetDate: nextDrawDate(seenDate),
  }
}

export type ForecastNote = {
  targetDate: string
  seenDate: string
  generation: number
  runner: string
  numbers: number[]
  stars: number[]
  hits: number
  /** Net du ticket en centimes : −2,50 €, puis 2,00 € par trouvé. */
  netCents: number
}

export type ForecastScore = {
  notes: ForecastNote[]
  tickets: number
  hits: number
  netCents: number
}

function forecastGuess(forecast: ChampionForecast): Guess {
  return {
    n1: forecast.numbers[0],
    n2: forecast.numbers[1],
    n3: forecast.numbers[2],
    n4: forecast.numbers[3],
    n5: forecast.numbers[4],
    e1: forecast.stars[0],
    e2: forecast.stars[1],
  }
}

/**
 * Note du pronostic d’un champion, quand l’archive chargée contient le tirage visé.
 * Recalculée à la lecture : rien n’est écrit pour la garder.
 */
export function scoreForecast(champion: ChampionRecord, series: readonly RankPoint[]): ForecastNote | null {
  const forecast = champion.forecast
  if (!forecast?.targetDate) return null
  const draw = series.find((point) => point.date.slice(0, 10) === forecast.targetDate)
  if (!draw) return null
  const hits = countHits(forecastGuess(forecast), draw)
  return {
    targetDate: forecast.targetDate,
    seenDate: forecast.seenDate,
    generation: champion.generation,
    runner: champion.runner,
    numbers: [...forecast.numbers],
    stars: [...forecast.stars],
    hits,
    netCents: hits * HIT_CENTS - TICKET_CENTS,
  }
}

/**
 * Suite des notes hors échantillon d’une lignée : les champions passés en forment une.
 * Une note par date visée : quand plusieurs champions pronostiquent le même tirage,
 * le plus ancien compte (génération la plus basse, puis date d’écriture). Les autres ne créent pas de note.
 */
export function scoreForecasts(
  champions: readonly ChampionRecord[],
  series: readonly RankPoint[]
): ForecastScore {
  const byTarget = new Map<string, ChampionRecord>()
  for (const champion of champions) {
    const target = champion.forecast?.targetDate
    if (!target) continue
    const kept = byTarget.get(target)
    if (
      !kept ||
      champion.generation < kept.generation ||
      (champion.generation === kept.generation && champion.savedAt < kept.savedAt)
    ) {
      byTarget.set(target, champion)
    }
  }
  const notes = [...byTarget.values()]
    .map((champion) => scoreForecast(champion, series))
    .filter((note): note is ForecastNote => note != null)
    .sort((a, b) => a.targetDate.localeCompare(b.targetDate))
  return {
    notes,
    tickets: notes.length,
    hits: notes.reduce((total, note) => total + note.hits, 0),
    netCents: notes.reduce((total, note) => total + note.netCents, 0),
  }
}

/** Ligne des notes hors échantillon, avec le repère du hasard pour le même nombre de tickets. Vide sans ticket noté. */
export function forecastLine(score: ForecastScore): string | null {
  if (score.tickets === 0) return null
  const chance = chanceBalance(score.tickets)
  const expectedNet = chance.cents - START_CENTS
  const tickets = score.tickets === 1 ? "1 ticket noté" : `${score.tickets} tickets notés`
  const found = score.hits === 1 ? "1 trouvé" : `${score.hits} trouvés`
  return `Hors échantillon : ${tickets} · ${found} · ${formatCents(score.netCents)} (hasard ${formatCents(expectedNet)} ± ${Math.round(chance.spreadCents / 100)})`
}

/** Pastille d’une lignée : tickets notés et solde net. Vide sans ticket noté. */
export function forecastBadge(score: ForecastScore): string | null {
  if (score.tickets === 0) return null
  const tickets = score.tickets === 1 ? "1 ticket noté" : `${score.tickets} tickets notés`
  return `${tickets} · ${formatCents(score.netCents)}`
}

export type ReplayLastGrid = {
  draw: RankPoint
  thought: Thought
  hits: number
}

/**
 * Relit la grille jouée sur le dernier tirage de course.
 * Le passé s’arrête avant cette date : une version écrite ce jour-là ne joue pas.
 * Sans cette date dans l’archive, le dernier point sert de tirage.
 */
export function replayLastGrid(
  champion: ChampionRecord,
  series: readonly RankPoint[],
  focus: CurveKey = "sumNumbers"
): ReplayLastGrid | null {
  const track = buildTrack(series)
  if (track.length < 3 || champion.skills.length === 0) return null
  const target = champion.raceTo?.slice(0, 10) ?? ""
  const dated = target ? track.findIndex((point) => point.date.slice(0, 10) === target) : -1
  const at = dated >= 0 ? dated : track.length - 1
  if (at < 2) return null
  // Comme en course, le passé relu est coupé au départ du runner quand le champion le garde.
  const past = champion.depart ? sincePast(track.slice(0, at), champion.depart) : track.slice(0, at)
  const draw = track[at]
  const mind: RunnerMind = {
    id: "champion",
    name: champion.runner,
    focus,
    skills: champion.skills,
  }
  const thought = think(mind, past, { hiddenDate: draw.date, focus })
  return { draw, thought, hits: countHits(thought.guess, draw) }
}

/** Dernier tirage révélé de l’archive n−1 et n. Le nul gris le recopie. */
export function lastRevealedDraw(series: readonly RankPoint[]): RankPoint | null {
  const track = buildTrack(series)
  return track.length > 0 ? track[track.length - 1] : null
}
