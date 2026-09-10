"use client"

import { useMemo, useState } from "react"
import { Bar, BarChart, CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts"

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  Disclaimer,
  OverlayToggle,
  Stat,
  formatStat,
} from "@/components/analysis/shared"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  type AnalysisDraw,
  type BallRow,
  type VariableName,
  ballBoard,
  series,
} from "@/lib/analysis"
import { formatDrawDate, formatShortDate } from "@/lib/draws"
import { cn } from "@/lib/utils"

type Filter = "all" | "even" | "odd"
type SortKey = "value" | "count" | "delayDraws"

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "Tous" },
  { id: "even", label: "Pairs" },
  { id: "odd", label: "Impairs" },
]

function matchesFilter(row: BallRow, filter: Filter) {
  if (filter === "even") return row.even
  if (filter === "odd") return !row.even
  return true
}

function heatStyle(count: number, max: number, even: boolean) {
  const t = max > 0 ? count / max : 0
  const color = even ? "var(--chart-1)" : "var(--chart-2)"
  return {
    backgroundColor: `color-mix(in oklch, ${color} ${Math.round(14 + t * 62)}%, transparent)`,
  }
}

export function NumbersPanel({
  draws,
  ball,
  onSelectBall,
  onAnalyze,
}: {
  draws: AnalysisDraw[]
  ball: number
  onSelectBall: (n: number) => void
  onAnalyze: (variable: Extract<VariableName, "hit" | "delay">, n: number) => void
}) {
  const [filter, setFilter] = useState<Filter>("all")
  const [sortKey, setSortKey] = useState<SortKey>("value")
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc")

  const board = useMemo(() => ballBoard(draws), [draws])
  const maxCount = useMemo(
    () => Math.max(0, ...board.balls.map((row) => row.count)),
    [board.balls]
  )
  const selected = board.balls.find((row) => row.value === ball) ?? board.balls[6]
  const visible = useMemo(() => {
    const rows = board.balls.filter((row) => matchesFilter(row, filter))
    const dir = sortDir === "asc" ? 1 : -1
    return [...rows].sort((a, b) => {
      if (sortKey === "value") return (a.value - b.value) * dir
      if (sortKey === "count") return (a.count - b.count || a.value - b.value) * dir
      return (a.delayDraws - b.delayDraws || a.value - b.value) * dir
    })
  }, [board.balls, filter, sortKey, sortDir])

  const hitSeries = useMemo(
    () => (selected ? series(draws, "hit", selected.value).points : []),
    [draws, selected]
  )
  const delaySeries = useMemo(
    () => (selected ? series(draws, "delay", selected.value).points : []),
    [draws, selected]
  )
  const appearances = useMemo(
    () =>
      [...draws]
        .filter((draw) => selected && draw.numbers.includes(selected.value))
        .sort((a, b) => b.date.localeCompare(a.date))
        .slice(0, 8),
    [draws, selected]
  )

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((current) => (current === "asc" ? "desc" : "asc"))
      return
    }
    setSortKey(key)
    setSortDir(key === "value" ? "asc" : "desc")
  }

  if (draws.length === 0 || !selected) {
    return <p className="text-sm text-muted-foreground">Aucun tirage dans la fenêtre.</p>
  }

  return (
    <div className="flex flex-col gap-4">
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Tirages" value={String(board.drawCount)} />
        <Stat label="Attendu / boule" value={formatStat(board.expected, 1)} />
        <Stat
          label={`Boule ${selected.value}`}
          value={`${selected.count}×`}
        />
        <Stat label="Retard" value={`${selected.delayDraws} tirage${selected.delayDraws > 1 ? "s" : ""}`} />
      </section>

      <Card className="min-w-0 max-w-full overflow-visible">
        <CardHeader className="gap-3">
          <CardTitle>Grille 1–50</CardTitle>
          <p className="text-sm text-muted-foreground">
            Cliquez un numéro pour le détail. Or = pair, bleu = impair. L’intensité suit le
            nombre de sorties dans la fenêtre.
          </p>
          <div className="flex flex-wrap gap-2">
            {FILTERS.map((item) => (
              <OverlayToggle
                key={item.id}
                label={item.label}
                on={filter === item.id}
                onClick={() => setFilter(item.id)}
              />
            ))}
          </div>
        </CardHeader>
        <CardContent className="min-w-0">
          <div className="euromillions-ball-grid">
            {board.balls.map((row) => {
              const muted = !matchesFilter(row, filter)
              return (
                <button
                  key={row.value}
                  type="button"
                  aria-pressed={row.value === selected.value}
                  aria-label={`Numéro ${row.value}, ${row.even ? "pair" : "impair"}, ${row.count} sortie${row.count === 1 ? "" : "s"}`}
                  onClick={() => onSelectBall(row.value)}
                  style={heatStyle(row.count, maxCount, row.even)}
                  className={cn(
                    "flex aspect-square w-full min-w-0 max-w-full items-center justify-center overflow-hidden rounded-md p-0 text-[10px] font-semibold tabular-nums sm:text-sm",
                    row.value === selected.value && "ring-2 ring-primary ring-offset-1 ring-offset-background",
                    muted && "opacity-25"
                  )}
                >
                  {row.value}
                </button>
              )
            })}
          </div>
          <div className="mt-3 flex flex-wrap gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="size-2 rounded-sm" style={{ background: "var(--chart-1)" }} />
              Pair
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-2 rounded-sm" style={{ background: "var(--chart-2)" }} />
              Impair
            </span>
            <span>moins sorti → plus sorti</span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            Boule {selected.value} · {selected.even ? "pair" : "impair"}
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <dl className="grid gap-2 text-sm sm:grid-cols-2">
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Sorties</dt>
              <dd className="tabular-nums">
                {selected.count} (attendu {formatStat(selected.expected, 1)})
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Fréquence</dt>
              <dd className="tabular-nums">
                {formatStat(selected.rate * 100, 1)} % · p0 = 10 %
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">IC Wilson</dt>
              <dd className="tabular-nums">
                [{formatStat(selected.lo)}, {formatStat(selected.hi)}]
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Dernière sortie</dt>
              <dd className="tabular-nums">
                {selected.lastSeen ? formatDrawDate(selected.lastSeen) : "jamais"}
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Retard</dt>
              <dd className="tabular-nums">
                {selected.delayDraws} tirage{selected.delayDraws > 1 ? "s" : ""}
                {selected.delayDays != null ? ` · ${selected.delayDays} j` : ""}
              </dd>
            </div>
          </dl>
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" onClick={() => onAnalyze("hit", selected.value)}>
              Analyser la présence
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => onAnalyze("delay", selected.value)}
            >
              Analyser le retard
            </Button>
          </div>
          {appearances.length > 0 ? (
            <p className="text-xs text-muted-foreground">
              Dernières sorties :{" "}
              {appearances
                .map((draw) => formatShortDate(draw.date))
                .join(" · ")}
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">Aucune sortie dans la fenêtre.</p>
          )}
          <div className="grid gap-4 lg:grid-cols-2">
            <div>
              <p className="mb-2 text-xs tracking-wide text-muted-foreground uppercase">
                Présence (0/1)
              </p>
              <ChartContainer
                config={{ value: { label: "Présence", color: "var(--chart-1)" } }}
                className="h-[160px] w-full"
              >
                <BarChart data={hitSeries}>
                  <CartesianGrid vertical={false} />
                  <XAxis dataKey="date" tickLine={false} axisLine={false} minTickGap={28} tickFormatter={formatShortDate} />
                  <YAxis domain={[0, 1]} width={24} tickLine={false} axisLine={false} allowDecimals={false} />
                  <ChartTooltip
                    content={
                      <ChartTooltipContent labelFormatter={(value) => formatDrawDate(String(value ?? ""))} />
                    }
                  />
                  <Bar dataKey="value" fill="var(--color-value)" radius={2} />
                </BarChart>
              </ChartContainer>
            </div>
            <div>
              <p className="mb-2 text-xs tracking-wide text-muted-foreground uppercase">
                Retard (tirages)
              </p>
              <ChartContainer
                config={{ value: { label: "Retard", color: "var(--chart-4)" } }}
                className="h-[160px] w-full"
              >
                <LineChart data={delaySeries}>
                  <CartesianGrid vertical={false} />
                  <XAxis dataKey="date" tickLine={false} axisLine={false} minTickGap={28} tickFormatter={formatShortDate} />
                  <YAxis width={28} tickLine={false} axisLine={false} allowDecimals={false} />
                  <ChartTooltip
                    content={
                      <ChartTooltipContent labelFormatter={(value) => formatDrawDate(String(value ?? ""))} />
                    }
                  />
                  <Line type="stepAfter" dataKey="value" stroke="var(--color-value)" dot={false} strokeWidth={2} />
                </LineChart>
              </ChartContainer>
            </div>
          </div>
          <Disclaimer>
            p0 = 5/50. Un retard élevé n’augmente pas la chance au prochain tirage : les tirages
            sont indépendants.
          </Disclaimer>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Tableau des 50 numéros</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted-foreground">
                  <th className="py-1 pr-3">
                    <button type="button" className="hover:text-foreground" onClick={() => toggleSort("value")}>
                      N°
                    </button>
                  </th>
                  <th className="py-1 pr-3">P/I</th>
                  <th className="py-1 pr-3">
                    <button type="button" className="hover:text-foreground" onClick={() => toggleSort("count")}>
                      Sorties
                    </button>
                  </th>
                  <th className="py-1 pr-3">Δ attendu</th>
                  <th className="py-1">
                    <button type="button" className="hover:text-foreground" onClick={() => toggleSort("delayDraws")}>
                      Retard
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody>
                {visible.map((row) => (
                  <tr
                    key={row.value}
                    className={cn(
                      "border-t border-border",
                      row.value === selected.value && "bg-primary/10"
                    )}
                  >
                    <td className="py-1 pr-3">
                      <button
                        type="button"
                        className="tabular-nums font-medium hover:underline"
                        onClick={() => onSelectBall(row.value)}
                      >
                        {row.value}
                      </button>
                    </td>
                    <td className="py-1 pr-3 text-muted-foreground">
                      {row.even ? "pair" : "impair"}
                    </td>
                    <td className="py-1 pr-3 tabular-nums">{row.count}</td>
                    <td className="py-1 pr-3 tabular-nums">
                      {formatStat(row.count - row.expected, 1)}
                    </td>
                    <td className="py-1 tabular-nums">{row.delayDraws}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
