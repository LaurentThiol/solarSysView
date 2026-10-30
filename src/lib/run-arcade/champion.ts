import { CURVE_KEYS } from "./curves"
import {
  auditCutoffs,
  baseSkill,
  parseSkillParams,
  rollBack,
  type Skill,
  type SkillOrigin,
  type SkillVersion,
} from "./skills"
import type { RunnerLive, RunnerMind } from "./thought"

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
    calls: runner.calls,
    raceFrom: input.raceFrom,
    raceTo: input.raceTo,
    skills: runner.mind.skills.map((skill) => ({ ...skill, versions: skill.versions.map((version) => ({ ...version })) })),
    journal: input.journal.filter((entry) => entry.runner === runner.mind.id).slice(-JOURNAL_KEEP),
    savedAt: input.savedAt,
  }
}

const ORIGINS: SkillOrigin[] = ["maison", "ia", "variation"]

function parseVersion(raw: unknown): SkillVersion | null {
  const params = parseSkillParams(raw)
  if (!params || !raw || typeof raw !== "object") return null
  const record = raw as Record<string, unknown>
  const version = Number(record.version)
  if (!Number.isInteger(version) || version < 1) return null
  const parent = record.parent == null ? null : Number(record.parent)
  if (parent != null && !Number.isInteger(parent)) return null
  const origin = ORIGINS.includes(record.origin as SkillOrigin) ? (record.origin as SkillOrigin) : "ia"
  const examCents = record.examCents == null ? null : Number(record.examCents)
  return {
    ...params,
    version,
    parent,
    cutoff: typeof record.cutoff === "string" ? record.cutoff.slice(0, 10) : "",
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
  return {
    generation,
    runner: typeof record.runner === "string" ? record.runner : "?",
    cents,
    examCents: examCents != null && Number.isFinite(examCents) ? examCents : null,
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
 * dans la dernière version écrite avant le premier tirage caché.
 */
export function childrenOf(champion: ChampionRecord, count: number, hiddenDate: string): RunnerMind[] {
  const inherited = rollBack(champion.skills, hiddenDate)
  return Array.from({ length: Math.max(1, Math.round(count)) }, (_, index) => {
    const id = `r${index + 1}`
    const skills = inherited.length
      ? inherited.map((skill) => ({ ...skill, versions: skill.versions.map((version) => ({ ...version })) }))
      : [baseSkill(id, index)]
    return { id, name: `R${index + 1}`, focus: CURVE_KEYS[index % CURVE_KEYS.length], skills }
  })
}

/** Versions du champion écrites le jour du premier tirage caché ou après. */
export function setAsideCount(champion: ChampionRecord, hiddenDate: string) {
  return auditCutoffs(champion.skills, hiddenDate).length
}
