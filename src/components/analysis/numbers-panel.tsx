"use client"

import { useMemo, useState } from "react"
import { Bar, BarChart, CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts"

import { FrequencyTable } from "@/components/frequency-table"
import { TitleHelp, WithHelp } from "@/components/help"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  Disclaimer,
  OverlayToggle,
  HELP,
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

type Filter = "all" | "even" | "odd"

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

  const board = useMemo(() => ballBoard(draws), [draws])
  const selected = board.balls.find((row) => row.value === ball) ?? board.balls[6]
  const visible = useMemo(
    () => board.balls.filter((row) => matchesFilter(row, filter)),
    [board.balls, filter]
  )

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
          <CardTitle>
            <TitleHelp
              help={{
                title: "Grille 1–50",
                body: "Tableau triable par Numéro, P/I, Sorties, Δ, Retard et Attendu. Cliquez un numéro pour le détail (sorties, retard, IC). La barre compare les sorties à l’attendu : le trait est la loi, le rouge dépasse 2×. Or = pair, bleu = impair. Les filtres Pairs / Impairs retirent l’autre camp du tableau.",
              }}
            >
              Grille 1–50
            </TitleHelp>
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Cliquez un en-tête pour trier, un numéro pour le détail. Le trait de la barre est l’attendu.
          </p>
          <div className="flex flex-wrap gap-2">
            {FILTERS.map((item) => (
              <OverlayToggle
                key={item.id}
                label={item.label}
                on={filter === item.id}
                onClick={() => setFilter(item.id)}
                help={
                  item.id === "all"
                    ? HELP.filterAll
                    : item.id === "even"
                      ? HELP.filterEven
                      : HELP.filterOdd
                }
              />
            ))}
          </div>
        </CardHeader>
        <CardContent className="min-w-0">
          <FrequencyTable
            items={visible}
            expected={board.expected}
            caption="Tableau des numéros 1 à 50"
            selected={new Set([selected.value])}
            onPick={onSelectBall}
            ariaLabel={(row) =>
              `Numéro ${row.value}, ${row.value % 2 === 0 ? "pair" : "impair"}, ${row.count} sortie${row.count === 1 ? "" : "s"}, retard ${row.delayDraws}`
            }
          />
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
            <WithHelp
              help={{
                title: "Analyser la présence",
                body: "Passe la variable sur « Présence d’une boule » pour ce numéro et ouvre l’onglet Vue (série 0/1 + indicateurs).",
              }}
            >
              <Button type="button" size="sm" onClick={() => onAnalyze("hit", selected.value)}>
                Analyser la présence
              </Button>
            </WithHelp>
            <WithHelp
              help={{
                title: "Analyser le retard",
                body: "Passe la variable sur « Retard d’une boule » pour ce numéro et ouvre Vue : la courbe compte les tirages depuis la dernière sortie.",
              }}
            >
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => onAnalyze("delay", selected.value)}
              >
                Analyser le retard
              </Button>
            </WithHelp>
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

    </div>
  )
}
