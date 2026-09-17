"use client"

import { useMemo, useState } from "react"
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts"

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  Disclaimer,
  Stat,
  formatStat,
  lineConfig,
} from "@/components/analysis/shared"
import { LabelHelp } from "@/components/help"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { kellyFraction, positionSize, techPack } from "@/lib/ta"

type Tech = ReturnType<typeof techPack>

export function SystemPanel({ tech }: { tech: Tech }) {
  const [capital, setCapital] = useState(20000)
  const [risk, setRisk] = useState(0.01)
  const [entry, setEntry] = useState(100)
  const [stop, setStop] = useState(96)
  const grids = positionSize(capital, risk, entry, stop)
  const met = tech.system.metrics
  const kelly = kellyFraction(met.hit ?? 0.4, 2, 0.5)
  const equity = tech.system.backtest.equity
  const data = useMemo(
    () => equity.map((value, i) => ({ i, equity: value })),
    [equity]
  )

  return (
    <div className="flex flex-col gap-4">
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="CAGR" value={formatStat(met.cagr != null ? met.cagr * 100 : null)} />
        <Stat label="Sharpe" value={formatStat(met.sharpe)} />
        <Stat label="Max DD" value={formatStat(met.maxDd != null ? met.maxDd * 100 : null)} />
        <Stat label="Hit" value={formatStat(met.hit != null ? met.hit * 100 : null)} />
      </section>
      <Card>
        <CardHeader>
          <CardTitle>Backtest Donchian + ADX &gt; 25 (fenêtre)</CardTitle>
        </CardHeader>
        <CardContent>
          {data.length < 2 ? (
            <p className="text-sm text-muted-foreground">Fenêtre trop courte.</p>
          ) : (
            <ChartContainer config={lineConfig} className="aspect-auto h-[180px] w-full">
              <LineChart data={data} margin={{ left: 4, right: 8, top: 8 }}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="i" tickLine={false} axisLine={false} />
                <YAxis width={40} tickLine={false} axisLine={false} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Line type="monotone" dataKey="equity" stroke="var(--color-equity)" dot={false} />
              </LineChart>
            </ChartContainer>
          )}
          <div className="mt-3 grid gap-1 text-sm sm:grid-cols-2">
            <p>Sortino {formatStat(met.sortino)}</p>
            <p>Calmar {formatStat(met.calmar)}</p>
            <p>Profit factor {formatStat(met.profitFactor)}</p>
            <p>Expectancy {formatStat(met.expectancy)}</p>
          </div>
          <Disclaimer>
            Frais 0,1 % au retournement. 104 « séances » / an. Ce n’est pas un edge jouable sur des
            tirages indépendants — c’est le squelette du guide (section 18).
          </Disclaimer>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Walk-forward (fenêtres successives)</CardTitle>
        </CardHeader>
        <CardContent>
          {tech.system.walkForward.length === 0 ? (
            <p className="text-sm text-muted-foreground">Pas assez de tirages pour découper.</p>
          ) : (
            <ul className="flex flex-col gap-1 text-sm">
              {tech.system.walkForward.map((row) => (
                <li key={`${row.from}-${row.to}`} className="flex justify-between gap-2">
                  <span>
                    {row.from} → {row.to} ({row.n})
                  </span>
                  <span className="tabular-nums text-muted-foreground">
                    Sharpe {formatStat(row.metrics.sharpe)} · hit{" "}
                    {formatStat(row.metrics.hit != null ? row.metrics.hit * 100 : null)} %
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Bankroll → nombre de grilles</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-3">
            <LabelHelp
              label="Capital €"
              help={{
                title: "Capital",
                body: "Bankroll analogique en euros. Sert à calculer un nombre de grilles : (capital × risque) / |entrée − stop|.",
              }}
            >
              <Input
                type="number"
                value={capital}
                onChange={(e) => setCapital(Number(e.target.value) || 0)}
                className="w-full min-w-0 sm:w-28"
              />
            </LabelHelp>
            <LabelHelp
              label="Risque"
              help={{
                title: "Risque",
                body: "Fraction du capital risquée par « trade » (0,01 = 1 %). Usuel : 1–2 %. Ici transposé en nombre de grilles, pas un lot d’actions.",
              }}
            >
              <Input
                type="number"
                step="0.005"
                value={risk}
                onChange={(e) => setRisk(Number(e.target.value) || 0)}
                className="w-full min-w-0 sm:w-24"
              />
            </LabelHelp>
            <LabelHelp
              label="Entrée (analogie)"
              help={{
                title: "Entrée",
                body: "Prix d’entrée analogique. L’écart avec le stop donne la « taille du risque » unitaire pour convertir le capital en grilles.",
              }}
            >
              <Input
                type="number"
                value={entry}
                onChange={(e) => setEntry(Number(e.target.value) || 0)}
                className="w-full min-w-0 sm:w-24"
              />
            </LabelHelp>
            <LabelHelp
              label="Stop"
              help={{
                title: "Stop",
                body: "Niveau de stop analogique. |entrée − stop| est le dénominateur du sizing. Ce n’est pas un conseil de jeu.",
              }}
            >
              <Input
                type="number"
                value={stop}
                onChange={(e) => setStop(Number(e.target.value) || 0)}
                className="w-full min-w-0 sm:w-24"
              />
            </LabelHelp>
          </div>
          <p className="text-sm">
            Grilles = (capital × risque) / |entrée − stop| → <strong>{grids}</strong>
            {" · "}
            ½ Kelly (hit observé, R=2) → {formatStat(kelly * 100)} % du capital.
          </p>
          <Disclaimer>
            Transposition money management du guide : 1–2 % de risque, R:R ≥ 1:2, Kelly fractionnaire.
            Ici « quantité » = nombre de grilles, pas un lot d’actions.
          </Disclaimer>
        </CardContent>
      </Card>
    </div>
  )
}
