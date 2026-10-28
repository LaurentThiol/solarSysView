"use client"

import { useEffect, useMemo, useRef, useState } from "react"

import { RunnerUniverse } from "@/components/brain/run-arcade-universe"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { formatDrawDate, toDrawSeries, type Draw } from "@/lib/draws"
import {
  RUNNER_DEFAULT,
  RUNNER_MAX,
  createRace,
  formatCents,
  formatRatio,
  leaderOf,
  playTurn,
  type Race,
  type RankPoint,
} from "@/lib/run-arcade/thought"
import { useDraws } from "@/lib/use-draws"
import { cn } from "@/lib/utils"

const LENGTH_DEFAULT = 24

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

export function RunArcadeLab() {
  const { draws, loading } = useDraws("all")
  const series = useMemo(() => toRankPoints(draws), [draws])
  const [track, setTrack] = useState<RankPoint[]>([])
  const [count, setCount] = useState(RUNNER_DEFAULT)
  const [length, setLength] = useState(LENGTH_DEFAULT)
  const [race, setRace] = useState<Race | null>(null)
  const [playing, setPlaying] = useState(false)
  const [selected, setSelected] = useState<string | null>(null)
  const booted = useRef(false)

  function launch(nextCount = count, nextLength = length) {
    if (series.length < 4) return
    setTrack(series)
    setRace(playTurn(createRace(nextCount, series.length, nextLength), series))
    setPlaying(false)
    setSelected(null)
  }

  useEffect(() => {
    if (booted.current || series.length < 4) return
    booted.current = true
    setTrack(series)
    setRace(playTurn(createRace(RUNNER_DEFAULT, series.length, LENGTH_DEFAULT), series))
  }, [series])

  useEffect(() => {
    if (!playing || track.length < 4 || race?.done) return
    const id = window.setInterval(() => {
      setRace((current) => {
        if (!current || current.done) return current
        return playTurn(current, track)
      })
    }, 700)
    return () => window.clearInterval(id)
  }, [playing, track, race?.done])

  const leader = race ? leaderOf(race.runners) : null
  const played = race ? race.cursor - race.start : 0
  const total = race ? race.end - race.start : 0
  const focus = race?.runners.find((runner) => runner.mind.id === selected) ?? null
  const maxLength = Math.max(4, series.length - 2)

  return (
    <div className="flex flex-col gap-4">
      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(event) => {
          event.preventDefault()
          launch()
        }}
      >
        <label className="flex w-24 flex-col gap-1 text-xs text-muted-foreground">
          Runners
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
        </label>
        <label className="flex w-24 flex-col gap-1 text-xs text-muted-foreground">
          Tours
          <Input
            type="number"
            min={4}
            max={maxLength}
            value={length}
            aria-label="Nombre de tours"
            onChange={(event) => {
              const value = Number(event.target.value)
              if (Number.isFinite(value)) setLength(Math.min(maxLength, Math.max(4, Math.round(value))))
            }}
          />
        </label>
        <Button type="submit">Lancer</Button>
        <Button
          type="button"
          variant="outline"
          disabled={!race || race.done}
          onClick={() => {
            setPlaying(false)
            setRace((current) => (current ? playTurn(current, track) : current))
          }}
        >
          Tour
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={!race || race.done}
          onClick={() => setPlaying((value) => !value)}
        >
          {playing && !race?.done ? "Pause" : "Lecture"}
        </Button>
        <p className="pb-1 text-sm text-muted-foreground">
          {loading && series.length < 4
            ? "Archive en cours de lecture."
            : race
              ? `Tour ${played} / ${total}${leader ? ` · meilleur ${leader.mind.name} ${formatCents(leader.cents)}` : ""}`
              : "Choisissez le nombre de runners, puis lancez."}
        </p>
      </form>

      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <li className="text-chart-2">Tangente, en pointillés</li>
        <li className="text-chart-1">Rayon vers le nombre d’or</li>
        <li className="text-chart-3">Vecteur du pas</li>
        <li className="text-chart-4">Projection du rang</li>
        <li>Rail : n1–n5 et e1–e2 annoncés</li>
      </ul>

      {race?.seenDate ? (
        <p className="text-sm text-muted-foreground">
          Passé révélé jusqu’au {formatDrawDate(race.seenDate)}. Le tirage du tour reste caché pendant le dessin.
        </p>
      ) : null}

      {race?.revealed ? (
        <p className="text-sm">
          Arbitre · {formatDrawDate(race.revealed.date)} · {race.revealed.n1} {race.revealed.n2}{" "}
          {race.revealed.n3} {race.revealed.n4} {race.revealed.n5}
          <span className="text-muted-foreground"> ★ {race.revealed.e1} {race.revealed.e2}</span>
        </p>
      ) : null}

      {focus?.thought ? (
        <section className="rounded-xl border border-primary/50 bg-card p-3">
          <header className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-sm font-medium">
              {focus.mind.name} · {focus.mind.focus} · {formatRatio(focus.mind.ratio)} · {focus.mind.span}
            </h2>
            <p className="text-sm">{formatCents(focus.cents)}</p>
          </header>
          <RunnerUniverse
            runnerId={`${focus.mind.id}-focus`}
            thought={focus.thought}
            matched={focus.matched}
            className="h-72"
          />
          <p className="mt-2 text-sm leading-5">{focus.thought.phrase}</p>
        </section>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        {race?.runners.map((runner) => {
          const active = runner.mind.id === selected
          return (
            <button
              key={runner.mind.id}
              type="button"
              onClick={() => setSelected(runner.mind.id)}
              className={cn(
                "rounded-xl border bg-card p-2 text-left transition-colors hover:border-foreground/30",
                active ? "border-primary" : "border-border",
                !runner.alive && "opacity-60"
              )}
            >
              <span className="flex items-baseline justify-between gap-2 text-xs">
                <span className="font-medium text-foreground">{runner.mind.name}</span>
                <span className="text-muted-foreground">{formatCents(runner.cents)}</span>
              </span>
              <span className="mt-0.5 block text-[11px] text-muted-foreground">
                {runner.mind.focus} · {formatRatio(runner.mind.ratio)} · {runner.mind.motion}
                {runner.alive ? "" : " · arrêté"}
              </span>
              <RunnerUniverse
                runnerId={runner.mind.id}
                thought={runner.thought}
                matched={runner.matched}
                className="mt-1"
              />
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
