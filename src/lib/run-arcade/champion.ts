import { buildTrack, CURVE_KEYS, type CurveKey, type RankPoint } from "./curves"
import {
  auditCutoffs,
  baseSkill,
  parseStoredSkillParams,
  rollBack,
  type Skill,
  type SkillOrigin,
  type SkillVersion,
} from "./skills"
import { countHits, RUNNER_MAX, think, type RunnerLive, type RunnerMind, type Thought } from "./thought"

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

export type ChampionRecord = {
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
  skills: Skill[]
  journal: JournalEntry[]
  savedAt: string
}

export const JOURNAL_KEEP = 200

/** Le solde de course d’abord, puis le solde d’examen, puis le moins d’appels. */
export function pickChampion(runners: readonly RunnerLive[]): RunnerLive | null {
  if (runners.length === 0) return null
  return [...runners].sort(
    (a, b) =>
      b.cents - a.cents ||
      (b.examCents ?? -1) - (a.examCents ?? -1) ||
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
}): ChampionRecord {
  const { runner } = input
  return {
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
    skills: runner.mind.skills.map((skill) => ({ ...skill, versions: skill.versions.map((version) => ({ ...version })) })),
    journal: input.journal.filter((entry) => entry.runner === runner.mind.id).slice(-JOURNAL_KEEP),
    savedAt: input.savedAt,
  }
}

const ORIGINS: SkillOrigin[] = ["maison", "ia", "variation"]

/** Un jour AAAA-MM-JJ, ou rien. Une date illisible écarterait la version à tort. */
function isoDay(value: unknown): string | null {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : null
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
    cutoff: typeof record.cutoff === "string" ? record.cutoff.slice(0, 10) : "",
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
  return {
    generation,
    runner: typeof record.runner === "string" ? record.runner : "?",
    cents,
    examCents: examCents != null && Number.isFinite(examCents) ? examCents : null,
    examFrom: isoDay(record.examFrom),
    examTo: isoDay(record.examTo),
    examTurns: record.examTurns != null && Number.isInteger(examTurns) && examTurns >= 0 ? examTurns : null,
    calls: Number.isFinite(Number(record.calls)) ? Number(record.calls) : 0,
    raceFrom: typeof record.raceFrom === "string" ? record.raceFrom : null,
    raceTo: typeof record.raceTo === "string" ? record.raceTo : null,
    skills: skills as Skill[],
    journal: Array.isArray(record.journal) ? (record.journal as JournalEntry[]).slice(-JOURNAL_KEEP) : [],
    savedAt: typeof record.savedAt === "string" ? record.savedAt : "",
  }
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
  const past = track.slice(0, at)
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
