"use client"

import Link from "next/link"
import { Bar, BarChart, CartesianGrid, Scatter, ScatterChart, XAxis, YAxis } from "recharts"

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  formatStat,
} from "@/components/analysis/shared"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  bayesBalls,
  chiSquareUniform,
  hotBacktest,
  pairLift,
  rankProbabilities,
} from "@/lib/analysis"
import { type Draw, formatDrawDate } from "@/lib/draws"

export function ProbaPanel() {
  const ranks = rankProbabilities(12)
  return (
    <Card>
      <CardHeader>
        <CardTitle>Probabilités exactes (5/50 + 2/12)</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <p className="text-sm text-muted-foreground">
          139 838 160 grilles possibles. Hypergéométrique, indépendant de la fenêtre temporelle.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-muted-foreground">
                <th className="py-1 pr-3">Rang</th>
                <th className="py-1 pr-3">Gain</th>
                <th className="py-1 pr-3">P</th>
                <th className="py-1">1 sur</th>
              </tr>
            </thead>
            <tbody>
              {ranks.map((row) => (
                <tr key={row.label} className="border-t border-border">
                  <td className="py-1 pr-3 tabular-nums">{row.rank ?? "—"}</td>
                  <td className="py-1 pr-3">{row.label}</td>
                  <td className="py-1 pr-3 tabular-nums">{row.p.toExponential(3)}</td>
                  <td className="py-1 tabular-nums">{row.oneIn?.toLocaleString("fr-FR")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  )
}

export function InferencePanel({
  draws,
  mc,
  mcError,
  onMc,
}: {
  draws: Draw[]
  mc: {
    max_frequency?: { observed: number; p_ge_observed: number; mean: number }
    max_delay_draws?: { observed: number; p_ge_observed: number; mean: number }
    n_sim?: number
  } | null
  mcError: string | null
  onMc: () => void
}) {
  const chi = chiSquareUniform(draws)
  const bayes = bayesBalls(draws)
  const forest = bayes.slice().sort((a, b) => b.count - a.count)
  const n = draws.length
  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>χ² d’adéquation (fréquences 1–50)</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Statistique {formatStat(chi.stat)} pour {n} tirages de la fenêtre (espérance{" "}
          {formatStat(chi.expected)} par boule). Modèle approximatif : p = 5/50.
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>IC Wilson vs p0 = 0,1</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="grid gap-1 sm:grid-cols-2">
            {forest.slice(0, 20).map((row) => (
              <li key={row.value} className="flex items-center justify-between text-xs">
                <span className="tabular-nums">{row.value}</span>
                <span className="text-muted-foreground tabular-nums">
                  {row.count}× · [{formatStat(row.lo)}, {formatStat(row.hi)}]
                  {row.lo <= 0.1 && 0.1 <= row.hi ? "" : " · hors p0"}
                </span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Monte-Carlo des records (fenêtre)</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 text-sm">
          <button
            type="button"
            onClick={onMc}
            className="w-fit rounded-md border border-border px-3 py-1 text-xs"
          >
            Lancer 400 historiques synthétiques (API Python)
          </button>
          {mcError ? <p className="text-muted-foreground">{mcError}</p> : null}
          {mc?.max_frequency ? (
            <p>
              Fréquence max observée {mc.max_frequency.observed} (moy. H0 {formatStat(mc.max_frequency.mean)})
              · P(≥ obs) = {formatStat(mc.max_frequency.p_ge_observed)}
              {mc.max_delay_draws
                ? ` · retard max ${mc.max_delay_draws.observed} tirages, P(≥ obs) = ${formatStat(mc.max_delay_draws.p_ge_observed)}`
                : ""}
            </p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  )
}

export function BayesPanel({ draws }: { draws: Draw[] }) {
  const balls = bayesBalls(draws)
  const n = draws.length
  const data = balls.map((b) => ({ value: b.value, predictive: b.predictive }))
  return (
    <Card>
      <CardHeader>
        <CardTitle>Beta-Binomial · prédictive P(boule au prochain tirage)</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="mb-3 text-sm text-muted-foreground">
          Prior uniforme, {n} tirages de la fenêtre. Les barres se resserrent vers 0,1.
        </p>
        <ChartContainer
          config={{ predictive: { label: "Prédictive", color: "var(--chart-4)" } }}
          className="h-[240px] w-full"
        >
          <BarChart data={data}>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="value" tickLine={false} axisLine={false} interval={4} />
            <YAxis domain={[0, 0.2]} width={36} tickLine={false} axisLine={false} />
            <ChartTooltip content={<ChartTooltipContent />} />
            <Bar dataKey="predictive" fill="var(--color-predictive)" radius={2} />
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}

export function DependencePanel({ draws, windowSize }: { draws: Draw[]; windowSize: number }) {
  const pairs = pairLift(draws)
  const backtest = hotBacktest(draws, windowSize)
  const scatter = draws.map((d) => ({
    sum: d.numbers.reduce((a, b) => a + b, 0),
    spread: Math.max(...d.numbers) - Math.min(...d.numbers),
    date: d.date,
  }))
  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Paires à plus fort lift (fenêtre)</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="grid gap-1 sm:grid-cols-2">
            {pairs.map((row) => (
              <li key={`${row.a}-${row.b}`} className="flex justify-between text-sm">
                <span className="tabular-nums">
                  {row.a} · {row.b}
                </span>
                <span className="text-muted-foreground tabular-nums">
                  {row.count}× · lift {formatStat(row.lift)}
                </span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Backtest « 5 plus chauds » vs hasard</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Sur {backtest.n} tirages de la fenêtre, {formatStat(backtest.mean)} numéro(s) en commun en
          moyenne (attendu sous uniforme : {formatStat(backtest.expected)}).
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Nuage somme × étendue</CardTitle>
        </CardHeader>
        <CardContent>
          <ChartContainer
            config={{ spread: { label: "Étendue", color: "var(--chart-2)" } }}
            className="h-[240px] w-full"
          >
            <ScatterChart>
              <CartesianGrid />
              <XAxis dataKey="sum" name="somme" tickLine={false} />
              <YAxis dataKey="spread" name="étendue" tickLine={false} width={36} />
              <ChartTooltip
                content={({ payload }) => {
                  const row = payload?.[0]?.payload as { date?: string; sum?: number } | undefined
                  if (!row?.date) return null
                  return (
                    <div className="rounded-md border border-border bg-card px-2 py-1 text-xs">
                      <Link href="/tirage" className="underline">
                        {formatDrawDate(row.date)}
                      </Link>
                      <div>somme {row.sum}</div>
                    </div>
                  )
                }}
              />
              <Scatter data={scatter} fill="var(--chart-2)" />
            </ScatterChart>
          </ChartContainer>
        </CardContent>
      </Card>
    </div>
  )
}
