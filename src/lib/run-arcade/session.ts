import type { BraveNote } from "./brave-filter"
import {
  championRecord,
  childrenOf,
  JOURNAL_KEEP,
  pickChampion,
  setAsideCount,
  type ChampionRecord,
  type JournalEntry,
  type JournalKind,
} from "./champion"
import { median, rotate, sliceMs } from "./clock"
import { buildTrack, type RankPoint } from "./curves"
import { assignDeparts, droppedBefore, sincePast, type DepartChoice } from "./depart"
import { examine, passesExam, promptPast } from "./examen"
import { ruleFor } from "./fonctionnel"
import { buildPrompt, lectureRefusal, parseAction } from "./prompt"
import { strongestRelation } from "./relation"
import {
  addVersion,
  currentVersion,
  describeSkill,
  houseVariation,
  newSkill,
  type SkillParams,
  type VersionMeta,
} from "./skills"
import {
  createMinds,
  createRace,
  drawingText,
  formatCents,
  noteRace,
  observationReport,
  playTurn,
  previewTurn,
  revealedPast,
  think,
  type Lecture,
  type Observation,
  type Race,
  type RunnerLive,
  type RunnerMind,
  type ThoughtDraw,
} from "./thought"
import {
  braveResultDetail,
  emptyActivity,
  prepDetail,
  receiptsOf,
  XRAY_KEEP,
  XRAY_STEP_KEEP,
  type XrayActivity,
  type XrayAttempt,
  type XrayBrave,
  type XrayOp,
  type XrayPrep,
  type XrayReceipt,
  type XrayStep,
  type XrayStepState,
} from "./xray"

export type SessionPhase = "idle" | "avant" | "course" | "fin"
export type ServiceState = "inconnu" | "ok" | "absente"

export type IaRequest = {
  runnerId: string
  seed: number
  system: string
  user: string
  image: string | null
}

export type IaReply =
  | { ok: true; text: string; latencyMs: number; model: string | null; vision: boolean }
  | { ok: false; error: string; absent?: boolean; aborted?: boolean }

export type BraveRequest = { query: string; from: string; cutoff: string }

export type BraveReply =
  | { ok: true; results: BraveNote[] }
  | { ok: false; error: string; absent?: boolean; retryAfterMs?: number; aborted?: boolean }

export type SaveReply = { ok: true; source: string } | { ok: false; error: string }

export type SessionDeps = {
  now: () => number
  setTimer: (fn: () => void, ms: number) => unknown
  clearTimer: (handle: unknown) => void
  askIa: (request: IaRequest, signal: AbortSignal) => Promise<IaReply>
  askBrave: (request: BraveRequest, signal: AbortSignal) => Promise<BraveReply>
  saveChampion: (record: ChampionRecord) => Promise<SaveReply>
  /** Image de la pensée envoyée au modèle de vision. Le dessin vient du passé que lit le prompt. */
  capture?: (runnerId: string, draw: ThoughtDraw) => Promise<string | null>
  /** Appels à l’IA en vol en même temps. Une machine locale en sert souvent un seul. */
  parallel?: number
}

export type LaunchOptions = {
  count: number
  draws: number
  minutes: number
  series: readonly RankPoint[]
  champion: ChampionRecord | null
  seed?: number
  /** Premier tirage lu. Absent : le premier tirage de la piste, pour tous. */
  depart?: DepartChoice
}

export type SaveState = { state: "—" | "en cours" | "ok" | "erreur"; detail: string | null }

export type SessionSnapshot = {
  phase: SessionPhase
  generation: number
  race: Race | null
  track: RankPoint[]
  draws: number
  minutes: number
  sliceMs: number
  /** Fin de l’avant-course, ou fin de la tranche du tour. */
  phaseEndsAt: number | null
  pausedLeftMs: number | null
  ia: ServiceState
  iaError: string | null
  iaVision: boolean
  brave: ServiceState
  braveError: string | null
  latencies: number[]
  medianMs: number | null
  inFlight: number
  save: SaveState
  champion: ChampionRecord | null
  parent: ChampionRecord | null
  /** Versions du champion écrites après le premier tirage caché, laissées de côté au lancement. */
  setAside: number
  journal: JournalEntry[]
  /** Préparation de chaque runner, hors du journal du champion. */
  xrayPrep: XrayPrep[]
  /** Reçus des tours joués, hors du journal du champion. */
  xrayReceipts: XrayReceipt[]
  /** Requêtes Brave du lancement, de l’envoi jusqu’à l’issue. */
  xrayBrave: XrayBrave[]
  /** Pas du schéma fonctionnel, hors du journal du champion. */
  xraySteps: XrayStep[]
  /** Appels, recherches et propositions encore ouverts. */
  activity: XrayActivity
  /** Observations reconnues pendant la course, la plus ancienne d’abord. */
  observations: Observation[]
  error: string | null
}

type InboxItem = {
  runnerId: string
  params: SkillParams
  name: string
  phrase: string
  cutoff: string
}

type RequestMeta = {
  cutoff: string
  hiddenDate: string
  turn: number | null
  observation: string
  lecture: Lecture
  withImage: boolean
}

/** Rythme minimal d’un tour quand Y vaut 0 : la course se lit à l’écran. */
export const MIN_SLICE_MS = 700
const ERROR_COOLDOWN_MS = 2_000
const BRAVE_RETRIES = 2
/** Essais de variation maison par enfant, au lancement d’une génération. */
const VARIATION_TRIES = 6

function emptySnapshot(): SessionSnapshot {
  return {
    phase: "idle",
    generation: 0,
    race: null,
    track: [],
    draws: 0,
    minutes: 0,
    sliceMs: 0,
    phaseEndsAt: null,
    pausedLeftMs: null,
    ia: "inconnu",
    iaError: null,
    iaVision: false,
    brave: "inconnu",
    braveError: null,
    latencies: [],
    medianMs: null,
    inFlight: 0,
    save: { state: "—", detail: null },
    champion: null,
    parent: null,
    setAside: 0,
    journal: [],
    xrayPrep: [],
    xrayReceipts: [],
    xrayBrave: [],
    xraySteps: [],
    activity: emptyActivity(),
    observations: [],
    error: null,
  }
}

function seedFrom(track: readonly RankPoint[]) {
  const last = track[track.length - 1]?.date ?? ""
  const digits = Number(last.replaceAll("-", ""))
  return Number.isFinite(digits) && digits > 0 ? digits % 1_000_003 : 1
}

/** Applique des paramètres : nouvelle version d’une skill qui pilote déjà cette courbe, sinon skill nouvelle. */
export function applyParams(
  mind: RunnerMind,
  params: SkillParams,
  meta: VersionMeta,
  name: string,
  newId: string
): { mind: RunnerMind; isNew: boolean } {
  const index = mind.skills.findIndex((skill) => currentVersion(skill).curve === params.curve)
  if (index >= 0) {
    const skills = [...mind.skills]
    skills[index] = addVersion(skills[index], params, meta)
    return { mind: { ...mind, skills }, isNew: false }
  }
  return { mind: { ...mind, skills: [...mind.skills, newSkill(newId, name, params, meta)] }, isNew: true }
}

/** Inscrit le solde d’examen sur la version qui vient d’être écrite pour cette courbe. */
function withExam(mind: RunnerMind, curve: SkillParams["curve"], cents: number): RunnerMind {
  return {
    ...mind,
    skills: mind.skills.map((skill) => {
      const last = currentVersion(skill)
      if (last.curve !== curve) return skill
      return { ...skill, versions: [...skill.versions.slice(0, -1), { ...last, examCents: cents }] }
    }),
  }
}

export class RunArcadeSession {
  private readonly deps: SessionDeps
  private snapshot: SessionSnapshot = emptySnapshot()
  private readonly listeners = new Set<() => void>()
  private launchId = 0
  private timer: unknown = null
  private wake: unknown = null
  private round = 0
  private queue: string[] = []
  private readonly pending = new Map<string, AbortController>()
  private readonly braving = new Map<string, AbortController>()
  /** Requête Brave en cours, par runner. */
  private readonly searching = new Map<string, string>()
  private readonly cooldown = new Map<string, number>()
  private readonly notes = new Map<string, BraveNote[]>()
  private readonly added = new Map<string, number>()
  private readonly callCount = new Map<string, number>()
  private readonly attempts = new Map<string, XrayAttempt[]>()
  private inbox: InboxItem[] = []
  private seenObservations = new Set<string>()
  private seed = 1

  constructor(deps: SessionDeps) {
    this.deps = deps
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  getSnapshot = () => this.snapshot

  private set(patch: Partial<SessionSnapshot>) {
    this.snapshot = { ...this.snapshot, ...patch, activity: this.activity() }
    for (const listener of this.listeners) listener()
  }

  private activity(): XrayActivity {
    return {
      calling: [...this.pending.keys()],
      searching: [...this.searching.entries()].map(([runnerId, query]) => ({ runnerId, query })),
      pending: this.inbox.map((item) => ({ runnerId: item.runnerId, detail: describeSkill(item.params) })),
    }
  }

  private log(runner: string, kind: JournalKind, cutoff: string, detail: string, turn: number | null = this.turnNumber()) {
    const entry: JournalEntry = {
      at: new Date(this.deps.now()).toISOString(),
      runner,
      kind,
      cutoff,
      turn,
      detail,
    }
    this.set({ journal: [...this.snapshot.journal, entry].slice(-JOURNAL_KEEP * 4) })
  }

  /** Pas du schéma fonctionnel. `turn` absent : le tour de l’horloge. `null` : l’avant-course. */
  private note(runnerId: string, op: XrayOp, state: XrayStepState, result: string, turn?: number | null) {
    const entry: XrayStep = {
      at: new Date(this.deps.now()).toISOString(),
      turn: turn === undefined ? this.turnNumber() : turn,
      runnerId,
      op,
      state,
      rule: ruleFor(op),
      result,
    }
    this.set({ xraySteps: [...this.snapshot.xraySteps, entry].slice(-XRAY_STEP_KEEP) })
  }

  private turnNumber() {
    const race = this.snapshot.race
    if (!race || this.snapshot.phase !== "course") return null
    return race.cursor - race.start + 1
  }

  private updateRunner(id: string, fn: (runner: RunnerLive) => RunnerLive) {
    const race = this.snapshot.race
    if (!race) return
    this.set({ race: { ...race, runners: race.runners.map((runner) => (runner.mind.id === id ? fn(runner) : runner)) } })
  }

  private runner(id: string) {
    return this.snapshot.race?.runners.find((runner) => runner.mind.id === id) ?? null
  }

  /** Passé lisible : l’archive gratuite avant la course, puis les réponses déjà données par l’arbitre. */
  readablePast(): RankPoint[] {
    const race = this.snapshot.race
    if (!race) return []
    return revealedPast(this.snapshot.track, race.cursor)
  }

  /** Premier tirage encore caché. */
  hiddenDate(): string | null {
    const race = this.snapshot.race
    if (!race) return null
    return this.snapshot.track[race.cursor]?.date ?? null
  }

  /** Compte le dessin engagé pour ce tirage caché. Un jeton déjà vu ne recompte pas. */
  private observe(race: Race, hiddenDate: string) {
    const noted = noteRace(this.snapshot.observations, this.seenObservations, race, hiddenDate)
    this.seenObservations = noted.seen
    return noted.observations
  }

  private callDetail(meta: RequestMeta, tail: string) {
    const mode = meta.withImage ? "appel avec le dessin" : "appel en texte, sans image"
    const known = this.snapshot.observations.find((item) => item.phrase === meta.observation)
    const report = known ? ` · ${observationReport(known)}` : ""
    return `${mode} · ${meta.observation}${report} · ${tail}`
  }

  private clearTimers() {
    if (this.timer != null) this.deps.clearTimer(this.timer)
    if (this.wake != null) this.deps.clearTimer(this.wake)
    this.timer = null
    this.wake = null
  }

  private abortAll() {
    for (const controller of this.pending.values()) controller.abort()
    for (const controller of this.braving.values()) controller.abort()
    this.pending.clear()
    this.braving.clear()
    this.searching.clear()
  }

  private abortRunner(id: string) {
    this.pending.get(id)?.abort()
    this.braving.get(id)?.abort()
    this.pending.delete(id)
    this.braving.delete(id)
    this.searching.delete(id)
  }

  dispose() {
    this.launchId += 1
    this.clearTimers()
    this.abortAll()
  }

  launch(options: LaunchOptions) {
    this.dispose()
    this.inbox = []
    this.queue = []
    this.round = 0
    this.notes.clear()
    this.added.clear()
    this.callCount.clear()
    this.cooldown.clear()
    this.attempts.clear()
    this.seenObservations = new Set()
    const track = buildTrack(options.series)
    if (track.length < 4) {
      this.set({ ...emptySnapshot(), error: "L’archive chargée est trop courte pour une course." })
      return
    }
    const draws = Math.min(Math.max(1, Math.round(options.draws)), track.length - 2)
    const minutes = Math.max(0, Number.isFinite(options.minutes) ? options.minutes : 0)
    const start = Math.max(2, track.length - draws)
    const hiddenDate = track[start].date
    const parent = options.champion
    const generation = parent ? parent.generation + 1 : 1
    const free = revealedPast(track, start)
    this.seed = options.seed ?? seedFrom(track)
    const choice = options.depart ?? { mode: "fixe" as const, date: free[0]?.date ?? "" }

    let minds = parent ? childrenOf(parent, options.count, hiddenDate) : createMinds(options.count)
    const sinces = assignDeparts(free, minds.length, choice, this.seed)
    if (parent) {
      minds = minds.map((mind, index) =>
        index === 0 ? mind : this.tryVariation(mind, free, generation, index, sinces[index] ?? "")
      )
    }
    let race = createRace(minds, track.length, draws)
    race = {
      ...race,
      runners: race.runners.map((runner, index) => {
        const since = sinces[index] ?? ""
        return {
          ...runner,
          since,
          examCents: examine(runner.mind, free, undefined, since).cents,
          added: this.added.get(runner.mind.id) ?? 0,
        }
      }),
    }
    race = previewTurn(race, track)
    const hidden = track[race.cursor]?.date
    const noted = hidden ? noteRace([], this.seenObservations, race, hidden) : { observations: [], seen: this.seenObservations }
    this.seenObservations = noted.seen

    const now = this.deps.now()
    const at = new Date(now).toISOString()
    this.set({
      ...emptySnapshot(),
      phase: minutes > 0 ? "avant" : "course",
      generation,
      race,
      track,
      draws,
      minutes,
      sliceMs: sliceMs(minutes, draws),
      phaseEndsAt: minutes > 0 ? now + minutes * 60_000 : null,
      parent,
      setAside: parent ? setAsideCount(parent, hiddenDate) : 0,
      observations: noted.observations,
      xrayPrep: race.runners.map((runner) => ({
        runnerId: runner.mind.id,
        at,
        detail: prepDetail(runner, droppedBefore(free, runner.since)),
        attempts: [...(this.attempts.get(runner.mind.id) ?? [])],
      })),
    })
    if (minutes > 0) {
      const id = this.launchId
      this.timer = this.deps.setTimer(() => {
        if (id === this.launchId) this.startCourse()
      }, minutes * 60_000)
      this.refill()
      this.pump()
    } else {
      this.startCourse()
    }
  }

  /**
   * Variation maison d’un enfant : au plus une skill nouvelle. Plusieurs essais, chacun passe l’examen ;
   * le premier qui fait monter le solde d’examen est gardé.
   */
  private tryVariation(
    mind: RunnerMind,
    free: readonly RankPoint[],
    generation: number,
    index: number,
    since: string
  ): RunnerMind {
    const base = mind.skills.find((skill) => currentVersion(skill).curve === "*") ?? mind.skills[0]
    const read = sincePast(promptPast(free), since)
    if (!base || read.length < 2) return mind
    const meta: VersionMeta = { cutoff: read[read.length - 1].date, origin: "variation", examCents: null }
    const before = examine(mind, free, undefined, since)
    const tries: XrayAttempt[] = []
    for (let attempt = 0; attempt < VARIATION_TRIES; attempt += 1) {
      const params = houseVariation(currentVersion(base), this.seed + index * 31 + attempt * 11)
      const candidate = applyParams(mind, params, meta, "Variation maison", `${mind.id}-g${generation}-${params.curve}`)
      const after = examine(candidate.mind, free, undefined, since)
      const kept = passesExam(after, before)
      tries.push({ detail: describeSkill(params), beforeCents: before.cents, afterCents: after.cents, kept })
      if (!kept) continue
      this.attempts.set(mind.id, tries)
      if (candidate.isNew) this.added.set(mind.id, 1)
      return withExam(candidate.mind, params.curve, after.cents)
    }
    this.attempts.set(mind.id, tries)
    return mind
  }

  private startCourse() {
    if (!this.snapshot.race) return
    this.clearTimers()
    this.round = 0
    this.set({ phase: "course" })
    this.refill()
    this.scheduleSlice()
  }

  private scheduleSlice(ms = Math.max(this.snapshot.sliceMs, MIN_SLICE_MS)) {
    const id = this.launchId
    this.set({ phaseEndsAt: this.deps.now() + ms })
    this.timer = this.deps.setTimer(() => {
      if (id === this.launchId) this.endSlice()
    }, ms)
    this.pump()
  }

  private endSlice() {
    const race = this.snapshot.race
    if (!race || this.snapshot.phase !== "course") return
    this.timer = null
    this.applyInbox()
    const before = this.snapshot.race
    if (!before) return
    const played = playTurn(before, this.snapshot.track)
    const at = new Date(this.deps.now()).toISOString()
    const turn = before.cursor - before.start + 1
    for (const receipt of receiptsOf(before, played, at)) {
      const stopped = receipt.detail.includes("ne paie plus le ticket")
      this.note(receipt.runnerId, "jeu", stopped ? "refusé" : "fait", receipt.detail, turn)
    }
    for (const runner of played.runners) {
      if (!runner.alive) this.abortRunner(runner.mind.id)
    }
    const observations =
      played.cursor !== before.cursor && played.revealed
        ? this.observe(played, played.revealed.date)
        : this.snapshot.observations
    this.set({
      race: played,
      observations,
      inFlight: this.pending.size,
      xrayReceipts: [...this.snapshot.xrayReceipts, ...receiptsOf(before, played, at)].slice(-XRAY_KEEP),
    })
    if (played.done) {
      this.finish()
      return
    }
    this.round += 1
    this.refill()
    this.scheduleSlice()
  }

  private finish() {
    this.clearTimers()
    this.abortAll()
    const race = this.snapshot.race
    const track = this.snapshot.track
    if (!race) return
    const best = pickChampion(race.runners)
    const record = best
      ? championRecord({
          runner: best,
          generation: this.snapshot.generation,
          raceFrom: track[race.start]?.date ?? null,
          raceTo: track[race.end - 1]?.date ?? null,
          journal: this.snapshot.journal,
          savedAt: new Date(this.deps.now()).toISOString(),
        })
      : null
    this.set({
      phase: "fin",
      phaseEndsAt: null,
      inFlight: 0,
      champion: record,
      save: record ? { state: "en cours", detail: null } : { state: "—", detail: null },
    })
    if (!record) return
    const id = this.launchId
    this.deps
      .saveChampion(record)
      .then((reply) => {
        if (id !== this.launchId) return
        this.set({ save: reply.ok ? { state: "ok", detail: reply.source } : { state: "erreur", detail: reply.error } })
      })
      .catch((error: unknown) => {
        if (id !== this.launchId) return
        this.set({ save: { state: "erreur", detail: error instanceof Error ? error.message : "échec" } })
      })
  }

  pause() {
    const { phase, phaseEndsAt, pausedLeftMs } = this.snapshot
    if ((phase !== "avant" && phase !== "course") || pausedLeftMs != null) return
    const left = Math.max(0, (phaseEndsAt ?? this.deps.now()) - this.deps.now())
    this.clearTimers()
    this.set({ pausedLeftMs: left, phaseEndsAt: null })
  }

  resume() {
    const { phase, pausedLeftMs } = this.snapshot
    if (pausedLeftMs == null) return
    this.set({ pausedLeftMs: null })
    const id = this.launchId
    if (phase === "avant") {
      this.set({ phaseEndsAt: this.deps.now() + pausedLeftMs })
      this.timer = this.deps.setTimer(() => {
        if (id === this.launchId) this.startCourse()
      }, pausedLeftMs)
      this.pump()
    } else if (phase === "course") {
      this.scheduleSlice(pausedLeftMs)
    }
  }

  /** Termine tout de suite l’avant-course, ou la tranche du tour en cours. */
  skip() {
    if (this.snapshot.pausedLeftMs != null) this.set({ pausedLeftMs: null })
    if (this.snapshot.phase === "avant") {
      this.clearTimers()
      this.startCourse()
    } else if (this.snapshot.phase === "course") {
      this.clearTimers()
      this.endSlice()
    }
  }

  private aliveIds() {
    return (this.snapshot.race?.runners ?? []).filter((runner) => runner.alive).map((runner) => runner.mind.id)
  }

  private refill() {
    this.queue = rotate(this.aliveIds(), this.round)
  }

  private eligible(id: string) {
    const runner = this.runner(id)
    if (!runner || !runner.alive) return false
    if (this.pending.has(id) || this.braving.has(id)) return false
    return (this.cooldown.get(id) ?? 0) <= this.deps.now()
  }

  private nextRunner(): string | null {
    for (let pass = 0; pass < 2; pass += 1) {
      while (this.queue.length) {
        const id = this.queue.shift() as string
        if (this.eligible(id)) return id
      }
      if (this.snapshot.phase === "avant") this.round += 1
      this.refill()
      if (!this.queue.some((id) => this.eligible(id))) {
        this.queue = []
        return null
      }
    }
    return null
  }

  private pump() {
    const { phase, pausedLeftMs, ia, minutes } = this.snapshot
    if ((phase !== "avant" && phase !== "course") || pausedLeftMs != null || ia === "absente" || minutes <= 0) return
    const limit = Math.max(1, this.deps.parallel ?? 1)
    while (this.pending.size < limit) {
      const id = this.nextRunner()
      if (!id || !this.dispatch(id)) break
    }
    this.set({ inFlight: this.pending.size })
    this.scheduleWake()
  }

  private scheduleWake() {
    if (this.wake != null || this.cooldown.size === 0) return
    const now = this.deps.now()
    const next = Math.min(...this.cooldown.values())
    if (next <= now) {
      this.cooldown.forEach((until, id) => {
        if (until <= now) this.cooldown.delete(id)
      })
      return
    }
    const id = this.launchId
    this.wake = this.deps.setTimer(() => {
      this.wake = null
      if (id === this.launchId) this.pump()
    }, next - now)
  }

  /** Le prompt lit le passé lisible moins la fenêtre d’examen. Son dessin vient de ce même passé. */
  private dispatch(id: string): boolean {
    const runner = this.runner(id)
    const hiddenDate = this.hiddenDate()
    if (!runner) {
      this.note(id, "appel", "sauté", "Ce runner n’est plus là.")
      return false
    }
    if (!hiddenDate) {
      this.note(id, "passage", "fait", "Son tour.")
      this.note(id, "appel", "sauté", "Pas de tirage caché.")
      return false
    }
    const learned = promptPast(this.readablePast())
    const past = sincePast(learned, runner.since)
    if (past.length < 2) {
      this.note(id, "passage", "fait", "Son tour.")
      const reason = runner.since
        ? "Moins de deux tirages lisibles depuis le départ."
        : "Passé trop court : moins de deux tirages lisibles."
      this.note(id, "appel", "sauté", reason)
      return false
    }
    const cutoff = past[past.length - 1].date
    const drawing = think(runner.mind, past, { hiddenDate }).draw
    const prompt = buildPrompt({
      mind: runner.mind,
      past,
      hiddenDate,
      examCents: runner.examCents,
      notes: this.notes.get(id) ?? [],
      drawing: drawingText(drawing),
      since: runner.since,
      dropped: runner.since ? learned.filter((point) => point.date < runner.since).length : 0,
    })
    const count = (this.callCount.get(id) ?? 0) + 1
    this.callCount.set(id, count)
    const index = this.snapshot.race?.runners.findIndex((item) => item.mind.id === id) ?? 0
    const seed = (this.seed * 1000 + index * 97 + count) % 2_147_483_647
    const controller = new AbortController()
    this.pending.set(id, controller)
    this.updateRunner(id, (item) => ({ ...item, calls: item.calls + 1 }))
    const meta: RequestMeta = {
      cutoff,
      hiddenDate,
      turn: this.turnNumber(),
      observation: drawing.observation,
      lecture: drawing.lecture,
      withImage: false,
    }
    this.note(id, "passage", "fait", "Son tour.")
    this.note(id, "appel", "en cours", "L’appel est parti.")
    const launch = this.launchId
    const capture = this.snapshot.iaVision && this.deps.capture ? this.deps.capture : null
    void (async () => {
      let reply: IaReply
      let image: string | null = null
      try {
        image = capture ? await capture(id, drawing).catch(() => null) : null
        reply = await this.deps.askIa(
          { runnerId: id, seed, system: prompt.system, user: prompt.user, image },
          controller.signal
        )
      } catch (error) {
        reply = {
          ok: false,
          error: error instanceof Error ? error.message : "échec",
          aborted: controller.signal.aborted,
        }
      }
      if (launch !== this.launchId) return
      if (this.pending.get(id) === controller) this.pending.delete(id)
      this.onIaReply(id, reply, { ...meta, withImage: Boolean(image) })
      this.pump()
    })()
    return true
  }

  private onIaReply(id: string, reply: IaReply, meta: RequestMeta) {
    if (!reply.ok) {
      if (reply.aborted) {
        this.note(id, "appel", "interrompu", "Appel interrompu.", meta.turn)
        this.set({ inFlight: this.pending.size })
        return
      }
      this.note(id, "appel", "erreur", reply.error, meta.turn)
      this.log(id, "erreur", meta.cutoff, reply.error, meta.turn)
      this.cooldown.set(id, this.deps.now() + ERROR_COOLDOWN_MS)
      this.set(reply.absent ? { ia: "absente", iaError: reply.error } : { iaError: reply.error })
      return
    }
    const latencies = [...this.snapshot.latencies, reply.latencyMs].slice(-200)
    this.set({ ia: "ok", iaError: null, iaVision: reply.vision, latencies, medianMs: median(latencies) })
    const refusal = lectureRefusal(reply.text, meta.lecture)
    if (refusal) {
      const mode = meta.withImage ? "appel avec le dessin" : "appel en texte, sans image"
      this.note(id, "appel", "refusé", `lecture refusée · ${refusal}`, meta.turn)
      this.log(id, "refus", meta.cutoff, `${mode} · lecture refusée · ${refusal}`, meta.turn)
      return
    }
    const action = parseAction(reply.text, meta.lecture)
    if (!action) {
      this.note(id, "appel", "refusé", "réponse illisible", meta.turn)
      this.log(id, "refus", meta.cutoff, "réponse illisible", meta.turn)
      return
    }
    if (action.kind === "brave") {
      const past = sincePast(promptPast(this.readablePast()), this.runner(id)?.since ?? "")
      const relation = strongestRelation(past)
      if (!relation) {
        this.note(id, "appel", "refusé", "aucune relation assez nette", meta.turn)
        this.log(id, "refus", meta.cutoff, "aucune relation assez nette", meta.turn)
        this.set({ inFlight: this.pending.size })
        return
      }
      this.note(id, "appel", "fait", `demande une recherche : ${relation.phrase}`, meta.turn)
      this.searchBrave(id, relation.phrase, meta, 0)
      return
    }
    const proposal = `propose : ${describeSkill(action.params)}`
    this.note(id, "appel", "fait", proposal, meta.turn)
    this.log(id, "ia", meta.cutoff, this.callDetail(meta, proposal), meta.turn)
    this.inbox.push({ runnerId: id, params: action.params, name: action.name, phrase: action.phrase, cutoff: meta.cutoff })
    if (this.snapshot.phase === "avant") this.applyInbox()
    else {
      this.note(id, "attente", "en cours", describeSkill(action.params), meta.turn)
      this.set({ inFlight: this.pending.size })
    }
  }

  /** Pose la requête dans Rayons X dès l’envoi. Un nouvel essai après 429 ne crée pas une seconde ligne. */
  private openBrave(id: string, query: string, turn: number | null) {
    this.searching.set(id, query)
    if (this.snapshot.xrayBrave.some((line) => line.runnerId === id && line.state === "cours" && line.query === query)) {
      this.set({ inFlight: this.pending.size })
      return
    }
    const line: XrayBrave = {
      at: new Date(this.deps.now()).toISOString(),
      runnerId: id,
      turn,
      query,
      state: "cours",
      detail: "en cours",
    }
    this.set({ xrayBrave: [...this.snapshot.xrayBrave, line].slice(-XRAY_KEEP) })
  }

  /** Ferme la requête encore ouverte de ce runner. */
  private closeBrave(id: string, state: "fait" | "erreur", detail: string) {
    this.searching.delete(id)
    const lines = [...this.snapshot.xrayBrave]
    for (let index = lines.length - 1; index >= 0; index -= 1) {
      if (lines[index].runnerId === id && lines[index].state === "cours") {
        lines[index] = { ...lines[index], state, detail }
        break
      }
    }
    this.set({ xrayBrave: lines })
  }

  private searchBrave(id: string, query: string, meta: RequestMeta, attempt: number) {
    if (this.snapshot.brave === "absente") {
      this.openBrave(id, query, meta.turn)
      this.closeBrave(id, "erreur", "Brave absente")
      this.note(id, "recherche", "refusé", "Brave absente", meta.turn)
      this.log(id, "refus", meta.cutoff, "Brave absente", meta.turn)
      this.set({ inFlight: this.pending.size })
      return
    }
    const runner = this.runner(id)
    const track = this.snapshot.track
    if (!runner || !runner.alive || track.length === 0) {
      this.note(id, "recherche", "sauté", runner && runner.alive ? "Piste vide." : "Runner arrêté.", meta.turn)
      this.set({ inFlight: this.pending.size })
      return
    }
    this.note(id, "recherche", "en cours", attempt === 0 ? `« ${query} »` : `nouvel essai : « ${query} »`, meta.turn)
    const year = Number(track[track.length - 1].date.slice(0, 4))
    const controller = new AbortController()
    this.braving.set(id, controller)
    this.openBrave(id, query, meta.turn)
    if (attempt === 0) this.updateRunner(id, (item) => ({ ...item, calls: item.calls + 1 }))
    const launch = this.launchId
    this.deps
      .askBrave({ query, from: `${year - 1}-01-01`, cutoff: meta.hiddenDate }, controller.signal)
      .catch(
        (error: unknown): BraveReply => ({
          ok: false,
          error: error instanceof Error ? error.message : "échec",
          aborted: controller.signal.aborted,
        })
      )
      .then((reply) => {
        if (launch !== this.launchId) return
        if (this.braving.get(id) === controller) this.braving.delete(id)
        if (!reply.ok) {
          if (reply.aborted) {
            this.closeBrave(id, "erreur", "recherche interrompue")
            this.note(id, "recherche", "interrompu", "Recherche interrompue.", meta.turn)
            this.set({ inFlight: this.pending.size })
            return
          }
          if (reply.retryAfterMs != null && attempt < BRAVE_RETRIES) {
            this.braving.set(id, controller)
            this.set({ inFlight: this.pending.size })
            this.deps.setTimer(() => {
              if (launch !== this.launchId) return
              this.braving.delete(id)
              this.searchBrave(id, query, meta, attempt + 1)
            }, Math.max(500, reply.retryAfterMs))
            return
          }
          const detail = `Brave : ${reply.error}`
          this.closeBrave(id, "erreur", reply.error)
          this.note(id, "recherche", "erreur", detail, meta.turn)
          this.log(id, "erreur", meta.cutoff, detail, meta.turn)
          this.set(reply.absent ? { brave: "absente", braveError: reply.error } : { braveError: reply.error })
        } else {
          this.closeBrave(id, "fait", braveResultDetail(reply.results.length))
          this.notes.set(id, reply.results.slice(0, 5))
          const detail = `« ${query} » : ${reply.results.length} résultat(s) lisible(s)`
          this.note(id, "recherche", "fait", detail, meta.turn)
          this.log(id, "brave", meta.cutoff, detail, meta.turn)
          this.set({ brave: "ok", braveError: null })
        }
        this.pump()
      })
  }

  /** Réponses arrivées depuis la dernière application : elles jouent au prochain tour, après l’examen. */
  private applyInbox() {
    if (this.inbox.length === 0 || !this.snapshot.race) return
    const items = this.inbox
    this.inbox = []
    const readable = this.readablePast()
    for (const item of items) {
      const runner = this.runner(item.runnerId)
      this.note(item.runnerId, "attente", "fait", "La proposition passe à l’examen.")
      if (!runner || !runner.alive) {
        const detail = "runner arrêté : ses skills restent à leur version"
        this.note(item.runnerId, "examen", "refusé", detail)
        this.log(item.runnerId, "refus", item.cutoff, detail)
        continue
      }
      const isNewCurve = !runner.mind.skills.some((skill) => currentVersion(skill).curve === item.params.curve)
      if (isNewCurve && (this.added.get(runner.mind.id) ?? 0) >= 1) {
        const detail = "une seule skill nouvelle par lancement"
        this.note(runner.mind.id, "examen", "refusé", detail)
        this.log(runner.mind.id, "refus", item.cutoff, detail)
        continue
      }
      const before = examine(runner.mind, readable, undefined, runner.since)
      const candidate = applyParams(
        runner.mind,
        item.params,
        { cutoff: item.cutoff, origin: "ia", examCents: null, phrase: item.phrase || undefined },
        item.name,
        `${runner.mind.id}-g${this.snapshot.generation}-${item.params.curve === "*" ? "tout" : item.params.curve}`
      )
      const after = examine(candidate.mind, readable, undefined, runner.since)
      if (!passesExam(after, before)) {
        const detail = `examen ${formatCents(after.cents)}, pas au-dessus de ${formatCents(before.cents)}`
        this.updateRunner(runner.mind.id, (live) => ({ ...live, examCents: before.cents }))
        this.note(runner.mind.id, "examen", "refusé", detail)
        this.log(runner.mind.id, "refus", item.cutoff, detail)
        continue
      }
      if (candidate.isNew) this.added.set(runner.mind.id, (this.added.get(runner.mind.id) ?? 0) + 1)
      const mind = withExam(candidate.mind, item.params.curve, after.cents)
      const skill = mind.skills.find((entry) => currentVersion(entry).curve === item.params.curve)
      const detail = `${skill?.name ?? "skill"} v${skill ? currentVersion(skill).version : 1} gardée, examen ${formatCents(after.cents)}`
      this.updateRunner(runner.mind.id, (live) => ({
        ...live,
        mind,
        examCents: after.cents,
        added: this.added.get(runner.mind.id) ?? 0,
      }))
      this.note(runner.mind.id, "examen", "fait", detail)
      this.log(runner.mind.id, "skill", item.cutoff, detail)
    }
    if (this.snapshot.phase === "avant" && this.snapshot.race) {
      const previewed = previewTurn(this.snapshot.race, this.snapshot.track)
      const hidden = this.snapshot.track[previewed.cursor]?.date
      const observations = hidden ? this.observe(previewed, hidden) : this.snapshot.observations
      this.set({ race: previewed, observations })
    }
  }
}

export function createSession(deps: SessionDeps) {
  return new RunArcadeSession(deps)
}
