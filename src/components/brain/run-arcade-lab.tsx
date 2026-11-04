"use client"

import { Fragment, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react"

import { captureDraw } from "@/components/brain/run-arcade-capture"
import { RunArcadeLayers } from "@/components/brain/run-arcade-layers"
import { LiveBand } from "@/components/brain/run-arcade-live"
import { RunnerUniverse } from "@/components/brain/run-arcade-universe"
import { UnsentChampions } from "@/components/brain/run-arcade-unsent"
import { DrawBalls } from "@/components/draw-balls"
import { HelpTip, HelpWrap, LabelHelp, TitleHelp } from "@/components/help"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select"
import { formatDrawDate, formatShortDate, toDrawSeries, type Draw } from "@/lib/draws"
import {
  championRaceTurns,
  lastRevealedDraw,
  proposeNextDraw,
  replayLastGrid,
  type ChampionRecord,
  type ReplayLastGrid,
} from "@/lib/run-arcade/champion"
import { archiveNotice, lastDrawLine, launchReady, trackYears } from "@/lib/run-arcade/archive"
import { raceChrome } from "@/lib/run-arcade/chrome"
import {
  departBounds,
  droppedBefore,
  maxRaceDraws,
  RACE_DRAWS_MIN,
  sincePast,
  snapDepart,
  type DepartMode,
} from "@/lib/run-arcade/depart"
import { balanceWithChance, championExamLine, runnerExamLine, sharedSentence } from "@/lib/run-arcade/examen"
import { askBrave, askIa, exportChampion, listChampions, loadChampion, readChampionFile, saveChampion } from "@/lib/run-arcade/client"
import {
  formatDuration,
  formatSlice,
  MINUTES_DEFAULT,
  MINUTES_MAX,
  MINUTES_MIN,
  MINUTES_STEP,
  playedSlice,
  raceDurationMs,
  servedPerSlice,
} from "@/lib/run-arcade/clock"
import { CURVE_KEYS, curveLabel, curveValues, NUMBER_KEYS, STAR_KEYS, type CurveKey, type RankPoint } from "@/lib/run-arcade/curves"
import { RUNNER_MIN, settleFields, type FieldDrafts } from "@/lib/run-arcade/fields"
import { fonctionnelBoard, type FonctionnelCell } from "@/lib/run-arcade/fonctionnel"
import { RUN_ARCADE_HELP } from "@/lib/run-arcade/help"
import { layerPoints } from "@/lib/run-arcade/layers"
import { championKey, lastKnownChampion, parentChampion } from "@/lib/run-arcade/lineage"
import { createSession, MIN_SLICE_MS, type ServiceState, type SessionSnapshot } from "@/lib/run-arcade/session"
import { currentVersion, targetLabel } from "@/lib/run-arcade/skills"
import {
  activityLines,
  attemptLine,
  braveHeadline,
  chainHiddenDate,
  departCard,
  lastTurnReceipts,
  prepHeadline,
  thoughtChain,
  xrayFeed,
  xrayMark,
} from "@/lib/run-arcade/xray"
import {
  exactKeys,
  formatCents,
  HIT_CENTS,
  leaderOf,
  matchedKeys,
  observationReportFor,
  RACE_DRAWS_DEFAULT,
  revealedPast,
  RUNNER_DEFAULT,
  RUNNER_MAX,
  TICKET_CENTS,
  think,
  type Guess,
  type Observation,
  type RunnerLive,
  type Thought,
  type ThoughtDraw,
} from "@/lib/run-arcade/thought"
import { importChampion, type ImportOutcome } from "@/lib/run-arcade/client"
import { useDraws } from "@/lib/use-draws"
import { cn } from "@/lib/utils"

function toRankPoints(draws: Draw[]): RankPoint[] {
  return toDrawSeries(draws).map((point) => ({
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

function serviceText(state: ServiceState, error: string | null, ok: string) {
  if (state === "ok") return ok
  if (state === "absente") return `absente${error ? ` (${error})` : ""}`
  return error ? `en attente (${error})` : "en attente"
}

function skillSummary(runner: RunnerLive) {
  return runner.mind.skills
    .map((skill) => {
      const version = currentVersion(skill)
      return `${version.curve === "*" ? "tout" : curveLabel(version.curve)} v${version.version}`
    })
    .join(" · ")
}

function ballValues(source: Guess | RankPoint, keys: readonly ("n1" | "n2" | "n3" | "n4" | "n5" | "e1" | "e2")[]) {
  return keys.map((key) => source[key])
}

function sharedBalls(played: number[], actual: number[]) {
  const bag = new Set(actual)
  return [...new Set(played.filter((value) => bag.has(value)))]
}

function sameGuess(left: Guess, right: Guess) {
  return NUMBER_KEYS.every((key) => left[key] === right[key]) && STAR_KEYS.every((key) => left[key] === right[key])
}

function foundLabel(hits: number) {
  return hits === 1 ? "1 trouvé" : `${hits} trouvés`
}

function ResultGrids({
  replay,
  proposal,
  ticketHits,
  archiveLastDate,
}: {
  replay: ReplayLastGrid
  proposal: Thought
  ticketHits: number | null
  /** Dernier tirage de l’archive : celui que Persiste recopie. */
  archiveLastDate: string | null
}) {
  const drawNumbers = ballValues(replay.draw, NUMBER_KEYS)
  const drawStars = ballValues(replay.draw, STAR_KEYS)
  const playedNumbers = ballValues(replay.thought.guess, NUMBER_KEYS)
  const playedStars = ballValues(replay.thought.guess, STAR_KEYS)
  const nextNumbers = ballValues(proposal.guess, NUMBER_KEYS)
  const nextStars = ballValues(proposal.guess, STAR_KEYS)
  const ticket =
    ticketHits == null
      ? ""
      : ` · ticket ${formatCents(TICKET_CENTS)}, puis ${formatCents(HIT_CENTS)} × ${ticketHits}`
  return (
    <div className="mb-3" data-testid="run-arcade-result">
      <h3 className="mb-2 text-xs font-medium text-muted-foreground">
        <TitleHelp help={RUN_ARCADE_HELP.resultat}>Résultat</TitleHelp>
      </h3>
      <div className="grid gap-3 md:grid-cols-3">
        <div>
          <p className="text-sm font-medium">Dernier tirage</p>
          <div className="mt-2">
            <DrawBalls numbers={drawNumbers} stars={drawStars} />
          </div>
          <p className="mt-2 text-xs text-muted-foreground" data-testid="run-arcade-result-last">
            {lastDrawLine(replay.draw.date, archiveLastDate, formatDrawDate)}
          </p>
        </div>
        <div>
          <p className="text-sm font-medium">Grille du champion</p>
          <div className="mt-2">
            <DrawBalls
              numbers={playedNumbers}
              stars={playedStars}
              highlightNumbers={sharedBalls(playedNumbers, drawNumbers)}
              highlightStars={sharedBalls(playedStars, drawStars)}
            />
          </div>
          <p className="mt-2 text-xs text-muted-foreground" data-testid="run-arcade-result-hits">
            {foundLabel(replay.hits)}
            {ticket}
          </p>
        </div>
        <div>
          <p className="text-sm font-medium">Pronostic</p>
          <div className="mt-2">
            <DrawBalls
              numbers={nextNumbers}
              stars={nextStars}
              highlightNumbers={sharedBalls(nextNumbers, drawNumbers)}
              highlightStars={sharedBalls(nextStars, drawStars)}
            />
          </div>
          <p className="mt-2 text-xs text-muted-foreground">Ce tirage n’est pas dans la base.</p>
        </div>
      </div>
    </div>
  )
}

function ThoughtChain({
  runner,
  draw,
  hiddenDate,
}: {
  runner: RunnerLive
  draw: ThoughtDraw | null
  hiddenDate: string | null
}) {
  const chain = thoughtChain(runner.mind, draw, hiddenDate)
  if (!chain) return null
  return (
    <span className="mt-1 block text-[11px] leading-4" data-testid="runner-xray-chain">
      <span className="text-foreground">{chain.last}</span>
      <span className="text-muted-foreground"> → </span>
      <span className="text-chart-3">{chain.gesture}</span>
      <span className="text-muted-foreground"> → </span>
      <span className="text-chart-4">pensée {chain.thought}</span>
      <span className="text-muted-foreground"> → </span>
      <span className="text-chart-4">case {chain.played}</span>
    </span>
  )
}

function refusedLabel(count: number) {
  return count === 1 ? "1 essai refusé" : `${count} essais refusés`
}

function cellStateLabel(cell: FonctionnelCell) {
  if (cell.panne && cell.count > 1) return `${cell.state} · ${cell.count}`
  return cell.state
}

function cellTone(cell: FonctionnelCell) {
  if (cell.state === "erreur") return "border-destructive/40 bg-destructive/10 text-destructive"
  if (cell.state === "refusé") return "border-chart-5/40 bg-chart-5/15"
  if (cell.state === "en cours") return "border-chart-4/50 text-chart-4"
  if (cell.state === "interrompu") return "border-border bg-muted"
  if (cell.state === "sauté" || cell.state === "—") return "border-transparent text-muted-foreground"
  return "border-border"
}

function FonctionnelTable({ snapshot }: { snapshot: SessionSnapshot }) {
  const race = snapshot.race
  if (!race) return null
  const names = Object.fromEntries(race.runners.map((runner) => [runner.mind.id, runner.mind.name]))
  const board = fonctionnelBoard({
    phase: snapshot.phase,
    minutes: snapshot.minutes,
    paused: snapshot.pausedLeftMs != null,
    ia: snapshot.ia,
    iaError: snapshot.iaError,
    turn: race.cursor - race.start + 1,
    runnerIds: race.runners.map((runner) => runner.mind.id),
    names,
    steps: snapshot.xraySteps,
    activity: snapshot.activity,
  })
  return (
    <div className="mt-3" data-testid="run-arcade-fonctionnel">
      <h3 className="text-xs font-medium text-muted-foreground">Fonctionnel</h3>
      <p className="mt-1 text-xs" data-testid="run-arcade-fonctionnel-panne">
        {board.headline}
      </p>
      {board.course ? <p className="mt-1 text-xs text-muted-foreground">{board.course}</p> : null}
      <p className="mt-2 text-xs text-muted-foreground">{board.momentLabel}</p>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full min-w-[48rem] border-collapse text-left text-xs">
          <thead>
            <tr>
              <th className="w-16" />
              {board.model.map((item) => (
                <th key={item.op} scope="col" className="px-1 align-top font-medium">
                  {item.label}
                  <span className="mt-1 block font-normal text-muted-foreground">{item.rule}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {board.rows.map((row) => (
              <Fragment key={row.runnerId}>
                <tr data-testid={`run-arcade-fonctionnel-${row.runnerId}`}>
                  <th scope="row" className="py-1 pr-2 align-top font-medium">
                    {row.name}
                  </th>
                  {row.cells.map((cell) => {
                    const showResult = Boolean(cell.result) && (cell.panne || cell.op === "jeu")
                    return (
                      <td
                        key={cell.op}
                        className={cn("border px-1 py-1 align-top", cellTone(cell))}
                        data-state={cell.state}
                        title={cell.result ?? cell.rule}
                      >
                        <p>{cellStateLabel(cell)}</p>
                        {showResult ? <p className="mt-0.5 font-normal">{cell.result}</p> : null}
                      </td>
                    )
                  })}
                </tr>
                {row.detail ? (
                  <tr>
                    <td colSpan={7} className="pb-2 text-muted-foreground">
                      {row.detail}
                    </td>
                  </tr>
                ) : null}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
      {board.quietLabel ? (
        <p className="mt-1 text-xs text-muted-foreground" data-testid="run-arcade-fonctionnel-quiet">
          {board.quietLabel}
        </p>
      ) : null}
    </div>
  )
}

function XrayPanel({ snapshot }: { snapshot: SessionSnapshot }) {
  const race = snapshot.race
  if (!race) return null
  const names = Object.fromEntries(race.runners.map((runner) => [runner.mind.id, runner.mind.name]))
  const live = activityLines(snapshot.activity, names)
  const last = lastTurnReceipts(snapshot.xrayReceipts)
  const feed = xrayFeed({
    prep: snapshot.xrayPrep,
    receipts: snapshot.xrayReceipts,
    journal: snapshot.journal,
    names,
  })
  return (
    <section className="rounded-xl border bg-card p-3" data-testid="run-arcade-xray">
      <h2 className="text-sm font-medium">Rayons X</h2>
      <FonctionnelTable snapshot={snapshot} />
      <div className="mt-3">
        <h3 className="text-xs font-medium text-muted-foreground">Avant</h3>
        <ul className="mt-1 flex flex-col gap-1 text-xs">
          {snapshot.xrayPrep.map((prep) => {
            const refused = prep.attempts.filter((attempt) => !attempt.kept)
            return (
              <li key={prep.runnerId}>
                <p>{prepHeadline(prep, names[prep.runnerId] ?? prep.runnerId)}</p>
                {refused.length > 0 ? (
                  <details className="mt-0.5 text-muted-foreground">
                    <summary className="cursor-pointer">{refusedLabel(refused.length)}</summary>
                    <ul className="mt-1 ml-3 flex flex-col gap-0.5">
                      {refused.map((attempt, index) => (
                        <li key={`${prep.runnerId}-${index}`}>{attemptLine(attempt)}</li>
                      ))}
                    </ul>
                  </details>
                ) : null}
              </li>
            )
          })}
        </ul>
      </div>
      <div className="mt-3">
        <h3 className="text-xs font-medium text-muted-foreground">En ce moment</h3>
        {live.length > 0 ? (
          <ul className="mt-1 flex flex-col gap-0.5 text-xs">
            {live.map((line) => (
              <li key={line.key}>{line.text}</li>
            ))}
          </ul>
        ) : (
          <p className="mt-1 text-xs text-muted-foreground">Personne en cours.</p>
        )}
      </div>
      <div className="mt-3">
        <h3 className="text-xs font-medium text-muted-foreground">Recherches Brave</h3>
        {snapshot.xrayBrave.length > 0 ? (
          <ul className="mt-1 flex flex-col gap-2 text-xs" data-testid="run-arcade-xray-brave">
            {snapshot.xrayBrave.map((line, index) => (
              <li key={`${line.at}-${line.runnerId}-${index}`}>
                <p className="text-muted-foreground">{braveHeadline(line, names[line.runnerId] ?? line.runnerId)}</p>
                <p className="text-foreground">{line.query}</p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-1 text-xs text-muted-foreground">Aucune recherche.</p>
        )}
      </div>
      {last.length > 0 ? (
        <div className="mt-3">
          <h3 className="text-xs font-medium text-muted-foreground">Tour {last[0]?.turn}</h3>
          <ul className="mt-1 flex flex-col gap-0.5 text-xs">
            {last.map((receipt) => (
              <li key={`${receipt.turn}-${receipt.runnerId}`}>{receipt.detail}</li>
            ))}
          </ul>
        </div>
      ) : null}
      <div className="mt-3">
        <h3 className="text-xs font-medium text-muted-foreground">Fil</h3>
        {feed.length > 0 ? (
          <ul className="mt-1 flex flex-col gap-0.5 text-xs text-muted-foreground">
            {feed.map((line, index) => (
              <li key={`${line.at}-${index}`}>{line.text}</li>
            ))}
          </ul>
        ) : (
          <p className="mt-1 text-xs text-muted-foreground">Rien encore.</p>
        )}
      </div>
    </section>
  )
}

function ObservationLedger({ observations }: { observations: readonly Observation[] }) {
  const rows = [...observations].sort(
    (a, b) => b.count - a.count || a.createdOn.localeCompare(b.createdOn) || a.phrase.localeCompare(b.phrase)
  )
  return (
    <div className="mt-3">
      <h3 className="mb-1 text-xs font-medium text-muted-foreground">Observations</h3>
      {rows.length ? (
        <ul className="flex flex-col gap-1 text-xs text-muted-foreground" data-testid="run-arcade-observations">
          {rows.map((item) => (
            <li key={item.phrase}>
              {item.phrase} · {observationReportFor([item], item.phrase)}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-muted-foreground">Aucune observation reconnue.</p>
      )}
    </div>
  )
}

export function RunArcadeLab() {
  const { draws, source, loading } = useDraws("all")
  const series = useMemo(() => toRankPoints(draws), [draws])
  const [session] = useState(() =>
    createSession({
      now: () => Date.now(),
      setTimer: (fn, ms) => window.setTimeout(fn, ms),
      clearTimer: (handle) => window.clearTimeout(handle as number),
      askIa,
      askBrave,
      saveChampion,
      capture: captureDraw,
      parallel: 1,
    })
  )
  const snapshot = useSyncExternalStore(session.subscribe, session.getSnapshot, session.getSnapshot)
  const [count, setCount] = useState(RUNNER_DEFAULT)
  const [raceDraws, setRaceDraws] = useState(RACE_DRAWS_DEFAULT)
  const [minutes, setMinutes] = useState(MINUTES_DEFAULT)
  const [departMode, setDepartMode] = useState<DepartMode>("fixe")
  const [departDate, setDepartDate] = useState("")
  const [drafts, setDrafts] = useState<FieldDrafts>({})
  const [xray, setXray] = useState(false)
  const [selected, setSelected] = useState<string | null>(null)
  const [focusCurve, setFocusCurve] = useState<CurveKey | null>(null)
  const [nextCurve, setNextCurve] = useState<CurveKey>("sumNumbers")
  const [opened, setOpened] = useState<ChampionRecord | null>(null)
  const [lastFinished, setLastFinished] = useState<ChampionRecord | null>(null)
  const [imported, setImported] = useState<ChampionRecord | null>(null)
  const [history, setHistory] = useState<ChampionRecord[]>([])
  const [importError, setImportError] = useState<string | null>(null)
  const [importOutcome, setImportOutcome] = useState<{ record: ChampionRecord; outcome: ImportOutcome } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => () => session.dispose(), [session])

  const listing = useRef(0)
  const refreshHistory = useCallback(() => {
    const ticket = (listing.current += 1)
    void listChampions().then((items) => {
      if (ticket === listing.current) setHistory(items)
    })
  }, [])

  useEffect(() => {
    let alive = true
    void loadChampion().then((record) => {
      if (alive) setOpened(record)
    })
    refreshHistory()
    return () => {
      alive = false
    }
  }, [refreshHistory])

  const saved = snapshot.save.state === "ok"
  useEffect(() => {
    if (saved) refreshHistory()
  }, [saved, refreshHistory])

  // Lancer remet `snapshot.champion` à zéro : la page garde le dernier champion fini pour la course d’après.
  if (snapshot.champion && snapshot.champion !== lastFinished) setLastFinished(snapshot.champion)
  const stored = lastKnownChampion(opened, lastFinished)

  const race = snapshot.race
  const track = snapshot.track
  const parent = parentChampion({ imported, finished: snapshot.champion, running: snapshot.parent, stored })
  const running = snapshot.phase === "avant" || snapshot.phase === "course"
  const leader = race ? leaderOf(race.runners) : null
  const reading = loading
  const notice = archiveNotice({ loading, source, points: series })
  const chromeInput = {
    phase: snapshot.phase,
    paused: snapshot.pausedLeftMs != null,
    error: snapshot.error,
    canLaunch: launchReady({ loading, points: series.length }),
    generation: snapshot.generation,
    race: race ? { cursor: race.cursor, start: race.start, end: race.end } : null,
    minutes: snapshot.minutes,
  }
  const chrome = raceChrome({ ...chromeInput, remainingMs: snapshot.pausedLeftMs })
  const focus = race?.runners.find((runner) => runner.mind.id === selected) ?? null
  const hiddenDate = race ? chainHiddenDate(race, track) : null
  const { ms: slice, floored } = playedSlice(snapshot.minutes, snapshot.sliceMs, MIN_SLICE_MS)
  const served = servedPerSlice(slice, snapshot.medianMs, 1)
  const maxDraws = useMemo(() => maxRaceDraws(series), [series])
  // La piste peut raccourcir : le champ ne garde jamais plus de tirages qu’elle n’en porte.
  if (raceDraws > maxDraws) setRaceDraws(maxDraws)
  const parentTurns = useMemo(() => (parent ? championRaceTurns(parent, series) : 0), [parent, series])
  const historyTurns = useMemo(() => history.map((item) => championRaceTurns(item, series)), [history, series])
  const championTurns = snapshot.champion
    ? (race?.runners.find((runner) => runner.mind.name === snapshot.champion?.runner)?.turns ?? 0)
    : 0
  const bounds = useMemo(() => departBounds(series, raceDraws), [series, raceDraws])
  const shownDate = bounds.first ? (snapDepart(bounds.free, departDate || bounds.first) ?? bounds.first) : ""
  const freeArchive = race ? track.slice(0, race.start) : []

  const layers = useMemo(
    () =>
      layerPoints({
        series,
        track,
        running,
        cursor: race?.cursor ?? null,
      }),
    [series, track, running, race]
  )

  const focusView = useMemo(() => {
    if (!focus || !race || track.length === 0) return null
    const curve = focusCurve ?? focus.mind.focus
    if (curve === focus.mind.focus || !focus.thought) {
      return { draw: focus.thought, matched: focus.matched, exact: focus.exact }
    }
    const shown = race.revealed ? race.cursor - 1 : race.cursor
    const past = sincePast(revealedPast(track, shown), focus.since)
    if (past.length < 2) return { draw: focus.thought, matched: focus.matched, exact: focus.exact }
    const thought = think(focus.mind, past, { hiddenDate: track[shown]?.date, focus: curve })
    const revealed = race.revealed
    return {
      draw: thought.draw,
      matched: revealed ? matchedKeys(thought.cases, revealed) : [],
      exact: revealed ? exactKeys(thought.cases, revealed) : [],
    }
  }, [focus, focusCurve, race, track])

  function type(field: keyof FieldDrafts, text: string) {
    setDrafts((current) => ({ ...current, [field]: text }))
  }

  /** Corrige les quatre champs d’un coup, à la sortie de l’un d’eux ou au lancement. */
  function settle() {
    const values = settleFields(series, { count, draws: raceDraws, minutes, date: shownDate }, drafts)
    setCount(values.count)
    setRaceDraws(values.draws)
    setMinutes(values.minutes)
    setDepartDate(values.date)
    setDrafts((current) => (Object.keys(current).length === 0 ? current : {}))
    return values
  }

  function launch() {
    if (!chromeInput.canLaunch) return
    const values = settle()
    setSelected(null)
    setFocusCurve(null)
    setImported(null)
    const depart =
      departMode === "aleatoire"
        ? { mode: "aleatoire" as const }
        : { mode: "fixe" as const, date: values.date }
    session.launch({ count: values.count, draws: values.draws, minutes: values.minutes, series, champion: parent, depart })
  }

  const proposal = useMemo(
    () => (parent && series.length >= 2 ? proposeNextDraw(parent, series, nextCurve) : null),
    [parent, series, nextCurve]
  )
  const showResult = snapshot.phase === "idle" || snapshot.phase === "fin"
  const replay = useMemo(
    () => (showResult && parent ? replayLastGrid(parent, series) : null),
    [showResult, parent, series]
  )
  const paidTicket =
    snapshot.phase === "fin" && replay && race && parent
      ? (race.runners.find(
          (runner) =>
            runner.guess != null && runner.mind.name === parent.runner && sameGuess(runner.guess, replay.thought.guess)
        ) ?? null)
      : null
  const persisted = useMemo(() => {
    const last = lastRevealedDraw(series)
    return last ? { date: last.date, values: curveValues(last), point: last } : null
  }, [series])

  function importFile(file: File) {
    const reader = new FileReader()
    reader.onload = () => {
      const record = readChampionFile(String(reader.result ?? ""))
      if (!record) {
        setImportError("Ce fichier n’est pas un champion runArcade.")
        return
      }
      setImportError(null)
      setImported(record)
      void importChampion(record).then((outcome) => {
        setImportOutcome({ record, outcome })
        if (outcome.state === "écrit") void listChampions().then(setHistory)
      })
    }
    reader.readAsText(file)
  }

  const focusJournal = focus
    ? snapshot.journal.filter((entry) => entry.runner === focus.mind.id).slice(-8).reverse()
    : []

  return (
    <div className="flex flex-col gap-4">
      <form
        noValidate
        className="flex flex-wrap items-end gap-3"
        onSubmit={(event) => {
          event.preventDefault()
          launch()
        }}
      >
        <LabelHelp label="Runners" help={RUN_ARCADE_HELP.runners} className="w-24 sm:w-24">
          <Input
            type="number"
            min={RUNNER_MIN}
            max={RUNNER_MAX}
            value={drafts.count ?? count}
            aria-label="Nombre de runners"
            onChange={(event) => type("count", event.target.value)}
            onBlur={settle}
          />
        </LabelHelp>
        <LabelHelp label="Tirages" help={RUN_ARCADE_HELP.tirages} className="w-24 sm:w-24">
          <Input
            type="number"
            min={RACE_DRAWS_MIN}
            max={maxDraws}
            value={drafts.draws ?? raceDraws}
            aria-label="Tirages de course"
            onChange={(event) => type("draws", event.target.value)}
            onBlur={settle}
          />
        </LabelHelp>
        <LabelHelp label="Minutes" help={RUN_ARCADE_HELP.minutes} className="w-24 sm:w-24">
          <Input
            type="number"
            min={MINUTES_MIN}
            max={MINUTES_MAX}
            step={MINUTES_STEP}
            value={drafts.minutes ?? minutes}
            aria-label="Minutes d’avant-course"
            onChange={(event) => type("minutes", event.target.value)}
            onBlur={settle}
          />
        </LabelHelp>
        <LabelHelp label="Départ" help={RUN_ARCADE_HELP.depart} className="w-36">
          <Select
            value={departMode}
            onValueChange={(value) => {
              if (value === "fixe" || value === "aleatoire") setDepartMode(value)
            }}
          >
            <SelectTrigger className="w-full" aria-label="Mode de départ">
              <span className="flex flex-1 text-left">{departMode === "fixe" ? "Date fixe" : "Aléatoire"}</span>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="fixe">Date fixe</SelectItem>
              <SelectItem value="aleatoire">Aléatoire</SelectItem>
            </SelectContent>
          </Select>
        </LabelHelp>
        {departMode === "fixe" ? (
          <LabelHelp label="Date" help={RUN_ARCADE_HELP.depart} className="w-40">
            <Input
              type="date"
              min={bounds.first || undefined}
              max={bounds.last || undefined}
              value={drafts.date ?? shownDate}
              aria-label="Date de départ"
              onChange={(event) => type("date", event.target.value)}
              onBlur={settle}
            />
          </LabelHelp>
        ) : null}
        <HelpWrap help={RUN_ARCADE_HELP.rayons}>
          <Button
            type="button"
            variant="outline"
            aria-pressed={xray}
            disabled={running}
            className={cn(xray && "border-chart-4 text-chart-4")}
            onClick={() => setXray((value) => !value)}
          >
            Rayons X
          </Button>
        </HelpWrap>
        <HelpWrap help={RUN_ARCADE_HELP.lancer}>
          <Button type="submit" variant={chrome.launch.variant} disabled={chrome.launch.disabled}>
            {chrome.launch.label}
          </Button>
        </HelpWrap>
        <HelpWrap help={RUN_ARCADE_HELP.pause}>
          <Button
            type="button"
            variant={chrome.pause.variant}
            disabled={chrome.pause.disabled}
            onClick={() => (snapshot.pausedLeftMs != null ? session.resume() : session.pause())}
          >
            {chrome.pause.label}
          </Button>
        </HelpWrap>
        <HelpWrap help={RUN_ARCADE_HELP.tour}>
          <Button type="button" variant={chrome.step.variant} disabled={chrome.step.disabled} onClick={() => session.skip()}>
            {chrome.step.label}
          </Button>
        </HelpWrap>
        <HelpWrap help={RUN_ARCADE_HELP.exporter}>
          <Button
            type="button"
            variant="outline"
            disabled={!parent}
            onClick={() => {
              if (parent) exportChampion(parent)
            }}
          >
            Exporter le champion
          </Button>
        </HelpWrap>
        <HelpWrap help={RUN_ARCADE_HELP.importer}>
          <Button type="button" variant="outline" onClick={() => fileRef.current?.click()}>
            Importer le champion
          </Button>
        </HelpWrap>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          aria-label="Fichier du champion"
          onChange={(event) => {
            const file = event.target.files?.[0]
            event.target.value = ""
            if (file) importFile(file)
          }}
        />
      </form>

      <div className="flex flex-col gap-1 text-sm text-muted-foreground" data-testid="run-arcade-status">
        {notice ? (
          <p
            className="rounded-lg border border-chart-5/40 bg-chart-5/15 px-3 py-2 text-foreground"
            role="status"
            data-testid="run-arcade-archive-notice"
          >
            {notice}
          </p>
        ) : null}
        {chrome.band && !reading ? (
          <LiveBand snapshot={snapshot} input={chromeInput} leader={leader} championTurns={championTurns} />
        ) : (
          <p className="text-foreground">
            {reading ? "Archive en cours de lecture." : chrome.lead}
            <HelpTip {...RUN_ARCADE_HELP.statut} />
          </p>
        )}
        {race && track.length > 0 ? (
          <p>
            Archive gratuite : {trackYears(track)}, du {formatDrawDate(track[0].date)} au{" "}
            {formatDrawDate(track[race.start - 1].date)}. Course : {race.end - race.start} tirages, du{" "}
            {formatDrawDate(track[race.start].date)} au {formatDrawDate(track[race.end - 1].date)}.
            <HelpTip {...RUN_ARCADE_HELP.archive} />
          </p>
        ) : null}
        {race ? (
          <p>
            {snapshot.minutes > 0 ? (
              <>
                Horloge : {formatDuration(snapshot.minutes * 60_000)} d’avant-course, tranche de {formatSlice(slice)}
                {floored ? " (le plancher)" : ""} par tour, course de{" "}
                {formatDuration(raceDurationMs(race.end - race.start, slice))}.
                {snapshot.medianMs != null
                  ? ` Appel médian ${formatDuration(snapshot.medianMs)} : ${served ?? 0} runner(s) servi(s) par tranche. Une réponse arrivée après la tranche joue au tour suivant.`
                  : ""}
              </>
            ) : (
              "Lecture : les tours s’enchaînent, sans appel."
            )}
            <HelpTip {...RUN_ARCADE_HELP.horloge} />
          </p>
        ) : null}
        {race ? (
          <p>
            IA locale : {serviceText(snapshot.ia, snapshot.iaError, snapshot.iaVision ? "prête, le dessin part avec l’appel" : "prête")} ·
            Brave : {serviceText(snapshot.brave, snapshot.braveError, "prête")} · Neon :{" "}
            {snapshot.save.state === "ok"
              ? `champion écrit (${snapshot.save.detail})`
              : snapshot.save.state === "erreur"
                ? `écriture refusée : ${snapshot.save.detail}`
                : snapshot.save.state === "en cours"
                  ? "écriture du champion"
                  : "écrit le champion en fin de course"}
            <HelpTip {...RUN_ARCADE_HELP.services} />
          </p>
        ) : null}
        {race && snapshot.parent ? (
          <p>
            Génération {snapshot.generation} : enfants de {snapshot.parent.runner} (génération{" "}
            {snapshot.parent.generation}).
            {snapshot.setAside > 0
              ? ` ${snapshot.setAside} version(s) écrite(s), ou gardée(s) par un examen, le jour du premier tirage caché ou après restent de côté.`
              : ""}
            {snapshot.sharedWithParent != null
              ? ` ${sharedSentence(snapshot.sharedWithParent, race.end - race.start, snapshot.parent)}`
              : ""}
            <HelpTip {...RUN_ARCADE_HELP.generation} />
          </p>
        ) : null}
      </div>

      <UnsentChampions
        onWritten={(written) => {
          for (const record of written) session.confirmSaved(record, "Neon")
          void listChampions().then(setHistory)
        }}
      />

      {history.length > 0 ? (
        <div className="flex flex-col gap-1">
          <h2 className="text-xs font-medium text-muted-foreground">
            <TitleHelp help={RUN_ARCADE_HELP.champions}>Champions déjà écrits</TitleHelp>
          </h2>
          <ul className="flex flex-col gap-1" data-testid="run-arcade-history">
            {history.map((item, position) => {
              const active =
                parent?.generation === item.generation &&
                parent.runner === item.runner &&
                parent.savedAt === item.savedAt
              return (
                <li key={championKey(item, position)}>
                  <button
                    type="button"
                    onClick={() => {
                      setImportError(null)
                      setImported(item)
                    }}
                    className={cn(
                      "w-full rounded-md border px-2 py-1 text-left text-xs",
                      active ? "border-primary" : "border-border text-muted-foreground hover:text-foreground"
                    )}
                  >
                    Génération {item.generation} · {item.runner} · course {balanceWithChance(item.cents, historyTurns[position])}
                    {` · ${championExamLine(item)}`}
                    {item.raceFrom && item.raceTo
                      ? ` · ${formatShortDate(item.raceFrom)} – ${formatShortDate(item.raceTo)}`
                      : ""}
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      ) : null}

      {importError ? <p className="text-sm text-destructive">{importError}</p> : null}
      {importOutcome && importOutcome.record === imported ? (
        <p
          className={cn("text-sm", importOutcome.outcome.state === "non écrit" ? "text-destructive" : "text-muted-foreground")}
          data-testid="run-arcade-import-outcome"
        >
          Champion importé : {importOutcome.outcome.text}
        </p>
      ) : null}

      {proposal && parent ? (
        <section className="rounded-xl border bg-card p-3" data-testid="run-arcade-next">
          <header className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-sm font-medium">
              <TitleHelp help={RUN_ARCADE_HELP.suivant}>
                Tirage suivant · {parent.runner}
                <span className="font-normal text-muted-foreground"> · génération {parent.generation}</span>
              </TitleHelp>
            </h2>
            <p className="text-sm text-muted-foreground">
              course {balanceWithChance(parent.cents, parentTurns)} · {championExamLine(parent)}
            </p>
          </header>
          {replay ? (
            <ResultGrids
              replay={replay}
              proposal={proposal}
              ticketHits={paidTicket ? paidTicket.lastHits : null}
              archiveLastDate={persisted?.date ?? null}
            />
          ) : null}
          <div className="mb-2 flex flex-wrap items-center gap-1">
            <HelpTip {...RUN_ARCADE_HELP.courbes} />
            <div className="contents" role="group" aria-label="Courbe du tirage suivant">
            {CURVE_KEYS.map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setNextCurve(key)}
                className={cn(
                  "rounded-md border px-1.5 py-0.5 text-[11px]",
                  nextCurve === key ? "border-chart-4 text-chart-4" : "border-border text-muted-foreground hover:text-foreground"
                )}
              >
                {curveLabel(key)}
              </button>
            ))}
            </div>
          </div>
          <div className={cn("grid gap-3", !replay && "lg:grid-cols-[minmax(0,1.4fr)_minmax(16rem,0.8fr)]")}>
            <div>
              <RunnerUniverse runnerId="champion-next" thought={proposal.draw} className="h-64" />
              <p className="mt-2 text-lg tracking-wide">
                {proposal.guess.n1} {proposal.guess.n2} {proposal.guess.n3} {proposal.guess.n4} {proposal.guess.n5}
                <span className="text-muted-foreground">
                  {" "}
                  ★ {proposal.guess.e1} {proposal.guess.e2}
                </span>
              </p>
              <p className="text-sm text-muted-foreground">
                Somme des numéros {proposal.cases.sumNumbers} · somme des étoiles {proposal.cases.sumStars} · décennies{" "}
                {proposal.cases.d0} {proposal.cases.d1} {proposal.cases.d2} {proposal.cases.d3} {proposal.cases.d4}
              </p>
              <p className="mt-1 text-sm leading-5">{proposal.draw.phrase}</p>
              <p className="text-sm leading-5 text-muted-foreground">{proposal.draw.observation}</p>
              {observationReportFor(snapshot.observations, proposal.draw.observation) ? (
                <p className="text-sm leading-5">{observationReportFor(snapshot.observations, proposal.draw.observation)}</p>
              ) : null}
            </div>
            {persisted && !replay ? (
              <div className="rounded-lg border border-dashed p-3 text-sm" data-testid="run-arcade-persist">
                <h3 className="font-medium">
                  <TitleHelp help={RUN_ARCADE_HELP.persiste}>Persiste</TitleHelp>
                </h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  Le nul gris recopie le dernier tirage révélé, {formatDrawDate(persisted.date)}.
                </p>
                <p className="mt-2 tracking-wide">
                  {persisted.point.n1} {persisted.point.n2} {persisted.point.n3} {persisted.point.n4}{" "}
                  {persisted.point.n5}
                  <span className="text-muted-foreground">
                    {" "}
                    ★ {persisted.point.e1} {persisted.point.e2}
                  </span>
                </p>
                <p className="text-muted-foreground">
                  Somme des numéros {persisted.values.sumNumbers} · somme des étoiles {persisted.values.sumStars} ·
                  décennies {persisted.values.d0} {persisted.values.d1} {persisted.values.d2} {persisted.values.d3}{" "}
                  {persisted.values.d4}
                </p>
              </div>
            ) : null}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Lu sur toute l’archive révélée, jusqu’au {formatDrawDate(proposal.draw.seenDate)}. Le tirage suivant n’est
            pas dans la base. Lancer reprend ce champion pour la génération suivante.
          </p>
        </section>
      ) : null}

      <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <li className="inline-flex items-center gap-1 empty:hidden">
          <HelpTip {...RUN_ARCADE_HELP.dessin} />
          <HelpTip {...RUN_ARCADE_HELP.gestes} />
        </li>
        <li>Trait : courbe fondamentale</li>
        <li>Curseur : vingt tirages, du plus ancien au bout</li>
        <li>Bande : masque</li>
        <li className="text-chart-2">Calque tangente</li>
        <li className="text-chart-1">Calque cercle d’or</li>
        <li className="text-chart-3">Calque pas d’avant</li>
        <li className="text-chart-4">Calque vecteur</li>
        <li>Trait fin : rappel à la somme</li>
        <li className="text-chart-4">Point : la case jouée</li>
        <li>Rail : sommes et décennies à gauche, rangs à droite</li>
        <li className="inline-flex items-center gap-1 text-[var(--ok)]">
          Numéro ou étoile trouvé : +2 €
          <HelpTip {...RUN_ARCADE_HELP.solde} />
        </li>
        <li className="text-chart-2">Somme ou décennie juste</li>
      </ul>

      <RunArcadeLayers points={layers} help={RUN_ARCADE_HELP.couches} />

      {race?.seenDate ? (
        <p className="text-sm text-muted-foreground">
          Passé révélé jusqu’au {formatDrawDate(race.seenDate)}. Le tirage du tour reste caché pendant le dessin.
          <HelpTip {...RUN_ARCADE_HELP.passe} />
        </p>
      ) : null}

      {xray && race ? <XrayPanel key={snapshot.generation} snapshot={snapshot} /> : null}

      {race?.revealed ? (
        <p className="text-sm" data-testid="run-arcade-referee">
          Arbitre · {formatDrawDate(race.revealed.date)} · {race.revealed.n1} {race.revealed.n2} {race.revealed.n3}{" "}
          {race.revealed.n4} {race.revealed.n5}
          <span className="text-muted-foreground">
            {" "}
            ★ {race.revealed.e1} {race.revealed.e2}
          </span>
          <HelpTip {...RUN_ARCADE_HELP.arbitre} />
        </p>
      ) : null}

      {focus && focusView ? (
        <section className="rounded-xl border border-primary/50 bg-card p-3" data-testid="run-arcade-focus">
          <header className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-sm font-medium">
              <TitleHelp help={RUN_ARCADE_HELP.fiche}>
                {focus.mind.name} · {skillSummary(focus)}
              </TitleHelp>
            </h2>
            <p className="text-sm">
              {balanceWithChance(focus.cents, focus.turns)}
              <span className="text-muted-foreground">
                {" "}
                · {runnerExamLine(focus)} · {focus.calls} appel(s)
                {focus.since ? ` · ${departCard(formatDrawDate(focus.since), droppedBefore(freeArchive, focus.since))}` : ""}
              </span>
            </p>
          </header>
          <div className="mb-2 flex flex-wrap items-center gap-1">
            <HelpTip {...RUN_ARCADE_HELP.courbes} />
            <div className="contents" role="group" aria-label="Courbe dessinée">
            {CURVE_KEYS.map((key) => {
              const active = (focusCurve ?? focus.mind.focus) === key
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setFocusCurve(key)}
                  className={cn(
                    "rounded-md border px-1.5 py-0.5 text-[11px]",
                    active ? "border-chart-4 text-chart-4" : "border-border text-muted-foreground hover:text-foreground"
                  )}
                >
                  {curveLabel(key)}
                </button>
              )
            })}
            </div>
          </div>
          <RunnerUniverse
            runnerId={`${focus.mind.id}-focus`}
            thought={focusView.draw}
            matched={focusView.matched}
            exact={focusView.exact}
            className="h-72"
          />
          {xray ? <ThoughtChain runner={focus} draw={focusView.draw} hiddenDate={hiddenDate} /> : null}
          {focusView.draw ? (
            <div className="mt-2 text-sm leading-5">
              <p>{focusView.draw.phrase}</p>
              <p className="text-muted-foreground">{focusView.draw.observation}</p>
              {observationReportFor(snapshot.observations, focusView.draw.observation) ? (
                <p>{observationReportFor(snapshot.observations, focusView.draw.observation)}</p>
              ) : null}
            </div>
          ) : null}
          <ObservationLedger observations={snapshot.observations} />
          <div className="mt-3 grid gap-3 lg:grid-cols-2">
            <div>
              <h3 className="mb-1 text-xs font-medium text-muted-foreground">
                <TitleHelp help={RUN_ARCADE_HELP.skills}>Skills et versions</TitleHelp>
              </h3>
              <ul className="flex flex-col gap-1 text-xs">
                {focus.mind.skills.map((skill) => (
                  <li key={skill.id}>
                    <span className="font-medium">{skill.name}</span>
                    <span className="text-muted-foreground"> · {targetLabel(currentVersion(skill).curve)}</span>
                    <ul className="ml-3">
                      {skill.versions.map((version) => (
                        <li key={version.version} className="text-muted-foreground">
                          v{version.version} · {version.origin} · coupure{" "}
                          {version.cutoff ? formatShortDate(version.cutoff) : "aucune"}
                          {version.examCents != null ? ` · examen ${formatCents(version.examCents)}` : ""}
                          {version.examCents != null && version.examTo ? ` jusqu’au ${formatShortDate(version.examTo)}` : ""} ·{" "}
                          {version.phrase}
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="mb-1 text-xs font-medium text-muted-foreground">
                <TitleHelp help={RUN_ARCADE_HELP.journal}>Journal des requêtes</TitleHelp>
              </h3>
              {focusJournal.length ? (
                <ul className="flex flex-col gap-1 text-xs text-muted-foreground">
                  {focusJournal.map((entry, index) => (
                    <li key={`${entry.at}-${index}`}>
                      {entry.turn != null ? `tour ${entry.turn}` : "avant-course"} · {entry.kind} · coupure{" "}
                      {entry.cutoff ? formatShortDate(entry.cutoff) : "aucune"} · {entry.detail}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-muted-foreground">Aucune requête pour ce runner.</p>
              )}
            </div>
          </div>
        </section>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        {race?.runners.map((runner) => {
          const active = runner.mind.id === selected
          const mark = xray ? xrayMark(runner.mind.id, snapshot.activity) : null
          const select = () => {
            setSelected(runner.mind.id)
            setFocusCurve(null)
          }
          return (
            <div
              key={runner.mind.id}
              className={cn(
                "rounded-xl border bg-card p-2 text-left transition-colors hover:border-foreground/30",
                active ? "border-primary" : "border-border",
                mark && "ring-1 ring-chart-4",
                !runner.alive && "opacity-60"
              )}
            >
              <button type="button" onClick={select} className="block w-full cursor-pointer text-left">
                <span className="flex items-baseline justify-between gap-2 text-xs">
                  <span className="font-medium text-foreground">{runner.mind.name}</span>
                  <span className="text-muted-foreground">
                    {mark ? <span className="text-chart-4">{mark} · </span> : null}
                    {formatCents(runner.cents)}
                  </span>
                </span>
                <span className="mt-0.5 block text-[11px] text-muted-foreground">
                  {curveLabel(runner.mind.focus)} · {skillSummary(runner)} · {runnerExamLine(runner)} ·{" "}
                  {runner.calls} appel(s)
                  {runner.since
                    ? ` · ${departCard(formatDrawDate(runner.since), droppedBefore(freeArchive, runner.since))}`
                    : ""}
                  {runner.alive ? "" : " · arrêté"}
                </span>
              </button>
              <RunnerUniverse
                runnerId={runner.mind.id}
                thought={runner.thought}
                matched={runner.matched}
                exact={runner.exact}
                onPress={select}
                className="mt-1"
              />
              <button type="button" onClick={select} className="block w-full cursor-pointer text-left">
                {xray ? <ThoughtChain runner={runner} draw={runner.thought} hiddenDate={hiddenDate} /> : null}
                <span className="mt-1 block text-[11px] leading-4 text-muted-foreground">
                  {runner.thought?.phrase ?? "—"}
                </span>
                {runner.thought ? (
                  <span className="mt-1 block text-[11px] leading-4 text-muted-foreground">{runner.thought.observation}</span>
                ) : null}
                {observationReportFor(snapshot.observations, runner.thought?.observation) ? (
                  <span className="mt-1 block text-[11px] leading-4 text-foreground" data-testid="runner-observation">
                    {observationReportFor(snapshot.observations, runner.thought?.observation)}
                  </span>
                ) : null}
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
