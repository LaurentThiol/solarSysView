"use client"

import { Disclaimer, Stat } from "@/components/analysis/shared"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { activityConfirms, techPack } from "@/lib/ta"

type Tech = ReturnType<typeof techPack>

export function FiguresPanel({ tech }: { tech: Tech }) {
  const candles = tech.candlestickPatterns
  const charts = tech.chartPatterns

  return (
    <div className="flex flex-col gap-4">
      <section className="grid gap-3 sm:grid-cols-2">
        <Stat label="Chandeliers détectés" value={String(candles.length)} />
        <Stat label="Figures chartistes" value={String(charts.length)} />
      </section>
      <Card>
        <CardHeader>
          <CardTitle>Chandeliers japonais</CardTitle>
        </CardHeader>
        <CardContent>
          {candles.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucune figure sur les bougies unitaires.</p>
          ) : (
            <ul className="grid gap-1 sm:grid-cols-2">
              {candles.slice(-24).reverse().map((row) => (
                <li key={`${row.index}-${row.name}`} className="flex justify-between text-sm">
                  <span>{row.name}</span>
                  <span className="text-muted-foreground tabular-nums">{row.from}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Figures chartistes (heuristique ZigZag)</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {charts.length === 0 ? (
            <p className="text-sm text-muted-foreground">Pas de double sommet/creux, ETE ou rectangle net.</p>
          ) : (
            <ul className="flex flex-col gap-2 text-sm">
              {charts.map((row) => {
                const idx = tech.zigzag.find((z) => z.date === row.to)?.index ?? tech.activity.length - 1
                const ok = activityConfirms(tech.activity, idx)
                return (
                  <li key={`${row.name}-${row.from}`}>
                    <strong>{row.name}</strong> ({row.kind}) · {row.from} → {row.to}
                    {row.target != null ? ` · objectif ${row.target.toFixed(1)}` : ""}
                    {row.targetUp != null ? ` · haut ${row.targetUp.toFixed(1)} / bas ${row.targetDown?.toFixed(1)}` : ""}
                    {ok ? " · activité > SMA locale" : " · sans confirmation d’activité"}
                  </li>
                )
              })}
            </ul>
          )}
          <Disclaimer>
            Confirmation « volume &gt; SMA20 » transposée en activité (true range × count). Une cassure
            sans ça reste une fausse cassure possible — et un tirage n’a pas de volume de marché.
          </Disclaimer>
        </CardContent>
      </Card>
    </div>
  )
}
