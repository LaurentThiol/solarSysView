"use client"

import { Fragment, memo, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react"
import { ChevronDown } from "lucide-react"

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
  championLineages,
  championRaceTurns,
  forecastBadge,
  forecastLine,
  lastRevealedDraw,
  lifeTable,
  proposeNextDraw,
  replayLastGrid,
  scoreForecast,
  scoreForecasts,
  type ChampionLineage,
  type ChampionRecord,
  type ReplayLastGrid,
} from "@/lib/run-arcade/champion"
import { archiveNotice, lastDrawLine, launchReady, trackYears } from "@/lib/run-arcade/archive"
import { raceChrome } from "@/lib/run-arcade/chrome"
import {
  calendarRead,
  calendarSentence,
  departBounds,
  droppedBefore,
  maxRaceDraws,
  RACE_DRAWS_MIN,
  raceStartIndex,
  sincePast,
  snapDepart,
  type DepartMode,
} from "@/lib/run-arcade/depart"
import { balanceWithChance, championExamLine, runnerExamLine, sharedSentence } from "@/lib/run-arcade/examen"
import {
  askBrave,
  askIa,
  CHAMPION_LIST_CEILING,
  CHAMPION_PAGE_SIZE,
  championHideKey,
  exportChampion,
  hiddenChampionsServerSnapshot,
  hiddenChampionsSnapshot,
  hideChampion,
  listChampions,
  loadChampion,
  readChampionFile,
  restoreHiddenChampions,
  sameChampion,
  saveChampion,
  subscribeHiddenChampions,
} from "@/lib/run-arcade/client"
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
import {
  buildTrack,
  CURVE_KEYS,
  curveLabel,
  curveValues,
  NUMBER_KEYS,
  STAR_KEYS,
  type CurveKey,
  type RankPoint,
} from "@/lib/run-arcade/curves"
import { RUNNER_MIN, settleFields, type FieldDrafts } from "@/lib/run-arcade/fields"
import {
  ARCTAN_TURNS,
  FORMES,
  POLYGON_SIDES,
  WAVE_PERIODS,
  usesFigureN,
  type Forme,
} from "@/lib/run-arcade/figure"
import { formatRatio, GOLDEN_RATIOS } from "@/lib/run-arcade/golden"
import { fonctionnelBoard, type FonctionnelCell } from "@/lib/run-arcade/fonctionnel"
import { RUN_ARCADE_HELP } from "@/lib/run-arcade/help"
import { iaUsedLabel } from "@/lib/run-arcade/ia-label"
import { layerPoints } from "@/lib/run-arcade/layers"
import { championKey, lastKnownChampion, parentChampion } from "@/lib/run-arcade/lineage"
import { createSession, MIN_SLICE_MS, type ServiceState, type SessionSnapshot } from "@/lib/run-arcade/session"
import { curveStrokes, type CurveStrokes } from "@/lib/run-arcade/strokes"
import { TUNNEL_MAX_DAYS, TUNNEL_MIN_DAYS, tunnelOf, type Tunnel } from "@/lib/run-arcade/tunnel"
import {
  DAYS_MAX,
  DAYS_MIN,
  GESTURES,
  LOGISTIC_R,
  SPANS,
  SUITE_SPANS,
  WINDOW_MAX,
  WINDOW_MIN,
  activeVersion,
  addVersion,
  boundSkillDraft,
  currentVersion,
  describeSkill,
  drawsSinceBirth,
  gesturePhrase,
  isBaseVersion,
  playingVersion,
  targetLabel,
  versionAlive,
  type GestureLife,
  type Skill,
  type SkillDraft,
  type SkillParams,
  type SkillVersion,
  type SpanKind,
} from "@/lib/run-arcade/skills"
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
  type XrayActivity,
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
  tipFor,
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

function ResultGridsView({
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

const ResultGrids = memo(ResultGridsView)

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

function sameActivity(left: XrayActivity, right: XrayActivity) {
  return (
    left.calling.join("\n") === right.calling.join("\n") &&
    left.searching.map((item) => `${item.runnerId}\n${item.query}`).join("\n") ===
      right.searching.map((item) => `${item.runnerId}\n${item.query}`).join("\n") &&
    left.pending.map((item) => `${item.runnerId}\n${item.detail}`).join("\n") ===
      right.pending.map((item) => `${item.runnerId}\n${item.detail}`).join("\n")
  )
}

function sameRaceNames(left: SessionSnapshot["race"], right: SessionSnapshot["race"]) {
  if (!left || !right) return left === right
  if (left.cursor !== right.cursor || left.start !== right.start || left.runners.length !== right.runners.length) return false
  return left.runners.every(
    (runner, index) => runner.mind.id === right.runners[index].mind.id && runner.mind.name === right.runners[index].mind.name
  )
}

function fonctionnelEqual(prev: { snapshot: SessionSnapshot }, next: { snapshot: SessionSnapshot }) {
  const left = prev.snapshot
  const right = next.snapshot
  return (
    left.phase === right.phase &&
    left.minutes === right.minutes &&
    left.pausedLeftMs === right.pausedLeftMs &&
    left.ia === right.ia &&
    left.iaError === right.iaError &&
    left.iaModel === right.iaModel &&
    left.xraySteps === right.xraySteps &&
    sameActivity(left.activity, right.activity) &&
    sameRaceNames(left.race, right.race)
  )
}

function xrayEqual(prev: { snapshot: SessionSnapshot }, next: { snapshot: SessionSnapshot }) {
  const left = prev.snapshot
  const right = next.snapshot
  return (
    fonctionnelEqual(prev, next) &&
    left.xrayPrep === right.xrayPrep &&
    left.xrayReceipts === right.xrayReceipts &&
    left.journal === right.journal &&
    left.xrayBrave === right.xrayBrave
  )
}

function FonctionnelTableView({ snapshot }: { snapshot: SessionSnapshot }) {
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

const FonctionnelTable = memo(FonctionnelTableView, fonctionnelEqual)

function XrayPanelView({ snapshot }: { snapshot: SessionSnapshot }) {
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

const XrayPanel = memo(XrayPanelView, xrayEqual)

function ObservationLedgerView({ observations }: { observations: readonly Observation[] }) {
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

const ObservationLedger = memo(ObservationLedgerView)

type RunnerCardProps = {
  runner: RunnerLive
  active: boolean
  mark: string | null
  xray: boolean
  hiddenDate: string | null
  freeArchive: readonly RankPoint[]
  observationReport: string | null
  onSelect: (id: string) => void
  tunnel?: Tunnel | null
}

/** Carte d’un runner, mémoïsée : elle ne se redessine que si ce runner (ou sa sélection) change. */
const RunnerCard = memo(function RunnerCard({
  runner,
  active,
  mark,
  xray,
  hiddenDate,
  freeArchive,
  observationReport,
  onSelect,
  tunnel = null,
}: RunnerCardProps) {
  const select = () => onSelect(runner.mind.id)
  return (
    <div
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
          {curveLabel(runner.mind.focus)} · {skillSummary(runner)} · {runnerExamLine(runner)} · {runner.calls} appel(s)
          {runner.since ? ` · ${departCard(formatDrawDate(runner.since), droppedBefore(freeArchive, runner.since))}` : ""}
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
        tunnel={tunnel}
      />
      <button type="button" onClick={select} className="block w-full cursor-pointer text-left">
        {xray ? <ThoughtChain runner={runner} draw={runner.thought} hiddenDate={hiddenDate} /> : null}
        <span className="mt-1 block text-[11px] leading-4 text-muted-foreground">{runner.thought?.phrase ?? "—"}</span>
        {runner.thought ? (
          <span className="mt-1 block text-[11px] leading-4 text-muted-foreground">{runner.thought.observation}</span>
        ) : null}
        {observationReport ? (
          <span className="mt-1 block text-[11px] leading-4 text-foreground" data-testid="runner-observation">
            {observationReport}
          </span>
        ) : null}
      </button>
    </div>
  )
})

function lineageTitle(lineage: ChampionLineage) {
  const first = lineage.champions[0]
  const last = lineage.champions[lineage.champions.length - 1]
  const span =
    first.generation === last.generation
      ? `Génération ${first.generation}`
      : `Générations ${first.generation} à ${last.generation}`
  const count = lineage.champions.length === 1 ? "1 champion" : `${lineage.champions.length} champions`
  return `${span} · ${last.runner} · ${count}`
}

function lineageId(lineage: ChampionLineage) {
  const first = lineage.champions[0]
  return championHideKey(first)
}

function ChampionDetail({ item, series }: { item: ChampionRecord; series: readonly RankPoint[] }) {
  const note = scoreForecast(item, series)
  const forecast = item.forecast
  return (
    <div className="border-t px-2 py-1 text-[11px] leading-4 text-muted-foreground" data-testid="run-arcade-champion-detail">
      <ul className="flex flex-col gap-0.5">
        {item.skills.map((skill) => {
          const version = currentVersion(skill)
          return (
            <li key={skill.id}>
              {skill.name} · {version.phrase}
            </li>
          )
        })}
      </ul>
      <p>{item.depart ? `Départ ${formatShortDate(item.depart)}.` : "Départ non écrit."}</p>
      <p>
        {forecast
          ? `Pronostic ${forecast.numbers.join(" ")} · étoiles ${forecast.stars.join(" ")} · lu le ${formatShortDate(forecast.seenDate)}${forecast.targetDate ? ` · visé le ${formatShortDate(forecast.targetDate)}` : ""}.`
          : "Pronostic non écrit."}
      </p>
      <p>
        {note
          ? `Hors échantillon : ${note.hits === 1 ? "1 trouvé" : `${note.hits} trouvés`} · ${formatCents(note.netCents)}.`
          : forecast?.targetDate
            ? "Hors échantillon : le tirage visé n’est pas encore dans l’archive."
            : "Hors échantillon : pas de note."}
      </p>
    </div>
  )
}

function ChampionLine({
  item,
  position,
  historyTurns,
  series,
  active,
  open,
  aside,
  onChoose,
  onToggle,
  onHide,
}: {
  item: ChampionRecord
  position: number
  historyTurns: readonly number[]
  series: readonly RankPoint[]
  active: boolean
  open: boolean
  aside: boolean
  onChoose: () => void
  onToggle: () => void
  onHide: () => void
}) {
  const dates =
    item.raceFrom && item.raceTo ? `${formatShortDate(item.raceFrom)} – ${formatShortDate(item.raceTo)}` : ""
  return (
    <div className={cn("rounded-md border", active ? "border-primary" : "border-border")}>
      <div className="flex items-start gap-1 px-1 py-1">
        <button
          type="button"
          aria-expanded={open}
          aria-label={open ? "Fermer le détail" : "Ouvrir le détail"}
          onClick={onToggle}
          className="mt-0.5 rounded-md p-0.5 text-muted-foreground hover:text-foreground"
          data-testid="run-arcade-champion-chevron"
        >
          <ChevronDown className={cn("size-3.5 transition-transform", open && "rotate-180")} aria-hidden />
        </button>
        <button
          type="button"
          onClick={onChoose}
          aria-current={active ? "true" : undefined}
          className={cn(
            "flex min-w-0 flex-1 flex-wrap items-baseline justify-between gap-x-3 text-left text-xs",
            active ? "text-foreground" : "text-muted-foreground hover:text-foreground"
          )}
        >
          <span>
            Génération {item.generation} · {item.runner} · course{" "}
            {position >= 0
              ? balanceWithChance(item.cents, historyTurns[position])
              : balanceWithChance(item.cents, championRaceTurns(item, series))}
            {` · ${championExamLine(item)}`}
          </span>
          {dates ? <span className="ml-auto shrink-0 tabular-nums">{dates}</span> : null}
        </button>
        {aside ? (
          <span className="shrink-0 px-1 text-[11px] text-muted-foreground">écarté</span>
        ) : (
          <button
            type="button"
            onClick={onHide}
            className="shrink-0 px-1 text-[11px] text-muted-foreground hover:text-foreground"
            data-testid="run-arcade-champion-hide"
          >
            Écarter
          </button>
        )}
      </div>
      {open ? <ChampionDetail item={item} series={series} /> : null}
    </div>
  )
}

function ChampionArchive({
  parent,
  history,
  historyTurns,
  series,
  hiddenKeys,
  more,
  paging,
  onChoose,
  onHide,
  onRestore,
  onMore,
}: {
  parent: ChampionRecord | null
  history: readonly ChampionRecord[]
  historyTurns: readonly number[]
  series: readonly RankPoint[]
  hiddenKeys: readonly string[]
  more: boolean
  paging: boolean
  onChoose: (item: ChampionRecord) => void
  onHide: (item: ChampionRecord) => void
  onRestore: () => void
  onMore: () => void
}) {
  const [opened, setOpened] = useState<string[]>([])
  const [detail, setDetail] = useState<string | null>(null)
  const hidden = useMemo(() => new Set(hiddenKeys), [hiddenKeys])
  const archive = useMemo(() => {
    if (!parent || history.some((item) => sameChampion(item, parent))) return history
    return [...history, parent]
  }, [history, parent])
  const lineages = useMemo(() => championLineages(archive), [archive])
  const parentLineage = parent
    ? lineages.find((lineage) => lineage.champions.some((item) => sameChampion(item, parent)))
    : undefined
  const rest = lineages.filter((lineage) => lineage !== parentLineage)

  function positionOf(item: ChampionRecord) {
    return history.findIndex((row) => sameChampion(row, item))
  }

  function toggleDetail(token: string) {
    setDetail((current) => (current === token ? null : token))
  }

  function renderLine(item: ChampionRecord, place: string, aside: boolean) {
    const position = positionOf(item)
    const token = `${place}:${championHideKey(item)}`
    return (
      <ChampionLine
        item={item}
        position={position}
        historyTurns={historyTurns}
        series={series}
        active={parent != null && sameChampion(parent, item)}
        open={detail === token}
        aside={aside}
        onChoose={() => onChoose(item)}
        onToggle={() => toggleDetail(token)}
        onHide={() => onHide(item)}
      />
    )
  }

  function renderLineage(lineage: ChampionLineage, folded: boolean) {
    const id = lineageId(lineage)
    const open = !folded || opened.includes(id)
    const visible = lineage.champions.filter((item) => !hidden.has(championHideKey(item)))
    if (visible.length === 0) return null
    const badge = forecastBadge(scoreForecasts(lineage.champions, series))
    return (
      <li key={id} data-testid="run-arcade-lineage" data-open={open ? "true" : "false"}>
        <div className="flex flex-wrap items-center gap-2 px-1 py-0.5">
          {folded ? (
            <button
              type="button"
              aria-expanded={open}
              aria-label={open ? "Replier la lignée" : "Ouvrir la lignée"}
              onClick={() =>
                setOpened((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]))
              }
              className="rounded-md p-0.5 text-muted-foreground hover:text-foreground"
            >
              <ChevronDown className={cn("size-3.5 transition-transform", open && "rotate-180")} aria-hidden />
            </button>
          ) : null}
          <span className="text-[11px] text-muted-foreground">{lineageTitle(lineage)}</span>
          {badge ? (
            <span className="rounded-full border px-2 py-0.5 text-[11px]" data-testid="run-arcade-lineage-badge">
              {badge}
            </span>
          ) : null}
        </div>
        {open ? (
          <ul className="flex flex-col gap-1">
            {visible.map((item) => {
              const position = positionOf(item)
              return (
                <li key={championKey(item, position)} data-testid="run-arcade-champion-row">
                  {renderLine(item, "liste", false)}
                </li>
              )
            })}
          </ul>
        ) : null}
      </li>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      <h2 className="text-xs font-medium text-muted-foreground">
        <TitleHelp help={RUN_ARCADE_HELP.champions}>Champions déjà écrits</TitleHelp>
      </h2>
      {parent ? (
        <div data-testid="run-arcade-parent-pin" className="flex flex-col gap-1">
          <p className="text-xs font-medium">Parent du prochain Lancer</p>
          {renderLine(parent, "épingle", hidden.has(championHideKey(parent)))}
        </div>
      ) : null}
      <ul className="flex flex-col gap-2" data-testid="run-arcade-history">
        {parentLineage ? renderLineage(parentLineage, false) : null}
        {rest.map((lineage) => renderLineage(lineage, true))}
      </ul>
      {hiddenKeys.length > 0 ? (
        <div>
          <Button type="button" variant="outline" size="xs" onClick={onRestore} data-testid="run-arcade-champion-restore">
            Voir les écartés
          </Button>
        </div>
      ) : null}
      {more ? (
        <div>
          <Button
            type="button"
            variant="outline"
            size="xs"
            onClick={onMore}
            disabled={paging}
            data-testid="run-arcade-champion-more"
          >
            {paging ? "Lecture…" : "Voir les vingt suivants"}
          </Button>
        </div>
      ) : null}
    </div>
  )
}

const SKILL_SELECT =
  "h-8 w-full rounded-lg border border-input bg-transparent px-2 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50"

const SPAN_LABEL: Record<SpanKind, string> = {
  bande: "de la bande",
  lignes: "entre les lignes",
  pas: "du dernier pas",
}

const FORME_LABEL: Record<Forme, string> = {
  triangle: "triangle",
  cercle: "cercle",
  polygone: "polygone",
  pythagore: "hypoténuse",
  sin: "sinus",
  tan: "tangente",
  arcsin: "arcsinus",
  arccos: "arccosinus",
  arctan: "arc tangente",
}

function parentEditKey(parent: ChampionRecord) {
  return `${parent.id ?? "local"}|${parent.generation}|${parent.runner}|${parent.savedAt}`
}

/** Copie les skills écrites à la main. Le champion déjà dans Neon n’est pas modifié. */
function withSkillEdits(parent: ChampionRecord, edits: Readonly<Record<string, Skill[]>>): ChampionRecord {
  const skills = edits[parentEditKey(parent)]
  if (!skills) return parent
  return {
    ...parent,
    skills: skills.map((skill) => ({
      ...skill,
      versions: skill.versions.map((version) => ({ ...version })),
    })),
  }
}

function shiftIso(iso: string, days: number) {
  const date = new Date(`${iso.slice(0, 10)}T12:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

/** Même fenêtre que le geste : les derniers tirages, ou les jours demandés. */
function sketchWindow(params: SkillParams, past: readonly { date: string }[]) {
  const last = past.length - 1
  if (last < 0) return { x1: 0, x2: 0 }
  if (params.days) {
    const from = shiftIso(past[last].date, -params.days)
    for (let index = 0; index <= last; index += 1) {
      if (past[index].date > from) return { x1: index, x2: last }
    }
  }
  const count = Math.min(past.length, Math.max(2, params.window))
  return { x1: last - count + 1, x2: last }
}

function draftFrom(version: SkillParams): SkillDraft {
  return {
    curve: version.curve,
    gesture: version.gesture,
    window: String(version.window),
    days: version.days == null ? "" : String(version.days),
    ratio: String(version.ratio),
    span: version.span,
    r: version.r == null ? "" : String(version.r),
    forme: version.forme ?? "",
    n: version.n == null ? "" : String(version.n),
  }
}

function cranChoices(forme: Forme): readonly number[] {
  if (!usesFigureN(forme)) return []
  if (forme === "polygone") return POLYGON_SIDES
  if (forme === "arctan") return ARCTAN_TURNS
  return WAVE_PERIODS
}

/**
 * Derniers points de la courbe, bande de la fenêtre, pointe du geste.
 * Le trait reprend le dessin déjà calculé quand la courbe est la même. Sinon les points viennent du passé déjà chargé. Pas d’appel à `think`.
 */
function SkillSketch({
  past,
  params,
  displayCurve,
  drawn,
}: {
  past: readonly RankPoint[]
  params: SkillParams
  displayCurve: CurveKey
  drawn: ThoughtDraw | null
}) {
  const key: CurveKey = params.curve === "*" ? displayCurve : params.curve
  const pastFirst = past[0]?.date ?? ""
  const pastLast = past[past.length - 1]?.date ?? ""
  if (past.length < 2) {
    return (
      <p
        className="text-xs text-muted-foreground"
        data-testid="run-arcade-skill-sketch"
        data-past-count={past.length}
        data-past-first={pastFirst}
        data-past-last={pastLast}
      >
        Pas assez de tirages pour montrer la fenêtre.
      </p>
    )
  }
  const rows = past.map(curveValues)
  const reuse = drawn && drawn.focus === key && drawn.trail.length === past.length ? drawn.trail : null
  const values = reuse ? reuse.map((point) => point.y) : rows.map((row) => row[key])
  const bounds = sketchWindow(params, past)
  const tip = tipFor(params, past, rows, key)
  const from = Math.max(0, Math.min(bounds.x1, bounds.x2 - 35))
  const xEnd = bounds.x2 + 1
  const shown = values.slice(from, bounds.x2 + 1)
  const ys = [...shown, tip].filter((value) => Number.isFinite(value))
  if (ys.length === 0) {
    return <p className="text-xs text-muted-foreground">La courbe ne se dessine pas.</p>
  }
  let lo = Math.min(...ys)
  let hi = Math.max(...ys)
  if (hi - lo < 1) {
    lo -= 0.5
    hi += 0.5
  }
  const pad = (hi - lo) * 0.08
  lo -= pad
  hi += pad
  const plot = { l: 8, r: 312, t: 10, b: 84 }
  const X = (x: number) => plot.l + ((x - from) / (xEnd - from || 1)) * (plot.r - plot.l)
  const Y = (y: number) => plot.b - ((y - lo) / (hi - lo || 1)) * (plot.b - plot.t)
  const points = shown.map((y, index) => `${X(from + index)},${Y(y)}`).join(" ")
  const bandX = X(bounds.x1)
  const bandW = Math.max(4, X(bounds.x2) - bandX)
  const lastY = values[bounds.x2]
  const scale = params.days ? `${params.days} jours` : `${params.window} tirages`
  return (
    <div>
      <svg
        viewBox="0 0 320 96"
        role="img"
        aria-label={`Fenêtre sur ${curveLabel(key)}`}
        data-testid="run-arcade-skill-sketch"
        data-curve={key}
        data-past-count={past.length}
        data-past-first={pastFirst}
        data-past-last={pastLast}
        data-window-start={bounds.x1}
        data-window-end={bounds.x2}
        className="h-24 w-full rounded-lg border border-border bg-canvas"
      >
        <rect x={bandX} y={plot.t} width={bandW} height={plot.b - plot.t} className="fill-chart-4/20 stroke-chart-4" strokeWidth="1">
          <title>{`fenêtre ${bounds.x1 + 1}–${bounds.x2 + 1}`}</title>
        </rect>
        <polyline points={points} className="stroke-foreground" strokeWidth="1.6" fill="none" />
        {Number.isFinite(lastY) && Number.isFinite(tip) ? (
          <line x1={X(bounds.x2)} y1={Y(lastY)} x2={X(xEnd)} y2={Y(tip)} className="stroke-chart-4" strokeWidth="1.4" />
        ) : null}
        {Number.isFinite(tip) ? (
          <circle cx={X(xEnd)} cy={Y(tip)} r="2.6" className="fill-chart-4">
            <title>{`pointe ${tip}`}</title>
          </circle>
        ) : null}
      </svg>
      <p className="mt-1 text-[11px] text-muted-foreground">
        {params.curve === "*" ? `Toutes les courbes, dessinées sur ${curveLabel(key)}.` : curveLabel(key)}
        {" · "}
        {scale}
      </p>
    </div>
  )
}

function formatTip(value: number) {
  const rounded = Math.round(value * 10) / 10
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1).replace(".", ",")
}

/** Nom, geste et poids sous le dessin du runner ouvert. Le trait fort est la pensée. */
function VersionLines({ strokes, thought }: { strokes: CurveStrokes; thought: number }) {
  return (
    <ul className="mt-2 flex flex-col gap-0.5 text-[11px] leading-4" data-testid="run-arcade-version-lines">
      {strokes.versions.map((item) => (
        <li key={item.id} data-testid="run-arcade-version-line" data-dashed={item.weight <= 0 ? "oui" : "non"}>
          <span className="text-foreground">{item.name}</span>
          <span className="text-muted-foreground">
            {" · "}
            {item.gestureLabel}
            {" · "}
            {item.label}
          </span>
        </li>
      ))}
      <li className="font-medium text-chart-4" data-testid="run-arcade-thought-line" data-tip={thought}>
        Pensée · {formatTip(thought)}
      </li>
    </ul>
  )
}

function versionLife(version: SkillVersion, hidden: string | null, lives: GestureLife | null) {
  const measured = lives?.measured[version.gesture] ?? false
  const source = measured ? "mesuré" : "course, faute d’expérience"
  const sourceKey = measured ? "mesure" : "course"
  const life = lives ? (lives.draws[version.gesture] ?? null) : null
  const dates = lives?.dates ?? []
  if (isBaseVersion(version)) {
    return { text: `naissance aucune · sans fin · ${source}`, state: "sans-fin", left: null as number | null, source: sourceKey }
  }
  const birth = version.cutoff ? formatShortDate(version.cutoff) : "aucune"
  const head = `naissance ${birth}`
  const used = drawsSinceBirth(dates, version.cutoff, hidden)
  const left = life == null ? null : life - used
  if (!versionAlive(version, hidden, life, dates)) {
    const blocked = Boolean(hidden && version.examTo && version.examTo >= hidden && version.cutoff < hidden)
    const unborn = Boolean(hidden && version.cutoff >= hidden)
    const word = blocked ? "écartée" : unborn ? "pas encore née" : "échue"
    const state = blocked ? "ecartee" : unborn ? "pas-nee" : "echue"
    return { text: `${head} · ${word} · ${source}`, state, left: 0, source: sourceKey }
  }
  const encore =
    left == null ? "" : left <= 1 ? " · joue encore 1 tirage" : ` · joue encore ${left} tirages`
  return { text: `${head}${encore} · ${source}`, state: "encore", left, source: sourceKey }
}

function versionLine(version: SkillVersion, plays: boolean, life: string) {
  return (
    <>
      v{version.version} · {version.origin} · coupure {version.cutoff ? formatShortDate(version.cutoff) : "aucune"}
      {version.examCents != null ? ` · examen ${formatCents(version.examCents)}` : ""}
      {version.examCents != null && version.examTo ? ` jusqu’au ${formatShortDate(version.examTo)}` : ""} · {version.phrase}
      {life ? ` · ${life}` : ""}
      {plays ? " · pose la grille" : ""}
    </>
  )
}

function SkillPanel({
  skills,
  past,
  drawn,
  displayCurve,
  hiddenDate,
  lives = null,
  editable,
  compact = false,
  blend = false,
  onWrite,
}: {
  skills: readonly Skill[]
  past: readonly RankPoint[]
  drawn: ThoughtDraw | null
  displayCurve: CurveKey
  hiddenDate: string | null
  lives?: GestureLife | null
  editable: boolean
  compact?: boolean
  /** Course avec Mélanger allumé. Le panneau du parent, avant Lancer, ne le reçoit pas. */
  blend?: boolean
  onWrite?: (skillId: string, params: SkillParams) => void
}) {
  const roster = skills.map((item) => item.id).join("\0")
  const [rosterSeen, setRosterSeen] = useState(roster)
  const [picked, setPicked] = useState(skills[0]?.id ?? "")
  if (roster !== rosterSeen) {
    setRosterSeen(roster)
    setPicked(skills[0]?.id ?? "")
  }
  const skill = skills.find((item) => item.id === picked) ?? skills[0] ?? null
  const shown = skill
    ? editable
      ? currentVersion(skill)
      : (playingVersion(skill, hiddenDate, lives) ?? activeVersion(skill, hiddenDate))
    : null
  const token = skill && shown ? `${skill.id}:${shown.version}:${editable ? "edit" : "lu"}` : ""
  const [seenToken, setSeenToken] = useState(token)
  const [draft, setDraft] = useState<SkillDraft>(() => (shown ? draftFrom(shown) : {}))
  if (token !== seenToken) {
    setSeenToken(token)
    setDraft(shown ? draftFrom(shown) : {})
  }
  const edited = editable ? boundSkillDraft(draft) : null
  const view = edited ?? shown
  const phrase = edited?.phrase ?? (shown ? describeSkill(shown) : "")
  const forme = (view?.forme ?? "triangle") as Forme
  const crans = view?.gesture === "figure" ? cranChoices(forme) : []
  const spans = view?.gesture === "suite" ? SUITE_SPANS : SPANS

  function setField(field: keyof SkillDraft, value: string) {
    setDraft((current) => ({ ...current, [field]: value }))
  }

  function blurNumber(field: "window" | "days" | "n") {
    const next = boundSkillDraft(draft)
    setDraft((current) => {
      if (field === "window") return { ...current, window: String(next.window) }
      if (field === "days") return { ...current, days: next.days == null ? "" : String(next.days) }
      return { ...current, n: next.n == null ? "" : String(next.n) }
    })
  }

  function commit() {
    if (!editable || !skill || !onWrite) return
    onWrite(skill.id, boundSkillDraft(draft))
  }

  function hint(raw: unknown, value: number | null) {
    if (!editable || value == null) return null
    const text = String(raw ?? "").trim()
    if (!text || text === String(value)) return null
    return <span className="text-[10px] text-muted-foreground">ramené à {value}</span>
  }

  if (skills.length === 0) {
    return <p className="text-xs text-muted-foreground">Aucune skill.</p>
  }

  return (
    <section
      className={cn("flex flex-col gap-2", !compact && "rounded-xl border bg-card p-3")}
      data-testid="run-arcade-skill-panel"
      data-readonly={editable ? "non" : "oui"}
    >
      <h3 className="text-xs font-medium text-muted-foreground">
        <TitleHelp help={RUN_ARCADE_HELP.skills}>{editable ? "Skills du parent" : "Skills et versions"}</TitleHelp>
      </h3>
      <p className="text-[11px] text-muted-foreground">
        {editable
          ? "La phrase suit les champs. Écrire ajoute une version, née au dernier tirage gratuit, et garde les précédentes."
          : blend
            ? "Lecture seule. Mélanger est allumé : la pensée est la moyenne des pointes. Un écart nul ne tire pas. Si tous les poids sont nuls, la plus récente pose la grille."
            : "Lecture seule. La version au solde le plus haut pose la grille. Les autres restent en masque."}
      </p>
      <div className={cn("gap-3", compact ? "flex flex-col" : "grid lg:grid-cols-[16rem_1fr]")}>
        <ul className="flex flex-col gap-1" data-testid="run-arcade-skill-list">
          {skills.map((item) => {
            const line = editable ? currentVersion(item) : (playingVersion(item, hiddenDate, lives) ?? activeVersion(item, hiddenDate))
            const on = item.id === skill?.id
            return (
              <li key={item.id}>
                <button
                  type="button"
                  aria-pressed={on}
                  data-testid="run-arcade-skill-row"
                  onClick={() => setPicked(item.id)}
                  className={cn(
                    "w-full rounded-md px-1.5 py-1 text-left text-xs",
                    on ? "bg-primary/10 text-foreground" : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <span className="font-medium">{item.name}</span>
                  {line ? (
                    <span>
                      {" "}
                      · {gesturePhrase(line.gesture)} · {targetLabel(line.curve)} · v{line.version}
                    </span>
                  ) : (
                    <span> · ne joue pas</span>
                  )}
                </button>
              </li>
            )
          })}
        </ul>
        {skill ? (
          <div className="flex flex-col gap-2">
            {view ? (
              <>
                <SkillSketch past={past} params={view} displayCurve={displayCurve} drawn={drawn} />
                <p className="text-sm leading-5" data-testid="run-arcade-skill-phrase" aria-live="polite">
                  {phrase}
                </p>
                <div className="flex flex-wrap items-end gap-2">
                  <label className="flex w-36 flex-col gap-1 text-[11px] text-muted-foreground">
                    <span>Courbe</span>
                    <select
                      aria-label="Courbe"
                      className={SKILL_SELECT}
                      disabled={!editable}
                      value={view.curve}
                      onChange={(event) => setField("curve", event.target.value)}
                    >
                      <option value="*">toutes les courbes</option>
                      {CURVE_KEYS.map((key) => (
                        <option key={key} value={key}>
                          {curveLabel(key)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="flex w-40 flex-col gap-1 text-[11px] text-muted-foreground">
                    <span>Geste</span>
                    <select
                      aria-label="Geste"
                      className={SKILL_SELECT}
                      disabled={!editable}
                      value={view.gesture}
                      onChange={(event) => setField("gesture", event.target.value)}
                    >
                      {GESTURES.map((gesture) => (
                        <option key={gesture} value={gesture}>
                          {gesturePhrase(gesture)}
                        </option>
                      ))}
                    </select>
                  </label>
                  {view.gesture === "soir" ? (
                    <p className="pb-2 text-xs text-muted-foreground" data-testid="run-arcade-skill-soir">
                      Le décalage reste quatre jours.
                    </p>
                  ) : (
                    <label className="flex w-28 flex-col gap-1 text-[11px] text-muted-foreground">
                      <span>Fenêtre</span>
                      <Input
                        type="number"
                        aria-label="Fenêtre"
                        min={WINDOW_MIN}
                        max={WINDOW_MAX}
                        disabled={!editable}
                        value={editable ? String(draft.window ?? "") : String(view.window)}
                        onChange={(event) => setField("window", event.target.value)}
                        onBlur={() => blurNumber("window")}
                      />
                      {hint(draft.window, edited?.window ?? null)}
                    </label>
                  )}
                  {view.gesture === "moyenne" || view.gesture === "figure" ? (
                    <label className="flex w-28 flex-col gap-1 text-[11px] text-muted-foreground">
                      <span>Jours</span>
                      <Input
                        type="number"
                        aria-label="Jours"
                        min={DAYS_MIN}
                        max={DAYS_MAX}
                        placeholder="aucun"
                        disabled={!editable}
                        value={editable ? String(draft.days ?? "") : view.days == null ? "" : String(view.days)}
                        onChange={(event) => setField("days", event.target.value)}
                        onBlur={() => blurNumber("days")}
                      />
                      {hint(draft.days, edited?.days ?? null)}
                    </label>
                  ) : null}
                  {view.gesture === "or" ? (
                    <label className="flex w-28 flex-col gap-1 text-[11px] text-muted-foreground">
                      <span>Ratio</span>
                      <select
                        aria-label="Ratio"
                        className={SKILL_SELECT}
                        disabled={!editable}
                        value={String(view.ratio)}
                        onChange={(event) => setField("ratio", event.target.value)}
                      >
                        {GOLDEN_RATIOS.map((ratio) => (
                          <option key={ratio} value={String(ratio)}>
                            {formatRatio(ratio)}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : null}
                  {view.gesture === "suite" ? (
                    <label className="flex w-24 flex-col gap-1 text-[11px] text-muted-foreground">
                      <span>R</span>
                      <select
                        aria-label="R"
                        className={SKILL_SELECT}
                        disabled={!editable}
                        value={String(view.r ?? 2)}
                        onChange={(event) => setField("r", event.target.value)}
                      >
                        {LOGISTIC_R.map((r) => (
                          <option key={r} value={String(r)}>
                            {formatRatio(r)}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : null}
                  {view.gesture === "or" || view.gesture === "suite" ? (
                    <label className="flex w-40 flex-col gap-1 text-[11px] text-muted-foreground">
                      <span>Étendue</span>
                      <select
                        aria-label="Étendue"
                        className={SKILL_SELECT}
                        disabled={!editable}
                        value={view.span}
                        onChange={(event) => setField("span", event.target.value)}
                      >
                        {spans.map((span) => (
                          <option key={span} value={span}>
                            {SPAN_LABEL[span]}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : null}
                  {view.gesture === "figure" ? (
                    <label className="flex w-36 flex-col gap-1 text-[11px] text-muted-foreground">
                      <span>Forme</span>
                      <select
                        aria-label="Forme"
                        className={SKILL_SELECT}
                        disabled={!editable}
                        value={forme}
                        onChange={(event) => setField("forme", event.target.value)}
                      >
                        {FORMES.map((item) => (
                          <option key={item} value={item}>
                            {FORME_LABEL[item]}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : null}
                  {crans.length > 0 ? (
                    <label className="flex w-24 flex-col gap-1 text-[11px] text-muted-foreground">
                      <span>Cran</span>
                      <select
                        aria-label="Cran"
                        className={SKILL_SELECT}
                        disabled={!editable}
                        value={String(view.n ?? crans[0])}
                        onChange={(event) => setField("n", event.target.value)}
                      >
                        {crans.map((n) => (
                          <option key={n} value={String(n)}>
                            {n}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : null}
                </div>
                {editable ? (
                  <div>
                    <Button type="button" size="sm" data-testid="run-arcade-skill-write" onClick={commit}>
                      Écrire cette version
                    </Button>
                  </div>
                ) : null}
              </>
            ) : (
              <p className="text-xs text-muted-foreground">Aucune version ne joue ce tirage.</p>
            )}
            <ul className="flex flex-col gap-1 text-xs text-muted-foreground" data-testid="run-arcade-skill-versions">
              {skill.versions.map((version) => {
                const life = versionLife(version, hiddenDate, lives)
                const mask = drawn?.masks.find(
                  (item) => item.version === version.version && (item.id === skill.id || item.id === `${skill.id}-v${version.version}`)
                )
                return (
                  <li
                    key={version.version}
                    data-origin={version.origin}
                    data-version={version.version}
                    data-life={life.state}
                    data-left={life.left ?? ""}
                    data-source={life.source}
                    data-plays={mask?.drives ? "oui" : "non"}
                    data-cents={mask?.cents ?? ""}
                  >
                    {versionLine(version, Boolean(mask?.drives) && life.state !== "pas-nee" && life.state !== "echue" && life.state !== "ecartee", life.text)}
                    {mask && !mask.drives && mask.cents != null && life.state !== "pas-nee" && life.state !== "echue" && life.state !== "ecartee"
                      ? ` · masque ${formatCents(mask.cents)}`
                      : ""}
                  </li>
                )
              })}
            </ul>
          </div>
        ) : null}
      </div>
    </section>
  )
}

/** La phrase suit la courbe. L’indice de la bande ne vaut que si le trait a les mêmes points. */
function tunnelOnDraw(past: readonly RankPoint[], key: CurveKey, trailLength: number): Tunnel | null {
  if (past.length < 2) return null
  const read = tunnelOf(past, key)
  if (read.hit && past.length !== trailLength) return { phrase: read.phrase, hit: null }
  return read
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
  const [blend, setBlend] = useState(false)
  const [selected, setSelected] = useState<string | null>(null)
  const [focusCurve, setFocusCurve] = useState<CurveKey | null>(null)
  const [nextCurve, setNextCurve] = useState<CurveKey>("sumNumbers")
  const [opened, setOpened] = useState<ChampionRecord | null>(null)
  const [lastFinished, setLastFinished] = useState<ChampionRecord | null>(null)
  const [imported, setImported] = useState<ChampionRecord | null>(null)
  const [history, setHistory] = useState<ChampionRecord[]>([])
  const [historyMore, setHistoryMore] = useState(false)
  const [pagingMore, setPagingMore] = useState(false)
  const hiddenKeys = useSyncExternalStore(subscribeHiddenChampions, hiddenChampionsSnapshot, hiddenChampionsServerSnapshot)
  const [skillEdits, setSkillEdits] = useState<Record<string, Skill[]>>({})
  const [importError, setImportError] = useState<string | null>(null)
  const [importOutcome, setImportOutcome] = useState<{ record: ChampionRecord; outcome: ImportOutcome } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => () => session.dispose(), [session])

  const listing = useRef(0)
  const historyPage = useRef(1)
  const paging = useRef(false)
  const refreshing = useRef(false)
  const refreshHistory = useCallback(() => {
    const ticket = (listing.current += 1)
    historyPage.current = 1
    paging.current = false
    refreshing.current = true
    void listChampions(1).then((items) => {
      if (ticket !== listing.current) return
      refreshing.current = false
      setHistory(items)
      setHistoryMore(items.length === CHAMPION_PAGE_SIZE && CHAMPION_PAGE_SIZE < CHAMPION_LIST_CEILING)
    })
  }, [])
  const loadMore = useCallback(() => {
    if (paging.current || refreshing.current) return
    const ticket = listing.current
    const next = historyPage.current + 1
    if ((next - 1) * CHAMPION_PAGE_SIZE >= CHAMPION_LIST_CEILING) return
    paging.current = true
    setPagingMore(true)
    void listChampions(next)
      .then((items) => {
        if (ticket !== listing.current) return
        historyPage.current = next
        setHistory((current) => {
          const seen = new Set(current.map((item) => championHideKey(item)))
          return [...current, ...items.filter((item) => !seen.has(championHideKey(item)))]
        })
        setHistoryMore(items.length === CHAMPION_PAGE_SIZE && next * CHAMPION_PAGE_SIZE < CHAMPION_LIST_CEILING)
      })
      .finally(() => {
        paging.current = false
        setPagingMore(false)
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
  const editedParent = useMemo(
    () => (parent ? withSkillEdits(parent, skillEdits) : null),
    [parent, skillEdits]
  )
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
  const lives = useMemo(() => lifeTable(parent ? [parent, ...history] : history, series, raceDraws), [parent, history, series, raceDraws])
  const historyTurns = useMemo(() => history.map((item) => championRaceTurns(item, series)), [history, series])
  const championTurns = snapshot.champion
    ? (race?.runners.find((runner) => runner.mind.name === snapshot.champion?.runner)?.turns ?? 0)
    : 0
  const bounds = useMemo(() => departBounds(series, raceDraws), [series, raceDraws])
  const shownDate = bounds.first ? (snapDepart(bounds.free, departDate || bounds.first) ?? bounds.first) : ""
  const previewFields = useMemo(
    () => settleFields(series, { count, draws: raceDraws, minutes, date: shownDate }, drafts),
    [series, count, raceDraws, minutes, shownDate, drafts]
  )
  const calendar = useMemo(() => {
    const trackNow = buildTrack(series)
    const start = raceStartIndex(trackNow.length, previewFields.draws)
    const free = trackNow.slice(0, start)
    const first = trackNow[start] ?? null
    const counts = calendarRead(free, departMode === "fixe" ? previewFields.date : "", first?.date ?? "")
    const past =
      departMode === "aleatoire" ? free.map((point) => ({ ...point })) : sincePast(free, previewFields.date)
    return { first, counts, past }
  }, [series, previewFields.draws, previewFields.date, departMode])
  const raceStart = race?.start
  const freeArchive = useMemo(
    () => (raceStart == null ? [] : track.slice(0, raceStart)),
    [track, raceStart]
  )

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
    const thought = think(focus.mind, past, {
      hiddenDate: track[shown]?.date,
      focus: curve,
      life: snapshot.lives ?? lives,
      blend: race.blend,
    })
    const revealed = race.revealed
    return {
      draw: thought.draw,
      matched: revealed ? matchedKeys(thought.cases, revealed) : [],
      exact: revealed ? exactKeys(thought.cases, revealed) : [],
    }
  }, [focus, focusCurve, race, track, lives, snapshot.lives])

  const runnerPast = useMemo(() => {
    if (!focus || !race || track.length === 0) return [] as RankPoint[]
    const shown = race.revealed ? race.cursor - 1 : race.cursor
    return sincePast(revealedPast(track, shown), focus.since)
  }, [focus, race, track])

  const focusStrokes = useMemo(() => {
    if (!running || !focus || runnerPast.length < 2) return null
    return curveStrokes({
      mind: focus.mind,
      past: runnerPast,
      curve: focusCurve ?? focus.mind.focus,
      hiddenDate,
      life: snapshot.lives ?? lives,
    })
  }, [running, focus, runnerPast, focusCurve, hiddenDate, snapshot.lives, lives])

  const focusTunnel = useMemo(() => {
    if (!focus || !focusView?.draw) return null
    return tunnelOnDraw(runnerPast, focusCurve ?? focus.mind.focus, focusView.draw.trail.length)
  }, [focus, focusView, runnerPast, focusCurve])

  const runnerTunnels = useMemo(() => {
    const map = new Map<string, Tunnel>()
    if (!race || track.length === 0) return map
    const shown = race.revealed ? race.cursor - 1 : race.cursor
    const revealed = revealedPast(track, shown)
    for (const runner of race.runners) {
      if (!runner.thought) continue
      const past = sincePast(revealed, runner.since)
      const read = tunnelOnDraw(past, runner.mind.focus, runner.thought.trail.length)
      if (read) map.set(runner.mind.id, read)
    }
    return map
  }, [race, track])

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
    session.launch({
      count: values.count,
      draws: values.draws,
      minutes: values.minutes,
      series,
      champion: editedParent,
      depart,
      lives,
      blend,
    })
  }

  function writeSkillVersion(skillId: string, params: SkillParams) {
    if (!parent) return
    const birth = calendar.past[calendar.past.length - 1]?.date ?? ""
    const key = parentEditKey(parent)
    setSkillEdits((current) => {
      const skills = current[key] ?? parent.skills
      return {
        ...current,
        [key]: skills.map((item) =>
          item.id === skillId ? addVersion(item, params, { cutoff: birth, origin: "main", examCents: null }) : item
        ),
      }
    })
  }

  const proposal = useMemo(
    () => (editedParent && series.length >= 2 ? proposeNextDraw(editedParent, series, nextCurve, lives) : null),
    [editedParent, series, nextCurve, lives]
  )
  const nextTunnel = useMemo(() => {
    if (!proposal?.draw) return null
    return tunnelOnDraw(buildTrack(series), nextCurve, proposal.draw.trail.length)
  }, [proposal, series, nextCurve])
  const forecastText = useMemo(
    () => forecastLine(scoreForecasts(editedParent ? [editedParent, ...history] : history, series)),
    [editedParent, history, series]
  )
  const showResult = snapshot.phase === "idle" || snapshot.phase === "fin"
  const replay = useMemo(
    () => (showResult && editedParent ? replayLastGrid(editedParent, series, "sumNumbers", lives) : null),
    [showResult, editedParent, series, lives]
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
        if (outcome.state === "écrit") refreshHistory()
      })
    }
    reader.readAsText(file)
  }

  const focusJournal = focus
    ? snapshot.journal.filter((entry) => entry.runner === focus.mind.id).slice(-8).reverse()
    : []

  const selectRunner = useCallback((id: string) => {
    setSelected(id)
    setFocusCurve(null)
  }, [])

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
        {calendar.first ? (
          <p
            className="mb-2 max-w-md self-end text-xs leading-4 text-muted-foreground"
            data-testid="run-arcade-calendar"
            data-mode={departMode}
            data-race-date={calendar.first.date}
            data-read={calendar.counts.read}
            data-dropped={calendar.counts.dropped}
            data-days={calendar.counts.days}
          >
            {calendarSentence(calendar.counts, formatDrawDate(calendar.first.date), departMode === "aleatoire")}
          </p>
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
        <HelpWrap help={RUN_ARCADE_HELP.melanger}>
          <Button
            type="button"
            variant="outline"
            aria-pressed={blend}
            disabled={running}
            data-testid="run-arcade-blend"
            className={cn(blend && "border-chart-4 text-chart-4")}
            onClick={() => setBlend((value) => !value)}
          >
            Mélanger
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
              // Le fichier reste le champion déjà enregistré. La version écrite à la main n’y entre pas.
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
          <p
            className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-foreground"
            role="status"
            data-testid="run-arcade-ia-banner"
          >
            {iaUsedLabel(
              snapshot.iaModel,
              snapshot.iaModel
                ? serviceText(
                    snapshot.ia,
                    snapshot.iaError,
                    snapshot.iaVision ? "prête, le dessin part avec l’appel" : "prête"
                  )
                : null
            )}
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
            {` ${snapshot.setAside} version(s) écrite(s), ou gardée(s) par un examen, le jour du premier tirage caché ou après restent de côté.`}
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
          refreshHistory()
        }}
      />

      {parent || history.length > 0 ? (
        <ChampionArchive
          parent={parent}
          history={history}
          historyTurns={historyTurns}
          series={series}
          hiddenKeys={hiddenKeys}
          more={historyMore}
          paging={pagingMore}
          onChoose={(item) => {
            setImportError(null)
            setImported(item)
          }}
          onHide={(item) => {
            hideChampion(item)
          }}
          onRestore={() => {
            restoreHiddenChampions()
          }}
          onMore={loadMore}
        />
      ) : null}

      {!running && parent ? (
        <SkillPanel
          key={parentEditKey(parent)}
          skills={skillEdits[parentEditKey(parent)] ?? parent.skills}
          past={calendar.past}
          drawn={proposal?.draw ?? null}
          displayCurve={nextCurve}
          hiddenDate={calendar.first?.date ?? null}
          lives={lives}
          editable
          onWrite={writeSkillVersion}
        />
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
          {forecastText ? (
            <p className="mb-2 text-xs text-muted-foreground" data-testid="run-arcade-forecast">
              {forecastText}
            </p>
          ) : null}
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
              <RunnerUniverse runnerId="champion-next" thought={proposal.draw} className="h-64" tunnel={nextTunnel} />
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
            Lu sur toute l’archive révélée, jusqu’au {formatDrawDate(proposal.draw.seenDate)}, version écrite à la main
            comprise. Le tirage suivant n’est pas dans la base. Neon n’est pas réécrit. Lancer reprend ce champion pour
            la génération suivante.
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
        <li className="text-chart-5">
          Tunnel : {TUNNEL_MIN_DAYS} à {TUNNEL_MAX_DAYS} jours
        </li>
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
            versions={running ? focusStrokes?.versions : null}
            thoughtTip={running && focusStrokes && focusView.draw ? focusView.draw.thoughtValue : null}
            tunnel={focusTunnel}
          />
          {running && focusStrokes && focusStrokes.versions.length > 0 && focusView.draw ? (
            <VersionLines strokes={focusStrokes} thought={focusView.draw.thoughtValue} />
          ) : null}
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
              {running ? (
                <SkillPanel
                  key={focus.mind.id}
                  skills={focus.mind.skills}
                  past={runnerPast}
                  drawn={focusView.draw}
                  displayCurve={focusCurve ?? focus.mind.focus}
                  hiddenDate={hiddenDate}
                  lives={snapshot.lives ?? lives}
                  editable={false}
                  compact
                  blend={race?.blend === true}
                />
              ) : (
                <>
                  <h3 className="mb-1 text-xs font-medium text-muted-foreground">
                    <TitleHelp help={RUN_ARCADE_HELP.skills}>Skills et versions</TitleHelp>
                  </h3>
                  <ul className="flex flex-col gap-1 text-xs">
                    {focus.mind.skills.map((skill) => (
                      <li key={skill.id}>
                        <span className="font-medium">{skill.name}</span>
                        <span className="text-muted-foreground"> · {targetLabel(currentVersion(skill).curve)}</span>
                        <ul className="ml-3">
                          {skill.versions.map((version) => {
                            const life = versionLife(version, hiddenDate, snapshot.lives ?? lives)
                            return (
                              <li key={version.version} className="text-muted-foreground" data-life={life.state}>
                                v{version.version} · {version.origin} · coupure{" "}
                                {version.cutoff ? formatShortDate(version.cutoff) : "aucune"}
                                {version.examCents != null ? ` · examen ${formatCents(version.examCents)}` : ""}
                                {version.examCents != null && version.examTo ? ` jusqu’au ${formatShortDate(version.examTo)}` : ""} ·{" "}
                                {version.phrase} · {life.text}
                              </li>
                            )
                          })}
                        </ul>
                      </li>
                    ))}
                  </ul>
                </>
              )}
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
        {race?.runners.map((runner) => (
          <RunnerCard
            key={runner.mind.id}
            runner={runner}
            active={runner.mind.id === selected}
            mark={xray ? xrayMark(runner.mind.id, snapshot.activity) : null}
            xray={xray}
            hiddenDate={hiddenDate}
            freeArchive={freeArchive}
            observationReport={observationReportFor(snapshot.observations, runner.thought?.observation)}
            onSelect={selectRunner}
            tunnel={runnerTunnels.get(runner.mind.id) ?? null}
          />
        ))}
      </div>
    </div>
  )
}
