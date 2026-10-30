import type { RankPoint } from "./curves"
import { countHits, settlePurse, START_CENTS, think, TICKET_CENTS, type RunnerMind } from "./thought"

/** Tirages rejoués par l’examen : les derniers tirages lisibles, que le prompt de l’IA ne lit pas. */
export const EXAM_WINDOW = 25

export type ExamResult = {
  cents: number
  hits: number
  turns: number
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

/** Rejoue les skills sur la fenêtre d’examen, tour par tour, avec un solde séparé de celui de la course. */
export function examine(mind: RunnerMind, past: readonly RankPoint[], size = EXAM_WINDOW): ExamResult {
  const start = examStart(past.length, size)
  let cents = START_CENTS
  let hits = 0
  let turns = 0
  for (let index = start; index < past.length; index += 1) {
    if (cents < TICKET_CENTS) break
    const hidden = past[index]
    const thought = think(mind, past.slice(0, index), { hiddenDate: hidden.date })
    const found = countHits(thought.guess, hidden)
    cents = settlePurse(cents, found)
    hits += found
    turns += 1
  }
  return {
    cents,
    hits,
    turns,
    from: start < past.length ? past[start].date : null,
    to: past.length > 0 ? past[past.length - 1].date : null,
  }
}

/** Seule porte : la proposition doit faire monter le solde d’examen. À égalité, elle est refusée. */
export function passesExam(candidate: ExamResult, current: ExamResult) {
  return candidate.cents > current.cents
}
