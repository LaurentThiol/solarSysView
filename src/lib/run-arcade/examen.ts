import type { ChampionRecord } from "./champion"
import type { RankPoint } from "./curves"
import { sincePast } from "./depart"
import {
  countHits,
  formatCents,
  HIT_CENTS,
  settlePurse,
  START_CENTS,
  think,
  TICKET_CENTS,
  type RunnerLive,
  type RunnerMind,
} from "./thought"

/** Tirages rejoués par l’examen : les derniers tirages lisibles, que le prompt de l’IA ne lit pas. */
export const EXAM_WINDOW = 25

export type ExamResult = {
  /** Solde en fin d’examen. Vide quand aucun tour n’a été joué : il n’y a rien à comparer. */
  cents: number | null
  hits: number
  turns: number
  /** Premier et dernier tirage rejoués. Vides quand aucun tour n’a été joué. */
  from: string | null
  to: string | null
}

export function examStart(pastLength: number, size = EXAM_WINDOW) {
  return Math.min(pastLength, Math.max(2, pastLength - Math.max(1, size)))
}

/** Passé que lit le prompt qui écrit une skill : tout le lisible, moins la fenêtre d’examen. */
export function promptPast(past: readonly RankPoint[], size = EXAM_WINDOW) {
  return past.slice(0, examStart(past.length, size)).map((point) => ({ ...point }))
}

/**
 * Rejoue les skills sur la fenêtre d’examen, tour par tour, avec un solde séparé de celui de la course.
 * `since` coupe à gauche. La fenêtre d’examen reste celle de l’archive complète.
 */
export function examine(mind: RunnerMind, past: readonly RankPoint[], size = EXAM_WINDOW, since = ""): ExamResult {
  const start = examStart(past.length, size)
  let cents = START_CENTS
  let hits = 0
  let turns = 0
  let from: string | null = null
  let to: string | null = null
  for (let index = start; index < past.length; index += 1) {
    if (cents < TICKET_CENTS) break
    const hidden = past[index]
    const seen = sincePast(past.slice(0, index), since)
    if (seen.length < 2) continue
    const thought = think(mind, seen, { hiddenDate: hidden.date, plain: true })
    const found = countHits(thought.guess, hidden)
    cents = settlePurse(cents, found)
    hits += found
    turns += 1
    if (from == null) from = hidden.date
    to = hidden.date
  }
  return { cents: turns > 0 ? cents : null, hits, turns, from, to }
}

/** Seule porte : la proposition doit faire monter le solde d’examen. À égalité, ou sans examen, elle est refusée. */
export function passesExam(candidate: ExamResult, current: ExamResult) {
  if (candidate.cents == null || current.cents == null) return false
  return candidate.cents > current.cents
}

/** Trouvés attendus par ticket au hasard : 5 numéros joués sur 50 pour 5 tirés, 2 étoiles sur 12 pour 2 tirées. */
const HITS_PER_TICKET = (5 * 5) / 50 + (2 * 2) / 12

/** Variance d’un tirage sans remise de `drawn` boules parmi `pool`, dont `marked` sont jouées. */
function drawVariance(pool: number, marked: number, drawn: number) {
  const share = marked / pool
  return drawn * share * (1 - share) * ((pool - drawn) / (pool - 1))
}

/** Variance des trouvés d’un ticket : les numéros et les étoiles sont deux tirages indépendants. */
const HITS_VARIANCE = drawVariance(50, 5, 5) + drawVariance(12, 2, 2)

export type ChanceMark = {
  /** Solde moyen d’une grille quelconque après ces tours. */
  cents: number
  /** Écart-type de ce solde. */
  spreadCents: number
}

/**
 * Ce que donne le hasard. Toute grille de cinq numéros et deux étoiles vaut la même chose en moyenne :
 * 50,00 € − tours × (2,50 € − 2,00 € × 5/6), à ± 2,00 € × √(0,6658 × tours). À 25 tours : 29,17 € ± 8.
 * La ruine (solde sous un ticket) n’est pas comptée : c’est un repère, pas une loi exacte.
 */
export function chanceBalance(turns: number): ChanceMark {
  const n = Math.max(0, Math.round(turns))
  return {
    cents: START_CENTS - n * (TICKET_CENTS - HIT_CENTS * HITS_PER_TICKET),
    spreadCents: HIT_CENTS * Math.sqrt(HITS_VARIANCE * n),
  }
}

/** « hasard 29,17 € ± 8 » : le repère à écrire à côté d’un solde de `turns` tours. */
export function chanceLabel(turns: number) {
  const { cents, spreadCents } = chanceBalance(turns)
  return `hasard ${formatCents(cents)} ± ${Math.round(spreadCents / 100)}`
}

/** Un solde et son repère : « 43,50 € (hasard 29,17 € ± 8) ». Sans tour joué, le solde seul. */
export function balanceWithChance(cents: number, turns: number | null | undefined) {
  return turns != null && turns > 0 ? `${formatCents(cents)} (${chanceLabel(turns)})` : formatCents(cents)
}

export type ExamMarks = {
  cents: number | null | undefined
  turns?: number | null
  from?: string | null
  to?: string | null
  /** Tour de course du dernier examen. null : au lancement. Absent : l’écran ne dit pas quand. */
  atTurn?: number | null
}

function shortDay(iso: string) {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}`
}

/**
 * Le solde d’examen avec ce qui le situe : le repère du hasard, les tours et les dates rejoués, le moment.
 * « examen 27,50 € (hasard 29,17 € ± 8) · 25 tours du 05/09 au 28/11 · au lancement ».
 * Un examen vide s’écrit « examen — ».
 */
export function examLine(exam: ExamMarks) {
  const turns = exam.turns ?? 0
  if (exam.cents == null) return exam.turns === 0 ? "examen — · aucun tirage rejoué" : "examen —"
  const parts = [`examen ${balanceWithChance(exam.cents, turns)}`]
  if (turns > 0 && exam.from && exam.to) {
    const days = exam.from === exam.to ? `le ${shortDay(exam.from)}` : `du ${shortDay(exam.from)} au ${shortDay(exam.to)}`
    parts.push(`${turns === 1 ? "1 tour" : `${turns} tours`} ${days}`)
  }
  if (exam.atTurn !== undefined) parts.push(exam.atTurn === null ? "au lancement" : `au tour ${exam.atTurn}`)
  return parts.join(" · ")
}

/**
 * La course et son parent : combien de tirages de cette course sont déjà dans la plage où le parent
 * a été choisi (son solde de course vient d’eux). `shared` sur `total` tirages de course.
 */
export function sharedSentence(shared: number, total: number, parent: Pick<ChampionRecord, "raceFrom" | "raceTo">) {
  const range = parent.raceFrom && parent.raceTo ? ` (${shortDay(parent.raceFrom)} – ${shortDay(parent.raceTo)})` : ""
  const draws = `${total} tirage${total > 1 ? "s" : ""} de course`
  if (shared === 0) return `Aucun des ${draws} n’est dans la plage du parent${range}.`
  const plural = shared > 1
  return `Sur ${draws}, ${shared} ${plural ? "sont" : "est"} dans la plage du parent${range} : ${plural ? "ils ont" : "il a"} servi à le choisir.`
}

/** L’examen d’un runner en course : « au lancement » tant qu’il n’a pas été réexaminé. */
export function runnerExamLine(
  runner: Pick<RunnerLive, "examCents" | "examTurns" | "examFrom" | "examTo" | "examAt">
) {
  return examLine({
    cents: runner.examCents,
    turns: runner.examTurns,
    from: runner.examFrom,
    to: runner.examTo,
    atTurn: runner.examAt,
  })
}

/** L’examen d’un champion écrit. Un champion plus ancien n’a que le solde. */
export function championExamLine(
  record: Pick<ChampionRecord, "examCents" | "examTurns" | "examFrom" | "examTo">
) {
  return examLine({ cents: record.examCents, turns: record.examTurns, from: record.examFrom, to: record.examTo })
}
