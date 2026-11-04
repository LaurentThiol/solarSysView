import type { JournalEntry } from "./champion"
import { droppedLabel } from "./depart"
import { runnerExamLine } from "./examen"
import { currentVersion, targetLabel } from "./skills"
import {
  formatCents,
  HIT_CENTS,
  paramsFor,
  TICKET_CENTS,
  type Guess,
  type Race,
  type RunnerLive,
  type RunnerMind,
  type ThoughtDraw,
} from "./thought"

/** Essai de variation maison, gardé seulement si l’examen monte. */
export type XrayAttempt = {
  detail: string
  beforeCents: number
  afterCents: number
  kept: boolean
}

/** Ce qu’un runner reçoit avant le premier tour. */
export type XrayPrep = {
  runnerId: string
  at: string
  /** Skills en place et solde d’examen. */
  detail: string
  attempts: XrayAttempt[]
}

/** Reçu d’un runner pour un tour joué, ou son arrêt. */
export type XrayReceipt = {
  at: string
  turn: number
  runnerId: string
  detail: string
}

export type XrayPending = {
  runnerId: string
  detail: string
}

/** Recherche Brave encore ouverte : le runner et la requête qu’il a demandée. */
export type XraySearch = {
  runnerId: string
  query: string
}

/** Requête Brave suivie dans Rayons X, de l’envoi jusqu’à l’issue. */
export type XrayBrave = {
  at: string
  runnerId: string
  /** Tour de course. Vide pendant l’avant-course. */
  turn: number | null
  query: string
  state: "cours" | "fait" | "erreur"
  /** Issue lisible : nombre de résultats, ou texte d’erreur. */
  detail: string
}

/** Appels, recherches et propositions encore ouverts. */
export type XrayActivity = {
  calling: string[]
  searching: XraySearch[]
  pending: XrayPending[]
}

/** Opération du schéma fonctionnel, dans l’ordre du tour. */
export type XrayOp = "passage" | "appel" | "recherche" | "attente" | "examen" | "jeu"

/**
 * Issue d’une opération. « sauté » est une vraie panne seulement si un pas l’a enregistré.
 * « interrompu » : l’appel ou la recherche a été coupé par la fin de la course, ou par l’arrêt du runner. Ce n’est pas une panne.
 */
export type XrayStepState = "en cours" | "fait" | "sauté" | "refusé" | "erreur" | "interrompu"

/** Pas d’une opération, hors du journal du champion. */
export type XrayStep = {
  at: string
  /** Null pendant l’avant-course. */
  turn: number | null
  runnerId: string
  op: XrayOp
  state: XrayStepState
  rule: string
  result: string
}

export type XrayLine = {
  at: string
  text: string
}

export type ThoughtChain = {
  last: string
  gesture: string
  thought: string
  played: string
}

/** Reçus conservés. Un tour de cinquante runners tient encore dans la fenêtre. */
export const XRAY_KEEP = 400
/** Pas du schéma fonctionnel. Deux tours chargés de cinquante runners tiennent encore. */
export const XRAY_STEP_KEEP = 800
const FEED_KEEP = 12

export function emptyActivity(): XrayActivity {
  return { calling: [], searching: [], pending: [] }
}

function formatValue(value: number) {
  const rounded = Math.round(value * 10) / 10
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1).replace(".", ",")
}

/** Skills reçues, date de départ et solde d’examen, au moment du lancement. */
export function prepDetail(runner: RunnerLive, dropped = 0) {
  const skills = runner.mind.skills
    .map((skill) => {
      const version = currentVersion(skill)
      return `${skill.name} (${targetLabel(version.curve)}) v${version.version}`
    })
    .join(", ")
  const depart = runner.since ? ` · ${departCard(runner.since, dropped)}` : ""
  return `${skills || "aucune skill"}${depart} · ${runnerExamLine(runner)}`
}

/** Ligne courte pour la carte : date déjà écrite, et le nombre de tirages écartés. */
export function departCard(since: string, dropped: number) {
  return `départ ${since} · ${droppedLabel(dropped)}`
}

export function prepHeadline(prep: XrayPrep, name: string) {
  const kept = prep.attempts.find((attempt) => attempt.kept)
  const variation = kept
    ? ` · variation retenue : ${kept.detail} Examen ${formatCents(kept.beforeCents)} → ${formatCents(kept.afterCents)}.`
    : prep.attempts.length > 0
      ? " · aucune variation retenue"
      : ""
  return `${name} · ${prep.detail}${variation}`
}

export function attemptLine(attempt: XrayAttempt) {
  const verdict = attempt.kept ? "retenu" : "refusé"
  return `${attempt.detail} Examen ${formatCents(attempt.beforeCents)} → ${formatCents(attempt.afterCents)}, ${verdict}.`
}

function grid(guess: Guess) {
  return `${guess.n1} ${guess.n2} ${guess.n3} ${guess.n4} ${guess.n5} ★ ${guess.e1} ${guess.e2}`
}

function foundWord(hits: number) {
  return hits === 1 ? "1 trouvé" : `${hits} trouvés`
}

/** Un reçu par runner encore en course. Celui qui ne paie plus le ticket s’arrête. */
export function receiptsOf(before: Race, after: Race, at: string): XrayReceipt[] {
  const turn = before.cursor - before.start + 1
  const next = new Map(after.runners.map((runner) => [runner.mind.id, runner]))
  const receipts: XrayReceipt[] = []
  for (const runner of before.runners) {
    if (!runner.alive) continue
    const played = next.get(runner.mind.id)
    if (!played) continue
    if (runner.cents < TICKET_CENTS) {
      receipts.push({
        at,
        turn,
        runnerId: runner.mind.id,
        detail: `${runner.mind.name} s’arrête : ${formatCents(runner.cents)} ne paie plus le ticket de ${formatCents(TICKET_CENTS)}.`,
      })
      continue
    }
    const hits = played.lastHits
    const guess = played.guess
    const stop = played.alive ? "" : " Il s’arrête."
    receipts.push({
      at,
      turn,
      runnerId: runner.mind.id,
      detail: `${runner.mind.name} joue ${guess ? grid(guess) : "—"} · ${foundWord(hits)} · ${formatCents(runner.cents)} − ${formatCents(TICKET_CENTS)} + ${formatCents(hits * HIT_CENTS)} = ${formatCents(played.cents)}.${stop}`,
    })
  }
  return receipts
}

export function lastTurnReceipts(receipts: readonly XrayReceipt[]) {
  const turn = receipts.reduce((max, item) => Math.max(max, item.turn), 0)
  if (turn === 0) return []
  return receipts.filter((item) => item.turn === turn)
}

/** Dernières lignes : préparation, journal, tours. */
export function xrayFeed(
  input: {
    prep: readonly XrayPrep[]
    receipts: readonly XrayReceipt[]
    journal: readonly JournalEntry[]
    names: Readonly<Record<string, string>>
  },
  limit = FEED_KEEP
): XrayLine[] {
  const nameOf = (id: string) => input.names[id] ?? id
  const lines: XrayLine[] = []
  for (const prep of input.prep) {
    lines.push({ at: prep.at, text: prepHeadline(prep, nameOf(prep.runnerId)) })
  }
  for (const entry of input.journal) {
    const when = entry.turn != null ? `tour ${entry.turn}` : "avant-course"
    lines.push({
      at: entry.at,
      text: `${nameOf(entry.runner)} · ${when} · ${entry.kind} · ${entry.detail}`,
    })
  }
  for (const receipt of input.receipts) {
    lines.push({ at: receipt.at, text: `tour ${receipt.turn} · ${receipt.detail}` })
  }
  lines.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0))
  return lines.slice(-limit)
}

/** Nombre de pages gardées après le filtre, en clair. */
export function braveResultDetail(count: number) {
  return count === 1 ? "1 résultat lisible" : `${count} résultats lisibles`
}

/** Runner, moment, et issue. La requête elle-même se lit à part. */
export function braveHeadline(line: XrayBrave, name: string) {
  const moment = line.turn != null ? `tour ${line.turn}` : "avant-course"
  const issue = line.state === "cours" ? "en cours" : line.detail
  return `${name} · ${moment} · ${issue}`
}

/** Ligne de « En ce moment ». La clé reste unique quand la phrase se répète. */
export type ActivityLine = {
  key: string
  text: string
}

/** Appel, recherche, puis proposition en attente. */
export function activityLines(activity: XrayActivity, names: Readonly<Record<string, string>>): ActivityLine[] {
  const nameOf = (id: string) => names[id] ?? id
  const rank = new Map<string, number>()
  const line = (id: string, text: string): ActivityLine => {
    const count = (rank.get(id) ?? 0) + 1
    rank.set(id, count)
    return { key: `${id}:${count}`, text }
  }
  return [
    ...activity.calling.map((id) => line(id, `${nameOf(id)} appelle`)),
    ...activity.searching.map((item) => line(item.runnerId, `${nameOf(item.runnerId)} cherche : « ${item.query} »`)),
    ...activity.pending.map((item) => line(item.runnerId, `${nameOf(item.runnerId)} en attente : ${item.detail}`)),
  ]
}

/** Mot posé sur la carte : l’appel passe avant la recherche, puis la proposition en attente. */
export function xrayMark(runnerId: string, activity: XrayActivity) {
  if (activity.calling.includes(runnerId)) return "appelle"
  if (activity.searching.some((item) => item.runnerId === runnerId)) return "cherche"
  if (activity.pending.some((item) => item.runnerId === runnerId)) return "en attente"
  return null
}

/** Date cachée qui a servi au dessin affiché. */
export function chainHiddenDate(race: Pick<Race, "revealed" | "cursor">, track: readonly { date: string }[]) {
  if (race.revealed) return race.revealed.date
  return track[race.cursor]?.date ?? null
}

/** Dernier point, geste, pensée, case jouée. */
export function thoughtChain(mind: RunnerMind, draw: ThoughtDraw | null, hiddenDate?: string | null): ThoughtChain | null {
  if (!draw || draw.trail.length === 0) return null
  const driving = draw.masks.find((mask) => mask.drives)
  const params = driving ?? paramsFor(mind, draw.focus, hiddenDate)
  const last = draw.trail[draw.trail.length - 1]?.y
  if (last == null) return null
  return {
    last: formatValue(last),
    gesture: params.gesture,
    thought: formatValue(draw.thoughtValue),
    played: formatValue(draw.projectedValue),
  }
}
