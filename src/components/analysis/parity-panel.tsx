"use client"

import { useMemo } from "react"
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  XAxis,
  YAxis,
} from "recharts"

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  Disclaimer,
  Stat,
  formatStat,
} from "@/components/analysis/shared"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { type AnalysisDraw, ballBoard, parityReport } from "@/lib/analysis"
import { formatDrawDate, formatShortDate } from "@/lib/draws"

export function ParityPanel({
  draws,
  onAnalyze,
  onSelectBall,
}: {
  draws: AnalysisDraw[]
  onAnalyze: () => void
  onSelectBall: (n: number) => void
}) {
  const report = useMemo(() => parityReport(draws), [draws])
  const board = useMemo(() => ballBoard(draws), [draws])
  const evenRows = useMemo(
    () => board.balls.filter((row) => row.even).sort((a, b) => b.count - a.count || a.value - b.value),
    [board.balls]
  )
  const oddRows = useMemo(
    () => board.balls.filter((row) => !row.even).sort((a, b) => b.count - a.count || a.value - b.value),
    [board.balls]
  )
  const hist = useMemo(
    () =>
      report.splits.map((row) => ({
        label: row.label,
        observe: row.count,
        attendu: Number(row.expected.toFixed(2)),
      })),
    [report.splits]
  )

  if (draws.length === 0) {
    return <p className="text-sm text-muted-foreground">Aucun tirage dans la fenêtre.</p>
  }

  const evenShare = report.evenBalls + report.oddBalls
    ? (100 * report.evenBalls) / (report.evenBalls + report.oddBalls)
    : 0

  return (
    <div className="flex flex-col gap-4">
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Pairs moyens" value={formatStat(report.meanEven, 2)} />
        <Stat label="Attendu" value="2,5" />
        <Stat
          label="Boules paires"
          value={`${report.evenBalls} (${formatStat(evenShare, 1)} %)`}
        />
        <Stat label="χ² des compositions" value={formatStat(report.chiSquare)} />
      </section>

      <Card>
        <CardHeader className="gap-3">
          <CardTitle>Composition pair / impair du tirage</CardTitle>
          <p className="text-sm text-muted-foreground">
            25 pairs et 25 impairs dans l’urne. Chaque tirage de 5 boules a en moyenne 2,5
            pairs. Les barres comparent la fenêtre à cette loi hypergéométrique.
          </p>
          <Button type="button" size="sm" className="w-fit" onClick={onAnalyze}>
            Analyser la série (nombre de pairs)
          </Button>
        </CardHeader>
        <CardContent>
          <ChartContainer
            config={{
              observe: { label: "Observé", color: "var(--chart-1)" },
              attendu: { label: "Attendu", color: "var(--chart-2)" },
            }}
            className="h-[240px] w-full"
          >
            <BarChart data={hist}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="label" tickLine={false} axisLine={false} />
              <YAxis width={32} tickLine={false} axisLine={false} allowDecimals={false} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Bar dataKey="observe" fill="var(--color-observe)" radius={3} />
              <Bar dataKey="attendu" fill="var(--color-attendu)" radius={3} />
            </BarChart>
          </ChartContainer>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted-foreground">
                  <th className="py-1 pr-3">Composition</th>
                  <th className="py-1 pr-3">P théorique</th>
                  <th className="py-1 pr-3">Observé</th>
                  <th className="py-1">Attendu</th>
                </tr>
              </thead>
              <tbody>
                {report.splits.map((row) => (
                  <tr key={row.label} className="border-t border-border">
                    <td className="py-1 pr-3">{row.label}</td>
                    <td className="py-1 pr-3 tabular-nums">{formatStat(row.p * 100, 1)} %</td>
                    <td className="py-1 pr-3 tabular-nums">{row.count}</td>
                    <td className="py-1 tabular-nums">{formatStat(row.expected, 1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Série pair / impair dans le temps</CardTitle>
        </CardHeader>
        <CardContent>
          <ChartContainer
            config={{
              even: { label: "Pairs", color: "var(--chart-1)" },
              odd: { label: "Impairs", color: "var(--chart-2)" },
            }}
            className="h-[220px] w-full"
          >
            <LineChart data={report.points}>
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="date"
                tickLine={false}
                axisLine={false}
                minTickGap={28}
                tickFormatter={formatShortDate}
              />
              <YAxis domain={[0, 5]} width={28} tickLine={false} axisLine={false} allowDecimals={false} />
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    labelFormatter={(value) => formatDrawDate(String(value ?? ""))}
                  />
                }
              />
              <Line type="monotone" dataKey="even" stroke="var(--color-even)" dot={false} strokeWidth={2} />
              <Line type="monotone" dataKey="odd" stroke="var(--color-odd)" dot={false} strokeWidth={2} />
            </LineChart>
          </ChartContainer>
          <Disclaimer>
            Attendu sous uniforme : 50 % des boules tirées sont paires (2,5 / 5). Total observé :{" "}
            {report.evenBalls} pairs / {report.oddBalls} impairs (attendu {formatStat(report.expectedEvenBalls, 1)}{" "}
            de chaque).
          </Disclaimer>
        </CardContent>
      </Card>

      <section className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Numéros pairs (plus sortis)</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col gap-1">
              {evenRows.slice(0, 10).map((row) => (
                <li key={row.value} className="flex justify-between text-sm">
                  <button
                    type="button"
                    className="tabular-nums font-medium hover:underline"
                    onClick={() => onSelectBall(row.value)}
                  >
                    {row.value}
                  </button>
                  <span className="text-muted-foreground tabular-nums">
                    {row.count}× · retard {row.delayDraws}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Numéros impairs (plus sortis)</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col gap-1">
              {oddRows.slice(0, 10).map((row) => (
                <li key={row.value} className="flex justify-between text-sm">
                  <button
                    type="button"
                    className="tabular-nums font-medium hover:underline"
                    onClick={() => onSelectBall(row.value)}
                  >
                    {row.value}
                  </button>
                  <span className="text-muted-foreground tabular-nums">
                    {row.count}× · retard {row.delayDraws}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </section>
    </div>
  )
}
