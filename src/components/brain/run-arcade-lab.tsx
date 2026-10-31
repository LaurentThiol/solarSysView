"use client"

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react"

import { captureDraw } from "@/components/brain/run-arcade-capture"
import { RunnerUniverse } from "@/components/brain/run-arcade-universe"
import { HelpTip, HelpWrap, LabelHelp, TitleHelp } from "@/components/help"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { formatDrawDate, formatShortDate, toDrawSeries, type Draw } from "@/lib/draws"
import { lastRevealedDraw, proposeNextDraw, type ChampionRecord } from "@/lib/run-arcade/champion"
import { askBrave, askIa, exportChampion, listChampions, loadChampion, readChampionFile, saveChampion } from "@/lib/run-arcade/client"
import { formatDuration, raceDurationMs, servedPerSlice } from "@/lib/run-arcade/clock"
import { CURVE_KEYS, curveLabel, curveValues, type CurveKey, type RankPoint } from "@/lib/run-arcade/curves"
import { RUN_ARCADE_HELP } from "@/lib/run-arcade/help"
import { createSession, type ServiceState, type SessionSnapshot } from "@/lib/run-arcade/session"
import { currentVersion, targetLabel } from "@/lib/run-arcade/skills"
import {
  activityLines,
  attemptLine,
  chainHiddenDate,
  lastTurnReceipts,
  prepHeadline,
  thoughtChain,
  xrayFeed,
  xrayMark,
} from "@/lib/run-arcade/xray"
import {
  exactKeys,
  formatCents,
  leaderOf,
  matchedKeys,
  RACE_DRAWS_DEFAULT,
  revealedPast,
  RUNNER_DEFAULT,
  RUNNER_MAX,
  think,
  type RunnerLive,
  type ThoughtDraw,
} from "@/lib/run-arcade/thought"
import { useDraws } from "@/lib/use-draws"
import { cn } from "@/lib/utils"

const MINUTES_DEFAULT = 10
const MINUTES_MAX = 120

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

const clock = (() => {
  let value = 0
  let timer: number | null = null
  const listeners = new Set<() => void>()
  return {
    subscribe(listener: () => void) {
      listeners.add(listener)
      if (timer == null) {
        value = Date.now()
        timer = window.setInterval(() => {
          value = Date.now()
          for (const item of listeners) item()
        }, 500)
      }
      return () => {
        listeners.delete(listener)
        if (listeners.size === 0 && timer != null) {
          window.clearInterval(timer)
          timer = null
        }
      }
    },
    get: () => value,
    server: () => 0,
  }
})()

function serviceText(state: ServiceState, error: string | null, ok: string) {
  if (state === "ok") return ok
  if (state === "absente") return `absente${error ? ` (${error})` : ""}`
  return error ? `en attente (${error})` : "en attente"
}

function phaseText(snapshot: SessionSnapshot, remaining: number | null) {
  const race = snapshot.race
  if (snapshot.error) return snapshot.error
  if (!race) {
    return "Choisissez le nombre de runners, les tirages de course et les minutes d’avant-course. Rayons X, avant de lancer, montre la préparation et chaque tour."
  }
  const total = race.end - race.start
  const pause = snapshot.pausedLeftMs != null ? " · en pause" : ""
  const left = remaining != null ? formatDuration(remaining) : "—"
  if (snapshot.phase === "avant") return `Génération ${snapshot.generation} · avant-course, ${left} restantes${pause}`
  if (snapshot.phase === "course") {
    const tour = `Génération ${snapshot.generation} · tour ${race.cursor - race.start + 1} / ${total}`
    return snapshot.minutes > 0 ? `${tour}, tranche ${left}${pause}` : `${tour}${pause}`
  }
  if (snapshot.phase === "fin") {
    const champion = snapshot.champion
    return champion
      ? `Génération ${snapshot.generation} finie · champion ${champion.runner} ${formatCents(champion.cents)}`
      : `Génération ${snapshot.generation} finie`
  }
  return ""
}

function skillSummary(runner: RunnerLive) {
  return runner.mind.skills
    .map((skill) => {
      const version = currentVersion(skill)
      return `${version.curve === "*" ? "tout" : curveLabel(version.curve)} v${version.version}`
    })
    .join(" · ")
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
              <li key={line}>{line}</li>
            ))}
          </ul>
        ) : (
          <p className="mt-1 text-xs text-muted-foreground">Personne en cours.</p>
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

export function RunArcadeLab() {
  const { draws, loading } = useDraws("all")
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
  const now = useSyncExternalStore(clock.subscribe, clock.get, clock.server)
  const [count, setCount] = useState(RUNNER_DEFAULT)
  const [raceDraws, setRaceDraws] = useState(RACE_DRAWS_DEFAULT)
  const [minutes, setMinutes] = useState(MINUTES_DEFAULT)
  const [xray, setXray] = useState(false)
  const [selected, setSelected] = useState<string | null>(null)
  const [focusCurve, setFocusCurve] = useState<CurveKey | null>(null)
  const [nextCurve, setNextCurve] = useState<CurveKey>("sumNumbers")
  const [stored, setStored] = useState<ChampionRecord | null>(null)
  const [imported, setImported] = useState<ChampionRecord | null>(null)
  const [history, setHistory] = useState<ChampionRecord[]>([])
  const [importError, setImportError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => () => session.dispose(), [session])

  useEffect(() => {
    let alive = true
    void loadChampion().then((record) => {
      if (alive) setStored(record)
    })
    void listChampions().then((items) => {
      if (alive) setHistory(items)
    })
    return () => {
      alive = false
    }
  }, [])

  const race = snapshot.race
  const track = snapshot.track
  const parent = imported ?? snapshot.champion ?? stored
  const running = snapshot.phase === "avant" || snapshot.phase === "course"
  const remaining =
    snapshot.pausedLeftMs ?? (snapshot.phaseEndsAt != null && now > 0 ? Math.max(0, snapshot.phaseEndsAt - now) : null)
  const leader = race ? leaderOf(race.runners) : null
  const focus = race?.runners.find((runner) => runner.mind.id === selected) ?? null
  const hiddenDate = race ? chainHiddenDate(race, track) : null
  const slice = snapshot.minutes > 0 ? snapshot.sliceMs : 0
  const served = servedPerSlice(slice, snapshot.medianMs, 1)
  const maxDraws = Math.max(4, Math.min(120, series.length - 2))
  const newestYear = track.length ? Number(track[track.length - 1].date.slice(0, 4)) : null

  const focusView = useMemo(() => {
    if (!focus || !race || track.length === 0) return null
    const curve = focusCurve ?? focus.mind.focus
    if (curve === focus.mind.focus || !focus.thought) {
      return { draw: focus.thought, matched: focus.matched, exact: focus.exact }
    }
    const shown = race.revealed ? race.cursor - 1 : race.cursor
    const past = revealedPast(track, shown)
    if (past.length < 2) return { draw: focus.thought, matched: focus.matched, exact: focus.exact }
    const thought = think(focus.mind, past, { hiddenDate: track[shown]?.date, focus: curve })
    const revealed = race.revealed
    return {
      draw: thought.draw,
      matched: revealed ? matchedKeys(thought.cases, revealed) : [],
      exact: revealed ? exactKeys(thought.cases, revealed) : [],
    }
  }, [focus, focusCurve, race, track])

  function launch() {
    if (series.length < 4) return
    setSelected(null)
    setFocusCurve(null)
    setImported(null)
    session.launch({ count, draws: raceDraws, minutes, series, champion: parent })
  }

  const proposal = useMemo(
    () => (parent && series.length >= 2 ? proposeNextDraw(parent, series, nextCurve) : null),
    [parent, series, nextCurve]
  )
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
      void saveChampion(record)
    }
    reader.readAsText(file)
  }

  const focusJournal = focus
    ? snapshot.journal.filter((entry) => entry.runner === focus.mind.id).slice(-8).reverse()
    : []

  return (
    <div className="flex flex-col gap-4">
      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(event) => {
          event.preventDefault()
          launch()
        }}
      >
        <LabelHelp label="Runners" help={RUN_ARCADE_HELP.runners} className="w-24 sm:w-24">
          <Input
            type="number"
            min={1}
            max={RUNNER_MAX}
            value={count}
            aria-label="Nombre de runners"
            onChange={(event) => {
              const value = Number(event.target.value)
              if (Number.isFinite(value)) setCount(Math.min(RUNNER_MAX, Math.max(1, Math.round(value))))
            }}
          />
        </LabelHelp>
        <LabelHelp label="Tirages" help={RUN_ARCADE_HELP.tirages} className="w-24 sm:w-24">
          <Input
            type="number"
            min={4}
            max={maxDraws}
            value={raceDraws}
            aria-label="Tirages de course"
            onChange={(event) => {
              const value = Number(event.target.value)
              if (Number.isFinite(value)) setRaceDraws(Math.min(maxDraws, Math.max(4, Math.round(value))))
            }}
          />
        </LabelHelp>
        <LabelHelp label="Minutes" help={RUN_ARCADE_HELP.minutes} className="w-24 sm:w-24">
          <Input
            type="number"
            min={0}
            max={MINUTES_MAX}
            step={0.5}
            value={minutes}
            aria-label="Minutes d’avant-course"
            onChange={(event) => {
              const value = Number(event.target.value)
              if (Number.isFinite(value)) setMinutes(Math.min(MINUTES_MAX, Math.max(0, Math.round(value * 2) / 2)))
            }}
          />
        </LabelHelp>
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
          <Button type="submit" disabled={series.length < 4}>
            Lancer
          </Button>
        </HelpWrap>
        <HelpWrap help={RUN_ARCADE_HELP.pause}>
          <Button
            type="button"
            variant="outline"
            disabled={!running}
            onClick={() => (snapshot.pausedLeftMs != null ? session.resume() : session.pause())}
          >
            {snapshot.pausedLeftMs != null ? "Reprendre" : "Pause"}
          </Button>
        </HelpWrap>
        <HelpWrap help={RUN_ARCADE_HELP.tour}>
          <Button type="button" variant="outline" disabled={!running} onClick={() => session.skip()}>
            {snapshot.phase === "avant" ? "Passer à la course" : "Jouer le tour"}
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
        <p className="text-foreground">
          {loading && series.length < 4 ? "Archive en cours de lecture." : phaseText(snapshot, remaining)}
          {leader && snapshot.phase === "course" ? ` · meilleur ${leader.mind.name} ${formatCents(leader.cents)}` : ""}
          <HelpTip {...RUN_ARCADE_HELP.statut} />
        </p>
        {race && newestYear ? (
          <p>
            Archive gratuite : années {newestYear - 1} et {newestYear}, du {formatDrawDate(track[0].date)} au{" "}
            {formatDrawDate(track[race.start - 1].date)}. Course : {race.end - race.start} tirages, du{" "}
            {formatDrawDate(track[race.start].date)} au {formatDrawDate(track[race.end - 1].date)}.
            <HelpTip {...RUN_ARCADE_HELP.archive} />
          </p>
        ) : null}
        {race ? (
          <p>
            {snapshot.minutes > 0 ? (
              <>
                Horloge : {formatDuration(snapshot.minutes * 60_000)} d’avant-course, tranche de {formatDuration(slice)}{" "}
                par tour, course de {formatDuration(raceDurationMs(race.end - race.start, slice))}.
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
            IA locale : {serviceText(snapshot.ia, snapshot.iaError, snapshot.iaVision ? "prête, vision comprise" : "prête")} ·
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
              ? ` ${snapshot.setAside} version(s) écrite(s) le jour du premier tirage caché ou après restent de côté.`
              : ""}
            <HelpTip {...RUN_ARCADE_HELP.generation} />
          </p>
        ) : null}
      </div>

      {history.length > 0 ? (
        <div className="flex flex-col gap-1">
          <h2 className="text-xs font-medium text-muted-foreground">
            <TitleHelp help={RUN_ARCADE_HELP.champions}>Champions déjà écrits</TitleHelp>
          </h2>
          <ul className="flex flex-col gap-1" data-testid="run-arcade-history">
            {history.map((item) => {
              const active =
                parent?.generation === item.generation &&
                parent.runner === item.runner &&
                parent.savedAt === item.savedAt
              return (
                <li key={`${item.generation}-${item.runner}-${item.savedAt}`}>
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
                    Génération {item.generation} · {item.runner} · course {formatCents(item.cents)}
                    {item.examCents != null ? ` · examen ${formatCents(item.examCents)}` : ""}
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
              course {formatCents(parent.cents)}
              {parent.examCents != null ? ` · examen ${formatCents(parent.examCents)}` : ""}
            </p>
          </header>
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
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1.4fr)_minmax(16rem,0.8fr)]">
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
            </div>
            {persisted ? (
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
        <li className="text-chart-2">Tangente, en pointillés</li>
        <li className="text-chart-1">Rayon vers le nombre d’or</li>
        <li className="text-chart-3">Pas d’avant</li>
        <li className="text-chart-4">Vecteur : la pensée</li>
        <li>Trait fin : rappel à la somme</li>
        <li className="text-chart-4">Projection : la case jouée</li>
        <li>Rail : sommes et décennies à gauche, rangs à droite</li>
        <li className="inline-flex items-center gap-1 text-[var(--ok)]">
          Numéro ou étoile trouvé : +2 €
          <HelpTip {...RUN_ARCADE_HELP.solde} />
        </li>
        <li className="text-chart-2">Somme ou décennie juste</li>
      </ul>

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
              {formatCents(focus.cents)}
              <span className="text-muted-foreground">
                {" "}
                · examen {focus.examCents == null ? "—" : formatCents(focus.examCents)} · {focus.calls} appel(s)
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
          {focusView.draw ? <p className="mt-2 text-sm leading-5">{focusView.draw.phrase}</p> : null}
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
                          {version.examCents != null ? ` · examen ${formatCents(version.examCents)}` : ""} ·{" "}
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
          return (
            <button
              key={runner.mind.id}
              type="button"
              onClick={() => {
                setSelected(runner.mind.id)
                setFocusCurve(null)
              }}
              className={cn(
                "rounded-xl border bg-card p-2 text-left transition-colors hover:border-foreground/30",
                active ? "border-primary" : "border-border",
                mark && "ring-1 ring-chart-4",
                !runner.alive && "opacity-60"
              )}
            >
              <span className="flex items-baseline justify-between gap-2 text-xs">
                <span className="font-medium text-foreground">{runner.mind.name}</span>
                <span className="text-muted-foreground">
                  {mark ? <span className="text-chart-4">{mark} · </span> : null}
                  {formatCents(runner.cents)}
                </span>
              </span>
              <span className="mt-0.5 block text-[11px] text-muted-foreground">
                {curveLabel(runner.mind.focus)} · {skillSummary(runner)} · examen{" "}
                {runner.examCents == null ? "—" : formatCents(runner.examCents)} · {runner.calls} appel(s)
                {runner.alive ? "" : " · arrêté"}
              </span>
              <RunnerUniverse
                runnerId={runner.mind.id}
                thought={runner.thought}
                matched={runner.matched}
                exact={runner.exact}
                className="mt-1"
              />
              {xray ? <ThoughtChain runner={runner} draw={runner.thought} hiddenDate={hiddenDate} /> : null}
              <span className="mt-1 block text-[11px] leading-4 text-muted-foreground">
                {runner.thought?.phrase ?? "—"}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
