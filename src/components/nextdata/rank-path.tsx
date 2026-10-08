import type { ReactNode } from "react"

import { TitleHelp, type HelpCopy } from "@/components/help"
import type { Arbitration, GapReading, RankReading } from "@/lib/nextdata/rank-path"
import { cn } from "@/lib/utils"

function fmt(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "—"
  const rounded = Math.round(value * 10) / 10
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1)
}

function WeightBar({ weights }: { weights: RankReading["weights"] }) {
  const parts = [
    { key: "chain", weight: weights.chain, color: "var(--chart-1)" },
    { key: "level", weight: weights.level, color: "var(--chart-2)" },
    { key: "delta", weight: weights.delta, color: "var(--chart-3)" },
  ]
  return (
    <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-muted" aria-hidden>
      {parts.map((part) => (
        <div key={part.key} style={{ width: `${Math.max(0, part.weight) * 100}%`, background: part.color }} />
      ))}
    </div>
  )
}

function ReadingColumn({ rank }: { rank: RankReading }) {
  return (
    <div className="flex min-w-[6.5rem] flex-1 flex-col gap-1">
      <p className="text-xs font-medium text-muted-foreground">{rank.rank}</p>
      <p className="text-xs tabular-nums">chaîne {fmt(rank.chain)}</p>
      <p className="text-xs tabular-nums">niveau {fmt(rank.level)}</p>
      <p className="text-xs tabular-nums">delta {fmt(rank.delta)}</p>
      <WeightBar weights={rank.weights} />
    </div>
  )
}

function GapColumn({ gap }: { gap: GapReading }) {
  return (
    <div className="flex min-w-[6.5rem] flex-1 flex-col gap-1">
      <p className="text-xs font-medium text-muted-foreground">{gap.name}</p>
      <p className="text-xs tabular-nums">
        {fmt(gap.blend)}
        <span className="text-muted-foreground"> → </span>
        {fmt(gap.clipped)}
      </p>
      <p className={cn("text-xs tabular-nums", gap.hit ? "text-destructive" : "text-muted-foreground")}>
        bande {fmt(gap.lo)}–{fmt(gap.hi)}
        {gap.hit ? " · bord" : ""}
      </p>
    </div>
  )
}

function Ball({ value, star }: { value: number | null; star?: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex size-9 items-center justify-center rounded-full text-sm font-semibold text-primary-foreground tabular-nums",
        star ? "bg-star" : "bg-primary"
      )}
    >
      {value == null ? "—" : value}
    </span>
  )
}

function SumLine({ trace }: { trace: Arbitration }) {
  return (
    <p className="text-xs tabular-nums text-muted-foreground">
      Somme visée {fmt(trace.sum_target)} · somme de la grille {fmt(trace.sum_grid)}
      {" · "}
      somme ★ visée {fmt(trace.star_sum_target)} · somme ★ de la grille {fmt(trace.star_sum_grid)}
    </p>
  )
}

function NarrowRank({ rank, gap, star }: { rank: RankReading; gap?: GapReading | null; star?: boolean }) {
  return (
    <div className="flex flex-col gap-1 border-b border-border py-2">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium">{rank.rank}</p>
          <p className="text-xs tabular-nums text-muted-foreground">
            chaîne {fmt(rank.chain)} · niveau {fmt(rank.level)} · delta {fmt(rank.delta)}
          </p>
          <WeightBar weights={rank.weights} />
          <p className="text-xs tabular-nums">tenu {fmt(rank.clipped)}</p>
        </div>
        <Ball value={rank.grid} star={star} />
      </div>
      {gap ? (
        <p className={cn("text-xs tabular-nums", gap.hit ? "text-destructive" : "text-muted-foreground")}>
          écart {gap.name} {fmt(gap.blend)} → {fmt(gap.clipped)} · bande {fmt(gap.lo)}–{fmt(gap.hi)}
          {gap.hit ? " · bord" : ""}
        </p>
      ) : null}
    </div>
  )
}

function Band({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{title}</h3>
      {children}
    </section>
  )
}

export function RankPath({ trace, help }: { trace: Arbitration | null | undefined; help: HelpCopy }) {
  if (!trace?.numbers?.length) return null
  const ranks = [...trace.numbers, ...trace.stars]
  const gaps = [...trace.gaps, trace.star_gap]
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium">
          <TitleHelp help={help}>Comment n1…n5 et e1, e2 sont obtenus</TitleHelp>
        </p>
        <p className="flex flex-wrap gap-3 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <span className="inline-block size-2 rounded-full" style={{ background: "var(--chart-1)" }} />
            chaîne
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="inline-block size-2 rounded-full" style={{ background: "var(--chart-2)" }} />
            niveau
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="inline-block size-2 rounded-full" style={{ background: "var(--chart-3)" }} />
            delta
          </span>
        </p>
      </div>

      <div className="flex flex-col md:hidden">
        {trace.numbers.map((rank, index) => (
          <NarrowRank key={rank.rank} rank={rank} gap={trace.gaps[index]} />
        ))}
        {trace.stars[0] ? <NarrowRank rank={trace.stars[0]} gap={trace.star_gap} star /> : null}
        {trace.stars[1] ? <NarrowRank rank={trace.stars[1]} star /> : null}
        <SumLine trace={trace} />
      </div>

      <div className="hidden flex-col gap-5 md:flex">
        <Band title="Trois lectures">
          <div className="flex gap-3">
            {ranks.map((rank) => (
              <ReadingColumn key={rank.rank} rank={rank} />
            ))}
          </div>
        </Band>

        <Band title="Écarts">
          <div className="flex gap-3">
            {gaps.map((gap) => (
              <GapColumn key={gap.name} gap={gap} />
            ))}
          </div>
        </Band>

        <Band title="Mélange tenu">
          <div className="flex gap-2">
            {ranks.map((rank) => (
              <div key={rank.rank} className="flex min-w-[6.5rem] flex-1 flex-col items-start gap-1">
                <p className="text-xs text-muted-foreground">{rank.rank}</p>
                <p className="text-sm font-medium tabular-nums">{fmt(rank.clipped)}</p>
              </div>
            ))}
          </div>
        </Band>

        <Band title="Grille">
          <div className="flex items-center gap-3">
            {trace.numbers.map((rank) => (
              <div key={rank.rank} className="flex min-w-[6.5rem] flex-1 flex-col items-start gap-1">
                <p className="text-xs text-muted-foreground">{rank.rank}</p>
                <Ball value={rank.grid} />
              </div>
            ))}
            <span className="text-muted-foreground">+</span>
            {trace.stars.map((rank) => (
              <div key={rank.rank} className="flex min-w-[6.5rem] flex-1 flex-col items-start gap-1">
                <p className="text-xs text-muted-foreground">{rank.rank}</p>
                <Ball value={rank.grid} star />
              </div>
            ))}
          </div>
          <SumLine trace={trace} />
        </Band>
      </div>
    </div>
  )
}
