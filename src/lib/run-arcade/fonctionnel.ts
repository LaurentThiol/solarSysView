import {
  emptyActivity,
  type XrayActivity,
  type XrayOp,
  type XrayStep,
  type XrayStepState,
} from "./xray"

export type FonctionnelOp = {
  op: XrayOp
  label: string
  rule: string
}

/** Chaîne fixe. La variation maison n’y entre pas : elle reste dans Avant. */
export const FONCTIONNEL_CHAIN: readonly FonctionnelOp[] = [
  { op: "passage", label: "Passage", rule: "Vivant, pas déjà en appel, délai d’erreur écoulé." },
  { op: "appel", label: "Appel", rule: "IA présente, au moins deux tirages lisibles." },
  { op: "recherche", label: "Recherche", rule: "Seulement si l’IA la demande, requête d’avant le tirage caché." },
  {
    op: "attente",
    label: "Attente",
    rule: "En avant-course, l’examen part tout de suite. En course, il attend la fin de tranche.",
  },
  { op: "examen", label: "Examen", rule: "Le solde d’examen monte, une seule skill nouvelle." },
  { op: "jeu", label: "Jeu", rule: "Le solde paie le ticket de 2,50 €." },
]

const SKIPPED_WHEN_ZERO: readonly XrayOp[] = ["appel", "recherche", "attente", "examen"]

const OP_INDEX = new Map(FONCTIONNEL_CHAIN.map((item, index) => [item.op, index]))

export function ruleFor(op: XrayOp) {
  return FONCTIONNEL_CHAIN.find((item) => item.op === op)?.rule ?? ""
}

export function labelFor(op: XrayOp) {
  return FONCTIONNEL_CHAIN.find((item) => item.op === op)?.label ?? op
}

export type FonctionnelCell = {
  op: XrayOp
  label: string
  rule: string
  state: XrayStepState | "—"
  result: string | null
  /** Heure du dernier pas, pour nommer la première panne. */
  at: string | null
  /** Refus, erreurs, interruptions ou sauts enregistrés pour cette opération. */
  count: number
  /** Dernière issue : la règle n’a pas abouti. */
  panne: boolean
}

export type FonctionnelRow = {
  runnerId: string
  name: string
  cells: FonctionnelCell[]
  /** Résultat de la première case en panne, pour le lire en entier. */
  detail: string | null
}

export type FonctionnelBoard = {
  momentLabel: string
  headline: string
  course: string | null
  model: readonly FonctionnelOp[]
  rows: FonctionnelRow[]
  quiet: number
  quietLabel: string | null
}

export type FonctionnelInput = {
  phase: "idle" | "avant" | "course" | "fin"
  minutes: number
  paused: boolean
  ia: "inconnu" | "ok" | "absente"
  iaError: string | null
  /** Tour affiché par l’horloge. En avant-course, ignoré. */
  turn: number | null
  runnerIds: readonly string[]
  names: Readonly<Record<string, string>>
  steps: readonly XrayStep[]
  activity?: XrayActivity
}

function isRecordedPanne(state: XrayStepState) {
  return state === "erreur" || state === "refusé" || state === "interrompu" || state === "sauté"
}

function hasLive(activity: XrayActivity) {
  return activity.calling.length > 0 || activity.searching.length > 0 || activity.pending.length > 0
}

function inMoment(step: XrayStep, turn: number | null) {
  return turn === null ? step.turn === null : step.turn === turn
}

function sentence(text: string) {
  const trimmed = text.trim().replace(/\.+$/, "")
  return trimmed ? `${trimmed}.` : ""
}

function whenLabel(turn: number | null) {
  return turn == null ? "avant-course" : `tour ${turn}`
}

/** Le tour en cours s’il a déjà un pas ou quelqu’un en vol. Sinon le dernier tour qui a laissé une trace. */
function resolveMoment(input: FonctionnelInput, activity: XrayActivity) {
  if (input.phase === "avant" || input.phase === "idle") {
    return { turn: null as number | null, label: "Avant-course", live: input.phase === "avant" }
  }
  const numbered = input.steps.map((step) => step.turn).filter((turn): turn is number => turn != null)
  const last = numbered.length > 0 ? Math.max(...numbered) : null
  if (input.phase === "fin") {
    const turn = last ?? input.turn
    return { turn, label: turn ? `Tour ${turn}` : "Course finie", live: false }
  }
  const current = input.turn
  const live = hasLive(activity)
  if (current != null && (live || input.steps.some((step) => step.turn === current))) {
    return { turn: current, label: `Tour ${current}`, live: true }
  }
  if (last != null) return { turn: last, label: `Tour ${last}`, live: false }
  return { turn: current, label: current ? `Tour ${current}` : "Course", live: true }
}

function courseLine(input: FonctionnelInput) {
  const parts: string[] = []
  if (input.phase === "fin") parts.push("Course finie.")
  if (input.minutes <= 0 && input.phase !== "avant" && input.phase !== "idle") {
    parts.push("Zéro minute : les tours se jouent sans appel.")
  } else {
    if (input.paused) parts.push("En pause : plus d’appel.")
    if (input.ia === "absente") parts.push(input.iaError ? `IA absente : ${input.iaError}` : "IA absente : plus d’appel.")
  }
  return parts.length > 0 ? parts.join(" ") : null
}

function quietLabel(count: number) {
  if (count <= 0) return null
  return count === 1 ? "1 runner sans pas" : `${count} runners sans pas`
}

function cellsFor(steps: readonly XrayStep[], zeroCall: boolean, activity: XrayActivity | null, runnerId: string) {
  return FONCTIONNEL_CHAIN.map((item) => {
    const mine = steps.filter((step) => step.op === item.op)
    const last = mine[mine.length - 1]
    if (!last && zeroCall && SKIPPED_WHEN_ZERO.includes(item.op)) {
      return {
        ...item,
        state: "sauté" as const,
        result: "Zéro minute : pas d’appel.",
        at: null,
        count: 0,
        panne: false,
      }
    }
    if (!last) {
      const opened = activity ? openCell(item, activity, runnerId) : null
      if (opened) return { ...item, ...opened }
      return { ...item, state: "—" as const, result: null, at: null, count: 0, panne: false }
    }
    const count = mine.filter((step) => isRecordedPanne(step.state)).length
    const panne = isRecordedPanne(last.state)
    return { ...item, state: last.state, result: last.result, at: last.at, count, panne }
  })
}

function openCell(item: FonctionnelOp, activity: XrayActivity, runnerId: string) {
  if (item.op === "appel" && activity.calling.includes(runnerId)) {
    return { state: "en cours" as const, result: "L’appel est parti.", at: null, count: 0, panne: false }
  }
  if (item.op === "recherche" && activity.searching.some((entry) => entry.runnerId === runnerId)) {
    return { state: "en cours" as const, result: "Recherche en cours.", at: null, count: 0, panne: false }
  }
  if (item.op === "attente") {
    const pending = activity.pending.find((entry) => entry.runnerId === runnerId)
    if (pending) return { state: "en cours" as const, result: pending.detail, at: null, count: 0, panne: false }
  }
  return null
}

function headlineOf(
  rows: readonly FonctionnelRow[],
  steps: readonly XrayStep[],
  momentTurn: number | null,
  names: Readonly<Record<string, string>>
) {
  const pannes = rows.flatMap((row) =>
    row.cells.filter((cell) => cell.panne).map((cell) => ({ name: row.name, cell }))
  )
  pannes.sort((a, b) => {
    const left = a.cell.at ?? ""
    const right = b.cell.at ?? ""
    if (left !== right) return left < right ? -1 : 1
    return (OP_INDEX.get(a.cell.op) ?? 0) - (OP_INDEX.get(b.cell.op) ?? 0)
  })
  const first = pannes[0]
  if (first) {
    const base = sentence(`Panne : ${first.name}, ${first.cell.label}, ${first.cell.result}`)
    const extra = pannes.length - 1
    if (extra === 1) return `${base} Et 1 autre.`
    if (extra > 1) return `${base} Et ${extra} autres.`
    return base
  }
  for (let index = steps.length - 1; index >= 0; index -= 1) {
    const step = steps[index]
    if (!step || inMoment(step, momentTurn) || !isRecordedPanne(step.state)) continue
    const name = names[step.runnerId] ?? step.runnerId
    return sentence(`Dernière panne : ${whenLabel(step.turn)}, ${name}, ${labelFor(step.op)}, ${step.result}`)
  }
  return "Aucune panne sur ce moment."
}

/** Tableau du moment : une ligne par runner qui a bougé, et la première panne en tête. */
export function fonctionnelBoard(input: FonctionnelInput): FonctionnelBoard {
  const activity = input.activity ?? emptyActivity()
  const moment = resolveMoment(input, activity)
  const names = input.names
  const nameOf = (id: string) => names[id] ?? id
  const momentSteps = input.steps.filter((step) => inMoment(step, moment.turn))
  const byRunner = new Map<string, XrayStep[]>()
  for (const step of momentSteps) {
    const list = byRunner.get(step.runnerId) ?? []
    list.push(step)
    byRunner.set(step.runnerId, list)
  }
  const zeroCall = input.minutes <= 0 && input.phase !== "avant" && input.phase !== "idle"
  const liveActivity = moment.live ? activity : null
  const seen = new Set<string>()
  const rows: FonctionnelRow[] = []
  const ids = [...input.runnerIds, ...byRunner.keys()].filter((id) => {
    if (seen.has(id)) return false
    seen.add(id)
    return true
  })
  for (const runnerId of ids) {
    const mine = byRunner.get(runnerId) ?? []
    const active =
      liveActivity != null &&
      (liveActivity.calling.includes(runnerId) ||
        liveActivity.searching.some((entry) => entry.runnerId === runnerId) ||
        liveActivity.pending.some((entry) => entry.runnerId === runnerId))
    if (mine.length === 0 && !active) continue
    const cells = cellsFor(mine, zeroCall, liveActivity, runnerId)
    const broken = cells.find((cell) => cell.panne)
    rows.push({
      runnerId,
      name: nameOf(runnerId),
      cells,
      detail: broken?.result ?? null,
    })
  }
  const shown = new Set(rows.map((row) => row.runnerId))
  const quiet = input.runnerIds.filter((id) => !shown.has(id)).length
  return {
    momentLabel: moment.label,
    headline: headlineOf(rows, input.steps, moment.turn, names),
    course: courseLine(input),
    model: FONCTIONNEL_CHAIN,
    rows,
    quiet,
    quietLabel: quietLabel(quiet),
  }
}
